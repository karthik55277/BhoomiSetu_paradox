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
- [Quick Start Guide](#-quick-start-guide)
  - [1. Clone / Open Project](#1-clone--open-project)
  - [2. Python Backend & ML Setup](#2-python-backend--ml-setup)
  - [3. (Optional) Train the ML Model](#3-optional-train-the-ml-model)
  - [4. Run the FastAPI Backend Server](#4-run-the-fastapi-backend-server)
  - [5. Run the React Frontend](#5-run-the-react-frontend)
- [API Endpoints](#-api-endpoints)
- [ML Pipeline Details](#-ml-pipeline-details)
- [Troubleshooting](#-troubleshooting)

---

## ✨ Features

- 🎯 **AI Acquisition Risk Scoring**: Classifies land parcels into 4 risk tiers (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`) using 19+ physical, economic, and social parameters.
- 🔍 **Explainable AI (SHAP)**: Provides granular feature attribution so officers can understand *why* a parcel is marked high risk (e.g. `ownership_complexity (+21.0)`, `previous_dispute (+19.0)`).
- 🗺️ **Live GIS Command Center**: Interactive spatial map interface color-coded by risk with filter capabilities.
- 📋 **Parcel & Project Management**: Lifecycle tracking across stages (*Identified ➔ Survey ➔ Notice ➔ Valuation ➔ Objection ➔ Compensation ➔ Approval ➔ Acquired*).
- ⚖️ **Dispute & Objection Resolution**: Dedicated workflows for handling land-use conflicts and title objections.
- 🛡️ **Audit Trail**: Tamper-evident hash chain verification for tracking critical acquisition actions.

---

## 🛠️ Tech Stack

### **Frontend**
- **Framework**: React 19 + TypeScript + Vite 8
- **UI & Icons**: Vanilla CSS (Glassmorphism design system), Lucide React Icons
- **Tooling**: Oxlint

### **Backend & API**
- **Framework**: FastAPI (Python)
- **Server**: Uvicorn
- **Validation**: Pydantic v2
- **CORS**: Enabled for `http://localhost:5173`

### **Machine Learning**
- **Core ML**: Python, `scikit-learn`, `RandomForestClassifier`, `XGBoost`
- **Explainability**: `SHAP` (SHapley Additive exPlanations)
- **Data Pipelines**: Imputation, One-Hot Encoding, StandardScaler

---

## 📁 Repository Structure

```text
sih_paradox/
├── backend/                  # Python FastAPI Backend
│   ├── app/
│   │   ├── main.py           # FastAPI entrypoint & endpoint handlers
│   │   ├── schemas.py        # Request & response Pydantic models
│   │   └── services/
│   │       └── ml_service.py # Model loading, inference & SHAP engine
│   └── requirements.txt      # Backend Python dependencies
├── ml/                       # Machine Learning Codebase
│   ├── data/                 # Dataset files (land_acquisition_dataset.csv)
│   ├── models/               # Model artifacts (.pkl & metrics .json)
│   ├── src/
│   │   ├── train.py          # ML model training script
│   │   ├── evaluate.py       # Model performance evaluation script
│   │   ├── predict.py        # CLI single prediction runner
│   │   └── explain.py        # CLI SHAP explanation runner
│   └── requirements.txt      # ML pipeline dependencies
├── src/                      # React TypeScript Frontend
│   ├── App.tsx               # Primary single-page web app & routing
│   ├── App.css               # Design system & responsive layout styles
│   ├── api.ts                # Frontend API client connecting to FastAPI
│   ├── data.ts               # Seeded dataset, types & helper functions
│   └── main.tsx              # React mounting entrypoint
├── package.json              # Frontend npm dependencies & scripts
├── vite.config.ts            # Vite configuration
└── README.md                 # Project documentation
```

---

## ⚙️ Prerequisites

Before running the project, ensure you have installed:

1. **Node.js** (v18.0.0 or higher) - [Download Node.js](https://nodejs.org/)
2. **Python** (v3.10 or higher) - [Download Python](https://www.python.org/)
3. **Git** - [Download Git](https://git-scm.com/)

---

## 🚀 Quick Start Guide

To get **BhoomiSetu** running on your local machine, follow these step-by-step instructions.

### 1. Clone / Open Project

Open your terminal or PowerShell and navigate to the project directory:
```powershell
cd d:\projects\sih_paradox
```

---

### 2. Python Backend & ML Setup

#### A. Create a Python Virtual Environment (Recommended)
```powershell
python -m venv venv
```

Activate the virtual environment:
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

#### B. Install Python Dependencies
Install dependencies for both backend and ML pipeline:
```powershell
python -m pip install --upgrade pip
python -m pip install -r backend/requirements.txt
python -m pip install -r ml/requirements.txt
```

---

### 3. (Optional) Train the ML Model

*Note: Pre-trained model artifacts are already included under `ml/models/ acquisition_risk_model.pkl`.*

If you wish to re-train the model or generate fresh metrics:
```powershell
python ml/src/train.py
```
To evaluate the saved model:
```powershell
python ml/src/evaluate.py
```

---

### 4. Run the FastAPI Backend Server

Start the FastAPI backend application on port `8000`:

```powershell
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```
> Note: Run the command above from the `backend/` directory, or specify the module as `app.main:app` while in `backend/`.

**Verify Backend**: Open your browser and visit:
- Health check: [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health)
- Swagger API Docs: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

---

### 5. Run the React Frontend

Open a **new terminal tab/window** in the project root (`d:\projects\sih_paradox`):

#### A. Install Node Dependencies
```powershell
npm install
```

#### B. Start the Vite Development Server
```powershell
npm run dev
```

#### C. Access the Web App
Open your browser and navigate to:
👉 **[http://localhost:5173](http://localhost:5173)**

---

## 📡 API Endpoints

The backend provides the following core endpoints:

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | Service health status & loaded model info |
| `POST` | `/api/v1/ai/risk/predict` | Predicts risk class, score (0-100), and probability |
| `POST` | `/api/v1/ai/risk/explain` | Returns risk prediction + SHAP feature attribution breakdown |

### Sample JSON Request Body (`/api/v1/ai/risk/explain`)
```json
{
  "state": "Bihar",
  "district": "Patna",
  "land_type": "Agricultural",
  "land_use": "Multi-crop",
  "project_type": "Road infrastructure",
  "land_area": 4.82,
  "number_of_owners": 5,
  "ownership_complexity": 4.2,
  "previous_dispute": 1,
  "previous_objections": 2,
  "land_value": 18600000,
  "estimated_compensation": 16368000,
  "environmental_risk": 8.4,
  "road_accessibility": 2.1,
  "distance_to_road": 3.6,
  "stakeholder_count": 6,
  "land_use_conflict": 8.6,
  "documentation_completeness": 3.4,
  "historical_acquisition_duration": 7.2
}
```

---

## 🧠 ML Pipeline Details

The model scores risk based on 4 severity bands:
- `LOW` (0–30)
- `MEDIUM` (31–60)
- `HIGH` (61–80)
- `CRITICAL` (81–100)

Explanations are computed using SHAP values:
- **Positive Impact (`increases_risk`)**: Features pushing the risk score higher.
- **Negative Impact (`decreases_risk`)**: Features mitigating acquisition risk.

---

## ❓ Troubleshooting

### 1. `Missing ML artifact: ... acquisition_risk_model.pkl`
If the FastAPI server fails at startup with missing ML artifact:
- Run `python ml/src/train.py` from the project root to generate the model file.
- Verify `ml/models/acquisition_risk_model.pkl` exists.

### 2. CORS Errors in Browser
- Ensure the backend is running at `http://127.0.0.1:8000`.
- Verify CORS middleware configuration in `backend/app/main.py`.

### 3. Missing npm packages or Vite errors
- Delete `node_modules` and run `npm install` again.

---

## 👥 Team
- **Team Name**: The Mavericks
- **Event**: Smart India Hackathon (SIH)
