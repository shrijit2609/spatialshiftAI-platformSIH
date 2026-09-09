from fastapi import APIRouter

from app.exceptions import SpatialShiftError, success_payload
from app.schemas import SpatialAnalysisRequest
from app.services.analysis import conflict_feature_collection, detect_changes, match_layers
from app.store import store

router = APIRouter(prefix="/api", tags=["analysis"])


@router.post("/analyze")
async def analyze_spatial_relationships(body: SpatialAnalysisRequest):
    cadastral = store.require(body.cadastral_dataset_id)
    reference = store.require(body.reference_dataset_id)
    try:
        comparison = match_layers(
            cadastral.gdf,
            reference.gdf,
            iou_threshold=body.iou_threshold,
            attribute_fields=body.attribute_fields,
        )
        changes = detect_changes(cadastral.gdf, reference.gdf, body.change_iou_threshold)
    except Exception as exc:  # noqa: BLE001
        raise SpatialShiftError(
            "Spatial analysis requires valid overlapping polygon layers.",
            code="SPATIAL_ANALYSIS_FAILED",
        ) from exc

    conflicts = comparison["conflicts"]
    return success_payload(
        {
            "cadastral_dataset_id": cadastral.id,
            "reference_dataset_id": reference.id,
            "matched_count": comparison["matched_count"],
            "conflict_count": comparison["conflict_count"],
            "matches": comparison["matches"],
            "conflicts": [
                {key: value for key, value in conflict.items() if key != "geometry"}
                for conflict in conflicts
            ],
            "conflict_geojson": conflict_feature_collection(conflicts, str(cadastral.gdf.crs)),
            "changes": [
                {key: value for key, value in change.items() if key != "geometry"}
                for change in changes
            ],
        },
        message="IoU matching, attribute comparison, and change detection complete.",
    )
