from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter

from app.exceptions import SpatialShiftError, success_payload
from app.schemas import HarmonizeRequest
from app.services.analysis import conflict_feature_collection, detect_topology_conflicts
from app.services.confidence import score_harmonization
from app.services.planarize import planarize_dataset
from app.store import ProcessingJob, store

router = APIRouter(prefix="/api", tags=["harmonize"])


async def _run_harmonization(body: HarmonizeRequest, job: ProcessingJob | None = None) -> dict:
    record = store.require(body.dataset_id)
    buildings = store.require(body.building_dataset_id).gdf if body.building_dataset_id else None

    def update(stage: str, progress: int, message: str, metrics: dict | None = None) -> None:
        if job:
            job.update(status="running", stage=stage, progress=progress, message=message, metrics=metrics)

    update("Validating Vector Layer", 10, "Checking polygonal geometry and coordinate systems.", {
        "input_features": len(record.gdf),
        "source_format": record.source_format,
        "crs": str(record.gdf.crs),
    })
    await asyncio.sleep(0.05)

    if not record.gdf.geometry.geom_type.isin(["Polygon", "MultiPolygon"]).any():
        raise SpatialShiftError(
            "Harmonization requires a polygonal cadastral layer, not a raster footprint or point layer.",
            code="POLYGON_LAYER_REQUIRED",
        )

    update("Schema Profiling & Alignment", 25, f"Profiled as {record.schema_profile.get('archetype_name', 'Vector Layer')}.", {
        "archetype": record.schema_profile.get("archetype", "generic"),
        "mapped_fields": record.schema_profile.get("mapped_fields", {}),
    })
    await asyncio.sleep(0.05)

    update("Detecting Topology Conflicts", 45, "Scanning for input sliver polygons and parcel overlaps.", {
        "sliver_threshold_m2": body.sliver_area_m2,
        "overlap_threshold_m2": body.overlap_area_m2,
    })
    conflicts = detect_topology_conflicts(record.gdf, body.sliver_area_m2, body.overlap_area_m2)
    await asyncio.sleep(0.05)

    update("Topology Planarization & Node Snapping", 70, "Repairing invalid rings, snapping vertices, resolving overlaps.", {
        "snap_tolerance_m": body.snap_tolerance_m,
        "detected_conflicts": len(conflicts),
    })
    try:
        result = await asyncio.to_thread(
            planarize_dataset,
            cadastral=record.gdf,
            buildings=buildings,
            sliver_area_m2=body.sliver_area_m2,
            snap_tolerance_m=body.snap_tolerance_m,
        )
    except ValueError as exc:
        raise SpatialShiftError(str(exc), code="HARMONIZE_FAILED") from exc
    await asyncio.sleep(0.05)

    update("Scoring Transparent Quality Metrics", 88, "Evaluating geometric compactness, node snap quality, and sliver ratio.")
    confidence = score_harmonization(result.features)
    
    harmonize_id = str(uuid4())
    created_at = datetime.now(timezone.utc).isoformat()
    meta = {
        "removed_slivers": result.removed_slivers,
        "overlap_fixes": result.overlap_fixes,
        "snapped_nodes": result.snapped_nodes,
        "building_wall_segments": result.simulated_wall_segments,
        "building_wall_source": "uploaded_buildings" if buildings is not None else "inset_parcel_edges_fallback",
        "mean_snap_distance_m": result.mean_snap_distance_m,
        "confidence": confidence,
    }

    conflict_geojson = conflict_feature_collection(conflicts, str(record.gdf.crs))

    update("Persisting Harmonized State", 96, "Saving harmonized fabric and conflict records to persistent database.")
    store.save_harmonization_result(
        harmonize_id=harmonize_id,
        dataset_id=record.id,
        feature_count=int(len(result.gdf)),
        removed_slivers=result.removed_slivers,
        overlap_fixes=result.overlap_fixes,
        snapped_nodes=result.snapped_nodes,
        mean_snap_distance_m=result.mean_snap_distance_m,
        confidence=confidence,
        meta=meta,
        harmonized_gdf=result.gdf,
        conflict_geojson=conflict_geojson,
        created_at=created_at,
    )

    update("Finalizing Map Layers", 100, "Harmonization workflow complete.")

    return {
        "harmonize_id": harmonize_id,
        "dataset_id": record.id,
        "feature_count": int(len(result.gdf)),
        "removed_slivers": result.removed_slivers,
        "overlap_fixes": result.overlap_fixes,
        "snapped_nodes": result.snapped_nodes,
        "building_wall_segments": result.simulated_wall_segments,
        "building_wall_source": meta["building_wall_source"],
        "mean_snap_distance_m": result.mean_snap_distance_m,
        "confidence": confidence,
        "conflicts": [{key: value for key, value in conflict.items() if key != "geometry"} for conflict in conflicts],
        "conflict_geojson": conflict_geojson,
        "geojson": result.gdf.to_crs("EPSG:4326").__geo_interface__,
    }


async def _execute_job(body: HarmonizeRequest, job: ProcessingJob) -> None:
    try:
        result = await _run_harmonization(body, job)
        job.result = result
        job.update(status="complete", stage="Harmonization Complete", progress=100, message="Topological planarization and quality scoring finished successfully.")
    except Exception as exc:  # noqa: BLE001
        job.error = str(exc)
        job.update(status="failed", stage="Processing Failed", message=str(exc))


@router.post("/harmonize")
async def harmonize_dataset(body: HarmonizeRequest):
    result = await _run_harmonization(body)
    return success_payload(result, message="Topological planarization complete.")


@router.post("/harmonize/jobs")
async def start_harmonization_job(body: HarmonizeRequest):
    store.require(body.dataset_id)
    job = store.create_job(body.dataset_id)
    asyncio.create_task(_execute_job(body, job))
    return success_payload(job.payload(), message="Harmonization job started.")


@router.get("/harmonize/jobs/{job_id}")
async def harmonization_job_status(job_id: str):
    return success_payload(store.require_job(job_id).payload())
