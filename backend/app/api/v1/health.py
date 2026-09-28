from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.db.session import get_db
from app.config import settings

router = APIRouter()


@router.get("/health")
def health_check(db: Session = Depends(get_db)):
    db_ok = False
    try:
        db.execute(text("SELECT 1;"))
        db_ok = True
    except Exception:
        db_ok = False

    return {
        "status": "healthy" if db_ok else "degraded",
        "database": "connected" if db_ok else "disconnected",
        "environment": settings.ENVIRONMENT,
        "region": "Chennai",
        "bbox": {
            "min_lat": settings.CHENNAI_MIN_LAT,
            "max_lat": settings.CHENNAI_MAX_LAT,
            "min_lon": settings.CHENNAI_MIN_LON,
            "max_lon": settings.CHENNAI_MAX_LON,
        }
    }
