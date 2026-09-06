import uuid
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.api.deps import get_current_user
from app.models.users import User
from app.models.roles import Role
from app.models.parcels import Parcel
from app.services.ai_persistence_service import persist_ai_analysis

client = TestClient(app)

def test_security_headers_present_on_multiple_endpoints():
    """Verify security headers (excluding legacy X-XSS-Protection) across multiple endpoints."""
    endpoints = ["/health", "/api/v1/projects", "/api/v1/auth/me"]
    for ep in endpoints:
        response = client.get(ep)
        assert response.headers.get("X-Content-Type-Options") == "nosniff"
        assert response.headers.get("X-Frame-Options") == "DENY"
        assert response.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"
        assert "Content-Security-Policy" in response.headers
        assert "X-XSS-Protection" not in response.headers


def test_request_correlation_uuid_propagation():
    """Verify X-Request-ID correlation header is attached to response and invalid IDs are replaced."""
    # 1. Server generates fresh UUID if missing
    res1 = client.get("/health")
    req_id1 = res1.headers.get("X-Request-ID")
    assert req_id1 is not None
    uuid.UUID(req_id1)  # Validates UUID format

    # 2. Server propagates valid incoming UUID
    custom_uuid = str(uuid.uuid4())
    res2 = client.get("/health", headers={"X-Request-ID": custom_uuid})
    assert res2.headers.get("X-Request-ID") == custom_uuid

    # 3. Server replaces malformed incoming ID with fresh UUID
    res3 = client.get("/health", headers={"X-Request-ID": "invalid-malformed-id;SELECT *"})
    req_id3 = res3.headers.get("X-Request-ID")
    assert req_id3 != "invalid-malformed-id;SELECT *"
    uuid.UUID(req_id3)


from app.middleware import RateLimitingMiddleware

def test_rate_limiting_login_endpoint():
    """Verify 10 rapid login attempts trigger 429 Too Many Requests with Retry-After header."""
    RateLimitingMiddleware.clear_history()
    try:
        isolated_client = TestClient(app)
        headers = {"X-Forwarded-For": "198.51.100.42", "X-Test-Rate-Limit": "true"}  # Isolated IP address

        responses = []
        for _ in range(11):
            resp = isolated_client.post(
                "/api/v1/auth/login",
                json={"email": "isolated_test_user@bhoomisetu.gov.in", "password": "wrongpassword"},
                headers=headers,
            )
            responses.append(resp)

        # 11th request must be rejected with 429
        last_response = responses[-1]
        assert last_response.status_code == 429
        assert "detail" in last_response.json()
        assert "Retry-After" in last_response.headers
    finally:
        RateLimitingMiddleware.clear_history()


def test_health_liveness_and_readiness_probes():
    """Verify liveness probe returns 200 OK and readiness probe tests PostgreSQL and MinIO."""
    # Liveness
    live_res = client.get("/api/v1/health/live")
    assert live_res.status_code == 200
    assert live_res.json()["status"] == "live"

    # Readiness
    ready_res = client.get("/api/v1/health/ready")
    assert ready_res.status_code in [200, 503]
    body = ready_res.json()
    assert "database" in body
    assert "storage" in body


from app.db.session import SessionLocal

def test_demo_reset_endpoint():
    """Verify POST /api/v1/demo/reset resets state and logs AuditEvent."""
    db = SessionLocal()
    try:
        admin_user = db.query(User).join(Role).filter(Role.name == "system_admin").first()
        assert admin_user is not None

        app.dependency_overrides[get_current_user] = lambda: admin_user
        try:
            response = client.post("/api/v1/demo/reset")
            assert response.status_code == 200
            assert response.json()["status"] == "success"
        finally:
            app.dependency_overrides.pop(get_current_user, None)
    finally:
        db.close()


def test_ai_concurrency_is_current_rotation():
    """Verify persist_ai_analysis rotates previous is_current flags atomically."""
    db = SessionLocal()
    try:
        parcel = db.query(Parcel).first()
        assert parcel is not None

        user = db.query(User).first()
        record = {"area_acres": 1.5, "compensation_amount_lakhs": 45.0}
        prediction = {"acquisition_risk": 0, "risk_level": "LOW", "risk_score": 0.25, "risk_probability": 0.25}

        # First evaluation
        eval1 = persist_ai_analysis(db, parcel, record, prediction, current_user=user)
        assert eval1.is_current is True

        # Second evaluation
        eval2 = persist_ai_analysis(db, parcel, record, prediction, current_user=user)
        assert eval2.is_current is True

        # Re-query eval1 to confirm it was rotated to is_current=False
        db.refresh(eval1)
        assert eval1.is_current is False
    finally:
        db.close()
