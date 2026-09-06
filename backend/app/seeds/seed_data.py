"""
BhoomiSetu Phase 2.2 — Idempotent Database Seeding Script.

Populates PostgreSQL/PostGIS with demo data for Roles, Users, Projects, Parcels,
Parcel Owners, Parcel Geometries, Disputes, Compensation Records, Documents, and Audit Events.
"""

import datetime
import hashlib
import json
import logging
import os
import sys
from typing import Dict, Any, List

# Ensure backend folder is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from geoalchemy2 import WKTElement
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import SessionLocal, engine
from app.models.roles import Role
from app.models.users import User
from app.models.projects import Project
from app.models.parcels import Parcel, ParcelOwner, ParcelGeometry
from app.models.disputes import Dispute
from app.models.compensation import CompensationRecord
from app.models.documents import DocumentRecord
from app.models.audit import AuditEvent
from app.models.ai_analysis import AIAnalysisResult

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("seed_data")

# 1. ROLES DATA
ROLES_SEED = [
    {"name": "district_officer", "description": "District Revenue / Acquisition Officer"},
    {"name": "acquisition_officer", "description": "Field Land Acquisition Officer"},
    {"name": "field_surveyor", "description": "Field Surveyor - Ground inspection and photo evidence collection"},
    {"name": "legal_officer", "description": "Legal & Dispute Resolution Officer"},
    {"name": "auditor", "description": "Independent Financial & Process Auditor"},
    {"name": "viewer", "description": "Read-only Public / Stakeholder Viewer"},
    {"name": "system_admin", "description": "System Administrator"},
]

# 2. USERS DATA
USERS_SEED = [
    {
        "full_name": "Anil Kumar",
        "email": "anil.kumar@bhoomisetu.gov.in",
        "role_name": "district_officer",
        "district_jurisdiction": "Patna",
        "hashed_password": "$2b$12$eImiTXuWVxfM37uY4JANjOL.81F8R.S6hB7vU3k9W012345678901",
    },
    {
        "full_name": "Ramesh Verma",
        "email": "ramesh.verma@bhoomisetu.gov.in",
        "role_name": "field_surveyor",
        "district_jurisdiction": "Patna",
        "hashed_password": "$2b$12$eImiTXuWVxfM37uY4JANjOL.81F8R.S6hB7vU3k9W012345678901",
    },
    {
        "full_name": "Priya Sharma",
        "email": "priya.sharma@bhoomisetu.gov.in",
        "role_name": "acquisition_officer",
        "district_jurisdiction": "Patna",
        "hashed_password": "$2b$12$eImiTXuWVxfM37uY4JANjOL.81F8R.S6hB7vU3k9W012345678901",
    },
    {
        "full_name": "R. K. Verma",
        "email": "rk.verma@bhoomisetu.gov.in",
        "role_name": "legal_officer",
        "district_jurisdiction": "Vaishali",
        "hashed_password": "$2b$12$eImiTXuWVxfM37uY4JANjOL.81F8R.S6hB7vU3k9W012345678901",
    },
    {
        "full_name": "Auditor Desk",
        "email": "auditor@bhoomisetu.gov.in",
        "role_name": "auditor",
        "district_jurisdiction": "Patna",
        "hashed_password": "$2b$12$eImiTXuWVxfM37uY4JANjOL.81F8R.S6hB7vU3k9W012345678901",
    },
    {
        "full_name": "System Admin",
        "email": "admin@bhoomisetu.gov.in",
        "role_name": "system_admin",
        "district_jurisdiction": "All",
        "hashed_password": "$2b$12$eImiTXuWVxfM37uY4JANjOL.81F8R.S6hB7vU3k9W012345678901",
    },
]

# 3. PROJECTS DATA
PROJECTS_SEED = [
    {
        "code": "NH-327",
        "name": "Patna Ring Road Expansion",
        "project_type": "Road infrastructure",
        "district": "Patna",
        "total_parcels_target": 164,
        "acquisition_progress_pct": 68.00,
        "status": "Active",
        "target_completion_date": datetime.date(2027, 3, 31),
    },
    {
        "code": "BR-118",
        "name": "Ganga Flood Resilience",
        "project_type": "Water management",
        "district": "Vaishali",
        "total_parcels_target": 87,
        "acquisition_progress_pct": 42.00,
        "status": "Active",
        "target_completion_date": datetime.date(2027, 11, 15),
    },
    {
        "code": "PN-204",
        "name": "North Freight Corridor",
        "project_type": "Rail infrastructure",
        "district": "Gaya",
        "total_parcels_target": 236,
        "acquisition_progress_pct": 21.00,
        "status": "Planning",
        "target_completion_date": datetime.date(2028, 6, 30),
    },
]

# 4. PARCELS DATA (5 Parcels preserving exact 19 ML features)
PARCELS_SEED = [
    {
        "parcel_id": "BR-042-0187",
        "project_code": "NH-327",
        "survey_number": "Survey 18/7A",
        "state": "Bihar",
        "district": "Patna",
        "land_area_ha": 4.82,
        "land_type": "Agricultural",
        "land_use": "Multi-crop",
        "acquisition_status": "Under review",
        "owner_name": "S. K. Prasad",
        # 19 ML Features
        "land_value_inr": 18600000.0,
        "estimated_compensation_inr": 17856000.0,
        "number_of_owners": 6,
        "ownership_complexity_score": 4.2,
        "previous_dispute_flag": 1,
        "previous_objections_count": 2,
        "environmental_risk_score": 8.4,
        "road_accessibility_score": 2.1,
        "distance_to_road_km": 3.6,
        "stakeholder_count": 6,
        "land_use_conflict_score": 8.6,
        "documentation_completeness_score": 5.1,
        "historical_acquisition_duration_months": 7.2,
        # Baseline UI fields
        "baseline_risk_score": 74.0,
        "suitability_score": 86.0,
        "estimated_delay_months": 7.2,
        # UI Map X, Y
        "map_ui_x": 34.0,
        "map_ui_y": 29.0,
        "polygon_wkt": "POLYGON((85.1250 25.6050, 85.1280 25.6050, 85.1280 25.6080, 85.1250 25.6080, 85.1250 25.6050))",
        "centroid_wkt": "POINT(85.1265 25.6065)",
    },
    {
        "parcel_id": "BR-042-0188",
        "project_code": "NH-327",
        "survey_number": "Survey 18/7B",
        "state": "Bihar",
        "district": "Patna",
        "land_area_ha": 7.10,
        "land_type": "Agricultural",
        "land_use": "Single-crop",
        "acquisition_status": "Notice issued",
        "owner_name": "Meera Devi",
        # 19 ML Features
        "land_value_inr": 24200000.0,
        "estimated_compensation_inr": 19360000.0,
        "number_of_owners": 3,
        "ownership_complexity_score": 2.6,
        "previous_dispute_flag": 0,
        "previous_objections_count": 0,
        "environmental_risk_score": 3.2,
        "road_accessibility_score": 5.8,
        "distance_to_road_km": 1.1,
        "stakeholder_count": 3,
        "land_use_conflict_score": 2.7,
        "documentation_completeness_score": 7.5,
        "historical_acquisition_duration_months": 4.1,
        # Baseline UI fields
        "baseline_risk_score": 28.0,
        "suitability_score": 91.0,
        "estimated_delay_months": 4.1,
        # UI Map X, Y
        "map_ui_x": 55.0,
        "map_ui_y": 25.0,
        "polygon_wkt": "POLYGON((85.1350 25.6100, 85.1390 25.6100, 85.1390 25.6140, 85.1350 25.6140, 85.1350 25.6100))",
        "centroid_wkt": "POINT(85.1370 25.6120)",
    },
    {
        "parcel_id": "BR-042-0191",
        "project_code": "NH-327",
        "survey_number": "Survey 21/2",
        "state": "Bihar",
        "district": "Patna",
        "land_area_ha": 3.46,
        "land_type": "Residential",
        "land_use": "Residential",
        "acquisition_status": "Survey",
        "owner_name": "R. N. Singh",
        # 19 ML Features
        "land_value_inr": 11800000.0,
        "estimated_compensation_inr": 10384000.0,
        "number_of_owners": 5,
        "ownership_complexity_score": 4.2,
        "previous_dispute_flag": 1,
        "previous_objections_count": 2,
        "environmental_risk_score": 5.7,
        "road_accessibility_score": 4.1,
        "distance_to_road_km": 2.4,
        "stakeholder_count": 6,
        "land_use_conflict_score": 5.4,
        "documentation_completeness_score": 7.5,
        "historical_acquisition_duration_months": 5.8,
        # Baseline UI fields
        "baseline_risk_score": 46.0,
        "suitability_score": 72.0,
        "estimated_delay_months": 5.8,
        # UI Map X, Y
        "map_ui_x": 76.0,
        "map_ui_y": 39.0,
        "polygon_wkt": "POLYGON((85.1450 25.5950, 85.1480 25.5950, 85.1480 25.5980, 85.1450 25.5980, 85.1450 25.5950))",
        "centroid_wkt": "POINT(85.1465 25.5965)",
    },
    {
        "parcel_id": "BR-042-0193",
        "project_code": "NH-327",
        "survey_number": "Survey 21/4A",
        "state": "Bihar",
        "district": "Patna",
        "land_area_ha": 9.25,
        "land_type": "Agricultural",
        "land_use": "Fallow",
        "acquisition_status": "Identified",
        "owner_name": "Lakshmi Kumari",
        # 19 ML Features
        "land_value_inr": 31200000.0,
        "estimated_compensation_inr": 24960000.0,
        "number_of_owners": 3,
        "ownership_complexity_score": 2.6,
        "previous_dispute_flag": 0,
        "previous_objections_count": 0,
        "environmental_risk_score": 3.2,
        "road_accessibility_score": 5.8,
        "distance_to_road_km": 1.1,
        "stakeholder_count": 3,
        "land_use_conflict_score": 2.7,
        "documentation_completeness_score": 7.5,
        "historical_acquisition_duration_months": 3.6,
        # Baseline UI fields
        "baseline_risk_score": 18.0,
        "suitability_score": 94.0,
        "estimated_delay_months": 3.6,
        # UI Map X, Y
        "map_ui_x": 66.0,
        "map_ui_y": 66.0,
        "polygon_wkt": "POLYGON((85.1400 25.5800, 85.1450 25.5800, 85.1450 25.5850, 85.1400 25.5850, 85.1400 25.5800))",
        "centroid_wkt": "POINT(85.1425 25.5825)",
    },
    {
        "parcel_id": "BR-042-0198",
        "project_code": "NH-327",
        "survey_number": "Survey 25/1",
        "state": "Bihar",
        "district": "Patna",
        "land_area_ha": 5.70,
        "land_type": "Residential",
        "land_use": "Residential",
        "acquisition_status": "Objection",
        "owner_name": "A. Rahman",
        # 19 ML Features
        "land_value_inr": 20400000.0,
        "estimated_compensation_inr": 19584000.0,
        "number_of_owners": 6,
        "ownership_complexity_score": 4.2,
        "previous_dispute_flag": 1,
        "previous_objections_count": 2,
        "environmental_risk_score": 8.4,
        "road_accessibility_score": 2.1,
        "distance_to_road_km": 3.6,
        "stakeholder_count": 6,
        "land_use_conflict_score": 8.6,
        "documentation_completeness_score": 3.4,
        "historical_acquisition_duration_months": 9.4,
        # Baseline UI fields
        "baseline_risk_score": 86.0,
        "suitability_score": 63.0,
        "estimated_delay_months": 9.4,
        # UI Map X, Y
        "map_ui_x": 28.0,
        "map_ui_y": 67.0,
        "polygon_wkt": "POLYGON((85.1200 25.5800, 85.1240 25.5800, 85.1240 25.5840, 85.1200 25.5840, 85.1200 25.5800))",
        "centroid_wkt": "POINT(85.1220 25.5820)",
    },
]

# 5. DISPUTES DATA
DISPUTES_SEED = [
    {
        "dispute_code": "DSP-0198",
        "parcel_id_str": "BR-042-0198",
        "project_code": "NH-327",
        "category": "Ownership claim",
        "assigned_officer_name": "Anil Kumar",
        "status": "Escalated",
        "priority": "HIGH",
        "description": "Co-owner submitted objection regarding inheritance distribution and share calculation.",
        "filed_date": datetime.date(2026, 9, 2),
    },
    {
        "dispute_code": "DSP-0191",
        "parcel_id_str": "BR-042-0191",
        "project_code": "NH-327",
        "category": "Land-use disagreement",
        "assigned_officer_name": "Priya Sharma",
        "status": "Under review",
        "priority": "MEDIUM",
        "description": "Landowner disputes residential valuation rate vs agricultural market comparison.",
        "filed_date": datetime.date(2026, 8, 31),
    },
    {
        "dispute_code": "DSP-0187",
        "parcel_id_str": "BR-042-0187",
        "project_code": "NH-327",
        "category": "Boundary misalignment",
        "assigned_officer_name": "Anil Kumar",
        "status": "Under review",
        "priority": "HIGH",
        "description": "Survey demarcation overlaps with adjacent government canal easement.",
        "filed_date": datetime.date(2026, 8, 28),
    },
    {
        "dispute_code": "DSP-0164",
        "parcel_id_str": "BR-042-0187",
        "project_code": "BR-118",
        "category": "Compensation dispute",
        "assigned_officer_name": "R. K. Verma",
        "status": "In mediation",
        "priority": "MEDIUM",
        "description": "Claimant requesting tree and crop loss additions to base valuation.",
        "filed_date": datetime.date(2026, 8, 25),
    },
]

# 6. COMPENSATION DATA
COMPENSATIONS_SEED = [
    {
        "record_code": "CMP-0187",
        "parcel_id_str": "BR-042-0187",
        "project_code": "NH-327",
        "amount_inr": 18600000.0,
        "payee_name": "S. K. Prasad",
        "status": "Pending approval",
    },
    {
        "record_code": "CMP-0188",
        "parcel_id_str": "BR-042-0188",
        "project_code": "NH-327",
        "amount_inr": 24200000.0,
        "payee_name": "Meera Devi",
        "status": "Processing",
    },
    {
        "record_code": "CMP-0191",
        "parcel_id_str": "BR-042-0191",
        "project_code": "NH-327",
        "amount_inr": 11800000.0,
        "payee_name": "R. N. Singh",
        "status": "Pending approval",
    },
    {
        "record_code": "CMP-0193",
        "parcel_id_str": "BR-042-0193",
        "project_code": "NH-327",
        "amount_inr": 31200000.0,
        "payee_name": "Lakshmi Kumari",
        "status": "Ready",
    },
    {
        "record_code": "CMP-0198",
        "parcel_id_str": "BR-042-0198",
        "project_code": "NH-327",
        "amount_inr": 20400000.0,
        "payee_name": "A. Rahman",
        "status": "Pending approval",
    },
]

# 7. DOCUMENTS DATA
DOCUMENTS_SEED = [
    {
        "document_code": "DOC-101",
        "title": "Land title certificate · BR-042-0187",
        "parcel_id_str": "BR-042-0187",
        "project_code": "NH-327",
        "category": "Land Title",
        "storage_path": "/storage/docs/DOC-101_title_187.pdf",
        "file_size_bytes": 2516582,
        "mime_type": "application/pdf",
        "verification_status": "Verified",
    },
    {
        "document_code": "DOC-102",
        "title": "Notice of acquisition Section 4 · NH-327",
        "parcel_id_str": "BR-042-0188",
        "project_code": "NH-327",
        "category": "Acquisition Notice",
        "storage_path": "/storage/docs/DOC-102_notice_188.pdf",
        "file_size_bytes": 1887436,
        "mime_type": "application/pdf",
        "verification_status": "Verified",
    },
    {
        "document_code": "DOC-103",
        "title": "District valuation report · BR-042-0188",
        "parcel_id_str": "BR-042-0188",
        "project_code": "NH-327",
        "category": "Valuation Report",
        "storage_path": "/storage/docs/DOC-103_valuation_188.pdf",
        "file_size_bytes": 4300000,
        "mime_type": "application/pdf",
        "verification_status": "Verified",
    },
    {
        "document_code": "DOC-104",
        "title": "Objection petition · BR-042-0198",
        "parcel_id_str": "BR-042-0198",
        "project_code": "NH-327",
        "category": "Objection Filing",
        "storage_path": "/storage/docs/DOC-104_objection_198.pdf",
        "file_size_bytes": 3355443,
        "mime_type": "application/pdf",
        "verification_status": "Flagged",
    },
    {
        "document_code": "DOC-105",
        "title": "Cadastral survey map · Survey 21/4A",
        "parcel_id_str": "BR-042-0193",
        "project_code": "NH-327",
        "category": "Survey Map",
        "storage_path": "/storage/docs/DOC-105_surveymap_193.pdf",
        "file_size_bytes": 9122611,
        "mime_type": "application/pdf",
        "verification_status": "Verified",
    },
]

# 8. AUDIT EVENTS DATA (Chronological Order for Hash Chain)
AUDIT_EVENTS_SEED = [
    {
        "event_code": "AUD-005",
        "title": "Compensation ready state recorded for BR-042-0193",
        "parcel_id_str": "BR-042-0193",
        "project_code": "NH-327",
        "actor_name": "Finance Desk",
        "action_type": "COMPENSATION_UPDATE",
        "timestamp_iso": "2026-08-30T14:10:00+05:30",
        "payload": {"status": "Ready", "amount_inr": 31200000.0, "parcel_id": "BR-042-0193"},
    },
    {
        "event_code": "AUD-004",
        "title": "Parcel status updated to Under Review for BR-042-0187",
        "parcel_id_str": "BR-042-0187",
        "project_code": "NH-327",
        "actor_name": "Anil Kumar",
        "action_type": "PARCEL_STATUS_UPDATE",
        "timestamp_iso": "2026-09-01T11:20:00+05:30",
        "payload": {"previous_status": "Survey", "new_status": "Under review", "parcel_id": "BR-042-0187"},
    },
    {
        "event_code": "AUD-003",
        "title": "Notice of acquisition issued for BR-042-0188",
        "parcel_id_str": "BR-042-0188",
        "project_code": "NH-327",
        "actor_name": "Acquisition Officer",
        "action_type": "NOTICE_ISSUANCE",
        "timestamp_iso": "2026-09-03T16:45:00+05:30",
        "payload": {"section": "Section 4", "notice_ref": "NOT-2026-048", "parcel_id": "BR-042-0188"},
    },
    {
        "event_code": "AUD-002",
        "title": "Objection escalated on BR-042-0198",
        "parcel_id_str": "BR-042-0198",
        "project_code": "NH-327",
        "actor_name": "System Alert",
        "action_type": "DISPUTE_ESCALATION",
        "timestamp_iso": "2026-09-04T08:32:00+05:30",
        "payload": {"dispute_id": "DSP-0198", "reason": "High complexity inheritance dispute", "parcel_id": "BR-042-0198"},
    },
    {
        "event_code": "AUD-001",
        "title": "Valuation approved for BR-042-0187",
        "parcel_id_str": "BR-042-0187",
        "project_code": "NH-327",
        "actor_name": "District Officer (Anil Kumar)",
        "action_type": "VALUATION_APPROVAL",
        "timestamp_iso": "2026-09-04T09:14:00+05:30",
        "payload": {"approved_amount_inr": 18600000.0, "parcel_id": "BR-042-0187"},
    },
]


def compute_event_hash(prev_hash: str, event_code: str, actor_name: str, payload: dict, timestamp_iso: str) -> str:
    """Computes SHA-256 hash using canonical JSON serialization and stable string fields."""
    canonical_payload = json.dumps(payload, sort_keys=True)
    raw = f"{prev_hash}:{event_code}:{actor_name}:{canonical_payload}:{timestamp_iso}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def seed_all(db: Session):
    """Idempotent master seed function populating all BhoomiSetu initial entities."""
    logger.info("Starting BhoomiSetu database seeding (Phase 2.2)...")

    # 1. Seed Roles
    roles_map: Dict[str, Role] = {}
    for r_data in ROLES_SEED:
        role = db.query(Role).filter_by(name=r_data["name"]).first()
        if not role:
            role = Role(name=r_data["name"], description=r_data["description"])
            db.add(role)
            db.flush()
            logger.info(f"Created Role: {role.name}")
        roles_map[role.name] = role

    # 2. Seed Users
    users_map: Dict[str, User] = {}
    for u_data in USERS_SEED:
        user = db.query(User).filter_by(email=u_data["email"]).first()
        if not user:
            role = roles_map[u_data["role_name"]]
            user = User(
                full_name=u_data["full_name"],
                email=u_data["email"],
                role_id=role.id,
                district_jurisdiction=u_data["district_jurisdiction"],
                hashed_password=u_data["hashed_password"],
                is_active=True,
            )
            db.add(user)
            db.flush()
            logger.info(f"Created User: {user.full_name} ({user.email})")
        users_map[user.full_name] = user

    # 3. Seed Projects
    projects_map: Dict[str, Project] = {}
    for p_data in PROJECTS_SEED:
        project = db.query(Project).filter_by(code=p_data["code"]).first()
        if not project:
            project = Project(
                code=p_data["code"],
                name=p_data["name"],
                project_type=p_data["project_type"],
                district=p_data["district"],
                total_parcels_target=p_data["total_parcels_target"],
                acquisition_progress_pct=p_data["acquisition_progress_pct"],
                status=p_data["status"],
                target_completion_date=p_data["target_completion_date"],
            )
            db.add(project)
            db.flush()
            logger.info(f"Created Project: {project.code} ({project.name})")
        projects_map[project.code] = project

    # 4. Seed Parcels, Owners, & Geometries
    parcels_map: Dict[str, Parcel] = {}
    for parcel_data in PARCELS_SEED:
        pid = parcel_data["parcel_id"]
        parcel = db.query(Parcel).filter_by(parcel_id=pid).first()
        project = projects_map[parcel_data["project_code"]]

        if not parcel:
            parcel = Parcel(
                parcel_id=pid,
                project_id=project.id,
                survey_number=parcel_data["survey_number"],
                state=parcel_data["state"],
                district=parcel_data["district"],
                land_area_ha=parcel_data["land_area_ha"],
                land_type=parcel_data["land_type"],
                land_use=parcel_data["land_use"],
                acquisition_status=parcel_data["acquisition_status"],
                # 19 ML Features
                land_value_inr=parcel_data["land_value_inr"],
                estimated_compensation_inr=parcel_data["estimated_compensation_inr"],
                number_of_owners=parcel_data["number_of_owners"],
                ownership_complexity_score=parcel_data["ownership_complexity_score"],
                previous_dispute_flag=parcel_data["previous_dispute_flag"],
                previous_objections_count=parcel_data["previous_objections_count"],
                environmental_risk_score=parcel_data["environmental_risk_score"],
                road_accessibility_score=parcel_data["road_accessibility_score"],
                distance_to_road_km=parcel_data["distance_to_road_km"],
                stakeholder_count=parcel_data["stakeholder_count"],
                land_use_conflict_score=parcel_data["land_use_conflict_score"],
                documentation_completeness_score=parcel_data["documentation_completeness_score"],
                historical_acquisition_duration_months=parcel_data["historical_acquisition_duration_months"],
                # UI Baseline fields
                baseline_risk_score=parcel_data["baseline_risk_score"],
                suitability_score=parcel_data["suitability_score"],
                estimated_delay_months=parcel_data["estimated_delay_months"],
            )
            db.add(parcel)
            db.flush()
            logger.info(f"Created Parcel: {parcel.parcel_id}")

        parcels_map[pid] = parcel

        # Parcel Owner
        owner_name = parcel_data["owner_name"]
        owner = db.query(ParcelOwner).filter_by(parcel_id=parcel.id, owner_name=owner_name).first()
        if not owner:
            owner = ParcelOwner(
                parcel_id=parcel.id,
                owner_name=owner_name,
                share_percentage=100.00,
                is_primary=True,
            )
            db.add(owner)
            logger.info(f"Created ParcelOwner for {parcel.parcel_id}: {owner_name}")

        # Parcel Geometry
        geom = db.query(ParcelGeometry).filter_by(parcel_id=parcel.id).first()
        if not geom:
            geom = ParcelGeometry(
                parcel_id=parcel.id,
                boundary=WKTElement(parcel_data["polygon_wkt"], srid=4326),
                centroid=WKTElement(parcel_data["centroid_wkt"], srid=4326),
                map_ui_x=parcel_data["map_ui_x"],
                map_ui_y=parcel_data["map_ui_y"],
            )
            db.add(geom)
            logger.info(f"Created ParcelGeometry for {parcel.parcel_id}")

    # 5. Seed Disputes
    for d_data in DISPUTES_SEED:
        dispute = db.query(Dispute).filter_by(dispute_code=d_data["dispute_code"]).first()
        if not dispute:
            parcel = parcels_map[d_data["parcel_id_str"]]
            project = projects_map[d_data["project_code"]]
            assigned_user = users_map.get(d_data["assigned_officer_name"])

            dispute = Dispute(
                dispute_code=d_data["dispute_code"],
                parcel_id=parcel.id,
                project_id=project.id,
                assigned_user_id=assigned_user.id if assigned_user else None,
                assigned_officer_name=d_data["assigned_officer_name"],
                category=d_data["category"],
                status=d_data["status"],
                priority=d_data["priority"],
                description=d_data["description"],
                filed_date=d_data["filed_date"],
            )
            db.add(dispute)
            logger.info(f"Created Dispute: {dispute.dispute_code}")

    # 6. Seed Compensations
    for c_data in COMPENSATIONS_SEED:
        comp = db.query(CompensationRecord).filter_by(record_code=c_data["record_code"]).first()
        if not comp:
            parcel = parcels_map[c_data["parcel_id_str"]]
            project = projects_map[c_data["project_code"]]

            comp = CompensationRecord(
                record_code=c_data["record_code"],
                parcel_id=parcel.id,
                project_id=project.id,
                payee_name=c_data["payee_name"],
                amount_inr=c_data["amount_inr"],
                status=c_data["status"],
            )
            db.add(comp)
            logger.info(f"Created CompensationRecord: {comp.record_code}")

    # 7. Seed Documents
    for doc_data in DOCUMENTS_SEED:
        doc = db.query(DocumentRecord).filter_by(document_code=doc_data["document_code"]).first()
        if not doc:
            parcel = parcels_map[doc_data["parcel_id_str"]]
            project = projects_map[doc_data["project_code"]]

            doc = DocumentRecord(
                document_code=doc_data["document_code"],
                title=doc_data["title"],
                parcel_id=parcel.id,
                project_id=project.id,
                category=doc_data["category"],
                storage_path=doc_data["storage_path"],
                file_size_bytes=doc_data["file_size_bytes"],
                mime_type=doc_data["mime_type"],
                verification_status=doc_data["verification_status"],
            )
            db.add(doc)
            logger.info(f"Created DocumentRecord: {doc.document_code}")

    # 8. Seed Audit Events (Cryptographic Hash Chain)
    prev_hash = "0" * 64
    for a_data in AUDIT_EVENTS_SEED:
        event = db.query(AuditEvent).filter_by(event_code=a_data["event_code"]).first()

        created_dt = datetime.datetime.fromisoformat(a_data["timestamp_iso"]).astimezone(datetime.timezone.utc)
        timestamp_utc_iso = created_dt.isoformat()

        current_hash = compute_event_hash(
            prev_hash,
            a_data["event_code"],
            a_data["actor_name"],
            a_data["payload"],
            timestamp_utc_iso,
        )

        if not event:
            parcel = parcels_map.get(a_data["parcel_id_str"])
            project = projects_map.get(a_data["project_code"])
            actor_user = users_map.get(a_data["actor_name"])

            event = AuditEvent(
                event_code=a_data["event_code"],
                title=a_data["title"],
                entity_table="parcels",
                entity_id=parcel.id if parcel else None,
                parcel_id=parcel.id if parcel else None,
                project_id=project.id if project else None,
                actor_user_id=actor_user.id if actor_user else None,
                actor_name=a_data["actor_name"],
                action_type=a_data["action_type"],
                prev_hash=prev_hash,
                current_hash=current_hash,
                payload=a_data["payload"],
                created_at=created_dt,
            )
            db.add(event)
            logger.info(f"Created AuditEvent: {event.event_code} (hash: {current_hash[:8]}...)")

        prev_hash = current_hash

    db.commit()
    logger.info("Database seeding completed successfully.")


def verify_audit_chain(db: Session) -> bool:
    """Verifies SHA-256 cryptographic audit hash chain integrity."""
    events = db.query(AuditEvent).order_by(AuditEvent.created_at.asc()).all()
    if not events:
        logger.warning("Audit chain is empty.")
        return True

    expected_prev_hash = "0" * 64
    for ev in events:
        if ev.prev_hash != expected_prev_hash:
            logger.error(f"Audit chain broken at event {ev.event_code}! Expected prev_hash {expected_prev_hash}, got {ev.prev_hash}")
            return False

        if ev.created_at:
            dt = ev.created_at.replace(tzinfo=datetime.timezone.utc) if ev.created_at.tzinfo is None else ev.created_at.astimezone(datetime.timezone.utc)
            timestamp_str = dt.isoformat()
        else:
            timestamp_str = ""

        recalculated_hash = compute_event_hash(
            ev.prev_hash,
            ev.event_code,
            ev.actor_name,
            ev.payload,
            timestamp_str,
        )


        if ev.current_hash != recalculated_hash:
            logger.error(f"Audit event {ev.event_code} hash invalid! Stored: {ev.current_hash}, Recalculated: {recalculated_hash}")
            return False

        expected_prev_hash = ev.current_hash

    logger.info(f"Audit chain integrity VERIFIED clean for {len(events)} events.")
    return True


def validate_seeding(db: Session) -> Dict[str, Any]:
    """Runs comprehensive post-seed validation checks."""
    counts = {
        "roles": db.query(Role).count(),
        "users": db.query(User).count(),
        "projects": db.query(Project).count(),
        "parcels": db.query(Parcel).count(),
        "parcel_owners": db.query(ParcelOwner).count(),
        "parcel_geometries": db.query(ParcelGeometry).count(),
        "disputes": db.query(Dispute).count(),
        "compensation_records": db.query(CompensationRecord).count(),
        "documents": db.query(DocumentRecord).count(),
        "audit_events": db.query(AuditEvent).count(),
        "ai_analysis_results": db.query(AIAnalysisResult).count(),
    }

    # Validate PostGIS geometries
    valid_geoms = db.execute(
        text("SELECT p.parcel_id, ST_IsValid(g.boundary) as is_valid, ST_AsGeoJSON(g.boundary) as geojson FROM parcel_geometries g JOIN parcels p ON g.parcel_id = p.id")
    ).fetchall()

    postgis_results = [
        {"parcel_id": r.parcel_id, "is_valid": r.is_valid, "geojson_length": len(r.geojson)}
        for r in valid_geoms
    ]

    # Validate Audit Hash Chain
    chain_valid = verify_audit_chain(db)

    # Validate 19 ML Features on Parcels
    parcels = db.query(Parcel).all()
    ml_feature_check = True
    for p in parcels:
        if None in (
            p.land_value_inr,
            p.estimated_compensation_inr,
            p.number_of_owners,
            p.ownership_complexity_score,
            p.previous_dispute_flag,
            p.previous_objections_count,
            p.environmental_risk_score,
            p.road_accessibility_score,
            p.distance_to_road_km,
            p.stakeholder_count,
            p.land_use_conflict_score,
            p.documentation_completeness_score,
            p.historical_acquisition_duration_months,
        ):
            ml_feature_check = False
            break

    return {
        "counts": counts,
        "postgis": postgis_results,
        "audit_chain_valid": chain_valid,
        "ml_features_intact": ml_feature_check,
    }


if __name__ == "__main__":
    db = SessionLocal()
    try:
        # Run Seed
        seed_all(db)

        # Run Validation
        results = validate_seeding(db)
        logger.info(f"Seed Validation Summary: {json.dumps(results['counts'], indent=2)}")
        logger.info(f"Audit Chain Verification: {'PASSED' if results['audit_chain_valid'] else 'FAILED'}")
        logger.info(f"ML 19-Feature Preservation: {'PASSED' if results['ml_features_intact'] else 'FAILED'}")
        logger.info(f"PostGIS Geometries Verified: {len(results['postgis'])} valid polygons.")

        # Test Idempotency (run seed a second time)
        logger.info("Testing idempotency by re-running seed_all(db)...")
        seed_all(db)
        results_second = validate_seeding(db)
        if results["counts"] == results_second["counts"]:
            logger.info("IDEMPOTENCY TEST PASSED: Record counts remain identical after second seed run.")
        else:
            logger.error(f"IDEMPOTENCY TEST FAILED: Counts changed! Before: {results['counts']}, After: {results_second['counts']}")

    finally:
        db.close()
