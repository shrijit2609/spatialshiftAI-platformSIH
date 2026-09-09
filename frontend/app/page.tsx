'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Sidebar } from '@/components/dashboard/sidebar';
import { ConflictInspector } from '@/components/dashboard/conflict-inspector';
import { TopBar } from '@/components/dashboard/top-bar';
import { type UploadItem, type HarmonizationRun } from '@/lib/parcels';
import { runHarmonization as requestBackendHarmonization } from '@/lib/api';
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
      if (!lastDatasetId) recordError('Upload a cadastral vector layer before harmonization.');
      return;
    }
    setRun({
      status: 'running', progress: 0, stage: 'Backend topology correction in progress',
      parcelsProcessed: 0, totalParcels: lastUpload?.feature_count || 0,
      conflictsFound: 0, confidenceAvg: 0,
    });
    try {
      const data = await requestBackendHarmonization({
        dataset_id: lastDatasetId, building_dataset_id: null,
        sliver_area_m2: 2, snap_tolerance_m: 0.75, overlap_area_m2: 0.5,
      });
      recordHarmonize(data);
      setRun({
        status: 'complete', progress: 100, stage: 'Backend topology correction complete',
        parcelsProcessed: data.feature_count, totalParcels: data.feature_count,
        conflictsFound: data.overlap_fixes + data.removed_slivers,
        confidenceAvg: data.confidence.score * 100,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Harmonization request failed';
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
            {!lastUpload && (
              <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
                <div className="max-w-sm border border-border bg-card/90 p-6 text-center">
                  <h3 className="mb-1 text-sm font-semibold text-foreground">Awaiting Source Data</h3>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Upload a georeferenced vector layer or GeoTIFF. The map only renders backend-ingested data.
                  </p>
                </div>
              </div>
            )}
            <DualMap
              harmonized={Boolean(lastHarmonize)}
              selectedParcelId={selectedParcelId}
              onSelectParcel={setSelectedParcelId}
              sourceGeojson={lastUpload?.geojson}
              harmonizedGeojson={lastHarmonize?.geojson}
            />
          </div>
          <ConflictInspector collapsed={inspectorCollapsed} onToggle={() => setInspectorCollapsed(!inspectorCollapsed)} selectedParcelId={selectedParcelId} onSelectParcel={setSelectedParcelId} harmonizationComplete={run.status === 'complete'} />
        </div>
      </div>
    </div>
  );
}
