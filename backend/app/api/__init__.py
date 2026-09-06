"""API v1 Router aggregation."""

from fastapi import APIRouter

from app.api.routes.audit import router as audit_router
from app.api.routes.auth import router as auth_router
from app.api.routes.compensation import router as compensation_router
from app.api.routes.disputes import router as disputes_router
from app.api.routes.documents import router as documents_router
from app.api.routes.gis import router as gis_router
from app.api.routes.owners import router as owners_router
from app.api.routes.parcels import router as parcels_router
from app.api.routes.projects import router as projects_router
from app.api.routes.websocket import router as websocket_router

api_v1_router = APIRouter(prefix="/api/v1")

api_v1_router.include_router(auth_router)
api_v1_router.include_router(projects_router)
api_v1_router.include_router(parcels_router)
api_v1_router.include_router(gis_router)
api_v1_router.include_router(owners_router)
api_v1_router.include_router(disputes_router)
api_v1_router.include_router(compensation_router)
api_v1_router.include_router(documents_router)
api_v1_router.include_router(audit_router)
api_v1_router.include_router(websocket_router)

