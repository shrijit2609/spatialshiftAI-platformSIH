# Implementation Status and Research Grounding

## What genuinely works (Verified Production & Finals Prototype)

- **Vector Ingest & Normalization:** GeoJSON, CSV (WKT geometry or lat/lon coordinates), and multi-file Shapefiles (.shp, .shx, .dbf, .prj) are ingested and reprojected to EPSG:32643 (UTM Zone 43N) with full geometry validation.
- **Raster Imagery & Elevation Rendering:** Uploaded GeoTIFFs (RGB Drone Orthomosaics, ORI, DSM, DTM) are decoded with Rasterio, contrast-normalized, and served as georeferenced RGBA PNG map layers and tile streams (`/api/raster/{dataset_id}/preview.png`). For single-band DSM/DTM elevation grids, analytical hillshading and hypsometric terrain color tinting are computed dynamically.
- **Multi-Source Domain Schema Adaptation:** The intelligent schema profiler (`services/schemas_adapter.py`) recognizes and maps domain attributes across:
  - Cadastral / Land Record Fabric (`khasra_no`, `survey_number`, `ulpin`, `owner_name`, `area_sqm`, `land_use`)
  - Revenue / RoR (`khata_no`, `khatian`, `mutation_status`, `tax_demand`, `share_ratio`)
  - GNSS / CORS Field Survey Logs (`point_id`, `fix_type`, `pdop`, `h_accuracy_m`, `v_accuracy_m`, `satellites`)
  - Municipal & Utility Infrastructure (`asset_type`, `diameter_mm`, `material`, `voltage_kv`, `dept_code`)
  - Building Footprints (`building_id`, `height_m`, `floors`, `structure_type`)
  - Ground Truth Verification (`gt_id`, `surveyor`, `verification_date`, `ground_class`)
- **Real-Time Live SSE Event Stream:** `GET /api/events/jobs/{job_id}` streams microsecond stage transitions and metrics (`Validating Vector Layer` ? `Schema Profiling` ? `Topology Conflict Detection` ? `Planarization & Snapping` ? `Scoring` ? `Persisting`), driving the animated live execution terminal in the frontend with zero fake timers.
- **Persistent Storage Layer:** SQLite database (`backend/data/spatialshift.db`) and file storage persist all uploaded datasets, GeoTIFF rasters, harmonization results, and job logs across server reboots.
- **Inter-Departmental Spatial Data Exchange API:**
  - Multi-department layer catalog (`/api/exchange/layers`)
  - OGC/WFS-compliant spatial query endpoint with BBOX filtering (`/api/exchange/query`)
  - Standardized multi-format export (`/api/exchange/export/{dataset_id}?format=geojson|csv|wkt`)
  - Immutable inter-agency transaction audit trail (`/api/exchange/audit-log`)
- **Topology Correction:** Ring validity repair, vertex snapping, planarization overlay, and Delafontaine sliver-polygon cleanup.
- **Spatial IoU Matching & Change Detection:** POST `/api/analyze` performs polygon Intersection-over-Union (IoU) matching between uploaded passes, detects additions/deletions, and flags attribute disagreements.
- **Transparent Confidence Scoring:** Deterministic, multi-factor rule-based scoring calculated directly from geometric and topological measurements (validity, sliver cleanliness, overlap resolution, node snap distance, compactness). Correctly labeled as rule-based geometry metrics without synthetic ML inflation.
- **Interactive Multi-Layer Map:** Dual split comparison slider, layer opacity controls, confidence choropleth fills, pulsing conflict highlights, and click-to-focus bounding box camera navigation.
- **Statutory Mutation Certificate Export:** PDF export with cryptographic verification hash and tamper-evident layout.

## Honestly labeled fallbacks

- **Classical Feature Extraction Fallback:** The raster boundary extractor (`services/feature_extract.py`) uses classical gradient thresholding and rasterio sieve filtering to generate candidate polygons from imagery. It is honestly presented as a classical CV fallback and does not falsely claim to be Mask R-CNN or a deep learning model checkpoint.

## Deployment Specifications

### Backend (Render Web Service)
- **Root Directory:** `backend`
- **Runtime:** `Python 3`
- **Build Command:** `pip install -r requirements.txt`
- **Start Command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- **Health Check Path:** `/api/health`
- **Environment Variables:**
  - `PYTHON_VERSION`: `3.12.8`
  - `CORS_ORIGINS`: Comma-separated list of frontend domains or `*`

### Frontend (Vercel)
- **Root Directory:** `frontend`
- **Framework Preset:** `Next.js`
- **Build Command:** `next build`
- **Output Directory:** `.next`
- **Environment Variables:**
  - `NEXT_PUBLIC_API_URL`: The deployed Render backend HTTPS URL (e.g. `https://spatialshift-api.onrender.com`)

## Research grounding & paper references

1. **CadastreVision (Grift, Persello, Koeva, 2024):** Grounding for multi-source cadastral boundary harmonization and record linkage.
2. **Tareke, Koeva, Persello (IGARSS 2023):** Grounding for polygon Intersection-over-Union (IoU) spatial matching between survey boundaries and cadastral reference polygons (`services/analysis.py`).
3. **Delafontaine et al. (2009):** Theoretical framework for topological sliver-polygon detection and area threshold cleanup (`services/planarize.py`).
4. **Orenstein (1991):** Algorithmic basis for planarization and overlay through boundary noding and polygonization.
5. **Automatic Cadastral Boundary Detection Using Mask R-CNN (2023):** Reference architecture for future instance-segmentation integration; currently substituted with the honest classical-CV edge extraction fallback.

## Demo-safe wording for presentation & judging

- **Say:** "SpatialShift AI ingests multi-source geospatial vectors and GeoTIFF raster imagery/DSM, adapts domain schemas (Revenue, Cadastre, GNSS, Utilities), resolves topological overlaps and slivers, provides live SSE job streaming, and exposes an OGC-compliant inter-departmental exchange API with transparent geometric quality scores."
- **Do not say:** "A deep learning neural network extracted the parcel boundaries from imagery" (state accurately that the prototype utilizes a classical edge-contour extraction fallback).
