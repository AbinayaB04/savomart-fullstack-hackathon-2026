# Engineering Decisions & Trade-offs (DECISIONS.md)

This document tracks technical decisions, architectural trade-offs, and known issues for Savo SiteScout.

---

## Phase 1: Foundation & Ingestion

### 1. Database & Geometry Handling
- **Decision:** Use PostgreSQL with PostGIS extension (`postgis/postgis:16-3.4` or `postgis/postgis:latest`), SQLAlchemy 2.0 with GeoAlchemy2, and store all geometries as SRID 4326 (`Point`, `Polygon`).
- **Rationale:** Native spatial functions (`ST_DWithin`, `ST_Intersects`, `ST_Contains`) with spatial GIST indices provide high performance for geospatial queries (grid cells, POIs, stores).
- **Trade-off:** Coordinate math in SRID 4326 is angular (degrees). For metric radius queries, we cast geometries to `geography` or use EPSG:3857/UTM projection approximations for grid generation.

### 2. 500m Grid Cell Generation
- **Decision:** Generate uniform 500m x 500m grid cells covering the Chennai bounding box (lat: 12.80 - 13.25, lon: 80.05 - 80.35).
- **Calculation:** At Chennai's latitude (~13.0°N), $1^\circ \text{Lat} \approx 110.574 \text{ km}$ ($500\text{ m} \approx 0.004522^\circ$) and $1^\circ \text{Lon} \approx 108.46 \text{ km}$ ($500\text{ m} \approx 0.004610^\circ$).
- **Trade-off:** Pre-generating and persisting the grid cells with GIST index in `grid_cells` table enables fast spatial joins during scouting and evaluation without on-the-fly mesh computation.

### 3. OpenStreetMap Ingestion via Overpass API
- **Decision:** Query each POI category in separate Overpass queries with retry and exponential backoff, storing raw responses in `data/raw/` before upserting into the `pois` table.
- **Trade-off:** Public Overpass endpoints frequently rate-limit or timeout on large multi-category queries. Splitting queries per category and including fallback data ensure the setup script is reliable even when Overpass is throttled.

### 4. Savomart Stores Ingestion & Graceful Fallback
- **Decision:** The stores ingestion script calls the internal Savomart API with the `X-cron-token`. If the endpoint is unavailable, network fails, or authorization fails, it logs a warning and retains existing cached data (or seeds realistic operational Chennai store locations as fallback).
- **Trade-off:** Prevents cold-start blocks if external APIs are behind a VPN or temporarily unreachable during offline testing/evaluation.

### 5. Role Switcher & Persona Isolation
- **Decision:** Simulated authentication without passwords: users are seeded in the DB, and the frontend role switcher saves the active user in `localStorage`, sending `X-User-Id` on all API requests. FastAPI uses a dependency `get_current_user` and `require_role(...)` to enforce permissions.
- **Trade-off:** Maximizes speed of development for the 48h hackathon while retaining strict role-level endpoint security.

### 6. LLM Provider Abstraction
- **Decision:** Created an extensible provider interface (`gemini`, `openai`, `anthropic`, `none`) with template-based fallback. All numbers in generated narratives are cross-checked against deterministic Python inputs.

### 7. Port Configuration & Host Environment Isolation
- **Decision:** Parameterize `DB_PORT` (default 5432), `BACKEND_PORT` (default 8000), and `FRONTEND_PORT` (default 5173) in `.env` and `docker-compose.yml`.
- **Known Issue / Environment Conflict:** If existing development services (such as host PostgreSQL on 5432 or ML tools on 8000) are running on the developer workstation, overriding `DB_PORT` or `BACKEND_PORT` in `.env` avoids host port collision without altering internal docker network addresses (`db:5432`, `backend:8000`).

### 8. Mock Data Transparency
- **Rule:** Where public datasets are unavailable or mock data is generated for fallback stores, all records carry `is_mock: true` in API responses, raw JSON properties, and are visually highlighted with amber mock indicators in the UI.

---

## Phase 2: Milestone 1, Area Intelligence

### 9. Area Scoring Architecture & Deterministic Explainability
- **Decision:** Pure Python functions compute all factors deterministically before applying weights:
  - Population (weight: 30): derived transparently as `residential_buildings * 4.5 persons`, normalized per sq km.
  - Competition (weight: 25): supermarket and grocery density evaluated against a balanced commercial viability curve.
  - Amenities (weight: 15): schools and hospitals per sq km.
  - Cannibalisation (weight: 15): PostGIS metric distance from centroid to the nearest Savomart store. Proximity < 800m is penalized linearly; distance >= 800m is completely neutral (score 1.0).
  - Business (weight: 10): commercial office density per sq km.
  - Accessibility (weight: 5): public transit stops and metro stations per sq km.
  - Total Score: $0 \le \sum (\text{normalized} \times \text{weight}) \le 100$.
- **Rating Bands:** $\ge 80$ = Excellent, $65-79$ = Good, $50-64$ = Fair, $< 50$ = Poor.

### 10. Locality & Pincode Geocoding
- **Decision:** Integrated OpenStreetMap Nominatim with viewbox constrained to Chennai (`[80.05, 12.80, 80.35, 13.25]`).
- **Policy Compliance:** Maintained strict 1 request/second throttling and persisted all queries in `geocode_cache` table. Pincode searching (e.g. 600042) is resolved via Nominatim address hierarchy.

### 11. Partial Failure Resiliency
- **Decision:** Background evaluation decouples spatial analysis from LLM text generation. If the LLM call times out or fails number validation, the report still succeeds with `summary_source = "template"`. If scoring fails, status is marked `failed` with error details, and `POST /reports/{id}/retry` allows immediate re-evaluation.


