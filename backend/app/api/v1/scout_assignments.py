import uuid
from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from geoalchemy2.shape import from_shape
from shapely.geometry import Point

from app.db.session import get_db
from app.db.models import ScoutAssignment, ScoutAssignmentStatus, User, UserRole
from app.api.deps import get_current_user, require_role

router = APIRouter(prefix="/scout-assignments")


class CreateScoutAssignmentRequest(BaseModel):
    report_id: Optional[str] = None
    hotspot: dict = Field(..., description="Hotspot metadata dictionary containing centroid and reason")
    cell_id: Optional[int] = None
    assigned_to: str = Field(..., description="User ID of the BD Executive")
    note: Optional[str] = None


class UpdateAssignmentStatusRequest(BaseModel):
    status: ScoutAssignmentStatus


@router.post("", status_code=status.HTTP_201_CREATED)
def create_scout_assignment(
    req: CreateScoutAssignmentRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["bd_manager"])),
):
    """
    BD Manager dispatches a scouting assignment from an Area Intelligence hotspot.
    """
    # Verify assignee exists and is a BD Executive
    assignee = db.query(User).filter(User.id == req.assigned_to).first()
    if not assignee:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Assignee user '{req.assigned_to}' not found."
        )

    # Extract location coordinates from hotspot centroid [lon, lat]
    centroid = req.hotspot.get("centroid", [])
    if len(centroid) >= 2:
        lon, lat = centroid[0], centroid[1]
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Hotspot dictionary must contain 'centroid': [lon, lat]."
        )

    assignment_id = f"asg_{uuid.uuid4().hex[:10]}"
    pt = from_shape(Point(lon, lat), srid=4326)

    assignment = ScoutAssignment(
        id=assignment_id,
        report_id=req.report_id,
        hotspot=req.hotspot,
        cell_id=req.cell_id or req.hotspot.get("cell_id"),
        location=pt,
        assigned_to=req.assigned_to,
        assigned_by=current_user.id,
        note=req.note,
        status=ScoutAssignmentStatus.ASSIGNED,
    )

    db.add(assignment)
    db.commit()
    db.refresh(assignment)

    return assignment.to_dict()


@router.get("")
def list_scout_assignments(
    status_filter: Optional[ScoutAssignmentStatus] = Query(None, alias="status"),
    assigned_to: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List scouting assignments with optional status and assignee filters.
    """
    query = db.query(ScoutAssignment)
    if status_filter:
        query = query.filter(ScoutAssignment.status == status_filter)
    if assigned_to:
        query = query.filter(ScoutAssignment.assigned_to == assigned_to)

    assignments = query.order_by(ScoutAssignment.created_at.desc()).all()
    return [a.to_dict() for a in assignments]


@router.get("/mine")
def get_my_assignments(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    BD Executive view: Retrieve all assignments assigned to the current user.
    """
    assignments = (
        db.query(ScoutAssignment)
        .filter(ScoutAssignment.assigned_to == current_user.id)
        .order_by(ScoutAssignment.created_at.desc())
        .all()
    )
    return [a.to_dict() for a in assignments]


@router.patch("/{assignment_id}/status")
def update_assignment_status(
    assignment_id: str,
    req: UpdateAssignmentStatusRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Update progress status of a scouting assignment.
    """
    assignment = db.query(ScoutAssignment).filter(ScoutAssignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Assignment '{assignment_id}' not found."
        )

    assignment.status = req.status
    db.commit()
    db.refresh(assignment)

    return assignment.to_dict()
