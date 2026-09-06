"""
FastAPI Authentication Routes for BhoomiSetu.
Provides POST /api/v1/auth/login and GET /api/v1/auth/me endpoints.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.core.security import create_access_token, verify_password
from app.models.users import User
from app.schemas_v1 import LoginRequest, TokenResponse, UserResponse

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/login", response_model=TokenResponse)
def login(
    login_data: LoginRequest,
    db: Session = Depends(get_db),
):
    """
    Authenticate user via email and password against PostgreSQL.
    Returns signed JWT access token and user profile on success.
    """
    email = login_data.email.strip().lower()
    user = db.query(User).filter(User.email.ilike(email)).first()
    
    if not user or not verify_password(login_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is deactivated.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    role_name = user.role.name if user.role else "viewer"
    setattr(user, "role_name", role_name)
    
    access_token = create_access_token(
        user_id=str(user.id),
        email=user.email,
        role=role_name,
    )
    
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse.model_validate(user),
    )


@router.get("/me", response_model=UserResponse)
def get_me(
    current_user: User = Depends(get_current_user),
):
    """Returns the authenticated user profile for the current session."""
    role_name = current_user.role.name if current_user.role else "viewer"
    setattr(current_user, "role_name", role_name)
    return UserResponse.model_validate(current_user)
