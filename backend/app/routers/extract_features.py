from fastapi import APIRouter

from app.exceptions import success_payload
from app.schemas import FeatureExtractionRequest
from app.services.feature_extract import extract_edge_regions
from app.store import store

router = APIRouter(prefix="/api", tags=["feature-extraction"])


@router.post("/extract-features")
async def extract_features(body: FeatureExtractionRequest):
    record = store.require(body.dataset_id)
    gdf = extract_edge_regions(record, body.min_area_m2)
    payload = {
        "dataset_id": record.id,
        "feature_count": int(len(gdf)),
        "method": "classical_edge_region_fallback",
        "method_note": "Intensity-gradient region extraction. This is a non-ML fallback, not Mask R-CNN.",
        "geojson": gdf.to_crs("EPSG:4326").__geo_interface__,
    }
    record.feature_extractions["classical_edge_region_fallback"] = payload
    return success_payload(payload, message="Classical imagery feature extraction complete.")
