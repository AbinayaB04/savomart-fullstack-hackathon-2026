import enum
from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    String,
    Integer,
    BigInteger,
    DateTime,
    Float,
    Text,
    Boolean,
    ForeignKey,
    Enum as SQLEnum,
    Index,
    text
)
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import JSONB
from geoalchemy2 import Geometry
from geoalchemy2.shape import to_shape
from app.db.base import Base


class UserRole(str, enum.Enum):
    BD_MANAGER = "bd_manager"
    BD_EXECUTIVE = "bd_executive"
    SURVEY_MANAGER = "survey_manager"
    SURVEY_EXECUTIVE = "survey_executive"


class PropertyStage(str, enum.Enum):
    SCOUTED = "scouted"
    UNDER_REVIEW = "under_review"
    PROCEED = "proceed"
    CATCHMENT_STUDY = "catchment_study"
    APPROVED = "approved"
    REJECTED = "rejected"
    ON_HOLD = "on_hold"


class ScoutAssignmentStatus(str, enum.Enum):
    ASSIGNED = "assigned"
    IN_PROGRESS = "in_progress"
    DONE = "done"


class PropertyRecommendation(str, enum.Enum):
    PROCEED = "proceed"
    REVIEW = "review"
    REJECT = "reject"


class EvaluationConfidence(str, enum.Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


# Valid state machine transitions for property pipeline stages
ALLOWED_STAGE_TRANSITIONS = {
    PropertyStage.SCOUTED: [PropertyStage.UNDER_REVIEW, PropertyStage.REJECTED, PropertyStage.ON_HOLD],
    PropertyStage.UNDER_REVIEW: [PropertyStage.PROCEED, PropertyStage.REJECTED, PropertyStage.ON_HOLD],
    PropertyStage.PROCEED: [PropertyStage.CATCHMENT_STUDY, PropertyStage.APPROVED, PropertyStage.REJECTED, PropertyStage.ON_HOLD],
    PropertyStage.CATCHMENT_STUDY: [PropertyStage.APPROVED, PropertyStage.REJECTED, PropertyStage.ON_HOLD],
    PropertyStage.ON_HOLD: [PropertyStage.UNDER_REVIEW, PropertyStage.PROCEED, PropertyStage.REJECTED],
    PropertyStage.APPROVED: [PropertyStage.REJECTED, PropertyStage.ON_HOLD],
    PropertyStage.REJECTED: [PropertyStage.UNDER_REVIEW],
}


class User(Base):
    __tablename__ = "users"

    id = Column(String(50), primary_key=True)
    name = Column(String(100), nullable=False)
    role = Column(SQLEnum(UserRole, name="user_role_enum", create_type=True), nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "role": self.role.value if isinstance(self.role, UserRole) else str(self.role),
            "created_at": self.created_at.isoformat() if self.created_at else None
        }


class GridCell(Base):
    __tablename__ = "grid_cells"

    id = Column(Integer, primary_key=True, autoincrement=True)
    geom = Column(Geometry(geometry_type="POLYGON", srid=4326, spatial_index=True), nullable=False)
    centroid = Column(Geometry(geometry_type="POINT", srid=4326, spatial_index=True), nullable=False)
    row = Column(Integer, nullable=False, index=True)
    col = Column(Integer, nullable=False, index=True)

    __table_args__ = (
        Index("idx_grid_cells_row_col", "row", "col", unique=True),
    )


class POI(Base):
    __tablename__ = "pois"

    id = Column(Integer, primary_key=True, autoincrement=True)
    osm_id = Column(BigInteger, nullable=False, index=True)
    category = Column(String(50), nullable=False, index=True)
    name = Column(String(255), nullable=True)
    geom = Column(Geometry(geometry_type="POINT", srid=4326, spatial_index=True), nullable=False)
    tags = Column(JSONB, nullable=False, default=dict)

    __table_args__ = (
        Index("idx_pois_category_osm", "category", "osm_id", unique=True),
    )


class Store(Base):
    __tablename__ = "stores"

    id = Column(Integer, primary_key=True, autoincrement=True)
    external_id = Column(String(100), nullable=True, index=True, unique=True)
    name = Column(String(255), nullable=False)
    address = Column(String(500), nullable=True)
    geom = Column(Geometry(geometry_type="POINT", srid=4326, spatial_index=True), nullable=False)
    raw = Column(JSONB, nullable=False, default=dict)
    fetched_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)


class DataVersion(Base):
    __tablename__ = "data_versions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    source = Column(String(100), nullable=False, index=True)
    fetched_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    record_count = Column(Integer, nullable=False, default=0)
    notes = Column(String(500), nullable=True)


class AreaReport(Base):
    __tablename__ = "area_reports"

    id = Column(String(50), primary_key=True)
    name = Column(String(255), nullable=False, default="Chennai Area Fitness Report")
    cell_ids = Column(JSONB, nullable=False, default=list)
    geom = Column(Geometry(geometry_type="GEOMETRY", srid=4326, spatial_index=True), nullable=True)
    status = Column(String(50), nullable=False, default="queued", index=True)
    progress_message = Column(String(255), nullable=True, default="Queued for analysis")
    score = Column(Float, nullable=True)
    band = Column(String(50), nullable=True)  # Excellent, Good, Fair, Poor
    breakdown = Column(JSONB, nullable=True, default=list)
    area_profile = Column(JSONB, nullable=True, default=dict)
    hotspots = Column(JSONB, nullable=True, default=list)
    summary = Column(Text, nullable=True)
    summary_source = Column(String(50), nullable=True)  # llm | template
    data_versions = Column(JSONB, nullable=True, default=dict)
    created_by = Column(String(50), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    error = Column(Text, nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "cell_ids": self.cell_ids,
            "status": self.status,
            "progress_message": self.progress_message,
            "score": round(self.score, 1) if self.score is not None else None,
            "band": self.band,
            "breakdown": self.breakdown,
            "area_profile": self.area_profile,
            "hotspots": self.hotspots,
            "summary": self.summary,
            "summary_source": self.summary_source,
            "data_versions": self.data_versions,
            "created_by": self.created_by,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "error": self.error,
        }


class GeocodeCache(Base):
    __tablename__ = "geocode_cache"

    id = Column(Integer, primary_key=True, autoincrement=True)
    query = Column(String(255), unique=True, index=True, nullable=False)
    result = Column(JSONB, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)


class ScoutAssignment(Base):
    __tablename__ = "scout_assignments"

    id = Column(String(50), primary_key=True)
    report_id = Column(String(50), ForeignKey("area_reports.id"), nullable=True, index=True)
    hotspot = Column(JSONB, nullable=False, default=dict)
    cell_id = Column(Integer, nullable=True)
    location = Column(Geometry(geometry_type="POINT", srid=4326, spatial_index=True), nullable=False)
    assigned_to = Column(String(50), ForeignKey("users.id"), nullable=False, index=True)
    assigned_by = Column(String(50), ForeignKey("users.id"), nullable=False)
    note = Column(Text, nullable=True)
    status = Column(SQLEnum(ScoutAssignmentStatus, name="scout_assignment_status_enum", create_type=True), nullable=False, default=ScoutAssignmentStatus.ASSIGNED, index=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    assigned_to_user = relationship("User", foreign_keys=[assigned_to])
    assigned_by_user = relationship("User", foreign_keys=[assigned_by])

    def to_dict(self):
        pt = to_shape(self.location) if self.location is not None else None
        return {
            "id": self.id,
            "report_id": self.report_id,
            "hotspot": self.hotspot,
            "cell_id": self.cell_id,
            "latitude": pt.y if pt else None,
            "longitude": pt.x if pt else None,
            "assigned_to": self.assigned_to,
            "assigned_to_name": self.assigned_to_user.name if self.assigned_to_user else self.assigned_to,
            "assigned_by": self.assigned_by,
            "assigned_by_name": self.assigned_by_user.name if self.assigned_by_user else self.assigned_by,
            "note": self.note,
            "status": self.status.value if isinstance(self.status, ScoutAssignmentStatus) else self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Property(Base):
    __tablename__ = "properties"

    id = Column(String(50), primary_key=True)
    title = Column(String(255), nullable=False)
    location = Column(Geometry(geometry_type="POINT", srid=4326, spatial_index=True), nullable=False)
    address = Column(Text, nullable=False)
    rent_monthly = Column(Float, nullable=True)
    deposit = Column(Float, nullable=True)
    area_sqft = Column(Float, nullable=False)
    frontage_ft = Column(Float, nullable=False, default=0.0)
    floor = Column(String(50), nullable=False, default="Ground")
    parking = Column(Boolean, nullable=False, default=False)
    parking_slots = Column(Integer, nullable=False, default=0)
    road_width_ft = Column(Float, nullable=False, default=0.0)
    visibility = Column(Integer, nullable=False, default=3)
    owner_name = Column(String(150), nullable=True)
    owner_phone = Column(String(50), nullable=True)
    notes = Column(Text, nullable=True)
    stage = Column(SQLEnum(PropertyStage, name="property_stage_enum", create_type=True), nullable=False, default=PropertyStage.SCOUTED, index=True)
    scout_assignment_id = Column(String(50), ForeignKey("scout_assignments.id"), nullable=True, index=True)
    created_by = Column(String(50), ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    creator = relationship("User", foreign_keys=[created_by])
    scout_assignment = relationship("ScoutAssignment", foreign_keys=[scout_assignment_id])
    photos = relationship("PropertyPhoto", back_populates="property", cascade="all, delete-orphan", order_by="PropertyPhoto.created_at")
    evaluations = relationship("PropertyEvaluation", back_populates="property", cascade="all, delete-orphan", order_by="PropertyEvaluation.version.desc()")
    stage_history = relationship("PropertyStageHistory", back_populates="property", cascade="all, delete-orphan", order_by="PropertyStageHistory.created_at.desc()")

    def to_dict(self, include_relations=True):
        pt = to_shape(self.location) if self.location is not None else None
        rent_sqft = round(self.rent_monthly / self.area_sqft, 1) if (self.rent_monthly and self.area_sqft and self.area_sqft > 0) else None

        data = {
            "id": self.id,
            "title": self.title,
            "address": self.address,
            "latitude": pt.y if pt else None,
            "longitude": pt.x if pt else None,
            "rent_monthly": self.rent_monthly,
            "rent_per_sqft": rent_sqft,
            "deposit": self.deposit,
            "area_sqft": self.area_sqft,
            "frontage_ft": self.frontage_ft,
            "floor": self.floor,
            "parking": self.parking,
            "parking_slots": self.parking_slots,
            "road_width_ft": self.road_width_ft,
            "visibility": self.visibility,
            "owner_name": self.owner_name,
            "owner_phone": self.owner_phone,
            "notes": self.notes,
            "stage": self.stage.value if isinstance(self.stage, PropertyStage) else self.stage,
            "scout_assignment_id": self.scout_assignment_id,
            "created_by": self.created_by,
            "created_by_name": self.creator.name if self.creator else self.created_by,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

        if include_relations:
            data["photos"] = [p.to_dict() for p in self.photos]
            data["evaluations"] = [e.to_dict() for e in self.evaluations]
            data["latest_evaluation"] = self.evaluations[0].to_dict() if self.evaluations else None
            data["stage_history"] = [h.to_dict() for h in self.stage_history]

        return data


class PropertyPhoto(Base):
    __tablename__ = "property_photos"

    id = Column(String(50), primary_key=True)
    property_id = Column(String(50), ForeignKey("properties.id", ondelete="CASCADE"), nullable=False, index=True)
    photo_url = Column(String(500), nullable=False)
    caption = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    property = relationship("Property", back_populates="photos")

    def to_dict(self):
        return {
            "id": self.id,
            "property_id": self.property_id,
            "photo_url": self.photo_url,
            "caption": self.caption,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class PropertyEvaluation(Base):
    __tablename__ = "property_evaluations"

    id = Column(String(50), primary_key=True)
    property_id = Column(String(50), ForeignKey("properties.id", ondelete="CASCADE"), nullable=False, index=True)
    version = Column(Integer, nullable=False, default=1)
    score = Column(Float, nullable=False)
    recommendation = Column(String(50), nullable=False)  # proceed, review, reject
    confidence = Column(String(50), nullable=False)      # high, medium, low
    insights = Column(JSONB, nullable=False, default=list)
    risks = Column(JSONB, nullable=False, default=list)
    breakdown = Column(JSONB, nullable=False, default=dict)
    summary = Column(Text, nullable=True)
    summary_source = Column(String(50), nullable=False, default="template")
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    property = relationship("Property", back_populates="evaluations")

    def to_dict(self):
        return {
            "id": self.id,
            "property_id": self.property_id,
            "version": self.version,
            "score": round(self.score, 1),
            "recommendation": self.recommendation,
            "confidence": self.confidence,
            "insights": self.insights,
            "risks": self.risks,
            "breakdown": self.breakdown,
            "summary": self.summary,
            "summary_source": self.summary_source,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class PropertyStageHistory(Base):
    __tablename__ = "property_stage_history"

    id = Column(String(50), primary_key=True)
    property_id = Column(String(50), ForeignKey("properties.id", ondelete="CASCADE"), nullable=False, index=True)
    from_stage = Column(String(50), nullable=False)
    to_stage = Column(String(50), nullable=False)
    changed_by = Column(String(50), ForeignKey("users.id"), nullable=False)
    reason = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    user = relationship("User", foreign_keys=[changed_by])
    property = relationship("Property", back_populates="stage_history")

    def to_dict(self):
        return {
            "id": self.id,
            "property_id": self.property_id,
            "from_stage": self.from_stage,
            "to_stage": self.to_stage,
            "changed_by": self.changed_by,
            "changed_by_name": self.user.name if self.user else self.changed_by,
            "reason": self.reason,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
