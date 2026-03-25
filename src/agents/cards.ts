// ─── FloodMAS — A2A-Compliant Agent Cards ────────────────────────────

import type { AgentCard } from './types.js';

export const AGENT_CARDS: readonly AgentCard[] = [
  {
    name: 'FloodMAS Coordinator',
    description:
      'Central supervisor agent that analyses flood management queries, delegates to specialist departments (Forecasting, Monitoring, Risk Analysis, Emergency Response), and synthesises actionable briefings.',
    version: '2.0.0',
    role: 'supervisor',
    agentType: 'LLM-based (GPT-4.1) Supervisor',
    iconUrl: '/icons/coordinator.svg',
    skills: [
      {
        id: 'coord-delegate',
        name: 'Multi-Agent Delegation',
        description: 'Analyses complex flood queries and routes them to 1–4 specialist agents, then synthesises results into unified briefings',
        tags: ['coordination', 'delegation', 'synthesis', 'multi-agent'],
        examples: [
          'Give me a full flood risk briefing for York',
          'What is the current situation in Carlisle?',
          'Emergency: River Thames is rising rapidly',
        ],
      },
    ],
    capabilities: {
      streaming: true,
      multiAgentDelegation: true,
    },
  },
  {
    name: 'Forecasting Agent',
    description:
      'Specialist agent for weather prediction and hydrological forecasting, using simulated Met Office and EFAS-style data for UK cities.',
    version: '2.0.0',
    role: 'worker',
    agentType: 'LLM-based (GPT-4.1-mini) ReAct Agent',
    iconUrl: '/icons/forecasting.svg',
    skills: [
      {
        id: 'weather-forecast',
        name: 'Weather Forecasting',
        description: 'Multi-day rainfall, wind, and temperature forecasts with flood risk severity classification',
        tags: ['weather', 'rainfall', 'forecast', 'prediction'],
        examples: ['What is the 5-day weather forecast for Manchester?', 'How much rain is expected in York this week?'],
      },
      {
        id: 'river-levels',
        name: 'River Level Monitoring',
        description: 'Current and predicted river levels with trend analysis and flood threshold percentages',
        tags: ['river', 'hydrology', 'levels', 'trend'],
        examples: ['What are the current river levels in Carlisle?', 'Is the River Ouse rising?'],
      },
    ],
    capabilities: {
      streaming: false,
      tools: ['get_weather_forecast', 'get_river_levels'],
    },
  },
  {
    name: 'Monitoring Agent',
    description:
      'IoT sensor network management agent modelled on Northumberland FloodAI and AWARE systems. Reads live sensor data and runs automated anomaly detection.',
    version: '2.0.0',
    role: 'worker',
    agentType: 'LLM-based (GPT-4.1-mini) Proactive Agent',
    iconUrl: '/icons/monitoring.svg',
    skills: [
      {
        id: 'sensor-reading',
        name: 'Sensor Network Reading',
        description: 'Retrieves live data from IoT flood monitoring stations including river level, rainfall, soil moisture, flow rate, and groundwater',
        tags: ['sensors', 'IoT', 'monitoring', 'real-time'],
        examples: ['Read all sensor data for Sheffield', 'What are the current sensor readings in London?'],
      },
      {
        id: 'anomaly-detection',
        name: 'Anomaly Detection',
        description: 'Automated threshold-based anomaly detection with severity classification (NORMAL → WARNING → ALERT → CRITICAL)',
        tags: ['anomaly', 'detection', 'threshold', 'alert'],
        examples: ['Are there any sensor anomalies in Oxford?', 'Run anomaly detection for all Leeds stations'],
      },
    ],
    capabilities: {
      streaming: false,
      tools: ['read_sensor_network', 'detect_sensor_anomalies'],
      proactiveMonitoring: true,
    },
  },
  {
    name: 'Risk Analysis Agent',
    description:
      'Specialist in flood risk assessment using Environment Agency classifications, infrastructure vulnerability scoring, and population impact modelling.',
    version: '2.0.0',
    role: 'worker',
    agentType: 'LLM-based (GPT-4.1-mini) Analytical Agent',
    iconUrl: '/icons/risk-analysis.svg',
    skills: [
      {
        id: 'flood-zone',
        name: 'Flood Zone Assessment',
        description: 'EA flood zone classification, historical events, existing defences, and systemic risk factors',
        tags: ['flood-zone', 'risk', 'history', 'defences'],
        examples: ['What flood zone is Shrewsbury in?', 'Give me the flood history of Carlisle'],
      },
      {
        id: 'infra-vulnerability',
        name: 'Infrastructure Vulnerability',
        description: 'Critical infrastructure risk assessment under various flood scenarios',
        tags: ['infrastructure', 'vulnerability', 'hospitals', 'power'],
        examples: ['How vulnerable is York infrastructure to a major flood?', 'Which critical assets are at risk in Sheffield?'],
      },
      {
        id: 'population-risk',
        name: 'Population Impact Estimation',
        description: 'Affected population, displacement, vulnerable groups, and health impact analysis',
        tags: ['population', 'displacement', 'vulnerable', 'health'],
        examples: ['How many people would be affected by a major flood in Leeds?', 'Estimate displaced persons for a catastrophic flood in Carlisle'],
      },
    ],
    capabilities: {
      streaming: false,
      tools: ['get_flood_zone_info', 'assess_infrastructure_vulnerability', 'estimate_population_at_risk'],
    },
  },
  {
    name: 'Emergency Response Agent',
    description:
      'Emergency planning and response coordination agent implementing UK multi-agency flood response framework (Gold/Silver/Bronze).',
    version: '2.0.0',
    role: 'worker',
    agentType: 'LLM-based (GPT-4.1-mini) Planning Agent',
    iconUrl: '/icons/emergency.svg',
    skills: [
      {
        id: 'alert-generation',
        name: 'Flood Alert Generation',
        description: 'EA-standard flood alerts with severity classification, public actions, and emergency contacts',
        tags: ['alert', 'warning', 'public-safety'],
        examples: ['Issue a severe flood warning for Carlisle', 'Generate a flood alert for York'],
      },
      {
        id: 'evacuation-planning',
        name: 'Evacuation Planning',
        description: 'Comprehensive evacuation plans with routes, shelters, resource needs, and command structure',
        tags: ['evacuation', 'shelter', 'routes', 'planning'],
        examples: ['Plan an evacuation for a major flood in Sheffield', 'What evacuation resources are needed for Leeds?'],
      },
      {
        id: 'resource-allocation',
        name: 'Resource Allocation',
        description: 'Personnel, equipment, and logistics deployment planning with cost estimates',
        tags: ['resources', 'personnel', 'equipment', 'logistics'],
        examples: ['What resources are needed for catastrophic flooding in Manchester?', 'Allocate emergency response resources for Oxford'],
      },
    ],
    capabilities: {
      streaming: false,
      tools: ['generate_flood_alert', 'plan_evacuation', 'allocate_resources'],
    },
  },
] as const;

export function getAgentCardByName(name: string): AgentCard | undefined {
  return AGENT_CARDS.find((c) => c.name.toLowerCase().includes(name.toLowerCase()));
}
