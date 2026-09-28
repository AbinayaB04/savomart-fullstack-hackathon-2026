import json
import logging
from typing import List, Dict, Any, Tuple, Optional
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.scoring.config import (
    SCORING_WEIGHTS,
    THRESHOLDS,
    PERSONS_PER_RESIDENTIAL_BUILDING,
    CELL_SIZE_SQKM,
    get_rating_band,
)

logger = logging.getLogger(__name__)


def clamp(val: float, min_val: float = 0.0, max_val: float = 1.0) -> float:
    return max(min_val, min(max_val, val))


# ---------------------------------------------------------
# Pure deterministic normalization functions
# ---------------------------------------------------------

def normalize_population(est_population: float, area_sqkm: float) -> Tuple[float, float, str]:
    density = est_population / max(0.05, area_sqkm)
    min_d = THRESHOLDS["population_density"]["min"]
    max_d = THRESHOLDS["population_density"]["max"]
    norm = clamp((density - min_d) / (max_d - min_d), 0.0, 1.0)

    if norm >= 0.75:
        why = f"High residential density ({round(density):,} /km²) provides a strong footfall base."
    elif norm >= 0.4:
        why = f"Moderate residential density ({round(density):,} /km²) sustains daily grocery demand."
    else:
        why = f"Low residential density ({round(density):,} /km²) indicates limited baseline household demand."
    return round(norm, 3), round(density, 1), why


def normalize_competition(supermarkets: int, groceries: int, convenience: int, area_sqkm: float) -> Tuple[float, float, str]:
    # Weighted competitors: direct supermarkets carry high weight, kirana/convenience lower
    weighted_competitors = (supermarkets * 1.0) + (groceries * 0.4) + (convenience * 0.2)
    comp_density = weighted_competitors / max(0.05, area_sqkm)

    # Sweet spot curve: 1.5 - 6 competitors/km² demonstrates commercial grocery demand without over-saturation
    if comp_density <= 0.5:
        # Very few competitors: high greenfield opportunity
        norm = 0.85
        why = f"Low competitor density ({round(comp_density, 1)} /km²); strong opportunity to capture unserved grocery demand."
    elif comp_density <= 4.0:
        # Ideal commercial activity with room for Savomart format
        norm = 0.95
        why = f"Balanced grocery hub ({round(comp_density, 1)} /km²); established grocery shopping habits with moderate competition."
    elif comp_density <= 8.0:
        norm = 0.65
        why = f"Competitive territory ({round(comp_density, 1)} /km²); requires differentiated pricing and superior assortment."
    else:
        norm = clamp(1.0 - ((comp_density - 8.0) * 0.06), 0.15, 0.5)
        why = f"Saturated retail landscape ({round(comp_density, 1)} /km²) with heavy incumbent store presence."

    return round(norm, 3), round(comp_density, 1), why


def normalize_amenities(schools: int, hospitals: int, area_sqkm: float) -> Tuple[float, float, str]:
    amenity_count = schools + hospitals
    density = amenity_count / max(0.05, area_sqkm)
    max_d = THRESHOLDS["amenities_density"]["max"]
    norm = clamp(density / max_d, 0.0, 1.0)

    if norm >= 0.6:
        why = f"High density of schools and hospitals ({round(density, 1)} /km²) drives steady daily family footfall."
    elif norm >= 0.3:
        why = f"Moderate civic amenities ({round(density, 1)} /km²) provide baseline neighborhood anchoring."
    else:
        why = f"Few civic institutions ({round(density, 1)} /km²); grocery store must rely purely on residential pull."
    return round(norm, 3), round(density, 1), why


def normalize_cannibalisation(nearest_dist_m: Optional[float]) -> Tuple[float, float, str]:
    safe_buffer = THRESHOLDS["cannibalisation_dist_meters"]["safe_buffer"]

    if nearest_dist_m is None:
        # No existing stores nearby in Chennai
        return 1.0, 9999.0, "No existing Savomart stores in catchment; zero cannibalisation risk."

    dist_m = float(nearest_dist_m)
    if dist_m >= safe_buffer:
        norm = 1.0
        why = f"Safe buffer ({round(dist_m):,} m >= {int(safe_buffer)} m) from nearest Savomart; no self-cannibalisation."
    else:
        # Linear penalty for proximity below 800m
        norm = clamp(dist_m / safe_buffer, 0.05, 1.0)
        why = f"Proximity warning: nearest Savomart is only {round(dist_m)} m away (< {int(safe_buffer)} m buffer), risking sales cannibalisation."

    return round(norm, 3), round(dist_m, 1), why


def normalize_business(offices: int, area_sqkm: float) -> Tuple[float, float, str]:
    density = offices / max(0.05, area_sqkm)
    max_d = THRESHOLDS["business_density"]["max"]
    norm = clamp(density / max_d, 0.0, 1.0)

    if norm >= 0.6:
        why = f"Strong commercial & office density ({round(density, 1)} /km²) boosts daytime ready-to-eat and impulse grocery sales."
    else:
        why = f"Primarily residential zoning with modest office presence ({round(density, 1)} /km²)."
    return round(norm, 3), round(density, 1), why


def normalize_accessibility(bus_stops: int, rail_stations: int, area_sqkm: float) -> Tuple[float, float, str]:
    weighted_transit = bus_stops + (rail_stations * 2)
    density = weighted_transit / max(0.05, area_sqkm)
    max_d = THRESHOLDS["accessibility_density"]["max"]
    norm = clamp(density / max_d, 0.0, 1.0)

    if norm >= 0.6:
        why = f"Excellent public transit connectivity ({round(density, 1)} /km²) enables high pedestrian commuter footfall."
    else:
        why = f"Moderate transit density ({round(density, 1)} /km²); relies more on two-wheeler and local walk-ins."
    return round(norm, 3), round(density, 1), why


# ---------------------------------------------------------
# Overall Evaluation & Hotspot Finder
# ---------------------------------------------------------

def evaluate_area_features(
    res_buildings: int,
    supermarkets: int,
    groceries: int,
    convenience: int,
    schools: int,
    hospitals: int,
    offices: int,
    bus_stops: int,
    rail_stations: int,
    nearest_store_dist_m: Optional[float],
    area_sqkm: float,
) -> Dict[str, Any]:
    """
    Pure deterministic scoring function that computes factor breakdown, points,
    total score (0-100), and rating band.
    """
    # 1. Population (mock derived: residential buildings * 4.5)
    est_population = int(res_buildings * PERSONS_PER_RESIDENTIAL_BUILDING)
    pop_norm, pop_raw, pop_why = normalize_population(est_population, area_sqkm)

    # 2. Competition
    comp_norm, comp_raw, comp_why = normalize_competition(supermarkets, groceries, convenience, area_sqkm)

    # 3. Amenities
    amen_norm, amen_raw, amen_why = normalize_amenities(schools, hospitals, area_sqkm)

    # 4. Cannibalisation
    cann_norm, cann_raw, cann_why = normalize_cannibalisation(nearest_store_dist_m)

    # 5. Business
    biz_norm, biz_raw, biz_why = normalize_business(offices, area_sqkm)

    # 6. Accessibility
    acc_norm, acc_raw, acc_why = normalize_accessibility(bus_stops, rail_stations, area_sqkm)

    # Assemble breakdown
    breakdown = [
        {
            "factor": "population",
            "name": "Household & Population Density",
            "raw_value": pop_raw,
            "unit": "persons/km²",
            "normalised": pop_norm,
            "weight": SCORING_WEIGHTS["population"],
            "points": round(pop_norm * SCORING_WEIGHTS["population"], 1),
            "is_mock": True,
            "why": pop_why,
        },
        {
            "factor": "competition",
            "name": "Competitor Viability & Saturation",
            "raw_value": comp_raw,
            "unit": "competitors/km²",
            "normalised": comp_norm,
            "weight": SCORING_WEIGHTS["competition"],
            "points": round(comp_norm * SCORING_WEIGHTS["competition"], 1),
            "is_mock": False,
            "why": comp_why,
        },
        {
            "factor": "amenities",
            "name": "Civic Anchors (Schools & Hospitals)",
            "raw_value": amen_raw,
            "unit": "institutions/km²",
            "normalised": amen_norm,
            "weight": SCORING_WEIGHTS["amenities"],
            "points": round(amen_norm * SCORING_WEIGHTS["amenities"], 1),
            "is_mock": False,
            "why": amen_why,
        },
        {
            "factor": "cannibalisation",
            "name": "Savomart Proximity Buffer",
            "raw_value": cann_raw,
            "unit": "meters",
            "normalised": cann_norm,
            "weight": SCORING_WEIGHTS["cannibalisation"],
            "points": round(cann_norm * SCORING_WEIGHTS["cannibalisation"], 1),
            "is_mock": False,
            "why": cann_why,
        },
        {
            "factor": "business",
            "name": "Commercial & Workplace Density",
            "raw_value": biz_raw,
            "unit": "offices/km²",
            "normalised": biz_norm,
            "weight": SCORING_WEIGHTS["business"],
            "points": round(biz_norm * SCORING_WEIGHTS["business"], 1),
            "is_mock": False,
            "why": biz_why,
        },
        {
            "factor": "accessibility",
            "name": "Transit & Commuter Accessibility",
            "raw_value": acc_raw,
            "unit": "stops/km²",
            "normalised": acc_norm,
            "weight": SCORING_WEIGHTS["accessibility"],
            "points": round(acc_norm * SCORING_WEIGHTS["accessibility"], 1),
            "is_mock": False,
            "why": acc_why,
        },
    ]

    total_score = round(sum(f["points"] for f in breakdown), 1)
    total_score = clamp(total_score, 0.0, 100.0)
    band = get_rating_band(total_score)

    area_profile = {
        "area_sqkm": round(area_sqkm, 2),
        "est_population": est_population,
        "is_mock_population": True,
        "residential_buildings": res_buildings,
        "supermarkets": supermarkets,
        "grocery_stores": groceries,
        "convenience_stores": convenience,
        "schools": schools,
        "hospitals": hospitals,
        "offices": offices,
        "bus_stops": bus_stops,
        "rail_stations": rail_stations,
        "nearest_savomart_dist_meters": round(nearest_store_dist_m) if nearest_store_dist_m else None,
    }

    return {
        "total_score": total_score,
        "band": band,
        "breakdown": breakdown,
        "area_profile": area_profile,
    }


def compute_area_report(db: Session, cell_ids: List[int]) -> Dict[str, Any]:
    """
    Computes complete area fitness report for a collection of selected grid cells using PostGIS.
    """
    if not cell_ids:
        raise ValueError("At least one cell ID is required for area scoring.")

    # 1. Fetch union geometry, centroid, and area
    geo_query = text("""
        SELECT 
            ST_AsGeoJSON(ST_Union(geom)) AS union_geom_json,
            ST_AsGeoJSON(ST_Centroid(ST_Union(geom))) AS centroid_json,
            COALESCE(ST_Area(ST_Union(geom)::geography) / 1000000.0, :fallback_area) AS area_sqkm
        FROM grid_cells
        WHERE id = ANY(:cell_ids);
    """)

    geo_row = db.execute(geo_query, {
        "cell_ids": cell_ids,
        "fallback_area": len(cell_ids) * CELL_SIZE_SQKM
    }).fetchone()

    if not geo_row or not geo_row.union_geom_json:
        raise ValueError(f"No spatial geometries found for cell IDs: {cell_ids}")

    union_geom = json.loads(geo_row.union_geom_json)
    centroid = json.loads(geo_row.centroid_json)["coordinates"]
    area_sqkm = max(0.1, float(geo_row.area_sqkm))

    # 2. Count POIs by category within the union geometry
    poi_query = text("""
        SELECT 
            category,
            COUNT(*) AS cnt
        FROM pois
        WHERE ST_Intersects(geom, ST_GeomFromGeoJSON(:geom_json))
        GROUP BY category;
    """)

    poi_rows = db.execute(poi_query, {"geom_json": json.dumps(union_geom)}).fetchall()
    cat_counts = {r.category: int(r.cnt) for r in poi_rows}

    # 3. Distance to nearest operational Savomart store from centroid
    dist_query = text("""
        SELECT MIN(ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography)) AS dist_m
        FROM stores;
    """)
    dist_row = db.execute(dist_query, {"lon": centroid[0], "lat": centroid[1]}).fetchone()
    nearest_dist_m = float(dist_row.dist_m) if dist_row and dist_row.dist_m is not None else None

    # 4. Evaluate main area score
    eval_result = evaluate_area_features(
        res_buildings=cat_counts.get("residential_building", 0),
        supermarkets=cat_counts.get("supermarket", 0),
        groceries=cat_counts.get("grocery", 0),
        convenience=cat_counts.get("convenience", 0),
        schools=cat_counts.get("school", 0),
        hospitals=cat_counts.get("hospital", 0),
        offices=cat_counts.get("office", 0),
        bus_stops=cat_counts.get("bus_stop", 0),
        rail_stations=cat_counts.get("rail_station", 0),
        nearest_store_dist_m=nearest_dist_m,
        area_sqkm=area_sqkm,
    )

    # 5. Hotspot analysis: Score each individual cell in selection to find top 5 hotspots
    hotspots = find_hotspots_in_cells(db, cell_ids, nearest_dist_m)

    return {
        "score": eval_result["total_score"],
        "band": eval_result["band"],
        "breakdown": eval_result["breakdown"],
        "area_profile": eval_result["area_profile"],
        "hotspots": hotspots,
        "union_geom": union_geom,
        "centroid": centroid,
    }


def find_hotspots_in_cells(db: Session, cell_ids: List[int], nearest_global_store_dist_m: Optional[float]) -> List[Dict[str, Any]]:
    """
    Finds top 5 hotspots among selected cells using cheap per-cell scoring.
    """
    if len(cell_ids) == 1:
        # If single cell selected, return it as the primary hotspot
        single_cell_query = text("""
            SELECT id, ST_AsGeoJSON(centroid) as centroid_json
            FROM grid_cells WHERE id = :cell_id;
        """)
        row = db.execute(single_cell_query, {"cell_id": cell_ids[0]}).fetchone()
        centroid = json.loads(row.centroid_json)["coordinates"] if row else [80.23, 13.04]
        return [{
            "cell_id": cell_ids[0],
            "score": 85.0,
            "centroid": centroid,
            "reason": "Primary targeted scouting cell for ground inspection",
        }]

    # Spatial query for POIs intersecting each individual cell
    cell_query = text("""
        SELECT 
            c.id AS cell_id,
            ST_AsGeoJSON(c.centroid) AS centroid_json,
            COUNT(CASE WHEN p.category = 'residential_building' THEN 1 END) AS res_count,
            COUNT(CASE WHEN p.category = 'supermarket' THEN 1 END) AS super_count,
            COUNT(CASE WHEN p.category = 'grocery' THEN 1 END) AS groc_count,
            COUNT(CASE WHEN p.category IN ('bus_stop', 'rail_station') THEN 1 END) AS transit_count
        FROM grid_cells c
        LEFT JOIN pois p ON ST_Intersects(c.geom, p.geom)
        WHERE c.id = ANY(:cell_ids)
        GROUP BY c.id, c.centroid;
    """)

    rows = db.execute(cell_query, {"cell_ids": cell_ids}).fetchall()
    scored_cells = []

    for r in rows:
        centroid = json.loads(r.centroid_json)["coordinates"]
        res_cnt = int(r.res_count or 0)
        super_cnt = int(r.super_count or 0)
        groc_cnt = int(r.groc_count or 0)
        transit_cnt = int(r.transit_count or 0)

        # Cheap scoring model for individual 500m cell:
        # Demand: residential * 4.5
        # Penalty if direct supermarket is right inside the same 500m cell
        demand_score = min(50.0, res_cnt * 12.0 + transit_cnt * 5.0 + 20.0)
        competition_modifier = -20.0 if super_cnt > 0 else 25.0
        cell_score = clamp(demand_score + competition_modifier + 10.0, 15.0, 96.0)

        # Generate specific plain-English reason
        if super_cnt == 0 and res_cnt > 0:
            reason = f"High residential cluster with 0 direct supermarkets within 500m"
        elif transit_cnt >= 2:
            reason = f"High footfall commuter node with {transit_cnt} transit access points"
        elif groc_cnt > 0:
            reason = f"Active local market street with proven grocery shopping footfall"
        else:
            reason = f"Strong potential retail catchment with room for express format"

        scored_cells.append({
            "cell_id": r.cell_id,
            "score": round(cell_score, 1),
            "centroid": centroid,
            "reason": reason,
        })

    # Sort descending by score and pick top 5
    scored_cells.sort(key=lambda x: x["score"], reverse=True)
    return scored_cells[:5]
