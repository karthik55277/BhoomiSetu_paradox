import os
import subprocess
from typing import Generator
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

load_dotenv()


def resolve_db_url() -> str:
    env_url = os.getenv("DATABASE_URL")
    if env_url:
        return env_url

    # Auto-detect WSL IP or 127.0.0.1
    try:
        wsl_ip = subprocess.check_output(["wsl", "hostname", "-I"], text=True).strip().split()[0]
        return f"postgresql://bhoomisetu_user:bhoomisetu_password@{wsl_ip}:5432/bhoomisetu_db?sslmode=prefer"
    except Exception:
        return "postgresql://bhoomisetu_user:bhoomisetu_password@127.0.0.1:5432/bhoomisetu_db?sslmode=prefer"




DATABASE_URL = resolve_db_url()

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    """Dependency for providing a transactional database session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
