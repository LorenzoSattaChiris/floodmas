/**
 * Local dataset service — loads and serves CSV statistics and GeoJSON
 * from server/src/dataset/ directories:
 *   - floodriskzone/    (GOV.UK flood risk tool CSVs)
 *   - floodriskmanage/  (NAO Managing Flood Risk raw data CSVs)
 *   - floodriskareas/   (Defra Flood Risk Areas GeoJSON, EPSG:27700→WGS84)
 *   - floodriskpostcodes/ (EA RoFRS postcodes in areas at risk — 269K postcodes)
 *   - floodriskproperties/ (EA RoFRS properties at risk — 2.4M aggregated)
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import proj4 from 'proj4';
import { logger } from '../logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATASET_DIR = join(__dirname, '../dataset');

// British National Grid projection (EPSG:27700)
const BNG =
  '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 ' +
  '+ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs';
const WGS84 = 'EPSG:4326';

// ── CSV Parsing ──────────────────────────────────────────────────────

/** Parse a CSV file into an array of objects, handling quoted fields with commas */
function parseCSV(filePath: string, encoding: BufferEncoding = 'latin1'): Record<string, string>[] {
  const raw = readFileSync(filePath, encoding);
  const lines = raw.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = splitCSVRow(lines[0]);
  return lines.slice(1).map(line => {
    const values = splitCSVRow(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h.trim()] = (values[i] || '').trim();
    });
    return obj;
  });
}

/** Split a CSV row respecting quoted fields */
function splitCSVRow(row: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

/** Strip £ sign and commas from monetary string, return number */
function parseMoney(val: string): number | null {
  if (!val) return null;
  // £ can appear as \u00A3 (Latin-1) or literal £
  const cleaned = val.replace(/[£\u00A3,\s]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

/** Strip % and parse as number */
function parsePct(val: string): number | null {
  if (!val) return null;
  const cleaned = val.replace(/%/g, '').trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function parseNum(val: string): number | null {
  if (!val) return null;
  const cleaned = val.replace(/,/g, '').trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

// ── Types ────────────────────────────────────────────────────────────

export interface DefenceStats {
  code: string;
  name: string;
  level: 'region' | 'utla';
  numberOfDefences: number | null;
  avgCondition: number | null;
  avgConditionEA: number | null;
  proportionAboveRequired: number | null;
  proportionMaintainedByEA: number | null;
}

export interface SpendStats {
  code: string;
  name: string;
  level: 'region' | 'utla';
  years: Record<string, {
    governmentSpend: number | null;
    localLevyFunding: number | null;
    totalCapitalSpend: number | null;
  }>;
}

export interface HomesBetterProtected {
  code: string;
  name: string;
  level: 'region' | 'utla';
  years: Record<string, number | null>;
}

export interface PropertiesAtRisk {
  code: string;
  name: string;
  level: 'constituency' | 'ltla' | 'utla';
  years: Record<string, {
    numberAtHighRisk: number | null;
    numberAtMediumRisk: number | null;
    numberAtLowRisk: number | null;
    pctAtHighRisk: number | null;
    pctAtMediumRisk: number | null;
    pctAtLowRisk: number | null;
  }>;
}

export interface FloodRiskAreaFeature {
  type: 'Feature';
  geometry: { type: string; coordinates: number[][][] };
  properties: {
    fra_id: string;
    fra_name: string;
    frr_cycle: number;
    flood_source: string;
  };
}

export interface FloodRiskAreasGeoJSON {
  type: 'FeatureCollection';
  features: FloodRiskAreaFeature[];
}

export interface PostcodeRisk {
  postcode: string;
  totalProperties: number;
  residential: number;
  nonResidential: number;
  unclassified: number;
  veryLow: { residential: number; nonResidential: number; unclassified: number; total: number };
  low: { residential: number; nonResidential: number; unclassified: number; total: number };
  medium: { residential: number; nonResidential: number; unclassified: number; total: number };
  high: { residential: number; nonResidential: number; unclassified: number; total: number };
}

export interface PropertyRiskSummary {
  totalProperties: number;
  byType: { residential: number; nonResidential: number; unclassified: number };
  byRisk: { veryLow: number; low: number; medium: number; high: number };
  byTypeAndRisk: Record<string, Record<string, number>>;
}

export interface DatasetSummary {
  defences: { regions: number; utlas: number };
  spend: { regions: number; utlas: number };
  homesProtected: { regions: number; utlas: number };
  propertiesAtRisk: { constituencies: number; ltlas: number; utlas: number };
  floodRiskAreas: { features: number };
  postcodeRisk: { postcodes: number };
  propertyRisk: { totalProperties: number };
}

// ── In-Memory Cache (loaded once at startup) ─────────────────────────

let defencesRegion: DefenceStats[] = [];
let defencesUTLA: DefenceStats[] = [];
let spendRegion: SpendStats[] = [];
let spendUTLA: SpendStats[] = [];
let homesRegion: HomesBetterProtected[] = [];
let homesUTLA: HomesBetterProtected[] = [];
let propsConstituency: PropertiesAtRisk[] = [];
let propsLTLA: PropertiesAtRisk[] = [];
let propsUTLA: PropertiesAtRisk[] = [];
let floodRiskAreasGeoJSON: FloodRiskAreasGeoJSON = { type: 'FeatureCollection', features: [] };
let postcodeRiskMap = new Map<string, PostcodeRisk>();
let postcodeKeys: string[] = [];
let propertyRiskSummary: PropertyRiskSummary = {
  totalProperties: 0,
  byType: { residential: 0, nonResidential: 0, unclassified: 0 },
  byRisk: { veryLow: 0, low: 0, medium: 0, high: 0 },
  byTypeAndRisk: {},
};

// ── Parsing Functions ────────────────────────────────────────────────

function loadDefences(file: string, level: 'region' | 'utla'): DefenceStats[] {
  const rows = parseCSV(join(DATASET_DIR, file));
  return rows.map(r => {
    const nameKey = Object.keys(r).find(k =>
      k.includes('Region') || k.includes('Local authority') || k.includes('Local Authority')
    ) || Object.keys(r)[1];
    const codeKey = Object.keys(r).find(k => k.includes('ONS') || k === 'Code') || Object.keys(r)[0];
    return {
      code: r[codeKey] || '',
      name: r[nameKey] || '',
      level,
      numberOfDefences: parseNum(r[Object.keys(r).find(k => k.includes('Number of defences')) || '']),
      avgCondition: parseNum(r[Object.keys(r).find(k => k.includes('Average defence condition') || k.includes('Average.defence.condition')) || '']),
      avgConditionEA: parseNum(r[Object.keys(r).find(k => k.includes('maintatained') || k.includes('maintained')) || '']),
      proportionAboveRequired: parsePct(r[Object.keys(r).find(k => k.includes('above required')) || '']),
      proportionMaintainedByEA: parsePct(r[Object.keys(r).find(k => k.includes('Proportion maintained')) || '']),
    };
  }).filter(d => d.code);
}

function loadSpend(file: string, level: 'region' | 'utla'): SpendStats[] {
  const rows = parseCSV(join(DATASET_DIR, file));
  return rows.map(r => {
    const keys = Object.keys(r);
    const nameKey = keys.find(k =>
      k.includes('Region') || k.includes('Local Authority') || k.includes('Upper Tier')
    ) || keys[0];
    const codeKey = keys.find(k => k === 'Code') || keys[1];

    // Extract years from column names like "2015/16 government spend"
    const yearPattern = /^(\d{4}\/\d{2})\s+(government spend|local levy funding|total capital spend)$/i;
    const years: SpendStats['years'] = {};
    for (const key of keys) {
      const match = key.match(yearPattern);
      if (!match) continue;
      const year = match[1];
      const type = match[2].toLowerCase();
      if (!years[year]) years[year] = { governmentSpend: null, localLevyFunding: null, totalCapitalSpend: null };
      if (type.includes('government')) years[year].governmentSpend = parseMoney(r[key]);
      else if (type.includes('levy')) years[year].localLevyFunding = parseMoney(r[key]);
      else if (type.includes('total')) years[year].totalCapitalSpend = parseMoney(r[key]);
    }

    return {
      code: r[codeKey] || '',
      name: r[nameKey] || '',
      level,
      years,
    };
  }).filter(s => s.code);
}

function loadHomes(file: string, level: 'region' | 'utla'): HomesBetterProtected[] {
  const rows = parseCSV(join(DATASET_DIR, file));
  return rows.map(r => {
    const keys = Object.keys(r);
    const nameKey = keys.find(k =>
      k.includes('Region') || k.includes('Local Authority') || k.includes('Upper Tier')
    ) || keys[0];
    const codeKey = keys.find(k => k === 'Code') || keys[1];

    // Extract years from columns like "2015-2016", "2016-2017", etc.
    const years: Record<string, number | null> = {};
    for (const key of keys) {
      if (/^\d{4}-\d{4}$/.test(key.trim())) {
        years[key.trim()] = parseNum(r[key]);
      }
    }

    return { code: r[codeKey] || '', name: r[nameKey] || '', level, years };
  }).filter(h => h.code);
}

function loadPropertiesAtRisk(file: string, level: PropertiesAtRisk['level']): PropertiesAtRisk[] {
  const rows = parseCSV(join(DATASET_DIR, file));
  return rows.map(r => {
    const keys = Object.keys(r);
    const nameKey = keys.find(k =>
      k.includes('Constituency') || k === 'Name' ||
      k.includes('Local Authority') || k.includes('Upper Tier')
    ) || keys[0];
    const codeKey = keys.find(k => k === 'Code') || keys[1];

    // Columns: "2020: Number of properties at >1% risk", "2020: Percentage of properties at >1% risk" etc.
    const yearSet = new Set<string>();
    for (const key of keys) {
      const m = key.match(/^(\d{4}):/);
      if (m) yearSet.add(m[1]);
    }

    const years: PropertiesAtRisk['years'] = {};
    for (const year of yearSet) {
      const findCol = (pattern: string) => keys.find(k => k.startsWith(`${year}:`) && k.includes(pattern)) || '';
      years[year] = {
        numberAtHighRisk: parseNum(r[findCol('Number') && findCol('>1%') ? `${year}: Number of properties at >1% risk` : '']),
        numberAtMediumRisk: parseNum(r[findCol('>0.1%') ? `${year}: Number of properties at >0.1% risk` : '']),
        numberAtLowRisk: parseNum(r[findCol('>0.01%') ? `${year}: Number of properties at >0.01% risk` : '']),
        pctAtHighRisk: parsePct(r[`${year}: Percentage of properties at >1% risk`]),
        pctAtMediumRisk: parsePct(r[`${year}: Percentage of properties at >0.1% risk`]),
        pctAtLowRisk: parsePct(r[`${year}: Percentage of properties at >0.01% risk`]),
      };
    }

    return { code: r[codeKey] || '', name: r[nameKey] || '', level, years };
  }).filter(p => p.code);
}

/** Convert all coordinates in a GeoJSON polygon ring from BNG to WGS84 */
function convertRing(ring: number[][]): number[][] {
  return ring.map(coord => {
    const [lon, lat] = proj4(BNG, WGS84, [coord[0], coord[1]]);
    return [lon, lat];
  });
}

function loadFloodRiskAreas(): FloodRiskAreasGeoJSON {
  const filePath = join(DATASET_DIR, 'floodriskareas', 'Flood_Risk_Areas.geojson');
  try {
    const raw = readFileSync(filePath, 'utf8');
    const geojson = JSON.parse(raw);
    const features: FloodRiskAreaFeature[] = (geojson.features || []).map((f: any) => {
      let coordinates: number[][][];
      if (f.geometry.type === 'Polygon') {
        coordinates = f.geometry.coordinates.map((ring: number[][]) => convertRing(ring));
      } else if (f.geometry.type === 'MultiPolygon') {
        coordinates = f.geometry.coordinates.map((polygon: number[][][]) =>
          polygon.map((ring: number[][]) => convertRing(ring))
        );
      } else {
        coordinates = f.geometry.coordinates;
      }
      return {
        type: 'Feature' as const,
        geometry: { type: f.geometry.type, coordinates },
        properties: {
          fra_id: f.properties.fra_id || '',
          fra_name: f.properties.fra_name || '',
          frr_cycle: f.properties.frr_cycle ?? 0,
          flood_source: f.properties.flood_source || '',
        },
      };
    });
    logger.info({ count: features.length }, 'Loaded Flood Risk Areas (BNG→WGS84)');
    return { type: 'FeatureCollection', features };
  } catch (err) {
    logger.error({ err }, 'Failed to load Flood Risk Areas GeoJSON');
    return { type: 'FeatureCollection', features: [] };
  }
}

/** Load 269K postcodes into a Map for O(1) lookup + prefix search */
function loadPostcodeRisk(): void {
  const filePath = join(DATASET_DIR, 'floodriskpostcodes', 'RoFRS_Postcodes_AtRisk.csv');
  try {
    let raw = readFileSync(filePath, 'utf8');
    // Strip UTF-8 BOM if present
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
    const lines = raw.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return;

    const map = new Map<string, PostcodeRisk>();
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      if (cols.length < 21) continue;
      const pc = cols[0].trim().toUpperCase();
      if (!pc) continue;
      map.set(pc, {
        postcode: pc,
        totalProperties: parseInt(cols[1]) || 0,
        residential: parseInt(cols[2]) || 0,
        nonResidential: parseInt(cols[3]) || 0,
        unclassified: parseInt(cols[4]) || 0,
        veryLow: {
          residential: parseInt(cols[5]) || 0,
          nonResidential: parseInt(cols[6]) || 0,
          unclassified: parseInt(cols[7]) || 0,
          total: parseInt(cols[8]) || 0,
        },
        low: {
          residential: parseInt(cols[9]) || 0,
          nonResidential: parseInt(cols[10]) || 0,
          unclassified: parseInt(cols[11]) || 0,
          total: parseInt(cols[12]) || 0,
        },
        medium: {
          residential: parseInt(cols[13]) || 0,
          nonResidential: parseInt(cols[14]) || 0,
          unclassified: parseInt(cols[15]) || 0,
          total: parseInt(cols[16]) || 0,
        },
        high: {
          residential: parseInt(cols[17]) || 0,
          nonResidential: parseInt(cols[18]) || 0,
          unclassified: parseInt(cols[19]) || 0,
          total: parseInt(cols[20]) || 0,
        },
      });
    }
    postcodeRiskMap = map;
    postcodeKeys = Array.from(map.keys()).sort();
    logger.info({ count: map.size }, 'Loaded RoFRS postcode risk data');
  } catch (err) {
    logger.error({ err }, 'Failed to load RoFRS postcode risk data');
  }
}

/** Stream-aggregate 2.4M properties into a summary (no individual storage) */
function loadPropertyRiskSummary(): void {
  const filePath = join(DATASET_DIR, 'floodriskproperties', 'RoFRS_PropertiesAtRisk.csv');
  try {
    const raw = readFileSync(filePath, 'utf8');
    const lines = raw.split(/\r?\n/);
    const summary: PropertyRiskSummary = {
      totalProperties: 0,
      byType: { residential: 0, nonResidential: 0, unclassified: 0 },
      byRisk: { veryLow: 0, low: 0, medium: 0, high: 0 },
      byTypeAndRisk: {},
    };

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      // Columns: UPRN,TOPO_TOID,PROPERTY_TYPE,RISK_BAND
      const lastTwo = line.lastIndexOf(',');
      const secondLast = line.lastIndexOf(',', lastTwo - 1);
      const propType = line.substring(secondLast + 1, lastTwo);
      const riskBand = line.substring(lastTwo + 1).trim();
      if (!riskBand) continue;

      summary.totalProperties++;

      // By type
      if (propType === 'RES') summary.byType.residential++;
      else if (propType === 'NRP') summary.byType.nonResidential++;
      else summary.byType.unclassified++;

      // By risk
      const riskLower = riskBand.toLowerCase();
      if (riskLower === 'very low') summary.byRisk.veryLow++;
      else if (riskLower === 'low') summary.byRisk.low++;
      else if (riskLower === 'medium') summary.byRisk.medium++;
      else if (riskLower === 'high') summary.byRisk.high++;

      // Cross-tabulation
      if (!summary.byTypeAndRisk[propType]) summary.byTypeAndRisk[propType] = {};
      summary.byTypeAndRisk[propType][riskBand] = (summary.byTypeAndRisk[propType][riskBand] || 0) + 1;
    }

    propertyRiskSummary = summary;
    logger.info({ total: summary.totalProperties }, 'Loaded RoFRS property risk summary');
  } catch (err) {
    logger.error({ err }, 'Failed to load RoFRS property risk summary');
  }
}

// ── Initialization ───────────────────────────────────────────────────

function init() {
  try {
    // floodriskmanage CSVs (NAO data)
    defencesRegion = loadDefences('floodriskmanage/Flood-risk-tool-Flood-Defences-by-Region.csv', 'region');
    defencesUTLA = loadDefences('floodriskmanage/Flood-risk-tool-Flood-Defences-by-Upper-Tier-Local-Authority.csv', 'utla');
    spendRegion = loadSpend('floodriskmanage/Flood-risk-tool-Flood-Spend-by-Region.csv', 'region');
    spendUTLA = loadSpend('floodriskmanage/Flood-risk-tool-Flood-Spend-by-Upper-Tier-Local-Authority.csv', 'utla');
    homesRegion = loadHomes('floodriskmanage/Flood-risk-tool-Homes-Better-Protected-by-Region.csv', 'region');
    homesUTLA = loadHomes('floodriskmanage/Flood-risk-tool-Homes-Better-Protected-by-Upper-Tier-Local-Authority.csv', 'utla');

    // floodriskmanage + floodriskzone — Properties at Risk (use floodriskmanage as it has more granularity)
    propsConstituency = loadPropertiesAtRisk('floodriskmanage/Flood-risk-tool-Properties-at-Risk-by-Constituency.csv', 'constituency');
    propsLTLA = loadPropertiesAtRisk('floodriskmanage/Flood-risk-tool-Properties-at-Risk-by-Lower-Tier-Local-Authority.csv', 'ltla');
    propsUTLA = loadPropertiesAtRisk('floodriskmanage/Flood-risk-tool-Properties-at-Risk-by-Upper-Tier-Local-Authority.csv', 'utla');

    // Flood Risk Areas GeoJSON (BNG→WGS84 conversion)
    floodRiskAreasGeoJSON = loadFloodRiskAreas();

    // RoFRS Postcodes & Properties at risk
    loadPostcodeRisk();
    loadPropertyRiskSummary();

    logger.info({
      defencesRegion: defencesRegion.length,
      defencesUTLA: defencesUTLA.length,
      spendRegion: spendRegion.length,
      spendUTLA: spendUTLA.length,
      homesRegion: homesRegion.length,
      homesUTLA: homesUTLA.length,
      propsConstituency: propsConstituency.length,
      propsLTLA: propsLTLA.length,
      propsUTLA: propsUTLA.length,
      floodRiskAreas: floodRiskAreasGeoJSON.features.length,
      postcodes: postcodeRiskMap.size,
      propertiesTotal: propertyRiskSummary.totalProperties,
    }, 'All local datasets loaded successfully');
  } catch (err) {
    logger.error({ err }, 'Failed to load local datasets');
  }
}

init();

// ── Public API ───────────────────────────────────────────────────────

export function getDefences(level?: string): DefenceStats[] {
  if (level === 'region') return defencesRegion;
  if (level === 'utla') return defencesUTLA;
  return [...defencesRegion, ...defencesUTLA];
}

export function getSpend(level?: string): SpendStats[] {
  if (level === 'region') return spendRegion;
  if (level === 'utla') return spendUTLA;
  return [...spendRegion, ...spendUTLA];
}

export function getHomesBetterProtected(level?: string): HomesBetterProtected[] {
  if (level === 'region') return homesRegion;
  if (level === 'utla') return homesUTLA;
  return [...homesRegion, ...homesUTLA];
}

export function getPropertiesAtRisk(level?: string): PropertiesAtRisk[] {
  if (level === 'constituency') return propsConstituency;
  if (level === 'ltla') return propsLTLA;
  if (level === 'utla') return propsUTLA;
  return [...propsConstituency, ...propsLTLA, ...propsUTLA];
}

export function getFloodRiskAreas(): FloodRiskAreasGeoJSON {
  return floodRiskAreasGeoJSON;
}

export function getPostcodeRisk(postcode: string): PostcodeRisk | null {
  const normalised = postcode.trim().toUpperCase();
  return postcodeRiskMap.get(normalised) ?? null;
}

export function searchPostcodes(prefix: string, limit = 20): PostcodeRisk[] {
  const normalised = prefix.trim().toUpperCase();
  if (!normalised) return [];
  const results: PostcodeRisk[] = [];
  // Binary search for start position, then linear scan
  let lo = 0, hi = postcodeKeys.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (postcodeKeys[mid] < normalised) lo = mid + 1;
    else hi = mid;
  }
  for (let i = lo; i < postcodeKeys.length && results.length < limit; i++) {
    if (!postcodeKeys[i].startsWith(normalised)) break;
    const entry = postcodeRiskMap.get(postcodeKeys[i]);
    if (entry) results.push(entry);
  }
  return results;
}

export function getPropertyRiskSummary(): PropertyRiskSummary {
  return propertyRiskSummary;
}

export function getDatasetSummary(): DatasetSummary {
  return {
    defences: { regions: defencesRegion.length, utlas: defencesUTLA.length },
    spend: { regions: spendRegion.length, utlas: spendUTLA.length },
    homesProtected: { regions: homesRegion.length, utlas: homesUTLA.length },
    propertiesAtRisk: {
      constituencies: propsConstituency.length,
      ltlas: propsLTLA.length,
      utlas: propsUTLA.length,
    },
    floodRiskAreas: { features: floodRiskAreasGeoJSON.features.length },
    postcodeRisk: { postcodes: postcodeRiskMap.size },
    propertyRisk: { totalProperties: propertyRiskSummary.totalProperties },
  };
}
