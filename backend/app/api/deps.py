from typing import Optional, List
from fastapi import Header, HTTPException, Depends, status
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.db.models import User, UserRole


def get_current_user(
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    db: Session = Depends(get_db)
) -> User:
    """
    Simulated auth: Extracts user from X-User-Id header.
    If no header is passed, attempts to default to the primary seeded BD Manager or returns 401.
    """
    if not x_user_id:
        # Check if there is a default bd_manager in the database for ease of dev/docs
        user = db.query(User).filter(User.role == UserRole.BD_MANAGER).first()
        if user:
            return user
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing X-User-Id header"
        )

    user = db.query(User).filter(User.id == x_user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with ID '{x_user_id}' not found"
        )
    return user


def require_role(*allowed_roles: UserRole):
    """
    Dependency factory to enforce role-based access control.
    """
    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        user_role = current_user.role
        if isinstance(user_role, str):
            user_role = UserRole(user_role)
        if user_role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access forbidden: role '{current_user.role}' is not authorized for this resource"
            )
        return current_user

    return role_checker
