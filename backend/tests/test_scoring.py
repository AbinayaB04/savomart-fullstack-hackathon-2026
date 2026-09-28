import pytest
from app.scoring.config import SCORING_WEIGHTS, get_rating_band
from app.scoring.area import (
    normalize_population,
    normalize_competition,
    normalize_amenities,
    normalize_cannibalisation,
    normalize_business,
    normalize_accessibility,
    evaluate_area_features,
)
from app.llm.provider import validate_narrative_numbers


def test_weights_sum_to_100():
    """Verify that all scoring factor weights sum exactly to 100."""
    total_weight = sum(SCORING_WEIGHTS.values())
    assert total_weight == 100, f"Expected weights to sum to 100, got {total_weight}"


def test_normalization_bounds():
    """Verify that all normalization functions return values strictly in [0.0, 1.0]."""
    test_cases = [
        # Population (extreme lows and highs)
        normalize_population(0, 1.0)[0],
        normalize_population(50000, 1.0)[0],
        # Competition
        normalize_competition(0, 0, 0, 1.0)[0],
        normalize_competition(10, 20, 30, 1.0)[0],
        # Amenities
        normalize_amenities(0, 0, 1.0)[0],
        normalize_amenities(25, 25, 1.0)[0],
        # Business
        normalize_business(0, 1.0)[0],
        normalize_business(50, 1.0)[0],
        # Accessibility
        normalize_accessibility(0, 0, 1.0)[0],
        normalize_accessibility(30, 10, 1.0)[0],
    ]
    for norm in test_cases:
        assert 0.0 <= norm <= 1.0, f"Normalization value {norm} out of [0.0, 1.0] bounds"


def test_cannibalisation_penalty():
    """
    Verify cannibalisation behavior:
    - Distance >= 800m is neutral (score = 1.0).
    - Distance < 800m is penalized linearly.
    """
    # Safe distance
    safe_norm, safe_raw, safe_why = normalize_cannibalisation(1200.0)
    assert safe_norm == 1.0
    assert "Safe buffer" in safe_why or "no self-cannibalisation" in safe_why

    # Exactly at boundary
    boundary_norm, _, _ = normalize_cannibalisation(800.0)
    assert boundary_norm == 1.0

    # Closer distance (< 800m)
    half_norm, half_raw, half_why = normalize_cannibalisation(400.0)
    assert half_norm == 0.5
    assert "Proximity warning" in half_why or "cannibalisation" in half_why

    # Severe proximity
    close_norm, _, _ = normalize_cannibalisation(100.0)
    assert close_norm < 0.2


def test_number_validator():
    """Verify LLM hallucination number detection."""
    facts = {
        "area_name": "Anna Nagar Hub",
        "overall_score": 78.5,
        "density_score": 24.0,
        "competition_score": 22.5,
        "transit_score": 4.5,
        "supermarket_count": 3,
        "grocery_count": 7,
        "transit_count": 9,
        "est_population": 18500,
    }

    # Valid narration containing only known numbers
    valid_text = "Anna Nagar Hub achieved 78.5 overall fitness with 3 supermarkets and 18,500 estimated population."
    assert validate_narrative_numbers(valid_text, facts) is True

    # Hallucinated number (e.g. invented 99.9% or 450 shops)
    invalid_text = "Anna Nagar Hub scored 78.5 and has 450 competitor shops in the area."
    assert validate_narrative_numbers(invalid_text, facts) is False


def test_overall_evaluation_and_rating_bands():
    """Verify rating band categorization."""
    assert get_rating_band(85.0) == "Excellent"
    assert get_rating_band(72.0) == "Good"
    assert get_rating_band(55.0) == "Fair"
    assert get_rating_band(42.0) == "Poor"

    # Test full deterministic evaluation
    eval_result = evaluate_area_features(
        res_buildings=100,
        supermarkets=2,
        groceries=5,
        convenience=3,
        schools=2,
        hospitals=1,
        offices=3,
        bus_stops=4,
        rail_stations=1,
        nearest_store_dist_m=1200.0,
        area_sqkm=0.5,
    )
    assert 0.0 <= eval_result["total_score"] <= 100.0
    assert eval_result["band"] in ["Excellent", "Good", "Fair", "Poor"]
    assert len(eval_result["breakdown"]) == 6
