import os
from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from app import __version__
from app.config import CORS_ORIGINS
from app.exceptions import (
    SpatialShiftError,
    http_exception_handler,
    spatial_shift_exception_handler,
    success_payload,
    unhandled_exception_handler,
    validation_exception_handler,
)
from app.routers.analysis import router as analysis_router
from app.routers.events import router as events_router
from app.routers.exchange import router as exchange_router
from app.routers.export_pdf import router as export_router
from app.routers.extract_features import router as extraction_router
from app.routers.harmonize import router as harmonize_router
from app.routers.raster import router as raster_router
from app.routers.upload import router as upload_router

app = FastAPI(
    title="SpatialShift AI",
    description=(
        "Production-grade land record harmonization engine: Multi-source vector & raster ingest, "
        "orthomosaic & DSM hillshade rendering, schema adaptation, topological planarization, "
        "IoU spatial matching, live SSE job streams, and inter-departmental exchange API."
    ),
    version=__version__,
)

is_wildcard = "*" in CORS_ORIGINS

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_origin_regex=None if is_wildcard else r"https?://(localhost|127\.0\.0\.1)(:\d+)?|https://.*\.vercel\.app",
    allow_credentials=not is_wildcard,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "X-ULPIN", "X-Dataset-Id", "X-Raster-Type", "X-Bounds-WGS84"],
)

app.add_exception_handler(SpatialShiftError, spatial_shift_exception_handler)
app.add_exception_handler(StarletteHTTPException, http_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)

app.include_router(upload_router)
app.include_router(harmonize_router)
app.include_router(analysis_router)
app.include_router(extraction_router)
app.include_router(raster_router)
app.include_router(events_router)
app.include_router(exchange_router)
app.include_router(export_router)


@app.get("/")
async def root():
    return success_payload(
        {
            "service": "spatialshift-ai",
            "version": __version__,
            "status": "healthy",
            "docs": "/docs",
            "health": "/api/health",
        },
        message="SpatialShift AI API is running.",
    )


@app.get("/api/health")
async def health():
    return success_payload(
        {
            "service": "spatialshift-ai",
            "version": __version__,
            "status": "healthy",
            "crs": "EPSG:32643",
            "capabilities": [
                "vector_ingest",
                "raster_imagery_rendering",
                "dsm_dtm_hillshade_engine",
                "multi_source_schema_adaptation",
                "topology_planarization",
                "iou_matching",
                "attribute_comparison",
                "change_detection",
                "live_sse_event_streaming",
                "sqlite_persistence",
                "inter_departmental_exchange_api",
                "transparent_rule_based_confidence",
                "classical_imagery_feature_extraction_fallback",
            ],
        }
    )


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=False)
