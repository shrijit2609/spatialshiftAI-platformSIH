'use client';

import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Filter,
  Layers,
  PanelRightClose,
  PanelRightOpen,
  ScanSearch,
  ShieldCheck,
  Split,
  Tag,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
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
  collapsed,
  onToggle,
  selectedParcelId,
  onSelectParcel,
  harmonizationComplete,
  conflicts,
  featureCount,
  confidence,
}: ConflictInspectorProps) {
  const selected =
    conflicts.find(
      (conflict) => conflict.parcel_id === selectedParcelId || conflict.reference_id === selectedParcelId,
    ) || null;

  if (collapsed) {
    return (
      <aside className="flex h-full w-12 flex-col items-center border-l border-border bg-sidebar/90 backdrop-blur-md">
        <button
          onClick={onToggle}
          title="Expand conflict inspector"
          className="flex h-12 w-full items-center justify-center border-b border-border hover:bg-muted/40"
        >
          <PanelRightOpen className="h-5 w-5 text-muted-foreground" />
        </button>
        <AlertTriangle className="mt-4 h-4 w-4 text-amber-400" />
        <span className="mt-2 text-[10px] font-bold text-amber-400">{conflicts.length}</span>
      </aside>
    );
  }

  return (
    <aside className="flex h-full w-[350px] flex-col border-l border-border bg-sidebar/90 backdrop-blur-xl shadow-2xl">
      <div className="flex items-center justify-between border-b border-border px-4 py-3 bg-card/40">
        <div className="flex items-center gap-2">
          <ScanSearch className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Conflict Inspector</h2>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-400 font-mono">
            {conflicts.length} Issues
          </Badge>
          <button onClick={onToggle} title="Collapse conflict inspector" className="p-1 hover:text-foreground">
            <PanelRightClose className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 scrollbar-thin">
        {selected ? (
          <ConflictDetail
            conflict={selected}
            onBack={() => onSelectParcel(null)}
            harmonizationComplete={harmonizationComplete}
          />
        ) : (
          <Overview
            conflicts={conflicts}
            featureCount={featureCount}
            confidence={confidence}
            selectedParcelId={selectedParcelId}
            onSelect={onSelectParcel}
          />
        )}
      </div>
    </aside>
  );
}

function Overview({
  conflicts,
  featureCount,
  confidence,
  selectedParcelId,
  onSelect,
}: {
  conflicts: SpatialConflict[];
  featureCount: number;
  confidence: ConfidenceBreakdown | null;
  selectedParcelId: string | null;
  onSelect: (id: string) => void;
}) {
  const percent = confidence ? confidence.score * 100 : 0;

  return (
    <div className="space-y-4">
      {/* Top Metrics Grid */}
      <div className="grid grid-cols-2 gap-2">
        <Metric
          icon={<ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />}
          label="Geometry Score"
          value={confidence ? `${percent.toFixed(1)}%` : 'Pending'}
          sub={confidence ? confidence.methodology : 'Awaiting harmonization'}
        />
        <Metric
          icon={<AlertTriangle className="h-3.5 w-3.5 text-amber-400" />}
          label="Detected Conflicts"
          value={String(conflicts.length)}
          sub="Delafontaine / IoU"
        />
      </div>

      {/* Confidence Breakdown Card */}
      {confidence && (
        <div className="border border-border/80 bg-card/60 p-3 space-y-2 text-xs">
          <div className="flex justify-between items-center text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
            <span>Transparent Score Factors</span>
            <span className="text-emerald-400">Rule-Based Metrics</span>
          </div>
          <div className="space-y-1.5 text-[10px]">
            <ScoreRow label="Geometry Validity" value={confidence.geometry_validity * 100} />
            <ScoreRow label="Sliver Cleanliness" value={confidence.sliver_cleanliness * 100} />
            <ScoreRow label="Overlap Resolution" value={confidence.overlap_resolution * 100} />
            <ScoreRow label="Node Snap Quality" value={confidence.node_snap_quality * 100} />
            <ScoreRow label="Compactness" value={confidence.compactness * 100} />
          </div>
        </div>
      )}

      {/* Feature Count Progress */}
      <div className="border border-border bg-card/50 p-3">
        <div className="mb-2 flex justify-between text-[10px] text-muted-foreground">
          <span>Backend Processed Features</span>
          <span className="font-mono font-bold text-foreground">{featureCount}</span>
        </div>
        <Progress value={featureCount ? 100 : 0} className="h-1.5" />
        <p className="mt-2 text-[9px] text-muted-foreground/80 leading-tight">
          Scores are transparent rule-based geometry quality metrics. No synthetic ML claims.
        </p>
      </div>

      {/* Conflicts List */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Detected Conflict Geometry ({conflicts.length})
          </h3>
          <span className="text-[9px] text-primary">Click to Zoom & Focus</span>
        </div>

        {conflicts.length ? (
          <div className="space-y-2">
            {conflicts.map((conflict, index) => {
              const targetId = conflict.parcel_id || conflict.reference_id || `conflict-${index}`;
              const isSelected = selectedParcelId === targetId;

              return (
                <button
                  key={`${conflict.type}-${index}`}
                  onClick={() => onSelect(targetId)}
                  className={`w-full border p-2.5 text-left transition-all ${
                    isSelected
                      ? 'border-primary bg-primary/10 shadow-[0_0_10px_rgba(56,189,248,0.3)]'
                      : 'border-border/80 bg-card/50 hover:border-primary/80 hover:bg-card'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-bold text-foreground">{label(conflict.type)}</p>
                        {conflict.parcel_id && (
                          <span className="font-mono text-[9px] text-sky-300">#{conflict.parcel_id}</span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[10px] text-muted-foreground leading-snug">{conflict.message}</p>
                      <div className="mt-1 flex items-center gap-2 text-[9px] font-mono">
                        {conflict.area_m2 !== undefined && (
                          <span className="text-amber-300">Area: {conflict.area_m2.toFixed(3)} m²</span>
                        )}
                        {conflict.iou !== undefined && (
                          <span className="text-sky-300">IoU: {conflict.iou.toFixed(3)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="border border-border/60 bg-muted/20 p-4 text-center text-[10px] text-muted-foreground">
            <CheckCircle2 className="mx-auto h-5 w-5 text-emerald-400 mb-1" />
            <span>No unresolved topological conflicts in the current harmonized fabric.</span>
          </div>
        )}
      </section>
    </div>
  );
}

function ConflictDetail({
  conflict,
  onBack,
  harmonizationComplete,
}: {
  conflict: SpatialConflict;
  onBack: () => void;
  harmonizationComplete: boolean;
}) {
  const { lastDatasetId, recordError } = useBackendSession();

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-[10px] text-primary hover:underline flex items-center gap-1 font-semibold">
        ? Back to all detected conflicts
      </button>

      <div className="border border-amber-500/40 bg-amber-500/10 p-3.5 shadow-md">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          <span className="text-xs font-bold text-amber-300">{label(conflict.type)}</span>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{conflict.message}</p>
      </div>

      <dl className="space-y-2 text-[10px] border border-border bg-card/40 p-3">
        <Row label="Target Parcel ID" value={conflict.parcel_id || 'Not applicable'} />
        <Row label="Reference Match ID" value={conflict.reference_id || 'Not applicable'} />
        {conflict.iou !== undefined && <Row label="Measured Polygon IoU" value={conflict.iou.toFixed(4)} />}
        {conflict.area_m2 !== undefined && <Row label="Conflict Area" value={`${conflict.area_m2.toFixed(3)} m²`} />}
        {conflict.fields?.length ? <Row label="Mismatched Attributes" value={conflict.fields.join(', ')} /> : null}
      </dl>

      <div className="border border-border/80 bg-background/50 p-3 text-[10px] text-muted-foreground space-y-1">
        <div className="font-semibold text-foreground flex items-center gap-1">
          <Zap className="h-3 w-3 text-primary" />
          <span>Recommended Resolution Action</span>
        </div>
        <p>
          {conflict.type === 'overlap'
            ? 'Run topological planarization with building edge snapping to cleanly split shared vertices.'
            : conflict.type === 'sliver'
            ? 'Merge sliver into adjacent dominant parcel using Delafontaine threshold cleanups.'
            : 'Review statutory ownership logs and confirm cadastral boundary alignment.'}
        </p>
      </div>

      {harmonizationComplete && (
        <Button
          className="w-full gap-2 text-xs"
          onClick={() => {
            if (!lastDatasetId) return;
            void exportPDF({ dataset_id: lastDatasetId })
              .then(({ blob, filename }) => downloadBlob(blob, filename))
              .catch((error: unknown) =>
                recordError(error instanceof Error ? error.message : 'PDF export failed'),
              );
          }}
        >
          <Download className="h-4 w-4" />
          <span>Export Statutory Mutation Certificate</span>
        </Button>
      )}
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="border border-border bg-card/60 p-3">
      <div className="flex items-center justify-between">{icon}</div>
      <p className="mt-1 text-base font-bold font-mono text-foreground">{value}</p>
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
      {sub && <p className="text-[8px] text-muted-foreground/70 mt-0.5 truncate">{sub}</p>}
    </div>
  );
}

function ScoreRow({ label: title, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between mb-0.5">
        <span className="text-muted-foreground">{title}</span>
        <span className="font-mono font-bold text-foreground">{value.toFixed(1)}%</span>
      </div>
      <Progress value={value} className="h-1 bg-muted" />
    </div>
  );
}

function Row({ label: title, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border/40 pb-1.5 last:border-0 last:pb-0">
      <dt className="text-muted-foreground">{title}</dt>
      <dd className="text-right font-mono font-semibold text-foreground">{value}</dd>
    </div>
  );
}

function label(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}
