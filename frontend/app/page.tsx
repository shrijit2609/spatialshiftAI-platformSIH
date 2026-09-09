'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Sidebar } from '@/components/dashboard/sidebar';
import { ConflictInspector } from '@/components/dashboard/conflict-inspector';
import { TopBar } from '@/components/dashboard/top-bar';
import { LiveTerminal } from '@/components/dashboard/live-terminal';
import { type UploadItem, type HarmonizationRun } from '@/lib/parcels';
import { getApiBaseUrl, getHarmonizationJob, startHarmonizationJob, type HarmonizeJob, type JobLogEntry } from '@/lib/api';
import { BackendSessionProvider, useBackendSession } from '@/lib/backend-session';

const DualMap = dynamic(
  () => import('@/components/dashboard/dual-map').then((mod) => mod.DualMap),
  { ssr: false },
);

export default function Home() {
  return (
    <BackendSessionProvider>
      <HomeDashboard />
    </BackendSessionProvider>
  );
}

function HomeDashboard() {
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [run, setRun] = useState<HarmonizationRun>({
    status: 'idle',
    progress: 0,
    stage: 'Awaiting source layer ingest',
    parcelsProcessed: 0,
    totalParcels: 0,
    conflictsFound: 0,
    confidenceAvg: 0,
  });
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [selectedParcelId, setSelectedParcelId] = useState<string | null>(null);

  const {
    lastDatasetId,
    lastUpload,
    lastHarmonize,
    lastExtraction,
    rasterInfo,
    jobLogs,
    addJobLog,
    clearJobLogs,
    recordHarmonize,
    recordError,
  } = useBackendSession();

  const eventSourceRef = useRef<EventSource | null>(null);

  const handleRunHarmonization = useCallback(async () => {
    if (!lastDatasetId || run.status === 'running') {
      if (!lastDatasetId) recordError('Upload a cadastral layer or GeoTIFF before harmonization.');
      return;
    }

    clearJobLogs();
    setRun({
      status: 'running',
      progress: 5,
      stage: 'Starting Harmonization Pipeline...',
      parcelsProcessed: 0,
      totalParcels: lastUpload?.feature_count || 0,
      conflictsFound: 0,
      confidenceAvg: 0,
    });

    try {
      const job = await startHarmonizationJob({
        dataset_id: lastDatasetId,
        building_dataset_id: null,
        sliver_area_m2: 2.0,
        snap_tolerance_m: 0.75,
        overlap_area_m2: 0.5,
      });

      // Attempt real-time SSE stream
      if (typeof window !== 'undefined' && 'EventSource' in window) {
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
        }

        const sseUrl = `${getApiBaseUrl()}/api/events/jobs/${job.job_id}`;
        const es = new EventSource(sseUrl);
        eventSourceRef.current = es;

        es.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data) as HarmonizeJob;
            setRun((prev) => ({
              ...prev,
              status: data.status === 'failed' ? 'error' : data.status === 'complete' ? 'complete' : 'running',
              progress: data.progress,
              stage: data.stage,
              totalParcels: lastUpload?.feature_count || prev.totalParcels,
            }));

            if (data.logs && data.logs.length > 0) {
              const latestLog = data.logs[data.logs.length - 1];
              addJobLog(latestLog);
            }

            if (data.status === 'complete' && data.result) {
              es.close();
              recordHarmonize(data.result);
              setRun({
                status: 'complete',
                progress: 100,
                stage: data.stage,
                parcelsProcessed: data.result.feature_count,
                totalParcels: data.result.feature_count,
                conflictsFound: data.result.conflicts.length,
                confidenceAvg: data.result.confidence.score * 100,
              });
            } else if (data.status === 'failed') {
              es.close();
              recordError(data.error || data.message);
            }
          } catch (e) {
            // Ignore parse errors on heartbeat comments
          }
        };

        es.onerror = () => {
          es.close();
          // Fallback to polling if SSE disconnected
          void pollJobFallback(job.job_id);
        };
      } else {
        void pollJobFallback(job.job_id);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not start harmonization.';
      recordError(message);
      setRun((prev) => ({ ...prev, status: 'error', stage: message }));
    }
  }, [lastDatasetId, lastUpload, addJobLog, clearJobLogs, recordError, recordHarmonize, run.status]);

  const pollJobFallback = async (jobId: string) => {
    try {
      const latest = await getHarmonizationJob(jobId);
      setRun((prev) => ({
        ...prev,
        status: latest.status === 'failed' ? 'error' : latest.status === 'complete' ? 'complete' : 'running',
        progress: latest.progress,
        stage: latest.stage,
        totalParcels: lastUpload?.feature_count || prev.totalParcels,
      }));

      if (latest.logs && latest.logs.length > 0) {
        addJobLog(latest.logs[latest.logs.length - 1]);
      }

      if (latest.status === 'complete' && latest.result) {
        recordHarmonize(latest.result);
        setRun({
          status: 'complete',
          progress: 100,
          stage: latest.stage,
          parcelsProcessed: latest.result.feature_count,
          totalParcels: latest.result.feature_count,
          conflictsFound: latest.result.conflicts.length,
          confidenceAvg: latest.result.confidence.score * 100,
        });
        return;
      }

      if (latest.status === 'failed') {
        recordError(latest.error || latest.message);
        return;
      }

      window.setTimeout(() => {
        void pollJobFallback(jobId);
      }, 300);
    } catch (e) {
      // Retry
      window.setTimeout(() => {
        void pollJobFallback(jobId);
      }, 500);
    }
  };

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      <Sidebar
        onRunHarmonization={handleRunHarmonization}
        harmonizationRun={run}
        uploads={uploads}
        onUploadsChange={setUploads}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar
          harmonizationStatus={run.status}
          parcelsProcessed={run.parcelsProcessed}
          conflictsFound={run.conflictsFound}
        />

        <div className="flex flex-1 overflow-hidden relative">
          <div className="relative flex-1 overflow-hidden">
            {!lastUpload && (
              <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
                <div className="max-w-md border border-border bg-card/95 backdrop-blur-xl p-6 text-center shadow-2xl space-y-2">
                  <h3 className="text-sm font-bold text-foreground">SpatialShift AI Harmonization Engine</h3>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Upload an orthomosaic GeoTIFF/DSM, cadastral shapefiles, or GNSS survey points from the sidebar.
                    The map engine will render real georeferenced raster pixels, detect topology conflicts, and perform topological planarization.
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
              conflictGeojson={lastHarmonize?.conflict_geojson}
              extractionGeojson={lastExtraction?.geojson}
              rasterDatasetId={lastUpload?.has_raster ? lastUpload.dataset_id : null}
              rasterInfo={rasterInfo}
            />

            {/* Live SSE Stream Terminal Overlay */}
            {run.status !== 'idle' && (
              <div className="absolute bottom-3 left-3 z-30 max-w-lg w-full">
                <LiveTerminal
                  logs={jobLogs}
                  stage={run.stage}
                  progress={run.progress}
                  status={run.status}
                />
              </div>
            )}
          </div>

          <ConflictInspector
            collapsed={inspectorCollapsed}
            onToggle={() => setInspectorCollapsed(!inspectorCollapsed)}
            selectedParcelId={selectedParcelId}
            onSelectParcel={setSelectedParcelId}
            harmonizationComplete={run.status === 'complete'}
            conflicts={lastHarmonize?.conflicts || []}
            featureCount={lastHarmonize?.feature_count || lastUpload?.feature_count || 0}
            confidence={lastHarmonize?.confidence || null}
          />
        </div>
      </div>
    </div>
  );
}
