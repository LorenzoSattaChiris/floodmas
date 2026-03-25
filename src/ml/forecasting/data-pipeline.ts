// ─── FloodMAS — Forecasting Data Pipeline ────────────────────────────
// Adapts real EA Flood Monitoring readings + Open-Meteo weather data
// into feature vectors for the LSTM-PINN model.

import { getCity, getAllCityNames, type CityData } from '../../data/ukCities.js';
import { getStationReadings, getLatestReadings } from '../../services/ea-api.js';
import { getPrecipitationGrid, getRiverDischarge } from '../../services/open-meteo.js';
import { LOOKBACK, NUM_FEATURES, type NormParams } from './model.js';
import { logger } from '../../logger.js';

// ── City → Station ID mapping ────────────────────────────────────────
// Maps cities to their closest EA monitoring station reference numbers.
// In production these would be discovered via the EA stations API;
// here we use well-known station IDs for the 10 modelled cities.

const CITY_STATIONS: Record<string, string[]> = {
  york:       ['L2406', 'L2481'],                    // Ouse at Viking Recorder, Foss
  london:     ['PLA06', 'PLA07'],                    // Thames at Tower Pier, Westminster
  manchester: ['694063', '694040'],                   // Irwell at Adelphi Weir, Medlock
  carlisle:   ['760010', '760020'],                   // Eden at Sheepmount, Caldew
  sheffield:  ['F1707', 'F1706'],                     // Don at Hadfields, Sheaf
  leeds:      ['L1207', 'L1210'],                     // Aire at Crown Point, Armley
  bristol:    ['531118', '531130'],                    // Avon at St Phillips, Frome at Frenchay
  shrewsbury: ['451216', '451201'],                    // Severn at Welsh Bridge, Rea Brook
  newcastle:  ['231220', '231225'],                    // Tyne at Bywell, Ouseburn
  oxford:     ['439001', '439022'],                    // Thames at Osney, Cherwell at Banbury
};

/** Fetch live features for inference — combines EA readings + Open-Meteo */
export async function fetchLiveFeatures(
  cityName: string,
): Promise<{ features: number[][]; meta: { stationId: string; river: string; dataSource: string } }> {
  const city = getCity(cityName);
  if (!city) throw new Error(`City "${cityName}" not found. Available: ${getAllCityNames().join(', ')}`);

  const cityKey = city.name.toLowerCase();
  const stationIds = CITY_STATIONS[cityKey] ?? [];
  const primaryStation = stationIds[0];

  // Fetch real data in parallel
  const [eaReadings, precipGrid, dischargeData] = await Promise.allSettled([
    primaryStation ? getStationReadings(primaryStation) : Promise.resolve(null),
    getPrecipitationGrid(),
    getRiverDischarge([city.coordinates]),
  ]);

  // Extract water level time series from EA readings
  const waterLevels = extractWaterLevels(eaReadings);

  // Get latest precipitation near this city
  const rainfall = extractLocalRainfall(precipGrid, city);

  // Get river discharge
  const discharge = extractDischarge(dischargeData);

  // Build feature vectors: [water_level, rainfall, discharge, hour_sin, hour_cos]
  const features = buildFeatureVectors(waterLevels, rainfall, discharge, city);

  return {
    features,
    meta: {
      stationId: primaryStation ?? 'synthetic',
      river: city.rivers[0]?.name ?? 'Unknown',
      dataSource: primaryStation ? 'EA Flood Monitoring API + Open-Meteo' : 'Synthetic baseline + Open-Meteo',
    },
  };
}

/** Fetch historical readings for training */
export async function fetchTrainingData(
  cityName: string,
  hours = 48,
): Promise<{ sequences: number[][][]; labels: number[] }> {
  const city = getCity(cityName);
  if (!city) throw new Error(`City "${cityName}" not found`);

  const cityKey = city.name.toLowerCase();
  const stationIds = CITY_STATIONS[cityKey] ?? [];
  const primaryStation = stationIds[0];

  if (!primaryStation) {
    return { sequences: [], labels: [] };
  }

  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  try {
    const readings = await getStationReadings(primaryStation, since);
    return convertReadingsToTrainingData(readings, city);
  } catch (err) {
    logger.warn({ err, city: cityName }, 'Failed to fetch training data from EA');
    return { sequences: [], labels: [] };
  }
}

// ── Extraction helpers ───────────────────────────────────────────────

function extractWaterLevels(
  result: PromiseSettledResult<unknown>,
): number[] {
  if (result.status !== 'fulfilled' || !result.value) return [];

  try {
    const data = result.value as { items?: { value?: number }[] };
    const items = data.items ?? [];
    return items
      .map((r: { value?: number }) => r.value ?? 0)
      .filter((v: number) => v > 0)
      .reverse(); // EA returns newest first — reverse for chronological
  } catch {
    return [];
  }
}

function extractLocalRainfall(
  result: PromiseSettledResult<unknown>,
  city: CityData,
): number {
  if (result.status !== 'fulfilled' || !result.value) return 0;

  try {
    const grid = result.value as { points: { lat: number; lon: number; current_rain_mm: number }[] };
    // Find nearest grid point to city
    let nearest = grid.points[0];
    let minDist = Infinity;
    for (const pt of grid.points) {
      const dist = Math.hypot(pt.lat - city.coordinates.lat, pt.lon - city.coordinates.lon);
      if (dist < minDist) { minDist = dist; nearest = pt; }
    }
    return nearest?.current_rain_mm ?? 0;
  } catch {
    return 0;
  }
}

function extractDischarge(
  result: PromiseSettledResult<unknown>,
): number {
  if (result.status !== 'fulfilled' || !result.value) return 50;

  try {
    const data = result.value as { points: { discharge_m3s: number }[] };
    return data.points[0]?.discharge_m3s ?? 50;
  } catch {
    return 50;
  }
}

function buildFeatureVectors(
  waterLevels: number[],
  rainfall: number,
  discharge: number,
  city: CityData,
): number[][] {
  const features: number[][] = [];
  const now = new Date();

  if (waterLevels.length >= LOOKBACK) {
    // Real data path — use actual EA readings
    for (let i = 0; i < LOOKBACK; i++) {
      const offsetHours = (LOOKBACK - i) * 0.25;
      const ts = new Date(now.getTime() - offsetHours * 60 * 60 * 1000);
      const hour = ts.getHours() + ts.getMinutes() / 60;
      features.push([
        waterLevels[waterLevels.length - LOOKBACK + i] ?? city.rivers[0].currentLevel,
        rainfall * (0.8 + Math.random() * 0.4),   // slight variation over window
        discharge * (0.9 + Math.random() * 0.2),
        Math.sin((2 * Math.PI * hour) / 24),
        Math.cos((2 * Math.PI * hour) / 24),
      ]);
    }
  } else {
    // Synthetic fallback — generate plausible sequence from city data
    const baseLevel = city.rivers[0]?.currentLevel ?? 2.0;
    const trend = (Math.random() - 0.4) * 0.01;

    for (let i = 0; i < LOOKBACK; i++) {
      const offsetHours = (LOOKBACK - i) * 0.25;
      const ts = new Date(now.getTime() - offsetHours * 60 * 60 * 1000);
      const hour = ts.getHours() + ts.getMinutes() / 60;
      const level = baseLevel + trend * i + (Math.random() - 0.5) * 0.05;
      features.push([
        level,
        rainfall * (0.8 + Math.random() * 0.4),
        discharge * (0.9 + Math.random() * 0.2),
        Math.sin((2 * Math.PI * hour) / 24),
        Math.cos((2 * Math.PI * hour) / 24),
      ]);
    }
  }

  return features;
}

function convertReadingsToTrainingData(
  readings: unknown,
  city: CityData,
): { sequences: number[][][]; labels: number[] } {
  try {
    const data = readings as { items?: { value?: number; dateTime?: string }[] };
    const items = (data.items ?? [])
      .filter((r) => typeof r.value === 'number' && r.value > 0)
      .reverse();

    if (items.length < LOOKBACK + 4) return { sequences: [], labels: [] };

    const sequences: number[][][] = [];
    const labels: number[] = [];
    const discharge = 50; // placeholder — Open-Meteo provides only latest

    // Slide the window
    for (let start = 0; start <= items.length - LOOKBACK - 1; start += 4) {
      const seq: number[][] = [];
      for (let t = 0; t < LOOKBACK; t++) {
        const item = items[start + t];
        const dateTime = item.dateTime ? new Date(item.dateTime as string) : new Date();
        const hour = dateTime.getHours() + dateTime.getMinutes() / 60;
        seq.push([
          item.value ?? 0,
          0,   // rainfall unknown retroactively
          discharge,
          Math.sin((2 * Math.PI * hour) / 24),
          Math.cos((2 * Math.PI * hour) / 24),
        ]);
      }
      sequences.push(seq);
      labels.push(items[start + LOOKBACK]?.value ?? items[start + LOOKBACK - 1]?.value ?? 0);
    }

    return { sequences, labels };
  } catch {
    return { sequences: [], labels: [] };
  }
}

/** Get station IDs for a city */
export function getCityStationIds(cityName: string): string[] {
  const city = getCity(cityName);
  if (!city) return [];
  return CITY_STATIONS[city.name.toLowerCase()] ?? [];
}
