from fastapi import APIRouter, File, UploadFile

from app.exceptions import SpatialShiftError, success_payload
from app.services.ingest import dataset_summary, ingest_uploads

router = APIRouter(prefix="/api", tags=["ingest"])


@router.post("/upload")
async def upload_spatial_files(files: list[UploadFile] = File(...)):
    if not files:
        raise SpatialShiftError("Attach one or more spatial files.", code="NO_FILES")
    record = await ingest_uploads(files)
    summary = dataset_summary(record)
    summary["geojson"] = record.gdf.to_crs("EPSG:4326").__geo_interface__
    return success_payload(summary, message="Source data was ingested and normalized to EPSG:32643.")
