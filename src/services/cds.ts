import AdmZip from 'adm-zip';
import { getCached, setCache } from './cache.js';
import { logger } from '../logger.js';

// ─── Copernicus Climate Data Store (CDS) – ERA5-Land Reanalysis ─────
// Provides reanalysis climate data (soil moisture, temperature, precipitation,
// snow cover) for the UK grid, ~5 days behind real-time.
// API: https://cds.climate.copernicus.eu/how-to-api

const CDS_BASE = 'https://cds.climate.copernicus.eu/api/retrieve/v1';
const DATASET = 'reanalysis-era5-land-timeseries';

function getApiKey(): string {
  return process.env.CDS_API_KEY ?? '';
}

// Variables we request from ERA5-Land
const CDS_VARIABLES = [
  '2m_temperature',
  'total_precipitation',
  'volumetric_soil_water_level_1',
  'snow_cover',
] as const;

// UK cities — same as Open-Meteo / Met Office grids
const UK_POINTS = [
  { lat: 50.8, lon: -1.1, name: 'Southampton' },
  { lat: 51.5, lon: -0.1, name: 'London' },
  { lat: 51.5, lon: -2.6, name: 'Bristol' },
  { lat: 51.5, lon: -3.2, name: 'Cardiff' },
  { lat: 52.5, lon: -1.9, name: 'Birmingham' },
  { lat: 52.6, lon: -1.1, name: 'Leicester' },
  { lat: 53.5, lon: -2.2, name: 'Manchester' },
  { lat: 53.4, lon: -1.5, name: 'Sheffield' },
  { lat: 53.8, lon: -1.6, name: 'Leeds' },
  { lat: 54.6, lon: -1.6, name: 'Darlington' },
  { lat: 54.9, lon: -1.6, name: 'Newcastle' },
  { lat: 55.9, lon: -3.2, name: 'Edinburgh' },
  { lat: 55.9, lon: -4.3, name: 'Glasgow' },
  { lat: 57.1, lon: -2.1, name: 'Aberdeen' },
];

// ─── Types ──────────────────────────────────────────────────────────

export interface CDSReanalysisPoint {
  lat: number;
  lon: number;
  name: string;
  /** Latest available temperature in °C */
  temperature_c: number;
  /** ERA5 soil moisture 0–7 cm, m³/m³ (0–1 range) */
  soil_moisture_m3m3: number;
  /** Total precipitation (mm/h) for the latest day */
  precipitation_mm_h: number;
  /** Snow cover percentage (0–100) */
  snow_cover_pct: number;
  /** ISO date of the data */
  data_time: string;
}

export interface CDSReanalysisGrid {
  points: CDSReanalysisPoint[];
  dataTimestamp: string;
  generatedAt: string;
}

// ─── Submit + poll a CDS job ────────────────────────────────────────

interface JobResult {
  href: string;
}

async function submitAndPoll(
  lat: number,
  lon: number,
  dateRange: string,
): Promise<Buffer | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const body = {
    inputs: {
      variable: [...CDS_VARIABLES],
      location: { latitude: lat, longitude: lon },
      date: [dateRange],
      data_format: 'csv',
    },
  };

  // Submit job
  const submitRes = await fetch(`${CDS_BASE}/processes/${DATASET}/execution`, {
    method: 'POST',
    headers: {
      'PRIVATE-TOKEN': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!submitRes.ok) {
    const text = await submitRes.text();
    logger.warn({ status: submitRes.status, text }, 'CDS job submission failed');
    return null;
  }

  const submitData = (await submitRes.json()) as { jobID: string; status: string };
  const jobId = submitData.jobID;

  // Poll for completion (max ~3 minutes)
  for (let i = 0; i < 36; i++) {
    await new Promise((ok) => setTimeout(ok, 5000));

    const pollRes = await fetch(`${CDS_BASE}/jobs/${jobId}`, {
      headers: { 'PRIVATE-TOKEN': apiKey },
    });
    if (!pollRes.ok) continue;

    const pollData = (await pollRes.json()) as { status: string };

    if (pollData.status === 'successful') {
      const resultRes = await fetch(`${CDS_BASE}/jobs/${jobId}/results`, {
        headers: { 'PRIVATE-TOKEN': apiKey },
      });
      if (!resultRes.ok) return null;
      const resultData = (await resultRes.json()) as {
        asset?: { value?: { href?: string } };
      };
      const href = resultData.asset?.value?.href;
      if (!href) return null;

      // Download the ZIP
      const dlRes = await fetch(href);
      if (!dlRes.ok) return null;
      return Buffer.from(await dlRes.arrayBuffer());
    }

    if (pollData.status === 'failed') {
      logger.warn({ jobId }, 'CDS job failed');
      return null;
    }
  }

  logger.warn({ jobId }, 'CDS job timed out');
  return null;
}

// ─── Parse CSV from ZIP buffer ──────────────────────────────────────

interface ParsedCSV {
  /** Column name for the data variable (e.g. 't2m', 'swvl1', etc.) */
  varName: string;
  /** Rows of { valid_time, value, latitude, longitude } */
  rows: Array<{ valid_time: string; value: number }>;
}

function parseZipCSVs(zipBuf: Buffer): ParsedCSV[] {
  const zip = new AdmZip(zipBuf);
  const results: ParsedCSV[] = [];

  for (const entry of zip.getEntries()) {
    if (!entry.entryName.endsWith('.csv')) continue;
    const text = entry.getData().toString('utf-8');
    const lines = text.trim().split('\n');
    if (lines.length < 2) continue;

    const header = lines[0].split(',');
    // CSV columns: valid_time, <variable_name>, latitude, longitude
    const varName = header[1]; // e.g. 't2m', 'swvl1', 'tp', 'snowc'
    if (!varName) continue;

    const rows: Array<{ valid_time: string; value: number }> = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      if (cols.length < 2) continue;
      rows.push({
        valid_time: cols[0],
        value: parseFloat(cols[1]),
      });
    }
    results.push({ varName, rows });
  }

  return results;
}

// ─── Latest values from parsed CSV arrays ───────────────────────────

function extractLatestValues(csvs: ParsedCSV[]): {
  temperature_c: number;
  soil_moisture_m3m3: number;
  precipitation_mm_h: number;
  snow_cover_pct: number;
  data_time: string;
} {
  let temperature_c = NaN;
  let soil_moisture_m3m3 = NaN;
  let precipitation_mm_h = NaN;
  let snow_cover_pct = NaN;
  let data_time = '';

  for (const csv of csvs) {
    if (csv.rows.length === 0) continue;
    // Take the last row (most recent time step)
    const last = csv.rows[csv.rows.length - 1];

    switch (csv.varName) {
      case 't2m':
        temperature_c = last.value - 273.15; // Kelvin → °C
        if (!data_time) data_time = last.valid_time;
        break;
      case 'swvl1':
        soil_moisture_m3m3 = last.value; // m³/m³
        break;
      case 'tp':
        // Total precipitation in meters → mm; sum last 24 rows if available
        {
          const last24 = csv.rows.slice(-24);
          precipitation_mm_h = last24.reduce((sum, r) => sum + r.value, 0) * 1000;
        }
        break;
      case 'snowc':
        snow_cover_pct = last.value; // already 0–100
        break;
    }
  }

  return { temperature_c, soil_moisture_m3m3, precipitation_mm_h, snow_cover_pct, data_time };
}

// ─── Compute the date range (5-day lag safe window) ─────────────────

function getDateRange(): string {
  const now = new Date();
  // ERA5-Land has ~5 day lag; request 7→6 days ago to be safe
  const end = new Date(now.getTime() - 6 * 86_400_000);
  const start = new Date(end.getTime() - 86_400_000); // 1 day of data
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return `${fmt(start)}/${fmt(end)}`;
}

// ─── Public: Fetch ERA5-Land grid for UK ────────────────────────────

export async function getCDSReanalysisGrid(): Promise<CDSReanalysisGrid> {
  const cached = getCached<CDSReanalysisGrid>('cds:reanalysis-grid');
  if (cached) return cached.data;

  const apiKey = getApiKey();
  if (!apiKey) {
    return {
      points: [],
      dataTimestamp: '',
      generatedAt: new Date().toISOString(),
    };
  }

  const dateRange = getDateRange();
  logger.info({ dateRange, cities: UK_POINTS.length }, 'Starting CDS ERA5-Land batch fetch');

  const points: CDSReanalysisPoint[] = [];

  // Process in batches of 3 to keep CDS queue manageable
  const batchSize = 3;
  for (let i = 0; i < UK_POINTS.length; i += batchSize) {
    const batch = UK_POINTS.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map((pt) => submitAndPoll(pt.lat, pt.lon, dateRange)),
    );

    for (let j = 0; j < batch.length; j++) {
      const result = results[j];
      const pt = batch[j];
      if (result.status !== 'fulfilled' || !result.value) {
        logger.warn({ city: pt.name }, 'CDS fetch failed for city');
        continue;
      }

      const csvs = parseZipCSVs(result.value);
      const vals = extractLatestValues(csvs);
      if (isNaN(vals.temperature_c)) continue;

      points.push({
        lat: pt.lat,
        lon: pt.lon,
        name: pt.name,
        temperature_c: Math.round(vals.temperature_c * 10) / 10,
        soil_moisture_m3m3: Math.round(vals.soil_moisture_m3m3 * 1000) / 1000,
        precipitation_mm_h: Math.round(vals.precipitation_mm_h * 100) / 100,
        snow_cover_pct: Math.round(vals.snow_cover_pct * 10) / 10,
        data_time: vals.data_time,
      });
    }
  }

  const grid: CDSReanalysisGrid = {
    points,
    dataTimestamp: dateRange,
    generatedAt: new Date().toISOString(),
  };

  setCache('cds:reanalysis-grid', grid, 'cds');
  logger.info({ pointCount: points.length, dateRange }, 'CDS ERA5-Land grid fetched');
  return grid;
}
