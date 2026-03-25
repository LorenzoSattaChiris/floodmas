import { getCached, setCache } from './cache.js';

/**
 * NRFA (National River Flow Archive) API client.
 * Provides access to ~1500+ UK river gauging stations operated by UKCEH.
 * Free API — no key required.
 * https://nrfaapps.ceh.ac.uk/nrfa/ws/
 */

const NRFA_BASE = 'https://nrfaapps.ceh.ac.uk/nrfa/ws';

export interface NRFAStation {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  river: string;
  catchmentArea: number | null;
}

export interface NRFAStationsResponse {
  stations: NRFAStation[];
  generatedAt: string;
}

/**
 * Fetch all NRFA gauging stations with coordinates.
 * Returns a simplified list of stations suitable for map rendering.
 */
export async function getNRFAStations(): Promise<NRFAStationsResponse> {
  const cacheKey = 'nrfa:stations';
  const cached = getCached<NRFAStationsResponse>(cacheKey);
  if (cached) return cached.data;

  const url = `${NRFA_BASE}/station-info?station=*&format=json-object&fields=id,name,latitude,longitude,river,catchment-area`;

  const res = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    throw new Error(`NRFA API error: ${res.status} ${res.statusText}`);
  }

  const json = await res.json() as { data: Array<Record<string, unknown>> };

  const stations: NRFAStation[] = (json.data || [])
    .filter((s: any) => s.latitude != null && s.longitude != null)
    .map((s: any) => ({
      id: s.id,
      name: s.name,
      latitude: s.latitude,
      longitude: s.longitude,
      river: s.river || '',
      catchmentArea: s['catchment-area'] ?? null,
    }));

  const result: NRFAStationsResponse = {
    stations,
    generatedAt: new Date().toISOString(),
  };

  setCache(cacheKey, result, 'nrfa');
  return result;
}

/** Health check for NRFA API */
export async function checkNRFAHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${NRFA_BASE}/station-info?station=39001&format=json-object&fields=id`, {
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
