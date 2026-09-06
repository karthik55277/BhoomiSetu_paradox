"""Pydantic schemas for BhoomiSetu AI endpoints."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict


class LandRiskInput(BaseModel):
    """Request payload for land acquisition risk scoring and explanation."""

    model_config = ConfigDict(extra="forbid")

    parcel_id: str | None = None
    state: str
    district: str
    land_type: str
    land_use: str
    project_type: str
    land_area: float
    number_of_owners: float
    ownership_complexity: float
    previous_dispute: float
    previous_objections: float
    land_value: float
    estimated_compensation: float
    environmental_risk: float
    road_accessibility: float
    distance_to_road: float
    stakeholder_count: float
    land_use_conflict: float
    documentation_completeness: float
    historical_acquisition_duration: float


class ContributorEntry(BaseModel):
    feature: str
    impact: float
    direction: Literal["increases_risk", "decreases_risk"]


class RiskPredictionResponse(BaseModel):
    risk_probability: float
    risk_score: float
    risk_level: str
    acquisition_risk: int
    analysis_id: str | None = None
    model_version: str | None = None
    persisted_at: str | None = None
    is_persisted: bool = False



class RiskExplanationResponse(RiskPredictionResponse):
    top_positive_contributors: list[ContributorEntry]
    top_negative_contributors: list[ContributorEntry]
    contributors: list[ContributorEntry]
    explanation_method: str
    synthetic_data_warning: str
    decision_support_notice: str
