import os
import uuid
import shutil
from pathlib import Path
from typing import List, Optional
from datetime import datetime, timezone
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    UploadFile,
    File,
    Form,
    status,
    BackgroundTasks,
)
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import text
from geoalchemy2.shape import from_shape, to_shape
from shapely.geometry import Point

from app.config import settings
from app.db.session import get_db, SessionLocal
from app.db.models import (
    Property,
    PropertyPhoto,
    PropertyEvaluation,
    PropertyStageHistory,
    PropertyStage,
    ScoutAssignment,
    ScoutAssignmentStatus,
    User,
    UserRole,
    ALLOWED_STAGE_TRANSITIONS,
)
from app.api.deps import get_current_user, require_role
from app.scoring.property import evaluate_property_deterministic

router = APIRouter(prefix="/properties")

UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


class MoveStageRequest(BaseModel):
    to_stage: PropertyStage
    reason: str = Field(..., min_length=3, description="Mandatory justification for stage progression")


def perform_property_evaluation(property_id: str):
    """Background or inline worker for property evaluation."""
    db = SessionLocal()
    try:
        prop = db.query(Property).filter(Property.id == property_id).first()
        if not prop:
            return

        # Determine next evaluation version
        latest_eval = (
            db.query(PropertyEvaluation)
            .filter(PropertyEvaluation.property_id == property_id)
            .order_by(PropertyEvaluation.version.desc())
            .first()
        )
        new_version = (latest_eval.version + 1) if latest_eval else 1

        eval_result = evaluate_property_deterministic(prop, db)

        evaluation = PropertyEvaluation(
            id=f"eval_{uuid.uuid4().hex[:10]}",
            property_id=property_id,
            version=new_version,
            score=eval_result["score"],
            recommendation=eval_result["recommendation"],
            confidence=eval_result["confidence"],
            insights=eval_result["insights"],
            risks=eval_result["risks"],
            breakdown=eval_result["breakdown"],
            summary=eval_result["summary"],
            summary_source=eval_result["summary_source"],
        )
        db.add(evaluation)
        db.commit()

        # If associated with an assignment, mark assignment as done
        if prop.scout_assignment_id:
            asg = db.query(ScoutAssignment).filter(ScoutAssignment.id == prop.scout_assignment_id).first()
            if asg and asg.status != ScoutAssignmentStatus.DONE:
                asg.status = ScoutAssignmentStatus.DONE
                db.commit()

    except Exception as e:
        db.rollback()
    finally:
        db.close()


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_property(
    background_tasks: BackgroundTasks,
    title: str = Form(...),
    latitude: float = Form(...),
    longitude: float = Form(...),
    address: str = Form(...),
    rent_monthly: Optional[float] = Form(None),
    deposit: Optional[float] = Form(None),
    area_sqft: float = Form(...),
    frontage_ft: float = Form(0.0),
    floor: str = Form("Ground"),
    parking: bool = Form(False),
    parking_slots: int = Form(0),
    road_width_ft: float = Form(0.0),
    visibility: int = Form(3),
    owner_name: Optional[str] = Form(None),
    owner_phone: Optional[str] = Form(None),
    notes: Optional[str] = Form(None),
    scout_assignment_id: Optional[str] = Form(None),
    force: bool = Form(False),
    photos: List[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Onboard a property from a scouted location (mobile or desktop).
    Validates Chennai bounding box, performs 50m duplicate detection with +/-20% tolerance,
    stores photos, and triggers automated deterministic evaluation.
    """
    # 1. Validate location within Chennai bounding box
    if not (settings.CHENNAI_MIN_LAT <= latitude <= settings.CHENNAI_MAX_LAT and
            settings.CHENNAI_MIN_LON <= longitude <= settings.CHENNAI_MAX_LON):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Coordinates ({latitude}, {longitude}) are outside the Chennai operational area "
                f"(lat: {settings.CHENNAI_MIN_LAT} - {settings.CHENNAI_MAX_LAT}, "
                f"lon: {settings.CHENNAI_MIN_LON} - {settings.CHENNAI_MAX_LON})."
            )
        )

    # 2. Duplicate Detection: Check for existing properties within 50m
    dup_query = text("""
        SELECT id, title, address, rent_monthly, area_sqft,
               ST_Distance(location::geography, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography) as dist_meters
        FROM properties
        WHERE ST_DWithin(location::geography, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography, 50.0);
    """)
    nearby_props = db.execute(dup_query, {"lon": longitude, "lat": latitude}).fetchall()

    potential_duplicates = []
    for row in nearby_props:
        p_id, p_title, p_address, p_rent, p_area, p_dist = row
        # Check area tolerance (+/- 20%)
        area_diff = abs(p_area - area_sqft) / area_sqft if area_sqft > 0 else 1.0
        # Check rent tolerance (+/- 20%) if both specified
        rent_diff = 1.0
        if rent_monthly and p_rent and rent_monthly > 0:
            rent_diff = abs(p_rent - rent_monthly) / rent_monthly

        if area_diff <= 0.20 or rent_diff <= 0.20:
            potential_duplicates.append({
                "id": p_id,
                "title": p_title,
                "address": p_address,
                "distance_meters": round(p_dist, 1),
                "area_sqft": p_area,
                "rent_monthly": p_rent,
            })

    if potential_duplicates and not force:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "Potential duplicate property detected within 50 meters with similar area or rent specifications.",
                "potential_duplicates": potential_duplicates,
                "resolution": "Set force=true to override and submit anyway."
            }
        )

    # 3. Create Property record
    property_id = f"prop_{uuid.uuid4().hex[:10]}"
    pt = from_shape(Point(longitude, latitude), srid=4326)

    new_prop = Property(
        id=property_id,
        title=title,
        location=pt,
        address=address,
        rent_monthly=rent_monthly,
        deposit=deposit,
        area_sqft=area_sqft,
        frontage_ft=frontage_ft,
        floor=floor,
        parking=parking or (parking_slots > 0),
        parking_slots=parking_slots,
        road_width_ft=road_width_ft,
        visibility=visibility,
        owner_name=owner_name,
        owner_phone=owner_phone,
        notes=notes,
        stage=PropertyStage.SCOUTED,
        scout_assignment_id=scout_assignment_id,
        created_by=current_user.id,
    )
    db.add(new_prop)

    # 4. Save uploaded photos
    if photos:
        for idx, file in enumerate(photos):
            if file and file.filename:
                ext = Path(file.filename).suffix.lower() or ".jpg"
                filename = f"{property_id}_{idx}_{uuid.uuid4().hex[:6]}{ext}"
                filepath = UPLOAD_DIR / filename

                with open(filepath, "wb") as buffer:
                    shutil.copyfileobj(file.file, buffer)

                photo_url = f"/uploads/{filename}"
                photo = PropertyPhoto(
                    id=f"pht_{uuid.uuid4().hex[:10]}",
                    property_id=property_id,
                    photo_url=photo_url,
                    caption=f"Storefront Photo {idx + 1}",
                )
                db.add(photo)

    # 5. Log initial stage history
    history = PropertyStageHistory(
        id=f"sth_{uuid.uuid4().hex[:10]}",
        property_id=property_id,
        from_stage="",
        to_stage=PropertyStage.SCOUTED.value,
        changed_by=current_user.id,
        reason="Initial property onboarding by scout executive",
    )
    db.add(history)

    db.commit()
    db.refresh(new_prop)

    # 6. Execute evaluation immediately inline for fast responsiveness
    perform_property_evaluation(property_id)
    db.refresh(new_prop)

    return new_prop.to_dict()


@router.get("")
def list_properties(
    stage: Optional[PropertyStage] = None,
    scout_assignment_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List properties with optional stage filter (used by BD Manager Kanban board and lists).
    """
    query = db.query(Property)
    if stage:
        query = query.filter(Property.stage == stage)
    if scout_assignment_id:
        query = query.filter(Property.scout_assignment_id == scout_assignment_id)

    properties = query.order_by(Property.created_at.desc()).all()
    return [p.to_dict() for p in properties]


@router.get("/{property_id}")
def get_property(
    property_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get detailed property view with all evaluations, photos, and audit stage timeline.
    """
    prop = db.query(Property).filter(Property.id == property_id).first()
    if not prop:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Property '{property_id}' not found."
        )

    # Check for potential duplicates nearby for the detail view
    dup_query = text("""
        SELECT id, title, address, rent_monthly, area_sqft,
               ST_Distance(location::geography, :loc::geography) as dist_meters
        FROM properties
        WHERE id != :prop_id
          AND ST_DWithin(location::geography, :loc::geography, 50.0);
    """)
    nearby_dups = db.execute(dup_query, {"loc": prop.location, "prop_id": prop.id}).fetchall()
    duplicate_warnings = [
        {
            "id": r[0],
            "title": r[1],
            "address": r[2],
            "rent_monthly": r[3],
            "area_sqft": r[4],
            "distance_meters": round(r[5], 1),
        }
        for r in nearby_dups
    ]

    data = prop.to_dict()
    data["nearby_duplicates"] = duplicate_warnings
    return data


@router.post("/{property_id}/stage")
def move_property_stage(
    property_id: str,
    req: MoveStageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["bd_manager"])),
):
    """
    BD Manager state machine transition:
    Move property across pipeline stages. Requires mandatory reason and validates transition logic.
    """
    prop = db.query(Property).filter(Property.id == property_id).first()
    if not prop:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Property '{property_id}' not found."
        )

    current_stage = prop.stage
    target_stage = req.to_stage

    if current_stage == target_stage:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Property is already in '{current_stage.value}' stage."
        )

    allowed = ALLOWED_STAGE_TRANSITIONS.get(current_stage, [])
    if target_stage not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Invalid stage transition from '{current_stage.value}' to '{target_stage.value}'. "
                f"Allowed target stages: {[s.value for s in allowed]}."
            )
        )

    # Record stage change
    prop.stage = target_stage
    history = PropertyStageHistory(
        id=f"sth_{uuid.uuid4().hex[:10]}",
        property_id=property_id,
        from_stage=current_stage.value,
        to_stage=target_stage.value,
        changed_by=current_user.id,
        reason=req.reason.strip(),
    )
    db.add(history)
    db.commit()
    db.refresh(prop)

    return prop.to_dict()


@router.post("/{property_id}/evaluate")
def trigger_property_reevaluation(
    property_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Re-evaluate property and generate a new version in property_evaluations history.
    """
    prop = db.query(Property).filter(Property.id == property_id).first()
    if not prop:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Property '{property_id}' not found."
        )

    perform_property_evaluation(property_id)
    db.refresh(prop)
    return prop.to_dict()
