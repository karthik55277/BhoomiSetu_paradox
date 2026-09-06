"""Compensation Records API routes."""

import datetime
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_role
from app.db.session import get_db
from app.models.compensation import CompensationRecord
from app.models.parcels import Parcel
from app.models.projects import Project
from app.models.users import User
from app.schemas_v1 import CompensationResponse, CompensationUpdate, PaginatedResponse
from app.services.audit_service import create_audit_event
from app.services.event_publisher import publish_system_event


router = APIRouter(prefix="/compensation", tags=["compensation"])

ALLOWED_STATUSES = ["Pending approval", "Processing", "Ready", "Released"]


@router.get("", response_model=PaginatedResponse[CompensationResponse])
def get_compensations(
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by compensation status"),
    project: Optional[str] = Query(None, description="Filter by project code"),
    parcel: Optional[str] = Query(None, description="Filter by parcel ID"),
    search: Optional[str] = Query(None, description="Search record code or payee name"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PaginatedResponse[CompensationResponse]:
    """Retrieve paginated financial compensation records with filters."""
    query = (
        db.query(CompensationRecord)
        .join(Parcel, CompensationRecord.parcel_id == Parcel.id)
        .join(Project, CompensationRecord.project_id == Project.id)
    )

    if status_filter:
        query = query.filter(func.lower(CompensationRecord.status) == status_filter.lower())

    if project:
        query = query.filter(func.lower(Project.code) == project.lower())

    if parcel:
        query = query.filter(func.lower(Parcel.parcel_id) == parcel.lower())

    if search:
        search_pattern = f"%{search.lower()}%"
        query = query.filter(
            or_(
                func.lower(CompensationRecord.record_code).like(search_pattern),
                func.lower(CompensationRecord.payee_name).like(search_pattern),
            )
        )

    total = query.count()
    offset = (page - 1) * page_size
    records = query.order_by(CompensationRecord.created_at.desc()).offset(offset).limit(page_size).all()

    items = []
    for r in records:
        res = CompensationResponse.model_validate(r)
        res.parcel_id_str = r.parcel.parcel_id if r.parcel else None
        res.project_code = r.project.code if r.project else None
        items.append(res)

    return PaginatedResponse[CompensationResponse](
        items=items,
        page=page,
        page_size=page_size,
        total=total,
    )


@router.patch("/{id}", response_model=CompensationResponse)
def update_compensation(
    id: uuid.UUID,
    payload: CompensationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["district_officer", "acquisition_officer", "system_admin"])),
) -> CompensationResponse:
    """Update compensation disbursement record status (Pending approval -> Processing -> Ready -> Released). Creates audit event."""
    comp = db.query(CompensationRecord).filter(CompensationRecord.id == id).first()
    if not comp:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Compensation record with ID '{id}' not found.",
        )

    old_status = comp.status
    changes = {}

    if payload.status is not None and payload.status != old_status:
        # Validate status state transitions
        if payload.status not in ALLOWED_STATUSES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid status '{payload.status}'. Allowed statuses: {', '.join(ALLOWED_STATUSES)}",
            )
        comp.status = payload.status
        changes["previous_status"] = old_status
        changes["new_status"] = payload.status
        if payload.status == "Released":
            comp.disbursed_at = datetime.datetime.now(datetime.timezone.utc)
            changes["disbursed_at"] = comp.disbursed_at.isoformat()

    if payload.payee_name is not None:
        comp.payee_name = payload.payee_name
        changes["payee_name"] = payload.payee_name

    if payload.amount_inr is not None:
        comp.amount_inr = payload.amount_inr
        changes["amount_inr"] = payload.amount_inr

    if payload.approved_by_user_id is not None:
        comp.approved_by_user_id = payload.approved_by_user_id

    db.commit()
    db.refresh(comp)

    # Automatically trigger AuditEvent
    if changes:
        role_name = current_user.role.name if current_user.role else "officer"
        actor_name = f"{current_user.full_name} ({role_name})"
        create_audit_event(
            db=db,
            title=f"Compensation {comp.record_code} status updated to {comp.status}",
            entity_table="compensation_records",
            action_type="COMPENSATION_UPDATE",
            payload={
                "record_code": comp.record_code,
                "payee": comp.payee_name,
                "amount_inr": float(comp.amount_inr),
                "changes": changes,
            },
            actor_name=actor_name,
            actor_user_id=current_user.id,
            entity_id=comp.id,
            parcel_id=comp.parcel_id,
            project_id=comp.project_id,
        )
        db.commit()

        publish_system_event(
            event_type="COMPENSATION_UPDATE",
            title=f"Compensation {comp.record_code} Updated",
            message=f"Compensation status updated to '{comp.status}'",
            data={
                "compensation_id": str(comp.id),
                "record_code": comp.record_code,
                "parcel_id": comp.parcel.parcel_id if comp.parcel else str(comp.parcel_id),
                "status": comp.status,
                "amount_inr": float(comp.amount_inr),
            },
            target_roles=["district_officer", "acquisition_officer", "system_admin"],
        )


    res = CompensationResponse.model_validate(comp)
    res.parcel_id_str = comp.parcel.parcel_id if comp.parcel else None
    res.project_code = comp.project.code if comp.project else None
    return res
