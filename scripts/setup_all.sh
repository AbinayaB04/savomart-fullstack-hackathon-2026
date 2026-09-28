#!/usr/bin/env bash
set -e

echo "=========================================================="
echo "Savo SiteScout: Master Ingestion and Setup Script"
echo "=========================================================="

python -m scripts.seed_users
python -m scripts.generate_grid
python -m scripts.ingest_stores
python -m scripts.ingest_osm

echo "Setup completed successfully."
