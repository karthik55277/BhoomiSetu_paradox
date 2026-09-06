"""
BhoomiSetu FastAPI Authentication & RBAC Dependencies.
Enforces mandatory JWT Bearer token validation and database-authoritative role permissions.
"""

import uuid
from typing import Generator, List, Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db.session import SessionLocal
from app.models.users import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


def get_db() -> Generator[Session, None, None]:
    """Yields a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    db: Session = Depends(get_db),
    token: Optional[str] = Depends(oauth2_scheme),
) -> User:
    """
    Mandatory authentication dependency.
    Decodes JWT token, extracts user UUID 'sub', and queries PostgreSQL to fetch the active user.
    Uses the database-loaded Role as the sole authorization authority.
    Raises 401 Unauthorized if missing, invalid, or deactivated.
    """
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token is missing. Please log in.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        user_id = uuid.UUID(payload["sub"])
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user ID claim in token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account no longer exists.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is deactivated.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Attach dynamic role_name attribute for Pydantic schema serialization
    if user.role:
        setattr(user, "role_name", user.role.name)
    else:
        setattr(user, "role_name", "viewer")

    return user


def require_role(allowed_roles: List[str]):
    """
    Server-side Role-Based Access Control (RBAC) dependency factory.
    Enforces that current_user's database-loaded Role is present in allowed_roles.
    Raises 403 Forbidden if unauthorized.
    """
    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        user_role = current_user.role.name if current_user.role else "none"
        if user_role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{user_role}' is not authorized for this operation. Required: {allowed_roles}",
            )
        return current_user

    return role_checker
