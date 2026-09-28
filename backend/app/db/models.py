import enum
from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    String,
    Integer,
    BigInteger,
    DateTime,
    Enum as SQLEnum,
    Index,
    text
)
from sqlalchemy.dialects.postgresql import JSONB
from geoalchemy2 import Geometry
from app.db.base import Base


class UserRole(str, enum.Enum):
    BD_MANAGER = "bd_manager"
    BD_EXECUTIVE = "bd_executive"
    SURVEY_MANAGER = "survey_manager"
    SURVEY_EXECUTIVE = "survey_executive"


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
