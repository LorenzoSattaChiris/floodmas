// ─── FloodMAS — Tool Registry ────────────────────────────────────────
// Central mapping from tool-name → FloodTool (definition + execute)

import type { FloodTool } from '../agents/types.js';

import { getWeatherForecast, getRiverLevels, forecastFloodLevels } from './weather.js';
import { readSensorNetwork, detectSensorAnomalies } from './sensors.js';
import { getFloodZoneInfo, assessInfrastructureVulnerability, estimatePopulationAtRisk, predictFloodRiskTool } from './riskData.js';
import { generateFloodAlert, planEvacuation, allocateResources, escalateEmergency } from './emergency.js';
import {
  queryLiveFloodWarnings,
  queryEAStations,
  queryNRFAStations,
  getPrecipitationData,
  getRiverDischargeData,
  getSoilMoistureData,
  queryFloodWarningAreas,
  queryFloodRiskAreas,
  queryLLFA,
  queryIMDDeprivation,
  queryFloodDefences,
  queryHistoricFloods,
  queryMainRivers,
  queryAtmosphericModels,
} from './layers.js';

/** All available tools keyed by their OpenAI function name */
export const TOOL_REGISTRY: ReadonlyMap<string, FloodTool> = new Map<string, FloodTool>([
  ['get_weather_forecast', getWeatherForecast],
  ['get_river_levels', getRiverLevels],
  ['forecast_flood_levels', forecastFloodLevels],
  ['read_sensor_network', readSensorNetwork],
  ['detect_sensor_anomalies', detectSensorAnomalies],
  ['get_flood_zone_info', getFloodZoneInfo],
  ['assess_infrastructure_vulnerability', assessInfrastructureVulnerability],
  ['estimate_population_at_risk', estimatePopulationAtRisk],
  ['predict_flood_risk', predictFloodRiskTool],
  ['generate_flood_alert', generateFloodAlert],
  ['plan_evacuation', planEvacuation],
  ['allocate_resources', allocateResources],
  ['escalate_emergency', escalateEmergency],
  // Map layer data access tools
  ['query_live_flood_warnings', queryLiveFloodWarnings],
  ['query_ea_stations', queryEAStations],
  ['query_nrfa_stations', queryNRFAStations],
  ['get_precipitation_data', getPrecipitationData],
  ['get_river_discharge_data', getRiverDischargeData],
  ['get_soil_moisture_data', getSoilMoistureData],
  ['query_flood_warning_areas', queryFloodWarningAreas],
  ['query_flood_risk_areas', queryFloodRiskAreas],
  ['query_llfa', queryLLFA],
  ['query_imd_deprivation', queryIMDDeprivation],
  ['query_flood_defences', queryFloodDefences],
  ['query_historic_floods', queryHistoricFloods],
  ['query_main_rivers', queryMainRivers],
  ['query_atmospheric_models', queryAtmosphericModels],
]);

/** Get tool definitions for a subset of tool names (for specialist agents) */
export function getToolDefinitions(names: readonly string[]) {
  return names
    .map((n) => TOOL_REGISTRY.get(n))
    .filter((t): t is FloodTool => t !== undefined)
    .map((t) => t.definition);
}

/** Execute a tool by name, returning the JSON result string */
export async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  const tool = TOOL_REGISTRY.get(name);
  if (!tool) return JSON.stringify({ error: `Unknown tool: ${name}` });
  return tool.execute(args);
}
