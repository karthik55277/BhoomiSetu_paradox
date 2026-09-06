"""AI Analysis Persistence Service for BhoomiSetu.

Handles transactional persistence of ML predictions and SHAP explanations into PostgreSQL,
maintains versioned parcel analysis history (is_current rotation), stores exact 19-feature snapshots,
and records cryptographic audit trail events.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any, Dict, Optional

from fastapi import HTTPException, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models.ai_analysis import AIAnalysisResult
from app.models.parcels import Parcel
from app.services.audit_service import create_audit_event
from app.services.ml_service import MODEL_VERSION, explain_single_record

logger = logging.getLogger("ai_persistence_service")


def is_valid_uuid(val: str) -> bool:
    try:
        uuid.UUID(val)
        return True
    except ValueError:
        return False


def resolve_parcel(db: Session, parcel_id_or_code: str) -> Parcel:
    """Lookup a parcel in PostgreSQL by UUID or business parcel ID (e.g. 'BR-042-0187')."""
    parcel = (
        db.query(Parcel)
        .filter(
            or_(
                func.lower(Parcel.parcel_id) == parcel_id_or_code.lower(),
                Parcel.id == (uuid.UUID(parcel_id_or_code) if is_valid_uuid(parcel_id_or_code) else None),
            )
        )
        .first()
    )
    if not parcel:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Parcel '{parcel_id_or_code}' not found.",
        )
    return parcel


def persist_ai_analysis(
    db: Session,
    parcel: Parcel,
    record: Dict[str, Any],
    prediction: Dict[str, Any],
    explanation: Optional[Dict[str, Any]] = None,
    current_user: Optional[Any] = None,
) -> AIAnalysisResult:
    """Persist prediction + SHAP explanation for a parcel transactionally.
    
    Rotates is_current flag on previous results, stores exact 19-feature snapshot,
    and appends an AI_EVALUATION audit event.
    """
    if explanation is None:
        explanation = explain_single_record(record, limit=5)

    try:
        # 1. Rotate is_current flag for all previous analysis results for this parcel
        db.query(AIAnalysisResult).filter(
            AIAnalysisResult.parcel_id == parcel.id,
            AIAnalysisResult.is_current.is_(True),
        ).update({"is_current": False}, synchronize_session="fetch")

        # 2. Create new AIAnalysisResult record
        ai_result = AIAnalysisResult(
            parcel_id=parcel.id,
            model_version=MODEL_VERSION,
            acquisition_risk_class=prediction["acquisition_risk"],
            risk_level=prediction["risk_level"],
            risk_score=prediction["risk_score"],
            risk_probability=prediction["risk_probability"],
            explanation_method=explanation.get("explanation_method", "shap"),
            shap_contributors=explanation.get("contributors", []),
            top_positive_contributors=explanation.get("top_positive_contributors", []),
            top_negative_contributors=explanation.get("top_negative_contributors", []),
            input_features_snapshot=record,
            is_current=True,
        )

        db.add(ai_result)
        db.flush()

        # 3. Create compact AI_EVALUATION audit event with authenticated user identity
        audit_payload = {
            "parcel_id": parcel.parcel_id,
            "analysis_id": str(ai_result.id),
            "model_version": MODEL_VERSION,
            "risk_level": prediction["risk_level"],
            "risk_score": prediction["risk_score"],
        }

        actor_name = "AI Engine Service"
        actor_user_id = None
        if current_user:
            role_name = getattr(current_user, "role_name", current_user.role.name if getattr(current_user, "role", None) else "officer")
            actor_name = f"{getattr(current_user, 'full_name', 'System User')} ({role_name})"
            actor_user_id = getattr(current_user, "id", None)

        create_audit_event(
            db=db,
            title=f"AI Risk Evaluation recorded for parcel {parcel.parcel_id}",
            entity_table="ai_analysis_results",
            action_type="AI_EVALUATION",
            payload=audit_payload,
            actor_name=actor_name,
            actor_user_id=actor_user_id,
            entity_id=ai_result.id,
            parcel_id=parcel.id,
            project_id=parcel.project_id,
        )

        db.commit()
        db.refresh(ai_result)
        logger.info(f"Persisted AIAnalysisResult {ai_result.id} for parcel {parcel.parcel_id}")
        return ai_result

    except Exception as exc:
        db.rollback()
        logger.error(f"Failed to persist AI analysis for parcel {parcel.parcel_id}: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database persistence for AI analysis failed: {str(exc)}",
        ) from exc
