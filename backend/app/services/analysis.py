"""Spatial comparison services used by the harmonization workflow.

IoU is the matching metric for polygonal cadastral features. This follows the
evaluation approach used for extracted-boundary/reference-polygon comparisons;
it is not an ML inference claim.
"""
from __future__ import annotations

from typing import Any

import geopandas as gpd
from shapely.geometry.base import BaseGeometry


def _identifier(row: Any, fallback: int) -> str:
    for name in ("parcel_id", "ulpin", "id", "survey_no", "fid"):
        value = row.get(name) if hasattr(row, "get") else None
        if value is not None and str(value).strip():
            return str(value)
    return f"feature-{fallback + 1}"


def _iou(left: BaseGeometry, right: BaseGeometry) -> float:
    union = left.union(right)
    if union.is_empty or union.area <= 0:
        return 0.0
    return float(left.intersection(right).area / union.area)


def match_layers(
    cadastral: gpd.GeoDataFrame,
    reference: gpd.GeoDataFrame,
    iou_threshold: float = 0.5,
    attribute_fields: list[str] | None = None,
) -> dict[str, Any]:
    """Match each cadastral polygon to its strongest reference overlap."""
    attribute_fields = attribute_fields or []
    candidates = reference[reference.geometry.geom_type.isin(["Polygon", "MultiPolygon"])]
    matches: list[dict[str, Any]] = []
    conflicts: list[dict[str, Any]] = []

    for index, row in cadastral.iterrows():
        geometry = row.geometry
        if geometry is None or geometry.is_empty:
            continue
        best_index = None
        best_score = 0.0
        for ref_index, ref in candidates.iterrows():
            if not geometry.intersects(ref.geometry):
                continue
            score = _iou(geometry, ref.geometry)
            if score > best_score:
                best_index, best_score = ref_index, score

        source_id = _identifier(row, int(index))
        if best_index is None or best_score < iou_threshold:
            conflicts.append({
                "type": "orphan",
                "parcel_id": source_id,
                "message": "No reference feature meets the IoU threshold.",
                "iou": round(best_score, 4),
                "geometry": geometry,
            })
            continue

        reference_row = candidates.loc[best_index]
        reference_id = _identifier(reference_row, int(best_index))
        mismatches = [
            field for field in attribute_fields
            if field in row.index and field in reference_row.index
            and str(row[field]).strip() != str(reference_row[field]).strip()
        ]
        match = {
            "parcel_id": source_id,
            "reference_id": reference_id,
            "iou": round(best_score, 4),
            "attribute_mismatches": mismatches,
        }
        matches.append(match)
        if mismatches:
            conflicts.append({
                "type": "attribute_mismatch",
                "parcel_id": source_id,
                "reference_id": reference_id,
                "message": "Mapped attributes disagree with the matched reference feature.",
                "iou": round(best_score, 4),
                "fields": mismatches,
                "geometry": geometry,
            })

    matched_reference_ids = {m["reference_id"] for m in matches}
    for index, row in candidates.iterrows():
        reference_id = _identifier(row, int(index))
        if reference_id not in matched_reference_ids:
            conflicts.append({
                "type": "unmatched_reference",
                "reference_id": reference_id,
                "message": "Reference feature has no cadastral match.",
                "iou": 0.0,
                "geometry": row.geometry,
            })

    return {
        "iou_threshold": iou_threshold,
        "matches": matches,
        "conflicts": conflicts,
        "matched_count": len(matches),
        "conflict_count": len(conflicts),
    }


def detect_changes(
    baseline: gpd.GeoDataFrame,
    survey: gpd.GeoDataFrame,
    iou_threshold: float = 0.8,
) -> list[dict[str, Any]]:
    """Report added, removed, and materially moved polygon features."""
    result = match_layers(baseline, survey, iou_threshold=iou_threshold)
    changes: list[dict[str, Any]] = []
    matched = {m["parcel_id"]: m for m in result["matches"]}
    for index, row in baseline.iterrows():
        feature_id = _identifier(row, int(index))
        match = matched.get(feature_id)
        if match is None:
            changes.append({"type": "removed_or_unmatched", "feature_id": feature_id, "geometry": row.geometry})
        elif match["iou"] < 0.98:
            changes.append({"type": "geometry_changed", "feature_id": feature_id, "iou": match["iou"], "geometry": row.geometry})

    matched_refs = {m["reference_id"] for m in result["matches"]}
    for index, row in survey.iterrows():
        feature_id = _identifier(row, int(index))
        if feature_id not in matched_refs:
            changes.append({"type": "added_or_unmatched", "feature_id": feature_id, "geometry": row.geometry})
    return changes


def conflict_feature_collection(conflicts: list[dict[str, Any]], crs: str) -> dict[str, Any]:
    records = []
    geometries = []
    for conflict in conflicts:
        geometry = conflict.pop("geometry", None)
        if geometry is not None:
            records.append(conflict)
            geometries.append(geometry)
    if not records:
        return {"type": "FeatureCollection", "features": []}
    return gpd.GeoDataFrame(records, geometry=geometries, crs=crs).to_crs("EPSG:4326").__geo_interface__
