"""GIS PostGIS GeoJSON API routes."""

import json
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from geoalchemy2 import functions as geofunc
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.ai_analysis import AIAnalysisResult
from app.models.parcels import Parcel, ParcelGeometry
from app.models.projects import Project
from app.models.users import User
from app.schemas_v1 import GeoJSONFeature, GeoJSONFeatureCollection

router = APIRouter(prefix="/gis", tags=["gis"])


@router.get("/parcels", response_model=GeoJSONFeatureCollection)
def get_gis_parcels(
    bbox: Optional[str] = Query(None, description="Bounding box 'min_lon,min_lat,max_lon,max_lat' (e.g. '85.10,25.55,85.15,25.65')"),
    district: Optional[str] = Query(None, description="Filter by district"),
    project: Optional[str] = Query(None, description="Filter by project code"),
    acquisition_status: Optional[str] = Query(None, description="Filter by acquisition status"),
    risk_level: Optional[str] = Query(None, description="Filter by AI risk level (if available)"),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> GeoJSONFeatureCollection:
    """
    Retrieve spatial cadastral parcels as a GeoJSON FeatureCollection using PostGIS spatial indexing.
    Supports ST_MakeEnvelope spatial BBOX query and handles parcels gracefully when AI results are not yet present.
    """
    query = (
        db.query(
            Parcel,
            ParcelGeometry,
            geofunc.ST_AsGeoJSON(ParcelGeometry.boundary).label("geojson"),
            AIAnalysisResult,
        )
        .join(ParcelGeometry, Parcel.id == ParcelGeometry.parcel_id)
        .join(Project, Parcel.project_id == Project.id)
        .outerjoin(AIAnalysisResult, Parcel.id == AIAnalysisResult.parcel_id)
    )

    # 1. PostGIS BBOX Filter using ST_MakeEnvelope and ST_Intersects
    if bbox:
        try:
            parts = [float(x.strip()) for x in bbox.split(",")]
            if len(parts) != 4:
                raise ValueError("bbox must contain exactly 4 comma-separated float numbers")
            min_lon, min_lat, max_lon, max_lat = parts
            if min_lon > max_lon or min_lat > max_lat:
                raise ValueError("min coordinates cannot be greater than max coordinates")

            # PostGIS envelope geometry query
            envelope = geofunc.ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326)
            query = query.filter(geofunc.ST_Intersects(ParcelGeometry.boundary, envelope))
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid bbox parameter: {str(exc)}",
            ) from exc

    # 2. Attribute Filters
    if district:
        query = query.filter(func.lower(Parcel.district) == district.lower())

    if project:
        query = query.filter(func.lower(Project.code) == project.lower())

    if acquisition_status:
        query = query.filter(func.lower(Parcel.acquisition_status) == acquisition_status.lower())

    # 3. Optional risk_level filter (uses AI result if present, gracefully returns empty if no AI result matches)
    if risk_level:
        query = query.filter(func.lower(AIAnalysisResult.risk_level) == risk_level.lower())

    results = query.limit(limit).all()

    features: List[GeoJSONFeature] = []
    for parcel, geom, geojson_str, ai_res in results:
        geom_dict = json.loads(geojson_str) if geojson_str else {}

        # Properties
        risk_lvl = ai_res.risk_level if ai_res else None
        risk_scr = float(ai_res.risk_score) if ai_res else float(parcel.baseline_risk_score)

        properties = {
            "parcel_id": parcel.parcel_id,
            "survey_number": parcel.survey_number,
            "district": parcel.district,
            "project": parcel.project.code if parcel.project else None,
            "acquisition_status": parcel.acquisition_status,
            "land_area_ha": float(parcel.land_area_ha),
            "land_type": parcel.land_type,
            "land_use": parcel.land_use,
            "baseline_risk_score": float(parcel.baseline_risk_score),
            "risk_level": risk_lvl,
            "risk_score": risk_scr,
            "ui_x": float(geom.map_ui_x) if geom and geom.map_ui_x is not None else None,
            "ui_y": float(geom.map_ui_y) if geom and geom.map_ui_y is not None else None,
        }

        features.append(
            GeoJSONFeature(
                type="Feature",
                geometry=geom_dict,
                properties=properties,
            )
        )

    return GeoJSONFeatureCollection(
        type="FeatureCollection",
        features=features,
    )
