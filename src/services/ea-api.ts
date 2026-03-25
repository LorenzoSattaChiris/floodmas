import { getCached, setCache } from './cache.js';
import { logger } from '../logger.js';

const EA_BASE = 'https://environment.data.gov.uk/flood-monitoring';
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 800;

async function fetchEA(path: string, cacheKey: string, category: Parameters<typeof setCache>[2]) {
  const cached = getCached(cacheKey);
  if (cached) return cached.data;

  const url = `${EA_BASE}${path}`;

  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_BASE_MS * 2 ** (attempt - 1);
      logger.warn({ url, attempt, delayMs: delay }, 'Retrying EA API request');
      await new Promise(r => setTimeout(r, delay));
    }

    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });

    if (res.ok) {
      const data = await res.json();
      setCache(cacheKey, data, category);
      return data;
    }

    // Retry on 5xx (server errors) only; client errors (4xx) fail fast
    if (res.status < 500) {
      throw new Error(`EA API error: ${res.status} ${res.statusText} for ${url}`);
    }

    lastError = new Error(`EA API error: ${res.status} ${res.statusText} for ${url}`);
  }

  throw lastError!;
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
  const data = await fetchEA('/id/floodAreas', 'floodAreas:all', 'floodAreas');

  if (type && data?.items) {
    return {
      ...data,
      items: data.items.filter((item: Record<string, unknown>) => {
        const t = item['@type'] ?? item.type;
        if (Array.isArray(t)) return t.includes(`http://environment.data.gov.uk/flood-monitoring/def/core/${type}`);
        return t === `http://environment.data.gov.uk/flood-monitoring/def/core/${type}` || t === type;
      }),
    };
  }

  return data;
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
