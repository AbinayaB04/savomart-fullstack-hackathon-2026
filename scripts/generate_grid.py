import math
import sys
from pathlib import Path
from datetime import datetime, timezone

# Add backend directory to sys.path so app modules are resolvable
backend_dir = Path(__file__).resolve().parent.parent / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from sqlalchemy import text
from app.config import settings
from app.db.session import SessionLocal, init_db
from app.db.models import DataVersion


def generate_grid(force: bool = False):
    print("Ensuring database schema is initialized...")
    init_db()
    db = SessionLocal()

    try:
        # Check existing cells count
        count_res = db.execute(text("SELECT COUNT(*) FROM grid_cells;")).scalar()
        if count_res > 0 and not force:
            print(f"Grid cells already exist in database (count: {count_res}). Use force=True to regenerate.")
            return

        if force and count_res > 0:
            print("Purging existing grid cells...")
            db.execute(text("TRUNCATE TABLE grid_cells RESTART IDENTITY CASCADE;"))
            db.commit()

        min_lat = settings.CHENNAI_MIN_LAT
        max_lat = settings.CHENNAI_MAX_LAT
        min_lon = settings.CHENNAI_MIN_LON
        max_lon = settings.CHENNAI_MAX_LON

        # 500m in degrees calculation at latitude ~13.0° N
        lat_center = (min_lat + max_lat) / 2.0
        m_per_deg_lat = 111195.0
        m_per_deg_lon = 111195.0 * math.cos(math.radians(lat_center))

        cell_size_m = 500.0
        d_lat = cell_size_m / m_per_deg_lat
        d_lon = cell_size_m / m_per_deg_lon

        lat_steps = int(math.ceil((max_lat - min_lat) / d_lat))
        lon_steps = int(math.ceil((max_lon - min_lon) / d_lon))

        print(f"Generating Chennai 500m grid: {lat_steps} rows x {lon_steps} cols (~{lat_steps * lon_steps} cells)...")

        cells_data = []
        for r in range(lat_steps):
            cell_min_lat = min_lat + r * d_lat
            cell_max_lat = min(cell_min_lat + d_lat, max_lat + d_lat)

            for c in range(lon_steps):
                cell_min_lon = min_lon + c * d_lon
                cell_max_lon = min(cell_min_lon + d_lon, max_lon + d_lon)

                centroid_lon = (cell_min_lon + cell_max_lon) / 2.0
                centroid_lat = (cell_min_lat + cell_max_lat) / 2.0

                wkt_polygon = (
                    f"SRID=4326;POLYGON(({cell_min_lon} {cell_min_lat}, "
                    f"{cell_max_lon} {cell_min_lat}, "
                    f"{cell_max_lon} {cell_max_lat}, "
                    f"{cell_min_lon} {cell_max_lat}, "
                    f"{cell_min_lon} {cell_min_lat}))"
                )
                wkt_centroid = f"SRID=4326;POINT({centroid_lon} {centroid_lat})"

                cells_data.append({
                    "row": r,
                    "col": c,
                    "geom": wkt_polygon,
                    "centroid": wkt_centroid
                })

        # Bulk insert in chunks
        chunk_size = 1000
        insert_query = text("""
            INSERT INTO grid_cells (row, col, geom, centroid)
            VALUES (:row, :col, ST_GeomFromEWKT(:geom), ST_GeomFromEWKT(:centroid));
        """)

        for i in range(0, len(cells_data), chunk_size):
            chunk = cells_data[i:i + chunk_size]
            db.execute(insert_query, chunk)
            db.commit()
            print(f"  Inserted {min(i + chunk_size, len(cells_data))}/{len(cells_data)} grid cells...")

        # Record data version
        version = DataVersion(
            source="grid_generator_500m",
            fetched_at=datetime.now(timezone.utc),
            record_count=len(cells_data),
            notes=f"Generated {len(cells_data)} 500m cells for Chennai bbox [{min_lon},{min_lat} to {max_lon},{max_lat}]"
        )
        db.add(version)
        db.commit()

        print(f"Grid generation completed successfully. Total cells created: {len(cells_data)}")

    except Exception as e:
        db.rollback()
        print(f"Error generating grid cells: {e}")
        raise e
    finally:
        db.close()


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Generate 500m grid for Chennai")
    parser.add_argument("--force", action="store_true", help="Force regenerate existing grid cells")
    args = parser.parse_args()
    generate_grid(force=args.force)
