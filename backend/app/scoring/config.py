from typing import Dict, Any

# Weight definitions: must sum exactly to 100
SCORING_WEIGHTS = {
    "population": 30,         # Demand base from estimated resident population density
    "competition": 25,        # Retail viability & competitor density balance
    "amenities": 15,          # Civic draw (schools, hospitals)
    "cannibalisation": 15,    # Buffer protection from existing Savomart stores (<800m penalized)
    "business": 10,           # Office density & daytime worker footfall
    "accessibility": 5,       # Transit stops (bus, rail, metro)
}

# Normalization Thresholds
THRESHOLDS = {
    "population_density": {
        "min": 1000.0,       # persons / sq km
        "max": 25000.0,      # persons / sq km
    },
    "amenities_density": {
        "min": 0.0,
        "max": 10.0,         # schools + hospitals / sq km
    },
    "business_density": {
        "min": 0.0,
        "max": 8.0,          # offices / sq km
    },
    "accessibility_density": {
        "min": 0.0,
        "max": 12.0,         # transit stops / sq km
    },
    "cannibalisation_dist_meters": {
        "safe_buffer": 800.0  # <800m is penalized proportionally
    }
}

# Persona & Household multipliers
PERSONS_PER_RESIDENTIAL_BUILDING = 4.5  # Mock transparent assumption
CELL_SIZE_SQKM = 0.25                  # 500m x 500m = 0.25 sq km per cell


def get_rating_band(score: float) -> str:
    """Return categorical rating band for 0-100 score."""
    if score >= 80.0:
        return "Excellent"
    elif score >= 65.0:
        return "Good"
    elif score >= 50.0:
        return "Fair"
    else:
        return "Poor"
