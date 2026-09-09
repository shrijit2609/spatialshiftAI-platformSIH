'use client';

import { useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, FileUp, Loader2, Map, Radar, Table2, X, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { isBackendUploadFile, uploadFiles } from '@/lib/api';
import { useBackendSession } from '@/lib/backend-session';
import { type HarmonizationRun, type UploadItem } from '@/lib/parcels';

interface SidebarProps {
  onRunHarmonization: () => void;
  harmonizationRun: HarmonizationRun;
  uploads: UploadItem[];
  onUploadsChange: React.Dispatch<React.SetStateAction<UploadItem[]>>;
}

const SOURCES = [
  { type: 'geotiff' as const, label: 'ORI / DSM / DTM', detail: 'GeoTIFF footprint and metadata', accept: '.tif,.tiff', Icon: Radar },
  { type: 'shapefile' as const, label: 'Cadastral / municipal / utility', detail: 'GeoJSON or complete Shapefile set', accept: '.geojson,.json,.shp,.shx,.dbf,.prj,.cpg', Icon: Map },
  { type: 'csv' as const, label: 'Ground truth / GNSS / revenue', detail: 'CSV with WKT or latitude and longitude', accept: '.csv', Icon: Table2 },
];

export function Sidebar({ onRunHarmonization, harmonizationRun, uploads, onUploadsChange }: SidebarProps) {
  const input = useRef<HTMLInputElement>(null);
  const [activeType, setActiveType] = useState<UploadItem['type']>('shapefile');
  const backend = useBackendSession();
  const running = harmonizationRun.status === 'running';

  async function selectFiles(files: FileList | null) {
    const selected = Array.from(files || []).filter(isBackendUploadFile);
    if (!selected.length) return;
    const id = `upload-${Date.now()}`;
    const item: UploadItem = {
      id, name: selected.map((file) => file.name).join(', '), type: activeType,
      size: `${(selected.reduce((sum, file) => sum + file.size, 0) / 1024 / 1024).toFixed(1)} MB`,
      status: 'processing', progress: 0,
    };
    onUploadsChange((items) => [...items, item]);
    try {
      const data = await uploadFiles(selected);
      backend.recordUpload(data);
      onUploadsChange((items) => items.map((entry) => entry.id === id ? { ...entry, status: 'done', progress: 100, records: data.feature_count } : entry));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed';
      backend.recordError(message);
      onUploadsChange((items) => items.map((entry) => entry.id === id ? { ...entry, status: 'error', progress: 0 } : entry));
    }
  }

  return (
    <aside className="flex h-full w-[300px] flex-col border-r border-border bg-sidebar/80">
      <div className="border-b border-border px-5 py-4">
        <h1 className="text-sm font-bold text-foreground">SpatialShift <span className="text-primary">AI</span></h1>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Land Record Harmonization</p>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Data Sources</h2><Badge variant="secondary">{uploads.length}</Badge></div>
        <div className="space-y-2">
          {SOURCES.map(({ type, label, detail, accept, Icon }) => (
            <button key={type} onClick={() => { setActiveType(type); if (input.current) { input.current.accept = accept; input.current.click(); } }} className="flex w-full items-center gap-3 border border-dashed border-border p-3 text-left hover:border-primary">
              <Icon className="h-5 w-5 text-primary" />
              <span><span className="block text-xs font-semibold text-foreground">{label}</span><span className="block text-[10px] text-muted-foreground">{detail}</span></span>
            </button>
          ))}
        </div>
        <input ref={input} type="file" multiple className="hidden" onChange={(event) => { void selectFiles(event.target.files); event.currentTarget.value = ''; }} />
        <div className="mt-4 space-y-2">
          {uploads.map((item) => <div key={item.id} className="border border-border bg-card/50 p-2">
            <div className="flex items-center gap-2 text-[10px]">{item.status === 'processing' ? <Loader2 className="h-3 w-3 animate-spin text-primary" /> : item.status === 'done' ? <CheckCircle2 className="h-3 w-3 text-emerald-400" /> : <AlertCircle className="h-3 w-3 text-rose-400" />}<span className="min-w-0 flex-1 truncate">{item.name}</span><button onClick={() => onUploadsChange((items) => items.filter((entry) => entry.id !== item.id))} title="Remove upload"><X className="h-3 w-3" /></button></div>
            <Progress value={item.progress} className="mt-2 h-1" />
            {item.records !== undefined && <p className="mt-1 text-[9px] text-muted-foreground">{item.records} backend-ingested features</p>}
          </div>)}
        </div>
        {running && <div className="mt-4 border border-primary/30 bg-primary/5 p-3"><div className="flex items-center gap-2 text-xs text-primary"><Loader2 className="h-3.5 w-3.5 animate-spin" />{harmonizationRun.stage}</div><Progress value={harmonizationRun.progress} className="mt-2 h-1.5" /></div>}
        {harmonizationRun.status === 'complete' && <div className="mt-4 border border-border p-3 text-[10px] text-muted-foreground">Completed from backend output: {harmonizationRun.parcelsProcessed} features, {harmonizationRun.conflictsFound} topology flags, {harmonizationRun.confidenceAvg.toFixed(1)}% transparent score.</div>}
      </div>
      <div className="border-t border-border p-4"><Button onClick={onRunHarmonization} disabled={running || !backend.lastDatasetId} className="w-full gap-2"><Zap className="h-4 w-4" />{running ? 'Processing backend data' : 'Run Spatial Harmonization'}</Button></div>
    </aside>
  );
}
