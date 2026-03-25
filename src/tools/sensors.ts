// ─── FloodMAS Tools — IoT Sensor Network ─────────────────────────────

import type { FloodTool } from '../agents/types.js';
import { getCity, getAllCityNames } from '../data/ukCities.js';
import { generateSensorSnapshot, detectAnomalies } from '../data/sensorReadings.js';

export const readSensorNetwork: FloodTool = {
  definition: {
    type: 'function',
    function: {
      name: 'read_sensor_network',
      description: `Read live IoT sensor data from the flood monitoring network for a UK city. Returns river level, rainfall, soil moisture, flow rate, and groundwater level. Available: ${getAllCityNames().join(', ')}.`,
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
    return JSON.stringify(generateSensorSnapshot(cityData), null, 2);
  },
};

export const detectSensorAnomalies: FloodTool = {
  definition: {
    type: 'function',
    function: {
      name: 'detect_sensor_anomalies',
      description: `Run anomaly detection on the sensor network for a UK city. Compares sensor readings against thresholds and returns warnings, alerts, or critical breaches. Available: ${getAllCityNames().join(', ')}.`,
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
    const snapshot = generateSensorSnapshot(cityData);
    return JSON.stringify(detectAnomalies(snapshot), null, 2);
  },
};
