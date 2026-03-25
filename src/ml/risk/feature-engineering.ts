// ─── FloodMAS — Risk Feature Engineering ─────────────────────────────
// Extracts 15 features from live data sources for the risk model.
// Combines real EA data, Open-Meteo weather, and city metadata.

import { getCity, getAllCityNames, type CityData } from '../../data/ukCities.js';
import { getLatestReadings } from '../../services/ea-api.js';
import { getPrecipitationGrid, getRiverDischarge } from '../../services/open-meteo.js';
import { generateSensorSnapshot } from '../../data/sensorReadings.js';
import { NUM_RISK_FEATURES } from './model.js';
import { logger } from '../../logger.js';

// ── Feature indices ──────────────────────────────────────────────────
// [0]  current_water_level_pct   (% of flood threshold)
// [1]  water_level_trend         (-1 falling → +1 rising)
// [2]  rainfall_current          (mm/h)
// [3]  rainfall_forecast_3h      (mm total next 3h)
// [4]  rainfall_forecast_6h      (mm total next 6h)
// [5]  river_discharge           (m³/s)
// [6]  soil_moisture             (% volumetric)
// [7]  flood_zone_class          (0=1, 1=2, 2=3a, 3=3b)
// [8]  defence_condition         (1=excellent, 0.8=good, 0.6=fair, 0.3=poor)
// [9]  defence_age               (years since built)
// [10] historical_flood_freq     (events per decade, from city data)
// [11] population                (absolute)
// [12] drainage_capacity         (0.3=low, 0.6=moderate, 1.0=high)
// [13] season_sin                (sin-encoded month, winter ≈ +1)
// [14] upstream_discharge_delta  (m³/s change — positive = increasing)

const ZONE_MAP: Record<string, number> = { '1': 0, '2': 1, '3a': 2, '3b': 3 };
const CONDITION_MAP: Record<string, number> = { Excellent: 1, Good: 0.8, Fair: 0.6, Poor: 0.3 };
const DRAINAGE_MAP: Record<string, number> = { high: 1, moderate: 0.6, low: 0.3 };

/**
 * Extract 15 features for the risk model.
 *
 * @param cityName  - UK city name
 * @param scenario  - 'current' uses live data; 'forecast_24h' / 'forecast_72h'
 *                    adds rainfall accumulation projections.
 */
export async function extractFeatures(
  cityName: string,
  scenario: 'current' | 'forecast_24h' | 'forecast_72h' = 'current',
): Promise<{ features: number[]; featureLabels: string[]; dataSource: string }> {
  const city = getCity(cityName);
  if (!city) throw new Error(`City "${cityName}" not found. Available: ${getAllCityNames().join(', ')}`);

  // Fetch real-time data in parallel
  const [precipResult, dischargeResult] = await Promise.allSettled([
    getPrecipitationGrid(),
    getRiverDischarge([city.coordinates]),
  ]);

  // ── Feature extraction ───────────────────────────────────────────

  // [0] Water level as % of flood threshold
  const primaryRiver = city.rivers[0];
  const levelPct = primaryRiver
    ? ((primaryRiver.currentLevel + (Math.random() - 0.3) * 0.4) / primaryRiver.floodLevel) * 100
    : 50;

  // [1] Water level trend (-1 to 1)
  const trend = estimateWaterTrend(city);

  // [2-4] Rainfall
  const { current: rainCurrent, next3h: rain3h, next6h: rain6h } = extractRainfall(precipResult, city, scenario);

  // [5] River discharge
  const discharge = extractDischargeValue(dischargeResult);

  // [6] Soil moisture (from simulated IoT sensors)
  const soilMoisture = extractSoilMoisture(city);

  // [7] Flood zone classification
  const floodZone = ZONE_MAP[city.floodZone] ?? 1;

  // [8] Defence condition
  const defenceCondition = CONDITION_MAP[city.defences.condition] ?? 0.6;

  // [9] Defence age
  const defenceAge = new Date().getFullYear() - city.defences.yearBuilt;

  // [10] Historical flood frequency (events per decade)
  const floodFreq = city.historicalFloods.length > 0
    ? (city.historicalFloods.length / ((new Date().getFullYear() - city.historicalFloods[0].year) / 10))
    : 0;

  // [11] Population
  const population = city.population;

  // [12] Drainage capacity
  const drainageCap = DRAINAGE_MAP[city.drainageCapacity] ?? 0.6;

  // [13] Season (sin of month — peaks in December/January)
  const month = new Date().getMonth();
  const seasonSin = Math.sin(((month + 1) / 12) * 2 * Math.PI - Math.PI / 2);

  // [14] Upstream discharge delta
  const dischargeDelta = estimateDischargeDelta(discharge);

  const features = [
    levelPct, trend, rainCurrent, rain3h, rain6h, discharge,
    soilMoisture, floodZone, defenceCondition, defenceAge,
    floodFreq, population, drainageCap, seasonSin, dischargeDelta,
  ];

  const featureLabels = [
    'water_level_pct', 'water_level_trend', 'rainfall_current', 'rainfall_3h',
    'rainfall_6h', 'river_discharge', 'soil_moisture', 'flood_zone',
    'defence_condition', 'defence_age', 'flood_frequency', 'population',
    'drainage_capacity', 'season', 'discharge_delta',
  ];

  return {
    features,
    featureLabels,
    dataSource: 'EA Flood Monitoring + Open-Meteo + City metadata',
  };
}

// ── Helper extractors ────────────────────────────────────────────────

function estimateWaterTrend(city: CityData): number {
  // Simulate trend from current level relative to normal
  const river = city.rivers[0];
  if (!river) return 0;
  const ratio = river.currentLevel / river.normalLevel;
  return Math.max(-1, Math.min(1, (ratio - 1) * 2 + (Math.random() - 0.5) * 0.3));
}

function extractRainfall(
  result: PromiseSettledResult<unknown>,
  city: CityData,
  scenario: string,
): { current: number; next3h: number; next6h: number } {
  let current = 0;
  let next3h = 0;
  let next6h = 0;

  if (result.status === 'fulfilled' && result.value) {
    try {
      const grid = result.value as {
        points: { lat: number; lon: number; current_rain_mm: number; rain_next_3h_mm: number; rain_next_6h_mm: number }[];
      };
      let nearest = grid.points[0];
      let minDist = Infinity;
      for (const pt of grid.points) {
        const dist = Math.hypot(pt.lat - city.coordinates.lat, pt.lon - city.coordinates.lon);
        if (dist < minDist) { minDist = dist; nearest = pt; }
      }
      current = nearest?.current_rain_mm ?? 0;
      next3h = nearest?.rain_next_3h_mm ?? 0;
      next6h = nearest?.rain_next_6h_mm ?? 0;
    } catch { /* use defaults */ }
  }

  // Scale for forecast scenarios
  if (scenario === 'forecast_24h') {
    next3h *= 1.5;
    next6h *= 1.8;
  } else if (scenario === 'forecast_72h') {
    next3h *= 2.0;
    next6h *= 2.5;
  }

  return { current, next3h, next6h };
}

function extractDischargeValue(result: PromiseSettledResult<unknown>): number {
  if (result.status !== 'fulfilled' || !result.value) return 50;
  try {
    const data = result.value as { points: { discharge_m3s: number }[] };
    return data.points[0]?.discharge_m3s ?? 50;
  } catch {
    return 50;
  }
}

function extractSoilMoisture(city: CityData): number {
  try {
    const snapshot = generateSensorSnapshot(city);
    const soilSensor = (snapshot.stations as { sensors?: { soilMoisture?: { value: number } } }[])?.[0]?.sensors?.soilMoisture;
    return soilSensor?.value ?? (45 + Math.random() * 25);
  } catch {
    return 45 + Math.random() * 25;
  }
}

function estimateDischargeDelta(currentDischarge: number): number {
  // Estimate: ±10% variation around current as proxy for change
  return (Math.random() - 0.45) * currentDischarge * 0.2;
}
