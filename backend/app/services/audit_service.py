"""
BhoomiSetu Cryptographic Audit Chain Service.

Provides reusable helper functions for generating SHA-256 canonical JSON hash chains
and validating audit trail integrity.
"""

import datetime
import hashlib
import json
import logging
import uuid
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from app.models.audit import AuditEvent

logger = logging.getLogger("audit_service")


def compute_audit_hash(prev_hash: str, event_code: str, actor_name: str, payload: Dict[str, Any], timestamp_iso: str) -> str:
    """Computes SHA-256 hash using canonical JSON serialization and stable field ordering."""
    canonical_payload = json.dumps(payload, sort_keys=True)
    raw_string = f"{prev_hash}:{event_code}:{actor_name}:{canonical_payload}:{timestamp_iso}"
    return hashlib.sha256(raw_string.encode("utf-8")).hexdigest()


def create_audit_event(
    db: Session,
    title: str,
    entity_table: str,
    action_type: str,
    payload: Dict[str, Any],
    actor_name: str = "System User",
    entity_id: Optional[uuid.UUID] = None,
    parcel_id: Optional[uuid.UUID] = None,
    project_id: Optional[uuid.UUID] = None,
    actor_user_id: Optional[uuid.UUID] = None,
    ip_address: Optional[str] = None,
    event_code_override: Optional[str] = None,
) -> AuditEvent:
    """
    Appends a new immutable audit event to the cryptographic chain.
    Retrieves the latest audit event using row locking (with_for_update) to serialize hash chain calculations.
    """
    # 1. Row-lock latest event to prevent race conditions during hash calculation
    latest_event = (
        db.query(AuditEvent)
        .order_by(AuditEvent.created_at.desc(), AuditEvent.id.desc())
        .with_for_update(nowait=False)
        .first()
    )

    prev_hash = latest_event.current_hash if latest_event else ("0" * 64)

    # 2. Generate unique event code if not provided
    if not event_code_override:
        count = db.query(AuditEvent).count() + 1
        event_code = f"AUD-{count:04d}"
    else:
        event_code = event_code_override

    # 3. Timestamp formatting (ISO 8601 UTC)
    now_dt = datetime.datetime.now(datetime.timezone.utc)
    timestamp_iso = now_dt.isoformat()

    # 4. Calculate current hash
    current_hash = compute_audit_hash(
        prev_hash=prev_hash,
        event_code=event_code,
        actor_name=actor_name,
        payload=payload,
        timestamp_iso=timestamp_iso,
    )

    # 5. Instantiate and save AuditEvent
    event = AuditEvent(
        event_code=event_code,
        title=title,
        entity_table=entity_table,
        entity_id=entity_id,
        parcel_id=parcel_id,
        project_id=project_id,
        actor_user_id=actor_user_id,
        actor_name=actor_name,
        action_type=action_type,
        prev_hash=prev_hash,
        current_hash=current_hash,
        payload=payload,
        ip_address=ip_address,
        created_at=now_dt,
    )

    db.add(event)
    db.flush()
    logger.info(f"Appended AuditEvent {event.event_code} (current_hash: {current_hash[:8]}...)")
    return event


def verify_chain_health(db: Session) -> Dict[str, Any]:
    """Verifies SHA-256 audit chain integrity across all events in chronological order."""
    events = db.query(AuditEvent).order_by(AuditEvent.created_at.asc(), AuditEvent.id.asc()).all()

    if not events:
        return {
            "event_count": 0,
            "latest_hash": "0" * 64,
            "chain_valid": True,
        }

    expected_prev_hash = "0" * 64
    chain_valid = True

    for ev in events:
        if ev.prev_hash != expected_prev_hash:
            logger.error(f"Audit chain broken at event {ev.event_code}! Expected prev_hash {expected_prev_hash}, got {ev.prev_hash}")
            chain_valid = False
            break

        if ev.created_at:
            dt = ev.created_at.replace(tzinfo=datetime.timezone.utc) if ev.created_at.tzinfo is None else ev.created_at.astimezone(datetime.timezone.utc)
            timestamp_str = dt.isoformat()
        else:
            timestamp_str = ""

        recalculated_hash = compute_audit_hash(
            ev.prev_hash,
            ev.event_code,
            ev.actor_name,
            ev.payload,
            timestamp_str,
        )


        if ev.current_hash != recalculated_hash:
            logger.error(f"Audit event {ev.event_code} hash invalid! Stored: {ev.current_hash}, Recalculated: {recalculated_hash}")
            chain_valid = False
            break

        expected_prev_hash = ev.current_hash

    return {
        "event_count": len(events),
        "latest_hash": events[-1].current_hash if events else ("0" * 64),
        "chain_valid": chain_valid,
    }
