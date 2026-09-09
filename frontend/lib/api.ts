export type HealthData = {
  service: string;
  version: string;
  crs: string;
  capabilities?: string[];
};

export type GeoJsonCollection = GeoJSON.FeatureCollection;

export type SchemaProfile = {
  archetype: string;
  archetype_name: string;
  description: string;
  confidence_pct: number;
  mapped_fields: Record<string, string>;
  unmapped_fields: string[];
  total_columns: number;
  geometry_types: string[];
};

export type UploadData = {
  dataset_id: string;
  filename: string;
  source_format: string;
  kind?: string;
  feature_count: number;
  crs: string;
  bounds: number[];
  bounds_wgs84?: number[];
  geometry_types: string[];
  columns: string[];
  schema_profile?: SchemaProfile;
  has_raster?: boolean;
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

export type SpatialConflict = {
  type: string;
  parcel_id?: string;
  reference_id?: string;
  message: string;
  area_m2?: number;
  iou?: number;
  fields?: string[];
};

export type HarmonizeData = {
  harmonize_id?: string;
  dataset_id: string;
  feature_count: number;
  removed_slivers: number;
  overlap_fixes: number;
  snapped_nodes: number;
  building_wall_segments: number;
  building_wall_source: string;
  mean_snap_distance_m: number;
  confidence: ConfidenceBreakdown;
  geojson: GeoJsonCollection;
  conflicts: SpatialConflict[];
  conflict_geojson: GeoJsonCollection;
};

export type SpatialAnalysisData = {
  matched_count: number;
  conflict_count: number;
  matches: Array<Record<string, unknown>>;
  conflicts: Array<Record<string, unknown>>;
  conflict_geojson: GeoJsonCollection;
  changes: Array<Record<string, unknown>>;
};

export type FeatureExtractionData = {
  dataset_id: string;
  feature_count: number;
  method: string;
  method_note: string;
  geojson: GeoJsonCollection;
};

export type JobLogEntry = {
  timestamp: string;
  stage: string;
  progress: number;
  message: string;
  metrics?: Record<string, unknown>;
};

export type HarmonizeJob = {
  job_id: string;
  dataset_id: string;
  status: 'queued' | 'running' | 'complete' | 'failed';
  stage: string;
  progress: number;
  message: string;
  logs?: JobLogEntry[];
  result: HarmonizeData | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

export type RasterInfo = {
  width: number;
  height: number;
  band_count: number;
  dtypes: string[];
  source_crs: string;
  bounds_wgs84: [number, number, number, number];
  coordinates_wgs84: [[number, number], [number, number], [number, number], [number, number]];
  is_elevation: boolean;
  raster_type: 'elevation_dsm' | 'rgb_orthomosaic' | 'single_band_intensity';
};

export type ExchangeLayer = {
  dataset_id: string;
  layer_name: string;
  department_category: string;
  feature_count: number;
  crs: string;
  status: string;
  is_harmonized: boolean;
  has_raster: boolean;
  created_at: string;
  endpoints: {
    geojson: string;
    csv: string;
    wfs_features: string;
  };
};

export type ExchangeCatalog = {
  supported_departments: string[];
  active_layers: ExchangeLayer[];
  exchange_protocols: string[];
};

export type AuditLogEntry = {
  id: string;
  timestamp: string;
  department: string;
  action: string;
  layer_type: string;
  feature_count: number;
  receipt_hash: string;
  status: string;
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

export async function startHarmonizationJob(body: {
  dataset_id: string; building_dataset_id?: string | null; sliver_area_m2?: number; snap_tolerance_m?: number; overlap_area_m2?: number;
}): Promise<HarmonizeJob> {
  return parseJsonEnvelope<HarmonizeJob>(await apiFetch('/api/harmonize/jobs', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }));
}

export async function getHarmonizationJob(jobId: string): Promise<HarmonizeJob> {
  return parseJsonEnvelope<HarmonizeJob>(await apiFetch(`/api/harmonize/jobs/${jobId}`));
}

export async function extractRasterFeatures(body: { dataset_id: string; min_area_m2?: number }): Promise<FeatureExtractionData> {
  return parseJsonEnvelope<FeatureExtractionData>(await apiFetch('/api/extract-features', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }));
}

export async function getRasterInfo(datasetId: string): Promise<RasterInfo> {
  return parseJsonEnvelope<RasterInfo>(await apiFetch(`/api/raster/${datasetId}/info`));
}

export function getRasterPreviewUrl(datasetId: string): string {
  return `${getApiBaseUrl()}/api/raster/${datasetId}/preview.png`;
}

export async function analyzeLayers(body: {
  cadastral_dataset_id: string; reference_dataset_id: string; iou_threshold?: number; change_iou_threshold?: number; attribute_fields?: string[];
}): Promise<SpatialAnalysisData> {
  return parseJsonEnvelope<SpatialAnalysisData>(await apiFetch('/api/analyze', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }));
}

export async function getExchangeCatalog(): Promise<ExchangeCatalog> {
  return parseJsonEnvelope<ExchangeCatalog>(await apiFetch('/api/exchange/layers'));
}

export async function getExchangeAuditLogs(): Promise<{ total_transactions: number; audit_trail: AuditLogEntry[] }> {
  return parseJsonEnvelope<{ total_transactions: number; audit_trail: AuditLogEntry[] }>(await apiFetch('/api/exchange/audit-log'));
}

export async function exportPDF(body: {
  dataset_id: string; owner_name?: string; village?: string; district?: string; state?: string; survey_number?: string | null;
}): Promise<{ blob: Blob; filename: string; ulpin: string | null; datasetId: string | null; }> {
  const response = await apiFetch('/api/export-pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok || !(response.headers.get('content-type') || '').includes('application/pdf')) {
    throw new BackendApiError('Failed PDF request', 'PDF_FAILED', response.status);
  }
  const blob = await response.blob();
  const match = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') || '');
  return { blob, filename: match?.[1] || 'spatialshift-mutation.pdf', ulpin: response.headers.get('X-ULPIN'), datasetId: response.headers.get('X-Dataset-Id') };
}

export function downloadBlob(blob: Blob, filename: string): void {
  if (typeof window === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
