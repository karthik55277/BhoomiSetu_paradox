# BhoomiSetu FastAPI Backend Dockerfile
FROM python:3.12-slim

# Prevent python from buffering stdout/stderr and write pyc files
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Install system build dependencies for psycopg2, GEOS/GDAL, and curl health check
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python requirements
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

# Copy backend source code and ML models preserving directory structure
COPY backend /app/backend
COPY ml/models /app/ml/models

# Set working directory to backend
WORKDIR /app/backend

# Make entrypoint script executable
RUN chmod +x /app/backend/entrypoint.sh

# Expose FastAPI port
EXPOSE 8000

# Container Health Check
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

ENTRYPOINT ["/app/backend/entrypoint.sh"]
