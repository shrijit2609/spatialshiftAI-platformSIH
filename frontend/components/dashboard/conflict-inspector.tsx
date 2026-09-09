'use client';

import { AlertTriangle, CheckCircle2, Download, PanelRightClose, PanelRightOpen, ScanSearch, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { downloadBlob, exportPDF, type ConfidenceBreakdown, type SpatialConflict } from '@/lib/api';
import { useBackendSession } from '@/lib/backend-session';

interface ConflictInspectorProps {
  collapsed: boolean;
  onToggle: () => void;
  selectedParcelId: string | null;
  onSelectParcel: (id: string | null) => void;
  harmonizationComplete: boolean;
  conflicts: SpatialConflict[];
  featureCount: number;
  confidence: ConfidenceBreakdown | null;
}

export function ConflictInspector({
  collapsed, onToggle, selectedParcelId, onSelectParcel, harmonizationComplete, conflicts, featureCount, confidence,
}: ConflictInspectorProps) {
  const selected = conflicts.find((conflict) => conflict.parcel_id === selectedParcelId || conflict.reference_id === selectedParcelId) || null;
  if (collapsed) {
    return <aside className="flex h-full w-12 flex-col items-center border-l border-border bg-sidebar/80"><button onClick={onToggle} title="Expand conflict inspector" className="flex h-12 w-full items-center justify-center border-b border-border"><PanelRightOpen className="h-5 w-5 text-muted-foreground" /></button><AlertTriangle className="mt-4 h-4 w-4 text-amber-400" /><span className="mt-2 text-[10px] text-muted-foreground">{conflicts.length}</span></aside>;
  }

  return (
    <aside className="flex h-full w-[340px] flex-col border-l border-border bg-sidebar/80">
      <div className="flex items-center justify-between border-b border-border px-4 py-3"><div className="flex items-center gap-2"><ScanSearch className="h-4 w-4 text-primary" /><h2 className="text-sm font-semibold">Conflict Inspector</h2></div><button onClick={onToggle} title="Collapse conflict inspector"><PanelRightClose className="h-4 w-4 text-muted-foreground" /></button></div>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {selected ? <ConflictDetail conflict={selected} onBack={() => onSelectParcel(null)} harmonizationComplete={harmonizationComplete} /> : <Overview conflicts={conflicts} featureCount={featureCount} confidence={confidence} onSelect={onSelectParcel} />}
      </div>
    </aside>
  );
}

function Overview({ conflicts, featureCount, confidence, onSelect }: { conflicts: SpatialConflict[]; featureCount: number; confidence: ConfidenceBreakdown | null; onSelect: (id: string) => void }) {
  const percent = confidence ? confidence.score * 100 : 0;
  return <div className="space-y-4">
    <div className="grid grid-cols-2 gap-2">
      <Metric icon={<ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />} label="Geometry score" value={confidence ? `${percent.toFixed(1)}%` : 'Pending'} />
      <Metric icon={<AlertTriangle className="h-3.5 w-3.5 text-amber-400" />} label="Detected conflicts" value={String(conflicts.length)} />
    </div>
    <div className="border border-border bg-card/50 p-3"><div className="mb-2 flex justify-between text-[10px] text-muted-foreground"><span>Backend-processed features</span><span>{featureCount}</span></div><Progress value={featureCount ? 100 : 0} className="h-1.5" /><p className="mt-2 text-[9px] text-muted-foreground">Score is transparent rule-based geometry quality, not a trained ML prediction.</p></div>
    <section><h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Detected conflicts ({conflicts.length})</h3>{conflicts.length ? <div className="space-y-2">{conflicts.map((conflict, index) => <button key={`${conflict.type}-${index}`} onClick={() => onSelect(conflict.parcel_id || conflict.reference_id || '')} className="w-full border border-border bg-card/50 p-2.5 text-left hover:border-primary"><div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-400" /><div className="min-w-0"><p className="text-[10px] font-semibold text-foreground">{label(conflict.type)}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{conflict.message}</p>{conflict.area_m2 !== undefined && <p className="mt-1 font-mono text-[9px] text-amber-300">{conflict.area_m2.toFixed(3)} m2</p>}</div></div></button>)}</div> : <p className="border border-border p-3 text-[10px] text-muted-foreground">No topology conflicts were detected in the last real backend result.</p>}</section>
  </div>;
}

function ConflictDetail({ conflict, onBack, harmonizationComplete }: { conflict: SpatialConflict; onBack: () => void; harmonizationComplete: boolean }) {
  const { lastDatasetId, recordError } = useBackendSession();
  return <div className="space-y-4"><button onClick={onBack} className="text-[10px] text-primary">Back to detected conflicts</button><div className="border border-amber-500/30 bg-amber-500/5 p-3"><div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-400" /><span className="text-xs font-semibold text-amber-300">{label(conflict.type)}</span></div><p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{conflict.message}</p></div><dl className="space-y-2 text-[10px]"><Row label="Parcel" value={conflict.parcel_id || 'Not applicable'} /><Row label="Reference" value={conflict.reference_id || 'Not applicable'} />{conflict.iou !== undefined && <Row label="IoU" value={conflict.iou.toFixed(3)} />}{conflict.area_m2 !== undefined && <Row label="Area" value={`${conflict.area_m2.toFixed(3)} m2`} />}{conflict.fields?.length ? <Row label="Attributes" value={conflict.fields.join(', ')} /> : null}</dl>{harmonizationComplete && <Button className="w-full gap-2" disabled={Boolean(conflict.parcel_id)} title={conflict.parcel_id ? 'Resolve this conflict before certificate export' : undefined} onClick={() => { if (!lastDatasetId) return; void exportPDF({ dataset_id: lastDatasetId }).then(({ blob, filename }) => downloadBlob(blob, filename)).catch((error: unknown) => recordError(error instanceof Error ? error.message : 'PDF export failed')); }}><Download className="h-4 w-4" />Export certificate</Button>}</div>;
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <div className="border border-border bg-card/50 p-3">{icon}<p className="mt-1 text-lg font-bold font-mono text-foreground">{value}</p><p className="text-[9px] uppercase text-muted-foreground">{label}</p></div>; }
function Row({ label: title, value }: { label: string; value: string }) { return <div className="flex justify-between gap-3 border-b border-border/60 pb-2"><dt className="text-muted-foreground">{title}</dt><dd className="text-right text-foreground">{value}</dd></div>; }
function label(type: string): string { return type.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase()); }
