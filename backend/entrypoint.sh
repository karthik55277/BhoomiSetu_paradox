#!/usr/bin/env sh
set -e

echo "=== BhoomiSetu FastAPI Container Startup ==="

# Wait for PostgreSQL connection
if [ -n "$DATABASE_URL" ]; then
    echo "Waiting for PostgreSQL database connection..."
    python -c "
import time, sys
from sqlalchemy import create_engine, text
from app.db.session import resolve_db_url

url = resolve_db_url()
engine = create_engine(url)
retries = 30
while retries > 0:
    try:
        with engine.connect() as conn:
            conn.execute(text('SELECT 1'))
            print('PostgreSQL database is ready!')
            sys.exit(0)
    except Exception as e:
        retries -= 1
        time.sleep(1)
print('Timed out waiting for PostgreSQL.')
sys.exit(1)
"
fi

echo "Running Alembic database migrations..."
alembic upgrade head

echo "Starting Uvicorn ASGI Server on port 8000..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2
