'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { FeatureExtractionData, HarmonizeData, JobLogEntry, RasterInfo, UploadData } from '@/lib/api';

export type BackendHealthStatus = 'unknown' | 'ok' | 'down';

export type BackendSessionState = {
  health: BackendHealthStatus;
  lastDatasetId: string | null;
  lastUpload: UploadData | null;
  uploadedDatasets: UploadData[];
  rasterInfo: RasterInfo | null;
  lastHarmonize: HarmonizeData | null;
  lastExtraction: FeatureExtractionData | null;
  lastError: string | null;
  jobLogs: JobLogEntry[];
};

type BackendSessionContextValue = BackendSessionState & {
  setHealth: (health: BackendHealthStatus) => void;
  recordUpload: (data: UploadData) => void;
  setRasterInfo: (info: RasterInfo | null) => void;
  recordHarmonize: (data: HarmonizeData) => void;
  recordExtraction: (data: FeatureExtractionData) => void;
  recordError: (message: string | null) => void;
  addJobLog: (log: JobLogEntry) => void;
  clearJobLogs: () => void;
};

const BackendSessionContext = createContext<BackendSessionContextValue | null>(null);

const INITIAL: BackendSessionState = {
  health: 'unknown',
  lastDatasetId: null,
  lastUpload: null,
  uploadedDatasets: [],
  rasterInfo: null,
  lastHarmonize: null,
  lastExtraction: null,
  lastError: null,
  jobLogs: [],
};

export function BackendSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BackendSessionState>(INITIAL);

  const setHealth = useCallback((health: BackendHealthStatus) => setState((prev) => ({ ...prev, health })), []);

  const recordUpload = useCallback((data: UploadData) => {
    setState((prev) => ({
      ...prev,
      lastUpload: data,
      lastDatasetId: data.dataset_id,
      uploadedDatasets: [data, ...prev.uploadedDatasets.filter((d) => d.dataset_id !== data.dataset_id)],
      lastError: null,
    }));
  }, []);

  const setRasterInfo = useCallback((info: RasterInfo | null) => setState((prev) => ({ ...prev, rasterInfo: info })), []);

  const recordHarmonize = useCallback((data: HarmonizeData) => {
    setState((prev) => ({
      ...prev,
      lastHarmonize: data,
      lastDatasetId: data.dataset_id,
      lastError: null,
    }));
  }, []);

  const recordExtraction = useCallback((data: FeatureExtractionData) => setState((prev) => ({ ...prev, lastExtraction: data, lastError: null })), []);

  const recordError = useCallback((message: string | null) => setState((prev) => ({ ...prev, lastError: message })), []);

  const addJobLog = useCallback((log: JobLogEntry) => setState((prev) => ({ ...prev, jobLogs: [...prev.jobLogs, log].slice(-30) })), []);

  const clearJobLogs = useCallback(() => setState((prev) => ({ ...prev, jobLogs: [] })), []);

  const value = useMemo(
    () => ({
      ...state,
      setHealth,
      recordUpload,
      setRasterInfo,
      recordHarmonize,
      recordExtraction,
      recordError,
      addJobLog,
      clearJobLogs,
    }),
    [state, setHealth, recordUpload, setRasterInfo, recordHarmonize, recordExtraction, recordError, addJobLog, clearJobLogs],
  );

  return <BackendSessionContext.Provider value={value}>{children}</BackendSessionContext.Provider>;
}

export function useBackendSession(): BackendSessionContextValue {
  const context = useContext(BackendSessionContext);
  if (!context) throw new Error('useBackendSession must be used within BackendSessionProvider');
  return context;
}
