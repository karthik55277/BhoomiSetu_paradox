"""
Pytest configuration and global test fixtures for BhoomiSetu.
Injects dependency overrides for get_current_user so existing API integration test suites
(test_api_v1.py, test_ml_persistence.py) execute cleanly as an authenticated district officer
without weakening production security boundaries.
"""

import os
import sys
import pytest
from sqlalchemy import text

# Ensure backend folder is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.main import app
from app.db.session import engine, SessionLocal
from app.models.users import User
from app.api.deps import get_current_user


def is_db_available() -> bool:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            return True
    except Exception:
        return False


DB_AVAILABLE = is_db_available()


from typing import Optional
from fastapi import Depends
from app.core.security import decode_access_token
from app.api.deps import oauth2_scheme
import uuid

def override_get_current_user(token: Optional[str] = Depends(oauth2_scheme)) -> User:
    """
    Dependency override for integration test suites.
    If a valid Bearer token is provided, decodes the user from the token.
    Otherwise defaults to seeded District Officer Anil Kumar.
    """
    db = SessionLocal()
    try:
        if token:
            payload = decode_access_token(token)
            if payload and "sub" in payload:
                try:
                    user_id = uuid.UUID(payload["sub"])
                    user = db.query(User).filter(User.id == user_id).first()
                    if user:
                        if user.role:
                            setattr(user, "role_name", user.role.name)
                        return user
                except Exception:
                    pass
        user = db.query(User).filter(User.email == "anil.kumar@bhoomisetu.gov.in").first()
        if not user:
            user = db.query(User).first()
        if user and user.role:
            setattr(user, "role_name", user.role.name)
        return user
    finally:
        db.close()


@pytest.fixture(autouse=True)
def setup_test_auth_overrides():
    """Applies dependency override for existing test suites before every test."""
    if DB_AVAILABLE:
        app.dependency_overrides[get_current_user] = override_get_current_user
    yield
    app.dependency_overrides.pop(get_current_user, None)


