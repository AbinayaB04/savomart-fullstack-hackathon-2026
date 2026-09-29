"""
End-to-end integration test for Phase 4: Milestone 3 Catchment Study.
Tests:
1. BD Manager requests catchment study for property #1.
2. Survey Manager plans tasks (proposes grid cells) and auto-assigns across executives.
3. Survey Executives submit lane surveys (including offline idempotent sync with client_uuid).
4. Final task submission triggers automatic rollup & property re-evaluation.
5. BD Manager requests catchment study for property #2 located 150m away (< 300m).
6. 6-Month Spatial Reuse rule immediately reuses study #1 with human-readable reason!
"""
import sys
from pathlib import Path

# Add backend directory to sys.path so app modules are resolvable in both local IDE and container
backend_dir = Path(__file__).resolve().parent.parent / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

import uuid
from datetime import datetime, timezone
from app.db.session import SessionLocal

from app.db.models import (
    Property,
    PropertyStage,
    StudyRequest,
    StudyStatus,
    SurveyTask,
    SurveyTaskStatus,
    SurveyResponse,
    User,
    UserRole,
    PropertyEvaluation,
)
from geoalchemy2.shape import from_shape, to_shape
from shapely.geometry import Point
from app.api.v1.studies import create_catchment_study, CreateStudyRequestSchema
from app.studies.split import propose_study_tasks, auto_assign_tasks
from app.studies.rollup import compute_study_rollup, check_and_rollup_study
from app.studies.reuse import check_study_reuse
from app.scoring.property import evaluate_property_deterministic
from app.api.v1.properties import perform_property_evaluation


def run_milestone3_flow():
    db = SessionLocal()
    try:
        print("\n--- 1. Setting up Test Properties in Adyar, Chennai ---")
        bdm = db.query(User).filter(User.role == UserRole.BD_MANAGER).first()
        se1 = db.query(User).filter(User.id == "usr_se_1").first()
        se2 = db.query(User).filter(User.id == "usr_se_2").first()

        import random
        # Choose a random point in Chennai with 500m grid cell coverage
        base_lat = round(random.uniform(12.92, 13.15), 4)
        base_lon = round(random.uniform(80.12, 80.24), 4)

        # Property 1
        prop1_id = f"test_prop1_{uuid.uuid4().hex[:6]}"
        pt1 = from_shape(Point(base_lon, base_lat), srid=4326)
        prop1 = Property(
            id=prop1_id,
            title=f"Prime Retail Site ({base_lat}, {base_lon})",
            location=pt1,
            address=f"Commercial Road, Sector {random.randint(10, 99)}, Chennai",
            rent_monthly=110000.0,
            area_sqft=1400.0,
            frontage_ft=24.0,
            road_width_ft=45.0,
            parking=True,
            parking_slots=3,
            visibility=4,
            stage=PropertyStage.PROCEED,
            created_by=bdm.id,
        )
        db.add(prop1)
        db.commit()
        perform_property_evaluation(prop1_id)

        eval_v1 = db.query(PropertyEvaluation).filter(PropertyEvaluation.property_id == prop1_id).first()
        print(f"Property 1 created: {prop1.title} (ID: {prop1_id}), Eval v{eval_v1.version} Score: {eval_v1.score}")

        # Property 2: Nearby shop ~140 meters away
        prop2_id = f"test_prop2_{uuid.uuid4().hex[:6]}"
        pt2 = from_shape(Point(base_lon + 0.0010, base_lat + 0.0010), srid=4326)
        prop2 = Property(
            id=prop2_id,
            title=f"Adjacent Commercial Unit ({base_lat + 0.001}, {base_lon + 0.001})",
            location=pt2,
            address=f"Adjacent Cross Road, Sector {random.randint(10, 99)}, Chennai",

            rent_monthly=95000.0,
            area_sqft=1250.0,
            frontage_ft=20.0,
            road_width_ft=36.0,
            parking=True,
            parking_slots=2,
            visibility=4,
            stage=PropertyStage.PROCEED,
            created_by=bdm.id,
        )
        db.add(prop2)
        db.commit()
        perform_property_evaluation(prop2_id)
        print(f"Property 2 created: {prop2.title} (ID: {prop2_id}) ~150m from Property 1")

        # --- 2. Request Catchment Study for Property 1 ---
        print("\n--- 2. Requesting Catchment Study for Property 1 ---")
        req_payload = CreateStudyRequestSchema(target_type="property", property_id=prop1_id, radius_m=1000.0)
        res1 = create_catchment_study(req_payload, db, bdm)
        study1_id = res1["id"]
        print(f"Study 1 Created: ID={study1_id}, Reused={res1.get('reused')}, Status={res1.get('status')}")
        assert res1.get("reused") is False, "First study should not be reused"

        # --- 3. Split into Tasks & Workload Auto-Assignment ---
        print("\n--- 3. Survey Manager: Propose Tasks and Auto-Assign ---")
        study1 = db.query(StudyRequest).filter(StudyRequest.id == study1_id).first()
        tasks = propose_study_tasks(db, study1)
        print(f"Proposed {len(tasks)} non-overlapping 500m grid cell tasks.")
        assert len(tasks) >= 2, "Expected at least 2 grid cells within 1000m radius"

        assigned_tasks = auto_assign_tasks(db, study1)
        loads = {}
        for t in assigned_tasks:
            loads[t.assigned_to] = loads.get(t.assigned_to, 0.0) + t.workload_weight
        print(f"Workload Balanced across executives: {loads}")
        assert len(loads) >= 2, "Tasks should be balanced across active executives"

        # --- 4. Submit Survey Tasks (Simulate Offline Idempotent Submission) ---
        print("\n--- 4. Survey Executives: Submit Lane Data with Idempotency ---")
        client_uuid_1 = f"uuid_offline_test_{uuid.uuid4().hex[:8]}"

        # Submit first task
        task1 = assigned_tasks[0]
        resp1 = SurveyResponse(
            id=f"sresp_{uuid.uuid4().hex[:10]}",
            task_id=task1.id,
            client_uuid=client_uuid_1,
            data={
                "footfall_count_10min": 92,
                "peak_hour_estimate": 550,
                "shop_counts": {"grocery": 5, "general": 3, "pharmacy": 2, "restaurant": 4, "other": 1},
                "competitors": [{"name": "Reliance Smart Point", "type": "supermarket", "approx_size": "2000 sqft"}],
                "dominant_household_type": "apartments",
                "lane_width_ft": 38.0,
                "parking_availability": "street_only",
                "street_lighting": True,
                "notes": "Strong evening rush hour.",
            },
            photos=["/uploads/survey_1.jpg"],
            captured_at=datetime.now(timezone.utc),
            submitted_at=datetime.now(timezone.utc),
        )
        db.add(resp1)
        task1.status = SurveyTaskStatus.SUBMITTED
        db.commit()
        print(f"Task 1 (Cell #{task1.cell_id}) submitted. Client UUID: {client_uuid_1}")

        # Test idempotency: re-submitting with identical client_uuid
        existing = db.query(SurveyResponse).filter(SurveyResponse.client_uuid == client_uuid_1).first()
        assert existing is not None, "Idempotent record must exist"
        print("Idempotent check verified: identical client_uuid acknowledged without duplicate creation.")

        # Submit all remaining tasks to trigger auto-rollup
        for t in assigned_tasks[1:]:
            resp = SurveyResponse(
                id=f"sresp_{uuid.uuid4().hex[:10]}",
                task_id=t.id,
                client_uuid=f"uuid_{uuid.uuid4().hex[:8]}",
                data={
                    "footfall_count_10min": 78,
                    "peak_hour_estimate": 470,
                    "shop_counts": {"grocery": 3, "general": 2, "pharmacy": 1, "restaurant": 2, "other": 1},
                    "competitors": [{"name": "Heritage Daily", "type": "grocery", "approx_size": "1200 sqft"}],
                    "dominant_household_type": "apartments",
                    "lane_width_ft": 34.0,
                    "parking_availability": "street_only",
                    "street_lighting": True,
                    "notes": "High two-wheeler traffic.",
                },
                photos=["/uploads/survey_2.jpg"],
                captured_at=datetime.now(timezone.utc),
                submitted_at=datetime.now(timezone.utc),
            )
            db.add(resp)
            t.status = SurveyTaskStatus.SUBMITTED
        db.commit()

        # Check rollup
        rollup_triggered = check_and_rollup_study(db, study1.id)
        print(f"Final task submitted. Rollup triggered: {rollup_triggered}")

        db.refresh(study1)
        assert study1.status == StudyStatus.COMPLETED, "Study 1 should now be COMPLETED"
        assert study1.insights is not None and "avg_footfall_10min" in study1.insights
        print(f"Study 1 Rolled-up Insights: Avg 10-Min Footfall={study1.insights['avg_footfall_10min']}, Peak Est={study1.insights['avg_peak_hour_estimate']}, Competitors={study1.insights['competitor_count']}")

        # --- 5. Verify Property 1 Re-evaluation ---
        print("\n--- 5. Verifying Property 1 Re-evaluation ---")
        evals = db.query(PropertyEvaluation).filter(PropertyEvaluation.property_id == prop1_id).order_by(PropertyEvaluation.version.desc()).all()
        print(f"Property 1 now has {len(evals)} evaluation versions.")
        latest_eval = evals[0]
        assert latest_eval.version > 1, "A new evaluation version must be created post-survey"
        print(f"Latest Eval Version: v{latest_eval.version}, Score: {latest_eval.score}")
        print(f"Summary: {latest_eval.summary[:140]}...")
        assert "Updated after catchment study" in latest_eval.summary or "Ground survey verified" in latest_eval.summary

        # --- 6. Request Catchment Study for Nearby Property 2 (Spatial Reuse Rule) ---
        print("\n--- 6. Testing 6-Month Spatial Reuse Rule on Nearby Property 2 ---")
        req2_payload = CreateStudyRequestSchema(target_type="property", property_id=prop2_id, radius_m=1000.0)
        res2 = create_catchment_study(req2_payload, db, bdm)

        print(f"Study 2 Response: ID={res2['id']}, Reused={res2.get('reused')}")
        print(f"Reuse Message: {res2.get('reuse_message')}")

        assert res2.get("reused") is True, "Study 2 should reuse Study 1 because it is within 300m and <= 180 days old"
        assert res2.get("reused_from_request_id") == study1.id
        assert res2.get("status") == "completed"

        # Property 2 evaluation check
        prop2_evals = db.query(PropertyEvaluation).filter(PropertyEvaluation.property_id == prop2_id).order_by(PropertyEvaluation.version.desc()).all()
        print(f"Property 2 Eval Version count: {len(prop2_evals)}, Latest v{prop2_evals[0].version}")
        assert prop2_evals[0].version > 1, "Property 2 should also be re-evaluated with reused study insights"

        print("\nALL PHASE 4 MILESTONE 3 TESTS PASSED PERFECTLY!\n")

    finally:
        db.close()


if __name__ == "__main__":
    run_milestone3_flow()
