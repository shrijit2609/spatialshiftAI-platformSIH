"""Raster rendering, tile generation, and elevation visualization service.

Provides real pixel rendering for uploaded GeoTIFFs (RGB Drone Orthomosaic / ORI,
and single-band DSM/DTM elevation models with dynamic hillshade & hypsometric tint).
"""
from __future__ import annotations

import io
from pathlib import Path
from typing import Any, Tuple

import numpy as np
import rasterio
from PIL import Image
from pyproj import Transformer
from rasterio.io import MemoryFile
from rasterio.transform import from_bounds
from rasterio.warp import Resampling, reproject, transform_bounds

from app.config import TARGET_CRS
from app.exceptions import SpatialShiftError


def _compute_hillshade(elevation: np.ndarray, cell_size_x: float, cell_size_y: float,
                       azimuth_deg: float = 315.0, altitude_deg: float = 45.0) -> np.ndarray:
    """Compute analytical hillshade from a 2D elevation grid."""
    azimuth_rad = np.radians(360.0 - azimuth_deg + 90.0)
    altitude_rad = np.radians(altitude_deg)

    gy, gx = np.gradient(elevation, cell_size_y, cell_size_x)
    slope = np.arctan(np.hypot(gx, gy))
    aspect = np.arctan2(-gy, gx)

    shaded = (
        np.sin(altitude_rad) * np.cos(slope)
        + np.cos(altitude_rad) * np.sin(slope) * np.cos(azimuth_rad - aspect)
    )
    shaded = np.clip(shaded, 0, 1)
    return (shaded * 255.0).astype(np.uint8)


def _elevation_colormap(normalized: np.ndarray) -> np.ndarray:
    """Apply hypsometric terrain color palette to normalized 0..1 elevation."""
    # Colors: deep green -> light green -> yellow-tan -> brown -> rock grey -> snow white
    stops = np.array([0.0, 0.2, 0.4, 0.65, 0.85, 1.0])
    palette = np.array([
        [46, 125, 50],    # Deep vegetation green
        [129, 199, 132],  # Light green
        [230, 215, 140],  # Tan / sand
        [161, 110, 60],   # Terracotta / brown
        [140, 140, 140],  # Mountain rock grey
        [250, 250, 252],  # Peak highlight
    ], dtype=np.float32)

    h, w = normalized.shape
    flat = normalized.ravel()
    rgb = np.zeros((flat.size, 3), dtype=np.uint8)

    for i in range(len(stops) - 1):
        mask = (flat >= stops[i]) & (flat <= stops[i + 1])
        if not np.any(mask):
            continue
        t = (flat[mask] - stops[i]) / (stops[i + 1] - stops[i])
        c0 = palette[i]
        c1 = palette[i + 1]
        interp = (1.0 - t[:, None]) * c0 + t[:, None] * c1
        rgb[mask] = np.clip(interp, 0, 255).astype(np.uint8)

    return rgb.reshape((h, w, 3))


def get_raster_info(raster_bytes: bytes) -> dict[str, Any]:
    """Inspect raster headers, metadata, CRS, and compute exact WGS84 bounds."""
    with MemoryFile(raster_bytes) as mem:
        with mem.open() as ds:
            if ds.crs is None:
                raise SpatialShiftError("GeoTIFF has no coordinate reference system.", code="RASTER_CRS_REQUIRED")
            
            # Reproject bounds to EPSG:4326 (WGS84)
            wgs84_bounds = transform_bounds(ds.crs, "EPSG:4326", *ds.bounds, densify_pts=21)
            west, south, east, north = wgs84_bounds

            # MapLibre image coordinates order: [top-left, top-right, bottom-right, bottom-left]
            coordinates = [
                [west, north],
                [east, north],
                [east, south],
                [west, south],
            ]

            is_elevation = False
            if ds.count == 1:
                # Check sample values to determine if elevation DSM/DTM or single-band intensity
                sample = ds.read(1, out_shape=(min(ds.height, 256), min(ds.width, 256)), masked=True)
                valid = sample.compressed()
                if valid.size > 0:
                    val_min, val_max = float(np.min(valid)), float(np.max(valid))
                    if val_max - val_min > 5.0 and (np.issubdtype(ds.dtypes[0], np.floating) or val_max > 255):
                        is_elevation = True

            return {
                "width": ds.width,
                "height": ds.height,
                "band_count": ds.count,
                "dtypes": ds.dtypes,
                "source_crs": str(ds.crs),
                "bounds_wgs84": [west, south, east, north],
                "coordinates_wgs84": coordinates,
                "is_elevation": is_elevation,
                "raster_type": "elevation_dsm" if is_elevation else ("rgb_orthomosaic" if ds.count >= 3 else "single_band_intensity"),
            }


def render_raster_preview_png(raster_bytes: bytes, max_dimension: int = 2048) -> Tuple[bytes, dict[str, Any]]:
    """Render full georeferenced RGBA PNG preview with contrast normalization or terrain hillshading."""
    info = get_raster_info(raster_bytes)
    with MemoryFile(raster_bytes) as mem:
        with mem.open() as ds:
            scale = min(1.0, max_dimension / max(ds.width, ds.height))
            out_h = max(1, int(ds.height * scale))
            out_w = max(1, int(ds.width * scale))

            if info["is_elevation"]:
                # Single-band DSM/DTM elevation rendering with hillshade + hypsometric tint
                band = ds.read(1, out_shape=(out_h, out_w), masked=True).astype(np.float32)
                mask = band.mask if np.ma.is_masked(band) else np.zeros((out_h, out_w), dtype=bool)
                if ds.nodata is not None:
                    mask = mask | (band.data == ds.nodata) | np.isnan(band.data)

                valid = band.compressed()
                if valid.size == 0:
                    raise SpatialShiftError("No valid elevation values found in DSM.", code="RASTER_EMPTY")

                p2, p98 = np.percentile(valid, [2, 98])
                norm = np.clip((band.data - p2) / max(p98 - p2, 1e-4), 0.0, 1.0)

                # Compute hillshade
                res_x = (ds.bounds.right - ds.bounds.left) / out_w
                res_y = (ds.bounds.top - ds.bounds.bottom) / out_h
                shade = _compute_hillshade(band.filled(p2), max(abs(res_x), 0.1), max(abs(res_y), 0.1))

                # Compute color tint
                color = _elevation_colormap(norm)

                # Blend hillshade with color ramp (multiplicative blend)
                shade_factor = shade.astype(np.float32) / 255.0
                blended = np.clip(color.astype(np.float32) * (0.35 + 0.65 * shade_factor[:, :, None]), 0, 255).astype(np.uint8)

                rgba = np.zeros((out_h, out_w, 4), dtype=np.uint8)
                rgba[:, :, :3] = blended
                rgba[:, :, 3] = np.where(mask, 0, 240).astype(np.uint8)

            elif ds.count >= 3:
                # RGB / RGBA Orthomosaic Drone Imagery
                r = ds.read(1, out_shape=(out_h, out_w), masked=True).astype(np.float32)
                g = ds.read(2, out_shape=(out_h, out_w), masked=True).astype(np.float32)
                b = ds.read(3, out_shape=(out_h, out_w), masked=True).astype(np.float32)

                mask = np.zeros((out_h, out_w), dtype=bool)
                for band in (r, g, b):
                    if np.ma.is_masked(band):
                        mask = mask | band.mask
                    if ds.nodata is not None:
                        mask = mask | (band.data == ds.nodata) | np.isnan(band.data)

                rgb_layers = []
                for band in (r, g, b):
                    valid = band.compressed()
                    if valid.size > 0:
                        p2, p98 = np.percentile(valid, [1, 99])
                        scaled = np.clip((band.data - p2) / max(p98 - p2, 1e-4), 0.0, 1.0) * 255.0
                    else:
                        scaled = np.zeros((out_h, out_w), dtype=np.float32)
                    rgb_layers.append(scaled.astype(np.uint8))

                rgba = np.zeros((out_h, out_w, 4), dtype=np.uint8)
                rgba[:, :, 0] = rgb_layers[0]
                rgba[:, :, 1] = rgb_layers[1]
                rgba[:, :, 2] = rgb_layers[2]
                rgba[:, :, 3] = np.where(mask, 0, 255).astype(np.uint8)

            else:
                # 1-band grayscale image
                gray = ds.read(1, out_shape=(out_h, out_w), masked=True).astype(np.float32)
                mask = gray.mask if np.ma.is_masked(gray) else np.zeros((out_h, out_w), dtype=bool)
                if ds.nodata is not None:
                    mask = mask | (gray.data == ds.nodata) | np.isnan(gray.data)
                
                valid = gray.compressed()
                if valid.size > 0:
                    p2, p98 = np.percentile(valid, [2, 98])
                    scaled = np.clip((gray.data - p2) / max(p98 - p2, 1e-4), 0.0, 1.0) * 255.0
                else:
                    scaled = np.zeros((out_h, out_w), dtype=np.float32)
                
                g_u8 = scaled.astype(np.uint8)
                rgba = np.zeros((out_h, out_w, 4), dtype=np.uint8)
                rgba[:, :, 0] = g_u8
                rgba[:, :, 1] = g_u8
                rgba[:, :, 2] = g_u8
                rgba[:, :, 3] = np.where(mask, 0, 255).astype(np.uint8)

            img = Image.fromarray(rgba, mode="RGBA")
            buf = io.BytesIO()
            img.save(buf, format="PNG", optimize=True)
            return buf.getvalue(), info
