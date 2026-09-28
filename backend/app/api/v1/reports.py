import uuid
import json
import logging
from typing import List, Optional
from datetime import datetime, timezone
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.db.session import get_db, SessionLocal
from app.db.models import AreaReport, User, UserRole, DataVersion
from app.api.deps import get_current_user, require_role
from app.scoring.area import compute_area_report
from app.llm.provider import get_llm_provider

logger = logging.getLogger(__name__)
router = APIRouter()


class CreateReportRequest(BaseModel):
    cell_ids: List[int] = Field(..., min_length=1, description="List of grid cell IDs to analyze")
    name: Optional[str] = Field(None, max_length=255, description="Custom name for the area report")


def run_report_analysis(report_id: str, cell_ids: List[int]):
    """
    Background job that deterministically evaluates the area, executes PostGIS spatial queries,
    scores factors, extracts hotspots, narrates via LLM, and updates status.
    """
    db = SessionLocal()
    try:
        report = db.query(AreaReport).filter(AreaReport.id == report_id).first()
        if not report:
            logger.error(f"Report {report_id} not found in background task.")
            return

        report.status = "running"
        report.progress_message = "Counting amenities and residential infrastructure..."
        db.commit()

        # 1. Compute PostGIS spatial area metrics & factor scoring
        report_data = compute_area_report(db, cell_ids)

        report.progress_message = "Scoring retail viability factors..."
        db.commit()

        # 2. Extract hotspots
        report.progress_message = "Identifying scouting hotspots..."
        db.commit()

        # 3. LLM Narration with strict number validation
        report.progress_message = "Writing intelligence summary..."
        db.commit()

        profile = report_data["area_profile"]
        breakdown_dict = {f["factor"]: f["points"] for f in report_data["breakdown"]}

        facts = {
            "area_name": report.name,
            "overall_score": report_data["score"],
            "density_score": breakdown_dict.get("population", 0),
            "competition_score": breakdown_dict.get("competition", 0),
            "transit_score": breakdown_dict.get("accessibility", 0),
            "supermarket_count": profile["supermarkets"],
            "grocery_count": profile["grocery_stores"],
            "transit_count": profile["bus_stops"] + profile["rail_stations"],
            "est_population": profile["est_population"],
        }

        llm_provider = get_llm_provider()
        summary_text, summary_source = llm_provider.generate_narrative(facts)

        # 4. Fetch latest data versions used
        data_vers_rows = db.query(DataVersion).order_by(DataVersion.fetched_at.desc()).limit(10).all()
        data_versions_info = [
            {
                "source": dv.source,
                "fetched_at": dv.fetched_at.isoformat() if dv.fetched_at else None,
                "record_count": dv.record_count,
            }
            for dv in data_vers_rows
        ]

        # 5. Save completed report
        report.score = report_data["score"]
        report.band = report_data["band"]
        report.breakdown = report_data["breakdown"]
        report.area_profile = profile
        report.hotspots = report_data["hotspots"]
        report.summary = summary_text
        report.summary_source = summary_source
        report.data_versions = data_versions_info
        report.status = "done"
        report.progress_message = "Analysis complete"
        report.error = None

        # Store union geometry in PostGIS
        union_geom_str = json.dumps(report_data["union_geom"])
        db.execute(
            text("UPDATE area_reports SET geom = ST_GeomFromGeoJSON(:geom) WHERE id = :id"),
            {"geom": union_geom_str, "id": report_id}
        )
        db.commit()
        logger.info(f"Report {report_id} completed successfully (score: {report.score}, band: {report.band}).")

    except Exception as e:
        logger.error(f"Error executing analysis for report {report_id}: {e}", exc_info=True)
        db.rollback()
        report = db.query(AreaReport).filter(AreaReport.id == report_id).first()
        if report:
            report.status = "failed"
            report.progress_message = "Analysis failed"
            report.error = str(e)
            db.commit()
    finally:
        db.close()


@router.post("/reports", status_code=status.HTTP_202_ACCEPTED)
def create_report(
    payload: CreateReportRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Creates an area report job, stores it with status 'queued', and launches background evaluation.
    """
    if not payload.cell_ids:
        raise HTTPException(status_code=400, detail="At least one grid cell ID must be provided.")

    report_id = f"rep_{uuid.uuid4().hex[:10]}"
    name = payload.name.strip() if payload.name else f"Chennai Area Report #{report_id[4:]}"

    report = AreaReport(
        id=report_id,
        name=name,
        cell_ids=payload.cell_ids,
        status="queued",
        progress_message="Queued for analysis",
        created_by=current_user.id,
        created_at=datetime.now(timezone.utc)
    )

    db.add(report)
    db.commit()
    db.refresh(report)

    # Launch background task
    background_tasks.add_task(run_report_analysis, report_id, payload.cell_ids)

    return report.to_dict()


@router.get("/reports")
def list_reports(
    db: Session = Depends(get_db)
):
    """List all generated area fitness reports, ordered newest first."""
    reports = db.query(AreaReport).order_by(AreaReport.created_at.desc()).all()
    result = []
    for r in reports:
        d = r.to_dict()
        d["cell_count"] = len(r.cell_ids) if r.cell_ids else 0
        result.append(d)
    return result


@router.get("/reports/{report_id}")
def get_report(
    report_id: str,
    db: Session = Depends(get_db)
):
    """Retrieve detailed report by ID including union geometry as GeoJSON."""
    report = db.query(AreaReport).filter(AreaReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Area report not found")

    res = report.to_dict()

    # Query union geometry
    geom_query = text("SELECT ST_AsGeoJSON(geom) AS geom_json FROM area_reports WHERE id = :id;")
    geom_row = db.execute(geom_query, {"id": report_id}).fetchone()
    if geom_row and geom_row.geom_json:
        res["geometry"] = json.loads(geom_row.geom_json)
    else:
        res["geometry"] = None

    return res


@router.post("/reports/{report_id}/retry")
def retry_report(
    report_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Re-queues a failed or stuck report for evaluation."""
    report = db.query(AreaReport).filter(AreaReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Area report not found")

    report.status = "queued"
    report.progress_message = "Retry queued"
    report.error = None
    db.commit()

    background_tasks.add_task(run_report_analysis, report.id, report.cell_ids)
    return report.to_dict()
