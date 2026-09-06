"""
Field Inspection API Routes (Phase 3.5).
Provides endpoints for recording ground field inspections with GPS bounds validation,
PostGIS distance calculations, client_inspection_id idempotency, SHA-256 audit logs,
and real-time WebSocket notifications to command center dashboards.
"""

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from geoalchemy2 import functions as geofunc
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_role
from app.db.session import get_db
from app.models.documents import DocumentRecord
from app.models.field_inspections import FieldInspection
from app.models.parcels import Parcel, ParcelGeometry
from app.models.users import User
from app.schemas_v1 import FieldInspectionCreate, FieldInspectionResponse, PaginatedResponse
from app.services.audit_service import create_audit_event
from app.services.event_publisher import publish_system_event

router = APIRouter(prefix="/inspections", tags=["inspections"])


@router.get("", response_model=PaginatedResponse[FieldInspectionResponse])
def get_inspections(
    parcel_id: Optional[uuid.UUID] = Query(None, description="Filter by parcel UUID"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PaginatedResponse[FieldInspectionResponse]:
    """Retrieve paginated field inspection records."""
    query = db.query(FieldInspection)

    if parcel_id:
        query = query.filter(FieldInspection.parcel_id == parcel_id)

    total = query.count()
    offset = (page - 1) * page_size
    records = query.order_by(FieldInspection.created_at.desc()).offset(offset).limit(page_size).all()

    items = []
    for r in records:
        res = FieldInspectionResponse.model_validate(r)
        res.inspector_name = r.inspector.full_name if r.inspector else None
        items.append(res)

    return PaginatedResponse[FieldInspectionResponse](
        items=items,
        page=page,
        page_size=page_size,
        total=total,
    )


@router.post("", response_model=FieldInspectionResponse, status_code=status.HTTP_201_CREATED)
def create_field_inspection(
    payload: FieldInspectionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["district_officer", "acquisition_officer", "field_surveyor", "system_admin"])),
) -> FieldInspectionResponse:
    """
    Create ground field inspection record.
    Idempotent: client_inspection_id prevents duplicate submissions during retries.
    Validates GPS latitude/longitude and calculates PostGIS surveyor-to-parcel distance.
    Creates SHA-256 Audit Event & publishes real-time WebSocket event to command center.
    """
    # 1. Idempotency Check via client_inspection_id
    existing = db.query(FieldInspection).filter(FieldInspection.client_inspection_id == payload.client_inspection_id).first()
    if existing:
        res = FieldInspectionResponse.model_validate(existing)
        res.inspector_name = existing.inspector.full_name if existing.inspector else current_user.full_name
        return res

    # 2. Server-side GPS Validation
    if payload.gps_lat < -90.0 or payload.gps_lat > 90.0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid latitude '{payload.gps_lat}'. Must be between -90 and 90 degrees.",
        )
    if payload.gps_lon < -180.0 or payload.gps_lon > 180.0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid longitude '{payload.gps_lon}'. Must be between -180 and 180 degrees.",
        )

    # 3. Validate Parcel exists
    parcel = db.query(Parcel).filter(Parcel.id == payload.parcel_id).first()
    if not parcel:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Parcel with ID '{payload.parcel_id}' not found.",
        )

    # 4. Validate Photo Document if provided
    if payload.photo_document_id:
        photo_doc = db.query(DocumentRecord).filter(DocumentRecord.id == payload.photo_document_id).first()
        if not photo_doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Photo document with ID '{payload.photo_document_id}' not found.",
            )

    # 5. PostGIS Distance Calculation (surveyor GPS point to parcel centroid)
    user_point = geofunc.ST_SetSRID(geofunc.ST_Point(payload.gps_lon, payload.gps_lat), 4326)
    dist_m = None
    geom = db.query(ParcelGeometry).filter(ParcelGeometry.parcel_id == parcel.id).first()
    if geom and geom.centroid is not None:
        dist_expr = geofunc.ST_Distance(
            geofunc.ST_Transform(geom.centroid, 3857),
            geofunc.ST_Transform(user_point, 3857),
        )
        dist_val = db.query(dist_expr).scalar()
        if dist_val is not None:
            dist_m = round(float(dist_val), 1)

    # 6. Insert FieldInspection record
    inspection = FieldInspection(
        client_inspection_id=payload.client_inspection_id,
        parcel_id=parcel.id,
        inspector_id=current_user.id,
        gps_lat=payload.gps_lat,
        gps_lon=payload.gps_lon,
        distance_to_parcel_m=dist_m,
        verification_status=payload.verification_status,
        boundary_intact=payload.boundary_intact,
        encroachment_flag=payload.encroachment_flag,
        notes=payload.notes,
        photo_document_id=payload.photo_document_id,
        status="SUBMITTED",
        captured_at=payload.captured_at,
    )
    db.add(inspection)
    db.commit()
    db.refresh(inspection)

    # 7. Create AuditEvent
    role_name = current_user.role.name if current_user.role else "field_surveyor"
    actor_name = f"{current_user.full_name} ({role_name})"
    create_audit_event(
        db=db,
        title=f"Field inspection submitted for parcel {parcel.parcel_id}",
        entity_table="field_inspections",
        action_type="FIELD_INSPECTION",
        payload={
            "inspection_id": str(inspection.id),
            "client_inspection_id": str(inspection.client_inspection_id),
            "parcel_id": parcel.parcel_id,
            "verification_status": inspection.verification_status,
            "boundary_intact": inspection.boundary_intact,
            "encroachment_flag": inspection.encroachment_flag,
            "distance_to_parcel_m": dist_m,
            "captured_at": inspection.captured_at.isoformat(),
        },
        actor_name=actor_name,
        actor_user_id=current_user.id,
        entity_id=inspection.id,
        parcel_id=parcel.id,
        project_id=parcel.project_id,
    )
    db.commit()

    # 8. Decoupled Real-Time WebSocket Event Publication
    publish_system_event(
        event_type="FIELD_INSPECTION",
        title=f"Field Inspection Submitted ({parcel.parcel_id})",
        message=f"{current_user.full_name} submitted inspection · Status: '{inspection.verification_status}'",
        data={
            "inspection_id": str(inspection.id),
            "parcel_id": parcel.parcel_id,
            "inspector": current_user.full_name,
            "status": inspection.verification_status,
            "distance_m": dist_m,
            "captured_at": inspection.captured_at.isoformat(),
        },
        target_roles=["district_officer", "acquisition_officer", "system_admin"],
        target_jurisdiction=current_user.district_jurisdiction,
    )

    res = FieldInspectionResponse.model_validate(inspection)
    res.inspector_name = current_user.full_name
    return res
