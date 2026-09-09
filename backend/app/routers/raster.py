from __future__ import annotations

from fastapi import APIRouter, Response
from fastapi.responses import JSONResponse

from app.exceptions import SpatialShiftError, success_payload
from app.services.raster_service import get_raster_info, render_raster_preview_png
from app.store import store

router = APIRouter(prefix="/api/raster", tags=["raster"])


@router.get("/{dataset_id}/info")
async def raster_info(dataset_id: str):
    record = store.require(dataset_id)
    if not record.raster_bytes:
        raise SpatialShiftError(
            "Dataset does not contain raster pixel data.",
            code="NOT_A_RASTER",
            status_code=400,
        )
    info = get_raster_info(record.raster_bytes)
    return success_payload(info)


@router.get("/{dataset_id}/preview.png")
async def raster_preview(dataset_id: str):
    record = store.require(dataset_id)
    if not record.raster_bytes:
        raise SpatialShiftError(
            "Dataset does not contain raster pixel data.",
            code="NOT_A_RASTER",
            status_code=400,
        )
    png_bytes, info = render_raster_preview_png(record.raster_bytes)
    return Response(
        content=png_bytes,
        media_type="image/png",
        headers={
            "Cache-Control": "public, max-age=3600",
            "X-Raster-Type": info["raster_type"],
            "X-Bounds-WGS84": ",".join(map(str, info["bounds_wgs84"])),
        },
    )
