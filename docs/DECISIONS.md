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

---

## Phase 3: Milestone 2, Property Scouting & Pipeline

### 12. Property Evaluation Scoring Architecture
- **Decision:** Pure deterministic property scoring combines physical specifications with 500m PostGIS spatial catchment:
  - Commercial & Lease terms (weight: 25): evaluates asking rent per sqft against a zone-specific Chennai market benchmark table (₹55–₹105/sqft/mo). Missing rent is permitted but flags `confidence = "low"`.
  - Frontage & Road Visibility (weight: 20): $\ge 20\text{ ft}$ optimal for supermarket signage and customer walk-ins; rated 1–5 visibility scale.
  - Road Width & Parking Access (weight: 15): $\ge 30\text{ ft}$ street width for delivery truck approach and customer ingress, plus on-premise dedicated parking slots.
  - 500m Catchment Demographics (weight: 20): PostGIS spatial queries counting residential complexes and civic institutions within a 500m radius.
  - Cannibalisation & Competition (weight: 20): distance to nearest operational Savomart store ($<800\text{ m}$ penalized) and competitor clustering.
- **Recommendations:** $\ge 70$ = `proceed`, $50-69$ = `review`, $< 50$ = `reject`.

### 13. Spatial Deduplication (50m Buffer + Specification Tolerance)
- **Decision:** Prevent duplicate submissions from field scouts by checking existing properties within 50 meters using PostGIS `ST_DWithin(location::geography, new_point::geography, 50.0)`.
- **Tolerance Check:** If distance $\le 50\text{ m}$ AND carpet area or monthly rent is within $\pm 20\%$, the API rejects creation with `HTTP 409 Conflict` and returns potential duplicates. Field scouts can override using `force=true` if onboarding a distinct retail unit in the same complex.

### 14. Pipeline State Machine & Mandatory Reason Audit
- **Decision:** Property progression follows strict lifecycle transitions:
  `scouted` $\to$ `under_review` $\to$ `proceed` $\to$ `catchment_study` $\to$ `approved` | `rejected` (also `on_hold`).
- **Audit Requirement:** Only BD Managers can advance or alter stages. A non-empty text justification (`reason`) is mandatory, and every move appends an immutable row to `property_stage_history`.

---

## Phase 4: Milestone 3, Catchment Study (Survey Operations)

### 15. Catchment Study Operations & 6-Month Spatial Reuse Rule
- **Decision:** Documented in `backend/app/studies/reuse.py`:
  When a study is requested for a property, the system queries for any `COMPLETED` study whose covered geometry `ST_Contains` the property point (or is within 300 meters: `ST_DWithin(geom::geography, prop.location::geography, 300.0)`) AND whose `completed_at` is within the last 6 months (180 days).
- **Behavior on Reuse:** If found, the system immediately links the request with `reused_from_request_id`, marks the study completed, copies the rolled-up insights, returns a human-readable justification to the UI (`"Reused study #study_xxx, covers this location, N days old"`), and triggers property re-evaluation without generating redundant tasks.
- **Task Splitting & Workload Balancing:** When non-reused studies are planned, the system queries non-overlapping 500m grid cells within `radius_m` (default 1000m) of the target property point. Each task is weighted by building density (`workload_weight = 1.0 + (building_count * 0.1)`). An "Auto-assign" action greedily distributes tasks across active Survey Executives using Longest-Processing-Time first bin packing.
- **Offline Resilience & Idempotent Sync:** Field surveyors capture lane data (10-min pedestrian counts, peak estimates, shop mix, competitors, lane width, parking, lighting, GPS, and photos) in a mobile-first form with continuous draft autosave to `localStorage`. Submissions include a client-generated `client_uuid` with a unique DB index, guaranteeing zero duplication on network reconnection or multiple sync retries.
- **Automated Rollup & Property Re-evaluation:** Upon submission of the final remaining task in a study request, the backend automatically computes rolled-up footfall averages, competitor counts, shop mix distribution, and lane suitability. It marks the study completed and triggers a new property evaluation version (`"Updated after catchment study"`) replacing model estimates with ground-truth survey metrics.



