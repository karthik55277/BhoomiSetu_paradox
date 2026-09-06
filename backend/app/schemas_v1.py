"""Pydantic v2 response and request schemas for BhoomiSetu Phase 2.3 database & GIS APIs."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any, Dict, Generic, List, Optional, TypeVar

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    """Standardized envelope for paginated collections."""

    items: List[T]
    page: int
    page_size: int
    total: int


# --- PROJECTS ---

class ProjectResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    code: str
    name: str
    project_type: str
    district: str
    total_parcels_target: int
    acquisition_progress_pct: float
    status: str
    target_completion_date: Optional[date] = None
    created_at: datetime
    parcel_count: int = 0


class ProjectDetailResponse(ProjectResponse):
    parcels_summary: List[Dict[str, Any]] = []


# --- PARCEL OWNERS ---

class ParcelOwnerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    parcel_id: uuid.UUID
    owner_name: str
    share_percentage: float
    is_primary: bool
    contact_phone: Optional[str] = None
    created_at: datetime


class ParcelOwnerCreate(BaseModel):
    owner_name: str = Field(..., min_length=1, max_length=150)
    share_percentage: float = Field(..., gt=0, le=100.0)
    is_primary: bool = True
    contact_phone: Optional[str] = Field(None, max_length=20)


class ParcelOwnerUpdate(BaseModel):
    owner_name: Optional[str] = Field(None, min_length=1, max_length=150)
    share_percentage: Optional[float] = Field(None, gt=0, le=100.0)
    is_primary: Optional[bool] = None
    contact_phone: Optional[str] = Field(None, max_length=20)


# --- PARCELS ---

class ParcelResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    parcel_id: str
    project_id: uuid.UUID
    project_code: Optional[str] = None
    survey_number: str
    state: str
    district: str
    land_area_ha: float
    land_type: str
    land_use: str
    acquisition_status: str
    baseline_risk_score: float
    suitability_score: float
    estimated_delay_months: float
    land_value_inr: float
    estimated_compensation_inr: float
    created_at: datetime
    updated_at: datetime


class ParcelDetailResponse(ParcelResponse):
    project: Optional[ProjectResponse] = None
    owners: List[ParcelOwnerResponse] = []
    ml_features: Dict[str, Any] = {}
    current_ai_result: Optional[Dict[str, Any]] = None
    disputes: List[DisputeResponse] = []
    compensations: List[CompensationResponse] = []
    documents: List[DocumentResponse] = []
    geometry_summary: Optional[Dict[str, Any]] = None


class AIAnalysisResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    parcel_id: uuid.UUID
    model_version: str
    acquisition_risk_class: int
    risk_level: str
    risk_score: float
    risk_probability: float
    explanation_method: str
    shap_contributors: List[Dict[str, Any]] = []
    top_positive_contributors: List[Dict[str, Any]] = []
    top_negative_contributors: List[Dict[str, Any]] = []
    input_features_snapshot: Dict[str, Any] = {}
    is_current: bool
    created_at: datetime




# --- DISPUTES ---

class DisputeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    dispute_code: str
    parcel_id: uuid.UUID
    parcel_id_str: Optional[str] = None
    project_id: uuid.UUID
    project_code: Optional[str] = None
    assigned_user_id: Optional[uuid.UUID] = None
    assigned_officer_name: str
    category: str
    status: str
    priority: str
    description: str
    filed_date: date
    resolved_at: Optional[datetime] = None
    created_at: datetime


class DisputeUpdate(BaseModel):
    status: Optional[str] = None
    priority: Optional[str] = None
    assigned_officer_name: Optional[str] = None
    assigned_user_id: Optional[uuid.UUID] = None
    description: Optional[str] = None


# --- COMPENSATION ---

class CompensationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    record_code: str
    parcel_id: uuid.UUID
    parcel_id_str: Optional[str] = None
    project_id: uuid.UUID
    project_code: Optional[str] = None
    payee_name: str
    amount_inr: float
    status: str
    approved_by_user_id: Optional[uuid.UUID] = None
    disbursed_at: Optional[datetime] = None
    created_at: datetime


class CompensationUpdate(BaseModel):
    status: Optional[str] = None
    payee_name: Optional[str] = None
    amount_inr: Optional[float] = None
    approved_by_user_id: Optional[uuid.UUID] = None


# --- DOCUMENTS ---

class DocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    document_code: str
    title: str
    parcel_id: Optional[uuid.UUID] = None
    parcel_id_str: Optional[str] = None
    project_id: uuid.UUID
    project_code: Optional[str] = None
    category: str
    storage_path: str
    file_size_bytes: int
    mime_type: str
    verification_status: str
    uploaded_by_user_id: Optional[uuid.UUID] = None
    created_at: datetime


class DocumentCreate(BaseModel):
    document_code: str = Field(..., min_length=1, max_length=50)
    title: str = Field(..., min_length=1, max_length=255)
    parcel_id: Optional[uuid.UUID] = None
    project_id: uuid.UUID
    category: str = Field(..., min_length=1, max_length=100)
    storage_path: str = Field(..., min_length=1, max_length=500)
    file_size_bytes: int = Field(..., gt=0)
    mime_type: str = Field("application/pdf", max_length=100)
    verification_status: str = Field("Pending", max_length=50)


# --- AUDIT ---

class AuditEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    event_code: str
    title: str
    entity_table: str
    entity_id: Optional[uuid.UUID] = None
    parcel_id: Optional[uuid.UUID] = None
    project_id: Optional[uuid.UUID] = None
    actor_user_id: Optional[uuid.UUID] = None
    actor_name: str
    action_type: str
    prev_hash: str
    current_hash: str
    payload: Dict[str, Any]
    ip_address: Optional[str] = None
    created_at: datetime


class AuditChainHealthResponse(BaseModel):
    event_count: int
    latest_hash: str
    chain_valid: bool


class AuditPaginatedResponse(PaginatedResponse[AuditEventResponse]):
    chain_health: AuditChainHealthResponse


# --- GIS GEOJSON ---

class GeoJSONFeature(BaseModel):
    type: str = "Feature"
    geometry: Dict[str, Any]
    properties: Dict[str, Any]


class GeoJSONFeatureCollection(BaseModel):
    type: str = "FeatureCollection"
    features: List[GeoJSONFeature]


# --- AUTH & USER SCHEMAS ---

class LoginRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=1, max_length=255)


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    full_name: str
    role_name: str
    district_jurisdiction: str
    is_active: bool
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


# --- FIELD INSPECTIONS ---

class FieldInspectionCreate(BaseModel):
    client_inspection_id: uuid.UUID
    parcel_id: uuid.UUID
    gps_lat: float = Field(..., ge=-90.0, le=90.0)
    gps_lon: float = Field(..., ge=-180.0, le=180.0)
    verification_status: str = Field("Boundary Verified", max_length=50)
    boundary_intact: bool = True
    encroachment_flag: bool = False
    notes: Optional[str] = None
    photo_document_id: Optional[uuid.UUID] = None
    captured_at: datetime


class FieldInspectionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    client_inspection_id: uuid.UUID
    parcel_id: uuid.UUID
    inspector_id: uuid.UUID
    inspector_name: Optional[str] = None
    gps_lat: float
    gps_lon: float
    distance_to_parcel_m: Optional[float] = None
    verification_status: str
    boundary_intact: bool
    encroachment_flag: bool
    notes: Optional[str] = None
    photo_document_id: Optional[uuid.UUID] = None
    status: str
    captured_at: datetime
    created_at: datetime

