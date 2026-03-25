/**
 * IMD (Index of Multiple Deprivation) 2019 service
 *
 * Data sources:
 *   IMD CSV  — MHCLG English Indices of Deprivation 2019 File 7
 *              (all scores, ranks & deciles for 32,844 LSOAs)
 *   Geometry — ONS Open Geography Portal FeatureServer
 *              LSOA_Dec_2011_Boundaries_Generalised_Clipped_BGC_EW_V3
 *
 * Approach:
 *   Load CSV once at startup → Map<LSOA11CD, IMDRecord>
 *   On each bbox request, query ONS FeatureServer for LSOA polygons within
 *   that extent (max 500 features), join IMD scores, return enriched GeoJSON.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getCached, setCache } from './cache.js';
import { logger } from '../logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ONS_LSOA_FS =
  'https://services1.arcgis.com/ESMARspQHYMw9BZ9/ArcGIS/rest/services/' +
  'LSOA_Dec_2011_Boundaries_Generalised_Clipped_BGC_EW_V3/FeatureServer/0';

// ── Types ─────────────────────────────────────────────────────────────

export interface IMDRecord {
  lsoaCode: string;
  lsoaName: string;
  ladCode: string;
  ladName: string;
  imdScore: number;
  imdRank: number;
  imdDecile: number;
  incomeScore: number;
  incomeDecile: number;
  employmentScore: number;
  employmentDecile: number;
  educationScore: number;
  educationDecile: number;
  healthScore: number;
  healthDecile: number;
  crimeScore: number;
  crimeDecile: number;
  barriersScore: number;
  barriersDecile: number;
  livingEnvScore: number;
  livingEnvDecile: number;
  totalPop: number;
}

export interface IMDGeoJSON {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry: { type: string; coordinates: unknown };
    properties: IMDRecord & Record<string, unknown>;
  }>;
}

// ── CSV loading ───────────────────────────────────────────────────────

let imdMap: Map<string, IMDRecord> | null = null;

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

function num(val: string): number {
  const n = parseFloat(val?.trim() || '');
  return isNaN(n) ? 0 : n;
}

function int(val: string): number {
  const n = parseInt(val?.trim() || '', 10);
  return isNaN(n) ? 0 : n;
}

function loadIMDCSV(): Map<string, IMDRecord> {
  const csvPath = join(__dirname, '../dataset/imd/imd2019.csv');
  const raw = readFileSync(csvPath, 'utf-8');
  const lines = raw.split(/\r?\n/).filter(l => l.trim());

  const headers = splitCSVRow(lines[0]);
  const idx = (name: string) => headers.findIndex(h => h.trim() === name);

  const iCode   = idx('LSOA code (2011)');
  const iName   = idx('LSOA name (2011)');
  const iLadC   = idx('Local Authority District code (2019)');
  const iLadN   = idx('Local Authority District name (2019)');
  const iImdS   = idx('Index of Multiple Deprivation (IMD) Score');
  const iImdR   = idx('Index of Multiple Deprivation (IMD) Rank (where 1 is most deprived)');
  const iImdD   = idx('Index of Multiple Deprivation (IMD) Decile (where 1 is most deprived 10% of LSOAs)');
  const iIncS   = idx('Income Score (rate)');
  const iIncD   = idx('Income Decile (where 1 is most deprived 10% of LSOAs)');
  const iEmpS   = idx('Employment Score (rate)');
  const iEmpD   = idx('Employment Decile (where 1 is most deprived 10% of LSOAs)');
  const iEduS   = idx('Education, Skills and Training Score');
  const iEduD   = idx('Education, Skills and Training Decile (where 1 is most deprived 10% of LSOAs)');
  const iHlthS  = idx('Health Deprivation and Disability Score');
  const iHlthD  = idx('Health Deprivation and Disability Decile (where 1 is most deprived 10% of LSOAs)');
  const iCrmS   = idx('Crime Score');
  const iCrmD   = idx('Crime Decile (where 1 is most deprived 10% of LSOAs)');
  const iBarS   = idx('Barriers to Housing and Services Score');
  const iBarD   = idx('Barriers to Housing and Services Decile (where 1 is most deprived 10% of LSOAs)');
  const iLivS   = idx('Living Environment Score');
  const iLivD   = idx('Living Environment Decile (where 1 is most deprived 10% of LSOAs)');
  const iPop    = idx('Total population: mid 2015 (excluding prisoners)');

  const map = new Map<string, IMDRecord>();

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCSVRow(lines[i]);
    const code = cols[iCode]?.trim();
    if (!code) continue;

    map.set(code, {
      lsoaCode:         code,
      lsoaName:         cols[iName]?.trim() ?? '',
      ladCode:          cols[iLadC]?.trim() ?? '',
      ladName:          cols[iLadN]?.trim() ?? '',
      imdScore:         num(cols[iImdS]),
      imdRank:          int(cols[iImdR]),
      imdDecile:        int(cols[iImdD]),
      incomeScore:      num(cols[iIncS]),
      incomeDecile:     int(cols[iIncD]),
      employmentScore:  num(cols[iEmpS]),
      employmentDecile: int(cols[iEmpD]),
      educationScore:   num(cols[iEduS]),
      educationDecile:  int(cols[iEduD]),
      healthScore:      num(cols[iHlthS]),
      healthDecile:     int(cols[iHlthD]),
      crimeScore:       num(cols[iCrmS]),
      crimeDecile:      int(cols[iCrmD]),
      barriersScore:    num(cols[iBarS]),
      barriersDecile:   int(cols[iBarD]),
      livingEnvScore:   num(cols[iLivS]),
      livingEnvDecile:  int(cols[iLivD]),
      totalPop:         int(cols[iPop]),
    });
  }

  logger.info({ count: map.size }, 'IMD 2019 dataset loaded');
  return map;
}

function getIMDMap(): Map<string, IMDRecord> {
  if (!imdMap) {
    imdMap = loadIMDCSV();
  }
  return imdMap;
}

// ── ArcGIS FeatureServer query ────────────────────────────────────────

interface ONSFeature {
  type: 'Feature';
  geometry: { type: string; coordinates: unknown };
  properties: { LSOA11CD?: string; LSOA11NM?: string; [key: string]: unknown };
}

interface ONSFeatureCollection {
  type: 'FeatureCollection';
  features: ONSFeature[];
}

async function queryLSOABoundaries(
  bbox: { xmin: number; ymin: number; xmax: number; ymax: number },
): Promise<ONSFeatureCollection> {
  const cacheKey = `imd:ons:${bbox.xmin.toFixed(3)},${bbox.ymin.toFixed(3)},${bbox.xmax.toFixed(3)},${bbox.ymax.toFixed(3)}`;
  const cached = getCached<ONSFeatureCollection>(cacheKey);
  if (cached) return cached.data;

  const params = new URLSearchParams({
    where: '1=1',
    outFields: 'LSOA11CD,LSOA11NM',
    f: 'geojson',
    resultRecordCount: '2000',
    outSR: '4326',
    geometry: JSON.stringify({
      xmin: bbox.xmin, ymin: bbox.ymin,
      xmax: bbox.xmax, ymax: bbox.ymax,
      spatialReference: { wkid: 4326 },
    }),
    geometryType: 'esriGeometryEnvelope',
    spatialRel: 'esriSpatialRelIntersects',
    inSR: '4326',
  });

  const url = `${ONS_LSOA_FS}/query?${params}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(25000),
  });

  if (!res.ok) {
    throw new Error(`ONS LSOA FeatureServer error: ${res.status}`);
  }

  const data = await res.json() as ONSFeatureCollection;
  // Cache LSOA boundaries for 24 h (boundaries never change)
  setCache(cacheKey, data, 'floodAreas');
  return data;
}

// ── Public API ────────────────────────────────────────────────────────

/**
 * Get LSOA boundaries enriched with IMD 2019 deprivation scores
 * for the given map bounding box.
 */
export async function getIMDBoundaries(
  bbox: { xmin: number; ymin: number; xmax: number; ymax: number },
): Promise<IMDGeoJSON> {
  const [onsData, imd] = await Promise.all([
    queryLSOABoundaries(bbox),
    Promise.resolve(getIMDMap()),
  ]);

  const features = onsData.features
    .map(f => {
      const code = f.properties?.LSOA11CD as string | undefined;
      if (!code) return null;
      const record = imd.get(code);
      if (!record) return null;
      return {
        type: 'Feature' as const,
        geometry: f.geometry,
        properties: { ...record },
      };
    })
    .filter((f): f is NonNullable<typeof f> => f !== null);

  return { type: 'FeatureCollection', features };
}

/**
 * Get deprivation info for a single LSOA by code.
 */
export function getLSOAByCode(code: string): IMDRecord | null {
  return getIMDMap().get(code.toUpperCase()) ?? null;
}

/**
 * Return IMD records for LSOAs whose Local Authority District name contains
 * the given search string (case-insensitive partial match).
 * Sorted by imdRank ascending (most deprived first).
 */
export function getIMDByLAD(ladName: string, topN = 50): IMDRecord[] {
  const map = getIMDMap();
  const lower = ladName.toLowerCase();
  const results: IMDRecord[] = [];
  for (const record of map.values()) {
    if (record.ladName.toLowerCase().includes(lower)) {
      results.push(record);
    }
  }
  return results.sort((a, b) => a.imdRank - b.imdRank).slice(0, topN);
}

/**
 * Return aggregate summary stats about the IMD dataset.
 */
export function getIMDSummary(): {
  totalLSOAs: number;
  mostDeprived10pct: number;
  dataYear: string;
  source: string;
} {
  const map = getIMDMap();
  return {
    totalLSOAs: map.size,
    mostDeprived10pct: [...map.values()].filter(r => r.imdDecile === 1).length,
    dataYear: '2019',
    source: 'MHCLG English Indices of Deprivation 2019',
  };
}
