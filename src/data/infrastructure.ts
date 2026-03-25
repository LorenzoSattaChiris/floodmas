// ─── FloodMAS — Critical Infrastructure Data ────────────────────────

interface InfrastructureItem {
  id: string;
  type: string;
  name: string;
  location: string;
  floodVulnerability: number;
  capacity: number | null;
  evacuationTime: string;
  criticalServices: string[];
}

interface AssessedItem extends InfrastructureItem {
  effectiveRisk: number;
  riskLevel: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW';
  recommendation: string;
}

const INFRASTRUCTURE_DB: Record<string, InfrastructureItem[]> = {
  york: [
    { id: 'YORK-H1', type: 'hospital', name: 'York Hospital', location: 'Wigginton Road', floodVulnerability: 0.3, capacity: 800, evacuationTime: '4-6 hours', criticalServices: ['A&E', 'ICU', 'Maternity'] },
    { id: 'YORK-S1', type: 'school', name: "Archbishop Holgate's School", location: 'Hull Road', floodVulnerability: 0.6, capacity: 1500, evacuationTime: '1-2 hours', criticalServices: ['Education'] },
    { id: 'YORK-P1', type: 'power', name: 'York Electricity Substation', location: 'Foss Islands', floodVulnerability: 0.8, capacity: null, evacuationTime: 'N/A', criticalServices: ['Power supply to 45,000 homes'] },
    { id: 'YORK-T1', type: 'transport', name: 'York Railway Station', location: 'Station Road', floodVulnerability: 0.5, capacity: 9_000_000, evacuationTime: '2-3 hours', criticalServices: ['Rail transport hub', 'East Coast Main Line'] },
    { id: 'YORK-W1', type: 'water', name: 'York Water Treatment Works', location: 'Naburn', floodVulnerability: 0.7, capacity: null, evacuationTime: 'N/A', criticalServices: ['Clean water supply to 200,000 residents'] },
  ],
  london: [
    { id: 'LON-H1', type: 'hospital', name: "St Thomas' Hospital", location: 'Westminster Bridge Road', floodVulnerability: 0.4, capacity: 840, evacuationTime: '6-8 hours', criticalServices: ['A&E', 'ICU', 'Parliament proximity'] },
    { id: 'LON-T1', type: 'transport', name: 'London Underground Network', location: 'City-wide', floodVulnerability: 0.7, capacity: 5_000_000, evacuationTime: '4-6 hours', criticalServices: ['Mass transit', '272 stations'] },
    { id: 'LON-P1', type: 'power', name: 'Bankside Substation', location: 'Southwark', floodVulnerability: 0.5, capacity: null, evacuationTime: 'N/A', criticalServices: ['Power to Central London'] },
    { id: 'LON-C1', type: 'communications', name: 'BT Tower Exchange', location: 'Fitzrovia', floodVulnerability: 0.2, capacity: null, evacuationTime: 'N/A', criticalServices: ['National telecoms hub'] },
    { id: 'LON-F1', type: 'flood_defence', name: 'Thames Barrier', location: 'Woolwich', floodVulnerability: 0.1, capacity: null, evacuationTime: 'N/A', criticalServices: ['Tidal flood protection for 1.4M people'] },
  ],
  manchester: [
    { id: 'MAN-H1', type: 'hospital', name: 'Manchester Royal Infirmary', location: 'Oxford Road', floodVulnerability: 0.3, capacity: 750, evacuationTime: '5-7 hours', criticalServices: ['A&E', 'Major Trauma Centre'] },
    { id: 'MAN-T1', type: 'transport', name: 'Manchester Piccadilly Station', location: 'City Centre', floodVulnerability: 0.4, capacity: 32_000_000, evacuationTime: '3-4 hours', criticalServices: ['Rail hub', 'Metrolink'] },
    { id: 'MAN-S1', type: 'school', name: 'University of Manchester', location: 'Oxford Road', floodVulnerability: 0.3, capacity: 40_000, evacuationTime: '3-4 hours', criticalServices: ['Higher education', 'Research facilities'] },
  ],
  carlisle: [
    { id: 'CAR-H1', type: 'hospital', name: 'Cumberland Infirmary', location: 'Newtown Road', floodVulnerability: 0.6, capacity: 440, evacuationTime: '3-5 hours', criticalServices: ['A&E', 'Regional hospital'] },
    { id: 'CAR-P1', type: 'power', name: 'Carlisle Electricity Substation', location: 'Willowholme', floodVulnerability: 0.9, capacity: null, evacuationTime: 'N/A', criticalServices: ['Power to entire city — flooded in 2005 & 2015'] },
    { id: 'CAR-S1', type: 'school', name: 'Trinity School', location: 'Strand Road', floodVulnerability: 0.7, capacity: 900, evacuationTime: '1-2 hours', criticalServices: ['Education'] },
    { id: 'CAR-W1', type: 'water', name: 'Carlisle Water Works', location: 'Castle Carrock', floodVulnerability: 0.4, capacity: null, evacuationTime: 'N/A', criticalServices: ['Water supply to 75,000 residents'] },
  ],
  sheffield: [
    { id: 'SHE-H1', type: 'hospital', name: 'Northern General Hospital', location: 'Herries Road', floodVulnerability: 0.2, capacity: 1100, evacuationTime: '6-8 hours', criticalServices: ['A&E', 'Major Trauma Centre'] },
    { id: 'SHE-T1', type: 'transport', name: 'Sheffield Railway Station', location: 'Sheaf Street', floodVulnerability: 0.6, capacity: 10_000_000, evacuationTime: '2-3 hours', criticalServices: ['Rail hub'] },
    { id: 'SHE-P1', type: 'power', name: 'Sheffield Meadowhall Substation', location: 'Meadowhall', floodVulnerability: 0.8, capacity: null, evacuationTime: 'N/A', criticalServices: ['Power to 200,000+ homes'] },
  ],
  leeds: [
    { id: 'LEE-H1', type: 'hospital', name: 'Leeds General Infirmary', location: 'Great George St', floodVulnerability: 0.3, capacity: 1000, evacuationTime: '5-7 hours', criticalServices: ['A&E', 'Major Trauma Centre'] },
    { id: 'LEE-T1', type: 'transport', name: 'Leeds Railway Station', location: 'New Station St', floodVulnerability: 0.5, capacity: 31_000_000, evacuationTime: '3-4 hours', criticalServices: ['Second busiest station outside London'] },
    { id: 'LEE-C1', type: 'commercial', name: 'Kirkgate Market', location: 'City Centre', floodVulnerability: 0.7, capacity: 10_000, evacuationTime: '1-2 hours', criticalServices: ['Historic market', '800+ traders'] },
  ],
  bristol: [
    { id: 'BRI-H1', type: 'hospital', name: 'Bristol Royal Infirmary', location: 'Upper Maudlin St', floodVulnerability: 0.2, capacity: 700, evacuationTime: '5-7 hours', criticalServices: ['A&E', 'ICU'] },
    { id: 'BRI-T1', type: 'transport', name: 'Bristol Temple Meads Station', location: 'Temple Gate', floodVulnerability: 0.5, capacity: 12_000_000, evacuationTime: '2-3 hours', criticalServices: ['Main rail hub'] },
  ],
  shrewsbury: [
    { id: 'SHR-H1', type: 'hospital', name: 'Royal Shrewsbury Hospital', location: 'Mytton Oak Road', floodVulnerability: 0.4, capacity: 480, evacuationTime: '3-5 hours', criticalServices: ['A&E', 'Regional hospital'] },
    { id: 'SHR-S1', type: 'school', name: 'Shrewsbury School', location: 'The Schools', floodVulnerability: 0.8, capacity: 800, evacuationTime: '1-2 hours', criticalServices: ['Education — riverside location'] },
  ],
  newcastle: [
    { id: 'NEW-H1', type: 'hospital', name: 'Royal Victoria Infirmary', location: 'Queen Victoria Road', floodVulnerability: 0.2, capacity: 900, evacuationTime: '5-7 hours', criticalServices: ['A&E', 'Major Trauma Centre'] },
    { id: 'NEW-T1', type: 'transport', name: 'Newcastle Central Station', location: 'Neville Street', floodVulnerability: 0.4, capacity: 8_000_000, evacuationTime: '2-3 hours', criticalServices: ['Rail hub', 'East Coast Main Line'] },
  ],
  oxford: [
    { id: 'OXF-H1', type: 'hospital', name: 'John Radcliffe Hospital', location: 'Headley Way', floodVulnerability: 0.2, capacity: 832, evacuationTime: '5-7 hours', criticalServices: ['A&E', 'Major Trauma Centre'] },
    { id: 'OXF-S1', type: 'school', name: 'University of Oxford (Colleges)', location: 'City Centre', floodVulnerability: 0.5, capacity: 24_000, evacuationTime: '3-4 hours', criticalServices: ['Higher education', 'Historic buildings'] },
  ],
};

function normalizeKey(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '').replace('upontyne', '');
}

export function getInfrastructure(cityName: string): InfrastructureItem[] {
  return INFRASTRUCTURE_DB[normalizeKey(cityName)] || [];
}

export function assessVulnerability(
  cityName: string,
  scenario: 'minor' | 'moderate' | 'major' | 'catastrophic' = 'moderate',
) {
  const infra = getInfrastructure(cityName);
  if (!infra.length) return { error: `No infrastructure data for ${cityName}` };

  const mult: Record<string, number> = { minor: 0.3, moderate: 0.6, major: 0.85, catastrophic: 1.0 };
  const m = mult[scenario] ?? 0.6;

  const assessed: AssessedItem[] = infra.map(item => {
    const effectiveRisk = Math.min(1, +(item.floodVulnerability * m * (1 + Math.random() * 0.2)).toFixed(2));
    const riskLevel: AssessedItem['riskLevel'] =
      effectiveRisk >= 0.8 ? 'CRITICAL' : effectiveRisk >= 0.6 ? 'HIGH' : effectiveRisk >= 0.4 ? 'MODERATE' : 'LOW';
    return {
      ...item,
      effectiveRisk,
      riskLevel,
      recommendation:
        riskLevel === 'CRITICAL' ? `IMMEDIATE: Activate contingency plan for ${item.name}. Pre-position emergency resources.`
        : riskLevel === 'HIGH' ? `HIGH PRIORITY: Alert ${item.name} management. Prepare for potential service disruption.`
        : riskLevel === 'MODERATE' ? `MONITOR: Keep ${item.name} informed. Review flood response procedures.`
        : `LOW RISK: Standard monitoring. ${item.name} is adequately protected.`,
    };
  });

  return {
    city: cityName, scenario, totalAssets: assessed.length,
    criticalAssets: assessed.filter(a => a.riskLevel === 'CRITICAL').length,
    highRiskAssets: assessed.filter(a => a.riskLevel === 'HIGH').length,
    assets: assessed,
    overallAssessment: assessed.some(a => a.riskLevel === 'CRITICAL')
      ? 'CRITICAL — One or more essential services at immediate risk of failure'
      : assessed.some(a => a.riskLevel === 'HIGH')
        ? 'SERIOUS — Significant risk to key infrastructure'
        : 'MANAGEABLE — Infrastructure generally protected at this scenario level',
  };
}
