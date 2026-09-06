"""
FastAPI WebSocket Notification Route (Phase 3.4).

Provides authenticated WebSocket connection endpoint at WS /api/v1/ws.
Enforces JWT token validation and database active user check.
Responds to PING frames with PONG heartbeats and routes disconnected sockets cleanly.
"""

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.users import User
from app.services.websocket_manager import ws_manager

router = APIRouter(prefix="/ws", tags=["websocket"])


@router.websocket("")
async def websocket_endpoint(
    websocket: WebSocket,
    token: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """
    Authenticated WebSocket endpoint.
    Accepts JWT Bearer token in query string parameter `?token=<jwt_token>`.
    Closes unauthorized sockets with code 1008 (Policy Violation).
    """
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Authentication token missing.")
        return

    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid or expired authentication token.")
        return

    try:
        user_id = uuid.UUID(payload["sub"])
    except (ValueError, TypeError):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid user ID claim.")
        return

    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="User account invalid or deactivated.")
        return

    role_name = user.role.name if user.role else "viewer"
    jurisdiction = getattr(user, "district_jurisdiction", None)

    await ws_manager.connect(websocket, user.id, role_name, jurisdiction)

    try:
        # Send initial CONNECTED frame
        await websocket.send_json({
            "type": "CONNECTED",
            "user_id": str(user.id),
            "full_name": user.full_name,
            "role": role_name,
            "jurisdiction": jurisdiction,
        })

        while True:
            data = await websocket.receive_json()
            if isinstance(data, dict) and data.get("type") == "PING":
                await websocket.send_json({"type": "PONG"})
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, user.id)
    except Exception:
        ws_manager.disconnect(websocket, user.id)
