"""Phase 2.4 ML Persistence Integration Tests.

Validates ML prediction and SHAP explanation persistence into PostgreSQL,
is_current rotation, 19-feature snapshotting, AI history endpoint, parcel detail integration,
and audit trail verification against live database.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.db.session import SessionLocal
from app.main import app
from app.models.ai_analysis import AIAnalysisResult
from app.models.audit import AuditEvent
from app.models.parcels import Parcel
from app.services.audit_service import verify_chain_health

client = TestClient(app)

SAMPLE_19_FEATURES = {
    "state": "Bihar",
    "district": "Patna",
    "land_type": "Agricultural",
    "land_use": "Multi-crop",
    "project_type": "Road infrastructure",
    "land_area": 4.82,
    "number_of_owners": 6.0,
    "ownership_complexity": 4.2,
    "previous_dispute": 1.0,
    "previous_objections": 2.0,
    "land_value": 18600000.0,
    "estimated_compensation": 17856000.0,
    "environmental_risk": 8.4,
    "road_accessibility": 2.1,
    "distance_to_road": 3.6,
    "stakeholder_count": 6.0,
    "land_use_conflict": 8.6,
    "documentation_completeness": 5.1,
    "historical_acquisition_duration": 7.2,
}


def is_db_available() -> bool:
    try:
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()
        return True
    except Exception:
        return False


pytestmark = pytest.mark.skipif(not is_db_available(), reason="PostgreSQL database offline")


def test_predict_without_parcel_id_non_persistent():
    """Verify prediction without parcel_id works without DB persistence (backwards compatibility)."""
    response = client.post("/api/v1/ai/risk/predict", json=SAMPLE_19_FEATURES)
    assert response.status_code == 200
    data = response.json()

    assert "risk_probability" in data
    assert "risk_score" in data
    assert "risk_level" in data
    assert "acquisition_risk" in data
    assert data["is_persisted"] is False
    assert data["analysis_id"] is None


def test_explain_without_parcel_id_non_persistent():
    """Verify explanation without parcel_id works without DB persistence."""
    response = client.post("/api/v1/ai/risk/explain", json=SAMPLE_19_FEATURES)
    assert response.status_code == 200
    data = response.json()

    assert "top_positive_contributors" in data
    assert "top_negative_contributors" in data
    assert "contributors" in data
    assert "explanation_method" in data
    assert data["is_persisted"] is False


def test_predict_with_parcel_id_persists_db():
    """Verify prediction with parcel_id persists AI result in PostgreSQL and creates audit event."""
    payload = {**SAMPLE_19_FEATURES, "parcel_id": "BR-042-0187"}
    response = client.post("/api/v1/ai/risk/predict", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["is_persisted"] is True
    assert data["analysis_id"] is not None
    assert data["model_version"] == "acquisition-risk-0.1.0"
    assert data["persisted_at"] is not None

    # Verify directly in PostgreSQL
    db = SessionLocal()
    ai_rec = db.query(AIAnalysisResult).filter(AIAnalysisResult.id == data["analysis_id"]).first()
    assert ai_rec is not None
    assert ai_rec.is_current is True
    assert ai_rec.model_version == "acquisition-risk-0.1.0"
    assert float(ai_rec.risk_score) == data["risk_score"]
    assert ai_rec.risk_level == data["risk_level"]

    # Verify 19-feature snapshot
    snapshot = ai_rec.input_features_snapshot
    for k in SAMPLE_19_FEATURES:
        assert snapshot[k] == SAMPLE_19_FEATURES[k]

    db.close()


def test_explain_with_parcel_id_persists_shap():
    """Verify SHAP explanation with parcel_id persists SHAP breakdown to PostgreSQL."""
    payload = {**SAMPLE_19_FEATURES, "parcel_id": "BR-042-0187"}
    response = client.post("/api/v1/ai/risk/explain", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["is_persisted"] is True
    assert data["analysis_id"] is not None

    db = SessionLocal()
    ai_rec = db.query(AIAnalysisResult).filter(AIAnalysisResult.id == data["analysis_id"]).first()
    assert ai_rec is not None
    assert len(ai_rec.shap_contributors) > 0
    assert len(ai_rec.top_positive_contributors) > 0
    db.close()


def test_is_current_rotation_and_uniqueness():
    """Verify running multiple predictions for a parcel sets previous results is_current=False."""
    parcel_code = "BR-042-0188"
    payload = {**SAMPLE_19_FEATURES, "parcel_id": parcel_code}

    # Run prediction 1
    resp1 = client.post("/api/v1/ai/risk/predict", json=payload)
    assert resp1.status_code == 200
    id1 = resp1.json()["analysis_id"]

    # Run prediction 2 (modified risk input)
    payload2 = {**payload, "environmental_risk": 2.0}
    resp2 = client.post("/api/v1/ai/risk/predict", json=payload2)
    assert resp2.status_code == 200
    id2 = resp2.json()["analysis_id"]

    assert id1 != id2

    db = SessionLocal()
    parcel = db.query(Parcel).filter(Parcel.parcel_id == parcel_code).first()
    assert parcel is not None

    rec1 = db.query(AIAnalysisResult).filter(AIAnalysisResult.id == id1).first()
    rec2 = db.query(AIAnalysisResult).filter(AIAnalysisResult.id == id2).first()

    assert rec1.is_current is False
    assert rec2.is_current is True

    # Verify exactly ONE current result exists for this parcel
    current_count = (
        db.query(AIAnalysisResult)
        .filter(AIAnalysisResult.parcel_id == parcel.id, AIAnalysisResult.is_current.is_(True))
        .count()
    )
    assert current_count == 1
    db.close()


def test_ai_history_endpoint():
    """Verify GET /api/v1/parcels/{parcel_id}/ai-history returns historical analyses ordered newest first."""
    parcel_code = "BR-042-0188"
    response = client.get(f"/api/v1/parcels/{parcel_code}/ai-history")
    assert response.status_code == 200
    history = response.json()

    assert isinstance(history, list)
    assert len(history) >= 2
    # Ensure newest first
    assert history[0]["is_current"] is True
    assert history[1]["is_current"] is False


def test_parcel_detail_includes_current_ai():
    """Verify GET /api/v1/parcels/{parcel_id} returns live current_ai_result from DB."""
    parcel_code = "BR-042-0188"
    response = client.get(f"/api/v1/parcels/{parcel_code}")
    assert response.status_code == 200
    detail = response.json()

    assert detail["current_ai_result"] is not None
    assert detail["current_ai_result"]["is_current"] is True
    assert "model_version" in detail["current_ai_result"]


def test_audit_event_logged_and_chain_valid():
    """Verify AI analysis creates AI_EVALUATION audit event and hash chain remains valid."""
    db = SessionLocal()
    events = db.query(AuditEvent).filter(AuditEvent.action_type == "AI_EVALUATION").all()
    assert len(events) > 0

    # Verify cryptographic hash chain integrity across all events
    health = verify_chain_health(db)
    assert health["chain_valid"] is True
    db.close()


def test_invalid_parcel_id_returns_404():
    """Verify specifying a non-existent parcel_id returns HTTP 404."""
    payload = {**SAMPLE_19_FEATURES, "parcel_id": "INVALID-PARCEL-999"}
    response = client.post("/api/v1/ai/risk/predict", json=payload)
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()
