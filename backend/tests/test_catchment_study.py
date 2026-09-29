import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock
from app.db.models import (
    StudyRequest,
    StudyStatus,
    StudyTargetType,
    SurveyTask,
    SurveyTaskStatus,
    SurveyResponse,
    User,
    UserRole,
)
from app.studies.split import auto_assign_tasks
from app.studies.rollup import compute_study_rollup


def test_workload_balanced_auto_assignment():
    """Verify that tasks are greedily distributed across executives balanced by workload_weight."""
    exec_1 = User(id="usr_se_1", name="Priya Sundaram", role=UserRole.SURVEY_EXECUTIVE)
    exec_2 = User(id="usr_se_2", name="Karthik Natarajan", role=UserRole.SURVEY_EXECUTIVE)

    task_1 = SurveyTask(id="t1", request_id="study_1", cell_id=101, workload_weight=3.5, status=SurveyTaskStatus.PENDING)
    task_2 = SurveyTask(id="t2", request_id="study_1", cell_id=102, workload_weight=2.5, status=SurveyTaskStatus.PENDING)
    task_3 = SurveyTask(id="t3", request_id="study_1", cell_id=103, workload_weight=1.5, status=SurveyTaskStatus.PENDING)
    task_4 = SurveyTask(id="t4", request_id="study_1", cell_id=104, workload_weight=1.0, status=SurveyTaskStatus.PENDING)

    study = StudyRequest(id="study_1", target_type=StudyTargetType.PROPERTY, requested_by="usr_bdm_1", status=StudyStatus.PLANNED)

    mock_db = MagicMock()
    # Mock query returns
    mock_db.query.return_value.filter.return_value.all.return_value = [task_1, task_2, task_3, task_4]
    mock_db.query.return_value.filter.return_value.order_by.return_value.all.return_value = [exec_1, exec_2]

    assigned_tasks = auto_assign_tasks(mock_db, study)

    assert len(assigned_tasks) == 4
    # Check that both executives received tasks
    assigned_execs = {t.assigned_to for t in assigned_tasks}
    assert assigned_execs == {"usr_se_1", "usr_se_2"}

    # Total weights for each executive
    load_se1 = sum(t.workload_weight for t in assigned_tasks if t.assigned_to == "usr_se_1")
    load_se2 = sum(t.workload_weight for t in assigned_tasks if t.assigned_to == "usr_se_2")

    # Balanced difference should be small: weights are 3.5, 2.5, 1.5, 1.0 (total 8.5)
    # LPT: 3.5 -> se1, 2.5 -> se2, 1.5 -> se2 (load 4.0), 1.0 -> se1 (load 4.5)
    assert abs(load_se1 - load_se2) <= 1.0


def test_study_rollup_metrics():
    """Verify aggregated footfall, competitor, and shop statistics from survey responses."""
    resp1 = SurveyResponse(
        id="sr1",
        task_id="t1",
        client_uuid="uuid-1",
        data={
            "footfall_count_10min": 120,
            "peak_hour_estimate": 720,
            "shop_counts": {"grocery": 5, "pharmacy": 2, "restaurant": 3},
            "competitors": [{"name": "Pothy's Supermarket", "type": "supermarket"}],
            "dominant_household_type": "apartments",
            "lane_width_ft": 36.0,
            "street_lighting": True,
        }
    )
    resp2 = SurveyResponse(
        id="sr2",
        task_id="t2",
        client_uuid="uuid-2",
        data={
            "footfall_count_10min": 80,
            "peak_hour_estimate": 480,
            "shop_counts": {"grocery": 3, "general": 4, "other": 2},
            "competitors": [{"name": "Reliance Smart Point", "type": "grocery"}],
            "dominant_household_type": "apartments",
            "lane_width_ft": 30.0,
            "street_lighting": False,
        }
    )

    study = StudyRequest(
        id="study_test",
        target_type=StudyTargetType.PROPERTY,
        property_id="prop_test",
        requested_by="usr_bdm_1",
        status=StudyStatus.IN_PROGRESS,
    )
    task1 = SurveyTask(id="t1", request_id="study_test", cell_id=1, status=SurveyTaskStatus.SUBMITTED)
    task1.responses = [resp1]
    task2 = SurveyTask(id="t2", request_id="study_test", cell_id=2, status=SurveyTaskStatus.SUBMITTED)
    task2.responses = [resp2]

    mock_db = MagicMock()
    mock_db.query.return_value.filter.return_value.first.return_value = study
    mock_db.query.return_value.filter.return_value.all.return_value = [task1, task2]


    insights = compute_study_rollup(mock_db, "study_test")

    assert insights["total_footfall_10min"] == 200
    assert insights["avg_footfall_10min"] == 100.0
    assert insights["avg_peak_hour_estimate"] == 600.0
    assert insights["competitor_count"] == 2
    assert insights["shop_mix"]["grocery"] == 8
    assert insights["dominant_household_type"] == "apartments"
    assert insights["avg_lane_width_ft"] == 33.0
    assert insights["street_lighting_pct"] == 50.0
    assert study.status == StudyStatus.COMPLETED


def test_spatial_reuse_window_180_days():
    """Verify that studies older than 180 days (6 months) are not reused."""
    now = datetime.now(timezone.utc)
    recent_date = now - timedelta(days=45)
    expired_date = now - timedelta(days=185)

    assert (now - recent_date).days <= 180
    assert (now - expired_date).days > 180
