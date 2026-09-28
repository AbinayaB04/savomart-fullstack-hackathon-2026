import sys
import time
from pathlib import Path

# Add backend directory to sys.path so app modules are resolvable
backend_dir = Path(__file__).resolve().parent.parent / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from scripts.seed_users import seed_users
from scripts.generate_grid import generate_grid
from scripts.ingest_stores import ingest_stores
from scripts.ingest_osm import ingest_osm


def setup_all():
    start_time = time.time()
    print("=" * 60)
    print("SAVO SITESCOUT: RUNNING SYSTEM SETUP & INGESTION")
    print("=" * 60)

    print("\n[Step 1/4] Seeding personas and users...")
    seed_users()

    print("\n[Step 2/4] Generating 500m Chennai spatial grid cells...")
    generate_grid()

    print("\n[Step 3/4] Ingesting Savomart stores...")
    ingest_stores()

    print("\n[Step 4/4] Ingesting OpenStreetMap POIs across Chennai...")
    ingest_osm()

    elapsed = round(time.time() - start_time, 2)
    print("\n" + "=" * 60)
    print(f"ALL SETUP AND INGESTION COMPLETED IN {elapsed}s!")
    print("=" * 60)


if __name__ == "__main__":
    setup_all()
