import uuid
from typing import TYPE_CHECKING
from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, Numeric, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base

if TYPE_CHECKING:
    from app.models.parcels import Parcel


class AIAnalysisResult(Base):
    """Historical and versioned ML prediction & SHAP explanation output model."""

    __tablename__ = "ai_analysis_results"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    parcel_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("parcels.id", ondelete="CASCADE"), nullable=False, index=True)
    model_version: Mapped[str] = mapped_column(String(50), nullable=False)
    acquisition_risk_class: Mapped[int] = mapped_column(Integer, nullable=False)
    risk_level: Mapped[str] = mapped_column(String(20), nullable=False)
    risk_score: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    risk_probability: Mapped[float] = mapped_column(Numeric(6, 4), nullable=False)
    explanation_method: Mapped[str] = mapped_column(String(50), nullable=False)
    shap_contributors = mapped_column(JSONB, nullable=False)
    top_positive_contributors = mapped_column(JSONB, nullable=False)
    top_negative_contributors = mapped_column(JSONB, nullable=False)
    input_features_snapshot = mapped_column(JSONB, nullable=False)
    is_current: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    parcel: Mapped["Parcel"] = relationship("Parcel", back_populates="ai_results")

    __table_args__ = (
        Index("idx_ai_current_results", "parcel_id", postgresql_where=(is_current.is_(True))),
    )
