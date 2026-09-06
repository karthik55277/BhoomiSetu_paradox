"""Cryptographic Audit Events API routes."""

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.audit import AuditEvent
from app.models.parcels import Parcel
from app.models.projects import Project
from app.schemas_v1 import (
    AuditChainHealthResponse,
    AuditEventResponse,
    AuditPaginatedResponse,
)
from app.services.audit_service import verify_chain_health

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("", response_model=AuditPaginatedResponse)
def get_audit_events(
    action_type: Optional[str] = Query(None, description="Filter by action type"),
    project: Optional[str] = Query(None, description="Filter by project code"),
    parcel: Optional[str] = Query(None, description="Filter by parcel ID"),
    search: Optional[str] = Query(None, description="Search event code, title, or actor name"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> AuditPaginatedResponse:
    """
    Retrieve paginated immutable cryptographic audit trail with SHA-256 chain health verification.
    No POST/PATCH/DELETE endpoints exist for audit records.
    """
    query = (
        db.query(AuditEvent)
        .outerjoin(Parcel, AuditEvent.parcel_id == Parcel.id)
        .outerjoin(Project, AuditEvent.project_id == Project.id)
    )

    if action_type:
        query = query.filter(func.lower(AuditEvent.action_type) == action_type.lower())

    if project:
        query = query.filter(func.lower(Project.code) == project.lower())

    if parcel:
        query = query.filter(func.lower(Parcel.parcel_id) == parcel.lower())

    if search:
        search_pattern = f"%{search.lower()}%"
        query = query.filter(
            or_(
                func.lower(AuditEvent.event_code).like(search_pattern),
                func.lower(AuditEvent.title).like(search_pattern),
                func.lower(AuditEvent.actor_name).like(search_pattern),
            )
        )

    total = query.count()
    offset = (page - 1) * page_size
    events = query.order_by(AuditEvent.created_at.desc(), AuditEvent.id.desc()).offset(offset).limit(page_size).all()

    items = [AuditEventResponse.model_validate(ev) for ev in events]

    # Verify audit hash chain integrity
    health_data = verify_chain_health(db)
    chain_health = AuditChainHealthResponse(
        event_count=health_data["event_count"],
        latest_hash=health_data["latest_hash"],
        chain_valid=health_data["chain_valid"],
    )

    return AuditPaginatedResponse(
        items=items,
        page=page,
        page_size=page_size,
        total=total,
        chain_health=chain_health,
    )
