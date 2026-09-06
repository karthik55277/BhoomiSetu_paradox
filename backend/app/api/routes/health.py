from datetime import datetime, timezone
from typing import Dict, Any

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services.storage_service import get_storage_engine, LocalStorageEngine, MinIOStorageEngine

health_router = APIRouter(prefix="/health", tags=["health"])

@health_router.get("/liveness", status_code=status.HTTP_200_OK)
@health_router.get("/live", status_code=status.HTTP_200_OK)
def get_liveness() -> Dict[str, Any]:
    """Basic liveness probe verifying that the FastAPI server is running."""
    return {
        "status": "live",
        "service": "bhoomisetu-api",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@health_router.get("/readiness")
@health_router.get("/ready")
def get_readiness(response: Response, db: Session = Depends(get_db)) -> Dict[str, Any]:
    """
    Readiness probe actively executing operational checks against PostgreSQL and MinIO storage.
    Returns 200 OK if healthy, or 503 Service Unavailable if any core dependency is degraded.
    """
    db_status = "disconnected"
    storage_status = "disconnected"
    is_healthy = True

    # 1. Test PostgreSQL Operational Readiness
    try:
        db.execute(text("SELECT 1"))
        db_status = "connected"
    except Exception:
        db_status = "unavailable"
        is_healthy = False

    # 2. Test MinIO / Object Storage Operational Readiness
    try:
        storage = get_storage_engine()
        if isinstance(storage, MinIOStorageEngine):
            if storage.client and storage.client.bucket_exists(storage.bucket):
                storage_status = "connected"
            else:
                storage_status = "bucket_missing"
                is_healthy = False
        elif isinstance(storage, LocalStorageEngine):
            if storage.base_dir and storage.base_dir.exists():
                storage_status = "connected"
            else:
                storage_status = "dir_missing"
                is_healthy = False
    except Exception:
        storage_status = "unavailable"
        is_healthy = False

    if not is_healthy:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {
            "status": "degraded",
            "database": db_status,
            "storage": storage_status,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    response.status_code = status.HTTP_200_OK
    return {
        "status": "healthy",
        "database": db_status,
        "storage": storage_status,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
