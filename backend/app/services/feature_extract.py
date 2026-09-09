"""Classical imagery feature extraction fallback.

This intentionally does not claim Mask R-CNN or a trained model. It converts
strong raster intensity transitions into candidate polygons to demonstrate a
working imagery-to-vector path when no model/checkpoint is available.
"""
from __future__ import annotations

import numpy as np
import geopandas as gpd
import rasterio
from rasterio.features import shapes, sieve
from rasterio.io import MemoryFile
from shapely.geometry import shape

from app.exceptions import SpatialShiftError
from app.store import DatasetRecord

MAX_DIMENSION = 1600


def extract_edge_regions(record: DatasetRecord, min_area_m2: float = 12.0) -> gpd.GeoDataFrame:
    if not record.raster_bytes:
        raise SpatialShiftError(
            "Feature extraction requires a GeoTIFF uploaded during this server session.",
            code="RASTER_NOT_AVAILABLE",
            status_code=409,
        )

    try:
        with MemoryFile(record.raster_bytes) as memory:
            with memory.open() as dataset:
                if dataset.crs is None:
                    raise SpatialShiftError("GeoTIFF has no CRS.", code="RASTER_CRS_REQUIRED")
                scale = min(1.0, MAX_DIMENSION / max(dataset.width, dataset.height))
                height = max(1, int(dataset.height * scale))
                width = max(1, int(dataset.width * scale))
                band = dataset.read(1, out_shape=(height, width), masked=True).astype("float32")
                values = band.compressed()
                if values.size < 100:
                    raise SpatialShiftError("Raster has insufficient valid pixels.", code="RASTER_EMPTY")
                low, high = np.percentile(values, [2, 98])
                normalized = np.clip((band.filled(low) - low) / max(high - low, 1e-6), 0, 1)
                gradient_y, gradient_x = np.gradient(normalized)
                gradient = np.hypot(gradient_x, gradient_y)
                threshold = float(np.percentile(gradient, 88))
                mask = sieve((gradient >= threshold).astype("uint8"), size=16)
                transform = dataset.transform * dataset.transform.scale(dataset.width / width, dataset.height / height)

                geometries = []
                for geometry, value in shapes(mask, mask=mask.astype(bool), transform=transform):
                    if not value:
                        continue
                    candidate = shape(geometry).buffer(0)
                    if candidate.is_empty:
                        continue
                    geometries.append(candidate)

                if not geometries:
                    return gpd.GeoDataFrame({"method": []}, geometry=[], crs=dataset.crs).to_crs("EPSG:32643")
                gdf = gpd.GeoDataFrame(
                    {"method": ["classical_edge_region_fallback"] * len(geometries)},
                    geometry=geometries,
                    crs=dataset.crs,
                ).to_crs("EPSG:32643")
                gdf = gdf[gdf.geometry.area >= min_area_m2].copy()
                gdf["feature_id"] = [f"edge-{index + 1}" for index in range(len(gdf))]
                gdf["area_m2"] = gdf.geometry.area.round(3)
                return gdf.head(250)
    except SpatialShiftError:
        raise
    except Exception as exc:  # noqa: BLE001
        raise SpatialShiftError("Classical raster feature extraction failed.", code="FEATURE_EXTRACTION_FAILED") from exc
