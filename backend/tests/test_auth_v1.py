"""
FastAPI Authentication & RBAC Integration Test Suite (Phase 3.1).
Tests JWT login, /auth/me, 401 Unauthenticated rejection, 403 Forbidden RBAC rejection,
DB immutability on rejected mutation, and authenticated user identity logging in SHA-256 audit events.
"""

import os
import sys
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.main import app
from app.db.session import engine, SessionLocal
from app.models.users import User
from app.models.disputes import Dispute
from app.models.audit import AuditEvent
from app.api.deps import get_current_user

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
def test_login_success():
    """Verify POST /api/v1/auth/login with valid seeded credentials."""
    response = client.post("/api/v1/auth/login", json={
        "email": "anil.kumar@bhoomisetu.gov.in",
        "password": "bhoomisetu123",
    })
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert "user" in data
    assert data["user"]["email"] == "anil.kumar@bhoomisetu.gov.in"
    assert data["user"]["role_name"] == "district_officer"


@skip_if_no_db
def test_login_invalid_password():
    """Verify POST /api/v1/auth/login returns 401 for wrong password."""
    response = client.post("/api/v1/auth/login", json={
        "email": "anil.kumar@bhoomisetu.gov.in",
        "password": "wrongpassword123",
    })
    assert response.status_code == 401
    assert "Invalid email or password" in response.json()["detail"]


@skip_if_no_db
def test_auth_me_endpoint():
    """Verify GET /api/v1/auth/me returns current user profile when given valid Bearer token."""
    login_res = client.post("/api/v1/auth/login", json={
        "email": "anil.kumar@bhoomisetu.gov.in",
        "password": "bhoomisetu123",
    })
    token = login_res.json()["access_token"]

    # Temporarily remove override to test real token resolution
    app.dependency_overrides.pop(get_current_user, None)
    try:
        me_res = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me_res.status_code == 200
        user_data = me_res.json()
        assert user_data["email"] == "anil.kumar@bhoomisetu.gov.in"
        assert user_data["full_name"] == "Anil Kumar"
        assert user_data["role_name"] == "district_officer"
    finally:
        # Restore fixture override for subsequent tests if needed
        pass


@skip_if_no_db
def test_unauthenticated_request_rejected():
    """Verify read/write endpoints return 401 Unauthorized when Bearer token is missing."""
    app.dependency_overrides.pop(get_current_user, None)
    response = client.get("/api/v1/projects")
    assert response.status_code == 401
    assert "Authentication token is missing" in response.json()["detail"]


@skip_if_no_db
def test_invalid_token_rejected():
    """Verify endpoints return 401 Unauthorized when an invalid token is provided."""
    app.dependency_overrides.pop(get_current_user, None)
    response = client.get("/api/v1/projects", headers={"Authorization": "Bearer invalid_token_xyz"})
    assert response.status_code == 401
    assert "Invalid or expired authentication token" in response.json()["detail"]


@skip_if_no_db
def test_rbac_unauthorized_mutation_rejected_and_db_unchanged():
    """
    Verify RBAC enforcement:
    1. Login as 'auditor@bhoomisetu.gov.in' (read-only role).
    2. Attempt PATCH /api/v1/disputes/{id} mutation.
    3. Assert 403 Forbidden is returned.
    4. Verify DB status is UNCHANGED and NO audit event is created.
    """
    db = SessionLocal()
    try:
        # Get an existing dispute
        dispute = db.query(Dispute).first()
        assert dispute is not None
        dispute_id = str(dispute.id)
        original_status = dispute.status

        # Count audit events before attempt
        audit_count_before = db.query(AuditEvent).count()

        # Login as Auditor
        login_res = client.post("/api/v1/auth/login", json={
            "email": "auditor@bhoomisetu.gov.in",
            "password": "bhoomisetu123",
        })
        assert login_res.status_code == 200
        auditor_token = login_res.json()["access_token"]

        app.dependency_overrides.pop(get_current_user, None)

        # Attempt unauthorized mutation
        patch_res = client.patch(
            f"/api/v1/disputes/{dispute_id}",
            json={"status": "Resolved"},
            headers={"Authorization": f"Bearer {auditor_token}"},
        )
        assert patch_res.status_code == 403
        assert "is not authorized" in patch_res.json()["detail"]

        # Re-query DB to verify dispute status remains UNCHANGED
        db.expire_all()
        reloaded_dispute = db.query(Dispute).filter(Dispute.id == dispute.id).first()
        assert reloaded_dispute.status == original_status

        # Verify NO audit event was created
        audit_count_after = db.query(AuditEvent).count()
        assert audit_count_after == audit_count_before

    finally:
        db.close()


@skip_if_no_db
def test_authenticated_audit_actor_identity():
    """
    Verify authenticated mutation records exact user ID and name (role) in SHA-256 audit event.
    1. Login as Anil Kumar (District Officer).
    2. Perform authorized PATCH /api/v1/disputes/{id}.
    3. Verify AuditEvent actor_user_id == Anil Kumar's UUID and actor_name == 'Anil Kumar (district_officer)'.
    """
    db = SessionLocal()
    try:
        anil_user = db.query(User).filter(User.email == "anil.kumar@bhoomisetu.gov.in").first()
        assert anil_user is not None
        anil_id_str = str(anil_user.id)

        dispute = db.query(Dispute).first()
        dispute_id = str(dispute.id)

        # Login as Anil Kumar
        login_res = client.post("/api/v1/auth/login", json={
            "email": "anil.kumar@bhoomisetu.gov.in",
            "password": "bhoomisetu123",
        })
        token = login_res.json()["access_token"]

        app.dependency_overrides.pop(get_current_user, None)

        # Perform mutation
        patch_res = client.patch(
            f"/api/v1/disputes/{dispute_id}",
            json={"status": "In mediation"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert patch_res.status_code == 200

        # Query latest audit event
        latest_audit = db.query(AuditEvent).order_by(AuditEvent.created_at.desc()).first()
        assert latest_audit is not None
        assert str(latest_audit.actor_user_id) == anil_id_str
        assert latest_audit.actor_name == "Anil Kumar (district_officer)"

    finally:
        db.close()
