import json
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.db.session import get_db

router = APIRouter()


@router.get("/stores")
def get_stores(db: Session = Depends(get_db)):
    """
    Returns GeoJSON FeatureCollection of cached Savomart stores in Chennai.
    """
    query = text("""
        SELECT 
            id,
            external_id,
            name,
            address,
            raw,
            fetched_at,
            ST_AsGeoJSON(geom) AS geom_json
        FROM stores
        ORDER BY id ASC;
    """)

    rows = db.execute(query).fetchall()

    features = []
    for r in rows:
        raw_data = r.raw if isinstance(r.raw, dict) else (json.loads(r.raw) if r.raw else {})
        features.append({
            "type": "Feature",
            "id": r.id,
            "geometry": json.loads(r.geom_json),
            "properties": {
                "id": r.id,
                "external_id": r.external_id,
                "name": r.name,
                "address": r.address,
                "is_mock": raw_data.get("is_mock", False),
                "fetched_at": r.fetched_at.isoformat() if r.fetched_at else None,
                "raw": raw_data
            }
        })

    return {
        "type": "FeatureCollection",
        "features": features,
        "properties": {
            "count": len(features)
        }
    }
