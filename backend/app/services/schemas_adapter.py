"""Per-source schema adaptation and intelligent domain profiler.

Recognizes and harmonizes multi-source schemas across:
- Cadastral / Land Record Parcels (Khasra, Survey No, ULPIN)
- Revenue / RoR (Record of Rights, Khata, Mutation, Encumbrance)
- GNSS / CORS Field Survey Points (PDOP, Fix Status, Accuracy)
- Municipal & Utility Infrastructure (Water, Sewer, Power, Telecom)
- Building Footprints & LiDAR Roof Extrusions
- Ground Truth (GT) Verification Points
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Tuple
import geopandas as gpd
import pandas as pd


SCHEMA_ARCHETYPES = {
    "cadastral": {
        "name": "Cadastral / Land Parcel Fabric",
        "description": "Statutory parcel boundaries with survey numbers, tenure, and ownership.",
        "field_mappings": {
            "parcel_id": ["parcel_id", "parcelid", "khasra", "khasra_no", "khasra_num", "survey_no", "survey_num", "survey_number", "ulpin", "plot_no", "plot_num", "fid", "gid", "id"],
            "owner_name": ["owner", "owner_name", "holder", "occupant", "claimant", "right_holder", "karta", "name"],
            "area_sqm": ["area", "area_sqm", "area_m2", "shape_area", "sq_meters", "rakba", "hectares", "acres"],
            "land_use": ["land_use", "landuse", "classification", "category", "usage", "qism", "zone"],
            "village": ["village", "mauza", "village_name", "tehsil", "taluka", "district"],
        },
    },
    "revenue_ror": {
        "name": "Revenue / Record of Rights (RoR)",
        "description": "Land revenue administration records, khata accounts, and tenure statuses.",
        "field_mappings": {
            "khata_no": ["khata", "khata_no", "khatian", "khatian_no", "account_no", "ledger_id"],
            "mutation_status": ["mutation", "mutation_no", "mut_status", "dakhil_kharij", "status"],
            "tax_demand": ["tax_demand", "revenue_rate", "cess", "assessment", "lagan", "annual_tax"],
            "share_ratio": ["share", "hissa", "ratio", "percentage", "joint_share"],
        },
    },
    "gnss_cors": {
        "name": "GNSS / CORS Differential Survey Logs",
        "description": "Centimeter-accurate satellite positioning points with quality dilution metrics.",
        "field_mappings": {
            "point_id": ["pt_id", "point_id", "pt_num", "name", "station_id", "cors_id", "id"],
            "fix_type": ["fix", "fix_type", "solution", "status", "quality", "rtk_status"],
            "pdop": ["pdop", "hdop", "vdop", "gdop", "dop"],
            "h_accuracy_m": ["h_acc", "h_accuracy", "horz_prec", "hz_err", "sigma_h", "accuracy"],
            "v_accuracy_m": ["v_acc", "v_accuracy", "vert_prec", "vt_err", "sigma_v"],
            "satellites": ["sats", "satellites", "num_sats", "sv_count", "tracked"],
            "antenna_height_m": ["ant_ht", "antenna_height", "inst_ht", "rod_height"],
        },
    },
    "municipal_utility": {
        "name": "Municipal & Utility Infrastructure",
        "description": "Subsurface utilities, water mains, power distribution, and civic assets.",
        "field_mappings": {
            "asset_type": ["asset", "asset_type", "utility", "pipe_type", "line_type", "infra_type"],
            "diameter_mm": ["dia", "diameter", "pipe_dia", "size_mm", "gauge"],
            "material": ["material", "mat", "pipe_mat", "ductile_iron", "pvc", "hdpe"],
            "voltage_kv": ["voltage", "voltage_kv", "kv_rating", "capacity_kv"],
            "dept_code": ["dept", "department", "agency", "owner_dept", "authority"],
        },
    },
    "building_footprint": {
        "name": "Building & Structure Footprints",
        "description": "Physical built structures, wall outlines, and roof boundaries.",
        "field_mappings": {
            "building_id": ["bldg_id", "building_id", "structure_id", "house_no", "osm_id"],
            "height_m": ["height", "height_m", "bldg_height", "elevation_diff"],
            "floors": ["floors", "storeys", "num_floors", "levels"],
            "structure_type": ["structure", "construction", "roof_type", "pucca_kutcha"],
        },
    },
    "ground_truth": {
        "name": "Ground Truth (GT) Verification Survey",
        "description": "Field-validated ground truth control markers and physical inspection logs.",
        "field_mappings": {
            "gt_id": ["gt_id", "ground_id", "marker_id", "monument_id", "fid"],
            "surveyor": ["surveyor", "inspector", "operator", "agency_name", "verified_by"],
            "verification_date": ["date", "survey_date", "insp_date", "timestamp", "epoch"],
            "ground_class": ["class", "ground_class", "verified_status", "pass_fail"],
        },
    },
}


def profile_dataframe_schema(gdf: gpd.GeoDataFrame) -> Dict[str, Any]:
    """Analyze dataframe columns and geometry to profile the source domain and map fields."""
    cols = [str(c).lower().strip() for c in gdf.columns if c != "geometry"]
    geom_types = set(gdf.geometry.geom_type.dropna().unique())

    best_archetype = "generic_vector"
    best_score = 0
    best_mappings: Dict[str, str] = {}

    for arch_key, arch in SCHEMA_ARCHETYPES.items():
        matched_fields = {}
        score = 0
        for std_field, candidates in arch["field_mappings"].items():
            for orig_col in gdf.columns:
                if orig_col == "geometry":
                    continue
                clean = orig_col.lower().strip()
                if clean in candidates or any(c in clean for c in candidates):
                    matched_fields[std_field] = orig_col
                    score += 2 if clean in candidates else 1
                    break
        
        # Geometry-type reinforcement
        if arch_key in ("cadastral", "building_footprint") and any("Polygon" in g for g in geom_types):
            score += 2
        elif arch_key in ("gnss_cors", "ground_truth") and any("Point" in g for g in geom_types):
            score += 2
        elif arch_key == "municipal_utility" and any("Line" in g for g in geom_types):
            score += 2

        if score > best_score:
            best_score = score
            best_archetype = arch_key
            best_mappings = matched_fields

    archetype_info = SCHEMA_ARCHETYPES.get(best_archetype, {
        "name": "Generic Vector Layer",
        "description": "General geospatial vector features without specialized domain tags.",
    })

    unmapped = [c for c in gdf.columns if c != "geometry" and c not in best_mappings.values()]

    return {
        "archetype": best_archetype,
        "archetype_name": archetype_info["name"],
        "description": archetype_info["description"],
        "confidence_pct": min(100, int((best_score / max(1, len(cols) * 2)) * 100)) if cols else 50,
        "mapped_fields": best_mappings,
        "unmapped_fields": unmapped,
        "total_columns": len(cols),
        "geometry_types": list(geom_types),
    }
