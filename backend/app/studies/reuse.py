import logging
from typing import Optional, Tuple
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.db.models import StudyRequest, StudyStatus, Property, AreaReport

logger = logging.getLogger(__name__)


def check_study_reuse(
    db: Session,
    property_id: Optional[str] = None,
    report_id: Optional[str] = None,
    radius_m: float = 1000.0,
) -> Optional[Tuple[StudyRequest, str]]:
    """
    Catchment Study Reuse Rule (Decision #15):
    When a study is requested for a property:
    Look for a COMPLETED study whose covered geometry ST_Contains the property point
    (or is within 300 m of it) AND completed_at is within the last 6 months (180 days).
    Also supports spatial reuse across nearby surveyed properties within 300m.

    Returns:
        (matched_study_request, reason_str) if reusable study found, else None.
    """
    cutoff_date = datetime.now(timezone.utc) - timedelta(days=180)

    if property_id:
        prop = db.query(Property).filter(Property.id == property_id).first()
        if not prop or prop.location is None:
            return None

        # Query completed studies whose geometry contains the property point
        # or is within 300m of it, or whose original surveyed property is within 300m.
        query_sql = text("""
            SELECT sr.id
            FROM study_requests sr
            CROSS JOIN properties p_curr
            LEFT JOIN properties p_prev ON p_prev.id = sr.property_id
            WHERE p_curr.id = :prop_id
              AND sr.status = 'COMPLETED'
              AND sr.completed_at IS NOT NULL
              AND sr.completed_at >= :cutoff_date
              AND (
                -- 1. Study covered geometry ST_Contains the property point or is within 300m
                (sr.geom IS NOT NULL AND (
                    ST_Contains(sr.geom, p_curr.location)
                    OR ST_DWithin(sr.geom::geography, p_curr.location::geography, 300.0)
                ))
                -- 2. Or completed study's own property location is within 300m
                OR (p_prev.location IS NOT NULL AND ST_DWithin(p_prev.location::geography, p_curr.location::geography, 300.0))
              )
            ORDER BY sr.completed_at DESC
            LIMIT 1;
        """)

        row = db.execute(query_sql, {
            "prop_id": property_id,
            "cutoff_date": cutoff_date,
        }).fetchone()

        if row:
            matched_study = db.query(StudyRequest).filter(StudyRequest.id == row[0]).first()
            if matched_study and matched_study.completed_at:
                days_old = max(0, (datetime.now(timezone.utc) - matched_study.completed_at).days)
                reason = f"Reused study #{matched_study.id}, covers this location, {days_old} days old"
                logger.info(f"Property {property_id} reused study {matched_study.id}: {reason}")
                return matched_study, reason

    elif report_id:
        report = db.query(AreaReport).filter(AreaReport.id == report_id).first()
        if not report or report.geom is None:
            return None

        query_sql = text("""
            SELECT sr.id
            FROM study_requests sr
            CROSS JOIN area_reports ar
            WHERE ar.id = :report_id
              AND sr.status = 'COMPLETED'
              AND sr.completed_at IS NOT NULL
              AND sr.completed_at >= :cutoff_date
              AND sr.geom IS NOT NULL
              AND ar.geom IS NOT NULL
              AND (
                ST_Contains(sr.geom, ar.geom)
                OR ST_Intersects(sr.geom, ar.geom)
                OR ST_DWithin(sr.geom::geography, ar.geom::geography, 300.0)
              )
            ORDER BY sr.completed_at DESC
            LIMIT 1;
        """)


        row = db.execute(query_sql, {
            "report_id": report_id,
            "cutoff_date": cutoff_date,
        }).fetchone()


        if row:
            matched_study = db.query(StudyRequest).filter(StudyRequest.id == row[0]).first()
            if matched_study and matched_study.completed_at:
                days_old = max(0, (datetime.now(timezone.utc) - matched_study.completed_at).days)
                reason = f"Reused study #{matched_study.id}, covers report area, {days_old} days old"
                logger.info(f"Report {report_id} reused study {matched_study.id}: {reason}")
                return matched_study, reason

    return None
