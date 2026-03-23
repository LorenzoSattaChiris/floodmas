import { getCached, setCache } from './cache.js';

const METEO_BASE = 'https://api.open-meteo.com/v1';
const FLOOD_BASE = 'https://flood-api.open-meteo.com/v1';

/**
 * UK precipitation grid — fetches hourly rain data for a grid of points
 * covering the UK, used to build a precipitation heatmap overlay.
 * Open-Meteo is free, no API key required.
 */

// Grid of UK representative points (lat, lon) — ~30 points covering England, Wales, Scotland
const UK_GRID_POINTS = [
  // South England
  { lat: 50.8, lon: -1.1, name: 'Southampton' },
  { lat: 51.0, lon: -3.2, name: 'Taunton' },
  { lat: 51.5, lon: -0.1, name: 'London' },
  { lat: 51.5, lon: -2.6, name: 'Bristol' },
  { lat: 51.3, lon: 1.1, name: 'Canterbury' },
  // Midlands
  { lat: 52.0, lon: -0.7, name: 'Milton Keynes' },
  { lat: 52.5, lon: -1.9, name: 'Birmingham' },
  { lat: 52.6, lon: -1.1, name: 'Leicester' },
  { lat: 52.2, lon: -3.0, name: 'Hereford' },
  // East
  { lat: 52.6, lon: 1.3, name: 'Norwich' },
  { lat: 53.0, lon: 0.0, name: 'Boston' },
  // North England
  { lat: 53.5, lon: -2.2, name: 'Manchester' },
  { lat: 53.4, lon: -1.5, name: 'Sheffield' },
  { lat: 53.8, lon: -1.6, name: 'Leeds' },
  { lat: 54.0, lon: -2.8, name: 'Lancaster' },
  { lat: 54.6, lon: -1.6, name: 'Darlington' },
  { lat: 54.9, lon: -1.6, name: 'Newcastle' },
  { lat: 55.0, lon: -2.6, name: 'Hexham' },
  // Wales
  { lat: 51.5, lon: -3.2, name: 'Cardiff' },
  { lat: 52.4, lon: -4.1, name: 'Aberystwyth' },
  { lat: 53.2, lon: -3.8, name: 'Snowdonia' },
  // Scotland
  { lat: 55.9, lon: -3.2, name: 'Edinburgh' },
  { lat: 55.9, lon: -4.3, name: 'Glasgow' },
  { lat: 56.5, lon: -3.0, name: 'Perth' },
  { lat: 57.1, lon: -2.1, name: 'Aberdeen' },
  { lat: 57.5, lon: -4.2, name: 'Inverness' },
];

export interface PrecipitationPoint {
  lat: number;
  lon: number;
  name: string;
  current_rain_mm: number;       // Current hour rain in mm
  rain_next_3h_mm: number;       // Sum of next 3h
  rain_next_6h_mm: number;       // Sum of next 6h
  temperature_c: number;
  wind_speed_kmh: number;
  wind_direction: number;
  weather_code: number;
}

export interface PrecipitationGrid {
  points: PrecipitationPoint[];
  generatedAt: string;
}

/**
 * Fetch current precipitation across UK grid points.
 * Uses Open-Meteo batch endpoint (comma-separated lat/lon).
 */
export async function getPrecipitationGrid(): Promise<PrecipitationGrid> {
  const cached = getCached<PrecipitationGrid>('weather:precip-grid');
  if (cached) return cached.data;

  const lats = UK_GRID_POINTS.map(p => p.lat).join(',');
  const lons = UK_GRID_POINTS.map(p => p.lon).join(',');

  const url = `${METEO_BASE}/forecast?latitude=${lats}&longitude=${lons}&hourly=precipitation,temperature_2m,wind_speed_10m,wind_direction_10m,weather_code&forecast_hours=7&timezone=Europe/London`;

  const res = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    throw new Error(`Open-Meteo error: ${res.status}`);
  }

  const data = await res.json();

  // Open-Meteo returns an array when multiple coords are given
  const results: unknown[] = Array.isArray(data) ? data : [data];
  const now = new Date();
  const currentHourIdx = now.getHours();

  const points: PrecipitationPoint[] = results.map((r: any, i: number) => {
    const hourly = r.hourly || {};
    const precip: number[] = hourly.precipitation || [];
    const temps: number[] = hourly.temperature_2m || [];
    const winds: number[] = hourly.wind_speed_10m || [];
    const windDirs: number[] = hourly.wind_direction_10m || [];
    const codes: number[] = hourly.weather_code || [];

    // Current hour is index 0 (first forecast hour)
    const currentRain = precip[0] ?? 0;
    const rain3h = precip.slice(0, 3).reduce((a, b) => a + (b || 0), 0);
    const rain6h = precip.slice(0, 6).reduce((a, b) => a + (b || 0), 0);

    return {
      lat: UK_GRID_POINTS[i].lat,
      lon: UK_GRID_POINTS[i].lon,
      name: UK_GRID_POINTS[i].name,
      current_rain_mm: Math.round(currentRain * 10) / 10,
      rain_next_3h_mm: Math.round(rain3h * 10) / 10,
      rain_next_6h_mm: Math.round(rain6h * 10) / 10,
      temperature_c: Math.round((temps[0] ?? 0) * 10) / 10,
      wind_speed_kmh: Math.round((winds[0] ?? 0) * 10) / 10,
      wind_direction: windDirs[0] ?? 0,
      weather_code: codes[0] ?? 0,
    };
  });

  const result: PrecipitationGrid = {
    points,
    generatedAt: now.toISOString(),
  };

  setCache('weather:precip-grid', result, 'forecast');
  return result;
}

/**
 * River discharge forecasts from Open-Meteo Flood API.
 * Uses EA station coordinates to get river discharge forecasts.
 */
export interface RiverDischargePoint {
  lat: number;
  lon: number;
  discharge_m3s: number;        // Current river discharge
  discharge_max_24h: number;    // Max discharge in next 24h
  discharge_max_72h: number;    // Max discharge in next 72h
}

export interface RiverDischargeData {
  points: RiverDischargePoint[];
  generatedAt: string;
}

/**
 * Fetch river discharge forecasts for a set of coordinates.
 * The Open-Meteo Flood API provides global river discharge forecasts.
 */
export async function getRiverDischarge(
  coords: Array<{ lat: number; lon: number }>,
): Promise<RiverDischargeData> {
  const cacheKey = `weather:river-discharge:${coords.length}`;
  const cached = getCached<RiverDischargeData>(cacheKey);
  if (cached) return cached.data;

  if (coords.length === 0) {
    return { points: [], generatedAt: new Date().toISOString() };
  }

  // Limit to 50 points per call to avoid URL length issues
  const subset = coords.slice(0, 50);
  const lats = subset.map(c => c.lat).join(',');
  const lons = subset.map(c => c.lon).join(',');

  const url = `${FLOOD_BASE}/flood?latitude=${lats}&longitude=${lons}&daily=river_discharge,river_discharge_max&forecast_days=3&timezone=Europe/London`;

  const res = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) {
    throw new Error(`Open-Meteo Flood API error: ${res.status}`);
  }

  const data = await res.json();
  const results: unknown[] = Array.isArray(data) ? data : [data];

  const points: RiverDischargePoint[] = results.map((r: any, i: number) => {
    const daily = r.daily || {};
    const discharge: number[] = daily.river_discharge || [];
    const dischargeMax: number[] = daily.river_discharge_max || [];

    return {
      lat: subset[i].lat,
      lon: subset[i].lon,
      discharge_m3s: discharge[0] ?? 0,
      discharge_max_24h: dischargeMax[0] ?? 0,
      discharge_max_72h: Math.max(...(dischargeMax.slice(0, 3).map(v => v ?? 0))),
    };
  });

  const result: RiverDischargeData = {
    points,
    generatedAt: new Date().toISOString(),
  };

  setCache(cacheKey, result, 'forecast');
  return result;
}

/** Health check for Open-Meteo */
export async function checkOpenMeteoHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${METEO_BASE}/forecast?latitude=51.5&longitude=-0.1&hourly=precipitation&forecast_hours=1`, {
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
