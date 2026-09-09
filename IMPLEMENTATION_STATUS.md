# Implementation Status and Research Grounding

## What genuinely works

- Vector ingest: GeoJSON, CSV (WKT or coordinate columns), and multi-file Shapefiles are normalized to EPSG:32643.
- Raster ingest: GeoTIFF/ORI/DSM/DTM uploads are opened with Rasterio, their CRS is validated, and an EPSG:32643 footprint with actual width, height, band count, nodata, and source CRS metadata is returned. Pixels are not persisted or rendered as imagery yet.
- Topology correction: polygon validity repair, node snapping, polygonization/overlay, and sliver removal run on uploaded vector data.
- Spatial matching: POST /api/analyze performs polygon IoU matching between two uploaded layers, flags unmatched features and selected attribute disagreements, and returns conflict GeoJSON.
- Change detection: the same endpoint compares a baseline and survey layer and reports added/unmatched, removed/unmatched, and materially changed geometries.
- Confidence: confidence.py is transparent rule-based scoring from measured geometry/topology metrics. It is not ML and makes no trained-model claim.
- Dashboard maps now use backend-returned upload/harmonization GeoJSON. They do not use lib/parcels.ts as their data source.

## Still simplified or not implemented

- No Mask R-CNN checkpoint, trained CV model, or imagery-derived boundary extraction is shipped. Raster support is honest georeferenced footprint/metadata ingest only.
- Raster bytes and datasets remain in memory for the running process only; there is no database, object store, authentication, or multi-user workflow.
- The Conflict Inspector component has legacy prototype presentation code and is not yet wired to /api/analyze results. Use the analysis API response as the source of truth.
- There is no live worker/job event stream yet. The dashboard removes fabricated timer progress and only reports request-in-flight/completed backend state.
- Municipal, utility, GT, GNSS/CORS, revenue, cadastral, and building layers can be ingested as supported vectors. They are not individually schema-adapted yet.
- No external inter-departmental exchange API or production persistence has been implemented.

## Research source use

1. **CadastreVision (Grift, Persello, Koeva, 2024):** used as methodological grounding for the multi-source boundary-to-record pipeline. Its landing page/dataset availability could not be verified from this environment, so no claim is made that its data is integrated.
2. **Tareke, Koeva, Persello (IGARSS 2023):** informs the use of polygon IoU for matching uploaded/extracted boundaries to cadastral reference polygons. This is implemented in services/analysis.py.
3. **Delafontaine et al. (2009):** motivates sliver-polygon detection/cleanup. Current threshold values remain configurable engineering defaults, not paper-calibrated values.
4. **Orenstein (1991):** provides theoretical grounding for overlay/planarization. The implementation uses noded boundaries followed by polygonization.
5. **Automatic Cadastral Boundary Detection Using Mask R-CNN (2023):** informs the intended future feature-extraction architecture. The paper describes Mask R-CNN instance segmentation with geometry post-processing; a suitable compatible checkpoint/reference implementation was not obtained and is therefore not represented as implemented.

## Demo-safe wording

Say: "The prototype accepts georeferenced vector data and GeoTIFF metadata, corrects topology, compares layers with IoU, and produces transparent geometry-quality scores."

Do not say: "AI imagery extraction is integrated," "the CadastreVision dataset is integrated," or "the confidence score is a trained ML model."
