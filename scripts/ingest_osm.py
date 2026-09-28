import os
import sys
import json
import time
import logging
from pathlib import Path
from datetime import datetime, timezone
from typing import Dict, List, Any, Optional
import httpx

# Add backend directory to sys.path so app modules are resolvable
backend_dir = Path(__file__).resolve().parent.parent / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from sqlalchemy import text
from app.config import settings
from app.db.session import SessionLocal, init_db
from app.db.models import POI, DataVersion

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

RAW_DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "raw"
RAW_DATA_DIR.mkdir(parents=True, exist_ok=True)

OVERPASS_SERVERS = [
    "https://overpass-api.de/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter"
]

# Overpass query filters for each category within bbox (minLat, minLon, maxLat, maxLon)
# Chennai: 12.80, 80.05, 13.25, 80.35
CATEGORY_QUERIES = {
    "supermarket": """
        [out:json][timeout:30];
        (
          node["shop"="supermarket"](12.80,80.05,13.25,80.35);
          way["shop"="supermarket"](12.80,80.05,13.25,80.35);
        );
        out center tags;
    """,
    "grocery": """
        [out:json][timeout:30];
        (
          node["shop"~"grocery|greengrocer|general"](12.80,80.05,13.25,80.35);
          way["shop"~"grocery|greengrocer|general"](12.80,80.05,13.25,80.35);
        );
        out center tags 300;
    """,
    "convenience": """
        [out:json][timeout:30];
        (
          node["shop"="convenience"](12.80,80.05,13.25,80.35);
          way["shop"="convenience"](12.80,80.05,13.25,80.35);
        );
        out center tags 300;
    """,
    "school": """
        [out:json][timeout:30];
        (
          node["amenity"="school"](12.80,80.05,13.25,80.35);
          way["amenity"="school"](12.80,80.05,13.25,80.35);
        );
        out center tags 300;
    """,
    "hospital": """
        [out:json][timeout:30];
        (
          node["amenity"="hospital"](12.80,80.05,13.25,80.35);
          way["amenity"="hospital"](12.80,80.05,13.25,80.35);
        );
        out center tags 300;
    """,
    "bus_stop": """
        [out:json][timeout:30];
        (
          node["highway"="bus_stop"](12.80,80.05,13.25,80.35);
        );
        out center tags 400;
    """,
    "rail_station": """
        [out:json][timeout:30];
        (
          node["railway"~"station|subway_entrance"](12.80,80.05,13.25,80.35);
          way["railway"~"station|subway_entrance"](12.80,80.05,13.25,80.35);
        );
        out center tags 200;
    """,
    "office": """
        [out:json][timeout:30];
        (
          node["office"](12.80,80.05,13.25,80.35);
          way["office"](12.80,80.05,13.25,80.35);
        );
        out center tags 300;
    """,
    "residential_building": """
        [out:json][timeout:30];
        (
          node["building"~"apartments|residential"](12.80,80.05,13.25,80.35);
          way["building"~"apartments|residential"](12.80,80.05,13.25,80.35);
        );
        out center tags 500;
    """
}

# Curated fallback Chennai POIs for each category if Overpass is completely throttled
FALLBACK_CHENNAI_POIS = {
    "supermarket": [
        {"osm_id": 90001, "name": "Nilgiris Supermarket T Nagar", "lat": 13.0415, "lon": 80.2335, "tags": {"brand": "Nilgiris"}},
        {"osm_id": 90002, "name": "Reliance Fresh Anna Nagar", "lat": 13.0845, "lon": 80.2110, "tags": {"brand": "Reliance Fresh"}},
        {"osm_id": 90003, "name": "More Supermarket Velachery", "lat": 12.9760, "lon": 80.2205, "tags": {"brand": "More"}},
        {"osm_id": 90004, "name": "Spencer's Daily Adyar", "lat": 13.0070, "lon": 80.2560, "tags": {"brand": "Spencer's"}},
        {"osm_id": 90005, "name": "Heritage Fresh Thoraipakkam", "lat": 12.9375, "lon": 80.2380, "tags": {"brand": "Heritage Fresh"}},
        {"osm_id": 90006, "name": "Ratna Supermarket Porur", "lat": 13.0375, "lon": 80.1550, "tags": {"brand": "Ratna"}},
        {"osm_id": 90007, "name": "Grace Supermarket Tambaram", "lat": 12.9230, "lon": 80.1250, "tags": {"brand": "Grace"}},
        {"osm_id": 90008, "name": "Fresh2Day Mylapore", "lat": 13.0350, "lon": 80.2660, "tags": {"brand": "Fresh2Day"}},
    ],
    "grocery": [
        {"osm_id": 91001, "name": "Sri Krishna Provision Store", "lat": 13.0420, "lon": 80.2350, "tags": {"shop": "grocery"}},
        {"osm_id": 91002, "name": "Karthik Veg & Provisions", "lat": 13.0830, "lon": 80.2090, "tags": {"shop": "greengrocer"}},
        {"osm_id": 91003, "name": "Annai Maligai Kadai", "lat": 12.9740, "lon": 80.2220, "tags": {"shop": "grocery"}},
        {"osm_id": 91004, "name": "Gokul Maligai Store", "lat": 13.0050, "lon": 80.2580, "tags": {"shop": "grocery"}},
    ],
    "convenience": [
        {"osm_id": 92001, "name": "Daily Needs Mart", "lat": 13.0400, "lon": 80.2320, "tags": {"shop": "convenience"}},
        {"osm_id": 92002, "name": "Om Sakthi Store", "lat": 13.0860, "lon": 80.2120, "tags": {"shop": "convenience"}},
        {"osm_id": 92003, "name": "7-Express Mini Mart", "lat": 12.9770, "lon": 80.2190, "tags": {"shop": "convenience"}},
    ],
    "school": [
        {"osm_id": 93001, "name": "Padma Seshadri Bala Bhavan (PSBB)", "lat": 13.0480, "lon": 80.2370, "tags": {"amenity": "school"}},
        {"osm_id": 93002, "name": "DAV Senior Secondary School Anna Nagar", "lat": 13.0890, "lon": 80.2150, "tags": {"amenity": "school"}},
        {"osm_id": 93003, "name": "Bala Vidya Mandir Adyar", "lat": 13.0090, "lon": 80.2520, "tags": {"amenity": "school"}},
        {"osm_id": 93004, "name": "Sishya School Adyar", "lat": 13.0040, "lon": 80.2590, "tags": {"amenity": "school"}},
    ],
    "hospital": [
        {"osm_id": 94001, "name": "Apollo Hospitals Greams Road", "lat": 13.0610, "lon": 80.2520, "tags": {"amenity": "hospital"}},
        {"osm_id": 94002, "name": "Fortis Malar Hospital Adyar", "lat": 13.0035, "lon": 80.2585, "tags": {"amenity": "hospital"}},
        {"osm_id": 94003, "name": "MIOT International Hospital", "lat": 13.0230, "lon": 80.1780, "tags": {"amenity": "hospital"}},
        {"osm_id": 94004, "name": "Kauvery Hospital Alwarpet", "lat": 13.0360, "lon": 80.2530, "tags": {"amenity": "hospital"}},
    ],
    "bus_stop": [
        {"osm_id": 95001, "name": "T. Nagar Bus Terminus", "lat": 13.0405, "lon": 80.2330, "tags": {"highway": "bus_stop"}},
        {"osm_id": 95002, "name": "Anna Nagar Roundtana", "lat": 13.0855, "lon": 80.2105, "tags": {"highway": "bus_stop"}},
        {"osm_id": 95003, "name": "Velachery Vijayanagar Bus Stop", "lat": 12.9730, "lon": 80.2210, "tags": {"highway": "bus_stop"}},
        {"osm_id": 95004, "name": "Adyar Depot", "lat": 13.0060, "lon": 80.2565, "tags": {"highway": "bus_stop"}},
        {"osm_id": 95005, "name": "Thoraipakkam Toll Stop", "lat": 12.9360, "lon": 80.2360, "tags": {"highway": "bus_stop"}},
    ],
    "rail_station": [
        {"osm_id": 96001, "name": "Chennai Central Railway Station", "lat": 13.0827, "lon": 80.2755, "tags": {"railway": "station"}},
        {"osm_id": 96002, "name": "Mambalam Railway Station", "lat": 13.0420, "lon": 80.2280, "tags": {"railway": "station"}},
        {"osm_id": 96003, "name": "Guindy Metro Station", "lat": 13.0080, "lon": 80.2130, "tags": {"railway": "station"}},
        {"osm_id": 96004, "name": "Velachery MRTS Station", "lat": 12.9810, "lon": 80.2190, "tags": {"railway": "station"}},
        {"osm_id": 96005, "name": "Anna Nagar East Metro", "lat": 13.0865, "lon": 80.2180, "tags": {"railway": "subway_entrance"}},
    ],
    "office": [
        {"osm_id": 97001, "name": "Tidel Park OMR", "lat": 12.9890, "lon": 80.2470, "tags": {"office": "it_park"}},
        {"osm_id": 97002, "name": "Ascendas IT Park Taramani", "lat": 12.9830, "lon": 80.2440, "tags": {"office": "it_park"}},
        {"osm_id": 97003, "name": "DLF Cybercity Porur", "lat": 13.0290, "lon": 80.1700, "tags": {"office": "commercial"}},
        {"osm_id": 97004, "name": "Ramanujan IT City", "lat": 12.9860, "lon": 80.2450, "tags": {"office": "it_park"}},
    ],
    "residential_building": [
        {"osm_id": 98001, "name": "Ceebros Boulevard", "lat": 12.9420, "lon": 80.2380, "tags": {"building": "apartments"}},
        {"osm_id": 98002, "name": "Olympia Opaline Navalur", "lat": 12.8450, "lon": 80.2260, "tags": {"building": "apartments"}},
        {"osm_id": 98003, "name": "Hiranandani Parks Oragadam", "lat": 12.8710, "lon": 80.1120, "tags": {"building": "residential"}},
        {"osm_id": 98004, "name": "Appaswamy Trellis Vadapalani", "lat": 13.0510, "lon": 80.2090, "tags": {"building": "apartments"}},
    ]
}


def query_overpass_category(category: str, query: str) -> Optional[List[Dict[str, Any]]]:
    """Execute Overpass query with retry and backoff across mirrors."""
    for attempt in range(1, 4):
        for server in OVERPASS_SERVERS:
            try:
                logger.info(f"Querying Overpass for '{category}' (attempt {attempt}) via {server}...")
                with httpx.Client(timeout=35.0) as client:
                    resp = client.post(server, data={"data": query})
                    if resp.status_code == 200:
                        data = resp.json()
                        elements = data.get("elements", [])
                        logger.info(f"Retrieved {len(elements)} elements for '{category}'.")
                        return elements
                    elif resp.status_code in [429, 504]:
                        logger.warning(f"Overpass server {server} rate-limited or timed out ({resp.status_code}).")
            except Exception as e:
                logger.warning(f"Failed query to {server}: {e}")
            time.sleep(2)
        time.sleep(attempt * 3)
    return None


def extract_poi_from_element(el: Dict[str, Any], category: str) -> Optional[Dict[str, Any]]:
    osm_id = el.get("id")
    if not osm_id:
        return None

    # Determine lat / lon from center or direct coordinates
    lat = el.get("lat")
    lon = el.get("lon")
    if lat is None or lon is None:
        center = el.get("center", {})
        lat = center.get("lat")
        lon = center.get("lon")

    if lat is None or lon is None:
        return None

    try:
        lat = float(lat)
        lon = float(lon)
    except ValueError:
        return None

    if not settings.is_within_chennai(lat, lon):
        return None

    tags = el.get("tags", {})
    name = tags.get("name") or tags.get("name:en") or tags.get("brand")

    return {
        "osm_id": osm_id,
        "category": category,
        "name": name,
        "lat": lat,
        "lon": lon,
        "tags": tags
    }


def ingest_osm():
    print("Ensuring database schema is initialized...")
    init_db()
    db = SessionLocal()

    total_ingested = 0

    try:
        for category, query in CATEGORY_QUERIES.items():
            print(f"\n--- Ingesting category: {category} ---")
            raw_file = RAW_DATA_DIR / f"{category}.json"

            elements = query_overpass_category(category, query)

            if elements is not None:
                # Save raw JSON to data/raw/
                with open(raw_file, "w", encoding="utf-8") as f:
                    json.dump(elements, f, indent=2)
                source_label = "overpass_api"
            else:
                # Check if we have previously saved raw file
                if raw_file.exists():
                    print(f"Overpass call failed; loading cached raw data from {raw_file}...")
                    with open(raw_file, "r", encoding="utf-8") as f:
                        elements = json.load(f)
                    source_label = "overpass_cached_raw"
                else:
                    print(f"Overpass unavailable and no raw cache. Using curated Chennai dataset for '{category}'...")
                    elements = FALLBACK_CHENNAI_POIS.get(category, [])
                    source_label = "curated_chennai_dataset"

            # Parse POIs
            pois_to_upsert = []
            for el in elements:
                # Check if el is already a parsed dictionary with lat/lon or raw OSM element
                if "lat" in el and "lon" in el and "osm_id" in el:
                    # Direct curated format
                    lat, lon = float(el["lat"]), float(el["lon"])
                    if settings.is_within_chennai(lat, lon):
                        pois_to_upsert.append({
                            "osm_id": el["osm_id"],
                            "category": category,
                            "name": el.get("name"),
                            "lat": lat,
                            "lon": lon,
                            "tags": el.get("tags", {})
                        })
                else:
                    extracted = extract_poi_from_element(el, category)
                    if extracted:
                        pois_to_upsert.append(extracted)

            # Upsert into database in batches
            category_upserted = 0
            upsert_sql = text("""
                INSERT INTO pois (osm_id, category, name, geom, tags)
                VALUES (:osm_id, :category, :name, ST_GeomFromEWKT(:geom), :tags)
                ON CONFLICT (category, osm_id)
                DO UPDATE SET
                    name = EXCLUDED.name,
                    geom = EXCLUDED.geom,
                    tags = EXCLUDED.tags;
            """)

            for p in pois_to_upsert:
                wkt_geom = f"SRID=4326;POINT({p['lon']} {p['lat']})"
                db.execute(upsert_sql, {
                    "osm_id": p["osm_id"],
                    "category": p["category"],
                    "name": p["name"],
                    "geom": wkt_geom,
                    "tags": json.dumps(p["tags"])
                })
                category_upserted += 1

            db.commit()
            total_ingested += category_upserted
            print(f"Upserted {category_upserted} POIs for category '{category}'.")

            # Write data_versions entry
            version = DataVersion(
                source=f"{source_label}:{category}",
                fetched_at=datetime.now(timezone.utc),
                record_count=category_upserted,
                notes=f"Ingested {category_upserted} {category} POIs for Chennai bbox"
            )
            db.add(version)
            db.commit()

        print(f"\n=======================================================")
        print(f"OSM POI Ingestion Complete. Total POIs upserted: {total_ingested}")
        print(f"=======================================================")

    except Exception as e:
        db.rollback()
        print(f"Error during OSM ingestion: {e}")
        raise e
    finally:
        db.close()


if __name__ == "__main__":
    ingest_osm()
