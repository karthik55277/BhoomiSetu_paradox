import uuid
from typing import TYPE_CHECKING
from geoalchemy2 import Geometry
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base

if TYPE_CHECKING:
    from app.models.ai_analysis import AIAnalysisResult
    from app.models.compensation import CompensationRecord
    from app.models.disputes import Dispute
    from app.models.documents import DocumentRecord
    from app.models.projects import Project


class Parcel(Base):
    """Core land parcel entity storing metadata, 19 ML input features, and UI baselines."""

    __tablename__ = "parcels"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    parcel_id: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False, index=True)
    survey_number: Mapped[str] = mapped_column(String(100), nullable=False)
    state: Mapped[str] = mapped_column(String(100), nullable=False, default="Bihar")
    district: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    land_area_ha: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False)
    land_type: Mapped[str] = mapped_column(String(100), nullable=False)
    land_use: Mapped[str] = mapped_column(String(100), nullable=False)
    acquisition_status: Mapped[str] = mapped_column(String(50), nullable=False, default="Identified", index=True)

    # 19 ML Contract Feature Fields
    land_value_inr: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    estimated_compensation_inr: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    number_of_owners: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    ownership_complexity_score: Mapped[float] = mapped_column(Numeric(4, 2), nullable=False, default=1.0)
    previous_dispute_flag: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    previous_objections_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    environmental_risk_score: Mapped[float] = mapped_column(Numeric(4, 2), nullable=False, default=0.0)
    road_accessibility_score: Mapped[float] = mapped_column(Numeric(4, 2), nullable=False, default=5.0)
    distance_to_road_km: Mapped[float] = mapped_column(Numeric(6, 2), nullable=False, default=1.0)
    stakeholder_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    land_use_conflict_score: Mapped[float] = mapped_column(Numeric(4, 2), nullable=False, default=0.0)
    documentation_completeness_score: Mapped[float] = mapped_column(Numeric(4, 2), nullable=False, default=5.0)
    historical_acquisition_duration_months: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=6.0)

    # UI baseline demo fields
    baseline_risk_score: Mapped[float] = mapped_column(Numeric(5, 2), default=50.00)
    suitability_score: Mapped[float] = mapped_column(Numeric(5, 2), default=80.00)
    estimated_delay_months: Mapped[float] = mapped_column(Numeric(4, 1), default=6.0)

    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="parcels")
    owners: Mapped[list["ParcelOwner"]] = relationship("ParcelOwner", back_populates="parcel", cascade="all, delete-orphan")
    geometry: Mapped["ParcelGeometry"] = relationship("ParcelGeometry", back_populates="parcel", uselist=False, cascade="all, delete-orphan")
    disputes: Mapped[list["Dispute"]] = relationship("Dispute", back_populates="parcel")
    compensations: Mapped[list["CompensationRecord"]] = relationship("CompensationRecord", back_populates="parcel")
    documents: Mapped[list["DocumentRecord"]] = relationship("DocumentRecord", back_populates="parcel")
    ai_results: Mapped[list["AIAnalysisResult"]] = relationship("AIAnalysisResult", back_populates="parcel", cascade="all, delete-orphan")

    @property
    def project_code(self) -> str | None:
        return self.project.code if self.project else None


class ParcelOwner(Base):
    """Owner model supporting joint and family land ownership."""

    __tablename__ = "parcel_owners"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    parcel_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("parcels.id", ondelete="CASCADE"), nullable=False, index=True)
    owner_name: Mapped[str] = mapped_column(String(150), nullable=False)
    share_percentage: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=100.00)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=True)
    contact_phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    parcel: Mapped["Parcel"] = relationship("Parcel", back_populates="owners")


class ParcelGeometry(Base):
    """PostGIS spatial boundary polygon model with GiST spatial indexing."""

    __tablename__ = "parcel_geometries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    parcel_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("parcels.id", ondelete="CASCADE"), unique=True, nullable=False)
    boundary = mapped_column(Geometry("POLYGON", srid=4326, spatial_index=True), nullable=False)
    centroid = mapped_column(Geometry("POINT", srid=4326), nullable=True)
    map_ui_x: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    map_ui_y: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    parcel: Mapped["Parcel"] = relationship("Parcel", back_populates="geometry")
