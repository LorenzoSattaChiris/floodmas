// ─── FloodMAS Tools — Emergency Response ─────────────────────────────

import type { FloodTool } from '../agents/types.js';
import { getCity, getAllCityNames } from '../data/ukCities.js';
import { getInfrastructure } from '../data/infrastructure.js';
import { getEscalation, getSeverityLevels, type EscalationResult } from '../data/emergencyContacts.js';

// ── Alert generation ─────────────────────────────────────────────────

const ALERT_LEVELS: Record<string, { code: string; colour: string; title: string; action: string }> = {
  low:      { code: 'FLOOD-WATCH',          colour: 'YELLOW',     title: 'Flood Watch',                             action: 'Be Aware' },
  moderate: { code: 'FLOOD-ALERT',          colour: 'AMBER',      title: 'Flood Alert',                             action: 'Be Prepared' },
  high:     { code: 'FLOOD-WARNING',        colour: 'RED',        title: 'Flood Warning',                           action: 'Act Now' },
  critical: { code: 'SEVERE-FLOOD-WARNING', colour: 'RED-SEVERE', title: 'Severe Flood Warning — Danger to Life',   action: 'Immediate Action Required' },
};

export const generateFloodAlert: FloodTool = {
  definition: {
    type: 'function',
    function: {
      name: 'generate_flood_alert',
      description: 'Generate an official-format flood alert for a UK city with severity level, public action guidance, and emergency contacts.',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'Name of the UK city' },
          severity: { type: 'string', enum: ['low', 'moderate', 'high', 'critical'], description: 'Alert severity level' },
        },
        required: ['city', 'severity'],
      },
    },
  },
  execute: async (args) => {
    const cityData = getCity(args.city as string);
    if (!cityData) return JSON.stringify({ error: `City "${args.city}" not found. Available: ${getAllCityNames().join(', ')}` });

    const severity = args.severity as string;
    const alert = ALERT_LEVELS[severity] ?? ALERT_LEVELS.moderate;

    const publicActions =
      severity === 'critical' || severity === 'high'
        ? [
            'Move to higher ground immediately if in a flood-risk area',
            'Do NOT attempt to walk or drive through floodwater',
            'Call 999 if in immediate danger',
            'Move important items upstairs and turn off gas/electricity at the mains',
            'Follow advice from emergency services',
            'Check on vulnerable neighbours',
          ]
        : severity === 'moderate'
          ? [
              'Prepare a flood kit (medication, documents, phone charger, torch)',
              'Monitor Environment Agency flood warnings',
              'Know your evacuation route',
              'Move vehicles to higher ground if possible',
              'Sign up for flood warning alerts at gov.uk',
            ]
          : [
              'Stay informed via local news and Environment Agency updates',
              'Check your property flood plan',
              'Ensure drains and gutters are clear',
            ];

    return JSON.stringify(
      {
        alertId: `${alert.code}-${cityData.name.toUpperCase().replace(/\s+/g, '')}-${Date.now()}`,
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        level: alert,
        city: cityData.name,
        region: cityData.region,
        affectedRivers: cityData.rivers.map((r) => r.name),
        message: `${alert.title} for ${cityData.name} and surrounding areas. ${alert.action}. Rivers affected: ${cityData.rivers.map((r) => r.name).join(', ')}.`,
        publicActions,
        emergencyContacts: {
          emergencyServices: '999',
          floodline: '0345 988 1188',
          environmentAgency: '0800 80 70 60',
          localCouncil: `${cityData.name} Council Emergency Line`,
        },
      },
      null,
      2,
    );
  },
};

// ── Evacuation planning ──────────────────────────────────────────────

export const planEvacuation: FloodTool = {
  definition: {
    type: 'function',
    function: {
      name: 'plan_evacuation',
      description: 'Generate a comprehensive evacuation plan for a city under flood threat, including routes, shelters, resource requirements, and command structure.',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'Name of the UK city' },
          severity: { type: 'string', enum: ['minor', 'moderate', 'major', 'catastrophic'], description: 'Flood severity triggering the evacuation' },
        },
        required: ['city', 'severity'],
      },
    },
  },
  execute: async (args) => {
    const cityData = getCity(args.city as string);
    if (!cityData) return JSON.stringify({ error: `City "${args.city}" not found. Available: ${getAllCityNames().join(', ')}` });

    const severity = args.severity as string;
    const zones: Record<string, number> = { minor: 1, moderate: 2, major: 3, catastrophic: 5 };
    const popFrac: Record<string, number> = { minor: 0.01, moderate: 0.05, major: 0.12, catastrophic: 0.25 };
    const zoneCount = zones[severity] ?? 2;
    const evacuees = Math.round(cityData.population * (popFrac[severity] ?? 0.05));

    return JSON.stringify(
      {
        city: cityData.name,
        severity,
        evacuationZones: zoneCount,
        estimatedEvacuees: evacuees,
        timeframe:
          severity === 'catastrophic' ? 'IMMEDIATE — within 2 hours' : severity === 'major' ? 'Within 4-6 hours' : 'Within 12 hours',
        routes: [
          { name: 'Route A — Primary', road: `${cityData.rivers[0].name} Bridge → A-road north`, status: 'OPEN', capacity: 'high' },
          { name: 'Route B — Secondary', road: 'Ring road east → Industrial estate', status: 'OPEN', capacity: 'medium' },
          { name: 'Route C — Emergency', road: 'Minor roads south — emergency vehicles only', status: 'RESTRICTED', capacity: 'low' },
        ],
        shelters: [
          { name: `${cityData.name} Leisure Centre`, capacity: 500, type: 'Primary shelter', distance: '2.1 km from flood zone' },
          { name: `${cityData.name} Community Centre`, capacity: 200, type: 'Secondary shelter', distance: '3.4 km from flood zone' },
          { name: `${cityData.name} Sports Hall`, capacity: 350, type: 'Overflow shelter', distance: '4.2 km from flood zone' },
        ].slice(0, Math.min(3, zoneCount)),
        resources: {
          evacuationBuses: Math.ceil(evacuees / 45),
          ambulances: Math.ceil(evacuees / 500) + (severity === 'catastrophic' ? 5 : 2),
          policeVehicles: Math.ceil(evacuees / 300),
          volunteerCoordinators: Math.ceil(evacuees / 100),
          sandbagsRequired: evacuees * 3,
          pumpsRequired: zoneCount * 4,
        },
        priorities: [
          '1. Evacuate care homes and hospitals in flood zone',
          '2. Door-to-door in highest-risk residential areas',
          '3. Secure critical infrastructure (power, water)',
          '4. Establish traffic control on evacuation routes',
          '5. Set up rest centres with medical, welfare, and feeding teams',
        ],
        coordinationCentres: {
          goldCommand: `${cityData.name} City Hall — Strategic coordination`,
          silverCommand: `${cityData.name} Police HQ — Tactical coordination`,
          bronzeCommand: 'On-scene operational commanders at each evacuation zone',
        },
      },
      null,
      2,
    );
  },
};

// ── Resource allocation ──────────────────────────────────────────────

export const allocateResources: FloodTool = {
  definition: {
    type: 'function',
    function: {
      name: 'allocate_resources',
      description: 'Generate a resource allocation plan for flood response including personnel, equipment, logistics, and cost estimates.',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'Name of the UK city' },
          severity: { type: 'string', enum: ['minor', 'moderate', 'major', 'catastrophic'], description: 'Flood severity level driving the allocation' },
        },
        required: ['city', 'severity'],
      },
    },
  },
  execute: async (args) => {
    const cityData = getCity(args.city as string);
    if (!cityData) return JSON.stringify({ error: `City "${args.city}" not found. Available: ${getAllCityNames().join(', ')}` });

    const severity = args.severity as string;
    const infra = getInfrastructure(args.city as string);
    const mult: Record<string, number> = { minor: 1, moderate: 2, major: 4, catastrophic: 8 };
    const m = mult[severity] ?? 2;

    return JSON.stringify(
      {
        city: cityData.name,
        severity,
        timestamp: new Date().toISOString(),
        resourceAllocation: {
          personnel: {
            fireAndRescue: 15 * m,
            police: 10 * m,
            ambulance: 5 * m,
            environmentAgency: 8 * m,
            military: severity === 'catastrophic' ? 50 : severity === 'major' ? 20 : 0,
            volunteers: 25 * m,
          },
          equipment: {
            highVolumePumps: 4 * m,
            portablePumps: 10 * m,
            sandbags: 5000 * m,
            inflatableBarriers_metres: 200 * m,
            rescueBoats: 2 * m,
            generators: 3 * m,
            drinkingWaterTankers: Math.ceil(m / 2),
          },
          logistics: {
            commandVehicles: Math.ceil(m / 2) + 1,
            suppliesLorries: m * 2,
            droneUnits: Math.min(m, 4),
            communicationUnits: m * 3,
          },
        },
        estimatedCost: `£${(150_000 * m).toLocaleString()} — £${(300_000 * m).toLocaleString()}`,
        deploymentTime: severity === 'catastrophic' ? '1-2 hours' : severity === 'major' ? '2-4 hours' : '4-8 hours',
        mutualAid:
          severity === 'major' || severity === 'catastrophic'
            ? {
                requested: true,
                fromRegions: [
                  'Neighbouring county fire services',
                  'National Flood Response Centre',
                  severity === 'catastrophic' ? 'Military Aid to Civil Authorities (MACA)' : null,
                ].filter(Boolean),
              }
            : { requested: false },
        protectedInfrastructure: infra.map((i) => ({
          asset: i.name,
          type: i.type,
          protection: i.floodVulnerability > 0.6 ? 'PRIORITY — Deploy barriers and pumps' : 'STANDARD — Monitor and protect if conditions worsen',
        })),
      },
      null,
      2,
    );
  },
};

// ── Emergency escalation ─────────────────────────────────────────────

export const escalateEmergency: FloodTool = {
  definition: {
    type: 'function',
    function: {
      name: 'escalate_emergency',
      description: `Escalate a flood emergency through the Gold/Silver/Bronze command structure. Determines the appropriate command level based on severity, provides key contacts, required actions, and notifications. Available cities: ${getAllCityNames().join(', ')}.`,
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'Name of the UK city' },
          severity: {
            type: 'string',
            enum: ['YELLOW', 'AMBER', 'RED', 'RED-SEVERE'],
            description: 'Alert severity: YELLOW (watch), AMBER (warning), RED (severe), RED-SEVERE (national emergency)',
          },
          situation: { type: 'string', description: 'Brief description of the current situation' },
        },
        required: ['city', 'severity', 'situation'],
      },
    },
  },
  execute: async (args) => {
    const cityName = args.city as string;
    const severity = args.severity as 'YELLOW' | 'AMBER' | 'RED' | 'RED-SEVERE';
    const situation = args.situation as string;
    const cityData = getCity(cityName);
    if (!cityData) return JSON.stringify({ error: `City "${cityName}" not found. Available: ${getAllCityNames().join(', ')}` });

    const escalation = getEscalation(severity, cityData.region);

    return JSON.stringify({
      escalationId: `ESC-${cityData.name.toUpperCase().replace(/\s+/g, '')}-${severity}-${Date.now()}`,
      issuedAt: new Date().toISOString(),
      city: cityData.name,
      region: cityData.region,
      severity,
      situation,
      commandLevel: {
        level: escalation.commandLevel.level,
        description: escalation.commandLevel.description,
      },
      keyContacts: escalation.commandLevel.contacts.map(c => ({
        name: c.name,
        role: c.role,
        phone: c.phone,
        available: c.available,
      })),
      requiredActions: escalation.actions,
      notifications: escalation.notifications,
      affectedRivers: cityData.rivers.map(r => r.name),
      population: cityData.population,
      severityLevels: getSeverityLevels(),
    }, null, 2);
  },
};
