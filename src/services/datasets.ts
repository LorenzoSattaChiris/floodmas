/**
 * Local dataset service — loads and serves CSV statistics and GeoJSON
 * from server/src/dataset/ directories:
 *   - floodriskzone/    (GOV.UK flood risk tool CSVs)
 *   - floodriskmanage/  (NAO Managing Flood Risk raw data CSVs)
 *   - floodriskareas/   (Defra Flood Risk Areas GeoJSON, EPSG:27700→WGS84)
 *   - floodriskpostcodes/ (EA RoFRS postcodes in areas at risk — 269K postcodes)
 *   - floodriskproperties/ (EA RoFRS properties at risk — 2.4M aggregated)
 */

import { readFileSync, existsSync, createReadStream } from 'fs';
import { readFile } from 'fs/promises';
import { createInterface } from 'readline';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// In compiled code (dist/services/datasets.js), go 2 levels up to reach the project root,
// then into src/dataset — the canonical location of dataset files.
// In dev mode (tsx watches src/), go 1 level up which resolves to src/dataset as well.
const _srcDataset = join(__dirname, '../../src/dataset');
const _localDataset = join(__dirname, '../dataset');
const DATASET_DIR = existsSync(_srcDataset) ? _srcDataset : _localDataset;

/** Yield to the event loop — lets GC run and keeps Passenger alive */
const tick = () => new Promise<void>(r => setImmediate(r));

/** proj4 converter function type */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Proj4Fn = (...args: any[]) => any;

// British National Grid projection (EPSG:27700)
const BNG =
  '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 ' +
  '+ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs';
const WGS84 = 'EPSG:4326';

// ── CSV Parsing ──────────────────────────────────────────────────────

/** Parse CSV string content into an array of objects (no I/O — accepts pre-read string) */
function parseCSVFromString(raw: string): Record<string, string>[] {
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

/** Parse a CSV file into an array of objects, handling quoted fields with commas */
function parseCSV(filePath: string, encoding: BufferEncoding = 'latin1'): Record<string, string>[] {
  return parseCSVFromString(readFileSync(filePath, encoding));
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

export interface WFDCatchmentFeature {
  type: 'Feature';
  geometry: { type: string; coordinates: number[][][] | number[][][][] };
  properties: {
    wb_id: string;
    wb_name: string;
    rbd_id: string;
    rbd_name: string;
    wb_cat: string;
    area_km2: number;
    length_km: number;
  };
}

export interface WFDCatchmentsGeoJSON {
  type: 'FeatureCollection';
  features: WFDCatchmentFeature[];
}

export interface NFMHotspotFeature {
  type: 'Feature';
  geometry: { type: string; coordinates: number[][][] | number[][][][] };
  properties: {
    layer: string;
  };
}

export interface NFMHotspotsGeoJSON {
  type: 'FeatureCollection';
  features: NFMHotspotFeature[];
}

export interface SchoolFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    urn: string;
    name: string;
    type: string;
    phase: string;
    la: string;
    town: string;
    postcode: string;
    constituency: string;
  };
}

export interface SchoolsGeoJSON {
  type: 'FeatureCollection';
  features: SchoolFeature[];
}

export interface HospitalFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    name: string;
    aka: string;
    address: string;
    postcode: string;
    phone: string;
    website: string;
    serviceTypes: string;
    specialisms: string;
    provider: string;
    la: string;
    region: string;
    cqcUrl: string;
  };
}

export interface HospitalsGeoJSON {
  type: 'FeatureCollection';
  features: HospitalFeature[];
}

export interface BathingWaterFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    eubwid: string;
    name: string;
    samplePointId: string;
    district: string;
    county: string;
    country: string;
    classification: string;
    classificationYear: number;
    seasonStart: string;
    seasonEnd: string;
    pollutionRiskForecasting: boolean;
    sewerageUndertaker: string;
    bwqUrl: string;
  };
}

export interface BathingWatersGeoJSON {
  type: 'FeatureCollection';
  features: BathingWaterFeature[];
}

export interface RamsarFeature {
  type: 'Feature';
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: any };
  properties: {
    name: string;
    code: string;
    area_ha: number;
    status: string;
    gis_date: string;
  };
}

export interface RamsarGeoJSON {
  type: 'FeatureCollection';
  features: RamsarFeature[];
}

export interface WaterCompanyBoundaryFeature {
  type: 'Feature';
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: any };
  properties: {
    company: string;
    acronym: string;
    areaServed: string;
    coType: string;
    areaType: string;
  };
}

export interface WaterCompanyBoundariesGeoJSON {
  type: 'FeatureCollection';
  features: WaterCompanyBoundaryFeature[];
}

export interface EDMOverflowFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    company: string;
    siteName: string;
    permitRef: string;
    assetType: string;
    receivingWater: string;
    totalDurationHrs: number;
    countedSpills: number;
    edmOperationPct: number;
    treatmentType: string;
    localAuthority: string;
    constituency: string;
    country: string;
    riverBasinDistrict: string;
  };
}

export interface EDMOverflowsGeoJSON {
  type: 'FeatureCollection';
  features: EDMOverflowFeature[];
}

export interface WINEPOverflowFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    company: string;
    siteName: string;
    waterBody: string;
    waterBodyId: string;
    waterBodyType: string;
    rbd: string;
    area: string;
    actionType: string;
    certainty: string;
    coreObligation: string;
    driverCode: string;
    winepId: string;
    uniqueId: string;
    implementationScope: string;
  };
}

export interface WINEPOverflowsGeoJSON {
  type: 'FeatureCollection';
  features: WINEPOverflowFeature[];
}

export interface DatasetSummary {
  defences: { regions: number; utlas: number };
  spend: { regions: number; utlas: number };
  homesProtected: { regions: number; utlas: number };
  propertiesAtRisk: { constituencies: number; ltlas: number; utlas: number };
  floodRiskAreas: { features: number };
  postcodeRisk: { postcodes: number };
  propertyRisk: { totalProperties: number };
  wfdCatchments: { features: number };
  nfmHotspots: { features: number };
  schools: { features: number };
  hospitals: { features: number };
  bathingWaters: { features: number };
  ramsar: { features: number };
  waterCompanyBoundaries: { features: number };
  edmOverflows: { features: number };
  winepOverflows: { features: number };
}

// ── Readiness flag ────────────────────────────────────────────────────

let _datasetsReady = false;
export function isDatasetsReady(): boolean { return _datasetsReady; }

// ── In-Memory Cache ──────────────────────────────────────────────────
// Phase 1 (core CSVs) loaded eagerly at startup.
// Phase 2 (heavy GeoJSON) loaded lazily on first request — keeps RAM low.

let defencesRegion: DefenceStats[] = [];
let defencesUTLA: DefenceStats[] = [];
let spendRegion: SpendStats[] = [];
let spendUTLA: SpendStats[] = [];
let homesRegion: HomesBetterProtected[] = [];
let homesUTLA: HomesBetterProtected[] = [];
let propsConstituency: PropertiesAtRisk[] = [];
let propsLTLA: PropertiesAtRisk[] = [];
let propsUTLA: PropertiesAtRisk[] = [];
let postcodeRiskMap = new Map<string, PostcodeRisk>();
let postcodeKeys: string[] = [];
let propertyRiskSummary: PropertyRiskSummary = {
  totalProperties: 0,
  byType: { residential: 0, nonResidential: 0, unclassified: 0 },
  byRisk: { veryLow: 0, low: 0, medium: 0, high: 0 },
  byTypeAndRisk: {},
};

// Heavy GeoJSON: lazy-loaded on first request via getXxx() async getters.
// Each cache entry is null (not loaded), a Promise (loading), or the loaded data.
type LazyCache<T> = { data: T | null; loading: Promise<T> | null };

const _floodRiskAreas: LazyCache<FloodRiskAreasGeoJSON> = { data: null, loading: null };
const _wfdCatchments: LazyCache<WFDCatchmentsGeoJSON> = { data: null, loading: null };
const _nfmHotspots: LazyCache<NFMHotspotsGeoJSON> = { data: null, loading: null };
const _schools: LazyCache<SchoolsGeoJSON> = { data: null, loading: null };
const _hospitals: LazyCache<HospitalsGeoJSON> = { data: null, loading: null };
const _bathingWaters: LazyCache<BathingWatersGeoJSON> = { data: null, loading: null };
const _ramsar: LazyCache<RamsarGeoJSON> = { data: null, loading: null };
const _waterCompanyBoundaries: LazyCache<WaterCompanyBoundariesGeoJSON> = { data: null, loading: null };
const _edmOverflows: LazyCache<EDMOverflowsGeoJSON> = { data: null, loading: null };
const _winepOverflows: LazyCache<WINEPOverflowsGeoJSON> = { data: null, loading: null };

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
function convertRing(ring: number[][], proj: Proj4Fn): number[][] {
  return ring.map(coord => {
    const [lon, lat] = proj(BNG, WGS84, [coord[0], coord[1]]);
    return [lon, lat];
  });
}

async function loadFloodRiskAreas(proj: Proj4Fn): Promise<FloodRiskAreasGeoJSON> {
  const filePath = join(DATASET_DIR, 'floodriskareas', 'Flood_Risk_Areas.geojson');
  try {
    if (!existsSync(filePath)) { logger.warn('Flood Risk Areas file not found'); return { type: 'FeatureCollection', features: [] }; }
    const raw = await readFile(filePath, 'utf8');
    const geojson = JSON.parse(raw);
    const features: FloodRiskAreaFeature[] = (geojson.features || []).map((f: any) => {
      let coordinates: number[][][];
      if (f.geometry.type === 'Polygon') {
        coordinates = f.geometry.coordinates.map((ring: number[][]) => convertRing(ring, proj));
      } else if (f.geometry.type === 'MultiPolygon') {
        coordinates = f.geometry.coordinates.map((polygon: number[][][]) =>
          polygon.map((ring: number[][]) => convertRing(ring, proj))
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

/** Load 269K postcodes into a Map for O(1) lookup + prefix search — streamed line by line */
async function loadPostcodeRisk(): Promise<void> {
  const filePath = join(DATASET_DIR, 'floodriskpostcodes', 'RoFRS_Postcodes_AtRisk.csv');
  if (!existsSync(filePath)) { logger.warn('RoFRS postcodes file not found'); return; }
  try {
    const map = new Map<string, PostcodeRisk>();
    const rl = createInterface({ input: createReadStream(filePath, 'utf8'), crlfDelay: Infinity });
    let header = true;
    for await (const line of rl) {
      if (header) { header = false; continue; }
      const cols = line.split(',');
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
async function loadPropertyRiskSummary(): Promise<void> {
  const filePath = join(DATASET_DIR, 'floodriskproperties', 'RoFRS_PropertiesAtRisk.csv');
  if (!existsSync(filePath)) { logger.warn('RoFRS properties file not found'); return; }
  try {
    const summary: PropertyRiskSummary = {
      totalProperties: 0,
      byType: { residential: 0, nonResidential: 0, unclassified: 0 },
      byRisk: { veryLow: 0, low: 0, medium: 0, high: 0 },
      byTypeAndRisk: {},
    };

    const rl = createInterface({ input: createReadStream(filePath, 'utf8'), crlfDelay: Infinity });
    let header = true;
    for await (const line of rl) {
      if (header) { header = false; continue; }
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

/** Convert a BNG GeoJSON feature collection to WGS84 (handles Polygon + MultiPolygon) */
function convertGeoJSONToWGS84(geojson: any, proj: Proj4Fn): any[] {
  return (geojson.features || []).map((f: any) => {
    let coordinates: any;
    if (f.geometry.type === 'Polygon') {
      coordinates = f.geometry.coordinates.map((ring: number[][]) => convertRing(ring, proj));
    } else if (f.geometry.type === 'MultiPolygon') {
      coordinates = f.geometry.coordinates.map((polygon: number[][][]) =>
        polygon.map((ring: number[][]) => convertRing(ring, proj)),
      );
    } else {
      coordinates = f.geometry.coordinates;
    }
    return {
      type: 'Feature' as const,
      geometry: { type: f.geometry.type, coordinates },
      properties: f.properties,
    };
  });
}

async function loadWFDCatchments(proj: Proj4Fn): Promise<WFDCatchmentsGeoJSON> {
  const filePath = join(DATASET_DIR, 'floodwaterbody', 'WFD_River_Water_Body_Catchments_Cycle_2.geojson');
  if (!existsSync(filePath)) { logger.warn('WFD Catchments file not found (254MB — deploy manually)'); return { type: 'FeatureCollection', features: [] }; }
  try {
    const raw = await readFile(filePath, 'utf8');
    const geojson = JSON.parse(raw);
    const converted = convertGeoJSONToWGS84(geojson, proj);
    const features: WFDCatchmentFeature[] = converted.map((f: any) => ({
      type: 'Feature' as const,
      geometry: f.geometry,
      properties: {
        wb_id: (f.properties.wb_id || '').trim(),
        wb_name: (f.properties.wb_name || '').trim(),
        rbd_id: f.properties.rbd_id || '',
        rbd_name: f.properties.rbd_name || '',
        wb_cat: f.properties.wb_cat || '',
        area_km2: Math.round(parseFloat(f.properties.area_m2 || '0') / 10000) / 100,
        length_km: Math.round(parseFloat(f.properties.length_m || '0') / 10) / 100,
      },
    }));
    logger.info({ count: features.length }, 'Loaded WFD River Waterbody Catchments (BNG→WGS84)');
    return { type: 'FeatureCollection', features };
  } catch (err) {
    logger.error({ err }, 'Failed to load WFD Catchments GeoJSON');
    return { type: 'FeatureCollection', features: [] };
  }
}

async function loadNFMHotspots(proj: Proj4Fn): Promise<NFMHotspotsGeoJSON> {
  const filePath = join(DATASET_DIR, 'floodheatmap', 'NFM_Hotspots.geojson');
  if (!existsSync(filePath)) { logger.warn('NFM Hotspots file not found'); return { type: 'FeatureCollection', features: [] }; }
  try {
    const raw = await readFile(filePath, 'utf8');
    const geojson = JSON.parse(raw);
    const converted = convertGeoJSONToWGS84(geojson, proj);
    const features: NFMHotspotFeature[] = converted.map((f: any) => ({
      type: 'Feature' as const,
      geometry: f.geometry,
      properties: {
        layer: f.properties.layer || 'NFM Hotspot',
      },
    }));
    logger.info({ count: features.length }, 'Loaded NFM Hotspots (BNG→WGS84)');
    return { type: 'FeatureCollection', features };
  } catch (err) {
    logger.error({ err }, 'Failed to load NFM Hotspots GeoJSON');
    return { type: 'FeatureCollection', features: [] };
  }
}

async function loadSchools(): Promise<SchoolsGeoJSON> {
  const csvPath = join(DATASET_DIR, 'schools', 'edubaseallstatefunded20260325.csv');
  const coordsPath = join(DATASET_DIR, 'schools', 'postcode-coords.json');
  try {
    const rows = parseCSVFromString(await readFile(csvPath, 'utf8'));
    const coords: Record<string, [number, number]> = JSON.parse(await readFile(coordsPath, 'utf8'));

    const features: SchoolFeature[] = [];
    for (const r of rows) {
      if (r['EstablishmentStatus (name)'] !== 'Open') continue;
      const pc = (r['Postcode'] || '').trim();
      const coord = coords[pc];
      if (!coord) continue;
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: coord },
        properties: {
          urn: r['URN'] || '',
          name: r['EstablishmentName'] || '',
          type: r['TypeOfEstablishment (name)'] || '',
          phase: r['PhaseOfEducation (name)'] || '',
          la: r['LA (name)'] || '',
          town: r['Town'] || '',
          postcode: pc,
          constituency: r['ParliamentaryConstituency (name)'] || '',
        },
      });
    }
    logger.info({ count: features.length }, 'Loaded state-funded schools (postcode→WGS84)');
    return { type: 'FeatureCollection', features };
  } catch (err) {
    logger.error({ err }, 'Failed to load schools dataset');
    return { type: 'FeatureCollection', features: [] };
  }
}

async function loadBathingWaters(): Promise<BathingWatersGeoJSON> {
  const sitePath = join(DATASET_DIR, 'bathing', 'site.csv');
  const classPath = join(DATASET_DIR, 'bathing', 'classifications.csv');
  try {
    const siteRows = parseCSVFromString(await readFile(sitePath, 'utf8'));
    const classRows = parseCSVFromString(await readFile(classPath, 'utf8'));

    // Build map of latest classification per EUBWID
    const latestClass: Record<string, { year: number; label: string }> = {};
    for (const r of classRows) {
      const id = r['EUBWID'] || '';
      const yr = parseInt(r['year'] || '0');
      const cl = r['classificationLabel'] || '';
      if (id && yr && (!latestClass[id] || yr > latestClass[id].year)) {
        latestClass[id] = { year: yr, label: cl };
      }
    }

    const features: BathingWaterFeature[] = [];
    for (const r of siteRows) {
      const lat = parseFloat(r['lat'] || '');
      const lng = parseFloat(r['long'] || '');
      if (isNaN(lat) || isNaN(lng)) continue;
      const eubwid = r['EUBWID'] || '';
      const cl = latestClass[eubwid];
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lng, lat] },
        properties: {
          eubwid,
          name: r['label'] || '',
          samplePointId: r['samplePointID'] || '',
          district: r['district'] || '',
          county: r['county'] || '',
          country: r['country'] || '',
          classification: cl?.label || 'Unknown',
          classificationYear: cl?.year || 0,
          seasonStart: r['seasonStartDate'] || '',
          seasonEnd: r['seasonFinishDate'] || '',
          pollutionRiskForecasting: r['pollutionRiskForecasting'] === 'true',
          sewerageUndertaker: r['appointedSewerageUndertaker'] || '',
          bwqUrl: `https://environment.data.gov.uk/bwq/profiles/profile.html?site=${eubwid}`,
        },
      });
    }
    logger.info({ count: features.length }, 'Loaded bathing water quality sites (lat/long)');
    return { type: 'FeatureCollection', features };
  } catch (err) {
    logger.error({ err }, 'Failed to load bathing waters dataset');
    return { type: 'FeatureCollection', features: [] };
  }
}

async function loadRamsar(): Promise<RamsarGeoJSON> {
  const filePath = join(DATASET_DIR, 'ramsar', 'Ramsar_England_7440752995595243115.geojson');
  try {
    const raw = await readFile(filePath, 'utf8');
    const geojson = JSON.parse(raw);
    const features: RamsarFeature[] = (geojson.features || []).map((f: any) => ({
      type: 'Feature' as const,
      geometry: { type: f.geometry.type, coordinates: f.geometry.coordinates },
      properties: {
        name: f.properties.NAME || '',
        code: f.properties.CODE || '',
        area_ha: f.properties.AREA ?? 0,
        status: f.properties.STATUS || 'Listed',
        gis_date: f.properties.GIS_DATE || '',
      },
    }));
    logger.info({ count: features.length }, 'Loaded Ramsar Wetlands (England)');
    return { type: 'FeatureCollection', features };
  } catch (err) {
    logger.error({ err }, 'Failed to load Ramsar Wetlands GeoJSON');
    return { type: 'FeatureCollection', features: [] };
  }
}

async function loadWaterCompanyBoundaries(): Promise<WaterCompanyBoundariesGeoJSON> {
  const filePath = join(DATASET_DIR, 'waterboundaries', 'UC2_263904301232770618.geojson');
  try {
    const raw = await readFile(filePath, 'utf8');
    const geojson = JSON.parse(raw);
    const features: WaterCompanyBoundaryFeature[] = (geojson.features || []).map((f: any) => ({
      type: 'Feature' as const,
      geometry: { type: f.geometry.type, coordinates: f.geometry.coordinates },
      properties: {
        company: f.properties.COMPANY || '',
        acronym: f.properties.Acronym || '',
        areaServed: f.properties.AreaServed || '',
        coType: f.properties.CoType || '',
        areaType: f.properties.AreaType || '',
      },
    }));
    logger.info({ count: features.length }, 'Loaded Water Company Boundaries');
    return { type: 'FeatureCollection', features };
  } catch (err) {
    logger.error({ err }, 'Failed to load Water Company Boundaries GeoJSON');
    return { type: 'FeatureCollection', features: [] };
  }
}

async function loadEDMOverflows(): Promise<EDMOverflowsGeoJSON> {
  const filePath = join(DATASET_DIR, 'stormoverflow', 'Storm_Overflow_EDM_Annual_Returns_2024_-104550533390684639.geojson');
  try {
    const raw = await readFile(filePath, 'utf8');
    const geojson = JSON.parse(raw);
    const features: EDMOverflowFeature[] = [];
    for (const f of geojson.features || []) {
      if (!f.geometry || f.geometry.type !== 'Point') continue;
      const [lon, lat] = f.geometry.coordinates;
      if (!lat || !lon) continue;
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: {
          company: f.properties.waterCompanyName || '',
          siteName: f.properties.siteNameEA || '',
          permitRef: f.properties.permitReferenceEA || '',
          assetType: f.properties.assetType || '',
          receivingWater: f.properties.recievingWaterName || '',
          totalDurationHrs: f.properties.totalDurationAllSpillsHrs ?? 0,
          countedSpills: f.properties.countedSpills ?? 0,
          edmOperationPct: f.properties.edmOperationPercent ?? 0,
          treatmentType: f.properties.treatmentType || '',
          localAuthority: f.properties.localAuthority || '',
          constituency: f.properties.constituencyWestminster || '',
          country: f.properties.country || '',
          riverBasinDistrict: f.properties.riverBasinDistrict || '',
        },
      });
    }
    logger.info({ count: features.length }, 'Loaded EDM Storm Overflows 2024');
    return { type: 'FeatureCollection', features };
  } catch (err) {
    logger.error({ err }, 'Failed to load EDM Storm Overflows GeoJSON');
    return { type: 'FeatureCollection', features: [] };
  }
}

async function loadWINEPOverflows(): Promise<WINEPOverflowsGeoJSON> {
  const filePath = join(DATASET_DIR, 'currentstormoverflow', 'Water_Company_Sewer_Storm_Overflow_Under_Investigation.geojson');
  try {
    const raw = await readFile(filePath, 'utf8');
    const geojson = JSON.parse(raw);
    const features: WINEPOverflowFeature[] = [];
    for (const f of geojson.features || []) {
      if (!f.geometry || f.geometry.type !== 'Point') continue;
      const [lon, lat] = f.geometry.coordinates;
      if (!lat || !lon) continue;
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: {
          company: (f.properties.WaterCo || '').trim(),
          siteName: (f.properties.SiteName || '').trim(),
          waterBody: (f.properties.WBname || '').trim(),
          waterBodyId: f.properties.WBID || '',
          waterBodyType: (f.properties.Wbtype || '').trim(),
          rbd: f.properties.RBD || '',
          area: f.properties.AREA || '',
          actionType: f.properties.ActionType || '',
          certainty: (f.properties.Certainty || '').trim(),
          coreObligation: f.properties.CoreObligation || '',
          driverCode: f.properties.DriverCodePrimary || '',
          winepId: f.properties.WINEPID || '',
          uniqueId: f.properties.UniqueID || '',
          implementationScope: (f.properties.ImplementationScope || '').trim(),
        },
      });
    }
    logger.info({ count: features.length }, 'Loaded WINEP Storm Overflows Under Investigation');
    return { type: 'FeatureCollection', features };
  } catch (err) {
    logger.error({ err }, 'Failed to load WINEP Storm Overflows GeoJSON');
    return { type: 'FeatureCollection', features: [] };
  }
}

async function loadHospitals(): Promise<HospitalsGeoJSON> {
  const csvPath = join(DATASET_DIR, 'hospitals', '18_March_2026_CQC_directory.csv');
  const coordsPath = join(DATASET_DIR, 'hospitals', 'postcode-coords.json');
  try {
    // CQC CSV has 4 preamble rows before the actual header
    let raw = await readFile(csvPath, 'utf8');
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
    const allLines = raw.split(/\r?\n/).filter(l => l.trim());
    let headerIdx = -1;
    for (let i = 0; i < Math.min(10, allLines.length); i++) {
      if (allLines[i].startsWith('Name,') || allLines[i].startsWith('"Name"')) {
        headerIdx = i;
        break;
      }
    }
    if (headerIdx < 0) { logger.warn('CQC CSV: header row not found'); return { type: 'FeatureCollection', features: [] }; }
    const headers = splitCSVRow(allLines[headerIdx]).map(h => h.trim());
    const idx = (name: string) => headers.indexOf(name);

    const coords: Record<string, [number, number]> = JSON.parse(await readFile(coordsPath, 'utf8'));

    const features: HospitalFeature[] = [];
    for (let i = headerIdx + 1; i < allLines.length; i++) {
      const vals = splitCSVRow(allLines[i]);
      const pc = (vals[idx('Postcode')] || '').trim();
      const coord = coords[pc];
      if (!coord) continue;
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: coord },
        properties: {
          name: (vals[idx('Name')] || '').trim(),
          aka: (vals[idx('Also known as')] || '').trim(),
          address: (vals[idx('Address')] || '').trim(),
          postcode: pc,
          phone: (vals[idx('Phone number')] || '').trim(),
          website: (vals[idx("Service's website (if available)")] || '').trim(),
          serviceTypes: (vals[idx('Service types')] || '').trim(),
          specialisms: (vals[idx('Specialisms/services')] || '').trim(),
          provider: (vals[idx('Provider name')] || '').trim(),
          la: (vals[idx('Local authority')] || '').trim(),
          region: (vals[idx('Region')] || '').trim(),
          cqcUrl: (vals[idx('Location URL')] || '').trim(),
        },
      });
    }
    logger.info({ count: features.length }, 'Loaded CQC health/care locations (postcode→WGS84)');
    return { type: 'FeatureCollection', features };
  } catch (err) {
    logger.error({ err }, 'Failed to load hospitals dataset');
    return { type: 'FeatureCollection', features: [] };
  }
}

// ── Initialization ───────────────────────────────────────────────────

/** Phase 1: lightweight CSVs — fast, small files the agent system needs */
export function initDatasetsCore() {
  try {
    // floodriskmanage CSVs (NAO data)
    defencesRegion = loadDefences('floodriskmanage/Flood-risk-tool-Flood-Defences-by-Region.csv', 'region');
    defencesUTLA = loadDefences('floodriskmanage/Flood-risk-tool-Flood-Defences-by-Upper-Tier-Local-Authority.csv', 'utla');
    spendRegion = loadSpend('floodriskmanage/Flood-risk-tool-Flood-Spend-by-Region.csv', 'region');
    spendUTLA = loadSpend('floodriskmanage/Flood-risk-tool-Flood-Spend-by-Upper-Tier-Local-Authority.csv', 'utla');
    homesRegion = loadHomes('floodriskmanage/Flood-risk-tool-Homes-Better-Protected-by-Region.csv', 'region');
    homesUTLA = loadHomes('floodriskmanage/Flood-risk-tool-Homes-Better-Protected-by-Upper-Tier-Local-Authority.csv', 'utla');

    // floodriskmanage — Properties at Risk summaries
    propsConstituency = loadPropertiesAtRisk('floodriskmanage/Flood-risk-tool-Properties-at-Risk-by-Constituency.csv', 'constituency');
    propsLTLA = loadPropertiesAtRisk('floodriskmanage/Flood-risk-tool-Properties-at-Risk-by-Lower-Tier-Local-Authority.csv', 'ltla');
    propsUTLA = loadPropertiesAtRisk('floodriskmanage/Flood-risk-tool-Properties-at-Risk-by-Upper-Tier-Local-Authority.csv', 'utla');

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
    }, '📊 Phase 1 datasets loaded (core CSVs)');
  } catch (err) {
    logger.error({ err }, 'Failed to load Phase 1 datasets');
  }
}

/** Phase 2: streamed CSV aggregates only — heavy GeoJSON deferred to lazy getters */
export async function initDatasetsHeavy() {
  const mem = () => Math.round(process.memoryUsage.rss() / 1024 / 1024);
  logger.info({ rss: mem() }, '📊 Phase 2 starting — loading streamed CSV aggregates');

  try { await loadPostcodeRisk(); } catch (err) { logger.error({ err }, 'Postcodes load failed'); }
  await tick();
  try { await loadPropertyRiskSummary(); } catch (err) { logger.error({ err }, 'Property summary load failed'); }
  await tick();

  _datasetsReady = true;
  logger.info({ rss: mem() }, '📊 Phase 2 complete — heavy GeoJSON will lazy-load on first request');
}

/** @deprecated Use initDatasetsCore() + initDatasetsHeavy() instead */
export async function initDatasets() {
  initDatasetsCore();
  await initDatasetsHeavy();
}

// ── Lazy-load helper ─────────────────────────────────────────────────

const EMPTY_FC = { type: 'FeatureCollection' as const, features: [] as any[] };

/** Ensure proj4 is loaded (cached after first import) */
let _proj4: Proj4Fn | null = null;
async function getProj4(): Promise<Proj4Fn | null> {
  if (_proj4) return _proj4;
  try {
    _proj4 = (await import('proj4')).default;
    return _proj4;
  } catch (err) {
    logger.error({ err }, 'Failed to load proj4');
    return null;
  }
}

/** Generic lazy loader: loads on first call, caches result, deduplicates concurrent calls */
async function lazyLoad<T>(cache: LazyCache<T>, name: string, loader: () => Promise<T>, fallback: T): Promise<T> {
  if (cache.data) return cache.data;
  if (cache.loading) return cache.loading;
  cache.loading = (async () => {
    try {
      const mem = () => Math.round(process.memoryUsage.rss() / 1024 / 1024);
      logger.info({ rss: mem() }, `📎 Lazy-loading ${name}…`);
      const result = await loader();
      cache.data = result;
      logger.info({ rss: mem() }, `  ✓ ${name} loaded`);
      return result;
    } catch (err) {
      logger.error({ err }, `  ✗ ${name} failed`);
      return fallback;
    } finally {
      cache.loading = null;
    }
  })();
  return cache.loading;
}

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

export async function getFloodRiskAreas(): Promise<FloodRiskAreasGeoJSON> {
  return lazyLoad(_floodRiskAreas, 'Flood Risk Areas', async () => {
    const proj = await getProj4();
    if (!proj) return EMPTY_FC as FloodRiskAreasGeoJSON;
    return loadFloodRiskAreas(proj);
  }, EMPTY_FC as FloodRiskAreasGeoJSON);
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

export async function getWFDCatchments(): Promise<WFDCatchmentsGeoJSON> {
  return lazyLoad(_wfdCatchments, 'WFD Catchments', async () => {
    const proj = await getProj4();
    if (!proj) return EMPTY_FC as WFDCatchmentsGeoJSON;
    return loadWFDCatchments(proj);
  }, EMPTY_FC as WFDCatchmentsGeoJSON);
}

export async function getNFMHotspots(): Promise<NFMHotspotsGeoJSON> {
  return lazyLoad(_nfmHotspots, 'NFM Hotspots', async () => {
    const proj = await getProj4();
    if (!proj) return EMPTY_FC as NFMHotspotsGeoJSON;
    return loadNFMHotspots(proj);
  }, EMPTY_FC as NFMHotspotsGeoJSON);
}

export async function getSchools(): Promise<SchoolsGeoJSON> {
  return lazyLoad(_schools, 'Schools', loadSchools, EMPTY_FC as SchoolsGeoJSON);
}

export async function getHospitals(): Promise<HospitalsGeoJSON> {
  return lazyLoad(_hospitals, 'Hospitals', loadHospitals, EMPTY_FC as HospitalsGeoJSON);
}

export async function getBathingWaters(): Promise<BathingWatersGeoJSON> {
  return lazyLoad(_bathingWaters, 'Bathing Waters', loadBathingWaters, EMPTY_FC as BathingWatersGeoJSON);
}

export async function getRamsar(): Promise<RamsarGeoJSON> {
  return lazyLoad(_ramsar, 'Ramsar Wetlands', loadRamsar, EMPTY_FC as RamsarGeoJSON);
}

export async function getWaterCompanyBoundaries(): Promise<WaterCompanyBoundariesGeoJSON> {
  return lazyLoad(_waterCompanyBoundaries, 'Water Company Boundaries', loadWaterCompanyBoundaries, EMPTY_FC as WaterCompanyBoundariesGeoJSON);
}

export async function getEDMOverflows(): Promise<EDMOverflowsGeoJSON> {
  return lazyLoad(_edmOverflows, 'EDM Overflows', loadEDMOverflows, EMPTY_FC as EDMOverflowsGeoJSON);
}

export async function getWINEPOverflows(): Promise<WINEPOverflowsGeoJSON> {
  return lazyLoad(_winepOverflows, 'WINEP Overflows', loadWINEPOverflows, EMPTY_FC as WINEPOverflowsGeoJSON);
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
    floodRiskAreas: { features: _floodRiskAreas.data?.features.length ?? 0 },
    postcodeRisk: { postcodes: postcodeRiskMap.size },
    propertyRisk: { totalProperties: propertyRiskSummary.totalProperties },
    wfdCatchments: { features: _wfdCatchments.data?.features.length ?? 0 },
    nfmHotspots: { features: _nfmHotspots.data?.features.length ?? 0 },
    schools: { features: _schools.data?.features.length ?? 0 },
    hospitals: { features: _hospitals.data?.features.length ?? 0 },
    bathingWaters: { features: _bathingWaters.data?.features.length ?? 0 },
    ramsar: { features: _ramsar.data?.features.length ?? 0 },
    waterCompanyBoundaries: { features: _waterCompanyBoundaries.data?.features.length ?? 0 },
    edmOverflows: { features: _edmOverflows.data?.features.length ?? 0 },
    winepOverflows: { features: _winepOverflows.data?.features.length ?? 0 },
  };
}
