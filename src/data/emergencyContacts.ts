// ─── FloodMAS — UK Emergency Contact Hierarchy ──────────────────────
// Gold/Silver/Bronze command mapping for multi-agency flood response.

export interface EmergencyContact {
  name: string;
  role: string;
  phone: string;
  email?: string;
  available: string; // e.g. "24/7", "office hours"
}

export interface CommandLevel {
  level: 'Bronze' | 'Silver' | 'Gold' | 'National';
  description: string;
  contacts: EmergencyContact[];
}

export interface EscalationResult {
  severity: 'YELLOW' | 'AMBER' | 'RED' | 'RED-SEVERE';
  commandLevel: CommandLevel;
  actions: string[];
  notifications: string[];
  region: string;
}

// ── National contacts ────────────────────────────────────────────────

const NATIONAL_CONTACTS: EmergencyContact[] = [
  { name: 'COBR', role: 'Cabinet Office Briefing Room', phone: '020 7276 1234', available: '24/7' },
  { name: 'SEPA / EA National', role: 'National Flood Duty Manager', phone: '0800 807 060', available: '24/7' },
  { name: 'Military Aid', role: 'MACA Coordination', phone: '01onal military', available: '24/7' },
];

// ── Common contacts used at every level ──────────────────────────────

const EA_FLOODLINE: EmergencyContact = {
  name: 'EA Floodline',
  role: 'Environment Agency 24h Flood Warnings',
  phone: '0345 988 1188',
  available: '24/7',
};

const EMERGENCY_999: EmergencyContact = {
  name: '999 Emergency Services',
  role: 'Police, Fire, Ambulance',
  phone: '999',
  available: '24/7',
};

const COASTGUARD: EmergencyContact = {
  name: 'HM Coastguard',
  role: 'Coastal & water rescue',
  phone: '999 (Coastguard)',
  available: '24/7',
};

// ── Command levels ───────────────────────────────────────────────────

const BRONZE: CommandLevel = {
  level: 'Bronze',
  description: 'Operational — on-scene tactical management by first responders',
  contacts: [
    EA_FLOODLINE,
    { name: 'Local Council', role: 'Emergency Planning Officer', phone: 'Varies by region', available: 'Office hours + on-call' },
    { name: 'Fire & Rescue', role: 'Water rescue lead', phone: '999', available: '24/7' },
  ],
};

const SILVER: CommandLevel = {
  level: 'Silver',
  description: 'Tactical — multi-agency coordination from command centre',
  contacts: [
    EA_FLOODLINE,
    EMERGENCY_999,
    { name: 'LRF', role: 'Local Resilience Forum Chair', phone: 'Varies by region', available: 'On-call' },
    { name: 'EA Area Manager', role: 'Environment Agency field ops', phone: '0800 807 060', available: '24/7' },
    { name: 'NHS Emergency', role: 'NHS Ambulance Trust', phone: '999', available: '24/7' },
  ],
};

const GOLD: CommandLevel = {
  level: 'Gold',
  description: 'Strategic — senior leadership, resource allocation, public comms',
  contacts: [
    EA_FLOODLINE,
    EMERGENCY_999,
    COASTGUARD,
    { name: 'Police Gold Commander', role: 'Strategic command lead', phone: 'Varies by region', available: '24/7' },
    { name: 'EA Regional Director', role: 'Strategic flood response', phone: '0800 807 060', available: '24/7' },
    { name: 'Local Authority CEO', role: 'Council strategic lead', phone: 'Varies by region', available: 'On-call' },
    { name: 'Public Health England', role: 'Health risk assessment', phone: '0344 225 4524', available: 'Office hours + on-call' },
  ],
};

const NATIONAL: CommandLevel = {
  level: 'National',
  description: 'National — COBR activation, military aid, cross-region coordination',
  contacts: [...GOLD.contacts, ...NATIONAL_CONTACTS],
};

// ── Severity → Command mapping ───────────────────────────────────────

const SEVERITY_COMMAND: Record<string, CommandLevel> = {
  YELLOW: BRONZE,
  AMBER: SILVER,
  RED: GOLD,
  'RED-SEVERE': NATIONAL,
};

const SEVERITY_ACTIONS: Record<string, string[]> = {
  YELLOW: [
    'Activate Bronze command at scene',
    'Monitor EA flood warnings closely',
    'Pre-position sandbags and pumps',
    'Alert community flood wardens',
  ],
  AMBER: [
    'Activate Silver command at tactical centre',
    'Issue Flood Warning via EA Floodline',
    'Open rest centres for potential evacuees',
    'Deploy water rescue teams on standby',
    'Notify hospitals and care homes',
  ],
  RED: [
    'Activate Gold command — strategic coordination',
    'Issue Severe Flood Warning via EA',
    'Begin evacuation of at-risk zones',
    'Request mutual aid from neighbouring regions',
    'Deploy swift-water rescue teams',
    'Activate public warning systems',
  ],
  'RED-SEVERE': [
    'Request COBR activation',
    'Issue national Severe Flood Warning',
    'Request Military Aid to Civil Authorities (MACA)',
    'Mandatory evacuation of flood zones',
    'Cross-region resource mobilisation',
    'National media briefing',
    'Deploy all available rescue assets',
  ],
};

const SEVERITY_NOTIFICATIONS: Record<string, string[]> = {
  YELLOW: ['Local council emergency team', 'Community flood wardens', 'EA duty officer'],
  AMBER: ['Local Resilience Forum', 'NHS Ambulance Trust', 'Utilities companies', 'Transport operators'],
  RED: ['Police Gold Commander', 'EA Regional Director', 'Local Authority CEO', 'Public Health England'],
  'RED-SEVERE': ['COBR', 'Secretary of State (DEFRA)', 'Military liaison', 'National media desk'],
};

// ── Public API ───────────────────────────────────────────────────────

/**
 * Determine the appropriate escalation response for a given severity level.
 */
export function getEscalation(
  severity: 'YELLOW' | 'AMBER' | 'RED' | 'RED-SEVERE',
  region: string,
): EscalationResult {
  const commandLevel = SEVERITY_COMMAND[severity] ?? BRONZE;
  const actions = SEVERITY_ACTIONS[severity] ?? SEVERITY_ACTIONS.YELLOW;
  const notifications = SEVERITY_NOTIFICATIONS[severity] ?? SEVERITY_NOTIFICATIONS.YELLOW;

  return {
    severity,
    commandLevel,
    actions,
    notifications,
    region,
  };
}

/**
 * List all severity levels for display.
 */
export function getSeverityLevels() {
  return [
    { level: 'YELLOW', label: 'Flood Alert', command: 'Bronze', description: 'Flooding possible — be prepared' },
    { level: 'AMBER', label: 'Flood Warning', command: 'Silver', description: 'Flooding expected — immediate action needed' },
    { level: 'RED', label: 'Severe Flood Warning', command: 'Gold', description: 'Severe flooding — danger to life' },
    { level: 'RED-SEVERE', label: 'National Emergency', command: 'National', description: 'Widespread severe flooding — COBR activation' },
  ] as const;
}
