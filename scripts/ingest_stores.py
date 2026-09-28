import sys
import logging
import httpx
from pathlib import Path
from datetime import datetime, timezone
from typing import List, Dict, Any

# Add backend directory to sys.path so app modules are resolvable
backend_dir = Path(__file__).resolve().parent.parent / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from sqlalchemy import text
from app.config import settings
from app.db.session import SessionLocal, init_db
from app.db.models import Store, DataVersion

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Fallback operational Savomart stores in Chennai in case API is offline/unreachable
FALLBACK_SAVOMART_STORES = [
    {
        "external_id": "SM-CHN-001",
        "name": "Savomart - T. Nagar Superstore",
        "address": "45 Venkatnarayana Road, T. Nagar, Chennai 600017",
        "latitude": 13.0418,
        "longitude": 80.2341,
        "is_mock": True,
        "city": "Chennai",
        "format": "Supermarket"
    },
    {
        "external_id": "SM-CHN-002",
        "name": "Savomart - Anna Nagar West",
        "address": "12 2nd Avenue, Anna Nagar, Chennai 600040",
        "latitude": 13.0850,
        "longitude": 80.2101,
        "is_mock": True,
        "city": "Chennai",
        "format": "Supermarket"
    },
    {
        "external_id": "SM-CHN-003",
        "name": "Savomart - Velachery Bypass",
        "address": "88 100 Feet Bypass Road, Velachery, Chennai 600042",
        "latitude": 12.9750,
        "longitude": 80.2212,
        "is_mock": True,
        "city": "Chennai",
        "format": "Express"
    },
    {
        "external_id": "SM-CHN-004",
        "name": "Savomart - Adyar Corner",
        "address": "24 Sardar Patel Road, Adyar, Chennai 600020",
        "latitude": 13.0064,
        "longitude": 80.2575,
        "is_mock": True,
        "city": "Chennai",
        "format": "Daily Essentials"
    },
    {
        "external_id": "SM-CHN-005",
        "name": "Savomart - OMR Thoraipakkam",
        "address": "104 Rajiv Gandhi Salai (OMR), Thoraipakkam, Chennai 600097",
        "latitude": 12.9382,
        "longitude": 80.2372,
        "is_mock": True,
        "city": "Chennai",
        "format": "Supermarket"
    },
    {
        "external_id": "SM-CHN-006",
        "name": "Savomart - Porur Junction",
        "address": "15 Mount-Poonamallee Road, Porur, Chennai 600116",
        "latitude": 13.0382,
        "longitude": 80.1565,
        "is_mock": True,
        "city": "Chennai",
        "format": "Express"
    },
    {
        "external_id": "SM-CHN-007",
        "name": "Savomart - Ambattur Industrial Estate",
        "address": "30 MTH Road, Ambattur, Chennai 600053",
        "latitude": 13.1143,
        "longitude": 80.1548,
        "is_mock": True,
        "city": "Chennai",
        "format": "Supermarket"
    },
    {
        "external_id": "SM-CHN-008",
        "name": "Savomart - Mylapore Luz",
        "address": "77 Luz Church Road, Mylapore, Chennai 600004",
        "latitude": 13.0368,
        "longitude": 80.2676,
        "is_mock": True,
        "city": "Chennai",
        "format": "Daily Essentials"
    },
    {
        "external_id": "SM-CHN-009",
        "name": "Savomart - Tambaram GST",
        "address": "142 GST Road, Tambaram, Chennai 600045",
        "latitude": 12.9249,
        "longitude": 80.1265,
        "is_mock": True,
        "city": "Chennai",
        "format": "Supermarket"
    },
    {
        "external_id": "SM-CHN-010",
        "name": "Savomart - Perambur High Road",
        "address": "56 Madhavaram High Road, Perambur, Chennai 600011",
        "latitude": 13.1110,
        "longitude": 80.2435,
        "is_mock": True,
        "city": "Chennai",
        "format": "Express"
    }
]


def fetch_stores_from_api() -> List[Dict[str, Any]]:
    """Fetch stores from the official Savomart API using STORES_API_TOKEN."""
    url = settings.STORES_API_URL
    token = settings.STORES_API_TOKEN
    headers = {"X-cron-token": token}

    logger.info(f"Connecting to Stores API: {url}...")
    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(url, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                # Accept list directly or wrapped in data key
                stores_list = data if isinstance(data, list) else data.get("data", [])
                logger.info(f"Successfully fetched {len(stores_list)} stores from API.")
                return stores_list
            else:
                logger.warning(f"Stores API responded with HTTP status {resp.status_code}: {resp.text[:200]}")
    except Exception as e:
        logger.warning(f"Failed to fetch from Stores API: {e}")
    return []


def ingest_stores():
    print("Ensuring database schema is initialized...")
    init_db()
    db = SessionLocal()

    try:
        api_stores = fetch_stores_from_api()
        source_name = "savomart_internal_api"

        if not api_stores:
            # Check existing count in DB
            existing_count = db.execute(text("SELECT COUNT(*) FROM stores;")).scalar()
            if existing_count > 0:
                print(f"API call unavailable; retaining existing cached stores (count: {existing_count}).")
                return
            else:
                print("API unavailable and store cache empty. Using transparent mock stores for Chennai.")
                api_stores = FALLBACK_SAVOMART_STORES
                source_name = "mock_savomart_chennai_stores"

        upserted = 0
        now = datetime.now(timezone.utc)

        for s in api_stores:
            ext_id = str(s.get("external_id") or s.get("id") or s.get("store_id") or "")
            name = s.get("name") or s.get("store_name") or "Savomart Store"
            address = s.get("address") or s.get("location_address") or ""
            lat = float(s.get("latitude") or s.get("lat") or 0.0)
            lon = float(s.get("longitude") or s.get("lng") or s.get("lon") or 0.0)

            # Validate Chennai bbox
            if not settings.is_within_chennai(lat, lon):
                logger.warning(f"Skipping store {name} at ({lat}, {lon}) - outside Chennai bbox.")
                continue

            wkt_geom = f"SRID=4326;POINT({lon} {lat})"

            # Upsert into stores
            existing = db.query(Store).filter(Store.external_id == ext_id).first() if ext_id else None
            if existing:
                existing.name = name
                existing.address = address
                existing.raw = s
                existing.fetched_at = now
                db.execute(
                    text("UPDATE stores SET geom = ST_GeomFromEWKT(:geom) WHERE id = :id"),
                    {"geom": wkt_geom, "id": existing.id}
                )
            else:
                db.execute(
                    text("""
                        INSERT INTO stores (external_id, name, address, geom, raw, fetched_at)
                        VALUES (:ext_id, :name, :address, ST_GeomFromEWKT(:geom), :raw, :fetched_at);
                    """),
                    {
                        "ext_id": ext_id,
                        "name": name,
                        "address": address,
                        "geom": wkt_geom,
                        "raw": httpx._utils.to_json(s) if hasattr(httpx, '_utils') else str(s).replace("'", '"'),
                        "fetched_at": now
                    }
                )
            upserted += 1

        db.commit()

        # Record version
        version = DataVersion(
            source=source_name,
            fetched_at=now,
            record_count=upserted,
            notes=f"Ingested {upserted} operational Savomart stores in Chennai"
        )
        db.add(version)
        db.commit()

        print(f"Stores ingestion finished successfully. Total stores upserted: {upserted}")

    except Exception as e:
        db.rollback()
        print(f"Error during stores ingestion: {e}")
        raise e
    finally:
        db.close()


if __name__ == "__main__":
    ingest_stores()
