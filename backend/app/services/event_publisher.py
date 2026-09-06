"""
BhoomiSetu Decoupled Event Publisher Service (Phase 3.4).

Publishes real-time system events to connected WebSocket clients after database commits.
Enforces strict transaction isolation: exceptions inside WebSocket publishing are logged
and suppressed, guaranteeing that database mutations & HTTP responses are NEVER corrupted.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, List, Optional

from app.services.websocket_manager import ws_manager

logger = logging.getLogger("bhoomisetu.event_publisher")


def publish_system_event(
    event_type: str,
    title: str,
    message: str,
    data: Dict[str, Any],
    target_roles: Optional[List[str]] = None,
    target_jurisdiction: Optional[str] = None,
) -> None:
    """
    Decoupled event publisher called after successful database commits.
    Dispatches notification to WebSocket ConnectionManager asynchronously.
    Suppresses all errors to isolate transactional API routes from WebSocket failures.
    """
    try:
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None

        if loop and loop.is_running():
            loop.create_task(
                ws_manager.broadcast_event(
                    event_type=event_type,
                    title=title,
                    message=message,
                    data=data,
                    target_roles=target_roles,
                    target_jurisdiction=target_jurisdiction,
                )
            )
        else:
            # Fallback if no running event loop (e.g. sync thread)
            asyncio.run(
                ws_manager.broadcast_event(
                    event_type=event_type,
                    title=title,
                    message=message,
                    data=data,
                    target_roles=target_roles,
                    target_jurisdiction=target_jurisdiction,
                )
            )
    except Exception as exc:
        # Transaction Isolation: Log failure but NEVER raise exception
        logger.error(f"Suppressed WebSocket event publication failure for '{event_type}': {exc}")
