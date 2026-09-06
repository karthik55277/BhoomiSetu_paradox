import uuid
from datetime import date
from typing import TYPE_CHECKING
from sqlalchemy import Date, DateTime, Integer, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base

if TYPE_CHECKING:
    from app.models.parcels import Parcel


class Project(Base):
    """Infrastructure acquisition project program model."""

    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    project_type: Mapped[str] = mapped_column(String(100), nullable=False)
    district: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    total_parcels_target: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    acquisition_progress_pct: Mapped[float] = mapped_column(Numeric(5, 2), default=0.00, nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="Planning", nullable=False)
    target_completion_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    parcels: Mapped[list["Parcel"]] = relationship("Parcel", back_populates="project")
