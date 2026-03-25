// ─── FloodMAS Tools — Weather & River Forecasting ────────────────────

import type { FloodTool } from '../agents/types.js';
import { getCity, getAllCityNames } from '../data/ukCities.js';
import { predict as predictLevels, isModelReady as isForecastReady } from '../ml/forecasting/model.js';
import { fetchLiveFeatures } from '../ml/forecasting/data-pipeline.js';
import { logger } from '../logger.js';

function simulateForecast(city: ReturnType<typeof getCity>, days: number) {
  const c = city!;
  const forecast = [];
  const baseRainfall: Record<string, number> = { '3b': 12, '3a': 8, '2': 5, '1': 3 };
  const base = baseRainfall[c.floodZone] ?? 6;
  const month = new Date().getMonth();
  const seasonFactor = (month >= 10 || month <= 1) ? 1.8 : (month >= 6 && month <= 8) ? 0.6 : 1.0;

  for (let d = 0; d < days; d++) {
    const date = new Date(); date.setDate(date.getDate() + d);
    const rain = +(base * seasonFactor * (0.5 + Math.random()) + (Math.random() > 0.8 ? 15 : 0)).toFixed(1);
    const wind = +(8 + Math.random() * 30 + (rain > 15 ? 20 : 0)).toFixed(0);
    const temp = +(4 + Math.random() * 8 - (rain > 15 ? 2 : 0)).toFixed(1);
    const severity = rain > 25 ? 'SEVERE' : rain > 15 ? 'HIGH' : rain > 8 ? 'MODERATE' : 'LOW';
    forecast.push({
      date: date.toISOString().split('T')[0], rainfall_mm: rain,
      wind_speed_mph: +wind, temperature_c: temp, severity,
      description: severity === 'SEVERE' ? 'Heavy persistent rain with gale force winds — flood risk HIGH'
        : severity === 'HIGH' ? 'Periods of heavy rain expected — elevated flood risk'
        : severity === 'MODERATE' ? 'Intermittent rain showers — monitor river levels'
        : 'Light rain or dry — low flood risk',
    });
  }

  const peakDay = forecast.reduce((mx, d) => d.rainfall_mm > mx.rainfall_mm ? d : mx, forecast[0]);
  return {
    city: c.name, region: c.region, period: `${days}-day forecast`,
    generatedAt: new Date().toISOString(), forecast,
    summary: {
      totalRainfall_mm: +forecast.reduce((s, d) => s + d.rainfall_mm, 0).toFixed(1),
      peakRainfall: { date: peakDay.date, amount_mm: peakDay.rainfall_mm },
      daysAboveWarning: forecast.filter(d => d.severity !== 'LOW').length,
      overallRisk: forecast.some(d => d.severity === 'SEVERE') ? 'HIGH'
        : forecast.some(d => d.severity === 'HIGH') ? 'ELEVATED' : 'NORMAL',
    },
  };
}

export const getWeatherForecast: FloodTool = {
  definition: {
    type: 'function',
    function: {
      name: 'get_weather_forecast',
      description: `Get a multi-day weather forecast for a UK city including rainfall, wind, and flood risk severity. Available cities: ${getAllCityNames().join(', ')}.`,
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'Name of the UK city' },
          days: { type: 'number', description: 'Number of forecast days (1-7)' },
        },
        required: ['city', 'days'],
      },
    },
  },
  execute: async (args) => {
    const cityData = getCity(args.city as string);
    if (!cityData) return JSON.stringify({ error: `City "${args.city}" not found. Available: ${getAllCityNames().join(', ')}` });
    return JSON.stringify(simulateForecast(cityData, Math.min(Number(args.days) || 5, 7)), null, 2);
  },
};

export const getRiverLevels: FloodTool = {
  definition: {
    type: 'function',
    function: {
      name: 'get_river_levels',
      description: `Get current and predicted river levels with trend analysis and flood threshold percentages. Available cities: ${getAllCityNames().join(', ')}.`,
      parameters: {
        type: 'object',
        properties: { city: { type: 'string', description: 'Name of the UK city' } },
        required: ['city'],
      },
    },
  },
  execute: async (args) => {
    const cityData = getCity(args.city as string);
    if (!cityData) return JSON.stringify({ error: `City "${args.city}" not found. Available: ${getAllCityNames().join(', ')}` });

    const rivers = cityData.rivers.map(r => {
      const current = +(r.currentLevel + (Math.random() - 0.3) * 0.6).toFixed(2);
      const predicted24h = +(current + (Math.random() - 0.2) * 0.8).toFixed(2);
      const predicted48h = +(predicted24h + (Math.random() - 0.3) * 0.6).toFixed(2);
      const pct = +((current / r.floodLevel) * 100).toFixed(0);
      const trend = current > r.currentLevel + 0.2 ? 'RISING' : current < r.currentLevel - 0.2 ? 'FALLING' : 'STABLE';
      return {
        river: r.name, currentLevel_m: current, normalLevel_m: r.normalLevel,
        floodLevel_m: r.floodLevel, percentOfFloodLevel: pct,
        predicted24h_m: predicted24h, predicted48h_m: predicted48h, trend,
        status: pct >= 100 ? 'FLOOD' : pct >= 85 ? 'CRITICAL' : pct >= 70 ? 'WARNING' : 'NORMAL',
      };
    });

    return JSON.stringify({
      city: cityData.name, region: cityData.region,
      timestamp: new Date().toISOString(), rivers,
      overallStatus: rivers.some(r => r.status === 'FLOOD') ? 'FLOOD'
        : rivers.some(r => r.status === 'CRITICAL') ? 'CRITICAL'
        : rivers.some(r => r.status === 'WARNING') ? 'WARNING' : 'NORMAL',
    }, null, 2);
  },
};

// ── ML-powered flood level forecasting ───────────────────────────────

export const forecastFloodLevels: FloodTool = {
  definition: {
    type: 'function',
    function: {
      name: 'forecast_flood_levels',
      description: `Use the LSTM-PINN machine learning model to forecast river flood levels for the next 6-24 hours with confidence intervals. This provides physics-informed predictions based on real-time sensor and weather data. Available cities: ${getAllCityNames().join(', ')}.`,
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'Name of the UK city' },
          hours: { type: 'number', description: 'Forecast horizon in hours (1-24, default 12)' },
        },
        required: ['city'],
      },
    },
  },
  execute: async (args) => {
    const cityName = args.city as string;
    const hours = Math.min(Math.max(Number(args.hours) || 12, 1), 24);
    const cityData = getCity(cityName);
    if (!cityData) return JSON.stringify({ error: `City "${cityName}" not found. Available: ${getAllCityNames().join(', ')}` });

    // If ML model isn't ready, fall back to heuristic forecast
    if (!isForecastReady()) {
      logger.warn('Forecasting ML model not ready — returning heuristic forecast');
      return JSON.stringify(heuristicForecast(cityData, hours), null, 2);
    }

    try {
      const { features } = await fetchLiveFeatures(cityName);
      const steps = hours * 4; // 15-min intervals
      const result = predictLevels(features, steps);

      const floodLevel = cityData.rivers[0]?.floodLevel ?? 4.0;
      const peakLevel = Math.max(...result.levels);
      const peakIdx = result.levels.indexOf(peakLevel);

      return JSON.stringify({
        city: cityData.name,
        region: cityData.region,
        model: 'LSTM-PINN (Physics-Informed Neural Network)',
        forecastHorizon: `${hours} hours`,
        generatedAt: new Date().toISOString(),
        river: cityData.rivers[0]?.name ?? 'Unknown',
        floodThreshold_m: floodLevel,
        predictions: result.levels.map((level, i) => ({
          timestamp: result.timestamps[i],
          predictedLevel_m: level,
          confidence: result.confidence[i],
          percentOfFloodLevel: +((level / floodLevel) * 100).toFixed(0),
          status: level >= floodLevel ? 'FLOOD' : level >= floodLevel * 0.85 ? 'CRITICAL'
            : level >= floodLevel * 0.7 ? 'WARNING' : 'NORMAL',
        })),
        summary: {
          currentLevel_m: result.levels[0],
          peakLevel_m: peakLevel,
          peakTime: result.timestamps[peakIdx],
          peakConfidence: result.confidence[peakIdx],
          exceedsFloodThreshold: peakLevel >= floodLevel,
          overallTrend: result.levels[result.levels.length - 1] > result.levels[0] ? 'RISING' : 'FALLING',
        },
        dataSource: 'EA Flood Monitoring API + Open-Meteo + LSTM-PINN model',
      }, null, 2);
    } catch (err) {
      logger.error({ err, city: cityName }, 'ML forecast failed — falling back to heuristic');
      return JSON.stringify(heuristicForecast(cityData, hours), null, 2);
    }
  },
};

function heuristicForecast(city: NonNullable<ReturnType<typeof getCity>>, hours: number) {
  const river = city.rivers[0];
  if (!river) return { error: 'No river data available for this city' };
  const levels: { time: string; level: number }[] = [];
  let current = river.currentLevel + (Math.random() - 0.3) * 0.4;
  for (let h = 0; h < hours; h++) {
    current += (Math.random() - 0.4) * 0.15;
    current = Math.max(0, current);
    levels.push({ time: new Date(Date.now() + h * 3_600_000).toISOString(), level: +current.toFixed(3) });
  }
  return {
    city: city.name, model: 'Heuristic (ML model not loaded)', river: river.name,
    floodThreshold_m: river.floodLevel, predictions: levels,
    note: 'This is a heuristic estimate. The LSTM-PINN model will provide higher-accuracy forecasts once initialised.',
  };
}
