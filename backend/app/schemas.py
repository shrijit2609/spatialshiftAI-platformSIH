from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class UploadResponse(BaseModel):
    dataset_id: str
    filename: str
    source_format: str
    feature_count: int
    crs: str
    bounds: list[float]
    geometry_types: list[str]
    columns: list[str]
    created_at: str


class HarmonizeRequest(BaseModel):
    dataset_id: str = Field(..., description="Dataset returned by /api/upload")
    building_dataset_id: Optional[str] = Field(
        default=None,
        description="Optional building footprints used as wall snap targets",
    )
    sliver_area_m2: float = Field(default=2.0, ge=0)
    snap_tolerance_m: float = Field(default=0.75, ge=0)
    overlap_area_m2: float = Field(default=0.5, ge=0)


class SpatialAnalysisRequest(BaseModel):
    cadastral_dataset_id: str
    reference_dataset_id: str
    iou_threshold: float = Field(default=0.5, ge=0, le=1)
    change_iou_threshold: float = Field(default=0.8, ge=0, le=1)
    attribute_fields: list[str] = Field(default_factory=list)


class ConfidenceBreakdown(BaseModel):
    geometry_validity: float
    sliver_cleanliness: float
    overlap_resolution: float
    node_snap_quality: float
    compactness: float
    rule_based_score: float
    score: float
    model: str
    methodology: str


class HarmonizeResponse(BaseModel):
    dataset_id: str
    feature_count: int
    removed_slivers: int
    overlap_fixes: int
    snapped_nodes: int
    simulated_wall_segments: int
    mean_snap_distance_m: float
    confidence: ConfidenceBreakdown
    geojson: dict[str, Any]


class ExportPdfRequest(BaseModel):
    dataset_id: str
    owner_name: str = "Authorized Right Holder"
    village: str = "Simulated Village"
    district: str = "Pune"
    state: str = "Maharashtra"
    survey_number: Optional[str] = None
