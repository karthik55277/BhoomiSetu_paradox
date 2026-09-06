"""
FastAPI WebSocket & Real-Time Event System Integration Test Suite (Phase 3.4).
Tests WebSocket authentication, 1008 policy violation disconnects, PING/PONG heartbeats,
role-aware & jurisdiction event broadcasting, transaction isolation (DB commit succeeds even if WS fails),
and event ID deduplication.
"""

import os
import sys
import unittest.mock as mock
import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect
from sqlalchemy import text

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.main import app
from app.db.session import engine, SessionLocal
from app.models.users import User
from app.models.disputes import Dispute
from app.models.compensation import CompensationRecord
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
def test_valid_jwt_connects():
    """Verify WebSocket connects successfully with valid JWT token."""
    token = get_user_token("anil.kumar@bhoomisetu.gov.in")
    with client.websocket_connect(f"/api/v1/ws?token={token}") as ws:
        data = ws.receive_json()
        assert data["type"] == "CONNECTED"
        assert "user_id" in data
        assert data["role"] == "district_officer"


@skip_if_no_db
def test_missing_jwt_rejected():
    """Verify WebSocket disconnects with 1008 Policy Violation when token is missing."""
    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect("/api/v1/ws"):
            pass
    assert exc_info.value.code == 1008


@skip_if_no_db
def test_invalid_jwt_rejected():
    """Verify WebSocket disconnects with 1008 Policy Violation when token is invalid."""
    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect("/api/v1/ws?token=invalid_jwt_token_123"):
            pass
    assert exc_info.value.code == 1008


@skip_if_no_db
def test_inactive_user_rejected():
    """Verify WebSocket rejects connection for deactivated user account with 1008 policy violation."""
    token = get_user_token("auditor@bhoomisetu.gov.in")
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == "auditor@bhoomisetu.gov.in").first()
        assert user is not None
        # Deactivate user after issuing token
        user.is_active = False
        db.commit()

        with pytest.raises(WebSocketDisconnect) as exc_info:
            with client.websocket_connect(f"/api/v1/ws?token={token}"):
                pass
        assert exc_info.value.code == 1008
    finally:
        # Re-activate user
        if user:
            user.is_active = True
            db.commit()
        db.close()


@skip_if_no_db
def test_connected_frame_received():
    """Verify CONNECTED initial frame payload contains user_id, role, jurisdiction."""
    token = get_user_token("anil.kumar@bhoomisetu.gov.in")
    with client.websocket_connect(f"/api/v1/ws?token={token}") as ws:
        frame = ws.receive_json()
        assert frame["type"] == "CONNECTED"
        assert frame["role"] == "district_officer"
        assert "jurisdiction" in frame


@skip_if_no_db
def test_ping_pong_works():
    """Verify PING frame returns PONG response frame."""
    token = get_user_token("anil.kumar@bhoomisetu.gov.in")
    with client.websocket_connect(f"/api/v1/ws?token={token}") as ws:
        # Receive initial CONNECTED frame
        ws.receive_json()

        # Send PING
        ws.send_json({"type": "PING"})
        pong = ws.receive_json()
        assert pong["type"] == "PONG"


@skip_if_no_db
def test_dispute_update_broadcasts_to_permitted_roles():
    """Verify dispute PATCH mutation broadcasts DISPUTE_UPDATE to connected permitted roles."""
    token = get_user_token("anil.kumar@bhoomisetu.gov.in")
    db = SessionLocal()
    try:
        dispute = db.query(Dispute).first()
        assert dispute is not None
        dispute_id = str(dispute.id)

        with client.websocket_connect(f"/api/v1/ws?token={token}") as ws:
            # Receive initial CONNECTED frame
            ws.receive_json()

            # Perform REST API dispute update
            patch_res = client.patch(
                f"/api/v1/disputes/{dispute_id}",
                json={"status": "Under investigation"},
                headers={"Authorization": f"Bearer {token}"},
            )
            assert patch_res.status_code == 200

            # Receive broadcast event from socket
            event = ws.receive_json()
            assert event["event_type"] == "DISPUTE_UPDATE"
            assert "event_id" in event
            assert "Under investigation" in event["message"]
            assert event["data"]["dispute_id"] == dispute_id
    finally:
        db.close()


@skip_if_no_db
def test_compensation_update_broadcasts_to_permitted_roles():
    """Verify compensation PATCH mutation broadcasts COMPENSATION_UPDATE event."""
    token = get_user_token("anil.kumar@bhoomisetu.gov.in")
    db = SessionLocal()
    try:
        comp = db.query(CompensationRecord).first()
        assert comp is not None
        comp_id = str(comp.id)

        with client.websocket_connect(f"/api/v1/ws?token={token}") as ws:
            ws.receive_json()  # CONNECTED frame

            patch_res = client.patch(
                f"/api/v1/compensation/{comp_id}",
                json={"status": "Processing"},
                headers={"Authorization": f"Bearer {token}"},
            )
            assert patch_res.status_code == 200

            event = ws.receive_json()
            assert event["event_type"] == "COMPENSATION_UPDATE"
            assert "event_id" in event
            assert event["data"]["compensation_id"] == comp_id
    finally:
        db.close()


@skip_if_no_db
def test_unauthorized_role_receives_nothing():
    """Verify user in non-permitted role (auditor) does not receive event targeted at district_officer."""
    db = SessionLocal()
    try:
        anil_token = get_user_token("anil.kumar@bhoomisetu.gov.in")
        auditor_token = get_user_token("auditor@bhoomisetu.gov.in")

        dispute = db.query(Dispute).first()
        assert dispute is not None
        dispute_id = str(dispute.id)

        # Connect auditor WebSocket
        with client.websocket_connect(f"/api/v1/ws?token={auditor_token}") as auditor_ws:
            auditor_frame = auditor_ws.receive_json()
            assert auditor_frame["type"] == "CONNECTED"
            assert auditor_frame["role"] == "auditor"

            # District officer performs dispute update
            patch_res = client.patch(
                f"/api/v1/disputes/{dispute_id}",
                json={"status": "In mediation"},
                headers={"Authorization": f"Bearer {anil_token}"},
            )
            assert patch_res.status_code == 200

            # Auditor should receive PONG if pinged, but NO DISPUTE_UPDATE broadcast
            auditor_ws.send_json({"type": "PING"})
            pong = auditor_ws.receive_json()
            assert pong["type"] == "PONG"
    finally:
        db.close()


@skip_if_no_db
def test_db_commit_succeeds_even_if_ws_fails():
    """
    CRITICAL RELIABILITY SAFEGUARD TEST:
    Verifies that if WebSocket broadcasting throws an unhandled exception or network failure,
    the PostgreSQL DB commit STILL succeeds, the HTTP API STILL returns 200, and AuditEvent IS recorded.
    WebSocket is strictly best-effort delivery and cannot break transactions!
    """
    token = get_user_token("anil.kumar@bhoomisetu.gov.in")
    db = SessionLocal()
    try:
        dispute = db.query(Dispute).first()
        assert dispute is not None
        dispute_id = str(dispute.id)
        target_new_status = "Resolved" if dispute.status != "Resolved" else "Open"

        # Mock broadcast_event to raise an artificial network failure exception
        with mock.patch.object(ws_manager, "broadcast_event", side_effect=RuntimeError("WebSocket Network Broken Error")):
            patch_res = client.patch(
                f"/api/v1/disputes/{dispute_id}",
                json={"status": target_new_status},
                headers={"Authorization": f"Bearer {token}"},
            )

            # 1. API must return 200 OK (NOT 500 Internal Server Error)
            assert patch_res.status_code == 200

            # 2. Database record MUST be updated and committed
            db.expire_all()
            reloaded_dispute = db.query(Dispute).filter(Dispute.id == dispute.id).first()
            assert reloaded_dispute.status == target_new_status

            # 3. Audit record MUST be created independently
            latest_audit = db.query(AuditEvent).order_by(AuditEvent.created_at.desc()).first()
            assert latest_audit is not None
            assert str(latest_audit.entity_id) == dispute_id
            assert latest_audit.action_type == "DISPUTE_UPDATE"
    finally:
        db.close()


@skip_if_no_db
def test_notification_event_id_prevents_duplicate_toast():
    """Verify event payload contains valid event_id UUID so frontend can deduplicate toasts."""
    token = get_user_token("anil.kumar@bhoomisetu.gov.in")
    db = SessionLocal()
    try:
        dispute = db.query(Dispute).first()
        dispute_id = str(dispute.id)

        with client.websocket_connect(f"/api/v1/ws?token={token}") as ws:
            ws.receive_json()  # CONNECTED frame

            client.patch(
                f"/api/v1/disputes/{dispute_id}",
                json={"status": "Under investigation"},
                headers={"Authorization": f"Bearer {token}"},
            )

            event = ws.receive_json()
            assert "event_id" in event
            assert len(event["event_id"]) > 10  # Valid UUID string
    finally:
        db.close()


@skip_if_no_db
def test_audit_event_exists_independently_of_ws():
    """Verify persistent PostgreSQL audit record is written regardless of WS connection state."""
    token = get_user_token("anil.kumar@bhoomisetu.gov.in")
    db = SessionLocal()
    try:
        dispute = db.query(Dispute).first()
        dispute_id = str(dispute.id)
        audit_count_before = db.query(AuditEvent).count()

        # Perform mutation with NO active WebSocket connections open
        patch_res = client.patch(
            f"/api/v1/disputes/{dispute_id}",
            json={"status": "Open"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert patch_res.status_code == 200

        # Audit count in PostgreSQL must increase by 1
        audit_count_after = db.query(AuditEvent).count()
        assert audit_count_after == audit_count_before + 1
    finally:
        db.close()
