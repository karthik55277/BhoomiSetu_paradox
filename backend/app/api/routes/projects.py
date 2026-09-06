"""Projects API routes."""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.parcels import Parcel
from app.models.projects import Project
from app.schemas_v1 import ProjectDetailResponse, ProjectResponse

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=List[ProjectResponse])
def get_projects(
    district: Optional[str] = Query(None, description="Filter projects by district"),
    status_filter: Optional[str] = Query(None, alias="status", description="Filter projects by status"),
    db: Session = Depends(get_db),
) -> List[ProjectResponse]:
    """Retrieve all infrastructure acquisition projects with parcel counts."""
    query = db.query(Project)

    if district:
        query = query.filter(func.lower(Project.district) == district.lower())
    if status_filter:
        query = query.filter(func.lower(Project.status) == status_filter.lower())

    projects = query.order_by(Project.created_at.asc()).all()

    response_items = []
    for proj in projects:
        parcel_count = db.query(Parcel).filter(Parcel.project_id == proj.id).count()
        item = ProjectResponse.model_validate(proj)
        item.parcel_count = parcel_count
        response_items.append(item)

    return response_items


@router.get("/{code}", response_model=ProjectDetailResponse)
def get_project_by_code(
    code: str,
    db: Session = Depends(get_db),
) -> ProjectDetailResponse:
    """Retrieve detailed project information, parcel count, and parcel summaries by project code."""
    project = db.query(Project).filter(func.lower(Project.code) == code.lower()).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project with code '{code}' not found.",
        )

    parcels = db.query(Parcel).filter(Parcel.project_id == project.id).all()
    parcel_summaries = [
        {
            "parcel_id": p.parcel_id,
            "survey_number": p.survey_number,
            "land_area_ha": float(p.land_area_ha),
            "acquisition_status": p.acquisition_status,
            "baseline_risk_score": float(p.baseline_risk_score),
        }
        for p in parcels
    ]

    res = ProjectDetailResponse.model_validate(project)
    res.parcel_count = len(parcels)
    res.parcels_summary = parcel_summaries
    return res
