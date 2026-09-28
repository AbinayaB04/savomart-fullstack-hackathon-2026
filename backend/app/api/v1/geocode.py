import time
import logging
from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
import httpx
from app.db.session import get_db
from app.db.models import GeocodeCache
from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()

# Rate limit tracking for Nominatim (1 request per second max per policy)
LAST_NOMINATIM_REQUEST = 0.0


@router.get("/geocode")
def geocode_search(
    q: str = Query(..., min_length=2, description="Chennai locality, area, or landmark search query"),
    db: Session = Depends(get_db)
):
    """
    Search for Chennai localities, areas, or landmarks using Nominatim with
    database caching and strict 1 req/sec rate limiting.
    """
    global LAST_NOMINATIM_REQUEST
    query_str = q.strip().lower()

    # 1. Check local database cache
    cached = db.query(GeocodeCache).filter(GeocodeCache.query == query_str).first()
    if cached and cached.result:
        return {
            "query": q,
            "cached": True,
            "results": cached.result
        }

    # 2. Enforce 1 req/sec rate limit
    now = time.time()
    elapsed = now - LAST_NOMINATIM_REQUEST
    if elapsed < 1.0:
        time.sleep(1.0 - elapsed)
    LAST_NOMINATIM_REQUEST = time.time()

    # 3. Call OpenStreetMap Nominatim API bounded to Chennai
    # viewbox: minLon, maxLat, maxLon, minLat (80.05, 13.25, 80.35, 12.80)
    url = "https://nominatim.openstreetmap.org/search"
    params = {
        "q": f"{q}, Chennai, Tamil Nadu, India",
        "format": "json",
        "addressdetails": 1,
        "limit": 5,
        "viewbox": f"{settings.CHENNAI_MIN_LON},{settings.CHENNAI_MAX_LAT},{settings.CHENNAI_MAX_LON},{settings.CHENNAI_MIN_LAT}",
        "bounded": 1
    }
    headers = {
        "User-Agent": "SavoSiteScout/1.0 (retail expansion research; contact@savomart.in)",
        "Accept-Language": "en"
    }

    results = []
    try:
        with httpx.Client(timeout=8.0) as client:
            resp = client.get(url, params=params, headers=headers)
            if resp.status_code == 200:
                raw_results = resp.json()
                for item in raw_results:
                    try:
                        lat = float(item["lat"])
                        lon = float(item["lon"])
                        if settings.is_within_chennai(lat, lon):
                            bbox = [float(x) for x in item.get("boundingbox", [lat, lat, lon, lon])]
                            results.append({
                                "display_name": item.get("display_name"),
                                "lat": lat,
                                "lon": lon,
                                "boundingbox": bbox,  # [minLat, maxLat, minLon, maxLon]
                                "type": item.get("type"),
                                "class": item.get("class")
                            })
                    except (ValueError, KeyError):
                        continue
            else:
                logger.warning(f"Nominatim responded with status {resp.status_code}")
    except Exception as e:
        logger.warning(f"Nominatim request failed: {e}")

    # Fallback to local known Chennai localities if external search was rate-limited or failed
    if not results:
        known_chennai_localities = {
            "t nagar": {"name": "T. Nagar, Chennai", "lat": 13.0418, "lon": 80.2341},
            "anna nagar": {"name": "Anna Nagar, Chennai", "lat": 13.0850, "lon": 80.2101},
            "velachery": {"name": "Velachery, Chennai", "lat": 12.9750, "lon": 80.2212},
            "adyar": {"name": "Adyar, Chennai", "lat": 13.0064, "lon": 80.2575},
            "omr": {"name": "Old Mahabalipuram Road (OMR), Chennai", "lat": 12.9382, "lon": 80.2372},
            "porur": {"name": "Porur, Chennai", "lat": 13.0382, "lon": 80.1565},
            "mylapore": {"name": "Mylapore, Chennai", "lat": 13.0368, "lon": 80.2676},
            "tambaram": {"name": "Tambaram, Chennai", "lat": 12.9249, "lon": 80.1265},
            "perambur": {"name": "Perambur, Chennai", "lat": 13.1110, "lon": 80.2435},
            "guindy": {"name": "Guindy, Chennai", "lat": 13.0080, "lon": 80.2130},
        }
        for key, loc in known_chennai_localities.items():
            if key in query_str or query_str in key:
                results.append({
                    "display_name": loc["name"],
                    "lat": loc["lat"],
                    "lon": loc["lon"],
                    "boundingbox": [loc["lat"] - 0.015, loc["lat"] + 0.015, loc["lon"] - 0.015, loc["lon"] + 0.015],
                    "type": "suburb",
                    "class": "place"
                })

    # Cache results in DB
    try:
        new_cache = GeocodeCache(query=query_str, result=results)
        db.add(new_cache)
        db.commit()
    except Exception as e:
        db.rollback()
        logger.warning(f"Could not cache geocode result: {e}")

    return {
        "query": q,
        "cached": False,
        "results": results
    }
