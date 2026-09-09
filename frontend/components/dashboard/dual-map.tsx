'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Map as MLMap,
  setWorkerUrl,
  type Map as MLMapType,
  type MapGeoJSONFeature,
  type MapMouseEvent,
  type StyleSpecification,
  type LngLatBoundsLike,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  Compass,
  Eye,
  Layers,
  Maximize2,
  Minimize2,
  Sliders,
  ZoomIn,
  ZoomOut,
  Mountain,
  Plane,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { getRasterPreviewUrl, type GeoJsonCollection, type RasterInfo } from '@/lib/api';

if (typeof window !== 'undefined' && typeof setWorkerUrl === 'function') {
  try {
    setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');
  } catch (e) {
    // Ignore worker URL fallback
  }
}

interface DualMapProps {
  harmonized: boolean;
  selectedParcelId: string | null;
  onSelectParcel: (id: string | null) => void;
  sourceGeojson?: GeoJsonCollection;
  harmonizedGeojson?: GeoJsonCollection;
  conflictGeojson?: GeoJsonCollection;
  extractionGeojson?: GeoJsonCollection;
  rasterDatasetId?: string | null;
  rasterInfo?: RasterInfo | null;
}

const EMPTY: GeoJsonCollection = { type: 'FeatureCollection', features: [] };

function buildStyle(
  data: GeoJsonCollection,
  isFinal: boolean,
  conflicts: GeoJsonCollection = EMPTY,
  extractions: GeoJsonCollection = EMPTY,
  showChoropleth: boolean = true,
): StyleSpecification {
  return {
    version: 8,
    sources: {
      parcels: { type: 'geojson', data },
      conflicts: { type: 'geojson', data: conflicts },
      extractions: { type: 'geojson', data: extractions },
    },
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: {
          'background-color': isFinal ? '#07131d' : '#140f08',
        },
      },
      // Grid lines / Dark base cartography
      {
        id: 'grid-lines',
        type: 'background',
        paint: {
          'background-color': isFinal ? '#0b1b28' : '#1a140c',
          'background-opacity': 0.4,
        },
      },
      // Extraction candidate boundaries (Classical CV)
      {
        id: 'extractions-fill',
        type: 'fill',
        source: 'extractions',
        paint: {
          'fill-color': '#a855f7',
          'fill-opacity': 0.25,
        },
      },
      {
        id: 'extractions-line',
        type: 'line',
        source: 'extractions',
        paint: {
          'line-color': '#c084fc',
          'line-width': 1.2,
          'line-dasharray': [2, 2],
        },
      },
      // Main Parcel Fill with confidence choropleth
      {
        id: 'parcel-fill',
        type: 'fill',
        source: 'parcels',
        paint: {
          'fill-color': isFinal
            ? showChoropleth
              ? [
                  'interpolate',
                  ['linear'],
                  ['coalesce', ['get', 'confidence'], 75],
                  0,
                  '#ef4444',
                  50,
                  '#f59e0b',
                  75,
                  '#38bdf8',
                  90,
                  '#22c55e',
                ]
              : '#0284c7'
            : '#b45309',
          'fill-opacity': isFinal ? 0.42 : 0.28,
        },
      },
      // Parcel Boundaries
      {
        id: 'parcel-line',
        type: 'line',
        source: 'parcels',
        paint: {
          'line-color': isFinal ? '#7dd3fc' : '#fbbf24',
          'line-width': isFinal ? 1.8 : 1.2,
          'line-opacity': 0.95,
        },
      },
      // Conflict highlight fill & boundary
      {
        id: 'conflict-fill',
        type: 'fill',
        source: 'conflicts',
        paint: {
          'fill-color': '#dc2626',
          'fill-opacity': 0.5,
        },
      },
      {
        id: 'conflict-line',
        type: 'line',
        source: 'conflicts',
        paint: {
          'line-color': '#f87171',
          'line-width': 2.4,
          'line-opacity': 0.95,
        },
      },
    ],
  };
}

function getFeatureBounds(feature: GeoJSON.Feature): [number, number, number, number] | null {
  const geom = feature.geometry;
  if (!geom) return null;
  let coords: number[][] = [];
  if (geom.type === 'Polygon') {
    coords = geom.coordinates.flat();
  } else if (geom.type === 'MultiPolygon') {
    coords = geom.coordinates.flat(2);
  } else if (geom.type === 'Point') {
    return [geom.coordinates[0], geom.coordinates[1], geom.coordinates[0], geom.coordinates[1]];
  }
  if (!coords.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of coords) {
    if (c[0] < minX) minX = c[0];
    if (c[1] < minY) minY = c[1];
    if (c[0] > maxX) maxX = c[0];
    if (c[1] > maxY) maxY = c[1];
  }
  return [minX, minY, maxX, maxY];
}

function getCollectionBounds(fc: GeoJsonCollection): [number, number, number, number] | null {
  if (!fc.features.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const f of fc.features) {
    const b = getFeatureBounds(f);
    if (b) {
      if (b[0] < minX) minX = b[0];
      if (b[1] < minY) minY = b[1];
      if (b[2] > maxX) maxX = b[2];
      if (b[3] > maxY) maxY = b[3];
    }
  }
  return minX === Infinity ? null : [minX, minY, maxX, maxY];
}

function parcelId(feature: MapGeoJSONFeature): string | null {
  const properties = feature.properties || {};
  const value = properties.parcel_id ?? properties.id ?? properties.ulpin ?? properties.survey ?? properties.khasra;
  return value === undefined || value === null ? null : String(value);
}

export function DualMap({
  harmonized,
  selectedParcelId,
  onSelectParcel,
  sourceGeojson,
  harmonizedGeojson,
  conflictGeojson,
  extractionGeojson,
  rasterDatasetId,
  rasterInfo,
}: DualMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const leftElement = useRef<HTMLDivElement>(null);
  const rightElement = useRef<HTMLDivElement>(null);
  const left = useRef<MLMapType | null>(null);
  const right = useRef<MLMapType | null>(null);

  const [split, setSplit] = useState(50);
  const [singleView, setSingleView] = useState(false);
  const [showRaster, setShowRaster] = useState(true);
  const [rasterOpacity, setRasterOpacity] = useState(0.85);
  const [showChoropleth, setShowChoropleth] = useState(true);
  const [showConflicts, setShowConflicts] = useState(true);

  const dragging = useRef(false);
  const syncing = useRef(false);

  const raw = sourceGeojson || EMPTY;
  const final = harmonizedGeojson || EMPTY;
  const conflicts = conflictGeojson || EMPTY;
  const extractions = extractionGeojson || EMPTY;

  const updateRasterLayer = useCallback((map: MLMapType | null) => {
    if (!map || !map.isStyleLoaded() || !rasterDatasetId || !rasterInfo) return;
    try {
      if (map.getLayer('raster-imagery-layer')) map.removeLayer('raster-imagery-layer');
      if (map.getSource('raster-imagery')) map.removeSource('raster-imagery');

      if (showRaster) {
        map.addSource('raster-imagery', {
          type: 'image',
          url: getRasterPreviewUrl(rasterDatasetId),
          coordinates: rasterInfo.coordinates_wgs84,
        });

        // Insert raster above background but below vectors
        const firstVectorLayer = map.getLayer('parcel-fill') ? 'parcel-fill' : undefined;
        map.addLayer(
          {
            id: 'raster-imagery-layer',
            type: 'raster',
            source: 'raster-imagery',
            paint: {
              'raster-opacity': rasterOpacity,
              'raster-fade-duration': 0,
            },
          },
          firstVectorLayer,
        );
      }
    } catch (e) {
      // Ignore raster render errors
    }
  }, [rasterDatasetId, rasterInfo, showRaster, rasterOpacity]);

  // Initialize MapLibre instances
  useEffect(() => {
    if (!leftElement.current || !rightElement.current || left.current) return;
    const center: [number, number] = [73.8567, 18.5204];

    const makeMap = (element: HTMLDivElement, data: GeoJsonCollection, isFinal: boolean) =>
      new MLMap({
        container: element,
        style: buildStyle(data, isFinal, isFinal && showConflicts ? conflicts : EMPTY, extractions, showChoropleth),
        center,
        zoom: 15,
        attributionControl: false,
        dragRotate: true,
        pitch: 15,
      });

    const legacy = makeMap(leftElement.current, raw, false);
    const harmonizedMap = makeMap(rightElement.current, final, true);
    left.current = legacy;
    right.current = harmonizedMap;

    const sync = (from: MLMapType, to: MLMapType) => {
      if (syncing.current) return;
      syncing.current = true;
      to.jumpTo({
        center: from.getCenter(),
        zoom: from.getZoom(),
        bearing: from.getBearing(),
        pitch: from.getPitch(),
      });
      syncing.current = false;
    };

    legacy.on('move', () => sync(legacy, harmonizedMap));
    harmonizedMap.on('move', () => sync(harmonizedMap, legacy));

    const select = (event: MapMouseEvent & { features?: MapGeoJSONFeature[] }) =>
      onSelectParcel(event.features?.[0] ? parcelId(event.features[0]) : null);

    legacy.on('click', 'parcel-fill', select);
    harmonizedMap.on('click', 'parcel-fill', select);

    [legacy, harmonizedMap].forEach((map) => {
      map.on('mouseenter', 'parcel-fill', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'parcel-fill', () => {
        map.getCanvas().style.cursor = '';
      });
      map.on('load', () => updateRasterLayer(map));
    });

    return () => {
      legacy.remove();
      harmonizedMap.remove();
      left.current = null;
      right.current = null;
    };
  }, []);

  // Update styles on data change
  useEffect(() => {
    const replace = (map: MLMapType | null, data: GeoJsonCollection, isFinal: boolean) => {
      if (!map) return;
      map.setStyle(buildStyle(data, isFinal, isFinal && showConflicts ? conflicts : EMPTY, extractions, showChoropleth));
      map.once('style.load', () => {
        updateRasterLayer(map);
      });
    };
    replace(left.current, raw, false);
    replace(right.current, final, true);
  }, [raw, final, conflicts, extractions, harmonized, showChoropleth, showConflicts, updateRasterLayer]);

  // Update raster layers when raster props change
  useEffect(() => {
    updateRasterLayer(left.current);
    updateRasterLayer(right.current);
  }, [updateRasterLayer]);

  // Zoom to fit bounds when data arrives
  useEffect(() => {
    const targetBounds = getCollectionBounds(final.features.length ? final : raw) ||
      (rasterInfo ? [rasterInfo.bounds_wgs84[0], rasterInfo.bounds_wgs84[1], rasterInfo.bounds_wgs84[2], rasterInfo.bounds_wgs84[3]] : null);

    if (targetBounds) {
      const boundsLike: LngLatBoundsLike = [
        [targetBounds[0], targetBounds[1]],
        [targetBounds[2], targetBounds[3]],
      ];
      [left.current, right.current].forEach((map) => {
        if (map) {
          map.fitBounds(boundsLike, { padding: 40, maxZoom: 18, duration: 1000 });
        }
      });
    }
  }, [raw.features.length, final.features.length, rasterInfo]);

  // Focus & highlight selected parcel
  useEffect(() => {
    const collection = harmonized && final.features.length ? final : raw;
    const feature = collection.features.find((item) => {
      const properties = (item.properties || {}) as Record<string, unknown>;
      return (
        String(properties.parcel_id ?? properties.id ?? properties.ulpin ?? properties.survey ?? properties.khasra ?? '') ===
        selectedParcelId
      );
    });

    [left.current, right.current].forEach((map) => {
      if (!map || !map.isStyleLoaded()) return;
      if (map.getLayer('selected')) map.removeLayer('selected');
      if (map.getSource('selected')) map.removeSource('selected');
      if (!feature) return;

      map.addSource('selected', { type: 'geojson', data: feature as GeoJSON.Feature });
      map.addLayer({
        id: 'selected',
        type: 'line',
        source: 'selected',
        paint: { 'line-color': '#f8fafc', 'line-width': 3.5 },
      });

      const bounds = getFeatureBounds(feature);
      if (bounds) {
        map.fitBounds(
          [
            [bounds[0], bounds[1]],
            [bounds[2], bounds[3]],
          ],
          { padding: 120, maxZoom: 19, duration: 800 },
        );
      }
    });
  }, [selectedParcelId, raw, final, harmonized]);

  const beginDrag = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    dragging.current = true;
    const move = (moveEvent: MouseEvent) => {
      if (!container.current || !dragging.current) return;
      const rect = container.current.getBoundingClientRect();
      setSplit(Math.min(95, Math.max(5, ((moveEvent.clientX - rect.left) / rect.width) * 100)));
    };
    const end = () => {
      dragging.current = false;
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', end);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', end);
  }, []);

  return (
    <div ref={container} className="relative h-full w-full overflow-hidden bg-background">
      {/* Left side: Source Map */}
      <div
        className="absolute inset-0"
        style={{ clipPath: singleView ? 'none' : `inset(0 ${100 - split}% 0 0)` }}
      >
        <div ref={leftElement} className="absolute inset-0" />
      </div>

      {/* Right side: Harmonized Map */}
      {!singleView && (
        <div
          className="absolute inset-0"
          style={{ clipPath: `inset(0 0 0 ${split}%)` }}
        >
          <div ref={rightElement} className="absolute inset-0" />
        </div>
      )}

      {/* Interactive Divider Handle */}
      {!singleView && (
        <div
          className="absolute inset-y-0 z-20 cursor-ew-resize border-l-2 border-primary shadow-[0_0_15px_rgba(56,189,248,0.5)]"
          style={{ left: `${split}%` }}
          onMouseDown={beginDrag}
          title="Drag to compare Source vs Harmonized"
        >
          <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex h-8 w-4 items-center justify-center bg-primary text-black text-[9px] font-bold">
            ?
          </div>
        </div>
      )}

      {/* Floating Badges & Legend */}
      <div className="absolute left-3 top-3 z-10 flex flex-col gap-1.5 text-[10px]">
        <div className="border border-border/80 bg-card/90 backdrop-blur-md px-2.5 py-1 text-amber-300 flex items-center gap-1.5 font-semibold shadow-md">
          <Layers className="h-3.5 w-3.5 text-amber-400" />
          <span>Source Input Geometry</span>
        </div>
        {!singleView && (
          <div className="border border-border/80 bg-card/90 backdrop-blur-md px-2.5 py-1 text-sky-300 flex items-center gap-1.5 font-semibold shadow-md">
            <Layers className="h-3.5 w-3.5 text-sky-400" />
            <span>Harmonized Cadastre</span>
          </div>
        )}
        {rasterInfo && (
          <div className="border border-border/80 bg-card/90 backdrop-blur-md px-2.5 py-1 text-emerald-300 flex items-center gap-1.5 font-semibold shadow-md">
            {rasterInfo.is_elevation ? (
              <Mountain className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <Plane className="h-3.5 w-3.5 text-emerald-400" />
            )}
            <span>{rasterInfo.is_elevation ? 'DSM Elevation / Hillshade Layer' : 'Drone Orthomosaic (RGB)'}</span>
          </div>
        )}
      </div>

      {/* Map Control Toolbar */}
      <div className="absolute right-3 top-3 z-10 flex flex-col gap-1">
        <Control title="Zoom In" onClick={() => left.current?.zoomIn()}>
          <ZoomIn className="h-4 w-4" />
        </Control>
        <Control title="Zoom Out" onClick={() => left.current?.zoomOut()}>
          <ZoomOut className="h-4 w-4" />
        </Control>
        <Control title="Reset North" onClick={() => left.current?.resetNorth()}>
          <Compass className="h-4 w-4" />
        </Control>
        <Control
          title={singleView ? 'Split Comparison View' : 'Single Full Map'}
          onClick={() => setSingleView(!singleView)}
        >
          {singleView ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
        </Control>

        {/* Layer Controls Popover */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              title="Layer & Rendering Settings"
              className="flex h-8 w-8 items-center justify-center border border-border bg-card/90 text-muted-foreground hover:text-primary hover:border-primary shadow-md backdrop-blur-md"
            >
              <Sliders className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent side="left" className="w-64 border-border bg-card/95 backdrop-blur-xl p-3 text-xs space-y-3">
            <h4 className="font-semibold text-foreground border-b border-border/60 pb-1 flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-primary" />
              <span>Map Layer Controls</span>
            </h4>

            {rasterInfo && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-foreground">
                    {rasterInfo.is_elevation ? 'DSM Hillshade' : 'Drone Ortho'}
                  </span>
                  <Switch checked={showRaster} onCheckedChange={setShowRaster} />
                </div>
                {showRaster && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[9px] text-muted-foreground">
                      <span>Opacity</span>
                      <span>{(rasterOpacity * 100).toFixed(0)}%</span>
                    </div>
                    <Slider
                      value={[rasterOpacity]}
                      min={0.1}
                      max={1}
                      step={0.05}
                      onValueChange={(v) => setRasterOpacity(v[0])}
                    />
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-foreground">Confidence Choropleth</span>
              <Switch checked={showChoropleth} onCheckedChange={setShowChoropleth} />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-foreground">Conflict Overlays</span>
              <Switch checked={showConflicts} onCheckedChange={setShowConflicts} />
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {!raw.features.length && !rasterInfo && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
          No backend-ingested geometry or raster imagery to display
        </div>
      )}
    </div>
  );
}

function Control({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center border border-border bg-card/90 text-muted-foreground hover:text-primary hover:border-primary shadow-md backdrop-blur-md"
    >
      {children}
    </button>
  );
}
