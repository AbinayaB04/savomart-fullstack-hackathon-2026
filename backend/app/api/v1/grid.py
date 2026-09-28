import json
from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.db.session import get_db

router = APIRouter()


@router.get("/grid")
def get_grid(
    bbox: Optional[str] = Query(
        None,
        description="Bounding box formatted as 'minLon,minLat,maxLon,maxLat'",
        examples=["80.20,12.95,80.25,13.00"]
    ),
    limit: int = Query(500, le=1000, description="Max grid cells to return"),
    db: Session = Depends(get_db)
):
    """
    Returns GeoJSON FeatureCollection of 500m grid cells intersecting the view bbox.
    Enforces zoom requirement to avoid transferring thousands of cells on whole-city views.
    """
    if not bbox:
        raise HTTPException(
            status_code=400,
            detail="bbox query parameter is required (format: minLon,minLat,maxLon,maxLat)"
        )

    try:
        parts = [float(p.strip()) for p in bbox.split(",")]
        if len(parts) != 4:
            raise ValueError()
        min_lon, min_lat, max_lon, max_lat = parts
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid bbox format. Expected 'minLon,minLat,maxLon,maxLat' with 4 float values."
        )

    lon_span = max_lon - min_lon
    lat_span = max_lat - min_lat

    # If span is too large (> 0.20 degrees ~ 22 km), prompt client to zoom in
    if lon_span > 0.20 or lat_span > 0.20:
        return {
            "type": "FeatureCollection",
            "features": [],
            "properties": {
                "message": "Zoom in closer to view scouting grid cells (max bounding span is ~0.20°).",
                "zoom_required": True
            }
        }

    query = text("""
        SELECT 
            id,
            row,
            col,
            ST_AsGeoJSON(geom) AS geom_json,
            ST_AsGeoJSON(centroid) AS centroid_json
        FROM grid_cells
        WHERE geom && ST_MakeEnvelope(:min_lon, :min_lat, :max_lon, :max_lat, 4326)
        LIMIT :limit;
    """)

    rows = db.execute(query, {
        "min_lon": min_lon,
        "min_lat": min_lat,
        "max_lon": max_lon,
        "max_lat": max_lat,
        "limit": limit
    }).fetchall()

    features = []
    for r in rows:
        features.append({
            "type": "Feature",
            "id": r.id,
            "geometry": json.loads(r.geom_json),
            "properties": {
                "id": r.id,
                "row": r.row,
                "col": r.col,
                "centroid": json.loads(r.centroid_json)["coordinates"]
            }
        })

    return {
        "type": "FeatureCollection",
        "features": features,
        "properties": {
            "count": len(features),
            "zoom_required": False
        }
    }
