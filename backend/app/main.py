"""FastAPI application for BhoomiSetu AI risk scoring and explanation endpoints.

This is the first backend phase. It does not touch the existing ML training code or model
artifacts, and it reuses the trained sklearn pipeline saved in ml/models/acquisition_risk_model.pkl.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

from app.schemas import LandRiskInput, RiskExplanationResponse, RiskPredictionResponse
from app.services.ml_service import explain_single_record, get_model_pipeline, predict_single_record, build_record

BASE_DIR = Path(__file__).resolve().parents[2]
MODEL_PATH = BASE_DIR / "ml" / "models" / "acquisition_risk_model.pkl"

app = FastAPI(title="BhoomiSetu API", version="0.1.0")

# Allow the local frontend dev server to call the API during the MVP phase.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup_event() -> None:
    """Validate that the saved model can be loaded once when the app starts."""
    try:
        get_model_pipeline()
    except FileNotFoundError as exc:
        raise RuntimeError(f"Missing ML artifact: {MODEL_PATH}") from exc


@app.get("/health")
def health() -> dict[str, str]:
    """Simple service health check for deployment and smoke testing."""
    return {
        "status": "ok",
        "service": "bhoomisetu-api",
        "model": "acquisition-risk-0.1.0",
    }


@app.post("/api/v1/ai/risk/predict", response_model=RiskPredictionResponse)
def predict_risk(payload: LandRiskInput) -> dict[str, object]:
    """Run the trained model pipeline and return risk prediction metadata."""
    try:
        record = build_record(payload.model_dump())
        return predict_single_record(record)
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


@app.post("/api/v1/ai/risk/explain", response_model=RiskExplanationResponse)
def explain_risk(payload: LandRiskInput, limit: int = 5) -> dict[str, object]:
    """Run the trained model and generate the same SHAP explanation contract as the prototype."""
    try:
        record = build_record(payload.model_dump())
        return explain_single_record(record, limit=limit)
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
