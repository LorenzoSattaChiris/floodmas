// ─── FloodMAS Tools — Map Layer Data Access ───────────────────────────
// 13 tools that connect agent queries to the live and static data
// behind each map layer. Each tool wraps an existing service and
// returns a concise, agent-readable JSON summary — never raw GeoJSON.

import type { FloodTool } from '../agents/types.js';
import { getCity, getAllCityNames } from '../data/ukCities.js';
import {
  getFloodWarningsBySeverity,
  getStations,
  getFloodAreas,
} from '../services/ea-api.js';
import { getNRFAStations } from '../services/nrfa.js';
import {
  getPrecipitationGrid,
  getRiverDischarge,
  getSoilMoistureGrid,
} from '../services/open-meteo.js';
import { getFloodRiskAreas } from '../services/datasets.js';
import { getLLFABoundaries } from '../services/llfa.js';
import { getIMDByLAD, getIMDSummary } from '../services/imd.js';
import {
  getFloodDefences,
  getHistoricFloods,
  getMainRivers,
} from '../services/arcgis.js';
import {
  getAtmosphericOrders,
  getAtmosphericOrderFiles,
  getAtmosphericRuns,
} from '../services/metoffice.js';
import { logger } from '../logger.js';

// ── Helpers ───────────────────────────────────────────────────────────

const CITY_HELP = `Available cities: ${getAllCityNames().join(', ')}.`;

/** Build a bbox of ±radius degrees around a lat/lon point */
function cityBbox(lat: number, lon: number, radius = 0.5) {
  return { xmin: lon - radius, ymin: lat - radius, xmax: lon + radius, ymax: lat + radius };
}

/** Haversine distance in km */
function distKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Return N nearest points from a lat/lon array, sorted by distance */
function nearestPoints<T extends { lat: number; lon: number; name: string }>(
  points: T[],
  cityLat: number,
  cityLon: number,
  n = 5,
): Array<T & { distanceKm: number }> {
  return points
    .map(p => ({ ...p, distanceKm: +distKm(cityLat, cityLon, p.lat, p.lon).toFixed(1) }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, n);
}

// ─── 1. Live Flood Warnings ───────────────────────────────────────────
// Monitoring agent — backs the flood-warnings layer

export const queryLiveFloodWarnings: FloodTool = {
  definition: {
    type: 'function',
    function: {
      name: 'query_live_flood_warnings',
      description:
        'Fetch current active flood warnings and alerts directly from the Environment Agency API. ' +
        'Returns severity breakdown, affected rivers, and warning messages. ' +
        'Use this to obtain the real-time data shown on the flood-warnings map layer.',
      parameters: {
        type: 'object',
        properties: {
          min_severity: {
            type: 'number',
            description: 'Minimum severity: 1=Severe flood warning, 2=Flood warning, 3=Flood alert (default: 3)',
          },
          limit: {
            type: 'number',
            description: 'Max warnings to return (default: 20, max 50)',
          },
        },
      },
    },
  },
  execute: async (args) => {
    const minSeverity = Number(args.min_severity) || 3;
    const limit = Math.min(Number(args.limit) || 20, 50);
    try {
      const data = await getFloodWarningsBySeverity(minSeverity);
      const items = ((data?.items as any[]) || []).slice(0, limit);
      const counts = { severe: 0, warning: 0, alert: 0 };
      for (const w of items) {
        if (w.severityLevel === 1) counts.severe++;
        else if (w.severityLevel === 2) counts.warning++;
        else counts.alert++;
      }
      return JSON.stringify({
        totalActive: items.length,
        severityCounts: counts,
        warnings: items.map((w: any) => ({
          id: w.floodAreaID,
          severity: w.severity,
          severityLevel: w.severityLevel,
          description: w.description,
          eaArea: w.eaAreaName,
          river: w.floodArea?.riverOrSea,
          timeRaised: w.timeRaised,
          message: (w.message as string | undefined)?.slice(0, 250),
        })),
        dataSource: 'Environment Agency Flood Monitoring API',
        timestamp: new Date().toISOString(),
      }, null, 2);
    } catch (err) {
      logger.error({ err }, 'query_live_flood_warnings failed');
      return JSON.stringify({ error: String(err) });
    }
  },
};

// ─── 2. EA Monitoring Stations ────────────────────────────────────────
// Monitoring agent — backs rainfall-stations, tidal-stations, groundwater-stations layers

export const queryEAStations: FloodTool = {
  definition: {
    type: 'function',
    function: {
      name: 'query_ea_stations',
      description:
        `Query Environment Agency monitoring stations near a UK city by type. ` +
        `Use this to get data from the rainfall-stations, tidal-stations, or groundwater-stations map layers. ${CITY_HELP}`,
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'UK city name' },
          station_type: {
            type: 'string',
            enum: ['rainfall', 'tidal', 'groundwater', 'all'],
            description: 'Station type to query (default: all)',
          },
        },
        required: ['city'],
      },
    },
  },
  execute: async (args) => {
    const cityData = getCity(args.city as string);
    if (!cityData) return JSON.stringify({ error: `City not found. ${CITY_HELP}` });
    const stationType = (args.station_type as string) || 'all';
    const typeMap: Record<string, string> = {
      rainfall: 'Raingauge',
      tidal: 'Coastal',
      groundwater: 'Groundwater',
    };
    try {
      const params: Record<string, string> = {};
      if (stationType !== 'all' && typeMap[stationType]) params['type'] = typeMap[stationType];
      const data = await getStations(params);
      const all: any[] = (data?.items as any[]) || [];
      const nearby = all
        .filter((s: any) => s.lat && s.long)
        .map((s: any) => ({
          ...s,
          _d: distKm(cityData.coordinates.lat, cityData.coordinates.lon, s.lat, s.long),
        }))
        .filter((s: any) => s._d <= 50)
        .sort((a: any, b: any) => a._d - b._d)
        .slice(0, 25);
      return JSON.stringify({
        city: cityData.name,
        stationType,
        count: nearby.length,
        stations: nearby.map((s: any) => ({
          id: s.stationReference,
          name: s.label,
          type: s.type,
          lat: s.lat,
          lon: s.long,
          distanceKm: +s._d.toFixed(1),
          status: s.status,
          river: s.riverName,
          catchmentName: s.catchmentName,
        })),
        dataSource: 'Environment Agency Flood Monitoring API',
      }, null, 2);
    } catch (err) {
      logger.error({ err }, 'query_ea_stations failed');
      return JSON.stringify({ error: String(err) });
    }
  },
};

// ─── 3. NRFA Gauging Stations ─────────────────────────────────────────
// Monitoring agent — backs the nrfa-stations layer

export const queryNRFAStations: FloodTool = {
  definition: {
    type: 'function',
    function: {
      name: 'query_nrfa_stations',
      description:
        `Query NRFA (National River Flow Archive) river gauging stations near a UK city. ` +
        `~1,500+ UKCEH stations with historical flow data. Backs the nrfa-stations map layer. ${CITY_HELP}`,
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'UK city name' },
          radius_km: {
            type: 'number',
            description: 'Search radius in km (default: 50, max 150)',
          },
        },
        required: ['city'],
      },
    },
  },
  execute: async (args) => {
    const cityData = getCity(args.city as string);
    if (!cityData) return JSON.stringify({ error: `City not found. ${CITY_HELP}` });
    const radiusKm = Math.min(Number(args.radius_km) || 50, 150);
    try {
      const { stations, generatedAt } = await getNRFAStations();
      const nearby = stations
        .map(s => ({
          ...s,
          distanceKm: +distKm(cityData.coordinates.lat, cityData.coordinates.lon, s.latitude, s.longitude).toFixed(1),
        }))
        .filter(s => s.distanceKm <= radiusKm)
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .slice(0, 20);
      return JSON.stringify({
        city: cityData.name,
        radiusKm,
        count: nearby.length,
        stations: nearby.map(s => ({
          id: s.id,
          name: s.name,
          river: s.river,
          lat: s.latitude,
          lon: s.longitude,
          distanceKm: s.distanceKm,
          catchmentArea_km2: s.catchmentArea,
        })),
        generatedAt,
        dataSource: 'UKCEH National River Flow Archive',
      }, null, 2);
    } catch (err) {
      logger.error({ err }, 'query_nrfa_stations failed');
      return JSON.stringify({ error: String(err) });
    }
  },
};

// ─── 4. Precipitation Data ────────────────────────────────────────────
// Forecasting agent — backs the precipitation layer

export const getPrecipitationData: FloodTool = {
  definition: {
    type: 'function',
    function: {
      name: 'get_precipitation_data',
      description:
        `Get real-time hourly precipitation data from Open-Meteo for the UK grid points nearest to a city. ` +
        `Returns rainfall intensity (mm/h), 3h/6h accumulation, wind speed, and temperature. ` +
        `Backs the precipitation map layer. ${CITY_HELP}`,
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'UK city name' },
        },
        required: ['city'],
      },
    },
  },
  execute: async (args) => {
    const cityData = getCity(args.city as string);
    if (!cityData) return JSON.stringify({ error: `City not found. ${CITY_HELP}` });
    try {
      const grid = await getPrecipitationGrid();
      const nearest = nearestPoints(grid.points, cityData.coordinates.lat, cityData.coordinates.lon, 5);
      return JSON.stringify({
        city: cityData.name,
        generatedAt: grid.generatedAt,
        nearestGridPoints: nearest.map(p => ({
          name: p.name,
          distanceKm: p.distanceKm,
          current_rain_mm_h: p.current_rain_mm,
          rain_next_3h_mm: p.rain_next_3h_mm,
          rain_next_6h_mm: p.rain_next_6h_mm,
          temperature_c: p.temperature_c,
          wind_speed_kmh: p.wind_speed_kmh,
          wind_direction_deg: p.wind_direction,
          weatherCode: p.weather_code,
        })),
        dataSource: 'Open-Meteo (free, no API key required)',
      }, null, 2);
    } catch (err) {
      logger.error({ err }, 'get_precipitation_data failed');
      return JSON.stringify({ error: String(err) });
    }
  },
};

// ─── 5. River Discharge Forecast ──────────────────────────────────────
// Forecasting agent — backs the river-discharge layer

export const getRiverDischargeData: FloodTool = {
  definition: {
    type: 'function',
    function: {
      name: 'get_river_discharge_data',
      description:
        `Get river discharge forecast from the Open-Meteo Flood API at a city's coordinates. ` +
        `Returns current discharge (m³/s), max in next 24h and 72h, and flood risk level. ` +
        `Backs the river-discharge map layer. ${CITY_HELP}`,
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'UK city name' },
        },
        required: ['city'],
      },
    },
  },
  execute: async (args) => {
    const cityData = getCity(args.city as string);
    if (!cityData) return JSON.stringify({ error: `City not found. ${CITY_HELP}` });
    try {
      const { lat, lon } = cityData.coordinates;
      const result = await getRiverDischarge([{ lat, lon }]);
      const p = result.points[0];
      return JSON.stringify({
        city: cityData.name,
        coordinates: { lat, lon },
        discharge: p
          ? {
              current_m3s: p.discharge_m3s,
              max_next_24h_m3s: p.discharge_max_24h,
              max_next_72h_m3s: p.discharge_max_72h,
              floodRiskLevel:
                p.discharge_max_24h > 500 ? 'VERY HIGH' :
                p.discharge_max_24h > 200 ? 'HIGH' :
                p.discharge_max_24h > 50  ? 'MODERATE' :
                p.discharge_max_24h > 10  ? 'LOW-MODERATE' : 'LOW',
            }
          : null,
        generatedAt: result.generatedAt,
        dataSource: 'Open-Meteo Flood API (global river discharge forecast)',
      }, null, 2);
    } catch (err) {
      logger.error({ err }, 'get_river_discharge_data failed');
      return JSON.stringify({ error: String(err) });
    }
  },
};

// ─── 6. Soil Moisture Data ────────────────────────────────────────────
// Forecasting agent — backs the soil-moisture layer

export const getSoilMoistureData: FloodTool = {
  definition: {
    type: 'function',
    function: {
      name: 'get_soil_moisture_data',
      description:
        `Get current soil moisture data from Open-Meteo for UK grid points near a city. ` +
        `Values >0.3 m³/m³ indicate saturated ground with high surface water flood risk. ` +
        `Backs the soil-moisture map layer. ${CITY_HELP}`,
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'UK city name' },
        },
        required: ['city'],
      },
    },
  },
  execute: async (args) => {
    const cityData = getCity(args.city as string);
    if (!cityData) return JSON.stringify({ error: `City not found. ${CITY_HELP}` });
    try {
      const grid = await getSoilMoistureGrid();
      const nearest = nearestPoints(grid.points, cityData.coordinates.lat, cityData.coordinates.lon, 5);
      return JSON.stringify({
        city: cityData.name,
        generatedAt: grid.generatedAt,
        nearestGridPoints: nearest.map(p => ({
          name: p.name,
          distanceKm: p.distanceKm,
          moisture_0_7cm_m3m3: p.moisture_0_7cm,
          moisture_7_28cm_m3m3: p.moisture_7_28cm,
          saturationLevel:
            p.moisture_0_7cm >= 0.4 ? 'SATURATED' :
            p.moisture_0_7cm >= 0.3 ? 'VERY WET' :
            p.moisture_0_7cm >= 0.2 ? 'MOIST' :
            p.moisture_0_7cm >= 0.1 ? 'NORMAL' : 'DRY',
          temperature_c: p.temperature_c,
        })),
        interpretation: 'SATURATED/VERY WET ground significantly increases surface water and flash flood risk',
        dataSource: 'Open-Meteo (free, no API key required)',
      }, null, 2);
    } catch (err) {
      logger.error({ err }, 'get_soil_moisture_data failed');
      return JSON.stringify({ error: String(err) });
    }
  },
};

// ─── 7. Flood Warning Areas ───────────────────────────────────────────
// Risk Analysis agent — backs the flood-warning-areas layer

export const queryFloodWarningAreas: FloodTool = {
  definition: {
    type: 'function',
    function: {
      name: 'query_flood_warning_areas',
      description:
        'Query EA flood warning and alert area boundaries — the official zones used by the Environment Agency for issuing warnings. ' +
        'Returns area names, associated rivers, and EA regions. Backs the flood-warning-areas map layer.',
      parameters: {
        type: 'object',
        properties: {
          area_type: {
            type: 'string',
            enum: ['FloodWarningArea', 'FloodAlertArea', 'all'],
            description: 'Area type to query: FloodWarningArea (more severe), FloodAlertArea, or all (default: FloodWarningArea)',
          },
          limit: {
            type: 'number',
            description: 'Maximum records to return (default: 30, max 100)',
          },
        },
      },
    },
  },
  execute: async (args) => {
    const areaType = (args.area_type as string) || 'FloodWarningArea';
    const limit = Math.min(Number(args.limit) || 30, 100);
    try {
      const typeFilter = areaType === 'all' ? undefined : areaType as 'FloodWarningArea' | 'FloodAlertArea';
      const data = await getFloodAreas(typeFilter);
      const items = ((data?.items as any[]) || []).slice(0, limit);
      return JSON.stringify({
        areaType,
        count: items.length,
        areas: items.map((a: any) => ({
          id: a.notation,
          name: a.label,
          river: a.riverOrSea,
          eaArea: a.eaAreaName,
          eaRegion: a.eaRegionName,
          description: (a.description as string | undefined)?.slice(0, 120),
        })),
        dataSource: 'Environment Agency Flood Areas API',
      }, null, 2);
    } catch (err) {
      logger.error({ err }, 'query_flood_warning_areas failed');
      return JSON.stringify({ error: String(err) });
    }
  },
};

// ─── 8. Flood Risk Areas (APSFR) ─────────────────────────────────────
// Risk Analysis agent — backs the flood-risk-areas layer

export const queryFloodRiskAreas: FloodTool = {
  definition: {
    type: 'function',
    function: {
      name: 'query_flood_risk_areas',
      description:
        `Query Defra Areas of Potentially Significant Flood Risk (APSFR) — areas where flood risk justifies targeted management. ` +
        `Can filter by city proximity and flood source type. Backs the flood-risk-areas map layer. ${CITY_HELP}`,
      parameters: {
        type: 'object',
        properties: {
          city: {
            type: 'string',
            description: 'UK city to find nearby APSFR areas (optional — omit for national overview)',
          },
          flood_source: {
            type: 'string',
            enum: ['Fluvial', 'Tidal', 'Surface Water', 'all'],
            description: 'Flood source type to filter by (default: all)',
          },
        },
      },
    },
  },
  execute: async (args) => {
    const floodSource = (args.flood_source as string) || 'all';
    try {
      const geoJSON = getFloodRiskAreas();
      let features = geoJSON.features;
      if (floodSource !== 'all') {
        features = features.filter(f => f.properties.flood_source === floodSource);
      }
      let locationLabel = 'All England';
      if (args.city) {
        const cityData = getCity(args.city as string);
        if (cityData) {
          locationLabel = cityData.name;
          const { lat, lon } = cityData.coordinates;
          features = features.filter(f => {
            try {
              const ring = f.geometry.coordinates[0];
              if (!ring?.length) return false;
              const avgLon = ring.reduce((s, c) => s + c[0], 0) / ring.length;
              const avgLat = ring.reduce((s, c) => s + c[1], 0) / ring.length;
              return distKm(lat, lon, avgLat, avgLon) <= 80;
            } catch { return false; }
          });
        }
      }
      const sourceBreakdown: Record<string, number> = {};
      for (const f of features) {
        const src = f.properties.flood_source || 'Unknown';
        sourceBreakdown[src] = (sourceBreakdown[src] || 0) + 1;
      }
      return JSON.stringify({
        location: locationLabel,
        floodSourceFilter: floodSource,
        count: features.length,
        sourceBreakdown,
        areas: features.slice(0, 30).map(f => ({
          id: f.properties.fra_id,
          name: f.properties.fra_name,
          floodSource: f.properties.flood_source,
          cycle: f.properties.frr_cycle,
        })),
        dataSource: 'Defra / Environment Agency — Areas of Potentially Significant Flood Risk (APSFR)',
      }, null, 2);
    } catch (err) {
      logger.error({ err }, 'query_flood_risk_areas failed');
      return JSON.stringify({ error: String(err) });
    }
  },
};

// ─── 9. LLFA Boundaries & Strategy ───────────────────────────────────
// Risk Analysis agent — backs the llfa-boundaries layer

export const queryLLFA: FloodTool = {
  definition: {
    type: 'function',
    function: {
      name: 'query_llfa',
      description:
        `Query Lead Local Flood Authority (LLFA) boundaries and Local Flood Risk Management Strategy (LFRMS) quality data. ` +
        `Reveals local governance capacity, strategy quality scores, and key term mentions for flood adaptation. ` +
        `Backs the llfa-boundaries map layer. ${CITY_HELP}`,
      parameters: {
        type: 'object',
        properties: {
          city: {
            type: 'string',
            description: 'UK city name to find the LLFA(s) serving that area',
          },
        },
        required: ['city'],
      },
    },
  },
  execute: async (args) => {
    const cityData = getCity(args.city as string);
    if (!cityData) return JSON.stringify({ error: `City not found. ${CITY_HELP}` });
    try {
      const geoJSON = getLLFABoundaries();
      const { lat, lon } = cityData.coordinates;
      const nearby = geoJSON.features
        .filter(f => {
          const fLon = f.properties.LONG;
          const fLat = f.properties.LAT;
          return fLon && fLat && distKm(lat, lon, fLat, fLon) <= 60;
        })
        .slice(0, 10);
      return JSON.stringify({
        city: cityData.name,
        llfasFound: nearby.length,
        authorities: nearby.map(f => {
          const p = f.properties;
          return {
            code: p.CTYUA24CD,
            name: p.CTYUA24NM,
            hasStrategy: p.hasStrategy,
            centroid: { lat: p.LAT, lon: p.LONG },
            ...(p.strategy
              ? {
                  yearPublished: p.strategy.yearPublished,
                  isLivingDocument: p.strategy.isLivingDocument,
                  quality: {
                    clearObjectives: p.strategy.quality?.clearObjectives,
                    climateChangeScenarios: p.strategy.quality?.climateChangeScenarios,
                    surfaceWaterMeasures: p.strategy.quality?.surfaceWaterMeasures,
                    fcermAlignment: p.strategy.quality?.fcermAlignment,
                  },
                  keyTermMentions: {
                    suds: p.strategy.termMentions?.suds,
                    nfm: p.strategy.termMentions?.nfm,
                    climateChange: p.strategy.termMentions?.climateChange,
                    resilience: p.strategy.termMentions?.resilience,
                    natureBasedSolutions: p.strategy.termMentions?.natureBasedSolutions,
                  },
                  stakeholders: {
                    eaMentions: p.strategy.stakeholders?.eaMentions,
                    publicMentions: p.strategy.stakeholders?.publicMentions,
                  },
                }
              : {}),
          };
        }),
        nationalContext: {
          totalLLFAs: geoJSON.features.length,
          withStrategy: geoJSON.features.filter(f => f.properties.hasStrategy).length,
        },
        dataSource: 'ONS County/Unitary Authority Boundaries Dec 2024 + Russell LFRMS Audit 2022',
      }, null, 2);
    } catch (err) {
      logger.error({ err }, 'query_llfa failed');
      return JSON.stringify({ error: String(err) });
    }
  },
};

// ─── 10. IMD Deprivation ──────────────────────────────────────────────
// Risk Analysis agent — backs the imd-deprivation layer

export const queryIMDDeprivation: FloodTool = {
  definition: {
    type: 'function',
    function: {
      name: 'query_imd_deprivation',
      description:
        `Query Index of Multiple Deprivation (IMD) 2019 data by local authority or area name. ` +
        `Reveals compound flood+deprivation vulnerability — deprived communities face the highest flood impact and slowest recovery. ` +
        `Accepts a city name or a specific Local Authority District (LAD) name. Backs the imd-deprivation map layer. ${CITY_HELP}`,
      parameters: {
        type: 'object',
        properties: {
          city: {
            type: 'string',
            description: 'UK city name (uses city coordinates for context, searches by city name)',
          },
          lad_name: {
            type: 'string',
            description: 'Local Authority District name for direct lookup (e.g. "City of York", "Westminster", "Leeds"). Overrides city if provided.',
          },
        },
      },
    },
  },
  execute: async (args) => {
    const searchName = (args.lad_name as string | undefined)
      || (args.city ? (getCity(args.city as string)?.name ?? (args.city as string)) : undefined)
      || '';
    if (!searchName) return JSON.stringify({ error: 'Provide city or lad_name parameter.' });
    try {
      const records = getIMDByLAD(searchName);
      if (!records.length) {
        const summary = getIMDSummary();
        return JSON.stringify({
          note: `No LSOA records found for LAD matching "${searchName}". Try a more specific LAD name (e.g. "City of York", "Leeds", "Westminster").`,
          nationalSummary: summary,
        }, null, 2);
      }
      const avgDecile = +(records.reduce((s, r) => s + r.imdDecile, 0) / records.length).toFixed(1);
      const decileDist: Record<number, number> = {};
      for (const r of records) {
        decileDist[r.imdDecile] = (decileDist[r.imdDecile] || 0) + 1;
      }
      return JSON.stringify({
        area: searchName,
        totalLSOAs: records.length,
        averageDecile: avgDecile,
        overallDeprivationLevel:
          avgDecile <= 2 ? 'VERY HIGH' :
          avgDecile <= 4 ? 'HIGH' :
          avgDecile <= 6 ? 'MODERATE' :
          avgDecile <= 8 ? 'LOW' : 'VERY LOW',
        decileDistribution: decileDist,
        top10MostDeprived: records.slice(0, 10).map(r => ({
          lsoaCode: r.lsoaCode,
          lsoaName: r.lsoaName,
          imdDecile: r.imdDecile,
          imdScore: +r.imdScore.toFixed(2),
          imdRank: r.imdRank,
          incomeDecile: r.incomeDecile,
          healthDecile: r.healthDecile,
          crimeDecile: r.crimeDecile,
          population: r.totalPop,
        })),
        interpretation:
          'Decile 1 = most deprived 10% of England. Lower average decile = higher compound flood+deprivation risk.',
        dataSource: 'MHCLG English Indices of Deprivation 2019 (File 7 — all scores, ranks, deciles)',
      }, null, 2);
    } catch (err) {
      logger.error({ err }, 'query_imd_deprivation failed');
      return JSON.stringify({ error: String(err) });
    }
  },
};

// ─── 11. Flood Defences ───────────────────────────────────────────────
// Emergency Response agent — backs the flood-defences layer

export const queryFloodDefences: FloodTool = {
  definition: {
    type: 'function',
    function: {
      name: 'query_flood_defences',
      description:
        `Query Defra spatial flood defence features (walls, embankments, tide gates, barriers) near a UK city. ` +
        `Returns type breakdown and feature summaries. Backs the flood-defences map layer. ${CITY_HELP}`,
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'UK city name' },
          radius_deg: {
            type: 'number',
            description: 'Search radius in degrees (default: 0.5 ≈ 55 km)',
          },
        },
        required: ['city'],
      },
    },
  },
  execute: async (args) => {
    const cityData = getCity(args.city as string);
    if (!cityData) return JSON.stringify({ error: `City not found. ${CITY_HELP}` });
    const radius = Math.min(Number(args.radius_deg) || 0.5, 1.5);
    const bbox = cityBbox(cityData.coordinates.lat, cityData.coordinates.lon, radius);
    try {
      const result = await getFloodDefences(bbox);
      const features = result.features;
      const typeBreakdown: Record<string, number> = {};
      for (const f of features) {
        const t = String(f.properties['Primary_Type'] ?? f.properties['Structure_Type'] ?? 'Unknown');
        typeBreakdown[t] = (typeBreakdown[t] || 0) + 1;
      }
      return JSON.stringify({
        city: cityData.name,
        searchRadius_deg: radius,
        count: features.length,
        typeBreakdown,
        sample: features.slice(0, 20).map(f => ({
          name: f.properties['CommonName'] ?? f.properties['name'] ?? f.properties['OBJECTID'],
          type: f.properties['Primary_Type'] ?? f.properties['Structure_Type'],
          condition: f.properties['Condition'],
          material: f.properties['Material'],
        })),
        dataSource: 'Defra / AECOM — Spatial Flood Defences Open Data',
      }, null, 2);
    } catch (err) {
      logger.error({ err }, 'query_flood_defences failed');
      return JSON.stringify({ error: String(err) });
    }
  },
};

// ─── 12. Historic Flood Outlines ──────────────────────────────────────
// Emergency Response agent — backs the historic-floods layer

export const queryHistoricFloods: FloodTool = {
  definition: {
    type: 'function',
    function: {
      name: 'query_historic_floods',
      description:
        `Query Environment Agency recorded historic flood outline polygons near a UK city. ` +
        `Returns flood events with dates, causes, and sources. Backs the historic-floods map layer. ${CITY_HELP}`,
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'UK city name' },
        },
        required: ['city'],
      },
    },
  },
  execute: async (args) => {
    const cityData = getCity(args.city as string);
    if (!cityData) return JSON.stringify({ error: `City not found. ${CITY_HELP}` });
    const bbox = cityBbox(cityData.coordinates.lat, cityData.coordinates.lon, 0.5);
    try {
      const result = await getHistoricFloods(bbox);
      const features = result.features;
      return JSON.stringify({
        city: cityData.name,
        count: features.length,
        floodEvents: features.slice(0, 20).map(f => ({
          name: f.properties['name'] ?? f.properties['NAME'] ?? f.properties['Site_Name'] ?? f.properties['OBJECTID'],
          date: f.properties['Flood_Date'] ?? f.properties['Year'] ?? f.properties['date'],
          cause: f.properties['Cause_Band'] ?? f.properties['Flood_Cause'],
          source: f.properties['Flood_Source'],
          confidence: f.properties['Confidence'],
        })),
        dataSource: 'Environment Agency — Historic Flood Map (Defra Open Data)',
      }, null, 2);
    } catch (err) {
      logger.error({ err }, 'query_historic_floods failed');
      return JSON.stringify({ error: String(err) });
    }
  },
};

// ─── 13. Main Rivers ──────────────────────────────────────────────────
// Emergency Response agent — backs the main-rivers layer

export const queryMainRivers: FloodTool = {
  definition: {
    type: 'function',
    function: {
      name: 'query_main_rivers',
      description:
        `Query EA statutory main rivers (legally defined watercourses managed by the Environment Agency) near a UK city. ` +
        `Returns river names and segment count. Backs the main-rivers map layer. ${CITY_HELP}`,
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'UK city name' },
        },
        required: ['city'],
      },
    },
  },
  execute: async (args) => {
    const cityData = getCity(args.city as string);
    if (!cityData) return JSON.stringify({ error: `City not found. ${CITY_HELP}` });
    const bbox = cityBbox(cityData.coordinates.lat, cityData.coordinates.lon, 0.5);
    try {
      const result = await getMainRivers(bbox);
      const features = result.features;
      const riverNames = [
        ...new Set(
          features
            .map(f => String(f.properties['WATERCOURSE'] ?? f.properties['name'] ?? ''))
            .filter(Boolean),
        ),
      ].slice(0, 20);
      return JSON.stringify({
        city: cityData.name,
        totalSegments: features.length,
        uniqueRivers: riverNames.length,
        rivers: riverNames,
        note: 'EA-managed statutory main rivers. Secondary/ordinary watercourses are LLFA responsibility.',
        dataSource: 'Environment Agency — Statutory Main River Map (Open Data)',
      }, null, 2);
    } catch (err) {
      logger.error({ err }, 'query_main_rivers failed');
      return JSON.stringify({ error: String(err) });
    }
  },
};

// ─── Met Office Atmospheric Models (NWP) ─────────────────────────────

export const queryAtmosphericModels: FloodTool = {
  definition: {
    type: 'function',
    function: {
      name: 'query_atmospheric_models',
      description:
        `Query Met Office Atmospheric Models API for NWP (Numerical Weather Prediction) data status. ` +
        `Returns available data orders, file counts, and latest model run times. ` +
        `Models include UK deterministic 2km, Global 10km, MOGREPS-UK ensemble 2km, MOGREPS-G 20km. ` +
        `Use this to check forecast data freshness, available parameters, and model run schedules. ` +
        `Set action to "orders" (list configured data orders), "files" (list files for a specific order), or "runs" (list latest model runs).`,
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['orders', 'files', 'runs'],
            description: 'What to query: "orders" for configured data orders, "files" for files in a specific order, "runs" for latest model run times',
          },
          orderId: {
            type: 'string',
            description: 'Order ID (required when action is "files")',
          },
          modelId: {
            type: 'string',
            description: 'Optional model ID filter for runs (e.g. "mo-atmospheric-global-prd")',
          },
        },
        required: ['action'],
      },
    },
  },
  execute: async (args) => {
    const action = args.action as string;
    try {
      if (action === 'orders') {
        const data = await getAtmosphericOrders();
        return JSON.stringify({
          orderCount: data.orders.length,
          orders: data.orders,
          fetchedAt: data.fetchedAt,
          note: 'Each order is pre-configured on the Met Office DataHub portal with specific model, region, parameters, and timesteps.',
          dataSource: 'Met Office Atmospheric Models API v2',
        }, null, 2);
      }
      if (action === 'files') {
        const orderId = args.orderId as string;
        if (!orderId) return JSON.stringify({ error: 'orderId is required when action is "files"' });
        const data = await getAtmosphericOrderFiles(orderId);
        return JSON.stringify({
          orderId: data.orderId,
          fileCount: data.fileCount,
          files: data.files.slice(0, 20),
          truncated: data.files.length > 20,
          fetchedAt: data.fetchedAt,
          note: 'Files are GRIB2 format containing gridded NWP forecast fields.',
          dataSource: 'Met Office Atmospheric Models API v2',
        }, null, 2);
      }
      if (action === 'runs') {
        const modelId = args.modelId as string | undefined;
        const data = await getAtmosphericRuns(modelId);
        return JSON.stringify({
          modelId: data.modelId,
          runCount: data.runs.length,
          runs: data.runs,
          fetchedAt: data.fetchedAt,
          note: 'Model runs are produced multiple times daily (typically 00Z, 06Z, 12Z, 18Z for deterministic; varies for ensemble).',
          dataSource: 'Met Office Atmospheric Models API v2',
        }, null, 2);
      }
      return JSON.stringify({ error: `Unknown action "${action}". Use "orders", "files", or "runs".` });
    } catch (err) {
      logger.error({ err }, 'query_atmospheric_models failed');
      return JSON.stringify({ error: String(err) });
    }
  },
};
