from __future__ import annotations

import os

TARGET_CRS = "EPSG:32643"
DEFAULT_ASSUMED_CRS = "EPSG:4326"

# UTM Zone 43N — typical for western/central India cadastral workflows
SLIVER_AREA_M2 = 2.0
SNAP_TOLERANCE_M = 0.75
OVERLAP_AREA_M2 = 0.5

_DEV_CORS_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
]


def get_cors_origins() -> list[str]:
    raw = os.getenv("CORS_ORIGINS", "")
    if not raw.strip():
        return list(_DEV_CORS_ORIGINS)
    if raw.strip() == "*":
        return ["*"]
    origins = list(_DEV_CORS_ORIGINS)
    for part in raw.split(","):
        clean = part.strip().rstrip("/")
        if clean and clean not in origins:
            origins.append(clean)
    return origins


CORS_ORIGINS = get_cors_origins()
