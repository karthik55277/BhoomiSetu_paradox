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
    """Test POST /api/v1/documents metadata creation."""
    proj_res = client.get("/api/v1/projects/NH-327")
    proj_id = proj_res.json()["id"]

    doc_payload = {
        "document_code": f"DOC-TEST-{os.urandom(2).hex()}",
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
