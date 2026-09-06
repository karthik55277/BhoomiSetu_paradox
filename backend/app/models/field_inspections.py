"""
Field Inspection SQLAlchemy Model (Phase 3.5).
Stores ground survey observations, GPS coordinates, PostGIS spatial distance calculations,
photo document attachments, and device capture timestamps with client UUID idempotency.
"""

import uuid
from typing import TYPE_CHECKING
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base

if TYPE_CHECKING:
    from app.models.documents import DocumentRecord
    from app.models.parcels import Parcel
    from app.models.users import User


class FieldInspection(Base):
    """Ground field survey inspection record."""

    __tablename__ = "field_inspections"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    client_inspection_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), unique=True, nullable=False, index=True)
    parcel_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("parcels.id"), nullable=False, index=True)
    inspector_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    gps_lat: Mapped[float] = mapped_column(Float, nullable=False)
    gps_lon: Mapped[float] = mapped_column(Float, nullable=False)
    distance_to_parcel_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    verification_status: Mapped[str] = mapped_column(String(50), nullable=False, default="Boundary Verified")
    boundary_intact: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    encroachment_flag: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    photo_document_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("documents.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="SUBMITTED")
    captured_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    parcel: Mapped["Parcel"] = relationship("Parcel")
    inspector: Mapped["User"] = relationship("User")
    photo_document: Mapped["DocumentRecord | None"] = relationship("DocumentRecord")
