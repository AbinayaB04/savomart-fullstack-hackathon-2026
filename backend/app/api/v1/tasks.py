import uuid
import logging
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models import (
    User,
    UserRole,
    SurveyTask,
    SurveyTaskStatus,
    SurveyResponse,
    StudyRequest,
    StudyStatus,
)
from app.api.deps import get_current_user, require_role
from app.studies.rollup import check_and_rollup_study

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tasks")


class TaskAssignSchema(BaseModel):
    assigned_to: str = Field(..., description="User ID of Survey Executive to assign to")


class SurveyResponseSchema(BaseModel):
    client_uuid: str = Field(..., description="Unique client-generated UUID for idempotent submission")
    footfall_count_10min: int = Field(0, ge=0, description="Pedestrian count in 10 minutes")
    peak_hour_estimate: int = Field(0, ge=0, description="Estimated peak-hour footfall")
    shop_counts: Dict[str, int] = Field(
        default_factory=lambda: {"grocery": 0, "general": 0, "pharmacy": 0, "restaurant": 0, "other": 0},
        description="Shop count by retail type",
    )
    competitors: List[Dict[str, Any]] = Field(default_factory=list, description="Competitor stores seen")
    dominant_household_type: str = Field("mixed", description="Dominant housing: apartments | independent | mixed")
    lane_width_ft: float = Field(0.0, ge=0.0, description="Lane width in feet")
    parking_availability: str = Field("street_only", description="dedicated | street_only | none")
    street_lighting: bool = Field(True, description="Whether street lighting is operational")
    notes: Optional[str] = Field(None, description="Qualitative observations from surveyor")
    photos: List[str] = Field(default_factory=list, description="Captured photo URLs")
    gps_lat: Optional[float] = Field(None, description="Surveyor GPS latitude")
    gps_lng: Optional[float] = Field(None, description="Surveyor GPS longitude")
    captured_at: Optional[str] = Field(None, description="Client ISO timestamp when survey was captured")


@router.get("/mine")
def get_my_tasks(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Survey Executive mobile-first task list: Retrieves tasks assigned to the current user.
    """
    tasks = (
        db.query(SurveyTask)
        .filter(SurveyTask.assigned_to == current_user.id)
        .order_by(SurveyTask.status.asc(), SurveyTask.created_at.desc())
        .all()
    )
    return [t.to_dict() for t in tasks]


@router.get("/{task_id}")
def get_task_details(
    task_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get detailed task information, cell coordinates, and responses.
    """
    task = db.query(SurveyTask).filter(SurveyTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found.")

    res = task.to_dict()
    study = task.request
    res["study_target_type"] = study.target_type.value if study else None
    res["study_property_id"] = study.property_id if study else None
    res["study_property_title"] = study.property.title if (study and study.property) else None
    res["study_radius_m"] = study.radius_m if study else None
    return res


@router.patch("/{task_id}/assign")
def assign_task(
    task_id: str,
    payload: TaskAssignSchema,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.SURVEY_MANAGER, UserRole.BD_MANAGER)),
):
    """
    Survey Manager manually assigns or reassigns a survey task to an executive.
    """
    task = db.query(SurveyTask).filter(SurveyTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found.")

    target_user = db.query(User).filter(User.id == payload.assigned_to).first()
    if not target_user:
        raise HTTPException(status_code=404, detail=f"User {payload.assigned_to} not found.")

    task.assigned_to = payload.assigned_to

    # If the parent study was PLANNED, transition it to IN_PROGRESS
    if task.request and task.request.status == StudyStatus.PLANNED:
        task.request.status = StudyStatus.IN_PROGRESS

    db.commit()
    db.refresh(task)

    return {
        "message": f"Task {task_id} assigned to {target_user.name}.",
        "task": task.to_dict(),
    }


@router.post("/{task_id}/responses", status_code=status.HTTP_201_CREATED)
def submit_task_response(
    task_id: str,
    payload: SurveyResponseSchema,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Survey Executive submits ground lane data for a task.
    Supports offline capture and idempotent sync via client_uuid.
    When all tasks in the study are submitted, automatically triggers rollup computation.
    """
    task = db.query(SurveyTask).filter(SurveyTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found.")

    # 1. Idempotency Check: if client_uuid already exists, return existing record
    existing_resp = db.query(SurveyResponse).filter(SurveyResponse.client_uuid == payload.client_uuid).first()
    if existing_resp:
        logger.info(f"Idempotent response hit for client_uuid {payload.client_uuid}. Returning existing response.")
        return {
            "idempotent": True,
            "message": "Survey response already recorded (idempotent sync).",
            "response": existing_resp.to_dict(),
            "task": task.to_dict(),
        }

    # 2. Extract survey payload data
    survey_data = {
        "footfall_count_10min": payload.footfall_count_10min,
        "peak_hour_estimate": payload.peak_hour_estimate,
        "shop_counts": payload.shop_counts,
        "competitors": payload.competitors,
        "dominant_household_type": payload.dominant_household_type,
        "lane_width_ft": payload.lane_width_ft,
        "parking_availability": payload.parking_availability,
        "street_lighting": payload.street_lighting,
        "notes": payload.notes,
        "gps_lat": payload.gps_lat,
        "gps_lng": payload.gps_lng,
    }

    captured_time = datetime.now(timezone.utc)
    if payload.captured_at:
        try:
            captured_time = datetime.fromisoformat(payload.captured_at.replace("Z", "+00:00"))
        except Exception:
            pass

    response_id = f"sresp_{uuid.uuid4().hex[:10]}"
    new_response = SurveyResponse(
        id=response_id,
        task_id=task.id,
        data=survey_data,
        photos=payload.photos,
        captured_at=captured_time,
        submitted_at=datetime.now(timezone.utc),
        client_uuid=payload.client_uuid,
    )
    db.add(new_response)

    # 3. Mark task as SUBMITTED
    task.status = SurveyTaskStatus.SUBMITTED
    db.commit()
    db.refresh(task)

    # 4. Check if all tasks in the study are submitted to trigger automatic rollup
    study_completed = check_and_rollup_study(db, task.request_id)

    return {
        "idempotent": False,
        "message": "Survey response submitted successfully.",
        "study_completed": study_completed,
        "response": new_response.to_dict(),
        "task": task.to_dict(),
    }
