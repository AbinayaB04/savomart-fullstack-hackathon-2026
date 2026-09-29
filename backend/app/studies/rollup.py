import logging
from typing import Dict, Any, Optional
from datetime import datetime, timezone
from collections import Counter
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.db.models import (
    StudyRequest,
    StudyStatus,
    SurveyTask,
    SurveyTaskStatus,
    SurveyResponse,
    Property,
)

logger = logging.getLogger(__name__)


def compute_study_rollup(db: Session, study_id: str) -> Dict[str, Any]:
    """
    Computes rolled-up study insights across all submitted survey tasks.
    Aggregates:
      - 10-minute footfall and peak-hour estimates (avg & total)
      - Shop mix breakdown and totals
      - Competitor stores identified
      - Dominant household demographic type
      - Lane suitability (width, lighting, parking)
    Marks the study as COMPLETED and triggers property re-evaluation.
    """
    study = db.query(StudyRequest).filter(StudyRequest.id == study_id).first()
    if not study:
        raise ValueError(f"StudyRequest {study_id} not found.")

    tasks = db.query(SurveyTask).filter(SurveyTask.request_id == study_id).all()
    if not tasks:
        raise ValueError(f"No survey tasks found for study {study_id}.")

    # Gather latest response for each task
    responses = []
    for task in tasks:
        if task.responses and len(task.responses) > 0:
            responses.append(task.responses[0])
        else:
            latest_resp = (
                db.query(SurveyResponse)
                .filter(SurveyResponse.task_id == task.id)
                .order_by(SurveyResponse.submitted_at.desc())
                .first()
            )
            if latest_resp:
                responses.append(latest_resp)


    task_count = len(tasks)
    resp_count = len(responses)

    if resp_count == 0:
        logger.warning(f"No responses recorded for study {study_id} to roll up.")
        return study.insights or {}

    # 1. Footfall Metrics
    footfall_10m_list = [r.data.get("footfall_count_10min", 0) for r in responses if isinstance(r.data.get("footfall_count_10min"), (int, float))]
    peak_hour_list = [r.data.get("peak_hour_estimate", 0) for r in responses if isinstance(r.data.get("peak_hour_estimate"), (int, float))]

    total_footfall_10m = int(sum(footfall_10m_list))
    avg_footfall_10m = round(total_footfall_10m / len(footfall_10m_list), 1) if footfall_10m_list else 0.0

    total_peak_hour = int(sum(peak_hour_list))
    avg_peak_hour = round(total_peak_hour / len(peak_hour_list), 1) if peak_hour_list else 0.0

    # 2. Shop Mix
    shop_mix = {
        "grocery": 0,
        "general": 0,
        "pharmacy": 0,
        "restaurant": 0,
        "other": 0,
    }
    for r in responses:
        counts = r.data.get("shop_counts", {})
        if isinstance(counts, dict):
            for k, v in counts.items():
                if k in shop_mix and isinstance(v, (int, float)):
                    shop_mix[k] += int(v)

    total_shops = sum(shop_mix.values())

    # 3. Competitors
    all_competitors = []
    for r in responses:
        comps = r.data.get("competitors", [])
        if isinstance(comps, list):
            for c in comps:
                if isinstance(c, dict) and c.get("name"):
                    all_competitors.append(c)

    # 4. Dominant Household Type
    hh_types = [r.data.get("dominant_household_type") for r in responses if r.data.get("dominant_household_type")]
    hh_counts = dict(Counter(hh_types))
    dominant_hh = max(hh_counts.keys(), key=lambda k: hh_counts[k]) if hh_counts else "mixed"

    # 5. Lane Suitability
    lane_widths = [r.data.get("lane_width_ft") for r in responses if isinstance(r.data.get("lane_width_ft"), (int, float)) and r.data.get("lane_width_ft") > 0]
    avg_lane_width = round(sum(lane_widths) / len(lane_widths), 1) if lane_widths else 0.0

    lighting_count = sum(1 for r in responses if r.data.get("street_lighting") is True)
    lighting_pct = round((lighting_count / resp_count) * 100, 1)

    parking_types = [r.data.get("parking_availability") for r in responses if r.data.get("parking_availability")]
    parking_summary = dict(Counter(parking_types))

    # Compile Insights Object
    insights = {
        "summary": (
            f"Ground survey completed across {resp_count} grid cells. "
            f"Observed average 10-min footfall of {avg_footfall_10m} (~{avg_peak_hour}/hr peak). "
            f"Identified {len(all_competitors)} direct competitors and {total_shops} retail shops "
            f"with dominant {dominant_hh} household profile. Average lane width: {avg_lane_width} ft."
        ),
        "total_footfall_10min": total_footfall_10m,
        "avg_footfall_10min": avg_footfall_10m,
        "total_peak_hour_estimate": total_peak_hour,
        "avg_peak_hour_estimate": avg_peak_hour,
        "competitor_count": len(all_competitors),
        "competitors": all_competitors,
        "shop_mix": shop_mix,
        "total_shops": total_shops,
        "dominant_household_type": dominant_hh,
        "household_distribution": hh_counts,
        "avg_lane_width_ft": avg_lane_width,
        "street_lighting_pct": lighting_pct,
        "parking_summary": parking_summary,
        "survey_tasks_count": task_count,
        "submitted_responses_count": resp_count,
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }

    # Update Study Request
    study.insights = insights
    study.status = StudyStatus.COMPLETED
    study.completed_at = datetime.now(timezone.utc)

    # Ensure study geometry is united
    db.execute(text("""
        UPDATE study_requests
        SET geom = (
            SELECT ST_UnaryUnion(ST_Collect(geom))
            FROM survey_tasks
            WHERE request_id = :study_id
        )
        WHERE id = :study_id AND geom IS NULL;
    """), {"study_id": study.id})

    db.commit()
    db.refresh(study)

    # Trigger property re-evaluation if linked to a property
    if study.property_id:
        trigger_property_reevaluation(study.property_id)

    logger.info(f"Study {study_id} rolled up successfully. Status: COMPLETED.")
    return insights


def check_and_rollup_study(db: Session, study_id: str) -> bool:
    """
    Checks if all tasks for a study request have been submitted.
    If all are submitted, triggers rollup automatically.
    """
    tasks = db.query(SurveyTask).filter(SurveyTask.request_id == study_id).all()
    if not tasks:
        return False

    all_submitted = all(t.status == SurveyTaskStatus.SUBMITTED for t in tasks)
    if all_submitted:
        logger.info(f"All {len(tasks)} tasks submitted for study {study_id}. Triggering rollup.")
        compute_study_rollup(db, study_id)
        return True
    return False


def trigger_property_reevaluation(property_id: str):
    """
    Re-evaluates property scoring with newly integrated survey ground truth.
    Creates a new evaluation version.
    """
    try:
        from app.api.v1.properties import perform_property_evaluation
        perform_property_evaluation(property_id)
        logger.info(f"Property {property_id} re-evaluation completed after catchment study.")
    except Exception as e:
        logger.error(f"Failed to trigger property re-evaluation for {property_id}: {e}")
