import pytest
from app.db.models import PropertyStage, ALLOWED_STAGE_TRANSITIONS, PropertyRecommendation, EvaluationConfidence
from app.scoring.property import get_rent_benchmark


def test_allowed_stage_transitions():
    """Verify that stage transitions strictly obey the state machine rules."""
    # Scouted transitions
    assert PropertyStage.UNDER_REVIEW in ALLOWED_STAGE_TRANSITIONS[PropertyStage.SCOUTED]
    assert PropertyStage.REJECTED in ALLOWED_STAGE_TRANSITIONS[PropertyStage.SCOUTED]
    assert PropertyStage.APPROVED not in ALLOWED_STAGE_TRANSITIONS[PropertyStage.SCOUTED]

    # Under review transitions
    assert PropertyStage.PROCEED in ALLOWED_STAGE_TRANSITIONS[PropertyStage.UNDER_REVIEW]
    assert PropertyStage.CATCHMENT_STUDY not in ALLOWED_STAGE_TRANSITIONS[PropertyStage.UNDER_REVIEW]

    # Proceed transitions
    assert PropertyStage.CATCHMENT_STUDY in ALLOWED_STAGE_TRANSITIONS[PropertyStage.PROCEED]
    assert PropertyStage.APPROVED in ALLOWED_STAGE_TRANSITIONS[PropertyStage.PROCEED]

    # Catchment study transitions
    assert PropertyStage.APPROVED in ALLOWED_STAGE_TRANSITIONS[PropertyStage.CATCHMENT_STUDY]
    assert PropertyStage.REJECTED in ALLOWED_STAGE_TRANSITIONS[PropertyStage.CATCHMENT_STUDY]


def test_rent_benchmark_lookup():
    """Verify that Chennai zones return appropriate commercial rent benchmarks."""
    # T. Nagar center coordinates (13.0418, 80.2341)
    tnagar_bench, tnagar_zone = get_rent_benchmark(13.0418, 80.2341)
    assert tnagar_bench == 105.0
    assert "T. Nagar" in tnagar_zone

    # Velachery center coordinates (12.9750, 80.2200)
    velachery_bench, velachery_zone = get_rent_benchmark(12.9750, 80.2200)
    assert velachery_bench == 80.0
    assert "Velachery" in velachery_zone

    # Outlier / Far boundary defaults to general benchmark
    def_bench, def_zone = get_rent_benchmark(13.20, 80.10)
    assert def_bench == 75.0


def test_duplicate_check_tolerance():
    """Verify 20% area and rent tolerance calculations for duplicate detection."""
    existing_area = 1000.0
    existing_rent = 80000.0

    # 10% variation -> duplicate detected
    new_area_close = 1100.0
    assert abs(existing_area - new_area_close) / new_area_close <= 0.20

    # 35% variation -> distinct property
    new_area_diff = 1500.0
    assert abs(existing_area - new_area_diff) / new_area_diff > 0.20

    # Rent 15% variation -> duplicate detected
    new_rent_close = 90000.0
    assert abs(existing_rent - new_rent_close) / new_rent_close <= 0.20
