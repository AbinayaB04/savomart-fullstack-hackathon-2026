from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.db.models import User
from app.api.deps import get_current_user

router = APIRouter()


@router.get("/users")
def list_users(db: Session = Depends(get_db)):
    """List all available seeded users for role switching."""
    users = db.query(User).order_by(User.role, User.name).all()
    return [u.to_dict() for u in users]


@router.get("/me")
def get_me(current_user: User = Depends(get_current_user)):
    """Return currently active user based on X-User-Id header."""
    return current_user.to_dict()
