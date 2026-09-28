.PHONY: up down setup seed grid stores osm logs test

up:
	docker compose up --build

down:
	docker compose down

setup:
	python -m scripts.setup_all

seed:
	python -m scripts.seed_users

grid:
	python -m scripts.generate_grid

stores:
	python -m scripts.ingest_stores

osm:
	python -m scripts.ingest_osm

logs:
	docker compose logs -f
