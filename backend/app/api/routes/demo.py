import os
from typing import Dict, Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.api.deps import get_current_user, require_role
from app.db.session import get_db
from app.models.users import User
from app.models.audit import AuditEvent
from app.models.field_inspections import FieldInspection
from app.models.disputes import Dispute
from app.models.compensation import CompensationRecord
from app.models.ai_analysis import AIAnalysisResult
from app.services.audit_service import create_audit_event
from app.services.event_publisher import publish_system_event

demo_router = APIRouter(prefix="/demo", tags=["demo"])

@demo_router.post("/reset")
def reset_demo_environment(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["system_admin"])),
) -> Dict[str, Any]:
    """
    Deterministic Hackathon Demo Reset Endpoint.
    Restores demo environment to clean baseline seed state for predictable hackathon presentations.
    Requires system_admin role and DEMO_MODE environment setting to be enabled.
    """
    demo_mode_env = os.getenv("DEMO_MODE", "true").lower()
    if demo_mode_env not in ("true", "1", "yes"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Demo reset endpoint is disabled because DEMO_MODE is set to false.",
        )

    try:
        # 1. Clean up demo-created field inspections
        db.query(FieldInspection).delete(synchronize_session=False)

        # 2. Reset disputes back to initial baseline
        db.execute(text("UPDATE disputes SET status = 'Under Investigation' WHERE status != 'Under Investigation'"))

        # 3. Reset compensation records back to initial baseline
        db.execute(text("UPDATE compensation_records SET status = 'Under Review' WHERE status != 'Under Review'"))

        # 4. Record Audit Event for Reset action
        role_title = getattr(current_user, "role_name", "system_admin")
        actor_name = f"{getattr(current_user, 'full_name', 'System Admin')} ({role_title})"
        create_audit_event(
            db=db,
            title="Demo Data Reset to baseline state",
            entity_table="SYSTEM",
            action_type="DEMO_RESET",
            payload={"environment": "demo", "status": "reset_to_seed_baseline"},
            actor_name=actor_name,
            actor_user_id=getattr(current_user, "id", None),
        )

        db.commit()

        # 5. Broadcast real-time WebSocket event so open dashboards refresh instantly
        user_name = getattr(current_user, "full_name", "System Admin")
        user_jurisdiction = getattr(current_user, "jurisdiction", None)
        publish_system_event(
            event_type="DEMO_RESET",
            title="Demo Data Reset",
            message=f"BhoomiSetu demo environment reset to baseline state by {user_name}.",
            data={
                "message": "Demo data reset to baseline seed state.",
                "reset_by": user_name,
            },
            target_roles=["district_officer", "acquisition_officer", "legal_officer", "auditor", "system_admin", "field_surveyor"],
            target_jurisdiction=user_jurisdiction,
        )

        return {
            "status": "success",
            "message": "BhoomiSetu demo environment reset to clean baseline state.",
            "reset_by": user_name,
        }

    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to reset demo environment: {str(exc)}",
        ) from exc

