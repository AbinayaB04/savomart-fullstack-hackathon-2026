"""
scripts/seed_demo.py - Seed realistic, end-to-end demo data for Savo SiteScout.

Generates:
1. 3 Area Intelligence Reports (Velachery, Tambaram, Anna Nagar) through real code paths
   (PostGIS spatial scoring, hotspot detection, LLM narrative generation with number validator).
2. 2 Scouting Assignments assigned to BD Executives (usr_bde_1 and usr_bde_2).
3. 4 Properties across pipeline stages (approved, catchment_study, proceed, under_review)
   with spatial deduplication check, evaluations, and audit stage history.
4. 1 Completed Catchment Study (Velachery) with non-overlapping 500m tasks, submitted
   survey responses, rolled-up insights, and property re-evaluation (v2).
5. 1 Planned Catchment Study with active tasks in the queue for field survey executives.
6. A nearby property in Velachery (~160m) configured to demonstrate the 6-Month Spatial
   Reuse Rule (#15) in a single click.
"""
import sys
import os
import json
import uuid
from pathlib import Path
from datetime import datetime, timedelta, timezone

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from sqlalchemy import text
from geoalchemy2.shape import from_shape
from shapely.geometry import Point

from app.db.session import SessionLocal
from app.db.models import (
    User,
    UserRole,
    AreaReport,
    ScoutAssignment,
    ScoutAssignmentStatus,
    Property,
    PropertyPhoto,
    PropertyEvaluation,
    PropertyStageHistory,
    PropertyStage,
    StudyRequest,
    StudyStatus,
    StudyTargetType,
    SurveyTask,
    SurveyTaskStatus,
    SurveyResponse,
)
from app.api.v1.reports import run_report_analysis
from app.api.v1.properties import perform_property_evaluation
from app.studies.split import propose_study_tasks, auto_assign_tasks
from app.studies.rollup import compute_study_rollup, check_and_rollup_study


def ensure_demo_media(upload_dir: Path):
    """Write SVG visual mock assets for properties and surveys."""
    upload_dir.mkdir(parents=True, exist_ok=True)

    svgs = {
        "storefront_annanagar_1.svg": """<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
  <rect width="600" height="400" fill="#782B90"/>
  <rect x="30" y="80" width="540" height="280" fill="#ffffff" rx="8"/>
  <rect x="50" y="100" width="500" height="44" fill="#FFF200" rx="4"/>
  <text x="300" y="130" fill="#782B90" font-family="sans-serif" font-size="20" font-weight="bold" text-anchor="middle">SAVOMART - ANNA NAGAR (2ND AVENUE)</text>
  <rect x="80" y="165" width="200" height="175" fill="#f1f5f9" rx="6" stroke="#cbd5e1"/>
  <rect x="320" y="165" width="200" height="175" fill="#f1f5f9" rx="6" stroke="#cbd5e1"/>
  <text x="180" y="255" fill="#475569" font-family="sans-serif" font-size="14" font-weight="600" text-anchor="middle">28ft Glass Frontage</text>
  <text x="420" y="255" fill="#475569" font-family="sans-serif" font-size="14" font-weight="600" text-anchor="middle">Dedicated 4-Car Parking</text>
  <text x="300" y="385" fill="#ffffff" font-family="sans-serif" font-size="12" text-anchor="middle">Verified Scout Photo • Plot 104, 2nd Avenue, Anna Nagar</text>
</svg>""",
        "storefront_velachery_1.svg": """<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
  <rect width="600" height="400" fill="#1e293b"/>
  <rect x="30" y="60" width="540" height="300" fill="#f8fafc" rx="8"/>
  <rect x="50" y="80" width="500" height="44" fill="#782B90" rx="4"/>
  <text x="300" y="110" fill="#FFF200" font-family="sans-serif" font-size="20" font-weight="bold" text-anchor="middle">VELACHERY 100FT BYPASS CORNER</text>
  <rect x="70" y="145" width="460" height="195" fill="#e2e8f0" rx="6"/>
  <text x="300" y="235" fill="#1e293b" font-family="sans-serif" font-size="16" font-weight="bold" text-anchor="middle">1,450 sqft Ground Floor Showroom</text>
  <text x="300" y="265" fill="#475569" font-family="sans-serif" font-size="14" text-anchor="middle">42ft Wide Road • High Visibility Corner</text>
  <text x="300" y="385" fill="#94a3b8" font-family="sans-serif" font-size="12" text-anchor="middle">Savo SiteScout Site Capture • 100ft Bypass Road</text>
</svg>""",
        "storefront_tambaram_1.svg": """<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
  <rect width="600" height="400" fill="#0f172a"/>
  <rect x="30" y="60" width="540" height="300" fill="#f1f5f9" rx="8"/>
  <rect x="50" y="80" width="500" height="44" fill="#f59e0b" rx="4"/>
  <text x="300" y="110" fill="#ffffff" font-family="sans-serif" font-size="18" font-weight="bold" text-anchor="middle">TAMBARAM SANATORIUM GST ROAD</text>
  <rect x="70" y="145" width="460" height="195" fill="#e2e8f0" rx="6"/>
  <text x="300" y="235" fill="#1e293b" font-family="sans-serif" font-size="16" font-weight="bold" text-anchor="middle">1,150 sqft High-Street Retail Unit</text>
  <text x="300" y="265" fill="#475569" font-family="sans-serif" font-size="14" text-anchor="middle">High Footfall Near Railway Station</text>
  <text x="300" y="385" fill="#94a3b8" font-family="sans-serif" font-size="12" text-anchor="middle">Scout Photo • GST Road, Tambaram Sanatorium</text>
</svg>""",
        "survey_lane_1.svg": """<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
  <rect width="600" height="400" fill="#047857"/>
  <rect x="30" y="50" width="540" height="310" fill="#ffffff" rx="8"/>
  <text x="300" y="95" fill="#065f46" font-family="sans-serif" font-size="20" font-weight="bold" text-anchor="middle">CATCHMENT SURVEY - GROUND AUDIT</text>
  <text x="300" y="130" fill="#4b5563" font-family="sans-serif" font-size="14" text-anchor="middle">Grid Cell Survey • Velachery 100ft Bypass</text>
  <rect x="70" y="155" width="460" height="175" fill="#ecfdf5" stroke="#10b981" stroke-width="2" rx="6"/>
  <text x="300" y="205" fill="#065f46" font-family="sans-serif" font-size="16" font-weight="bold" text-anchor="middle">Peak Pedestrian Flow: 680 persons/hr</text>
  <text x="300" y="238" fill="#047857" font-family="sans-serif" font-size="14" text-anchor="middle">Evening Peak Window: 5:30 PM - 8:30 PM</text>
  <text x="300" y="270" fill="#047857" font-family="sans-serif" font-size="14" text-anchor="middle">Surrounding Retail: 4 Groceries, 2 Pharmacies, 5 Eateries</text>
  <text x="300" y="385" fill="#ffffff" font-family="sans-serif" font-size="12" text-anchor="middle">Verified Catchment Survey Photo • Surveyor: Priya Sundaram</text>
</svg>""",
    }

    for name, content in svgs.items():
        file_path = upload_dir / name
        file_path.write_text(content, encoding="utf-8")
    print(f"Verified {len(svgs)} demo media assets in {upload_dir}")


def clean_existing_demo_records(db):
    """Purge previously seeded demo records for idempotent re-runs."""
    print("Purging any previous demo records...")
    db.execute(text("DELETE FROM survey_responses WHERE id LIKE 'sresp_demo_%'"))
    db.execute(text("DELETE FROM survey_tasks WHERE id LIKE 'task_demo_%'"))
    db.execute(text("DELETE FROM study_requests WHERE id LIKE 'std_demo_%'"))
    db.execute(text("DELETE FROM property_stage_history WHERE id LIKE 'sth_demo_%'"))
    db.execute(text("DELETE FROM property_photos WHERE id LIKE 'pht_demo_%'"))
    db.execute(text("DELETE FROM property_evaluations WHERE id LIKE 'eval_demo_%'"))
    db.execute(text("DELETE FROM properties WHERE id LIKE 'prop_demo_%'"))
    db.execute(text("DELETE FROM scout_assignments WHERE id LIKE 'asg_demo_%'"))
    db.execute(text("DELETE FROM area_reports WHERE id LIKE 'rep_demo_%'"))
    db.commit()


def seed_demo_data():
    db = SessionLocal()
    try:
        upload_dir = backend_dir / "uploads"
        ensure_demo_media(upload_dir)

        clean_existing_demo_records(db)

        # 1. Verify Users
        bdm = db.query(User).filter(User.id == "usr_bdm_1").first()
        bde1 = db.query(User).filter(User.id == "usr_bde_1").first()
        bde2 = db.query(User).filter(User.id == "usr_bde_2").first()
        sm = db.query(User).filter(User.id == "usr_sm_1").first()
        se1 = db.query(User).filter(User.id == "usr_se_1").first()
        se2 = db.query(User).filter(User.id == "usr_se_2").first()

        if not all([bdm, bde1, bde2, sm, se1, se2]):
            raise RuntimeError("Required seed users missing. Run python scripts/seed_users.py first.")

        print("\n=======================================================")
        print("1. SEEDING 3 AREA INTELLIGENCE REPORTS (REAL CODE PATH)")
        print("=======================================================")

        # Area definitions with coordinates in Chennai
        area_targets = [
            {
                "id": "rep_demo_velachery",
                "name": "Velachery Commercial Hub",
                "lat": 12.9821,
                "lon": 80.2185,
                "cell_count": 5,
            },
            {
                "id": "rep_demo_tambaram",
                "name": "Tambaram Junction & Market Corridor",
                "lat": 12.9192,
                "lon": 80.1215,
                "cell_count": 5,
            },
            {
                "id": "rep_demo_annanagar",
                "name": "Anna Nagar West & 2nd Avenue",
                "lat": 13.0810,
                "lon": 80.2092,
                "cell_count": 5,
            },
        ]

        reports = {}
        for target in area_targets:
            # Query nearest grid cells from PostGIS
            cells_res = db.execute(
                text("""
                SELECT id
                FROM grid_cells
                ORDER BY ST_Distance(centroid, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326))
                LIMIT :lim
            """),
                {"lat": target["lat"], "lon": target["lon"], "lim": target["cell_count"]},
            ).fetchall()
            cell_ids = [r[0] for r in cells_res]

            print(f"Creating Area Report '{target['name']}' with cells: {cell_ids}...")
            report = AreaReport(
                id=target["id"],
                name=target["name"],
                cell_ids=cell_ids,
                status="queued",
                created_by=bdm.id,
            )
            db.add(report)
            db.commit()

            # Execute real evaluation pipeline (deterministic scoring + LLM narration + union geom)
            run_report_analysis(target["id"], cell_ids)
            db.refresh(report)
            reports[target["id"]] = report
            print(
                f"-> Completed '{report.name}': Score={report.score}, Band={report.band}, Hotspots={len(report.hotspots or [])}"
            )

        print("\n=======================================================")
        print("2. SEEDING 2 SCOUTING ASSIGNMENTS (ASSIGNED TO BD EXECS)")
        print("=======================================================")

        # Hotspot from Velachery
        velachery_hotspot = (
            reports["rep_demo_velachery"].hotspots[0]
            if reports["rep_demo_velachery"].hotspots
            else {
                "cell_id": 2611,
                "score": 85.0,
                "centroid": [80.2185, 12.9776],
                "reason": "High residential cluster with 0 direct supermarkets within 500m",
            }
        )

        asg1 = ScoutAssignment(
            id="asg_demo_velachery_1",
            report_id="rep_demo_velachery",
            hotspot=velachery_hotspot,
            cell_id=velachery_hotspot.get("cell_id"),
            location=from_shape(
                Point(velachery_hotspot["centroid"][0], velachery_hotspot["centroid"][1]), srid=4326
            ),
            assigned_to=bde1.id,
            assigned_by=bdm.id,
            note="High residential density pocket along 100ft Bypass. Scout ground-floor corner spaces with >20ft frontage and dedicated parking.",
            status=ScoutAssignmentStatus.IN_PROGRESS,
        )
        db.add(asg1)

        # Hotspot from Anna Nagar
        annanagar_hotspot = (
            reports["rep_demo_annanagar"].hotspots[0]
            if reports["rep_demo_annanagar"].hotspots
            else {
                "cell_id": 4127,
                "score": 82.0,
                "centroid": [80.2092, 13.0810],
                "reason": "Commercial hub with strong transit connectivity and affluent residential catchment",
            }
        )

        asg2 = ScoutAssignment(
            id="asg_demo_annanagar_1",
            report_id="rep_demo_annanagar",
            hotspot=annanagar_hotspot,
            cell_id=annanagar_hotspot.get("cell_id"),
            location=from_shape(
                Point(annanagar_hotspot["centroid"][0], annanagar_hotspot["centroid"][1]), srid=4326
            ),
            assigned_to=bde2.id,
            assigned_by=bdm.id,
            note="Prime commercial corridor near 2nd Avenue junction. Verify commercial zoning, delivery truck access, and competitor distances.",
            status=ScoutAssignmentStatus.ASSIGNED,
        )
        db.add(asg2)
        db.commit()
        print(f"Created Assignment 1: {asg1.id} -> {bde1.name} (Velachery)")
        print(f"Created Assignment 2: {asg2.id} -> {bde2.name} (Anna Nagar)")

        print("\n=======================================================")
        print("3. SEEDING 4 PROPERTIES ACROSS PIPELINE STAGES")
        print("=======================================================")

        # Property 1: Anna Nagar (Stage: APPROVED)
        prop1 = Property(
            id="prop_demo_annanagar_1",
            title="Anna Nagar 2nd Avenue Commercial Corner",
            location=from_shape(Point(80.2110, 13.0825), srid=4326),
            address="Plot 104, 2nd Avenue, Anna Nagar West, Chennai, Tamil Nadu 600040",
            rent_monthly=145000.0,
            deposit=1450000.0,
            area_sqft=1650.0,
            frontage_ft=28.0,
            floor="Ground Floor",
            parking=True,
            parking_slots=4,
            road_width_ft=50.0,
            visibility=5,
            owner_name="S. Sundaresan",
            owner_phone="+91 98401 22345",
            notes="Flagship corner location. 50ft road allows seamless delivery truck access.",
            stage=PropertyStage.APPROVED,
            scout_assignment_id="asg_demo_annanagar_1",
            created_by=bde2.id,
        )
        db.add(prop1)

        # Photos for Property 1
        photo1 = PropertyPhoto(
            id="pht_demo_annanagar_1",
            property_id="prop_demo_annanagar_1",
            photo_url="/uploads/storefront_annanagar_1.svg",
            caption="Corner Storefront & Parking Access",
        )
        db.add(photo1)

        # Stage History for Property 1 (Audited Progression)
        stages_p1 = [
            ("", "scouted", bde2.id, "Initial scouting onboarded from Anna Nagar hotspot assignment", 25),
            ("scouted", "under_review", bdm.id, "High priority corridor; favorable road width and frontage", 20),
            ("under_review", "proceed", bdm.id, "Lease terms and commercial title clearance confirmed", 15),
            ("proceed", "catchment_study", bdm.id, "Dispatched catchment study to quantify peak pedestrian flow", 10),
            ("catchment_study", "approved", bdm.id, "Board of Directors approved final lease agreement. Ready for interior fit-out.", 2),
        ]
        for idx, (f_st, t_st, usr, rsn, days_ago) in enumerate(stages_p1):
            sh = PropertyStageHistory(
                id=f"sth_demo_p1_{idx}",
                property_id="prop_demo_annanagar_1",
                from_stage=f_st,
                to_stage=t_st,
                changed_by=usr,
                reason=rsn,
                created_at=datetime.now(timezone.utc) - timedelta(days=days_ago),
            )
            db.add(sh)

        # Property 2: Velachery (Stage: CATCHMENT_STUDY) - Target of completed catchment study
        prop2 = Property(
            id="prop_demo_velachery_1",
            title="Velachery 100ft Bypass Corner Unit",
            location=from_shape(Point(80.2210, 12.9810), srid=4326),
            address="Shop 12-B, 100ft Bypass Road, Velachery, Chennai, Tamil Nadu 600042",
            rent_monthly=115000.0,
            deposit=1150000.0,
            area_sqft=1450.0,
            frontage_ft=24.0,
            floor="Ground Floor",
            parking=True,
            parking_slots=3,
            road_width_ft=42.0,
            visibility=4,
            owner_name="K. Ramanathan",
            owner_phone="+91 94440 88712",
            notes="Excellent ground-floor showroom with high vehicular traffic.",
            stage=PropertyStage.CATCHMENT_STUDY,
            scout_assignment_id="asg_demo_velachery_1",
            created_by=bde1.id,
        )
        db.add(prop2)

        photo2 = PropertyPhoto(
            id="pht_demo_velachery_1",
            property_id="prop_demo_velachery_1",
            photo_url="/uploads/storefront_velachery_1.svg",
            caption="100ft Bypass Main Road Façade",
        )
        db.add(photo2)

        stages_p2 = [
            ("", "scouted", bde1.id, "Field scout onboarded unit along 100ft Bypass", 18),
            ("scouted", "under_review", bdm.id, "Strong residential catchment verified", 16),
            ("under_review", "proceed", bdm.id, "Owner agreed to 9-year lease with 3-year escalation", 14),
            ("proceed", "catchment_study", bdm.id, "Dispatched ground survey team for lane footfall audit", 12),
        ]
        for idx, (f_st, t_st, usr, rsn, days_ago) in enumerate(stages_p2):
            sh = PropertyStageHistory(
                id=f"sth_demo_p2_{idx}",
                property_id="prop_demo_velachery_1",
                from_stage=f_st,
                to_stage=t_st,
                changed_by=usr,
                reason=rsn,
                created_at=datetime.now(timezone.utc) - timedelta(days=days_ago),
            )
            db.add(sh)

        # Property 3: Velachery Nearby Site (~160m from Property 2) (Stage: PROCEED)
        # Demonstrates the 6-Month Spatial Reuse Rule (#15) in a single click in the UI!
        prop3 = Property(
            id="prop_demo_velachery_2",
            title="Vijayanagar Bus Terminus Commercial Space",
            location=from_shape(Point(80.2222, 12.9798), srid=4326),
            address="34 Vijayanagar Main Road, Velachery, Chennai, Tamil Nadu 600042",
            rent_monthly=98000.0,
            deposit=980000.0,
            area_sqft=1280.0,
            frontage_ft=22.0,
            floor="Ground Floor",
            parking=True,
            parking_slots=2,
            road_width_ft=36.0,
            visibility=4,
            owner_name="M. Vijayakumar",
            owner_phone="+91 97911 34567",
            notes="High transit pedestrian volume near Vijayanagar bus terminus. Located 160m from 100ft Bypass unit.",
            stage=PropertyStage.PROCEED,
            created_by=bde1.id,
        )
        db.add(prop3)

        stages_p3 = [
            ("", "scouted", bde1.id, "Discovered during secondary transit node scouting", 8),
            ("scouted", "under_review", bdm.id, "Favorable pedestrian traffic metrics", 5),
            ("under_review", "proceed", bdm.id, "Passed initial viability check. Ready for catchment study.", 3),
        ]
        for idx, (f_st, t_st, usr, rsn, days_ago) in enumerate(stages_p3):
            sh = PropertyStageHistory(
                id=f"sth_demo_p3_{idx}",
                property_id="prop_demo_velachery_2",
                from_stage=f_st,
                to_stage=t_st,
                changed_by=usr,
                reason=rsn,
                created_at=datetime.now(timezone.utc) - timedelta(days=days_ago),
            )
            db.add(sh)

        # Property 4: Tambaram (Stage: UNDER_REVIEW)
        prop4 = Property(
            id="prop_demo_tambaram_1",
            title="Tambaram Sanatorium GST Road Space",
            location=from_shape(Point(80.1230, 12.9215), srid=4326),
            address="45 GST Road, Tambaram Sanatorium, Chennai, Tamil Nadu 600047",
            rent_monthly=72000.0,
            deposit=720000.0,
            area_sqft=1150.0,
            frontage_ft=18.0,
            floor="Ground Floor",
            parking=False,
            parking_slots=0,
            road_width_ft=32.0,
            visibility=3,
            owner_name="T. Natarajan",
            owner_phone="+91 98840 55667",
            notes="High footfall from railway station commuters; evaluating lack of dedicated customer parking.",
            stage=PropertyStage.UNDER_REVIEW,
            created_by=bde1.id,
        )
        db.add(prop4)

        photo4 = PropertyPhoto(
            id="pht_demo_tambaram_1",
            property_id="prop_demo_tambaram_1",
            photo_url="/uploads/storefront_tambaram_1.svg",
            caption="GST Road High Street View",
        )
        db.add(photo4)

        stages_p4 = [
            ("", "scouted", bde1.id, "Scouted near Tambaram Sanatorium railway station", 4),
            ("scouted", "under_review", bdm.id, "Assessing parking constraint vs high commuter volume", 1),
        ]
        for idx, (f_st, t_st, usr, rsn, days_ago) in enumerate(stages_p4):
            sh = PropertyStageHistory(
                id=f"sth_demo_p4_{idx}",
                property_id="prop_demo_tambaram_1",
                from_stage=f_st,
                to_stage=t_st,
                changed_by=usr,
                reason=rsn,
                created_at=datetime.now(timezone.utc) - timedelta(days=days_ago),
            )
            db.add(sh)

        db.commit()

        # Run real evaluation for all properties
        for p in [prop1, prop2, prop3, prop4]:
            perform_property_evaluation(p.id)
            print(f"Evaluated property {p.title} (ID: {p.id})")

        print("\n=======================================================")
        print("4. SEEDING 1 COMPLETED CATCHMENT STUDY (WITH INSIGHTS)")
        print("=======================================================")

        # Create completed study for Property 2 (Velachery)
        study1 = StudyRequest(
            id="std_demo_velachery_1",
            target_type=StudyTargetType.PROPERTY,
            property_id=prop2.id,
            requested_by=bdm.id,
            radius_m=1000.0,
            status=StudyStatus.PLANNED,
            created_at=datetime.now(timezone.utc) - timedelta(days=12),
        )
        db.add(study1)
        db.commit()

        # Propose and assign tasks using real spatial splitting
        tasks = propose_study_tasks(db, study1)
        assigned_tasks = auto_assign_tasks(db, study1)

        print(f"Generated {len(assigned_tasks)} catchment survey tasks for study {study1.id}.")

        # Submit realistic survey responses for each task
        survey_metrics = [
            {
                "footfall": 95,
                "peak": 620,
                "shops": {"grocery": 4, "general": 3, "pharmacy": 2, "restaurant": 5, "other": 2},
                "competitors": [{"name": "Nilgiris 1905", "type": "supermarket", "approx_size": "2,200 sqft"}],
                "household": "apartments",
                "width": 42.0,
                "parking": "street_only",
                "notes": "Intense evening shopping footfall from 5:30 PM to 8:30 PM.",
            },
            {
                "footfall": 82,
                "peak": 540,
                "shops": {"grocery": 3, "general": 2, "pharmacy": 1, "restaurant": 3, "other": 1},
                "competitors": [{"name": "Reliance Smart Point", "type": "supermarket", "approx_size": "1,800 sqft"}],
                "household": "apartments",
                "width": 38.0,
                "parking": "street_only",
                "notes": "Good visibility from bus route; high residential density.",
            },
        ]

        for idx, task in enumerate(assigned_tasks):
            metric = survey_metrics[idx % len(survey_metrics)]
            resp = SurveyResponse(
                id=f"sresp_demo_{idx+1}",
                task_id=task.id,
                client_uuid=f"uuid_demo_sync_{task.id}",
                data={
                    "footfall_count_10min": metric["footfall"],
                    "peak_hour_estimate": metric["peak"],
                    "shop_counts": metric["shops"],
                    "competitors": metric["competitors"],
                    "dominant_household_type": metric["household"],
                    "lane_width_ft": metric["width"],
                    "parking_availability": metric["parking"],
                    "street_lighting": True,
                    "notes": metric["notes"],
                },
                photos=["/uploads/survey_lane_1.svg"],
                captured_at=datetime.now(timezone.utc) - timedelta(days=11),
                submitted_at=datetime.now(timezone.utc) - timedelta(days=11),
            )
            db.add(resp)
            task.status = SurveyTaskStatus.SUBMITTED

        db.commit()

        # Trigger automatic study rollup and property re-evaluation (v2)
        check_and_rollup_study(db, study1.id)
        db.refresh(study1)
        study1.completed_at = datetime.now(timezone.utc) - timedelta(days=11)
        db.commit()

        print(f"Catchment Study {study1.id} completed:")
        print(f"-> Avg Footfall (10 min): {study1.insights.get('avg_footfall_10min')}")
        print(f"-> Peak Hour Estimate: {study1.insights.get('avg_peak_hour_estimate')}")
        print(f"-> Competitors: {study1.insights.get('competitor_count')}")

        # Check property 2 evaluations
        evals_p2 = (
            db.query(PropertyEvaluation)
            .filter(PropertyEvaluation.property_id == prop2.id)
            .order_by(PropertyEvaluation.version.desc())
            .all()
        )
        print(f"Property 2 now has {len(evals_p2)} evaluation versions (v{evals_p2[0].version} score: {evals_p2[0].score})")

        print("\n=======================================================")
        print("5. SEEDING 1 PLANNED STUDY (ACTIVE QUEUE FOR SURVEY REPS)")
        print("=======================================================")

        # Create an active planned study for Tambaram so Survey Executives & Survey Manager have live tasks
        study2 = StudyRequest(
            id="std_demo_tambaram_1",
            target_type=StudyTargetType.PROPERTY,
            property_id=prop4.id,
            requested_by=bdm.id,
            radius_m=1000.0,
            status=StudyStatus.PLANNED,
            created_at=datetime.now(timezone.utc) - timedelta(days=1),
        )
        db.add(study2)
        db.commit()

        tasks2 = propose_study_tasks(db, study2)
        assigned_tasks2 = auto_assign_tasks(db, study2)
        print(f"Created active study {study2.id} with {len(assigned_tasks2)} pending survey tasks for field reps.")

        print("\n=======================================================")
        print("DEMO SEED COMPLETED SUCCESSFULLY!")
        print("=======================================================")
        print("All personas now have rich data to explore:")
        print("  - BD Manager (usr_bdm_1): 3 reports, 4 pipeline properties, ready for 1-click reuse test on Prop #3")
        print("  - BD Executive 1 (usr_bde_1): 1 in-progress hotspot assignment in Velachery")
        print("  - BD Executive 2 (usr_bde_2): 1 assigned hotspot in Anna Nagar")
        print("  - Survey Manager (usr_sm_1): 1 completed study with rollup + 1 planned active study")
        print("  - Survey Executive 1 & 2 (usr_se_1 / usr_se_2): Active survey tasks in their field queue")
        print("=======================================================\n")

    except Exception as e:
        db.rollback()
        print(f"Error during demo seeding: {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_demo_data()
