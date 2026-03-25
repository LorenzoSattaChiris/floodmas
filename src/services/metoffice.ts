import { getCached, setCache } from './cache.js';

// ─── Met Office Weather DataHub ────────────────────────────────────────
// Site-Specific Forecast API — hourly + daily GeoJSON forecasts per lat/lon
// Land Observations API — hourly weather observations from 150 UK stations
// Docs: https://datahub.metoffice.gov.uk/docs/f/category/site-specific/overview

const SPOT_BASE = 'https://data.hub.api.metoffice.gov.uk/sitespecific/v0';
const OBS_BASE = 'https://data.hub.api.metoffice.gov.uk/observation-land/1';

function getSpotKey(): string {
  return process.env.METOFFICE_SPOT_KEY ?? '';
}

function getObsKey(): string {
  return process.env.METOFFICE_OBS_KEY ?? '';
}

// UK grid points for multi-location forecast (same as Open-Meteo grid)
export const UK_FORECAST_POINTS = [
  { lat: 50.8, lon: -1.1, name: 'Southampton' },
  { lat: 51.0, lon: -3.2, name: 'Taunton' },
  { lat: 51.5, lon: -0.1, name: 'London' },
  { lat: 51.5, lon: -2.6, name: 'Bristol' },
  { lat: 52.5, lon: -1.9, name: 'Birmingham' },
  { lat: 52.6, lon: -1.1, name: 'Leicester' },
  { lat: 53.5, lon: -2.2, name: 'Manchester' },
  { lat: 53.4, lon: -1.5, name: 'Sheffield' },
  { lat: 53.8, lon: -1.6, name: 'Leeds' },
  { lat: 54.6, lon: -1.6, name: 'Darlington' },
  { lat: 54.9, lon: -1.6, name: 'Newcastle' },
  { lat: 51.5, lon: -3.2, name: 'Cardiff' },
  { lat: 55.9, lon: -3.2, name: 'Edinburgh' },
  { lat: 55.9, lon: -4.3, name: 'Glasgow' },
  { lat: 57.1, lon: -2.1, name: 'Aberdeen' },
  { lat: 57.5, lon: -4.2, name: 'Inverness' },
];

// ─── Types ──────────────────────────────────────────────────────────────

export interface MetOfficeForecastEntry {
  time: string;
  screenTemperature: number;
  feelsLikeTemperature: number;
  windSpeed10m: number;
  windDirectionFrom10m: number;
  windGustSpeed10m: number;
  visibility: number;
  screenRelativeHumidity: number;
  mslp: number;
  uvIndex: number;
  significantWeatherCode: number;
  precipitationRate: number;
  totalPrecipAmount: number;
  totalSnowAmount: number;
  probOfPrecipitation: number;
}

export interface MetOfficeForecastPoint {
  lat: number;
  lon: number;
  name: string;
  modelRunDate: string;
  current: MetOfficeForecastEntry;
  next3h: MetOfficeForecastEntry | null;
}

export interface MetOfficeForecastGrid {
  points: MetOfficeForecastPoint[];
  generatedAt: string;
}

// ─── Fetch a single point forecast ──────────────────────────────────────

async function fetchPointForecast(
  lat: number,
  lon: number,
): Promise<{ modelRunDate: string; timeSeries: MetOfficeForecastEntry[] } | null> {
  const key = getSpotKey();
  if (!key) return null;

  const url = `${SPOT_BASE}/point/hourly?latitude=${lat}&longitude=${lon}`;
  const res = await fetch(url, {
    headers: { apikey: key, Accept: 'application/json' },
  });
  if (!res.ok) return null;

  const data = (await res.json()) as {
    features: Array<{
      properties: {
        modelRunDate: string;
        timeSeries: MetOfficeForecastEntry[];
      };
    }>;
  };

  if (!data.features?.length) return null;
  const props = data.features[0].properties;
  return { modelRunDate: props.modelRunDate, timeSeries: props.timeSeries };
}

// ─── Fetch grid of forecasts for all UK cities ──────────────────────────

export async function getMetOfficeForecastGrid(): Promise<MetOfficeForecastGrid> {
  const cached = getCached<MetOfficeForecastGrid>('metoffice:forecast-grid');
  if (cached) return cached.data;

  const now = new Date();
  const points: MetOfficeForecastPoint[] = [];

  // Fetch in parallel batches of 4 to avoid overwhelming the API
  const batchSize = 4;
  for (let i = 0; i < UK_FORECAST_POINTS.length; i += batchSize) {
    const batch = UK_FORECAST_POINTS.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map((pt) => fetchPointForecast(pt.lat, pt.lon)),
    );

    for (let j = 0; j < batch.length; j++) {
      const result = results[j];
      const pt = batch[j];
      if (result.status !== 'fulfilled' || !result.value) continue;

      const { modelRunDate, timeSeries } = result.value;
      if (!timeSeries?.length) continue;

      // Find the entry closest to "now"
      let bestIdx = 0;
      let bestDiff = Infinity;
      for (let k = 0; k < timeSeries.length; k++) {
        const diff = Math.abs(new Date(timeSeries[k].time).getTime() - now.getTime());
        if (diff < bestDiff) {
          bestDiff = diff;
          bestIdx = k;
        }
      }

      points.push({
        lat: pt.lat,
        lon: pt.lon,
        name: pt.name,
        modelRunDate,
        current: timeSeries[bestIdx],
        next3h: timeSeries[bestIdx + 3] ?? null,
      });
    }
  }

  const grid: MetOfficeForecastGrid = {
    points,
    generatedAt: now.toISOString(),
  };
  setCache('metoffice:forecast-grid', grid, 'forecast');
  return grid;
}

// ─── Atmospheric Models API ──────────────────────────────────────────
// NWP gridded forecast data — order-based, returns GRIB2 binary files.
// We expose JSON metadata (orders, files, model runs) so agents can
// assess forecast freshness and available data without parsing GRIB.
// Docs: https://datahub.metoffice.gov.uk/docs/f/category/atmospheric-models/overview

const ATM_BASE = 'https://data.hub.api.metoffice.gov.uk/atmospheric-models/1.0.0';

function getAtmKey(): string {
  return process.env.METOFFICE_ATM_KEY ?? '';
}

export interface AtmosphericOrder {
  orderId: string;
  [key: string]: unknown;
}

export interface AtmosphericOrderFile {
  fileId: string;
  [key: string]: unknown;
}

export interface AtmosphericModelRun {
  modelId?: string;
  [key: string]: unknown;
}

export interface AtmosphericOrdersResponse {
  orders: AtmosphericOrder[];
  fetchedAt: string;
}

export interface AtmosphericFilesResponse {
  orderId: string;
  files: AtmosphericOrderFile[];
  fileCount: number;
  fetchedAt: string;
}

export interface AtmosphericRunsResponse {
  runs: AtmosphericModelRun[];
  modelId: string | null;
  fetchedAt: string;
}

/** Fetch all configured atmospheric data orders */
export async function getAtmosphericOrders(): Promise<AtmosphericOrdersResponse> {
  const cached = getCached<AtmosphericOrdersResponse>('metoffice:atm-orders');
  if (cached) return cached.data;

  const key = getAtmKey();
  if (!key) return { orders: [], fetchedAt: new Date().toISOString() };

  const res = await fetch(`${ATM_BASE}/orders`, {
    headers: { apikey: key, Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Atmospheric orders request failed: ${res.status} ${res.statusText}`);
  }

  const body = await res.json() as { orderList?: AtmosphericOrder[] };
  const result: AtmosphericOrdersResponse = {
    orders: body.orderList ?? [],
    fetchedAt: new Date().toISOString(),
  };
  setCache('metoffice:atm-orders', result, 'atmospheric');
  return result;
}

/** List available files for a specific atmospheric data order */
export async function getAtmosphericOrderFiles(orderId: string): Promise<AtmosphericFilesResponse> {
  const cacheKey = `metoffice:atm-files:${orderId}`;
  const cached = getCached<AtmosphericFilesResponse>(cacheKey);
  if (cached) return cached.data;

  const key = getAtmKey();
  if (!key) return { orderId, files: [], fileCount: 0, fetchedAt: new Date().toISOString() };

  const res = await fetch(`${ATM_BASE}/orders/${encodeURIComponent(orderId)}/latest`, {
    headers: { apikey: key, Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Atmospheric order files request failed: ${res.status} ${res.statusText}`);
  }

  const body = await res.json() as { orderDetails?: { files?: AtmosphericOrderFile[] } };
  const files = body.orderDetails?.files ?? [];
  const result: AtmosphericFilesResponse = {
    orderId,
    files,
    fileCount: files.length,
    fetchedAt: new Date().toISOString(),
  };
  setCache(cacheKey, result, 'atmospheric');
  return result;
}

/** List available NWP model runs, optionally filtered by modelId */
export async function getAtmosphericRuns(modelId?: string): Promise<AtmosphericRunsResponse> {
  const cacheKey = `metoffice:atm-runs:${modelId ?? 'all'}`;
  const cached = getCached<AtmosphericRunsResponse>(cacheKey);
  if (cached) return cached.data;

  const key = getAtmKey();
  if (!key) return { runs: [], modelId: modelId ?? null, fetchedAt: new Date().toISOString() };

  const url = modelId
    ? `${ATM_BASE}/runs/${encodeURIComponent(modelId)}`
    : `${ATM_BASE}/runs`;
  const res = await fetch(url, {
    headers: { apikey: key, Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Atmospheric runs request failed: ${res.status} ${res.statusText}`);
  }

  const body = await res.json() as AtmosphericModelRun[];
  const result: AtmosphericRunsResponse = {
    runs: Array.isArray(body) ? body : [body],
    modelId: modelId ?? null,
    fetchedAt: new Date().toISOString(),
  };
  setCache(cacheKey, result, 'atmospheric');
  return result;
}

// ─── Health check ────────────────────────────────────────────────────────

export async function checkMetOfficeHealth(): Promise<{ spot: boolean; obs: boolean; atmospheric: boolean }> {
  const spotOk = !!getSpotKey();
  const obsOk = !!getObsKey();
  const atmOk = !!getAtmKey();
  return { spot: spotOk, obs: obsOk, atmospheric: atmOk };
}
