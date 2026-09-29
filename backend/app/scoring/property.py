import logging
import math
from typing import Dict, Any, List, Tuple, Optional
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from sqlalchemy import text
from geoalchemy2.shape import from_shape, to_shape
from shapely.geometry import Point

from app.db.models import (
    Property,
    PropertyEvaluation,
    Store,
    POI,
    AreaReport,
    PropertyRecommendation,
    EvaluationConfidence,
)
from app.llm.provider import get_llm_provider, validate_narrative_numbers
from app.llm.templates import generate_template_summary

logger = logging.getLogger(__name__)

# MOCK Commercial Rent Benchmarks for Chennai zones (₹/sqft/month)
CHENNAI_RENT_BENCHMARKS = [
    {"name": "T. Nagar / Central Hub", "center": (13.0418, 80.2341), "radius_km": 3.0, "benchmark_sqft": 105.0},
    {"name": "Mylapore / Alwarpet", "center": (13.0336, 80.2677), "radius_km": 2.5, "benchmark_sqft": 100.0},
    {"name": "Anna Nagar", "center": (13.0850, 80.2101), "radius_km": 3.0, "benchmark_sqft": 95.0},
    {"name": "Velachery / South Hub", "center": (12.9750, 80.2200), "radius_km": 3.5, "benchmark_sqft": 80.0},
    {"name": "Adyar / Besant Nagar", "center": (13.0012, 80.2565), "radius_km": 3.0, "benchmark_sqft": 90.0},
    {"name": "Porur / West Hub", "center": (13.0382, 80.1565), "radius_km": 4.0, "benchmark_sqft": 70.0},
    {"name": "Tambaram / South Suburban", "center": (12.9249, 80.1000), "radius_km": 5.0, "benchmark_sqft": 55.0},
]
DEFAULT_CHENNAI_BENCHMARK = 75.0  # ₹/sqft/month


def get_rent_benchmark(lat: float, lon: float) -> Tuple[float, str]:
    """Find the closest zone benchmark or default for Chennai."""
    for zone in CHENNAI_RENT_BENCHMARKS:
        z_lat, z_lon = zone["center"]
        d_lat = (lat - z_lat) * 111.0
        d_lon = (lon - z_lon) * 108.0
        dist = math.sqrt(d_lat * d_lat + d_lon * d_lon)
        if dist <= zone["radius_km"]:
            return zone["benchmark_sqft"], zone["name"]
    return DEFAULT_CHENNAI_BENCHMARK, "Chennai General Commercial Zone"


def compute_property_surroundings(db: Session, lat: float, lon: float, radius_meters: float = 500.0) -> Dict[str, Any]:
    """
    Query PostGIS for surrounding POIs and nearest Savomart store within radius_meters.
    """
    # 1. Competitors within radius
    comp_sql = text("""
        SELECT category, COUNT(*) as count
        FROM pois
        WHERE category IN ('supermarket', 'grocery', 'convenience')
          AND ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography, :radius)
        GROUP BY category;
    """)
    comp_res = db.execute(comp_sql, {"lon": lon, "lat": lat, "radius": radius_meters}).fetchall()
    competitors = {row[0]: row[1] for row in comp_res}
    supermarket_count = competitors.get("supermarket", 0)
    grocery_count = competitors.get("grocery", 0)
    convenience_count = competitors.get("convenience", 0)
    total_competitors = supermarket_count + grocery_count + convenience_count

    # 2. Residential density within radius
    res_sql = text("""
        SELECT COUNT(*)
        FROM pois
        WHERE category = 'residential_building'
          AND ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography, :radius);
    """)
    residential_count = db.execute(res_sql, {"lon": lon, "lat": lat, "radius": radius_meters}).scalar() or 0

    # 3. Civic amenities within radius
    amenity_sql = text("""
        SELECT category, COUNT(*) as count
        FROM pois
        WHERE category IN ('school', 'hospital', 'bus_stop', 'rail_station', 'office')
          AND ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography, :radius)
        GROUP BY category;
    """)
    amenity_res = db.execute(amenity_sql, {"lon": lon, "lat": lat, "radius": radius_meters}).fetchall()
    amenities = {row[0]: row[1] for row in amenity_res}
    school_count = amenities.get("school", 0)
    hospital_count = amenities.get("hospital", 0)
    bus_count = amenities.get("bus_stop", 0)
    rail_count = amenities.get("rail_station", 0)
    office_count = amenities.get("office", 0)

    # 4. Distance to nearest operational Savomart store (cannibalisation)
    store_sql = text("""
        SELECT id, name, ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography) as dist_meters
        FROM stores
        ORDER BY geom <-> ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)
        LIMIT 1;
    """)
    store_row = db.execute(store_sql, {"lon": lon, "lat": lat}).fetchone()
    nearest_store_name = store_row[1] if store_row else None
    nearest_store_dist = round(store_row[2], 1) if store_row else 5000.0

    # 5. Check if inside an evaluated AreaReport
    report_sql = text("""
        SELECT id, name, score, band
        FROM area_reports
        WHERE status = 'done' AND geom IS NOT NULL
          AND ST_Intersects(geom, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326))
        ORDER BY created_at DESC
        LIMIT 1;
    """)
    report_row = db.execute(report_sql, {"lon": lon, "lat": lat}).fetchone()
    containing_report = {
        "id": report_row[0],
        "name": report_row[1],
        "score": report_row[2],
        "band": report_row[3],
    } if report_row else None

    return {
        "supermarket_count": supermarket_count,
        "grocery_count": grocery_count,
        "convenience_count": convenience_count,
        "total_competitors": total_competitors,
        "residential_count": residential_count,
        "school_count": school_count,
        "hospital_count": hospital_count,
        "bus_count": bus_count,
        "rail_count": rail_count,
        "office_count": office_count,
        "nearest_store_name": nearest_store_name,
        "nearest_store_dist": nearest_store_dist,
        "containing_report": containing_report,
    }


def evaluate_property_deterministic(prop: Property, db: Session) -> Dict[str, Any]:
    """
    Pure deterministic scoring for a retail property.
    Evaluates:
      1. Commercial & Rent Feasibility (Weight 25)
      2. Physical Frontage & Visibility (Weight 20)
      3. Road Width & Parking Access (Weight 15)
      4. Surrounding Catchment Demographics (Weight 20)
      5. Retail Competition & Cannibalisation (Weight 20)
    Total = 100
    """
    pt = to_shape(prop.location)
    lat, lon = pt.y, pt.x

    benchmark_sqft, zone_name = get_rent_benchmark(lat, lon)
    surroundings = compute_property_surroundings(db, lat, lon, radius_meters=500.0)

    # Check if this property has a completed catchment study with ground-truth survey data
    from app.db.models import StudyRequest, StudyStatus
    completed_study = (
        db.query(StudyRequest)
        .filter(StudyRequest.property_id == prop.id, StudyRequest.status == StudyStatus.COMPLETED)
        .order_by(StudyRequest.completed_at.desc())
        .first()
    )
    study_insights = completed_study.insights if (completed_study and completed_study.insights) else None

    insights: List[str] = []
    risks: List[str] = []
    confidence = EvaluationConfidence.HIGH.value

    # If survey data exists, note the ground-truth validation
    if study_insights:
        peak_est = study_insights.get("avg_peak_hour_estimate", 0)
        dom_hh = study_insights.get("dominant_household_type", "mixed")
        comp_ct = study_insights.get("competitor_count", 0)
        insights.append(f"Updated after catchment study: Ground survey verified peak footfall of {peak_est}/hr and {comp_ct} competitor stores in immediate lanes.")


    # ----------------------------------------------------
    # Factor 1: Commercial & Rent Feasibility (Weight 25)
    # ----------------------------------------------------
    rent_monthly = prop.rent_monthly
    area_sqft = prop.area_sqft or 1.0
    rent_per_sqft = round(rent_monthly / area_sqft, 1) if rent_monthly else None

    if rent_per_sqft is None:
        confidence = EvaluationConfidence.LOW.value
        rent_norm = 0.5
        rent_points = round(25.0 * rent_norm, 1)
        rent_why = "Rent not disclosed; evaluated with neutral baseline and marked low confidence."
        risks.append("Monthly rent not provided; financial viability unverified.")
    else:
        ratio = rent_per_sqft / benchmark_sqft
        if ratio <= 0.85:
            rent_norm = 1.0
            insights.append(f"Highly competitive rent of ₹{rent_per_sqft}/sqft is {round((1 - ratio)*100)}% below {zone_name} benchmark (₹{benchmark_sqft}/sqft).")
            rent_why = f"Exceptional lease rate (₹{rent_per_sqft}/sqft) compared to {zone_name} benchmark (₹{benchmark_sqft}/sqft)."
        elif ratio <= 1.05:
            rent_norm = 0.85
            insights.append(f"Fair market rent of ₹{rent_per_sqft}/sqft aligns with {zone_name} benchmark (₹{benchmark_sqft}/sqft).")
            rent_why = f"Rent (₹{rent_per_sqft}/sqft) matches prevailing market rates."
        elif ratio <= 1.25:
            rent_norm = 0.55
            risks.append(f"Lease rate of ₹{rent_per_sqft}/sqft is {round((ratio - 1)*100)}% higher than {zone_name} benchmark (₹{benchmark_sqft}/sqft).")
            rent_why = f"Rent (₹{rent_per_sqft}/sqft) is slightly elevated above market benchmark."
        else:
            rent_norm = 0.25
            risks.append(f"Premium asking rent of ₹{rent_per_sqft}/sqft exceeds benchmark by {round((ratio - 1)*100)}%; potential margin squeeze.")
            rent_why = f"High asking rent (₹{rent_per_sqft}/sqft) significantly exceeds local benchmark (₹{benchmark_sqft}/sqft)."

        rent_points = round(25.0 * rent_norm, 1)

    # ----------------------------------------------------
    # Factor 2: Physical Frontage & Visibility (Weight 20)
    # ----------------------------------------------------
    frontage = prop.frontage_ft or 0.0
    visibility = prop.visibility or 3  # 1 to 5

    if frontage >= 25.0:
        frontage_score = 1.0
        insights.append(f"Spacious {frontage} ft frontage enables premium store branding and high customer eye-level visibility.")
    elif frontage >= 18.0:
        frontage_score = 0.8
        insights.append(f"Solid {frontage} ft frontage suitable for standard Savomart grocery storefront.")
    elif frontage >= 12.0:
        frontage_score = 0.5
        risks.append(f"Moderate {frontage} ft frontage may limit window displays and walk-in appeal.")
    else:
        frontage_score = 0.2
        risks.append(f"Narrow frontage ({frontage} ft) is suboptimal for modern supermarket retail entrance.")

    vis_score = min(1.0, max(0.2, visibility / 5.0))
    if visibility >= 4:
        insights.append(f"High roadside visual prominence ({visibility}/5) with clear view from approach lanes.")
    elif visibility <= 2:
        risks.append(f"Poor visibility score ({visibility}/5); building set back or obstructed by neighboring structures.")

    phys_norm = round(0.55 * frontage_score + 0.45 * vis_score, 3)
    phys_points = round(20.0 * phys_norm, 1)
    phys_why = f"{frontage} ft frontage with {visibility}/5 visibility rating."

    # ----------------------------------------------------
    # Factor 3: Road Width & Parking Access (Weight 15)
    # ----------------------------------------------------
    road_width = prop.road_width_ft or 0.0
    parking_slots = prop.parking_slots or 0
    has_parking = prop.parking or (parking_slots > 0)
    floor = (prop.floor or "Ground").lower()

    if road_width >= 40.0:
        road_score = 1.0
        insights.append(f"Wide {road_width} ft carriageway allows easy two-way traffic and delivery van access.")
    elif road_width >= 30.0:
        road_score = 0.8
        insights.append(f"Sufficient road width ({road_width} ft) for local neighborhood traffic.")
    elif road_width >= 20.0:
        road_score = 0.55
        risks.append(f"Moderate road width ({road_width} ft); curb parking may bottleneck customer approach.")
    else:
        road_score = 0.2
        risks.append(f"Narrow {road_width} ft street may restrict heavy delivery trucks and car shoppers.")

    if parking_slots >= 4:
        park_score = 1.0
        insights.append(f"Dedicated parking space for {parking_slots} vehicles facilitates car and two-wheeler grocery trips.")
    elif parking_slots >= 1 or has_parking:
        park_score = 0.75
        insights.append("On-premise parking available for customer two-wheelers and brief stops.")
    else:
        park_score = 0.3
        risks.append("No dedicated customer parking slots; relies entirely on on-street parking.")

    floor_mult = 1.0 if "ground" in floor or floor in ["0", "g"] else 0.55
    if floor_mult < 1.0:
        risks.append(f"Floor location ({prop.floor}) creates barrier for heavy grocery carts and basket shoppers.")

    access_norm = round((0.6 * road_score + 0.4 * park_score) * floor_mult, 3)
    access_points = round(15.0 * access_norm, 1)
    access_why = f"{road_width} ft road, {parking_slots} parking slots, located on {prop.floor} floor."

    # ----------------------------------------------------
    # Factor 4: Surrounding Catchment (Weight 20)
    # ----------------------------------------------------
    res_count = surroundings["residential_count"]
    civic_count = surroundings["school_count"] + surroundings["hospital_count"] + surroundings["bus_count"]
    civic_norm = min(1.0, civic_count / 10.0)

    if study_insights and study_insights.get("avg_peak_hour_estimate", 0) > 0:
        peak_est = study_insights.get("avg_peak_hour_estimate", 0)
        footfall_10m = study_insights.get("avg_footfall_10min", 0)
        dom_hh = study_insights.get("dominant_household_type", "mixed")
        # Direct ground footfall normalization (e.g. 400 peak/hr is top tier)
        footfall_norm = min(1.0, max(0.25, peak_est / 400.0))
        catchment_norm = round(0.75 * footfall_norm + 0.25 * civic_norm, 3)
        catchment_points = round(20.0 * catchment_norm, 1)
        catchment_why = f"Surveyed Ground Footfall: {footfall_10m}/10min (~{peak_est} peak/hr). Dominant household: {dom_hh.title()}."
        catchment_is_mock = False
        raw_catchment_val = peak_est
    else:
        res_norm = min(1.0, res_count / 40.0)
        catchment_norm = round(0.7 * res_norm + 0.3 * civic_norm, 3)
        catchment_points = round(20.0 * catchment_norm, 1)
        catchment_why = f"{res_count} residential buildings and {civic_count} civic anchors within 500m."
        catchment_is_mock = True
        raw_catchment_val = res_count

    if not study_insights:
        if res_count >= 25:
            insights.append(f"Dense residential pocket with {res_count} identified residential complexes within 500m.")
        elif res_count <= 5:
            risks.append("Low residential building count within 500m indicates sparser immediate household demand.")

    # ----------------------------------------------------
    # Factor 5: Competition & Cannibalisation (Weight 20)
    # ----------------------------------------------------
    nearest_dist = surroundings["nearest_store_dist"]
    nearest_name = surroundings["nearest_store_name"] or "Savomart Store"
    total_comps = surroundings["total_competitors"]

    if study_insights and study_insights.get("competitor_count") is not None:
        survey_comps = study_insights.get("competitor_count", 0)
        total_comps = max(total_comps, survey_comps)

    if nearest_dist < 450.0:
        cannib_score = 0.1
        risks.append(f"Severe self-cannibalisation: Property is only {int(nearest_dist)} m from existing {nearest_name} (< 800 m buffer).")
    elif nearest_dist < 800.0:
        cannib_score = 0.55
        risks.append(f"Cannibalisation warning: Located {int(nearest_dist)} m from {nearest_name}, risking territory overlap.")
    else:
        cannib_score = 1.0
        insights.append(f"Safe distance ({int(nearest_dist)} m) from nearest {nearest_name}; zero internal cannibalisation.")

    if total_comps == 0:
        comp_score = 1.0
        insights.append("Zero direct supermarket or grocery competitors within 500m; virgin grocery catchment.")
    elif total_comps <= 3:
        comp_score = 0.85
        insights.append(f"Healthy retail cluster: {total_comps} local grocery competitors establish shopping habit without oversaturating.")
    else:
        comp_score = 0.45
        risks.append(f"Crowded retail strip: {total_comps} grocery/supermarket competitors within 500m.")

    comp_norm = round(0.6 * cannib_score + 0.4 * comp_score, 3)
    comp_points = round(20.0 * comp_norm, 1)
    comp_why = f"{int(nearest_dist)} m to nearest Savomart; {total_comps} competitor outlets within 500m."
    if study_insights and study_insights.get("competitor_count") is not None:
        comp_why += f" (Ground survey verified {study_insights.get('competitor_count')} competitors)"

    # Total score calculation
    total_score = round(rent_points + phys_points + access_points + catchment_points + comp_points, 1)
    total_score = max(0.0, min(100.0, total_score))

    # Recommendation
    if total_score >= 70.0:
        recommendation = PropertyRecommendation.PROCEED.value
    elif total_score >= 50.0:
        recommendation = PropertyRecommendation.REVIEW.value
    else:
        recommendation = PropertyRecommendation.REJECT.value

    # Confidence check
    if prop.area_sqft < 400.0 or prop.area_sqft > 10000.0:
        confidence = EvaluationConfidence.MEDIUM.value

    breakdown = {
        "commercial": {
            "name": "Commercial & Lease Terms",
            "weight": 25,
            "normalised": rent_norm,
            "points": rent_points,
            "unit": "₹/sqft",
            "raw_value": rent_per_sqft,
            "benchmark_sqft": benchmark_sqft,
            "zone_name": zone_name,
            "why": rent_why,
            "is_mock": False,
        },
        "physical": {
            "name": "Frontage & Road Visibility",
            "weight": 20,
            "normalised": phys_norm,
            "points": phys_points,
            "unit": "ft / score",
            "raw_value": frontage,
            "visibility_score": visibility,
            "why": phys_why,
            "is_mock": False,
        },
        "access": {
            "name": "Road Width & Parking Access",
            "weight": 15,
            "normalised": access_norm,
            "points": access_points,
            "unit": "ft / slots",
            "raw_value": road_width,
            "parking_slots": parking_slots,
            "floor": prop.floor,
            "why": access_why,
            "is_mock": False,
        },
        "catchment": {
            "name": "500m Catchment Demographics",
            "weight": 20,
            "normalised": catchment_norm,
            "points": catchment_points,
            "unit": "peak footfall/hr" if not catchment_is_mock else "buildings",
            "raw_value": raw_catchment_val,
            "why": catchment_why,
            "is_mock": catchment_is_mock,
            "survey_validated": not catchment_is_mock,
        },
        "competition": {
            "name": "Cannibalisation & Retail Buffer",
            "weight": 20,
            "normalised": comp_norm,
            "points": comp_points,
            "unit": "meters / outlets",
            "raw_value": nearest_dist,
            "competitor_count": total_comps,
            "why": comp_why,
            "is_mock": False,
        },
    }

    facts_dict = {
        "title": prop.title,
        "score": total_score,
        "recommendation": recommendation,
        "confidence": confidence,
        "rent_per_sqft": rent_per_sqft,
        "benchmark_sqft": benchmark_sqft,
        "frontage_ft": frontage,
        "road_width_ft": road_width,
        "visibility": visibility,
        "parking_slots": parking_slots,
        "floor": prop.floor,
        "residential_within_500m": res_count,
        "nearest_savomart_dist_m": int(nearest_dist),
        "competitor_count": total_comps,
    }

    # Generate narrative summary
    provider = get_llm_provider()
    summary_text, summary_src = provider.generate_narrative(facts_dict)
    if study_insights:
        summary_text = (
            f"[Updated after catchment study] Ground survey verified {study_insights.get('avg_peak_hour_estimate', 0)} peak footfall/hr "
            f"and {study_insights.get('competitor_count', 0)} competitors in surrounding lanes. " + summary_text
        )

    return {
        "score": total_score,
        "recommendation": recommendation,
        "confidence": confidence,
        "insights": insights[:5],
        "risks": risks[:4],
        "breakdown": breakdown,
        "summary": summary_text,
        "summary_source": summary_src,
        "facts": facts_dict,
        "surroundings": surroundings,
        "is_survey_updated": study_insights is not None,
        "catchment_study_id": completed_study.id if completed_study else None,
    }
