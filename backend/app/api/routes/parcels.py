"""Parcels API routes."""

import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from geoalchemy2.shape import to_shape
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.ai_analysis import AIAnalysisResult
from app.models.compensation import CompensationRecord
from app.models.disputes import Dispute
from app.models.documents import DocumentRecord
from app.models.parcels import Parcel, ParcelGeometry, ParcelOwner
from app.models.projects import Project
from app.schemas_v1 import (
    AIAnalysisResponse,
    CompensationResponse,
    DisputeResponse,
    DocumentResponse,
    PaginatedResponse,
    ParcelDetailResponse,
    ParcelOwnerResponse,
    ParcelResponse,
    ProjectResponse,
)

router = APIRouter(prefix="/parcels", tags=["parcels"])




@router.get("", response_model=PaginatedResponse[ParcelResponse])
def get_parcels(
    project: Optional[str] = Query(None, description="Filter by project code or project ID"),
    district: Optional[str] = Query(None, description="Filter by district"),
    acquisition_status: Optional[str] = Query(None, description="Filter by acquisition status"),
    risk_level: Optional[str] = Query(None, description="Filter by AI risk level (if available)"),
    search: Optional[str] = Query(None, description="Search parcel ID or survey number"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> PaginatedResponse[ParcelResponse]:
    """Retrieve paginated land parcels with search and filters."""
    query = db.query(Parcel).join(Project, Parcel.project_id == Project.id)

    if project:
        query = query.filter(
            or_(
                func.lower(Project.code) == project.lower(),
                Parcel.project_id == (uuid.UUID(project) if is_valid_uuid(project) else None),
            )
        )

    if district:
        query = query.filter(func.lower(Parcel.district) == district.lower())

    if acquisition_status:
        query = query.filter(func.lower(Parcel.acquisition_status) == acquisition_status.lower())

    if risk_level:
        # Join with AI analysis result if available
        query = query.outerjoin(AIAnalysisResult, Parcel.id == AIAnalysisResult.parcel_id).filter(
            func.lower(AIAnalysisResult.risk_level) == risk_level.lower()
        )

    if search:
        search_pattern = f"%{search.lower()}%"
        query = query.filter(
            or_(
                func.lower(Parcel.parcel_id).like(search_pattern),
                func.lower(Parcel.survey_number).like(search_pattern),
            )
        )

    total = query.count()
    offset = (page - 1) * page_size
    parcels = query.order_by(Parcel.parcel_id.asc()).offset(offset).limit(page_size).all()

    items = []
    for p in parcels:
        res = ParcelResponse.model_validate(p)
        res.project_code = p.project.code if p.project else None
        items.append(res)

    return PaginatedResponse[ParcelResponse](
        items=items,
        page=page,
        page_size=page_size,
        total=total,
    )


@router.get("/{parcel_id_or_code}", response_model=ParcelDetailResponse)
def get_parcel_detail(
    parcel_id_or_code: str,
    db: Session = Depends(get_db),
) -> ParcelDetailResponse:
    """Retrieve complete parcel profile with project, ownership, 19 ML features, disputes, compensation, and geometry summary."""
    query = db.query(Parcel).filter(
        or_(
            func.lower(Parcel.parcel_id) == parcel_id_or_code.lower(),
            Parcel.id == (uuid.UUID(parcel_id_or_code) if is_valid_uuid(parcel_id_or_code) else None),
        )
    )
    parcel = query.first()

    if not parcel:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Parcel '{parcel_id_or_code}' not found.",
        )

    # 1. Project
    project_res = ProjectResponse.model_validate(parcel.project) if parcel.project else None
    if project_res and parcel.project:
        project_res.parcel_count = db.query(Parcel).filter(Parcel.project_id == parcel.project.id).count()

    # 2. Owners
    owners_res = [ParcelOwnerResponse.model_validate(o) for o in parcel.owners]

    # 3. 19 ML Features exact mapping
    ml_features = {
        "state": parcel.state,
        "district": parcel.district,
        "land_type": parcel.land_type,
        "land_use": parcel.land_use,
        "project_type": parcel.project.project_type if parcel.project else "Road infrastructure",
        "land_area": float(parcel.land_area_ha),
        "land_value": float(parcel.land_value_inr),
        "estimated_compensation": float(parcel.estimated_compensation_inr),
        "number_of_owners": parcel.number_of_owners,
        "ownership_complexity": float(parcel.ownership_complexity_score),
        "previous_dispute": parcel.previous_dispute_flag,
        "previous_objections": parcel.previous_objections_count,
        "environmental_risk": float(parcel.environmental_risk_score),
        "road_accessibility": float(parcel.road_accessibility_score),
        "distance_to_road": float(parcel.distance_to_road_km),
        "stakeholder_count": parcel.stakeholder_count,
        "land_use_conflict": float(parcel.land_use_conflict_score),
        "documentation_completeness": float(parcel.documentation_completeness_score),
        "historical_acquisition_duration": float(parcel.historical_acquisition_duration_months),
    }

    # 4. Current AI Result
    latest_ai = (
        db.query(AIAnalysisResult)
        .filter(AIAnalysisResult.parcel_id == parcel.id, AIAnalysisResult.is_current.is_(True))
        .order_by(AIAnalysisResult.created_at.desc(), AIAnalysisResult.id.desc())
        .first()
    )
    if not latest_ai:
        latest_ai = (
            db.query(AIAnalysisResult)
            .filter(AIAnalysisResult.parcel_id == parcel.id)
            .order_by(AIAnalysisResult.created_at.desc(), AIAnalysisResult.id.desc())
            .first()
        )

    current_ai = None
    if latest_ai:
        current_ai = {
            "id": str(latest_ai.id),
            "model_version": latest_ai.model_version,
            "risk_score": float(latest_ai.risk_score),
            "risk_probability": float(latest_ai.risk_probability),
            "risk_level": latest_ai.risk_level,
            "acquisition_risk": latest_ai.acquisition_risk_class,
            "top_positive_contributors": latest_ai.top_positive_contributors,
            "top_negative_contributors": latest_ai.top_negative_contributors,
            "is_current": latest_ai.is_current,
            "created_at": latest_ai.created_at.isoformat() if latest_ai.created_at else None,
        }


    # 5. Disputes
    disputes = [DisputeResponse.model_validate(d) for d in parcel.disputes]

    # 6. Compensations
    compensations = [CompensationResponse.model_validate(c) for c in parcel.compensations]

    # 7. Documents
    documents = [DocumentResponse.model_validate(doc) for doc in parcel.documents]


    # 8. Geometry Summary
    geom_summary = None
    if parcel.geometry:
        geom_obj = parcel.geometry
        centroid_coords = None
        if geom_obj.centroid:
            try:
                shape_point = to_shape(geom_obj.centroid)
                centroid_coords = [shape_point.x, shape_point.y]
            except Exception:
                centroid_coords = None

        geom_summary = {
            "srid": 4326,
            "type": "Polygon",
            "centroid": centroid_coords,
            "map_ui_x": float(geom_obj.map_ui_x) if geom_obj.map_ui_x is not None else None,
            "map_ui_y": float(geom_obj.map_ui_y) if geom_obj.map_ui_y is not None else None,
        }

    res = ParcelDetailResponse.model_validate(parcel)
    res.project_code = parcel.project.code if parcel.project else None
    res.project = project_res
    res.owners = owners_res
    res.ml_features = ml_features
    res.current_ai_result = current_ai
    res.disputes = disputes
    res.compensations = compensations
    res.documents = documents
    res.geometry_summary = geom_summary

    return res


@router.get("/{parcel_id_or_code}/ai-history", response_model=List[AIAnalysisResponse])
def get_parcel_ai_history(
    parcel_id_or_code: str,
    db: Session = Depends(get_db),
) -> List[AIAnalysisResponse]:
    """Retrieve chronological AI analysis history for a land parcel ordered newest first."""
    query = db.query(Parcel).filter(
        or_(
            func.lower(Parcel.parcel_id) == parcel_id_or_code.lower(),
            Parcel.id == (uuid.UUID(parcel_id_or_code) if is_valid_uuid(parcel_id_or_code) else None),
        )
    )
    parcel = query.first()

    if not parcel:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Parcel '{parcel_id_or_code}' not found.",
        )

    history = (
        db.query(AIAnalysisResult)
        .filter(AIAnalysisResult.parcel_id == parcel.id)
        .order_by(AIAnalysisResult.created_at.desc(), AIAnalysisResult.id.desc())
        .all()
    )

    return [AIAnalysisResponse.model_validate(h) for h in history]


def is_valid_uuid(val: str) -> bool:
    try:
        uuid.UUID(val)
        return True
    except ValueError:
        return False

