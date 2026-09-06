import uuid
from datetime import date
from typing import TYPE_CHECKING
from sqlalchemy import Date, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base

if TYPE_CHECKING:
    from app.models.parcels import Parcel


class Dispute(Base):
    """Legal dispute and land objection record model."""

    __tablename__ = "disputes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    dispute_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    parcel_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("parcels.id"), nullable=False, index=True)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False, index=True)
    assigned_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    assigned_officer_name: Mapped[str] = mapped_column(String(100), nullable=False)
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="Under review", index=True)
    priority: Mapped[str] = mapped_column(String(20), nullable=False, default="MEDIUM")
    description: Mapped[str] = mapped_column(Text, nullable=False)
    filed_date: Mapped[date] = mapped_column(Date, nullable=False, default=func.current_date())
    resolved_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    parcel: Mapped["Parcel"] = relationship("Parcel", back_populates="disputes")
    project: Mapped["Project"] = relationship("Project")

    @property
    def parcel_id_str(self) -> str | None:
        return self.parcel.parcel_id if self.parcel else None

    @property
    def project_code(self) -> str | None:
        return self.project.code if self.project else None
