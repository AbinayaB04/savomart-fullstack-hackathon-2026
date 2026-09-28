import json
from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.db.session import get_db

router = APIRouter()


@router.get("/pois")
def get_pois(
    bbox: Optional[str] = Query(None, description="Bounding box 'minLon,minLat,maxLon,maxLat'"),
    category: Optional[str] = Query(None, description="Category filter (e.g. supermarket, school, hospital, etc.)"),
    limit: int = Query(500, le=1000, description="Max POIs to return"),
    db: Session = Depends(get_db)
):
    """
    Returns GeoJSON FeatureCollection of Points of Interest (POIs) filtered by optional bbox and category.
    """
    conditions = []
    params = {"limit": limit}

    if bbox:
        try:
            parts = [float(p.strip()) for p in bbox.split(",")]
            if len(parts) != 4:
                raise ValueError()
            min_lon, min_lat, max_lon, max_lat = parts
            conditions.append("geom && ST_MakeEnvelope(:min_lon, :min_lat, :max_lon, :max_lat, 4326)")
            params.update({
                "min_lon": min_lon,
                "min_lat": min_lat,
                "max_lon": max_lon,
                "max_lat": max_lat
            })
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail="Invalid bbox format. Expected 'minLon,minLat,maxLon,maxLat' with 4 float values."
            )

    if category:
        conditions.append("category = :category")
        params["category"] = category

    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    query = text(f"""
        SELECT 
            id,
            osm_id,
            category,
            name,
            tags,
            ST_AsGeoJSON(geom) AS geom_json
        FROM pois
        {where_clause}
        LIMIT :limit;
    """)

    rows = db.execute(query, params).fetchall()

    features = []
    for r in rows:
        tags_data = r.tags if isinstance(r.tags, dict) else (json.loads(r.tags) if r.tags else {})
        features.append({
            "type": "Feature",
            "id": r.id,
            "geometry": json.loads(r.geom_json),
            "properties": {
                "id": r.id,
                "osm_id": r.osm_id,
                "category": r.category,
                "name": r.name,
                "tags": tags_data
            }
        })

    return {
        "type": "FeatureCollection",
        "features": features,
        "properties": {
            "count": len(features),
            "category": category
        }
    }
