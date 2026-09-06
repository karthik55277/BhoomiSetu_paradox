"""
FastAPI Database & GIS API v1 Integration Test Suite.
Tests endpoints against PostgreSQL/PostGIS when available.
If PostgreSQL/PostGIS is unavailable, database tests are clearly reported as SKIPPED.
"""

import sys
import os
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

# Ensure backend folder is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.main import app
from app.db.session import engine

client = TestClient(app)


def is_db_available() -> bool:
    """Checks if real PostgreSQL/PostGIS database connection is active."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            return True
    except Exception:
        return False


DB_AVAILABLE = is_db_available()
skip_if_no_db = pytest.mark.skipif(not DB_AVAILABLE, reason="PostgreSQL/PostGIS database is not connected.")


def test_health_check():
    """Verify service health endpoint."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "bhoomisetu-api"
    assert "database" in data


@skip_if_no_db
def test_get_projects():
    """Test GET /api/v1/projects."""
    response = client.get("/api/v1/projects")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 3
    codes = [p["code"] for p in data]
    assert "NH-327" in codes


@skip_if_no_db
def test_get_project_by_code():
    """Test GET /api/v1/projects/{code}."""
    response = client.get("/api/v1/projects/NH-327")
    assert response.status_code == 200
    data = response.json()
    assert data["code"] == "NH-327"
    assert data["parcel_count"] >= 5
    assert len(data["parcels_summary"]) >= 5


@skip_if_no_db
def test_get_parcels_paginated():
    """Test GET /api/v1/parcels with search and pagination."""
    response = client.get("/api/v1/parcels?page=1&page_size=10")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert data["total"] == 5
    assert len(data["items"]) == 5


@skip_if_no_db
def test_get_parcel_detail():
    """Test GET /api/v1/parcels/{parcel_id} full profile."""
    response = client.get("/api/v1/parcels/BR-042-0187")
    assert response.status_code == 200
    data = response.json()
    assert data["parcel_id"] == "BR-042-0187"
    assert "ml_features" in data
    assert data["ml_features"]["land_area"] == 4.82
    assert "geometry_summary" in data
    assert data["geometry_summary"]["type"] == "Polygon"


@skip_if_no_db
def test_gis_parcels_geojson():
    """Test GET /api/v1/gis/parcels PostGIS GeoJSON BBOX query."""
    response = client.get("/api/v1/gis/parcels?bbox=85.10,25.55,85.15,25.65")
    assert response.status_code == 200
    data = response.json()
    assert data["type"] == "FeatureCollection"
    assert "features" in data
    assert len(data["features"]) >= 1

    feat = data["features"][0]
    assert feat["type"] == "Feature"
    assert feat["geometry"]["type"] == "Polygon"
    assert "parcel_id" in feat["properties"]


@skip_if_no_db
def test_disputes_and_audit_trigger():
    """Test GET /api/v1/disputes and PATCH /api/v1/disputes/{id} with audit trigger."""
    # List disputes
    res_list = client.get("/api/v1/disputes")
    assert res_list.status_code == 200
    items = res_list.json()["items"]
    assert len(items) >= 1

    dispute_id = items[0]["id"]
    # Update dispute status
    patch_res = client.patch(f"/api/v1/disputes/{dispute_id}", json={"status": "Resolved"})
    assert patch_res.status_code == 200
    assert patch_res.json()["status"] == "Resolved"

    # Verify Audit trail health
    audit_res = client.get("/api/v1/audit")
    assert audit_res.status_code == 200
    audit_data = audit_res.json()
    assert audit_data["chain_health"]["chain_valid"] is True


@skip_if_no_db
def test_compensation_update():
    """Test PATCH /api/v1/compensation/{id}."""
    res_list = client.get("/api/v1/compensation")
    assert res_list.status_code == 200
    items = res_list.json()["items"]
    assert len(items) >= 1

    comp_id = items[0]["id"]
    patch_res = client.patch(f"/api/v1/compensation/{comp_id}", json={"status": "Processing"})
    assert patch_res.status_code == 200
    assert patch_res.json()["status"] == "Processing"


@skip_if_no_db
def test_document_creation():
    """Test POST /api/v1/documents metadata creation and single audit event generation."""
    proj_res = client.get("/api/v1/projects/NH-327")
    proj_id = proj_res.json()["id"]

    doc_code = f"DOC-TEST-{os.urandom(2).hex()}"
    doc_payload = {
        "document_code": doc_code,
        "title": "Test Integration Document",
        "project_id": proj_id,
        "category": "Valuation Report",
        "storage_path": "/storage/docs/test_doc.pdf",
        "file_size_bytes": 102400,
        "mime_type": "application/pdf",
        "verification_status": "Verified",
    }
    response = client.post("/api/v1/documents", json=doc_payload)
    assert response.status_code == 201
    assert response.json()["title"] == "Test Integration Document"

    # Verify database persistence & single audit event generation
    from app.db.session import SessionLocal
    db = SessionLocal()
    try:
        from app.models.documents import DocumentRecord
        from app.models.audit import AuditEvent
        from app.services.audit_service import verify_chain_health

        doc_count = db.query(DocumentRecord).filter(DocumentRecord.document_code == doc_code).count()
        assert doc_count == 1

        audit_events = db.query(AuditEvent).filter(
            AuditEvent.entity_table == "documents",
            AuditEvent.action_type == "DOCUMENT_CREATE",
        ).all()
        matching_audits = [a for a in audit_events if a.payload and a.payload.get("document_code") == doc_code]
        assert len(matching_audits) == 1

        health = verify_chain_health(db)
        assert health["chain_valid"] is True
    finally:
        db.close()



@skip_if_no_db
def test_owner_share_validation():
    """Test owner share percentage validation > 100%."""
    parcel_res = client.get("/api/v1/parcels/BR-042-0187")
    parcel_id = parcel_res.json()["id"]

    # Try adding owner with 50% share when 100% already exists
    bad_payload = {
        "owner_name": "Invalid Shareholder",
        "share_percentage": 50.0,
        "is_primary": False,
    }
    response = client.post(f"/api/v1/parcels/{parcel_id}/owners", json=bad_payload)
    assert response.status_code == 400
    assert "exceeds 100%" in response.json()["detail"]


@skip_if_no_db
def test_invalid_parcel_404():
    """Test 404 on non-existent parcel ID."""
    response = client.get("/api/v1/parcels/INVALID-PARCEL-999")
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


def test_ml_predict_endpoint_compat():
    """Verify Phase 1 ML predict endpoint remains 100% operational."""
    payload = {
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
    response = client.post("/api/v1/ai/risk/predict", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "risk_score" in data
    assert "risk_level" in data


@skip_if_no_db
def test_audit_live_stream_aggregation():
    """
    Test E2E audit trail aggregation across all workflows:
    1. AI evaluation (AI_EVALUATION)
    2. Dispute update (DISPUTE_UPDATE)
    3. Compensation status update (COMPENSATION_UPDATE)
    4. Document metadata creation (DOCUMENT_CREATE)
    Verify GET /api/v1/audit returns all event types and chain_health is valid.
    """
    # 1. AI Evaluation
    explain_payload = {
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
    ai_res = client.post("/api/v1/ai/risk/explain?parcel_id=BR-042-0187", json=explain_payload)
    assert ai_res.status_code == 200

    # 2. Dispute Update
    disp_res = client.get("/api/v1/disputes")
    assert disp_res.status_code == 200
    disp_id = disp_res.json()["items"][0]["id"]
    disp_patch = client.patch(f"/api/v1/disputes/{disp_id}", json={"status": "In mediation"})
    assert disp_patch.status_code == 200

    # 3. Compensation Update
    comp_res = client.get("/api/v1/compensation")
    assert comp_res.status_code == 200
    comp_id = comp_res.json()["items"][0]["id"]
    comp_patch = client.patch(f"/api/v1/compensation/{comp_id}", json={"status": "Ready"})
    assert comp_patch.status_code == 200

    # 4. Document Creation
    proj_res = client.get("/api/v1/projects/NH-327")
    proj_id = proj_res.json()["id"]
    doc_code = f"DOC-AGG-{os.urandom(2).hex()}"
    doc_res = client.post("/api/v1/documents", json={
        "document_code": doc_code,
        "title": "Aggregated Stream Verification Doc",
        "project_id": proj_id,
        "category": "Survey Map",
        "storage_path": "/storage/docs/agg.pdf",
        "file_size_bytes": 50000,
        "mime_type": "application/pdf",
        "verification_status": "Verified",
    })
    assert doc_res.status_code == 201

    # 5. GET /api/v1/audit
    audit_res = client.get("/api/v1/audit?page_size=100")
    assert audit_res.status_code == 200
    data = audit_res.json()

    assert data["chain_health"]["chain_valid"] is True
    assert data["chain_health"]["event_count"] >= 4

    action_types = {item["action_type"] for item in data["items"]}
    assert "AI_EVALUATION" in action_types
    assert "DISPUTE_UPDATE" in action_types
    assert "COMPENSATION_UPDATE" in action_types
    assert "DOCUMENT_CREATE" in action_types


@skip_if_no_db
def test_dashboard_analytics_live_metrics():
    """
    Test Phase 2.5.7 Dashboard & Analytics backend metrics endpoints.
    Verifies that all required operational endpoints return 200 OK, valid backend `total`
    fields, and that pagination total differs from page items length.
    """
    # 1. Projects
    proj_res = client.get("/api/v1/projects")
    assert proj_res.status_code == 200
    projects_list = proj_res.json()
    assert isinstance(projects_list, list)
    assert len(projects_list) >= 3

    # 2. Parcels paginated (small page size to test total vs items length)
    parcels_res = client.get("/api/v1/parcels?page=1&page_size=2")
    assert parcels_res.status_code == 200
    parcels_data = parcels_res.json()
    assert "total" in parcels_data
    assert "items" in parcels_data
    assert parcels_data["total"] >= 5
    assert len(parcels_data["items"]) == 2
    # Verify items.length != total (crucial pagination total safeguard!)
    assert len(parcels_data["items"]) != parcels_data["total"]

    # 3. High Risk parcel filtering
    high_risk_res = client.get("/api/v1/parcels?risk_level=HIGH")
    assert high_risk_res.status_code == 200
    high_risk_data = high_risk_res.json()
    assert "total" in high_risk_data

    # 4. Disputes paginated
    disp_res = client.get("/api/v1/disputes?page=1&page_size=10")
    assert disp_res.status_code == 200
    disp_data = disp_res.json()
    assert "total" in disp_data
    assert disp_data["total"] >= 1

    # 5. Compensation paginated
    comp_res = client.get("/api/v1/compensation?page=1&page_size=10")
    assert comp_res.status_code == 200
    comp_data = comp_res.json()
    assert "total" in comp_data
    assert comp_data["total"] >= 1

    # 6. Documents paginated
    doc_res = client.get("/api/v1/documents?page=1&page_size=10")
    assert doc_res.status_code == 200
    doc_data = doc_res.json()
    assert "total" in doc_data
    assert doc_data["total"] >= 1

    # 7. Audit stream and hash chain health
    audit_res = client.get("/api/v1/audit?page=1&page_size=5")
    assert audit_res.status_code == 200
    audit_data = audit_res.json()
    assert "chain_health" in audit_data
    assert audit_data["chain_health"]["chain_valid"] is True
    assert audit_data["chain_health"]["event_count"] >= 1


