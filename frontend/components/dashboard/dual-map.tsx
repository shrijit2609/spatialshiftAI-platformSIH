'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Map as MLMap, type Map as MLMapType, type MapGeoJSONFeature, type MapMouseEvent, type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Compass, Layers, ZoomIn, ZoomOut } from 'lucide-react';
import type { GeoJsonCollection } from '@/lib/api';

interface DualMapProps {
  harmonized: boolean;
  selectedParcelId: string | null;
  onSelectParcel: (id: string | null) => void;
  sourceGeojson?: GeoJsonCollection;
  harmonizedGeojson?: GeoJsonCollection;
}

const EMPTY: GeoJsonCollection = { type: 'FeatureCollection', features: [] };

function style(data: GeoJsonCollection, final: boolean): StyleSpecification {
  return {
    version: 8,
    sources: { parcels: { type: 'geojson', data } },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': final ? '#071a25' : '#21170b' } },
      {
        id: 'parcel-fill', type: 'fill', source: 'parcels',
        paint: {
          'fill-color': final
            ? ['interpolate', ['linear'], ['coalesce', ['get', 'confidence'], 75], 0, '#dc2626', 55, '#f59e0b', 75, '#38bdf8', 100, '#22c55e']
            : '#b45309',
          'fill-opacity': final ? 0.36 : 0.25,
        },
      },
      {
        id: 'parcel-line', type: 'line', source: 'parcels',
        paint: { 'line-color': final ? '#7dd3fc' : '#fbbf24', 'line-width': final ? 1.7 : 1.1, 'line-opacity': 0.9 },
      },
    ],
  };
}

function parcelId(feature: MapGeoJSONFeature): string | null {
  const properties = feature.properties || {};
  const value = properties.parcel_id ?? properties.id ?? properties.ulpin;
  return value === undefined || value === null ? null : String(value);
}

export function DualMap({ harmonized, selectedParcelId, onSelectParcel, sourceGeojson, harmonizedGeojson }: DualMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const leftElement = useRef<HTMLDivElement>(null);
  const rightElement = useRef<HTMLDivElement>(null);
  const left = useRef<MLMapType | null>(null);
  const right = useRef<MLMapType | null>(null);
  const [split, setSplit] = useState(50);
  const dragging = useRef(false);
  const syncing = useRef(false);
  const raw = sourceGeojson || EMPTY;
  const final = harmonizedGeojson || EMPTY;

  useEffect(() => {
    if (!leftElement.current || !rightElement.current || left.current) return;
    const center: [number, number] = [78.0358, 27.1609];
    const makeMap = (element: HTMLDivElement, data: GeoJsonCollection, isFinal: boolean) => new MLMap({
      container: element, style: style(data, isFinal), center, zoom: 15, attributionControl: false, dragRotate: false, touchZoomRotate: false,
    });
    const legacy = makeMap(leftElement.current, raw, false);
    const harmonizedMap = makeMap(rightElement.current, final, true);
    left.current = legacy;
    right.current = harmonizedMap;

    const sync = (from: MLMapType, to: MLMapType) => {
      if (syncing.current) return;
      syncing.current = true;
      to.jumpTo({ center: from.getCenter(), zoom: from.getZoom(), bearing: from.getBearing(), pitch: from.getPitch() });
      syncing.current = false;
    };
    legacy.on('move', () => sync(legacy, harmonizedMap));
    harmonizedMap.on('move', () => sync(harmonizedMap, legacy));
    const select = (event: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => onSelectParcel(event.features?.[0] ? parcelId(event.features[0]) : null);
    legacy.on('click', 'parcel-fill', select);
    harmonizedMap.on('click', 'parcel-fill', select);
    [legacy, harmonizedMap].forEach((map) => {
      map.on('mouseenter', 'parcel-fill', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'parcel-fill', () => { map.getCanvas().style.cursor = ''; });
    });
    return () => { legacy.remove(); harmonizedMap.remove(); left.current = null; right.current = null; };
  // MapLibre owns its sources; data is refreshed in the next effect.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const replace = (map: MLMapType | null, data: GeoJsonCollection, isFinal: boolean) => {
      if (!map) return;
      map.setStyle(style(data, isFinal));
    };
    replace(left.current, raw, false);
    replace(right.current, final, true);
  }, [raw, final, harmonized]);

  useEffect(() => {
    const collection = harmonized && final.features.length ? final : raw;
    const feature = collection.features.find((item) => {
      const properties = (item.properties || {}) as Record<string, unknown>;
      return String(properties.parcel_id ?? properties.id ?? properties.ulpin ?? '') === selectedParcelId;
    });
    [left.current, right.current].forEach((map) => {
      if (!map || !map.isStyleLoaded()) return;
      if (map.getLayer('selected')) map.removeLayer('selected');
      if (map.getSource('selected')) map.removeSource('selected');
      if (!feature) return;
      map.addSource('selected', { type: 'geojson', data: feature as GeoJSON.Feature });
      map.addLayer({ id: 'selected', type: 'line', source: 'selected', paint: { 'line-color': '#f8fafc', 'line-width': 3 } });
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
    const end = () => { dragging.current = false; document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', end); };
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', end);
  }, []);

  return (
    <div ref={container} className="relative h-full w-full overflow-hidden bg-background">
      <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}><div ref={leftElement} className="absolute inset-0" /></div>
      <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${split}%)` }}><div ref={rightElement} className="absolute inset-0" /></div>
      <div className="absolute inset-y-0 z-20 cursor-ew-resize border-l-2 border-primary" style={{ left: `${split}%` }} onMouseDown={beginDrag} title="Compare source and harmonized fabric" />
      <div className="absolute left-3 top-3 z-10 space-y-2 text-[10px]">
        <div className="border border-border bg-card/90 px-2 py-1 text-amber-300"><Layers className="mr-1 inline h-3 w-3" />Source data</div>
        <div className="border border-border bg-card/90 px-2 py-1 text-sky-300"><Layers className="mr-1 inline h-3 w-3" />Harmonized fabric</div>
      </div>
      <div className="absolute right-3 top-3 z-10 flex flex-col gap-1">
        <Control title="Zoom in" onClick={() => left.current?.zoomIn()}><ZoomIn className="h-4 w-4" /></Control>
        <Control title="Zoom out" onClick={() => left.current?.zoomOut()}><ZoomOut className="h-4 w-4" /></Control>
        <Control title="Reset north" onClick={() => left.current?.resetNorth()}><Compass className="h-4 w-4" /></Control>
      </div>
      {!raw.features.length && <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">No backend-ingested geometry to display</div>}
    </div>
  );
}

function Control({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return <button title={title} onClick={onClick} className="flex h-8 w-8 items-center justify-center border border-border bg-card/90 text-muted-foreground hover:text-primary">{children}</button>;
}
