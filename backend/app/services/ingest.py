from __future__ import annotations

import json
import tempfile
from pathlib import Path

import geopandas as gpd
import pandas as pd
import rasterio
from fastapi import UploadFile
from rasterio.warp import transform_bounds
from shapely import wkt
from shapely.geometry import Point, box, shape

from app.config import DEFAULT_ASSUMED_CRS, TARGET_CRS
from app.exceptions import SpatialShiftError
from app.services.schemas_adapter import profile_dataframe_schema
from app.store import DatasetRecord, store

SHAPEFILE_EXTS = {".shp", ".shx", ".dbf", ".prj", ".cpg", ".sbn", ".sbx", ".qix", ".fix"}
GEOJSON_EXTS = {".geojson", ".json"}
CSV_EXTS = {".csv"}
RASTER_EXTS = {".tif", ".tiff"}

LAT_ALIASES = ("lat", "latitude", "y", "northing", "lat_dd", "latitude_dd")
LON_ALIASES = ("lon", "lng", "long", "longitude", "x", "easting", "lon_dd", "longitude_dd")
WKT_ALIASES = ("wkt", "geom", "geometry", "the_geom", "wkt_geom")


def _suffix(name: str) -> str:
    return Path(name).suffix.lower()


def _detect_format(files: list[UploadFile]) -> str:
    exts = {_suffix(f.filename or "") for f in files}
    if ".shp" in exts:
        return "shapefile"
    if exts & GEOJSON_EXTS:
        return "geojson"
    if exts & CSV_EXTS:
        return "csv"
    if exts & RASTER_EXTS:
        return "geotiff"
    raise SpatialShiftError(
        "Unsupported upload. Provide GeoJSON, CSV, GeoTIFF, or a Shapefile set.",
        code="UNSUPPORTED_FORMAT",
    )


async def _write_uploads(files: list[UploadFile], directory: Path) -> list[Path]:
    written: list[Path] = []
    for upload in files:
        name = Path(upload.filename or "upload.bin").name
        dest = directory / name
        content = await upload.read()
        if content:
            dest.write_bytes(content)
            written.append(dest)
    if not written:
        raise SpatialShiftError("No non-empty files were uploaded.", code="EMPTY_UPLOAD")
    return written


def _find_column(columns: list[str], aliases: tuple[str, ...]) -> str | None:
    lookup = {c.lower(): c for c in columns}
    return next((lookup[name] for name in aliases if name in lookup), None)


def _read_csv(path: Path) -> gpd.GeoDataFrame:
    df = pd.read_csv(path)
    if df.empty:
        raise SpatialShiftError("CSV file contains no rows.", code="EMPTY_DATASET")
    wkt_col = _find_column(list(df.columns), WKT_ALIASES)
    if wkt_col:
        try:
            geometry = df[wkt_col].map(wkt.loads)
        except Exception as exc:  # noqa: BLE001
            raise SpatialShiftError("Could not parse WKT geometries from CSV.", code="INVALID_GEOMETRY") from exc
        return gpd.GeoDataFrame(df.drop(columns=[wkt_col]), geometry=geometry, crs=DEFAULT_ASSUMED_CRS)
    lat_col, lon_col = _find_column(list(df.columns), LAT_ALIASES), _find_column(list(df.columns), LON_ALIASES)
    if lat_col and lon_col:
        return gpd.GeoDataFrame(
            df,
            geometry=[Point(xy) for xy in zip(df[lon_col].astype(float), df[lat_col].astype(float))],
            crs=DEFAULT_ASSUMED_CRS,
        )
    raise SpatialShiftError("CSV must include lat/lon columns, or a WKT geometry column.", code="MISSING_COORDINATES")


def _read_geojson(path: Path) -> gpd.GeoDataFrame:
    try:
        gdf = gpd.read_file(path)
    except Exception:
        payload = json.loads(path.read_text(encoding="utf-8"))
        features = payload.get("features", [])
        gdf = gpd.GeoDataFrame(
            [feature.get("properties") or {} for feature in features],
            geometry=[shape(feature["geometry"]) for feature in features],
            crs=DEFAULT_ASSUMED_CRS,
        )
    if gdf.empty:
        raise SpatialShiftError("GeoJSON contains no features.", code="EMPTY_DATASET")
    return gdf


def _read_shapefile(directory: Path) -> gpd.GeoDataFrame:
    files = list(directory.glob("*.shp"))
    if not files:
        raise SpatialShiftError("Shapefile upload is missing the required .shp file.", code="INCOMPLETE_SHAPEFILE")
    try:
        gdf = gpd.read_file(files[0])
    except Exception as exc:  # noqa: BLE001
        raise SpatialShiftError("Failed to read Shapefile. Include .shp, .shx, .dbf, and ideally .prj.", code="SHAPEFILE_READ_ERROR") from exc
    if gdf.empty:
        raise SpatialShiftError("Shapefile contains no features.", code="EMPTY_DATASET")
    return gdf


def _read_raster_footprint(path: Path) -> gpd.GeoDataFrame:
    """Read real GeoTIFF metadata and expose a georeferenced footprint layer."""
    try:
        with rasterio.open(path) as dataset:
            if dataset.crs is None:
                raise SpatialShiftError("GeoTIFF has no CRS; it cannot be georeferenced safely.", code="RASTER_CRS_REQUIRED")
            bounds = transform_bounds(dataset.crs, TARGET_CRS, *dataset.bounds, densify_pts=21)
            geometry = box(*bounds)
            return gpd.GeoDataFrame(
                [{
                    "source_type": "geotiff",
                    "width_px": dataset.width,
                    "height_px": dataset.height,
                    "band_count": dataset.count,
                    "source_crs": str(dataset.crs),
                    "nodata": dataset.nodata,
                }],
                geometry=[geometry],
                crs=TARGET_CRS,
            )
    except SpatialShiftError:
        raise
    except Exception as exc:  # noqa: BLE001
        raise SpatialShiftError("Could not read GeoTIFF metadata.", code="RASTER_READ_ERROR") from exc


def normalize_crs(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    gdf = gdf.copy()
    gdf = gdf[~gdf.geometry.isna()].copy()
    if gdf.empty:
        raise SpatialShiftError("No valid geometries after ingest.", code="EMPTY_DATASET")
    if gdf.crs is None:
        gdf = gdf.set_crs(DEFAULT_ASSUMED_CRS)
    try:
        gdf = gdf.to_crs(TARGET_CRS)
    except Exception as exc:  # noqa: BLE001
        raise SpatialShiftError(f"Could not reproject geometries to {TARGET_CRS}.", code="CRS_TRANSFORM_ERROR") from exc
    gdf["geometry"] = gdf.geometry.make_valid()
    return gdf


async def ingest_uploads(files: list[UploadFile]) -> DatasetRecord:
    source_format = _detect_format(files)
    display_name = files[0].filename or f"upload.{source_format}"
    with tempfile.TemporaryDirectory(prefix="spatialshift-") as tmp:
        written = await _write_uploads(files, Path(tmp))
        raster_bytes = None
        if source_format == "shapefile":
            gdf = _read_shapefile(Path(tmp))
        elif source_format == "geojson":
            gdf = _read_geojson(next(path for path in written if _suffix(path.name) in GEOJSON_EXTS))
        elif source_format == "csv":
            gdf = _read_csv(next(path for path in written if _suffix(path.name) in CSV_EXTS))
        else:
            raster_path = next(path for path in written if _suffix(path.name) in RASTER_EXTS)
            gdf = _read_raster_footprint(raster_path)
            raster_bytes = raster_path.read_bytes()

        normalized = normalize_crs(gdf)
        schema_profile = profile_dataframe_schema(normalized) if source_format != "geotiff" else {
            "archetype": "raster_imagery",
            "archetype_name": "GeoTIFF Imagery / Elevation Model",
            "description": "Georeferenced orthomosaic or digital elevation grid.",
            "confidence_pct": 100,
            "mapped_fields": {},
            "unmapped_fields": [],
            "total_columns": 0,
            "geometry_types": ["Polygon"],
        }

        record = DatasetRecord(
            gdf=normalized,
            source_format=source_format,
            filename=display_name,
            kind=schema_profile.get("archetype", "generic"),
            schema_profile=schema_profile,
        )
        if raster_bytes:
            record.raster_bytes = raster_bytes

        return store.put(record)


def dataset_summary(record: DatasetRecord) -> dict:
    gdf = record.gdf
    wgs84_gdf = gdf.to_crs("EPSG:4326")
    return {
        "dataset_id": record.id,
        "filename": record.filename,
        "source_format": record.source_format,
        "kind": record.kind,
        "feature_count": int(len(gdf)),
        "crs": TARGET_CRS,
        "bounds": [float(value) for value in gdf.total_bounds],
        "bounds_wgs84": [float(value) for value in wgs84_gdf.total_bounds],
        "geometry_types": sorted({geom.geom_type for geom in gdf.geometry if geom is not None}),
        "columns": [column for column in gdf.columns if column != "geometry"],
        "schema_profile": record.schema_profile,
        "has_raster": bool(record.raster_bytes),
        "created_at": record.created_at,
        "geojson": wgs84_gdf.__geo_interface__,
    }
