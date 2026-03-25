// ─── FloodMAS — Simulated IoT Sensor Readings ───────────────────────
// Generates realistic time-varying sensor data using sinusoidal base
// + stochastic noise + anomaly spikes.

import type { CityData, RiverData } from './ukCities.js';

function generateReading(base: number, amplitude: number, noiseScale: number, min = 0): number {
  const hour = new Date().getHours();
  const dayPhase = Math.sin((hour / 24) * Math.PI * 2 - Math.PI / 2);
  const noise = (Math.random() - 0.5) * 2 * noiseScale;
  const anomalySpike = Math.random() > 0.92 ? amplitude * 0.8 : 0;
  return Math.max(min, +(base + amplitude * dayPhase + noise + anomalySpike).toFixed(2));
}

interface Thresholds { normal: number; warning: number; alert: number; critical: number }
type SensorGenerator = (river: RiverData) => number;
type ThresholdGenerator = (river: RiverData) => Thresholds;

const SENSOR_CONFIGS: Record<string, { unit: string; description: string; generate: SensorGenerator; thresholds: ThresholdGenerator }> = {
  riverLevel: {
    unit: 'metres', description: 'River water level above ordnance datum',
    generate: (r) => generateReading(r.currentLevel, 0.4, 0.2, 0),
    thresholds: (r) => ({
      normal: r.normalLevel,
      warning: r.normalLevel + (r.floodLevel - r.normalLevel) * 0.5,
      alert: r.normalLevel + (r.floodLevel - r.normalLevel) * 0.75,
      critical: r.floodLevel,
    }),
  },
  rainfall: {
    unit: 'mm/hr', description: 'Rainfall intensity measured by tipping bucket gauge',
    generate: () => generateReading(2.5, 4.0, 2.0, 0),
    thresholds: () => ({ normal: 4.0, warning: 8.0, alert: 16.0, critical: 30.0 }),
  },
  soilMoisture: {
    unit: '%', description: 'Volumetric water content of topsoil',
    generate: () => generateReading(55, 15, 8, 10),
    thresholds: () => ({ normal: 50, warning: 70, alert: 82, critical: 92 }),
  },
  flowRate: {
    unit: 'm³/s', description: 'River discharge rate measured at gauging station',
    generate: (r) => generateReading(r.currentLevel * 12, 8, 4, 0.5),
    thresholds: (r) => ({
      normal: r.normalLevel * 15,
      warning: r.normalLevel * 25,
      alert: r.floodLevel * 12,
      critical: r.floodLevel * 18,
    }),
  },
  groundwaterLevel: {
    unit: 'metres below ground', description: 'Groundwater table depth from piezometer',
    generate: () => generateReading(3.5, 1.2, 0.5, 0.2),
    thresholds: () => ({ normal: 3.0, warning: 2.0, alert: 1.2, critical: 0.5 }),
  },
};

type SeverityStatus = 'NORMAL' | 'WARNING' | 'ALERT' | 'CRITICAL';

function classifyReading(value: number, thresholds: Thresholds, invert = false): SeverityStatus {
  if (invert) {
    if (value <= thresholds.critical) return 'CRITICAL';
    if (value <= thresholds.alert) return 'ALERT';
    if (value <= thresholds.warning) return 'WARNING';
    return 'NORMAL';
  }
  if (value >= thresholds.critical) return 'CRITICAL';
  if (value >= thresholds.alert) return 'ALERT';
  if (value >= thresholds.warning) return 'WARNING';
  return 'NORMAL';
}

export function generateSensorSnapshot(cityData: CityData) {
  const timestamp = new Date().toISOString();
  const stationCount = Math.min(3, cityData.rivers.length + 1);
  const stations = [];

  for (let i = 0; i < stationCount; i++) {
    const river = cityData.rivers[i % cityData.rivers.length];
    const sensors: Record<string, unknown> = {};

    for (const [sensorType, config] of Object.entries(SENSOR_CONFIGS)) {
      const value = config.generate(river);
      const thresholds = config.thresholds(river);
      const invert = sensorType === 'groundwaterLevel';
      sensors[sensorType] = {
        value, unit: config.unit, description: config.description,
        status: classifyReading(value, thresholds, invert), thresholds,
      };
    }

    stations.push({
      stationId: `${cityData.name.replace(/\s+/g, '-').toUpperCase()}-S${i + 1}`,
      location: `${river.name} monitoring point ${i + 1}`,
      river: river.name, sensors, lastUpdated: timestamp,
      batteryLevel: `${+(85 + Math.random() * 15).toFixed(0)}%`,
      signalStrength: (['Excellent', 'Good', 'Good', 'Fair'] as const)[Math.floor(Math.random() * 4)],
    });
  }

  return { city: cityData.name, region: cityData.region, timestamp, stationCount: stations.length, stations, networkStatus: 'OPERATIONAL' as const };
}

export function detectAnomalies(snapshot: ReturnType<typeof generateSensorSnapshot>) {
  const anomalies: Array<{
    stationId: string; river: string; sensor: string; value: string;
    status: SeverityStatus; threshold: string; message: string;
  }> = [];
  let overallSeverity: SeverityStatus = 'NORMAL';

  for (const station of snapshot.stations) {
    for (const [sensorType, reading] of Object.entries(station.sensors) as Array<[string, { value: number; unit: string; status: SeverityStatus; thresholds: Thresholds }]>) {
      if (reading.status === 'NORMAL') continue;
      anomalies.push({
        stationId: station.stationId, river: station.river, sensor: sensorType,
        value: `${reading.value} ${reading.unit}`, status: reading.status,
        threshold: `${reading.thresholds[reading.status.toLowerCase() as keyof Thresholds]} ${reading.unit}`,
        message: `${reading.status}: ${sensorType} at ${station.location} — ${reading.value} ${reading.unit}`,
      });
      if (reading.status === 'CRITICAL') overallSeverity = 'CRITICAL';
      else if (reading.status === 'ALERT' && overallSeverity !== 'CRITICAL') overallSeverity = 'ALERT';
      else if (reading.status === 'WARNING' && overallSeverity === 'NORMAL') overallSeverity = 'WARNING';
    }
  }

  return {
    city: snapshot.city, timestamp: snapshot.timestamp, overallSeverity,
    anomalyCount: anomalies.length,
    criticalCount: anomalies.filter(a => a.status === 'CRITICAL').length,
    alertCount: anomalies.filter(a => a.status === 'ALERT').length,
    warningCount: anomalies.filter(a => a.status === 'WARNING').length,
    anomalies,
    recommendation: overallSeverity === 'CRITICAL' ? 'IMMEDIATE ACTION REQUIRED — Activate emergency response protocols'
      : overallSeverity === 'ALERT' ? 'Elevated risk — Increase monitoring frequency and prepare emergency services'
      : overallSeverity === 'WARNING' ? 'Monitor closely — Conditions trending above normal'
      : 'All readings within normal parameters',
  };
}
