import uuid
import logging
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.db.models import (
    StudyRequest,
    StudyStatus,
    StudyTargetType,
    SurveyTask,
    SurveyTaskStatus,
    Property,
    AreaReport,
    GridCell,
    User,
    UserRole,
)

logger = logging.getLogger(__name__)


def propose_study_tasks(db: Session, study: StudyRequest) -> List[SurveyTask]:
    """
    Splits a Catchment Study request into non-overlapping survey tasks corresponding
    to the 500m grid cells covering the property's catchment (or area report cells).
    Each task calculates a workload_weight based on building density.
    """
    # If tasks are already created, return existing tasks
    existing_tasks = db.query(SurveyTask).filter(SurveyTask.request_id == study.id).order_by(SurveyTask.cell_id).all()
    if existing_tasks:
        return existing_tasks

    cell_rows = []

    if study.property_id:
        prop = db.query(Property).filter(Property.id == study.property_id).first()
        if not prop or prop.location is None:
            raise ValueError(f"Property {study.property_id} has no valid location.")

        radius = study.radius_m or 1000.0

        # Find all grid cells within radius_m of the property point
        query = text("""
            SELECT gc.id, gc.geom, COUNT(p.id) as building_count
            FROM grid_cells gc
            CROSS JOIN properties prop
            LEFT JOIN pois p ON p.category = 'residential_building' AND ST_Intersects(gc.geom, p.geom)
            WHERE prop.id = :prop_id
              AND ST_DWithin(gc.geom::geography, prop.location::geography, :radius)
            GROUP BY gc.id, gc.geom
            ORDER BY gc.id;
        """)

        cell_rows = db.execute(query, {
            "prop_id": study.property_id,
            "radius": radius,
        }).fetchall()

        # Fallback if no cell intersected the radius (e.g. on outer boundary)
        if not cell_rows:
            fallback_query = text("""
                SELECT gc.id, gc.geom, COUNT(p.id) as building_count
                FROM grid_cells gc
                CROSS JOIN properties prop
                LEFT JOIN pois p ON p.category = 'residential_building' AND ST_Intersects(gc.geom, p.geom)
                WHERE prop.id = :prop_id
                  AND ST_Intersects(gc.geom, prop.location)
                GROUP BY gc.id, gc.geom
                LIMIT 1;
            """)
            cell_rows = db.execute(fallback_query, {"prop_id": study.property_id}).fetchall()

    elif study.report_id:
        report = db.query(AreaReport).filter(AreaReport.id == study.report_id).first()
        if not report:
            raise ValueError(f"Area report {study.report_id} not found.")

        if report.cell_ids and len(report.cell_ids) > 0:
            query = text("""
                SELECT gc.id, gc.geom, COUNT(p.id) as building_count
                FROM grid_cells gc
                LEFT JOIN pois p ON p.category = 'residential_building' AND ST_Intersects(gc.geom, p.geom)
                WHERE gc.id = ANY(:cell_ids)
                GROUP BY gc.id, gc.geom
                ORDER BY gc.id;
            """)
            cell_rows = db.execute(query, {"cell_ids": report.cell_ids}).fetchall()
        elif report.geom is not None:
            query = text("""
                SELECT gc.id, gc.geom, COUNT(p.id) as building_count
                FROM grid_cells gc
                CROSS JOIN area_reports ar
                LEFT JOIN pois p ON p.category = 'residential_building' AND ST_Intersects(gc.geom, p.geom)
                WHERE ar.id = :report_id
                  AND ST_Intersects(gc.geom, ar.geom)
                GROUP BY gc.id, gc.geom
                ORDER BY gc.id;
            """)
            cell_rows = db.execute(query, {"report_id": study.report_id}).fetchall()


    if not cell_rows:
        raise ValueError("Could not find any grid cells for this study target.")

    new_tasks: List[SurveyTask] = []
    for row in cell_rows:
        cell_id = row[0]
        cell_geom = row[1]
        bld_count = row[2] or 0
        # Workload weight: base 1.0 + building density factor (each 10 buildings adds ~1.0 weight)
        weight = round(1.0 + (bld_count * 0.1), 2)

        task = SurveyTask(
            id=f"stask_{uuid.uuid4().hex[:10]}",
            request_id=study.id,
            cell_id=cell_id,
            geom=cell_geom,
            assigned_to=None,
            status=SurveyTaskStatus.PENDING,
            workload_weight=weight,
        )
        db.add(task)
        new_tasks.append(task)

    db.commit()

    # Aggregate task geometries into study_requests.geom for future spatial reuse queries
    db.execute(text("""
        UPDATE study_requests
        SET geom = (
            SELECT ST_UnaryUnion(ST_Collect(geom))
            FROM survey_tasks
            WHERE request_id = :study_id
        ),
        status = 'PLANNED'
        WHERE id = :study_id;
    """), {"study_id": study.id})

    db.commit()

    db.refresh(study)
    return new_tasks


def auto_assign_tasks(db: Session, study: StudyRequest) -> List[SurveyTask]:
    """
    Distributes tasks to active survey executives balanced by workload_weight
    using greedy Longest-Processing-Time first bin packing.
    """
    tasks = db.query(SurveyTask).filter(SurveyTask.request_id == study.id).all()
    if not tasks:
        # If not planned yet, propose first
        tasks = propose_study_tasks(db, study)

    executives = (
        db.query(User)
        .filter(User.role == UserRole.SURVEY_EXECUTIVE)
        .order_by(User.id)
        .all()
    )

    if not executives:
        # Fallback to survey managers or any users if executives aren't seeded
        executives = db.query(User).filter(User.role.in_([UserRole.SURVEY_EXECUTIVE, UserRole.SURVEY_MANAGER])).order_by(User.id).all()

    if not executives:
        logger.warning("No survey executives found for auto-assign.")
        return tasks

    # Greedy bin packing: sort tasks by workload_weight descending
    sorted_tasks = sorted(tasks, key=lambda t: t.workload_weight, reverse=True)
    loads = {exec_user.id: 0.0 for exec_user in executives}

    for task in sorted_tasks:
        min_exec_id = min(loads.keys(), key=lambda eid: loads[eid])
        task.assigned_to = min_exec_id
        loads[min_exec_id] += task.workload_weight

    if study.status in (StudyStatus.REQUESTED, StudyStatus.PLANNED):
        study.status = StudyStatus.IN_PROGRESS

    db.commit()

    for task in tasks:
        db.refresh(task)

    logger.info(f"Auto-assigned {len(tasks)} tasks for study {study.id}. Load distribution: {loads}")
    return tasks
