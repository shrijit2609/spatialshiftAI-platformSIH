"""Transparent confidence scoring for harmonized cadastral outputs.

This is deliberately rule-based. The project has no labelled production training
set, so presenting a synthetic-data model as ML would be misleading.
"""
from __future__ import annotations

from typing import Any


def _clip(value: float) -> float:
    return float(max(0.0, min(1.0, value)))


def score_harmonization(features: dict[str, float]) -> dict[str, Any]:
    """Score observable geometry-quality signals, returning an explainable breakdown."""
    geometry_validity = _clip(
        features.get("validity", 0.0) * (1.0 - features.get("invalid_ratio", 0.0))
    )
    sliver_cleanliness = _clip(1.0 - features.get("sliver_ratio", 0.0) * 2.0)
    overlap_resolution = 0.92 if features.get("overlap_fixed", 0.0) >= 1.0 else 0.78
    node_snap_quality = _clip(features.get("mean_snap_distance_m", 0.0) / 2.0)
    node_snap_quality = 1.0 - node_snap_quality
    compactness = _clip(features.get("mean_compactness", 0.0) / 0.8)

    score = _clip(
        0.28 * geometry_validity
        + 0.22 * sliver_cleanliness
        + 0.18 * overlap_resolution
        + 0.20 * node_snap_quality
        + 0.12 * compactness
    )
    return {
        "geometry_validity": round(geometry_validity, 4),
        "sliver_cleanliness": round(sliver_cleanliness, 4),
        "overlap_resolution": round(overlap_resolution, 4),
        "node_snap_quality": round(node_snap_quality, 4),
        "compactness": round(compactness, 4),
        "rule_based_score": round(score, 4),
        "score": round(score, 4),
        "model": "transparent_rule_based",
        "methodology": "Observable topology and geometry-quality metrics; no trained model or ground-truth labels are claimed.",
    }
