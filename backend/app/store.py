from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal
from uuid import uuid4

import geopandas as gpd

DatasetKind = Literal["cadastral", "buildings", "generic"]
JobStatus = Literal["queued", "running", "complete", "failed"]


class DatasetRecord:
    def __init__(
        self,
        gdf: gpd.GeoDataFrame,
        source_format: str,
        filename: str,
        kind: DatasetKind = "generic",
    ) -> None:
        self.id = str(uuid4())
        self.gdf = gdf
        self.source_format = source_format
        self.filename = filename
        self.kind = kind
        self.created_at = datetime.now(timezone.utc).isoformat()
        self.harmonized: gpd.GeoDataFrame | None = None
        self.raster_bytes: bytes | None = None
        self.feature_extractions: dict[str, Any] = {}
        self.harmonize_meta: dict[str, Any] = {}


class ProcessingJob:
    """Ephemeral but truthful state for an actual backend processing request."""

    def __init__(self, dataset_id: str) -> None:
        self.id = str(uuid4())
        self.dataset_id = dataset_id
        self.status: JobStatus = "queued"
        self.stage = "Queued"
        self.progress = 0
        self.message = "Waiting for backend worker."
        self.result: dict[str, Any] | None = None
        self.error: str | None = None
        self.created_at = datetime.now(timezone.utc).isoformat()
        self.updated_at = self.created_at

    def update(self, *, status: JobStatus | None = None, stage: str | None = None,
               progress: int | None = None, message: str | None = None) -> None:
        if status is not None:
            self.status = status
        if stage is not None:
            self.stage = stage
        if progress is not None:
            self.progress = max(0, min(100, progress))
        if message is not None:
            self.message = message
        self.updated_at = datetime.now(timezone.utc).isoformat()

    def payload(self) -> dict[str, Any]:
        return {
            "job_id": self.id,
            "dataset_id": self.dataset_id,
            "status": self.status,
            "stage": self.stage,
            "progress": self.progress,
            "message": self.message,
            "result": self.result,
            "error": self.error,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


class DatasetStore:
    def __init__(self) -> None:
        self._items: dict[str, DatasetRecord] = {}
        self._jobs: dict[str, ProcessingJob] = {}

    def put(self, record: DatasetRecord) -> DatasetRecord:
        self._items[record.id] = record
        return record

    def get(self, dataset_id: str) -> DatasetRecord | None:
        return self._items.get(dataset_id)

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
