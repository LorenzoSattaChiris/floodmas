// ─── FloodMAS — UK Cities Flood Data ─────────────────────────────────
// Realistic data based on Environment Agency flood zone classifications
// and historical flood records for 10 major UK cities.

export interface RiverData {
  name: string;
  currentLevel: number;
  normalLevel: number;
  floodLevel: number;
}

export interface HistoricalFlood {
  year: number;
  severity: 'minor' | 'moderate' | 'major' | 'catastrophic';
  description: string;
}

export interface CityData {
  name: string;
  region: string;
  county: string;
  population: number;
  coordinates: { lat: number; lon: number };
  rivers: RiverData[];
  floodZone: string;
  floodZoneDescription: string;
  historicalFloods: HistoricalFlood[];
  defences: {
    type: string;
    condition: string;
    yearBuilt: number;
    protectionLevel: string;
  };
  drainageCapacity: 'low' | 'moderate' | 'high';
}

const UK_CITIES: Record<string, CityData> = {
  york: {
    name: 'York', region: 'Yorkshire and the Humber', county: 'North Yorkshire',
    population: 210_000, coordinates: { lat: 53.9591, lon: -1.0815 },
    rivers: [
      { name: 'River Ouse', currentLevel: 3.2, normalLevel: 2.1, floodLevel: 4.5 },
      { name: 'River Foss', currentLevel: 1.8, normalLevel: 1.2, floodLevel: 2.8 },
    ],
    floodZone: '3a',
    floodZoneDescription: 'High probability — land with 1% or greater annual probability of river flooding',
    historicalFloods: [
      { year: 2000, severity: 'major', description: 'Worst flooding in 375 years, 540 properties flooded' },
      { year: 2012, severity: 'moderate', description: 'River Ouse burst banks, 50 properties affected' },
      { year: 2015, severity: 'major', description: 'Storm Desmond & Eva, record river levels, 600+ properties' },
      { year: 2020, severity: 'moderate', description: 'Storm Ciara, 130 properties flooded' },
    ],
    defences: { type: 'Flood barriers + demountable defences', condition: 'Good', yearBuilt: 2017, protectionLevel: '1 in 100 year' },
    drainageCapacity: 'moderate',
  },
  london: {
    name: 'London', region: 'Greater London', county: 'Greater London',
    population: 8_800_000, coordinates: { lat: 51.5074, lon: -0.1278 },
    rivers: [
      { name: 'River Thames', currentLevel: 4.1, normalLevel: 3.5, floodLevel: 5.8 },
      { name: 'River Lea', currentLevel: 1.9, normalLevel: 1.4, floodLevel: 3.0 },
    ],
    floodZone: '3a',
    floodZoneDescription: 'High probability — protected by Thames Barrier and extensive defences',
    historicalFloods: [
      { year: 1928, severity: 'major', description: 'Thames flood, 14 deaths, thousands displaced' },
      { year: 1953, severity: 'catastrophic', description: 'North Sea flood, led to Thames Barrier project' },
      { year: 2014, severity: 'moderate', description: 'Sustained winter rainfall, groundwater flooding' },
      { year: 2021, severity: 'moderate', description: 'Flash flooding from intense summer storms, tube stations flooded' },
    ],
    defences: { type: 'Thames Barrier + 330km of floodwalls', condition: 'Excellent', yearBuilt: 1984, protectionLevel: '1 in 1000 year' },
    drainageCapacity: 'high',
  },
  manchester: {
    name: 'Manchester', region: 'North West England', county: 'Greater Manchester',
    population: 553_000, coordinates: { lat: 53.4808, lon: -2.2426 },
    rivers: [
      { name: 'River Irwell', currentLevel: 2.5, normalLevel: 1.8, floodLevel: 3.9 },
      { name: 'River Medlock', currentLevel: 1.1, normalLevel: 0.7, floodLevel: 2.0 },
    ],
    floodZone: '2',
    floodZoneDescription: 'Medium probability — between 0.1% and 1% annual probability',
    historicalFloods: [
      { year: 2015, severity: 'major', description: 'Storm Desmond, River Irwell record levels' },
      { year: 2016, severity: 'moderate', description: 'Boxing Day floods, significant disruption' },
      { year: 2021, severity: 'minor', description: 'Summer flash flooding in Didsbury' },
    ],
    defences: { type: 'Flood walls + managed storage areas', condition: 'Good', yearBuilt: 2020, protectionLevel: '1 in 75 year' },
    drainageCapacity: 'moderate',
  },
  carlisle: {
    name: 'Carlisle', region: 'North West England', county: 'Cumbria',
    population: 75_000, coordinates: { lat: 54.8951, lon: -2.9382 },
    rivers: [
      { name: 'River Eden', currentLevel: 2.8, normalLevel: 1.6, floodLevel: 3.5 },
      { name: 'River Caldew', currentLevel: 1.4, normalLevel: 0.9, floodLevel: 2.2 },
      { name: 'River Petteril', currentLevel: 1.1, normalLevel: 0.7, floodLevel: 1.8 },
    ],
    floodZone: '3b',
    floodZoneDescription: 'Functional floodplain — land with 5% or greater annual probability',
    historicalFloods: [
      { year: 2005, severity: 'catastrophic', description: '3 deaths, 1,800 properties flooded, city centre submerged' },
      { year: 2009, severity: 'moderate', description: 'Heavy rainfall, localised flooding' },
      { year: 2015, severity: 'catastrophic', description: 'Storm Desmond, record rainfall in 24 hours, 2,100 properties' },
    ],
    defences: { type: 'Raised defences + upstream storage', condition: 'Fair', yearBuilt: 2010, protectionLevel: '1 in 200 year' },
    drainageCapacity: 'low',
  },
  sheffield: {
    name: 'Sheffield', region: 'Yorkshire and the Humber', county: 'South Yorkshire',
    population: 556_000, coordinates: { lat: 53.3811, lon: -1.4701 },
    rivers: [
      { name: 'River Don', currentLevel: 2.1, normalLevel: 1.5, floodLevel: 3.4 },
      { name: 'River Sheaf', currentLevel: 0.9, normalLevel: 0.6, floodLevel: 1.6 },
    ],
    floodZone: '3a',
    floodZoneDescription: 'High probability — significant flood risk from River Don',
    historicalFloods: [
      { year: 2007, severity: 'major', description: 'Summer floods, 1,200 properties, 2 deaths' },
      { year: 2019, severity: 'major', description: 'River Don breached, 500+ properties flooded' },
    ],
    defences: { type: 'Channel improvements + flood storage', condition: 'Good', yearBuilt: 2015, protectionLevel: '1 in 100 year' },
    drainageCapacity: 'moderate',
  },
  leeds: {
    name: 'Leeds', region: 'Yorkshire and the Humber', county: 'West Yorkshire',
    population: 503_000, coordinates: { lat: 53.8008, lon: -1.5491 },
    rivers: [
      { name: 'River Aire', currentLevel: 2.3, normalLevel: 1.7, floodLevel: 3.8 },
    ],
    floodZone: '3a',
    floodZoneDescription: 'High probability — major flood alleviation scheme in progress',
    historicalFloods: [
      { year: 2015, severity: 'major', description: 'Boxing Day floods, 2,200 properties, £500M damage' },
      { year: 2020, severity: 'moderate', description: 'Storm Ciara, some areas flooded' },
    ],
    defences: { type: 'Leeds Flood Alleviation Scheme Phase 1 & 2', condition: 'Excellent', yearBuilt: 2023, protectionLevel: '1 in 200 year' },
    drainageCapacity: 'high',
  },
  bristol: {
    name: 'Bristol', region: 'South West England', county: 'City of Bristol',
    population: 472_000, coordinates: { lat: 51.4545, lon: -2.5879 },
    rivers: [
      { name: 'River Avon', currentLevel: 3.0, normalLevel: 2.4, floodLevel: 4.2 },
      { name: 'River Frome', currentLevel: 1.2, normalLevel: 0.8, floodLevel: 2.0 },
    ],
    floodZone: '2',
    floodZoneDescription: 'Medium probability — tidal and fluvial flood risk',
    historicalFloods: [
      { year: 2012, severity: 'minor', description: 'Localised flooding from intense rainfall' },
      { year: 2014, severity: 'moderate', description: 'Winter storms, coastal and river flooding' },
    ],
    defences: { type: 'Tidal defences + river walls', condition: 'Good', yearBuilt: 2014, protectionLevel: '1 in 100 year' },
    drainageCapacity: 'moderate',
  },
  shrewsbury: {
    name: 'Shrewsbury', region: 'West Midlands', county: 'Shropshire',
    population: 72_000, coordinates: { lat: 52.7077, lon: -2.7535 },
    rivers: [
      { name: 'River Severn', currentLevel: 3.5, normalLevel: 2.3, floodLevel: 4.0 },
    ],
    floodZone: '3a',
    floodZoneDescription: 'High probability — River Severn frequently exceeds flood level',
    historicalFloods: [
      { year: 2000, severity: 'major', description: 'Record Severn levels, town centre flooded' },
      { year: 2014, severity: 'moderate', description: 'Prolonged wet winter, repeated flooding' },
      { year: 2020, severity: 'major', description: 'Storm Dennis, record Severn levels exceeded 2000 peak' },
    ],
    defences: { type: 'Demountable barriers + permanent walls', condition: 'Fair', yearBuilt: 2003, protectionLevel: '1 in 100 year' },
    drainageCapacity: 'low',
  },
  newcastle: {
    name: 'Newcastle upon Tyne', region: 'North East England', county: 'Tyne and Wear',
    population: 302_000, coordinates: { lat: 54.9783, lon: -1.6178 },
    rivers: [
      { name: 'River Tyne', currentLevel: 2.7, normalLevel: 2.0, floodLevel: 4.0 },
    ],
    floodZone: '2',
    floodZoneDescription: 'Medium probability — FloodAI flash flood detection deployed',
    historicalFloods: [
      { year: 2012, severity: 'major', description: "Tyneside flash floods, 'Thunder Thursday', 1,000+ properties" },
      { year: 2016, severity: 'minor', description: 'Localised surface water flooding' },
    ],
    defences: { type: 'River walls + surface water management', condition: 'Good', yearBuilt: 2018, protectionLevel: '1 in 75 year' },
    drainageCapacity: 'moderate',
  },
  oxford: {
    name: 'Oxford', region: 'South East England', county: 'Oxfordshire',
    population: 152_000, coordinates: { lat: 51.7520, lon: -1.2577 },
    rivers: [
      { name: 'River Thames', currentLevel: 2.6, normalLevel: 2.0, floodLevel: 3.6 },
      { name: 'River Cherwell', currentLevel: 1.5, normalLevel: 1.0, floodLevel: 2.4 },
    ],
    floodZone: '3a',
    floodZoneDescription: 'High probability — confluence of Thames and Cherwell creates significant risk',
    historicalFloods: [
      { year: 2007, severity: 'major', description: 'Summer floods, widespread damage across Oxford' },
      { year: 2014, severity: 'moderate', description: 'Winter floods, prolonged inundation of floodplains' },
    ],
    defences: { type: 'Oxford Flood Alleviation Scheme', condition: 'Good', yearBuilt: 2024, protectionLevel: '1 in 100 year' },
    drainageCapacity: 'moderate',
  },
};

/** Lookup city by name (case-insensitive, flexible). */
export function getCity(name: string): CityData | null {
  const key = name.toLowerCase().replace(/\s+/g, '').replace('upontyne', '');
  for (const [k, v] of Object.entries(UK_CITIES)) {
    if (k === key || v.name.toLowerCase().replace(/\s+/g, '') === key) return v;
  }
  return null;
}

/** Get names of all supported cities. */
export function getAllCityNames(): string[] {
  return Object.values(UK_CITIES).map(c => c.name);
}

/** Get all cities as an array. */
export function getAllCities(): CityData[] {
  return Object.values(UK_CITIES);
}
