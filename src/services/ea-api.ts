import { getCached, setCache } from './cache.js';

const EA_BASE = 'https://environment.data.gov.uk/flood-monitoring';

async function fetchEA(path: string, cacheKey: string, category: Parameters<typeof setCache>[2]) {
  const cached = getCached(cacheKey);
  if (cached) return cached.data;

  const url = `${EA_BASE}${path}`;
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`EA API error: ${res.status} ${res.statusText} for ${url}`);
  }

  const data = await res.json();
  setCache(cacheKey, data, category);
  return data;
}

/** Current flood warnings and alerts */
export async function getFloodWarnings() {
  return fetchEA('/id/floods', 'floods:all', 'floods');
}

/** Flood warnings filtered by severity */
export async function getFloodWarningsBySeverity(severity: number) {
  return fetchEA(`/id/floods?min-severity=${severity}`, `floods:sev${severity}`, 'floods');
}

/** Active monitoring stations */
export async function getStations(params: Record<string, string> = {}) {
  const query = new URLSearchParams({ status: 'Active', ...params }).toString();
  const key = `stations:${query}`;
  return fetchEA(`/id/stations?${query}`, key, 'stations');
}

/** Readings for a specific station */
export async function getStationReadings(stationId: string, since?: string) {
  const params = new URLSearchParams({ _sorted: '', _limit: '100' });
  if (since) params.set('since', since);
  const key = `readings:${stationId}:${params.toString()}`;
  return fetchEA(`/id/stations/${encodeURIComponent(stationId)}/readings?${params}`, key, 'readings');
}

/** Latest readings from all stations (single efficient call) */
export async function getLatestReadings() {
  return fetchEA('/data/readings?latest', 'readings:latest', 'readings');
}

/** Flood warning/alert areas with optional polygon */
export async function getFloodAreas(type?: 'FloodAlertArea' | 'FloodWarningArea') {
  const params = type ? `?type=${type}` : '';
  return fetchEA(`/id/floodAreas${params}`, `floodAreas:${type || 'all'}`, 'floodAreas');
}

/** Single flood area detail with polygon */
export async function getFloodAreaDetail(areaId: string) {
  return fetchEA(`/id/floodAreas/${encodeURIComponent(areaId)}`, `floodArea:${areaId}`, 'floodAreas');
}

/** Health check — test EA API is reachable */
export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${EA_BASE}/id/floods?_limit=1`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
