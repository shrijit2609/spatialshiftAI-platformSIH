'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Sidebar } from '@/components/dashboard/sidebar';
import { ConflictInspector } from '@/components/dashboard/conflict-inspector';
import { TopBar } from '@/components/dashboard/top-bar';
import { type UploadItem, type HarmonizationRun } from '@/lib/parcels';
import { getHarmonizationJob, startHarmonizationJob } from '@/lib/api';
import { BackendSessionProvider, useBackendSession } from '@/lib/backend-session';

const DualMap = dynamic(() => import('@/components/dashboard/dual-map').then((mod) => mod.DualMap), { ssr: false });

export default function Home() {
  return <BackendSessionProvider><HomeDashboard /></BackendSessionProvider>;
}

function HomeDashboard() {
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [run, setRun] = useState<HarmonizationRun>({
    status: 'idle', progress: 0, stage: 'Awaiting a real backend dataset',
    parcelsProcessed: 0, totalParcels: 0, conflictsFound: 0, confidenceAvg: 0,
  });
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [selectedParcelId, setSelectedParcelId] = useState<string | null>(null);
  const { lastDatasetId, lastUpload, lastHarmonize, recordHarmonize, recordError } = useBackendSession();

  const handleRunHarmonization = useCallback(async () => {
    if (!lastDatasetId || run.status === 'running') {
      if (!lastDatasetId) recordError('Upload a polygonal cadastral layer before harmonization.');
      return;
    }
    try {
      const job = await startHarmonizationJob({
        dataset_id: lastDatasetId, building_dataset_id: null,
        sliver_area_m2: 2, snap_tolerance_m: 0.75, overlap_area_m2: 0.5,
      });
      const poll = async () => {
        const latest = await getHarmonizationJob(job.job_id);
        setRun((previous) => ({
          ...previous,
          status: latest.status === 'failed' ? 'error' : latest.status === 'complete' ? 'complete' : 'running',
          progress: latest.progress,
          stage: latest.stage,
          totalParcels: lastUpload?.feature_count || previous.totalParcels,
        }));
        if (latest.status === 'complete' && latest.result) {
          recordHarmonize(latest.result);
          setRun({
            status: 'complete', progress: 100, stage: latest.stage,
            parcelsProcessed: latest.result.feature_count, totalParcels: latest.result.feature_count,
            conflictsFound: latest.result.conflicts.length,
            confidenceAvg: latest.result.confidence.score * 100,
          });
          return;
        }
        if (latest.status === 'failed') {
          recordError(latest.error || latest.message);
          return;
        }
        window.setTimeout(() => { void poll(); }, 350);
      };
      setRun({ status: 'running', progress: job.progress, stage: job.stage, parcelsProcessed: 0, totalParcels: lastUpload?.feature_count || 0, conflictsFound: 0, confidenceAvg: 0 });
      void poll();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not start harmonization.';
      recordError(message);
      setRun((previous) => ({ ...previous, status: 'error', stage: message }));
    }
  }, [lastDatasetId, lastUpload, recordError, recordHarmonize, run.status]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      <Sidebar onRunHarmonization={handleRunHarmonization} harmonizationRun={run} uploads={uploads} onUploadsChange={setUploads} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar harmonizationStatus={run.status} parcelsProcessed={run.parcelsProcessed} conflictsFound={run.conflictsFound} />
        <div className="flex flex-1 overflow-hidden">
          <div className="relative flex-1 overflow-hidden">
            {!lastUpload && <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center"><div className="max-w-sm border border-border bg-card/90 p-6 text-center"><h3 className="mb-1 text-sm font-semibold text-foreground">Awaiting Source Data</h3><p className="text-xs leading-relaxed text-muted-foreground">Upload a georeferenced vector layer or GeoTIFF. The map only renders backend-ingested data.</p></div></div>}
            <DualMap harmonized={Boolean(lastHarmonize)} selectedParcelId={selectedParcelId} onSelectParcel={setSelectedParcelId} sourceGeojson={lastUpload?.geojson} harmonizedGeojson={lastHarmonize?.geojson} conflictGeojson={lastHarmonize?.conflict_geojson} />
          </div>
          <ConflictInspector collapsed={inspectorCollapsed} onToggle={() => setInspectorCollapsed(!inspectorCollapsed)} selectedParcelId={selectedParcelId} onSelectParcel={setSelectedParcelId} harmonizationComplete={run.status === 'complete'} conflicts={lastHarmonize?.conflicts || []} featureCount={lastHarmonize?.feature_count || lastUpload?.feature_count || 0} confidence={lastHarmonize?.confidence || null} />
        </div>
      </div>
    </div>
  );
}
