"""SQLite database persistence and file storage layer.

Persists uploaded datasets, GeoTIFF rasters, harmonization results, and job states
to disk (backend/data/spatialshift.db) so all sessions survive server restarts.
"""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional

import geopandas as gpd

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
RASTER_DIR = DATA_DIR / "rasters"
GEOJSON_DIR = DATA_DIR / "geojson"
DB_PATH = DATA_DIR / "spatialshift.db"


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    RASTER_DIR.mkdir(parents=True, exist_ok=True)
    GEOJSON_DIR.mkdir(parents=True, exist_ok=True)

    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS datasets (
                id TEXT PRIMARY KEY,
                filename TEXT NOT NULL,
                source_format TEXT NOT NULL,
                kind TEXT NOT NULL,
                feature_count INTEGER NOT NULL,
                crs TEXT NOT NULL,
                bounds_json TEXT NOT NULL,
                schema_profile_json TEXT NOT NULL,
                geojson_file TEXT,
                raster_file TEXT,
                created_at TEXT NOT NULL
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS harmonizations (
                id TEXT PRIMARY KEY,
                dataset_id TEXT NOT NULL,
                feature_count INTEGER NOT NULL,
                removed_slivers INTEGER NOT NULL,
                overlap_fixes INTEGER NOT NULL,
                snapped_nodes INTEGER NOT NULL,
                mean_snap_distance_m REAL NOT NULL,
                confidence_json TEXT NOT NULL,
                meta_json TEXT NOT NULL,
                geojson_file TEXT NOT NULL,
                conflict_geojson_file TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (dataset_id) REFERENCES datasets (id)
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY,
                dataset_id TEXT NOT NULL,
                status TEXT NOT NULL,
                stage TEXT NOT NULL,
                progress INTEGER NOT NULL,
                message TEXT NOT NULL,
                result_json TEXT,
                error TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        conn.commit()


def save_dataset_to_db(
    dataset_id: str,
    filename: str,
    source_format: str,
    kind: str,
    gdf: gpd.GeoDataFrame,
    schema_profile: Dict[str, Any],
    raster_bytes: Optional[bytes] = None,
    created_at: Optional[str] = None,
) -> None:
    init_db()
    geojson_file = f"{dataset_id}.geojson"
    geojson_path = GEOJSON_DIR / geojson_file
    gdf.to_crs("EPSG:4326").to_file(geojson_path, driver="GeoJSON")

    raster_file = None
    if raster_bytes:
        raster_file = f"{dataset_id}.tif"
        (RASTER_DIR / raster_file).write_bytes(raster_bytes)

    bounds = [float(v) for v in gdf.total_bounds] if not gdf.empty else [0.0, 0.0, 0.0, 0.0]

    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO datasets 
            (id, filename, source_format, kind, feature_count, crs, bounds_json, schema_profile_json, geojson_file, raster_file, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            dataset_id,
            filename,
            source_format,
            kind,
            int(len(gdf)),
            str(gdf.crs),
            json.dumps(bounds),
            json.dumps(schema_profile),
            geojson_file,
            raster_file,
            created_at or "",
        ))
        conn.commit()


def save_harmonization_to_db(
    harmonize_id: str,
    dataset_id: str,
    feature_count: int,
    removed_slivers: int,
    overlap_fixes: int,
    snapped_nodes: int,
    mean_snap_distance_m: float,
    confidence: Dict[str, Any],
    meta: Dict[str, Any],
    harmonized_gdf: gpd.GeoDataFrame,
    conflict_geojson: Dict[str, Any],
    created_at: str,
) -> None:
    init_db()
    geojson_file = f"harmonized_{harmonize_id}.geojson"
    harmonized_gdf.to_crs("EPSG:4326").to_file(GEOJSON_DIR / geojson_file, driver="GeoJSON")

    conflict_file = f"conflicts_{harmonize_id}.geojson"
    (GEOJSON_DIR / conflict_file).write_text(json.dumps(conflict_geojson), encoding="utf-8")

    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO harmonizations
            (id, dataset_id, feature_count, removed_slivers, overlap_fixes, snapped_nodes, mean_snap_distance_m, confidence_json, meta_json, geojson_file, conflict_geojson_file, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            harmonize_id,
            dataset_id,
            feature_count,
            removed_slivers,
            overlap_fixes,
            snapped_nodes,
            mean_snap_distance_m,
            json.dumps(confidence),
            json.dumps(meta),
            geojson_file,
            conflict_file,
            created_at,
        ))
        conn.commit()


def list_persisted_datasets() -> List[Dict[str, Any]]:
    init_db()
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM datasets ORDER BY created_at DESC")
        rows = cursor.fetchall()
        return [
            {
                "id": row["id"],
                "filename": row["filename"],
                "source_format": row["source_format"],
                "kind": row["kind"],
                "feature_count": row["feature_count"],
                "crs": row["crs"],
                "bounds": json.loads(row["bounds_json"]),
                "schema_profile": json.loads(row["schema_profile_json"]),
                "has_raster": bool(row["raster_file"]),
                "created_at": row["created_at"],
            }
            for row in rows
        ]
