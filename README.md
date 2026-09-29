# Savo SiteScout: Chennai Retail Expansion Intelligence

**Savo SiteScout** is a lean, geospatial expansion intelligence platform built for **Savomart** (grocery retail) for the Chennai region. It powers the end-to-end retail site selection workflow across business development and field survey operations.

---

## Quick Start

### 1. Prerequisites
- Docker & Docker Compose
- (Optional for local Python/Node execution: Python 3.11+, Node 20+)

### 2. Configure Environment
```bash
cp .env.example .env
```
*(Default settings configure PostgreSQL/PostGIS, Chennai bounding box `[12.80-13.25, 80.05-80.35]`, and port mappings).*

### 3. Launch Docker Compose
```bash
docker compose up --build
```
This starts:
- **PostGIS Database**: `localhost:5432` (`savomart_sitescout`)
- **FastAPI Backend**: `http://localhost:8000` (API docs at `/docs`)
- **React Frontend**: `http://localhost:5173` with Vite hot reload

### 4. Run Data Ingestion & Seed
In a new terminal (or inside the backend container):
```bash
# Using Makefile
make setup

# Or via Python module directly
python -m scripts.setup_all

# Or via Bash
bash scripts/setup_all.sh
```

---

## Personas & Workspaces
Savo SiteScout features 4 distinct role-tailored workspaces. No passwords needed: switch personas instantly using the header dropdown, which sets `X-User-Id` on all requests.

| Persona | Form Factor | Responsibility & Workspace |
| :--- | :--- | :--- |
| **BD Manager** | Desktop | Chennai map, Area Fitness Reports, expansion pipeline board, request catchment studies |
| **BD Executive** | Mobile-First | Scouting assignments, on-ground retail property onboarding form |
| **Survey Manager** | Desktop | Catchment survey inbox, micro-task splitting, survey team assignment |
| **Survey Executive** | Mobile-First | Assigned lane survey tasks, on-foot footfall & lane data capture form |

---

## Geospatial Focus & Data Rules

- **Chennai Bounding Box:** Lat `12.80` to `13.25`, Lon `80.05` to `80.35`. Any coordinates outside this box are rejected.
- **500m Scouting Mesh:** Uniform 500m x 500m grid cells pre-computed and indexed with PostGIS GIST indexes for instant spatial querying.
- **Savomart Stores API:** Cached in PostGIS `stores` table from `https://internal-service.savomart.in/bridge/api/store/list?is_operational=True`.
- **OpenStreetMap Ingestion:** Automated Overpass API pipeline with retry/backoff for `supermarket`, `grocery`, `convenience`, `school`, `hospital`, `bus_stop`, `rail_station`, `office`, `residential_building`.
- **Transparent Mock Data:** Where public data is unavailable or external APIs are unreachable, transparently derived mock data is used and explicitly tagged with `is_mock: true` in API responses and labeled with orange "Mock data" badges in the UI.

---

## API Endpoints (Phase 1)

- `GET /health`: System health and Chennai bounding box confirmation
- `GET /users`: List all 8 seeded users across 4 personas
- `GET /me`: Current user resolution from `X-User-Id` header
- `GET /grid?bbox=minLon,minLat,maxLon,maxLat`: GeoJSON FeatureCollection of 500m grid cells
- `GET /stores`: GeoJSON FeatureCollection of cached Savomart stores
- `GET /pois?bbox=&category=`: GeoJSON FeatureCollection of filtered Chennai POIs

---

## 🛠️ Tech Stack & Branding

- **Backend:** Python FastAPI, SQLAlchemy 2, GeoAlchemy2, PostGIS, Pydantic v2
- **Frontend:** React (Vite), Tailwind CSS, React-Leaflet, OSM tiles, Lucide icons
- **Branding:** Primary Purple `#782B90` (`brand-purple`), Accent Yellow `#FFF200` (`brand-yellow`)
- **Architecture Notes:** See [docs/DECISIONS.md](file:///d:/files/SAVOMart/savomart-fullstack-hackathon-2026/docs/DECISIONS.md) for architectural trade-offs and design rationale.
