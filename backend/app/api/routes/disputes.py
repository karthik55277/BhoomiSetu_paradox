"""Disputes API routes."""

import datetime
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_role
from app.db.session import get_db
from app.models.disputes import Dispute
from app.models.parcels import Parcel
from app.models.projects import Project
from app.models.users import User
from app.schemas_v1 import DisputeResponse, DisputeUpdate, PaginatedResponse
from app.services.audit_service import create_audit_event

router = APIRouter(prefix="/disputes", tags=["disputes"])


@router.get("", response_model=PaginatedResponse[DisputeResponse])
def get_disputes(
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by dispute status"),
    priority: Optional[str] = Query(None, description="Filter by priority (HIGH, MEDIUM, LOW)"),
    category: Optional[str] = Query(None, description="Filter by category"),
    project: Optional[str] = Query(None, description="Filter by project code"),
    parcel: Optional[str] = Query(None, description="Filter by parcel ID"),
    search: Optional[str] = Query(None, description="Search dispute code or description"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PaginatedResponse[DisputeResponse]:
    """Retrieve paginated legal disputes and land objections with filters."""
    query = (
        db.query(Dispute)
        .join(Parcel, Dispute.parcel_id == Parcel.id)
        .join(Project, Dispute.project_id == Project.id)
    )

    if status_filter:
        query = query.filter(func.lower(Dispute.status) == status_filter.lower())

    if priority:
        query = query.filter(func.lower(Dispute.priority) == priority.lower())

    if category:
        query = query.filter(func.lower(Dispute.category) == category.lower())

    if project:
        query = query.filter(func.lower(Project.code) == project.lower())

    if parcel:
        query = query.filter(func.lower(Parcel.parcel_id) == parcel.lower())

    if search:
        search_pattern = f"%{search.lower()}%"
        query = query.filter(
            or_(
                func.lower(Dispute.dispute_code).like(search_pattern),
                func.lower(Dispute.description).like(search_pattern),
                func.lower(Dispute.assigned_officer_name).like(search_pattern),
            )
        )

    total = query.count()
    offset = (page - 1) * page_size
    disputes = query.order_by(Dispute.filed_date.desc(), Dispute.created_at.desc()).offset(offset).limit(page_size).all()

    items = []
    for d in disputes:
        res = DisputeResponse.model_validate(d)
        res.parcel_id_str = d.parcel.parcel_id if d.parcel else None
        res.project_code = d.project.code if d.project else None
        items.append(res)

    return PaginatedResponse[DisputeResponse](
        items=items,
        page=page,
        page_size=page_size,
        total=total,
    )


@router.patch("/{id}", response_model=DisputeResponse)
def update_dispute(
    id: uuid.UUID,
    payload: DisputeUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["district_officer", "legal_officer", "system_admin"])),
) -> DisputeResponse:
    """Update dispute status or priority safely. Automatically records a cryptographic audit event."""
    dispute = db.query(Dispute).filter(Dispute.id == id).first()
    if not dispute:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Dispute with ID '{id}' not found.",
        )

    old_status = dispute.status
    changes = {}

    if payload.status is not None and payload.status != old_status:
        dispute.status = payload.status
        changes["previous_status"] = old_status
        changes["new_status"] = payload.status
        if payload.status.lower() == "resolved":
            dispute.resolved_at = datetime.datetime.now(datetime.timezone.utc)
            changes["resolved_at"] = dispute.resolved_at.isoformat()

    if payload.priority is not None:
        dispute.priority = payload.priority
        changes["priority"] = payload.priority

    if payload.assigned_officer_name is not None:
        dispute.assigned_officer_name = payload.assigned_officer_name
        changes["assigned_officer_name"] = payload.assigned_officer_name

    if payload.description is not None:
        dispute.description = payload.description
        changes["description"] = payload.description

    db.commit()
    db.refresh(dispute)

    # Automatically trigger cryptographic AuditEvent if changes occurred
    if changes:
        role_name = current_user.role.name if current_user.role else "officer"
        actor_name = f"{current_user.full_name} ({role_name})"
        create_audit_event(
            db=db,
            title=f"Dispute {dispute.dispute_code} updated to {dispute.status}",
            entity_table="disputes",
            action_type="DISPUTE_UPDATE",
            payload={
                "dispute_code": dispute.dispute_code,
                "parcel_id": dispute.parcel.parcel_id if dispute.parcel else str(dispute.parcel_id),
                "changes": changes,
            },
            actor_name=actor_name,
            actor_user_id=current_user.id,
            entity_id=dispute.id,
            parcel_id=dispute.parcel_id,
            project_id=dispute.project_id,
        )
        db.commit()

    res = DisputeResponse.model_validate(dispute)
    res.parcel_id_str = dispute.parcel.parcel_id if dispute.parcel else None
    res.project_code = dispute.project.code if dispute.project else None
    return res
