"""FastAPI application for BhoomiSetu AI risk scoring, database management, and GIS endpoints.

Integrates:
- Phase 1 ML risk scoring & SHAP explanation endpoints
- Phase 2.3 PostgreSQL database & PostGIS spatial APIs
"""

from __future__ import annotations

from pathlib import Path
from typing import Dict, Any

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api import api_v1_router
from app.db.session import engine, get_db
from app.schemas import LandRiskInput, RiskExplanationResponse, RiskPredictionResponse
from app.services.ai_persistence_service import persist_ai_analysis, resolve_parcel
from app.services.ml_service import build_record, explain_single_record, get_model_pipeline, predict_single_record

BASE_DIR = Path(__file__).resolve().parents[2]
MODEL_PATH = BASE_DIR / "ml" / "models" / "acquisition_risk_model.pkl"

app = FastAPI(
    title="BhoomiSetu API",
    description="Real-Time National Land Acquisition & Management System API with ML Risk Scoring & PostGIS GIS Support",
    version="0.2.4",
)

# Allow local frontend dev server to call API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Database & GIS API v1 routes
app.include_router(api_v1_router)


@app.on_event("startup")
def startup_event() -> None:
    """Validate that the saved model can be loaded once when the app starts."""
    try:
        get_model_pipeline()
    except FileNotFoundError as exc:
        raise RuntimeError(f"Missing ML artifact: {MODEL_PATH}") from exc


@app.get("/health")
def health() -> Dict[str, Any]:
    """Extended service health check reporting service status, ML model, and optional database connectivity."""
    db_status = "disconnected"
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
            db_status = "connected"
    except Exception:
        db_status = "unavailable"

    return {
        "status": "ok",
        "service": "bhoomisetu-api",
        "model": "acquisition-risk-0.1.0",
        "database": db_status,
    }


from app.api.deps import require_role
from app.models.users import User

@app.post("/api/v1/ai/risk/predict", response_model=RiskPredictionResponse, tags=["ai"])
def predict_risk(
    payload: LandRiskInput,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["district_officer", "acquisition_officer", "legal_officer", "system_admin"])),
) -> dict[str, object]:
    """Run the trained model pipeline, return prediction metadata, and persist to DB if parcel_id is provided."""
    try:
        record = build_record(payload.model_dump())
        result = predict_single_record(record)

        if payload.parcel_id:
            parcel = resolve_parcel(db, payload.parcel_id)
            ai_result = persist_ai_analysis(db, parcel, record, result, current_user=current_user)
            result["analysis_id"] = str(ai_result.id)
            result["model_version"] = ai_result.model_version
            result["persisted_at"] = ai_result.created_at.isoformat() if ai_result.created_at else None
            result["is_persisted"] = True
        else:
            result["is_persisted"] = False

        return result
    except HTTPException:
        raise
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Trained model artifact is missing.",
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@app.post("/api/v1/ai/risk/explain", response_model=RiskExplanationResponse, tags=["ai"])
def explain_risk(
    payload: LandRiskInput,
    limit: int = 5,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["district_officer", "acquisition_officer", "legal_officer", "system_admin"])),
) -> dict[str, object]:
    """Run the trained model, generate SHAP explanation, and persist to DB if parcel_id is provided."""
    try:
        record = build_record(payload.model_dump())
        result = explain_single_record(record, limit=limit)

        if payload.parcel_id:
            parcel = resolve_parcel(db, payload.parcel_id)
            ai_result = persist_ai_analysis(db, parcel, record, result, explanation=result, current_user=current_user)
            result["analysis_id"] = str(ai_result.id)
            result["model_version"] = ai_result.model_version
            result["persisted_at"] = ai_result.created_at.isoformat() if ai_result.created_at else None
            result["is_persisted"] = True
        else:
            result["is_persisted"] = False

        return result
    except HTTPException:
        raise
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Trained model artifact is missing.",
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

