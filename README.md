# BhoomiSetu (भूमिसेतु) 🌾 - National Land Intelligence Platform

> **BhoomiSetu 0.3.0 Release Candidate — Hackathon / Single-Instance Deployment**  
> Developed by **Team The Mavericks** | Smart India Hackathon (SIH)

**BhoomiSetu** is an AI-powered National Land Intelligence Platform designed to streamline land acquisition for large-scale infrastructure projects. It combines **Machine Learning risk scoring**, **SHAP explainable AI**, **interactive PostGIS spatial layers**, **offline field survey synchronization**, and **tamper-evident SHA-256 audit tracking** to mitigate delays, prevent disputes, and optimize compensation distribution.

---

## 📚 Table of Contents

- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Repository Structure](#-repository-structure)
- [Prerequisites](#-prerequisites)
- [Environment Configuration (.env)](#-environment-configuration-env)
- [Manual Step-by-Step Setup Guide](#-manual-step-by-step-setup-guide)
  - [Step 1: Python Virtual Environment & Dependencies](#step-1-python-virtual-environment--dependencies)
  - [Step 2: Database Initialization & Alembic Migrations](#step-2-database-initialization--alembic-migrations)
  - [Step 3: Database Data Seeding](#step-3-database-data-seeding)
  - [Step 4: Machine Learning Model Setup](#step-4-machine-learning-model-setup)
  - [Step 5: Run the FastAPI Backend Server](#step-5-run-the-fastapi-backend-server)
  - [Step 6: Run the React SPA Frontend](#step-6-run-the-react-spa-frontend)
- [Default Seeded User Credentials](#-default-seeded-user-credentials)
- [Docker Single-Command Alternative](#-docker-single-command-alternative)
- [Running Test Suite & Benchmarks](#-running-test-suite--benchmarks)
- [API Endpoints Reference](#-api-endpoints-reference)
- [Troubleshooting](#-troubleshooting)

---

## ✨ Features

- 🎯 **AI Acquisition Risk Scoring**: Classifies land parcels into 4 risk tiers (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`) using 19+ physical, economic, and social parameters.
- 🔍 **Explainable AI (SHAP)**: Provides granular feature attribution so officers can understand *why* a parcel is marked high risk (e.g. `ownership_complexity (+21.0)`, `previous_dispute (+19.0)`).
- 🗺️ **Live PostGIS GIS Command Center**: Interactive spatial map interface color-coded by risk with BBOX & distance query capabilities.
- 📋 **Parcel & Project Management**: Lifecycle tracking across stages (*Identified ➔ Survey ➔ Notice ➔ Valuation ➔ Objection ➔ Compensation ➔ Approval ➔ Acquired*).
- 📱 **Offline-First Field Surveyor PWA**: Field inspection app with IndexedDB local queue, photo evidence upload, and dual-layer idempotent synchronization.
- ⚖️ **Dispute & Objection Resolution**: Dedicated workflows for handling land-use conflicts and title objections.
- 🛡️ **Cryptographic SHA-256 Audit Trail**: Tamper-evident hash chain verification tracking critical acquisition actions.
- 🔔 **Real-Time WebSockets**: Instant event broadcasts filtered by target user role and jurisdiction.
- 🎬 **Deterministic Demo Reset**: 1-click baseline reset for reproducible hackathon presentations (`POST /api/v1/demo/reset`).

---

## 🛠️ Tech Stack

### **Frontend**
- **Framework**: React 19 + TypeScript + Vite 8
- **UI & Styling**: Vanilla CSS (Glassmorphism design system), Lucide React Icons
- **Offline Storage**: IndexedDB (native browser storage)
- **Tooling**: Oxlint

### **Backend & API**
- **Framework**: FastAPI (Python 3.12)
- **Database ORM**: SQLAlchemy 2.0 + GeoAlchemy2 + Alembic Migrations
- **Spatial Database**: PostgreSQL 16 + PostGIS 3.4
- **Object Storage**: MinIO S3 Engine / Local Filesystem Storage
- **Authentication & RBAC**: JWT Bearer Tokens + Database-authoritative Role checks
- **Security Middleware**: CORS, Security Headers (`nosniff`, `DENY`, `CSP`), Request Correlation IDs (`X-Request-ID`), Sliding-Window Rate Limiting

### **Machine Learning**
- **Core ML**: Python, `scikit-learn`, `RandomForestClassifier`, `XGBoost`
- **Explainability**: `SHAP` (SHapley Additive exPlanations)
- **Data Pipelines**: Imputation, One-Hot Encoding, StandardScaler

---

## 📁 Repository Structure

```text
sih_paradox/
├── backend/                  # Python FastAPI Backend
│   ├── alembic/              # Database migration scripts
│   ├── app/
│   │   ├── api/              # API V1 routes (auth, gis, parcels, disputes, documents, audit, demo)
│   │   ├── core/             # Security & JWT utilities
│   │   ├── db/               # SQLAlchemy Session engine
│   │   ├── models/           # DB models (User, Role, Project, Parcel, Dispute, Compensation, Audit)
│   │   ├── seeds/            # Idempotent seed data script (seed_data.py)
│   │   ├── services/         # Storage, Audit, Event Publisher, ML Persistence services
│   │   └── main.py           # FastAPI entrypoint & middleware configuration
│   ├── tests/                # 70 Pytest integration & benchmark suites
│   └── requirements.txt      # Backend Python dependencies
├── ml/                       # Machine Learning Codebase
│   ├── data/                 # Training dataset (land_acquisition_dataset.csv)
│   ├── models/               # Pre-trained ML artifacts (.pkl)
│   └── src/                  # ML training, evaluation, prediction & SHAP scripts
├── src/                      # React TypeScript Frontend
│   ├── api/                  # API client, auth JWT, IndexedDB, WebSocket handlers
│   ├── components/           # FieldApp, DemoStoryModal, UI components
│   ├── App.tsx               # Primary SPA layout & tab navigation
│   └── App.css               # Design system & responsive styles
├── Dockerfile                # Multi-stage production container build
├── docker-compose.yml        # Orchestrated stack (Nginx, FastAPI, PostgreSQL/PostGIS, MinIO)
├── DEPLOYMENT.md             # Single-instance deployment guide
├── PRESENTATION.md           # Hackathon 3-5 min presentation script & checklist
└── README.md                 # Primary project documentation
```

---

## ⚙️ Prerequisites

To run **BhoomiSetu** manually, install the following software on your system:

1. **Node.js** (v18.0.0 or higher) & **npm** - [Download Node.js](https://nodejs.org/)
2. **Python** (v3.10 or higher, 3.12 recommended) - [Download Python](https://www.python.org/)
3. **PostgreSQL 16** with **PostGIS 3.4** extension installed.
   - *Alternative*: Run PostgreSQL/PostGIS via Docker container:
     ```bash
     docker run -d --name bhoomisetu_db -p 5432:5432 -e POSTGRES_DB=bhoomisetu_db -e POSTGRES_USER=bhoomisetu_user -e POSTGRES_PASSWORD=bhoomisetu_pass postgis/postgis:16-3.4
     ```
4. **Git** - [Download Git](https://git-scm.com/)

---

## 🔑 Environment Configuration (.env)

Create a `.env` file in the project root (`d:\projects\sih_paradox\.env`). You can copy `.env.example`:

```bash
cp .env.example .env
```

Default local environment variables:
```env
# Database Settings
DATABASE_URL=postgresql://bhoomisetu_user:bhoomisetu_pass@localhost:5432/bhoomisetu_db

# Security & JWT
JWT_SECRET_KEY=bhoomisetu_super_secret_jwt_key_2026
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=480

# Demo Mode & Environment
DEMO_MODE=true
ENVIRONMENT=development

# Object Storage (Use 'local' for zero-dependency file storage, or 'minio' for MinIO S3)
STORAGE_TYPE=local
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=bhoomisetu-documents
```

---

## 📖 Manual Step-by-Step Setup Guide

Follow these exact steps to launch the entire platform manually on your machine.

### Step 1: Python Virtual Environment & Dependencies

1. Open your terminal / PowerShell in the project root:
   ```powershell
   cd d:\projects\sih_paradox
   ```

2. Create a virtual environment:
   ```powershell
   python -m venv venv
   ```

3. Activate the virtual environment:
   - **Windows (PowerShell)**:
     ```powershell
     .\venv\Scripts\Activate.ps1
     ```
   - **Windows (CMD)**:
     ```cmd
     venv\Scripts\activate.bat
     ```
   - **Linux/macOS**:
     ```bash
     source venv/bin/activate
     ```

4. Upgrade pip and install all Python backend and ML dependencies:
   ```powershell
   python -m pip install --upgrade pip
   python -m pip install -r backend/requirements.txt
   python -m pip install -r ml/requirements.txt
   ```

---

### Step 2: Database Initialization & Alembic Migrations

1. Ensure your PostgreSQL + PostGIS server is running on port `5432` with database `bhoomisetu_db` created:
   ```sql
   CREATE DATABASE bhoomisetu_db;
   CREATE USER bhoomisetu_user WITH PASSWORD 'bhoomisetu_pass';
   GRANT ALL PRIVILEGES ON DATABASE bhoomisetu_db TO bhoomisetu_user;
   ```
   *(Enable PostGIS inside the database)*:
   ```sql
   \c bhoomisetu_db;
   CREATE EXTENSION IF NOT EXISTS postgis;
   ```

2. Run Alembic migrations to build all database tables (`users`, `roles`, `projects`, `parcels`, `parcel_geometries`, `disputes`, `compensation_records`, `documents`, `audit_events`, `ai_analysis_results`):
   ```powershell
   cd backend
   python -m alembic upgrade head
   cd ..
   ```

---

### Step 3: Database Data Seeding

Populate the database with seeded government roles, users, projects, parcels, GIS boundaries, disputes, and audit records:

```powershell
python backend/app/seeds/seed_data.py
```

*Expected output*: `Database successfully seeded with demo baseline data.`

---

### Step 4: Machine Learning Model Setup

*Pre-trained model artifacts are already included under `ml/models/acquisition_risk_model.pkl`.*

If you wish to re-train the model locally or verify inference:
```powershell
python ml/src/train.py
```
To evaluate the saved model metrics:
```powershell
python ml/src/evaluate.py
```

---

### Step 5: Run the FastAPI Backend Server

Launch the FastAPI application server on port `8000`:

```powershell
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```
> **Important**: Execute the command above from inside the `backend/` folder, or specify `app.main:app` while setting `PYTHONPATH=.`.

**Verify Backend Connection**:
- Health check: [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health)
- Interactive Swagger API Docs: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- Audit Chain Status: [http://127.0.0.1:8000/api/v1/audit](http://127.0.0.1:8000/api/v1/audit)

---

### Step 6: Run the React SPA Frontend

1. Open a **new terminal tab/window** in the project root (`d:\projects\sih_paradox`):

2. Install Node dependencies:
   ```powershell
   npm install
   ```

3. Start the Vite development server:
   ```powershell
   npm run dev
   ```

4. Access the BhoomiSetu Web Application in your browser:
   👉 **[http://localhost:5173](http://localhost:5173)**

---

## 👥 Default Seeded User Credentials

You can log into the web application or issue API JWT tokens using any of the pre-seeded government role accounts:

| Role Title | Full Name | Email Address | Password | District Jurisdiction | Access Scope |
|---|---|---|---|---|---|
| **District Officer** | Anil Kumar | `anil.kumar@bhoomisetu.gov.in` | `bhoomisetu123` | Patna | Full district command center, approvals & GIS |
| **Field Surveyor** | Ramesh Verma | `ramesh.verma@bhoomisetu.gov.in` | `bhoomisetu123` | Patna | Mobile Field App, offline survey & photo collection |
| **Acquisition Officer** | Priya Sharma | `priya.sharma@bhoomisetu.gov.in` | `bhoomisetu123` | Patna | Parcel valuation, compensation & project updates |
| **Legal Officer** | R. K. Verma | `rk.verma@bhoomisetu.gov.in` | `bhoomisetu123` | Vaishali | Dispute resolution & objection hearings |
| **Auditor** | Auditor Desk | `auditor@bhoomisetu.gov.in` | `bhoomisetu123` | Patna | Read-only audit chain verification & compliance |
| **System Admin** | System Admin | `admin@bhoomisetu.gov.in` | `bhoomisetu123` | All | Full system configuration & 1-click Demo Reset |

---

## 🐳 Docker Single-Command Alternative

If you prefer to run the entire stack (FastAPI, React, Nginx, PostgreSQL/PostGIS, MinIO) in containerized mode without installing local Python/PostgreSQL:

1. Build and launch all stack containers:
   ```bash
   docker compose up -d --build
   ```

2. Seed the database container:
   ```bash
   docker compose run --rm seed
   ```

3. Access the web app at `http://localhost` and API docs at `http://localhost:8000/docs`.

---

## 🧪 Running Test Suite & Benchmarks

Run the complete 70-test suite verifying authentication, RBAC, PostGIS spatial queries, MinIO storage, WebSocket real-time delivery, AI persistence, Golden Demo workflow, and performance benchmarks:

```powershell
python -m pytest backend/tests/ -v
```

To run the performance latency benchmark report printout:
```powershell
python -m pytest backend/tests/test_performance_v3_7.py -s
```

To run frontend linter & build validation:
```powershell
npm run lint
npm run build
```

---

## 📡 API Endpoints Reference

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | No | Basic service health check & database status |
| `GET` | `/api/v1/health/live` | No | Liveness probe (HTTP 200) |
| `GET` | `/api/v1/health/ready` | No | Readiness probe testing DB & MinIO (200 / 503) |
| `POST` | `/api/v1/auth/login` | No | Authenticates user credentials & issues JWT access token |
| `GET` | `/api/v1/auth/me` | Bearer JWT | Returns authenticated user profile & role |
| `GET` | `/api/v1/gis/parcels` | Bearer JWT | Returns PostGIS spatial parcels as GeoJSON FeatureCollection |
| `GET` | `/api/v1/gis/parcels/nearby` | Bearer JWT | Returns parcels near lat/lon sorted by distance |
| `POST` | `/api/v1/ai/risk/explain` | Bearer JWT | Runs ML model pipeline & returns SHAP feature importance |
| `POST` | `/api/v1/inspections` | Bearer JWT | Idempotent field inspection submission with photo linkage |
| `POST` | `/api/v1/documents/upload` | Bearer JWT | Multipart document upload with magic-byte signature check |
| `GET` | `/api/v1/audit` | Bearer JWT | Returns audit trail events & SHA-256 chain health status |
| `POST` | `/api/v1/demo/reset` | `system_admin` | 1-click demo environment baseline reset |

---

## ❓ Troubleshooting

### 1. `Missing ML artifact: ... acquisition_risk_model.pkl`
- Run `python ml/src/train.py` from the project root to re-generate the model artifact.

### 2. Database Connection Error (`psycopg2.OperationalError`)
- Ensure PostgreSQL is running on port `5432` and `DATABASE_URL` in `.env` matches your credentials.
- Verify PostGIS extension is enabled (`CREATE EXTENSION IF NOT EXISTS postgis;`).

### 3. `403 Forbidden` on Demo Reset
- Ensure `DEMO_MODE=true` is set in your `.env` file and you are authenticated as `admin@bhoomisetu.gov.in`.

### 4. Vite Frontend CORS / API Connection Issues
- Verify the FastAPI backend is running on `http://127.0.0.1:8000`.

---

## 👥 Team
- **Team Name**: PARADOX
- **Event**: Smart India Hackathon (SIH)
