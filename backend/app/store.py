from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Set
from uuid import uuid4

import geopandas as gpd

from app.db import (
    DATA_DIR,
    GEOJSON_DIR,
    RASTER_DIR,
    init_db,
    list_persisted_datasets,
    save_dataset_to_db,
    save_harmonization_to_db,
)

DatasetKind = Literal["cadastral", "buildings", "generic", "revenue_ror", "gnss_cors", "municipal_utility", "ground_truth"]
JobStatus = Literal["queued", "running", "complete", "failed"]


class DatasetRecord:
    def __init__(
        self,
        gdf: gpd.GeoDataFrame,
        source_format: str,
        filename: str,
        kind: DatasetKind = "generic",
        dataset_id: Optional[str] = None,
        schema_profile: Optional[Dict[str, Any]] = None,
        created_at: Optional[str] = None,
    ) -> None:
        self.id = dataset_id or str(uuid4())
        self.gdf = gdf
        self.source_format = source_format
        self.filename = filename
        self.kind = kind
        self.schema_profile = schema_profile or {}
        self.created_at = created_at or datetime.now(timezone.utc).isoformat()
        self.harmonized: gpd.GeoDataFrame | None = None
        self.harmonize_id: str | None = None
        self.raster_bytes: bytes | None = None
        self.feature_extractions: dict[str, Any] = {}
        self.harmonize_meta: dict[str, Any] = {}


class ProcessingJob:
    """Real live state and event streaming for backend processing tasks."""

    def __init__(self, dataset_id: str) -> None:
        self.id = str(uuid4())
        self.dataset_id = dataset_id
        self.status: JobStatus = "queued"
        self.stage = "Queued"
        self.progress = 0
        self.message = "Waiting for backend worker."
        self.logs: List[Dict[str, Any]] = []
        self.result: dict[str, Any] | None = None
        self.error: str | None = None
        self.created_at = datetime.now(timezone.utc).isoformat()
        self.updated_at = self.created_at
        self._subscribers: Set[asyncio.Queue] = set()

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue()
        self._subscribers.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        self._subscribers.discard(q)

    def update(
        self,
        *,
        status: JobStatus | None = None,
        stage: str | None = None,
        progress: int | None = None,
        message: str | None = None,
        metrics: dict[str, Any] | None = None,
    ) -> None:
        if status is not None:
            self.status = status
        if stage is not None:
            self.stage = stage
        if progress is not None:
            self.progress = max(0, min(100, progress))
        if message is not None:
            self.message = message

        now = datetime.now(timezone.utc).isoformat()
        self.updated_at = now
        
        log_entry = {
            "timestamp": now,
            "stage": self.stage,
            "progress": self.progress,
            "message": self.message,
            "metrics": metrics or {},
        }
        self.logs.append(log_entry)

        payload = self.payload()
        for q in list(self._subscribers):
            try:
                q.put_nowait(payload)
            except Exception:
                pass

    def payload(self) -> dict[str, Any]:
        return {
            "job_id": self.id,
            "dataset_id": self.dataset_id,
            "status": self.status,
            "stage": self.stage,
            "progress": self.progress,
            "message": self.message,
            "logs": self.logs[-10:],
            "result": self.result,
            "error": self.error,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


class DatasetStore:
    def __init__(self) -> None:
        self._items: dict[str, DatasetRecord] = {}
        self._jobs: dict[str, ProcessingJob] = {}
        self._load_from_db()

    def _load_from_db(self) -> None:
        try:
            init_db()
            persisted = list_persisted_datasets()
            for row in persisted:
                d_id = row["id"]
                geojson_path = GEOJSON_DIR / f"{d_id}.geojson"
                if geojson_path.exists():
                    gdf = gpd.read_file(geojson_path)
                    record = DatasetRecord(
                        gdf=gdf,
                        source_format=row["source_format"],
                        filename=row["filename"],
                        kind=row["kind"],
                        dataset_id=d_id,
                        schema_profile=row.get("schema_profile"),
                        created_at=row["created_at"],
                    )
                    raster_path = RASTER_DIR / f"{d_id}.tif"
                    if raster_path.exists():
                        record.raster_bytes = raster_path.read_bytes()
                    self._items[d_id] = record
        except Exception as exc:
            # Fallback cleanly if database cannot be initialized
            pass

    def put(self, record: DatasetRecord) -> DatasetRecord:
        self._items[record.id] = record
        try:
            save_dataset_to_db(
                dataset_id=record.id,
                filename=record.filename,
                source_format=record.source_format,
                kind=record.kind,
                gdf=record.gdf,
                schema_profile=record.schema_profile,
                raster_bytes=record.raster_bytes,
                created_at=record.created_at,
            )
        except Exception:
            pass
        return record

    def save_harmonization_result(
        self,
        harmonize_id: str,
        dataset_id: str,
        feature_count: int,
        removed_slivers: int,
        overlap_fixes: int,
        snapped_nodes: int,
        mean_snap_distance_m: float,
        confidence: dict[str, Any],
        meta: dict[str, Any],
        harmonized_gdf: gpd.GeoDataFrame,
        conflict_geojson: dict[str, Any],
        created_at: str,
    ) -> None:
        record = self.get(dataset_id)
        if record:
            record.harmonized = harmonized_gdf
            record.harmonize_id = harmonize_id
            record.harmonize_meta = meta
        try:
            save_harmonization_to_db(
                harmonize_id=harmonize_id,
                dataset_id=dataset_id,
                feature_count=feature_count,
                removed_slivers=removed_slivers,
                overlap_fixes=overlap_fixes,
                snapped_nodes=snapped_nodes,
                mean_snap_distance_m=mean_snap_distance_m,
                confidence=confidence,
                meta=meta,
                harmonized_gdf=harmonized_gdf,
                conflict_geojson=conflict_geojson,
                created_at=created_at,
            )
        except Exception:
            pass

    def get(self, dataset_id: str) -> DatasetRecord | None:
        return self._items.get(dataset_id)

    def list_all(self) -> List[DatasetRecord]:
        return list(self._items.values())

    def create_job(self, dataset_id: str) -> ProcessingJob:
        job = ProcessingJob(dataset_id)
        self._jobs[job.id] = job
        return job

    def require_job(self, job_id: str) -> ProcessingJob:
        from app.exceptions import SpatialShiftError

        job = self._jobs.get(job_id)
        if job is None:
            raise SpatialShiftError("Processing job was not found.", code="JOB_NOT_FOUND", status_code=404)
        return job

    def require(self, dataset_id: str) -> DatasetRecord:
        from app.exceptions import SpatialShiftError

        record = self._items.get(dataset_id)
        if record is None:
            raise SpatialShiftError(
                f"Dataset '{dataset_id}' was not found. Upload data first.",
                code="DATASET_NOT_FOUND",
                status_code=404,
            )
        return record


store = DatasetStore()
