"""
BhoomiSetu Phase 3.7 Non-Brittle Performance Smoke Benchmarks.

Measures p50, p95, and max execution latencies across core BhoomiSetu endpoints
using warm-up requests followed by N measured trials.

Environment Context:
- Single-instance local / developer workstation environment
- Local PostgreSQL / PostGIS database
- Local MinIO object storage

Note: Latency values are reported as performance benchmarks and are not treated
as universal production hard pass/fail gates.
"""

import os
import sys
import time
import pytest
import numpy as np
from fastapi.testclient import TestClient
from sqlalchemy import text

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.main import app
from app.db.session import engine, SessionLocal


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


BENCHMARK_PDF_BYTES = b"%PDF-1.4\nBenchmark test payload\n%%EOF"


def measure_endpoint(
    name: str,
    method: str,
    url: str,
    warmup: int = 3,
    trials: int = 15,
    headers: dict = None,
    json_payload: dict = None,
    files: dict = None,
    data: dict = None,
) -> dict:
    headers = dict(headers or {})

    # 1. Warm-up runs
    for _ in range(warmup):
        curr_files = {"file": ("benchmark_doc.pdf", BENCHMARK_PDF_BYTES, "application/pdf")} if files else None
        if method.upper() == "GET":
            w_resp = client.get(url, headers=headers)
        elif method.upper() == "POST":
            w_resp = client.post(url, headers=headers, json=json_payload, files=curr_files, data=data)
        assert w_resp.status_code in (200, 201), f"Warmup failed for {name} ({url}): {w_resp.status_code} - {w_resp.text}"


    # 2. Measured trials
    latencies_ms = []
    for _ in range(trials):
        curr_files = {"file": ("benchmark_doc.pdf", BENCHMARK_PDF_BYTES, "application/pdf")} if files else None

        start_time = time.perf_counter()
        if method.upper() == "GET":
            resp = client.get(url, headers=headers)
        elif method.upper() == "POST":
            resp = client.post(url, headers=headers, json=json_payload, files=curr_files, data=data)
        elapsed_ms = (time.perf_counter() - start_time) * 1000.0
        assert resp.status_code in (200, 201), f"Benchmark failed for {name} ({url}): {resp.status_code} - {resp.text}"
        latencies_ms.append(elapsed_ms)


    p50 = float(np.percentile(latencies_ms, 50))
    p95 = float(np.percentile(latencies_ms, 95))
    max_lat = float(np.max(latencies_ms))

    return {
        "endpoint": name,
        "p50_ms": p50,
        "p95_ms": p95,
        "max_ms": max_lat,
    }


@skip_if_no_db
def test_performance_benchmarks_report():
    """Measures and logs p50, p95, max latencies for core BhoomiSetu endpoints."""
    # Obtain auth token for protected benchmarks
    login_resp = client.post("/api/v1/auth/login", json={"email": "admin@bhoomisetu.gov.in", "password": "bhoomisetu123"})
    token = login_resp.json()["access_token"]
    auth_headers = {"Authorization": f"Bearer {token}"}

    results = []

    # 1. Health Liveness & Readiness
    results.append(measure_endpoint("GET /health", "GET", "/health"))

    # 2. Authentication Login
    results.append(
        measure_endpoint(
            "POST /auth/login",
            "POST",
            "/api/v1/auth/login",
            json_payload={"email": "anil.kumar@bhoomisetu.gov.in", "password": "bhoomisetu123"},
        )
    )

    # 3. PostGIS Nearby Parcels
    results.append(
        measure_endpoint(
            "GET /gis/parcels/nearby",
            "GET",
            "/api/v1/gis/parcels/nearby?lat=25.5941&lon=85.1376&radius_km=10",
            headers=auth_headers,
        )
    )


    # 4. ML Risk Explanation + SHAP
    ai_payload = {
        "parcel_id": "BR-042-0187",
        "state": "Bihar",
        "district": "Patna",
        "land_type": "Agricultural",
        "land_use": "Multi-crop",
        "project_type": "Road infrastructure",
        "land_area": 4.82,
        "number_of_owners": 6.0,
        "ownership_complexity": 4.2,
        "previous_dispute": 1.0,
        "previous_objections": 2.0,
        "land_value": 18600000.0,
        "estimated_compensation": 17856000.0,
        "environmental_risk": 8.4,
        "road_accessibility": 2.1,
        "distance_to_road": 3.6,
        "stakeholder_count": 6.0,
        "land_use_conflict": 8.6,
        "documentation_completeness": 5.1,
        "historical_acquisition_duration": 7.2,
    }
    results.append(
        measure_endpoint(
            "POST /ai/risk/explain",
            "POST",
            "/api/v1/ai/risk/explain",
            headers=auth_headers,
            json_payload=ai_payload,
        )
    )

    # 5. MinIO Document Upload
    db = SessionLocal()
    try:
        from app.models.projects import Project
        proj = db.query(Project).first()
        proj_id = str(proj.id) if proj else None
    finally:
        db.close()

    file_bytes = b"%PDF-1.4\nBenchmark test payload\n%%EOF"
    results.append(
        measure_endpoint(
            "POST /documents/upload",
            "POST",
            "/api/v1/documents/upload",
            headers=auth_headers,
            files={"file": ("benchmark_doc.pdf", file_bytes, "application/pdf")},
            data={"title": "Benchmark Title", "category": "General", "project_id": proj_id},
        )
    )


    # 6. Cryptographic Audit Chain Verification
    results.append(
        measure_endpoint(
            "GET /audit",
            "GET",
            "/api/v1/audit",
            headers=auth_headers,
        )
    )

    # Format output benchmark table for display in test reports
    print("\n" + "=" * 65)
    print("BhoomiSetu 0.3.0 Latency Benchmark Performance Summary")
    print("Environment: Single-Instance / Local Developer Workstation")
    print("=" * 65)
    print(f"{'Endpoint':<25} {'p50 (ms)':<12} {'p95 (ms)':<12} {'max (ms)':<12}")
    print("-" * 65)
    for r in results:
        print(f"{r['endpoint']:<25} {r['p50_ms']:<12.2f} {r['p95_ms']:<12.2f} {r['max_ms']:<12.2f}")
    print("=" * 65 + "\n")

    # Non-brittle assertions: ensure benchmarks complete successfully and values are positive
    for r in results:
        assert r["p50_ms"] > 0
        assert r["p95_ms"] >= r["p50_ms"]
        assert r["max_ms"] >= r["p95_ms"]
