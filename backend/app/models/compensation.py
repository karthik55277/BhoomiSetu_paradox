import uuid
from typing import TYPE_CHECKING
from sqlalchemy import DateTime, ForeignKey, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base

if TYPE_CHECKING:
    from app.models.parcels import Parcel


class CompensationRecord(Base):
    """Financial compensation disbursement tracking model."""

    __tablename__ = "compensation_records"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    record_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    parcel_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("parcels.id"), nullable=False, index=True)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False, index=True)
    payee_name: Mapped[str] = mapped_column(String(150), nullable=False)
    amount_inr: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="Pending approval", index=True)
    approved_by_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    disbursed_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    parcel: Mapped["Parcel"] = relationship("Parcel", back_populates="compensations")
    project: Mapped["Project"] = relationship("Project")

    @property
    def parcel_id_str(self) -> str | None:
        return self.parcel.parcel_id if self.parcel else None

    @property
    def project_code(self) -> str | None:
        return self.project.code if self.project else None
