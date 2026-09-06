# BhoomiSetu Platform — Production & Container Deployment Guide

This guide documents single-command containerized deployment of the BhoomiSetu platform using **Docker** & **Docker Compose**.

---

## 1. System Architecture Overview

```
                      ┌─────────────────────────┐
                      │      Client Browser     │
                      └────────────┬────────────┘
                                   │ HTTP :80
                                   ▼
                       ┌───────────────────────┐
                       │     Nginx Web Server  │
                       │  (React Static SPA +  │
                       │  Reverse Proxy /api)  │
                       └───────────┬───────────┘
                                   │
                     ┌─────────────┴─────────────┐
                     │  http://api:8000/api/v1   │
                     ▼                           ▼
          ┌─────────────────────┐     ┌─────────────────────┐
          │  FastAPI Backend    │     │   MinIO Object S3   │
          │  (Python 3.12 + ML) │────►│   Storage Container │
          └──────────┬──────────┘     └─────────────────────┘
                     │
                     ▼
          ┌─────────────────────┐
          │ PostgreSQL 16 +     │
          │ PostGIS 3.4         │
          └─────────────────────┘
```

### Stack Components & Ports

| Component | Technology | Container Name | Internal Port | Exposed Port / Access |
|---|---|---|---|---|
| **Web Server / Proxy** | Nginx 1.25 + React SPA | `bhoomisetu_web` | 80 | `http://localhost` |
| **API Backend** | FastAPI + Python 3.12 | `bhoomisetu_api` | 8000 | `http://localhost:8000` (`/api/v1/docs`) |
| **Spatial Database** | PostgreSQL 16 + PostGIS 3.4 | `bhoomisetu_db` | 5432 | `localhost:5432` |
| **Object Storage** | MinIO S3 Engine | `bhoomisetu_minio` | 9000 / 9001 | `localhost:9001` (Admin Console) |

---

## 2. Quickstart Deployment (Single-Command Startup)

### Step 1: Clone Repository & Configure Environment
```bash
cp .env.example .env
```
Edit `.env` to supply production secrets (`POSTGRES_PASSWORD`, `JWT_SECRET_KEY`, `MINIO_ROOT_PASSWORD`).

### Step 2: Build & Launch Stack
```bash
docker compose up -d --build
```

### Step 3: Seed Demo Data (Optional / First Time)
```bash
docker compose run --rm seed
```

---

## 3. Container Verification & Health Checks

Verify that all stack services report a healthy status:
```bash
docker compose ps
```

Verify backend health API:
```bash
curl -f http://localhost/api/v1/health
```

Expected output:
```json
{
  "status": "ok",
  "service": "bhoomisetu-api",
  "model": "acquisition-risk-0.1.0",
  "database": "connected"
}
```

Run test suite inside container:
```bash
docker compose exec api python -m pytest backend/tests/ -v
```

---

## 4. Production Persistence & Backup Policy

### Persistent Docker Volumes
- `postgres_data`: Persists PostgreSQL 16 PostGIS tables, parcel spatial boundaries, user accounts, and SHA-256 audit events.
- `minio_data`: Persists MinIO S3 object storage payloads (`bhoomisetu-documents`).
- `upload_data`: Persists local fallback uploads.

> [!IMPORTANT]
> **Enterprise Backup Strategy**:
> - **Database Backup**: Schedule nightly `pg_dump -U bhoomisetu_user bhoomisetu_db > backup.sql` or use PostgreSQL continuous archiving.
> - **Object Storage Backup**: Configure MinIO bucket replication (`mc mirror`) or S3 cross-region replication for offsite disaster recovery.
