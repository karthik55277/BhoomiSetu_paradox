"""
BhoomiSetu WebSocket Connection Manager (Phase 3.4).

Manages active authenticated WebSocket connections, tracks user ID, role, and jurisdiction metadata,
and handles role/jurisdiction-aware event broadcasting with complete exception isolation.
"""

from __future__ import annotations

import logging
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from fastapi import WebSocket

logger = logging.getLogger("bhoomisetu.websocket")


class ConnectionManager:
    """Central WebSocket Connection Manager for real-time notifications."""

    def __init__(self):
        # Maps user_id -> List of (WebSocket, role_name, jurisdiction)
        self.active_connections: Dict[uuid.UUID, List[Tuple[WebSocket, str, Optional[str]]]] = defaultdict(list)

    async def connect(
        self,
        websocket: WebSocket,
        user_id: uuid.UUID,
        role_name: str,
        jurisdiction: Optional[str] = None,
    ) -> None:
        """Accepts WebSocket connection and registers socket with user metadata."""
        await websocket.accept()
        self.active_connections[user_id].append((websocket, role_name, jurisdiction))
        logger.info(f"WebSocket client connected: user_id={user_id}, role={role_name}, jurisdiction={jurisdiction}")

    def disconnect(self, websocket: WebSocket, user_id: uuid.UUID) -> None:
        """Safely unregisters WebSocket connection."""
        if user_id in self.active_connections:
            self.active_connections[user_id] = [
                (ws, r, j) for (ws, r, j) in self.active_connections[user_id] if ws != websocket
            ]
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
        logger.info(f"WebSocket client disconnected: user_id={user_id}")

    async def broadcast_event(
        self,
        event_type: str,
        title: str,
        message: str,
        data: Dict[str, Any],
        target_roles: Optional[List[str]] = None,
        target_jurisdiction: Optional[str] = None,
        event_id: Optional[str] = None,
    ) -> int:
        """
        Broadcasts standardized event payload to connected clients matching role & jurisdiction filter.
        Returns number of clients successfully delivered to.
        Complete exception isolation: websocket errors NEVER break caller execution.
        """
        payload = {
            "event_id": event_id or str(uuid.uuid4()),
            "event_type": event_type,
            "title": title,
            "message": message,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "target_roles": target_roles,
            "target_jurisdiction": target_jurisdiction,
            "data": data,
        }

        delivered_count = 0
        stale_sockets: List[Tuple[uuid.UUID, WebSocket]] = []

        for user_id, user_sockets in list(self.active_connections.items()):
            for ws, role_name, jurisdiction in user_sockets:
                # 1. Filter by target roles if specified
                if target_roles and role_name not in target_roles:
                    continue

                # 2. Filter by target jurisdiction if specified
                if target_jurisdiction and jurisdiction and jurisdiction.lower() != target_jurisdiction.lower():
                    continue

                # 3. Deliver payload
                try:
                    await ws.send_json(payload)
                    delivered_count += 1
                except Exception as exc:
                    logger.warning(f"Failed to send WS message to user {user_id}: {exc}")
                    stale_sockets.append((user_id, ws))

        # Cleanup any disconnected/stale sockets encountered during broadcast
        for uid, ws in stale_sockets:
            self.disconnect(ws, uid)

        return delivered_count

    async def send_personal_event(
        self,
        user_id: uuid.UUID,
        event_type: str,
        title: str,
        message: str,
        data: Dict[str, Any],
    ) -> bool:
        """Sends targeted notification event exclusively to a specific user's active sockets."""
        if user_id not in self.active_connections:
            return False

        payload = {
            "event_id": str(uuid.uuid4()),
            "event_type": event_type,
            "title": title,
            "message": message,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "data": data,
        }

        success = False
        stale_sockets = []
        for ws, _, _ in list(self.active_connections[user_id]):
            try:
                await ws.send_json(payload)
                success = True
            except Exception:
                stale_sockets.append((user_id, ws))

        for uid, ws in stale_sockets:
            self.disconnect(ws, uid)

        return success


# Global Singleton ConnectionManager Instance
ws_manager = ConnectionManager()
