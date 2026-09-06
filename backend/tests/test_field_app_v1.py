"""
FastAPI Field Surveyor Mobile App & Workflow Integration Test Suite (Phase 3.5).
Tests PostGIS spatial proximity search with bounded parameters & jurisdiction filtering,
server-side GPS coordinate validation, seeded field_surveyor RBAC role, client_inspection_id
& client_document_id idempotency, device captured_at timestamp preservation, and WebSocket transaction isolation.
"""

import datetime
import os
import sys
import unittest.mock as mock
import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.main import app
from app.db.session import engine, SessionLocal
from app.models.users import User
from app.models.parcels import Parcel
from app.models.projects import Project
from app.models.documents import DocumentRecord
from app.models.field_inspections import FieldInspection
from app.models.audit import AuditEvent
from app.api.deps import get_current_user
from app.services.websocket_manager import ws_manager

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


def get_user_token(email: str, password: str = "bhoomisetu123") -> str:
    """Helper to get JWT access token for a given user email."""
    res = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, f"Login failed for {email}"
    return res.json()["access_token"]


@skip_if_no_db
def test_nearby_parcels_postgis_distance():
    """Verify GET /api/v1/gis/parcels/nearby returns distance-sorted parcels within radius."""
    token = get_user_token("anil.kumar@bhoomisetu.gov.in")
    res = client.get(
        "/api/v1/gis/parcels/nearby?lat=25.6065&lon=85.1265&radius_km=5.0&limit=10",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["type"] == "FeatureCollection"
    assert "features" in data
    assert len(data["features"]) > 0

    # Verify features contain distance_m and are sorted ascending by distance_m
    distances = [f["properties"]["distance_m"] for f in data["features"]]
    assert distances == sorted(distances)


@skip_if_no_db
def test_invalid_gps_coordinates_rejected():
    """Verify server-side 400 Bad Request rejection for out-of-bounds latitude/longitude."""
    token = get_user_token("anil.kumar@bhoomisetu.gov.in")

    # Out of bounds lat
    res1 = client.get(
        "/api/v1/gis/parcels/nearby?lat=120.0&lon=85.1265",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res1.status_code == 422  # Pydantic query validation or 400

    db = SessionLocal()
    try:
        parcel = db.query(Parcel).first()
        parcel_id_str = str(parcel.id)

        # Out of bounds inspection lat
        res2 = client.post(
            "/api/v1/inspections",
            json={
                "client_inspection_id": str(uuid.uuid4()),
                "parcel_id": parcel_id_str,
                "gps_lat": 195.0,
                "gps_lon": 85.1265,
                "verification_status": "Boundary Verified",
                "captured_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res2.status_code == 422  # Pydantic validation
    finally:
        db.close()


@skip_if_no_db
def test_radius_and_limit_bounds_enforced():
    """Verify server-side 400 Bad Request when radius_km > 25 or limit > 100."""
    token = get_user_token("anil.kumar@bhoomisetu.gov.in")

    # Radius > 25
    res1 = client.get(
        "/api/v1/gis/parcels/nearby?lat=25.6065&lon=85.1265&radius_km=50.0",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res1.status_code == 400
    assert "Invalid radius_km" in res1.json()["detail"]

    # Limit > 100
    res2 = client.get(
        "/api/v1/gis/parcels/nearby?lat=25.6065&lon=85.1265&limit=200",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res2.status_code == 400
    assert "Invalid limit" in res2.json()["detail"]


@skip_if_no_db
def test_jurisdiction_authorization_for_nearby_parcels():
    """Verify nearby parcel discovery respects user district jurisdiction authorization."""
    # Ramesh Verma (field_surveyor, Patna)
    patna_token = get_user_token("ramesh.verma@bhoomisetu.gov.in")
    res = client.get(
        "/api/v1/gis/parcels/nearby?lat=25.6065&lon=85.1265&radius_km=25.0",
        headers={"Authorization": f"Bearer {patna_token}"},
    )
    assert res.status_code == 200
    features = res.json()["features"]
    districts = {f["properties"]["district"].lower() for f in features}
    assert districts == {"patna"}


@skip_if_no_db
def test_field_surveyor_login_and_inspection():
    """Verify seeded field_surveyor Ramesh Verma logs in and submits authorized inspection."""
    token = get_user_token("ramesh.verma@bhoomisetu.gov.in")
    app.dependency_overrides.pop(get_current_user, None)
    db = SessionLocal()
    try:
        parcel = db.query(Parcel).first()
        assert parcel is not None
        parcel_id_str = str(parcel.id)
        client_uuid = str(uuid.uuid4())
        captured_time = datetime.datetime.now(datetime.timezone.utc).isoformat()

        res = client.post(
            "/api/v1/inspections",
            json={
                "client_inspection_id": client_uuid,
                "parcel_id": parcel_id_str,
                "gps_lat": 25.6065,
                "gps_lon": 85.1265,
                "verification_status": "Encroachment Detected",
                "boundary_intact": False,
                "encroachment_flag": True,
                "notes": "Field boundary marker displaced 2.5 meters west",
                "captured_at": captured_time,
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 201
        data = res.json()
        assert data["client_inspection_id"] == client_uuid
        assert data["inspector_name"] == "Ramesh Verma"
        assert data["verification_status"] == "Encroachment Detected"
        assert data["boundary_intact"] is False
        assert data["encroachment_flag"] is True
        assert data["distance_to_parcel_m"] is not None
    finally:
        db.close()


@skip_if_no_db
def test_idempotent_inspection_submission():
    """
    CRITICAL IDEMPOTENCY SAFEGUARD TEST:
    Verifies that submitting the same client_inspection_id twice returns the existing record
    cleanly without creating duplicate database rows or duplicate audit events.
    """
    token = get_user_token("ramesh.verma@bhoomisetu.gov.in")
    app.dependency_overrides.pop(get_current_user, None)
    db = SessionLocal()
    try:
        parcel = db.query(Parcel).first()
        parcel_id_str = str(parcel.id)
        client_uuid = str(uuid.uuid4())

        count_before = db.query(FieldInspection).count()
        audit_before = db.query(AuditEvent).count()

        payload = {
            "client_inspection_id": client_uuid,
            "parcel_id": parcel_id_str,
            "gps_lat": 25.6065,
            "gps_lon": 85.1265,
            "verification_status": "Boundary Verified",
            "boundary_intact": True,
            "notes": "Original inspection submission",
            "captured_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        }

        # First Submission -> 201 Created
        res1 = client.post("/api/v1/inspections", json=payload, headers={"Authorization": f"Bearer {token}"})
        assert res1.status_code == 201
        id1 = res1.json()["id"]

        # Retry Submission -> Returns 200 OK with same ID
        res2 = client.post("/api/v1/inspections", json=payload, headers={"Authorization": f"Bearer {token}"})
        assert res2.status_code == 200 or res2.status_code == 201
        assert res2.json()["id"] == id1

        # Database rows must increase by EXACTLY 1
        count_after = db.query(FieldInspection).count()
        assert count_after == count_before + 1

        # Audit events must increase by EXACTLY 1
        audit_after = db.query(AuditEvent).count()
        assert audit_after == audit_before + 1
    finally:
        db.close()


@skip_if_no_db
def test_idempotent_photo_upload():
    """Verify submitting multipart file with same client_document_id returns existing document without duplicate upload."""
    token = get_user_token("ramesh.verma@bhoomisetu.gov.in")
    app.dependency_overrides.pop(get_current_user, None)
    db = SessionLocal()
    try:
        project = db.query(Project).first()
        project_id_str = str(project.id)
        client_doc_uuid = str(uuid.uuid4())

        dummy_bytes = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF"
        files = {"file": ("test_survey_photo.pdf", dummy_bytes, "application/pdf")}
        data = {
            "title": "Ground Survey Evidence Photo",
            "project_id": project_id_str,
            "category": "Field Evidence",
            "client_document_id": client_doc_uuid,
        }

        # First upload
        res1 = client.post("/api/v1/documents/upload", data=data, files=files, headers={"Authorization": f"Bearer {token}"})
        assert res1.status_code == 201
        doc_id1 = res1.json()["id"]

        # Retry upload with same client_document_id
        files2 = {"file": ("test_survey_photo.pdf", dummy_bytes, "application/pdf")}
        res2 = client.post("/api/v1/documents/upload", data=data, files=files2, headers={"Authorization": f"Bearer {token}"})
        assert res2.status_code == 200 or res2.status_code == 201
        assert res2.json()["id"] == doc_id1
    finally:
        db.close()


@skip_if_no_db
def test_photo_document_lifecycle():
    """Verify full photo -> document_id -> inspection transaction sequence."""
    token = get_user_token("ramesh.verma@bhoomisetu.gov.in")
    app.dependency_overrides.pop(get_current_user, None)
    db = SessionLocal()
    try:
        parcel = db.query(Parcel).first()
        parcel_id_str = str(parcel.id)
        project_id_str = str(parcel.project_id)

        # 1. Upload photo document to MinIO/Local storage
        dummy_bytes = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF"
        files = {"file": ("field_boundary_photo.pdf", dummy_bytes, "application/pdf")}
        data = {
            "title": "Field Boundary Ground Photo",
            "project_id": project_id_str,
            "parcel_id": parcel_id_str,
            "category": "Field Evidence",
        }
        doc_res = client.post("/api/v1/documents/upload", data=data, files=files, headers={"Authorization": f"Bearer {token}"})
        assert doc_res.status_code == 201
        photo_document_id = doc_res.json()["id"]

        # 2. Submit inspection referencing photo_document_id
        client_uuid = str(uuid.uuid4())
        insp_res = client.post(
            "/api/v1/inspections",
            json={
                "client_inspection_id": client_uuid,
                "parcel_id": parcel_id_str,
                "gps_lat": 25.6065,
                "gps_lon": 85.1265,
                "verification_status": "Boundary Verified",
                "photo_document_id": photo_document_id,
                "captured_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert insp_res.status_code == 201
        assert insp_res.json()["photo_document_id"] == photo_document_id
    finally:
        db.close()


@skip_if_no_db
def test_unauthorized_role_rejected():
    """Verify read-only auditor role is rejected with 403 Forbidden when attempting to record an inspection."""
    auditor_token = get_user_token("auditor@bhoomisetu.gov.in")
    app.dependency_overrides.pop(get_current_user, None)
    db = SessionLocal()
    try:
        parcel = db.query(Parcel).first()
        res = client.post(
            "/api/v1/inspections",
            json={
                "client_inspection_id": str(uuid.uuid4()),
                "parcel_id": str(parcel.id),
                "gps_lat": 25.6065,
                "gps_lon": 85.1265,
                "verification_status": "Boundary Verified",
                "captured_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            },
            headers={"Authorization": f"Bearer {auditor_token}"},
        )
        assert res.status_code == 403
        assert "is not authorized" in res.json()["detail"]
    finally:
        db.close()


@skip_if_no_db
def test_db_commit_succeeds_even_if_ws_fails():
    """
    TRANSACTION ISOLATION SAFEGUARD TEST:
    Verifies that if WebSocket broadcasting fails, the FieldInspection and Audit record
    STILL commit cleanly to PostgreSQL and HTTP 201 is returned.
    """
    token = get_user_token("ramesh.verma@bhoomisetu.gov.in")
    db = SessionLocal()
    try:
        parcel = db.query(Parcel).first()
        client_uuid = str(uuid.uuid4())

        with mock.patch.object(ws_manager, "broadcast_event", side_effect=RuntimeError("WS Broadcast Disconnected")):
            res = client.post(
                "/api/v1/inspections",
                json={
                    "client_inspection_id": client_uuid,
                    "parcel_id": str(parcel.id),
                    "gps_lat": 25.6065,
                    "gps_lon": 85.1265,
                    "verification_status": "Boundary Verified",
                    "captured_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                },
                headers={"Authorization": f"Bearer {token}"},
            )
            assert res.status_code == 201

            # Inspection record MUST exist in DB
            db.expire_all()
            insp = db.query(FieldInspection).filter(FieldInspection.client_inspection_id == client_uuid).first()
            assert insp is not None
            assert insp.status == "SUBMITTED"

            # Audit record MUST exist in DB
            latest_audit = db.query(AuditEvent).order_by(AuditEvent.created_at.desc()).first()
            assert latest_audit is not None
            assert latest_audit.action_type == "FIELD_INSPECTION"
    finally:
        db.close()
