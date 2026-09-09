'use client';

import { useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Database,
  FileUp,
  Layers,
  Loader2,
  Map,
  Mountain,
  Radar,
  ScanLine,
  Table2,
  X,
  Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { extractRasterFeatures, getRasterInfo, isBackendUploadFile, uploadFiles } from '@/lib/api';
import { useBackendSession } from '@/lib/backend-session';
import { SchemaProfiler } from '@/components/dashboard/schema-profiler';
import { type HarmonizationRun, type UploadItem } from '@/lib/parcels';

interface SidebarProps {
  onRunHarmonization: () => void;
  harmonizationRun: HarmonizationRun;
  uploads: UploadItem[];
  onUploadsChange: React.Dispatch<React.SetStateAction<UploadItem[]>>;
}

const SOURCES = [
  {
    type: 'geotiff' as const,
    label: 'Drone / ORI / DSM / DTM',
    detail: 'GeoTIFF Orthomosaic & Elevation Grid',
    accept: '.tif,.tiff',
    Icon: Radar,
  },
  {
    type: 'shapefile' as const,
    label: 'Cadastral / Municipal / Utility',
    detail: 'GeoJSON or complete Shapefile set (.shp, .shx, .dbf, .prj)',
    accept: '.geojson,.json,.shp,.shx,.dbf,.prj,.cpg',
    Icon: Map,
  },
  {
    type: 'csv' as const,
    label: 'GNSS / CORS / Revenue RoR',
    detail: 'CSV with WKT or Lat/Lon coordinate logs',
    accept: '.csv',
    Icon: Table2,
  },
];

export function Sidebar({ onRunHarmonization, harmonizationRun, uploads, onUploadsChange }: SidebarProps) {
  const input = useRef<HTMLInputElement>(null);
  const [activeType, setActiveType] = useState<UploadItem['type']>('shapefile');
  const [extracting, setExtracting] = useState(false);

  const backend = useBackendSession();
  const running = harmonizationRun.status === 'running';

  async function selectFiles(files: FileList | null) {
    const selected = Array.from(files || []).filter(isBackendUploadFile);
    if (!selected.length) return;

    const id = `upload-${Date.now()}`;
    const item: UploadItem = {
      id,
      name: selected.map((file) => file.name).join(', '),
      type: activeType,
      size: `${(selected.reduce((sum, file) => sum + file.size, 0) / 1024 / 1024).toFixed(1)} MB`,
      status: 'processing',
      progress: 20,
    };
    onUploadsChange((items) => [...items, item]);

    try {
      const data = await uploadFiles(selected);
      backend.recordUpload(data);

      // If GeoTIFF, fetch real raster rendering coordinates & metadata
      if (data.source_format === 'geotiff') {
        try {
          const rInfo = await getRasterInfo(data.dataset_id);
          backend.setRasterInfo(rInfo);
        } catch (e) {
          // Fallback if raster info cannot be parsed
        }
      }

      onUploadsChange((items) =>
        items.map((entry) =>
          entry.id === id
            ? { ...entry, status: 'done', progress: 100, records: data.feature_count }
            : entry,
        ),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed';
      backend.recordError(message);
      onUploadsChange((items) =>
        items.map((entry) => (entry.id === id ? { ...entry, status: 'error', progress: 0 } : entry)),
      );
    }
  }

  const handleRunExtraction = async () => {
    if (!backend.lastDatasetId || extracting) return;
    setExtracting(true);
    try {
      const extraction = await extractRasterFeatures({ dataset_id: backend.lastDatasetId });
      backend.recordExtraction(extraction);
    } catch (e) {
      backend.recordError(e instanceof Error ? e.message : 'Feature extraction failed');
    } finally {
      setExtracting(false);
    }
  };

  return (
    <aside className="flex h-full w-[320px] flex-col border-r border-border bg-sidebar/90 backdrop-blur-xl shadow-2xl">
      {/* Brand Header */}
      <div className="border-b border-border px-5 py-4 bg-card/30">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-none bg-primary font-bold text-black text-xs">
            SS
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-foreground">
              SpatialShift <span className="text-primary">AI</span>
            </h1>
            <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-semibold">
              GeoAI Land Record Harmonization
            </p>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scrollbar-thin">
        {/* Ingest Section */}
        <div>
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-primary" />
              <span>Multi-Source Ingest</span>
            </h2>
            <Badge variant="secondary" className="font-mono text-[10px]">
              {uploads.length} Layers
            </Badge>
          </div>

          <div className="space-y-2">
            {SOURCES.map(({ type, label, detail, accept, Icon }) => (
              <button
                key={type}
                onClick={() => {
                  setActiveType(type);
                  if (input.current) {
                    input.current.accept = accept;
                    input.current.click();
                  }
                }}
                className="flex w-full items-center gap-3 border border-border/80 bg-card/40 p-2.5 text-left transition-all hover:border-primary hover:bg-card/80 group"
              >
                <div className="flex h-8 w-8 items-center justify-center border border-border/60 bg-muted/40 text-primary group-hover:border-primary/50">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold text-foreground">{label}</span>
                  <span className="block text-[10px] text-muted-foreground truncate">{detail}</span>
                </div>
              </button>
            ))}
          </div>

          <input
            ref={input}
            type="file"
            multiple
            className="hidden"
            onChange={(event) => {
              void selectFiles(event.target.files);
              event.currentTarget.value = '';
            }}
          />
        </div>

        {/* Uploaded Datasets List */}
        {uploads.length > 0 && (
          <div className="space-y-2">
            <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
              Ingested Sources
            </div>
            {uploads.map((item) => (
              <div key={item.id} className="border border-border/80 bg-card/50 p-2.5 text-xs space-y-1">
                <div className="flex items-center gap-2">
                  {item.status === 'processing' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />
                  ) : item.status === 'done' ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertCircle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                  )}
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground text-[11px]">
                    {item.name}
                  </span>
                  <button
                    onClick={() => onUploadsChange((items) => items.filter((entry) => entry.id !== item.id))}
                    title="Remove upload"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <Progress value={item.progress} className="h-1 bg-muted" />
                {item.records !== undefined && (
                  <div className="flex justify-between text-[9px] text-muted-foreground font-mono">
                    <span>{item.records} features</span>
                    <span>{item.size}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Schema Profiler Output */}
        {backend.lastUpload?.schema_profile && (
          <SchemaProfiler
            profile={backend.lastUpload.schema_profile}
            filename={backend.lastUpload.filename}
          />
        )}

        {/* Classical CV Feature Extraction Trigger (Honest Labeling) */}
        {backend.lastUpload?.source_format === 'geotiff' && (
          <div className="border border-purple-500/30 bg-purple-500/5 p-3 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-purple-300">
              <span className="flex items-center gap-1.5">
                <ScanLine className="h-3.5 w-3.5" />
                <span>Imagery Boundary Extraction</span>
              </span>
              <Badge variant="outline" className="text-[8px] border-purple-500/40 text-purple-300">
                Classical CV Fallback
              </Badge>
            </div>
            <p className="text-[10px] text-muted-foreground leading-snug">
              Extracts high-gradient edge contours from raster pixels as polygon candidates.
            </p>
            <Button
              size="sm"
              variant="outline"
              disabled={extracting}
              onClick={handleRunExtraction}
              className="w-full gap-1.5 text-xs border-purple-500/40 hover:bg-purple-500/10 text-purple-300"
            >
              {extracting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanLine className="h-3.5 w-3.5" />}
              <span>{extracting ? 'Extracting Edges...' : 'Extract Candidate Boundaries'}</span>
            </Button>
            {backend.lastExtraction && (
              <div className="text-[9px] font-mono text-emerald-400">
                ? {backend.lastExtraction.feature_count} candidate boundaries extracted
              </div>
            )}
          </div>
        )}

        {/* Harmonization In-Flight Box */}
        {running && (
          <div className="border border-primary/40 bg-primary/10 p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-primary">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>{harmonizationRun.stage}</span>
            </div>
            <Progress value={harmonizationRun.progress} className="h-1.5" />
            <p className="text-[9px] text-muted-foreground/80 font-mono">
              Live backend processing stage: {harmonizationRun.progress}%
            </p>
          </div>
        )}
      </div>

      {/* Action Footer */}
      <div className="border-t border-border p-4 bg-card/40">
        <Button
          onClick={onRunHarmonization}
          disabled={running || !backend.lastDatasetId}
          className="w-full gap-2 text-xs font-semibold shadow-lg"
        >
          <Zap className="h-4 w-4" />
          <span>{running ? 'Processing Pipeline...' : 'Run Spatial Harmonization'}</span>
        </Button>
      </div>
    </aside>
  );
}
