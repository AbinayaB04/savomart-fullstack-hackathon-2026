import uuid
import logging
from typing import Optional, List
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models import (
    User,
    UserRole,
    StudyRequest,
    StudyStatus,
    StudyTargetType,
    SurveyTask,
    SurveyTaskStatus,
    Property,
    AreaReport,
)
from app.api.deps import get_current_user, require_role
from app.studies.reuse import check_study_reuse
from app.studies.split import propose_study_tasks, auto_assign_tasks
from app.studies.rollup import compute_study_rollup, trigger_property_reevaluation

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/studies")


class CreateStudyRequestSchema(BaseModel):
    target_type: StudyTargetType = Field(StudyTargetType.PROPERTY, description="Target type: property or area")
    property_id: Optional[str] = Field(None, description="Target Property ID")
    report_id: Optional[str] = Field(None, description="Target Area Report ID")
    radius_m: float = Field(1000.0, ge=100.0, le=5000.0, description="Survey catchment radius in meters")


@router.post("", status_code=status.HTTP_201_CREATED)
def create_catchment_study(
    payload: CreateStudyRequestSchema,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.BD_MANAGER, UserRole.SURVEY_MANAGER)),
):
    """
    BD Manager requests a Catchment Study for a property or area report.
    First checks the 6-Month Spatial Reuse Rule:
    If a completed study covers the location within 300m and is <= 180 days old,
    reuses that study immediately and copies insights without generating new tasks.
    """
    if payload.target_type == StudyTargetType.PROPERTY:
        if not payload.property_id:
            raise HTTPException(status_code=400, detail="property_id is required for property catchment study.")
        prop = db.query(Property).filter(Property.id == payload.property_id).first()
        if not prop:
            raise HTTPException(status_code=404, detail=f"Property {payload.property_id} not found.")

    elif payload.target_type == StudyTargetType.AREA:
        if not payload.report_id:
            raise HTTPException(status_code=400, detail="report_id is required for area catchment study.")
        report = db.query(AreaReport).filter(AreaReport.id == payload.report_id).first()
        if not report:
            raise HTTPException(status_code=404, detail=f"Area Report {payload.report_id} not found.")

    # Check 6-month spatial reuse rule
    reuse_match = check_study_reuse(
        db,
        property_id=payload.property_id,
        report_id=payload.report_id,
        radius_m=payload.radius_m,
    )

    study_id = f"study_{uuid.uuid4().hex[:10]}"

    if reuse_match:
        matched_study, reason = reuse_match
        new_study = StudyRequest(
            id=study_id,
            target_type=payload.target_type,
            property_id=payload.property_id,
            report_id=payload.report_id,
            requested_by=current_user.id,
            radius_m=payload.radius_m,
            status=StudyStatus.COMPLETED,
            reused_from_request_id=matched_study.id,
            reuse_reason=reason,
            insights=matched_study.insights,
            geom=matched_study.geom,
            completed_at=datetime.now(timezone.utc),
        )
        db.add(new_study)
        db.commit()
        db.refresh(new_study)

        # Trigger property re-evaluation so evaluation reflects survey ground truth
        if payload.property_id:
            trigger_property_reevaluation(payload.property_id)

        res = new_study.to_dict(include_tasks=False)
        res["reused"] = True
        res["reuse_message"] = reason
        return res

    # Create new fresh study request
    new_study = StudyRequest(
        id=study_id,
        target_type=payload.target_type,
        property_id=payload.property_id,
        report_id=payload.report_id,
        requested_by=current_user.id,
        radius_m=payload.radius_m,
        status=StudyStatus.REQUESTED,
        reused_from_request_id=None,
        reuse_reason=None,
        insights={},
        geom=None,
    )
    db.add(new_study)
    db.commit()
    db.refresh(new_study)

    res = new_study.to_dict(include_tasks=False)
    res["reused"] = False
    res["reuse_message"] = None
    return res


@router.get("")
def list_studies(
    status_filter: Optional[StudyStatus] = Query(None, alias="status"),
    target_type: Optional[StudyTargetType] = Query(None, alias="target_type"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Survey Manager inbox: Lists catchment study requests, filterable by status and target_type.
    """
    query = db.query(StudyRequest)

    if status_filter:
        query = query.filter(StudyRequest.status == status_filter)
    if target_type:
        query = query.filter(StudyRequest.target_type == target_type)

    studies = query.order_by(StudyRequest.created_at.desc()).all()
    return [s.to_dict(include_tasks=False) for s in studies]


@router.get("/{study_id}")
def get_study_details(
    study_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Retrieve single study with full task breakdown and rolled-up insights.
    """
    study = db.query(StudyRequest).filter(StudyRequest.id == study_id).first()
    if not study:
        raise HTTPException(status_code=404, detail=f"Study {study_id} not found.")

    return study.to_dict(include_tasks=True)


@router.post("/{study_id}/plan")
def plan_study_tasks(
    study_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.SURVEY_MANAGER, UserRole.BD_MANAGER)),
):
    """
    Survey Manager splits the catchment study into non-overlapping 500m grid cell tasks.
    """
    study = db.query(StudyRequest).filter(StudyRequest.id == study_id).first()
    if not study:
        raise HTTPException(status_code=404, detail=f"Study {study_id} not found.")

    if study.status == StudyStatus.COMPLETED and study.reused_from_request_id:
        return {
            "message": "Study was satisfied via 6-month spatial reuse. No new tasks needed.",
            "study": study.to_dict(include_tasks=True),
        }

    try:
        tasks = propose_study_tasks(db, study)
        db.refresh(study)
        return {
            "message": f"Successfully proposed {len(tasks)} survey tasks.",
            "task_count": len(tasks),
            "study": study.to_dict(include_tasks=True),
        }
    except Exception as e:
        logger.error(f"Error planning tasks for study {study_id}: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{study_id}/auto-assign")
def auto_assign_study_tasks(
    study_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.SURVEY_MANAGER, UserRole.BD_MANAGER)),
):
    """
    Survey Manager automatically balances and distributes tasks among Survey Executives
    according to workload_weight.
    """
    study = db.query(StudyRequest).filter(StudyRequest.id == study_id).first()
    if not study:
        raise HTTPException(status_code=404, detail=f"Study {study_id} not found.")

    try:
        tasks = auto_assign_tasks(db, study)
        db.refresh(study)
        return {
            "message": f"Auto-assigned {len(tasks)} tasks to survey executives.",
            "study": study.to_dict(include_tasks=True),
        }
    except Exception as e:
        logger.error(f"Error auto-assigning tasks for study {study_id}: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{study_id}/progress")
def get_study_progress(
    study_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns progress statistics for a study.
    """
    study = db.query(StudyRequest).filter(StudyRequest.id == study_id).first()
    if not study:
        raise HTTPException(status_code=404, detail=f"Study {study_id} not found.")

    total_tasks = len(study.tasks)
    submitted_tasks = sum(1 for t in study.tasks if t.status == SurveyTaskStatus.SUBMITTED)
    progress_pct = round((submitted_tasks / total_tasks * 100), 1) if total_tasks > 0 else (100.0 if study.status == StudyStatus.COMPLETED else 0.0)

    return {
        "study_id": study.id,
        "status": study.status.value if isinstance(study.status, StudyStatus) else study.status,
        "total_tasks": total_tasks,
        "submitted_tasks": submitted_tasks,
        "progress_percent": progress_pct,
        "is_completed": study.status == StudyStatus.COMPLETED,
        "reused": study.reused_from_request_id is not None,
        "reuse_reason": study.reuse_reason,
    }


@router.post("/{study_id}/rollup")
def trigger_study_rollup_manually(
    study_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.SURVEY_MANAGER, UserRole.BD_MANAGER)),
):
    """
    Manually force roll up of study insights.
    """
    try:
        insights = compute_study_rollup(db, study_id)
        study = db.query(StudyRequest).filter(StudyRequest.id == study_id).first()
        return {
            "message": "Rollup computed successfully.",
            "insights": insights,
            "study": study.to_dict(include_tasks=True),
        }
    except Exception as e:
        logger.error(f"Error rolling up study {study_id}: {e}")
        raise HTTPException(status_code=400, detail=str(e))
