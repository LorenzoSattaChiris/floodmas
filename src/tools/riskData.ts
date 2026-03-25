// ─── FloodMAS Tools — Risk Analysis & Assessment ─────────────────────

import type { FloodTool } from '../agents/types.js';
import { getCity, getAllCityNames } from '../data/ukCities.js';
import { getInfrastructure, assessVulnerability } from '../data/infrastructure.js';
import { predictRisk, isModelReady as isRiskModelReady } from '../ml/risk/model.js';
import { extractFeatures } from '../ml/risk/feature-engineering.js';
import { logger } from '../logger.js';

export const getFloodZoneInfo: FloodTool = {
  definition: {
    type: 'function',
    function: {
      name: 'get_flood_zone_info',
      description:
        'Get Environment Agency flood zone classification, historical flood events, existing defences, and risk factors for a UK city.',
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

    return JSON.stringify(
      {
        city: cityData.name,
        region: cityData.region,
        floodZone: cityData.floodZone,
        floodZoneDescription: cityData.floodZoneDescription,
        rivers: cityData.rivers.map((r) => r.name),
        historicalFloods: cityData.historicalFloods,
        defences: cityData.defences,
        drainageCapacity: cityData.drainageCapacity,
        population: cityData.population,
        riskFactors: [
          cityData.floodZone === '3b' ? 'Located in functional floodplain — highest risk category' : null,
          cityData.floodZone === '3a' ? 'High probability flood zone — significant annual risk' : null,
          cityData.drainageCapacity === 'low' ? 'Low drainage capacity increases surface water flood risk' : null,
          cityData.historicalFloods.some((f) => f.severity === 'catastrophic') ? 'History of catastrophic flooding events' : null,
          cityData.rivers.length > 2 ? 'Multiple river confluence increases compound flood risk' : null,
        ].filter(Boolean),
      },
      null,
      2,
    );
  },
};

export const assessInfrastructureVulnerability: FloodTool = {
  definition: {
    type: 'function',
    function: {
      name: 'assess_infrastructure_vulnerability',
      description:
        'Assess flood vulnerability of critical infrastructure (hospitals, schools, power, transport) in a city under a specific flood scenario. Returns individual risk levels and actionable recommendations.',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'Name of the UK city' },
          scenario: {
            type: 'string',
            enum: ['minor', 'moderate', 'major', 'catastrophic'],
            description: 'Flood scenario severity level',
          },
        },
        required: ['city', 'scenario'],
      },
    },
  },
  execute: async (args) => {
    return JSON.stringify(
      assessVulnerability(args.city as string, args.scenario as 'minor' | 'moderate' | 'major' | 'catastrophic'),
      null,
      2,
    );
  },
};

export const estimatePopulationAtRisk: FloodTool = {
  definition: {
    type: 'function',
    function: {
      name: 'estimate_population_at_risk',
      description:
        'Estimate the population at risk in a flood scenario, including affected people, displaced persons, vulnerable groups, and resource requirements.',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'Name of the UK city' },
          scenario: {
            type: 'string',
            enum: ['minor', 'moderate', 'major', 'catastrophic'],
            description: 'Flood scenario severity level',
          },
        },
        required: ['city', 'scenario'],
      },
    },
  },
  execute: async (args) => {
    const city = args.city as string;
    const scenario = args.scenario as 'minor' | 'moderate' | 'major' | 'catastrophic';
    const cityData = getCity(city);
    if (!cityData) return JSON.stringify({ error: `City "${city}" not found. Available: ${getAllCityNames().join(', ')}` });

    const riskPct: Record<string, number> = { minor: 0.02, moderate: 0.08, major: 0.18, catastrophic: 0.35 };
    const pct = riskPct[scenario] ?? 0.08;
    const variance = 1 + (Math.random() - 0.5) * 0.3;
    const affected = Math.round(cityData.population * pct * variance);
    const displaced = Math.round(affected * (scenario === 'catastrophic' ? 0.4 : scenario === 'major' ? 0.25 : 0.1));
    const vulnerable = Math.round(affected * 0.22);

    return JSON.stringify(
      {
        city: cityData.name,
        totalPopulation: cityData.population,
        scenario,
        estimatedAffected: affected,
        estimatedDisplaced: displaced,
        vulnerablePersons: vulnerable,
        shelterCapacityNeeded: displaced,
        evacuationVehiclesNeeded: Math.ceil(displaced / 40),
        emergencyPersonnelNeeded: Math.ceil(affected / 200),
        breakdown: {
          directlyFlooded: Math.round(affected * 0.3),
          serviceDisruption: Math.round(affected * 0.45),
          transportImpacted: Math.round(affected * 0.25),
        },
        healthImpact: {
          mentalHealthSupport: `${Math.round(affected * 0.15)} people may require mental health support`,
          physicalInjuryRisk: scenario === 'catastrophic' ? 'HIGH' : scenario === 'major' ? 'MODERATE' : 'LOW',
          waterContaminationRisk:
            scenario === 'catastrophic' || scenario === 'major' ? 'ELEVATED — monitor water quality' : 'LOW',
        },
      },
      null,
      2,
    );
  },
};

// ── ML-powered flood risk prediction ─────────────────────────────────

export const predictFloodRiskTool: FloodTool = {
  definition: {
    type: 'function',
    function: {
      name: 'predict_flood_risk',
      description: `Use the GBT ensemble machine learning model to predict multi-dimensional flood risk scores (overall, property, infrastructure, life, economic) for a UK city. Returns risk level, confidence, and the top contributing factors. Available cities: ${getAllCityNames().join(', ')}.`,
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'Name of the UK city' },
          scenario: {
            type: 'string',
            enum: ['current', 'forecast_24h', 'forecast_72h'],
            description: 'Risk assessment scenario (default: current)',
          },
        },
        required: ['city'],
      },
    },
  },
  execute: async (args) => {
    const cityName = args.city as string;
    const scenario = (args.scenario as 'current' | 'forecast_24h' | 'forecast_72h') ?? 'current';
    const cityData = getCity(cityName);
    if (!cityData) return JSON.stringify({ error: `City "${cityName}" not found. Available: ${getAllCityNames().join(', ')}` });

    if (!isRiskModelReady()) {
      logger.warn('Risk ML model not ready — returning heuristic risk assessment');
      return JSON.stringify(heuristicRisk(cityData, scenario), null, 2);
    }

    try {
      const { features, featureLabels, dataSource } = await extractFeatures(cityName, scenario);
      const result = predictRisk(features);

      return JSON.stringify({
        city: cityData.name,
        region: cityData.region,
        model: 'GBT Ensemble (Dense Network Approximation)',
        scenario,
        generatedAt: new Date().toISOString(),
        riskLevel: result.riskLevel,
        confidence: result.confidence,
        scores: result.scores,
        topFactors: result.featureImportance
          .slice(0, 5)
          .map((f) => ({ factor: featureLabels[parseInt(f.feature.replace('feature_', ''))] ?? f.feature, weight: f.weight })),
        interpretation: {
          overall: describeRisk(result.scores.overall, 'overall flood'),
          property: describeRisk(result.scores.property, 'property damage'),
          infrastructure: describeRisk(result.scores.infrastructure, 'infrastructure disruption'),
          life: describeRisk(result.scores.life, 'life safety'),
          economic: describeRisk(result.scores.economic, 'economic impact'),
        },
        dataSource,
      }, null, 2);
    } catch (err) {
      logger.error({ err, city: cityName }, 'ML risk prediction failed — falling back to heuristic');
      return JSON.stringify(heuristicRisk(cityData, scenario), null, 2);
    }
  },
};

function describeRisk(score: number, domain: string): string {
  if (score >= 0.75) return `CRITICAL ${domain} risk — immediate action required`;
  if (score >= 0.50) return `HIGH ${domain} risk — prepare response measures`;
  if (score >= 0.25) return `MODERATE ${domain} risk — monitor closely`;
  return `LOW ${domain} risk — routine monitoring adequate`;
}

function heuristicRisk(city: NonNullable<ReturnType<typeof getCity>>, scenario: string) {
  const zone = city.floodZone;
  const base = zone === '3b' ? 0.8 : zone === '3a' ? 0.6 : zone === '2' ? 0.35 : 0.15;
  const scenarioMult = scenario === 'forecast_72h' ? 1.3 : scenario === 'forecast_24h' ? 1.15 : 1.0;
  const overall = Math.min(base * scenarioMult, 1);
  return {
    city: city.name, model: 'Heuristic (ML model not loaded)', scenario,
    riskLevel: overall >= 0.75 ? 'CRITICAL' : overall >= 0.50 ? 'HIGH' : overall >= 0.25 ? 'MODERATE' : 'LOW',
    scores: { overall: +overall.toFixed(2), property: +(overall * 0.9).toFixed(2), infrastructure: +(overall * 0.7).toFixed(2), life: +(overall * 0.5).toFixed(2), economic: +(overall * 0.8).toFixed(2) },
    note: 'This is a heuristic estimate. The GBT ensemble model will provide higher-accuracy predictions once initialised.',
  };
}
