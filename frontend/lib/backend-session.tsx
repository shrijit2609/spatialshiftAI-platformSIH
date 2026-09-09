'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { FeatureExtractionData, HarmonizeData, UploadData } from '@/lib/api';

export type BackendHealthStatus = 'unknown' | 'ok' | 'down';

export type BackendSessionState = {
  health: BackendHealthStatus;
  lastDatasetId: string | null;
  lastUpload: UploadData | null;
  lastHarmonize: HarmonizeData | null;
  lastExtraction: FeatureExtractionData | null;
  lastError: string | null;
};

type BackendSessionContextValue = BackendSessionState & {
  setHealth: (health: BackendHealthStatus) => void;
  recordUpload: (data: UploadData) => void;
  recordHarmonize: (data: HarmonizeData) => void;
  recordExtraction: (data: FeatureExtractionData) => void;
  recordError: (message: string | null) => void;
};

const BackendSessionContext = createContext<BackendSessionContextValue | null>(null);
const INITIAL: BackendSessionState = { health: 'unknown', lastDatasetId: null, lastUpload: null, lastHarmonize: null, lastExtraction: null, lastError: null };

export function BackendSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BackendSessionState>(INITIAL);
  const setHealth = useCallback((health: BackendHealthStatus) => setState((previous) => ({ ...previous, health })), []);
  const recordUpload = useCallback((data: UploadData) => setState((previous) => ({ ...previous, lastUpload: data, lastDatasetId: data.dataset_id, lastHarmonize: null, lastExtraction: null, lastError: null })), []);
  const recordHarmonize = useCallback((data: HarmonizeData) => setState((previous) => ({ ...previous, lastHarmonize: data, lastDatasetId: data.dataset_id, lastError: null })), []);
  const recordExtraction = useCallback((data: FeatureExtractionData) => setState((previous) => ({ ...previous, lastExtraction: data, lastError: null })), []);
  const recordError = useCallback((message: string | null) => setState((previous) => ({ ...previous, lastError: message })), []);
  const value = useMemo(() => ({ ...state, setHealth, recordUpload, recordHarmonize, recordExtraction, recordError }), [state, setHealth, recordUpload, recordHarmonize, recordExtraction, recordError]);
  return <BackendSessionContext.Provider value={value}>{children}</BackendSessionContext.Provider>;
}

export function useBackendSession(): BackendSessionContextValue {
  const context = useContext(BackendSessionContext);
  if (!context) throw new Error('useBackendSession must be used within BackendSessionProvider');
  return context;
}
