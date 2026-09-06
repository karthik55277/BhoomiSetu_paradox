"""
BhoomiSetu Full-Stack E2E Smoke Test Suite (Phase 3.3).

Verifies the entire integrated stack:
- Health check (/health)
- JWT Authentication (/auth/login)
- Projects, Parcels & PostGIS GIS endpoints
- AI ML Risk Prediction & SHAP explanation
- Object Storage Document Upload, Streaming Download & Byte-for-Byte Check
- Cryptographic SHA-256 Audit Trail Chain Integrity
"""

import os
import sys
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.main import app
from app.db.session import engine, SessionLocal
from app.models.projects import Project
from app.services.audit_service import verify_chain_health

client = TestClient(app)


def is_db_available() -> bool:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            return True
    except Exception:
        return False


DB_AVAILABLE = is_db_available()
skip_if_no_db = pytest.mark.skipif(not DB_AVAILABLE, reason="PostgreSQL database is not connected.")


@skip_if_no_db
def test_full_stack_e2e_smoke_flow():
    """
    Executes full E2E operational workflow:
    1. Health check
    2. Authentication
    3. Projects & Parcels API
    4. PostGIS GIS BBOX query
    5. AI Risk prediction
    6. Document upload & byte-for-byte streaming download
    7. Document deletion
    8. SHA-256 Audit trail health
    """
    # 1. Health Check
    health_res = client.get("/health")
    assert health_res.status_code == 200
    assert health_res.json()["database"] == "connected"

    # 2. Login
    login_res = client.post("/api/v1/auth/login", json={
        "email": "anil.kumar@bhoomisetu.gov.in",
        "password": "bhoomisetu123",
    })
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 3. Projects API
    proj_res = client.get("/api/v1/projects", headers=headers)
    assert proj_res.status_code == 200
    projects = proj_res.json()
    assert len(projects) >= 1
    proj_id = projects[0]["id"]

    # 4. Parcels API
    parcels_res = client.get("/api/v1/parcels?page=1&page_size=10", headers=headers)
    assert parcels_res.status_code == 200
    assert parcels_res.json()["total"] >= 1

    # 5. PostGIS GIS API
    gis_res = client.get("/api/v1/gis/parcels?bbox=85.10,25.55,85.15,25.65", headers=headers)
    assert gis_res.status_code == 200
    assert gis_res.json()["type"] == "FeatureCollection"

    # 6. AI ML Risk Scoring & SHAP Explanation
    ai_payload = {
        "parcel_id": "BR-042-0187",
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
    ai_res = client.post("/api/v1/ai/risk/explain", json=ai_payload, headers=headers)
    assert ai_res.status_code == 200
    assert "risk_score" in ai_res.json()

    # 7. Document Upload
    pdf_payload = b"%PDF-1.4\nSmoke Test Binary Payload\n%%EOF"
    files = {"file": ("smoke_deed.pdf", pdf_payload, "application/pdf")}
    form_data = {
        "title": "Smoke Test Land Title",
        "project_id": proj_id,
        "category": "Land Title",
    }
    up_res = client.post("/api/v1/documents/upload", files=files, data=form_data, headers=headers)
    assert up_res.status_code == 201
    doc_id = up_res.json()["id"]

    # 8. Document Download Stream & Byte-for-Byte Check
    dl_res = client.get(f"/api/v1/documents/{doc_id}/download", headers=headers)
    assert dl_res.status_code == 200
    assert dl_res.content == pdf_payload

    # 9. Document Delete
    del_res = client.delete(f"/api/v1/documents/{doc_id}", headers=headers)
    assert del_res.status_code == 200

    # 10. Audit Chain Verification
    audit_res = client.get("/api/v1/audit", headers=headers)
    assert audit_res.status_code == 200
    assert audit_res.json()["chain_health"]["chain_valid"] is True
