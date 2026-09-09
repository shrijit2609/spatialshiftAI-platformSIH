export type HealthData = {
  service: string;
  version: string;
  crs: string;
  capabilities?: string[];
};

export type GeoJsonCollection = {
  type: 'FeatureCollection';
  features: Array<Record<string, unknown>>;
};

export type UploadData = {
  dataset_id: string;
  filename: string;
  source_format: string;
  feature_count: number;
  crs: string;
  bounds: number[];
  geometry_types: string[];
  columns: string[];
  created_at: string;
  geojson: GeoJsonCollection;
};

export type ConfidenceBreakdown = {
  geometry_validity: number;
  sliver_cleanliness: number;
  overlap_resolution: number;
  node_snap_quality: number;
  compactness: number;
  rule_based_score: number;
  score: number;
  model: string;
  methodology: string;
};

export type HarmonizeData = {
  dataset_id: string;
  feature_count: number;
  removed_slivers: number;
  overlap_fixes: number;
  snapped_nodes: number;
  simulated_wall_segments: number;
  mean_snap_distance_m: number;
  confidence: ConfidenceBreakdown;
  geojson: GeoJsonCollection;
};

export type SpatialAnalysisData = {
  matched_count: number;
  conflict_count: number;
  matches: Array<Record<string, unknown>>;
  conflicts: Array<Record<string, unknown>>;
  conflict_geojson: GeoJsonCollection;
  changes: Array<Record<string, unknown>>;
};

export class BackendApiError extends Error {
  constructor(message: string, public readonly code: string, public readonly status: number) {
    super(message);
  }
}

const BACKEND_UPLOAD_EXTS = new Set([
  '.shp', '.shx', '.dbf', '.prj', '.cpg', '.sbn', '.sbx', '.qix', '.fix',
  '.geojson', '.json', '.csv', '.tif', '.tiff',
]);

export function getApiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL;
  return raw?.trim() ? raw.replace(/\/$/, '') : 'http://localhost:8000';
}

export function isBackendUploadFile(file: File): boolean {
  const dot = file.name.lastIndexOf('.');
  return dot >= 0 && BACKEND_UPLOAD_EXTS.has(file.name.toLowerCase().slice(dot));
}

type OkEnvelope<T> = { ok: true; data: T; message?: string };
type ErrEnvelope = { ok: false; error: { code: string; message: string } };

async function parseJsonEnvelope<T>(response: Response): Promise<T> {
  let payload: OkEnvelope<T> | ErrEnvelope;
  try {
    payload = await response.json() as OkEnvelope<T> | ErrEnvelope;
  } catch {
    throw new BackendApiError('Invalid JSON response from backend', 'INVALID_RESPONSE', response.status);
  }
  if (payload.ok) return payload.data;
  throw new BackendApiError(payload.error?.message || 'Backend request failed', payload.error?.code || 'HTTP_ERROR', response.status);
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(`${getApiBaseUrl()}${path}`, { ...init, credentials: 'omit' });
  } catch {
    throw new BackendApiError('Backend unavailable (network error)', 'NETWORK_ERROR', 0);
  }
}

export async function checkBackendHealth(): Promise<HealthData> {
  return parseJsonEnvelope<HealthData>(await apiFetch('/api/health'));
}

export async function uploadFiles(files: File[]): Promise<UploadData> {
  if (!files.length) throw new BackendApiError('No files to upload', 'NO_FILES', 400);
  const form = new FormData();
  files.forEach((file) => form.append('files', file, file.name));
  return parseJsonEnvelope<UploadData>(await apiFetch('/api/upload', { method: 'POST', body: form }));
}

export async function runHarmonization(body: {
  dataset_id: string; building_dataset_id?: string | null; sliver_area_m2?: number; snap_tolerance_m?: number; overlap_area_m2?: number;
}): Promise<HarmonizeData> {
  return parseJsonEnvelope<HarmonizeData>(await apiFetch('/api/harmonize', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }));
}

export async function analyzeLayers(body: {
  cadastral_dataset_id: string; reference_dataset_id: string; iou_threshold?: number; change_iou_threshold?: number; attribute_fields?: string[];
}): Promise<SpatialAnalysisData> {
  return parseJsonEnvelope<SpatialAnalysisData>(await apiFetch('/api/analyze', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }));
}

export async function exportPDF(body: { dataset_id: string; owner_name?: string; village?: string; district?: string; state?: string; survey_number?: string | null; }): Promise<{ blob: Blob; filename: string; ulpin: string | null; datasetId: string | null; }> {
  const response = await apiFetch('/api/export-pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok || !(response.headers.get('content-type') || '').includes('application/pdf')) {
    throw new BackendApiError('Failed PDF request', 'PDF_FAILED', response.status);
  }
  const blob = await response.blob();
  const match = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') || '');
  return { blob, filename: match?.[1] || 'spatialshift-mutation.pdf', ulpin: response.headers.get('X-ULPIN'), datasetId: response.headers.get('X-Dataset-Id') };
}
