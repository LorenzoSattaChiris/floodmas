/**
 * EDM Storm Overflow Annual Return service
 * Loads summary statistics + per-company overflow data from two XLSX files:
 *   - floodevent/EDM 2024 Storm Overflow Annual Return - summary data.xlsx
 *   - floodevent/EDM 2024 Storm Overflow Annual Return - all water and sewerage companies.xlsx
 *
 * Data: Environment Agency, Open Government Licence v3.0
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';
import { logger } from '../logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const EDM_DIR = existsSync(join(__dirname, '../../src/dataset/floodevent'))
  ? join(__dirname, '../../src/dataset/floodevent')
  : join(__dirname, '../dataset/floodevent');

// ── Types ────────────────────────────────────────────────────────────

export interface StormOverflowCompanySummary {
  company: string;
  shortName: string;
  totalOverflows: number;
  activeOverflows: number;
  edmCommissioned: number;
  overflowsWithSpillData: number;
  avgSpillsPerOverflow: number | null;
  avgDurationPerSpill: number | null;
  totalMonitoredSpills: number;
  totalSpillDurationHrs: number | null;
  pctSpilled10OrLess: number | null;
  pctSpilled60OrMore: number | null;
  pctEdmAbove90: number | null;
}

export interface StormOverflowSummary {
  year: number;
  companies: StormOverflowCompanySummary[];
  totals: {
    totalOverflows: number;
    activeOverflows: number;
    totalMonitoredSpills: number;
    avgSpillsPerOverflow: number | null;
    avgDurationPerSpill: number | null;
  };
}

export interface StormOverflowRecord {
  uniqueId: string;
  company: string;
  siteName: string;
  permitRef: string;
  assetType: string;
  waterbodyId: string;
  waterbodyCatchment: string;
  receivingWater: string;
  totalDurationHrs: number | null;
  spillCount: number | null;
  longTermAvgSpillCount: number | null;
  edmOperationPct: number | null;
}

export interface StormOverflowData {
  summary: StormOverflowSummary;
  recordCount: number;
}

// ── In-Memory Cache ──────────────────────────────────────────────────

let stormOverflowSummary: StormOverflowSummary = {
  year: 2024,
  companies: [],
  totals: { totalOverflows: 0, activeOverflows: 0, totalMonitoredSpills: 0, avgSpillsPerOverflow: null, avgDurationPerSpill: null },
};
let stormOverflowRecords: StormOverflowRecord[] = [];

// ── Company short names ──────────────────────────────────────────────

const COMPANY_SHORT_NAMES: Record<string, string> = {
  'Anglian Water (AWS)': 'Anglian',
  'Dwr Cymru Welsh Water (DC/WW)\r\n(in England)': 'Welsh Water',
  'Northumbrian Water (NW)': 'Northumbrian',
  'Severn Trent Water (SvT)': 'Severn Trent',
  'South West Water (SWW)': 'South West',
  'Southern Water (SW)': 'Southern',
  'Thames Water (TW)': 'Thames',
  'United Utilities (UU)': 'United Utilities',
  'Wessex Water (WSSX)': 'Wessex',
  'Yorkshire Water (YWS)': 'Yorkshire',
};

// ── Parsing ──────────────────────────────────────────────────────────

function safeNum(val: unknown): number | null {
  if (val == null || val === '-' || val === '') return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

function parseDurationToHours(val: unknown): number | null {
  if (val == null) return null;
  // Can be a decimal fraction of a day (Excel serial) or a number of hours
  const n = Number(val);
  if (isNaN(n)) return null;
  // Excel stores time as fraction of a day — if value is < 50, treat as hours; otherwise as days
  // The summary file uses hours directly. The detail file uses fractional days.
  return n;
}

function loadSummary(): void {
  const filePath = join(EDM_DIR, 'EDM 2024 Storm Overflow Annual Return - summary data.xlsx');
  try {
    const wb = XLSX.readFile(filePath);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    // Find Table 1 header row (row index 8 based on inspection)
    // Format: [label, company1, company2, ..., "Water Company Total", "Water Company Average"]
    const headerRowIdx = rows.findIndex(r =>
      Array.isArray(r) && typeof r[0] === 'string' && r[0].includes('Table 1:') && r.length > 3,
    );
    if (headerRowIdx < 0) {
      logger.warn('EDM summary: could not find Table 1 header row');
      return;
    }

    const companyNames = (rows[headerRowIdx] as string[]).slice(1, -2); // skip label + Total + Average

    // Row offsets relative to headerRowIdx
    const totalOverflowsRow = rows[headerRowIdx + 1] as unknown[];
    const activeOverflowsRow = rows[headerRowIdx + 2] as unknown[];
    const edmCommRow = rows[headerRowIdx + 3] as unknown[];
    const spillDataRow = rows[headerRowIdx + 5] as unknown[];
    const avgSpillsRow = rows[headerRowIdx + 6] as unknown[];
    const avgDurationRow = rows[headerRowIdx + 7] as unknown[];

    // Table 2 — find it
    const table2Idx = rows.findIndex(r =>
      Array.isArray(r) && typeof r[0] === 'string' && r[0].includes('Table 2:') && r.length > 3,
    );
    const totalSpillsRow = table2Idx >= 0 ? rows[table2Idx + 1] as unknown[] : null;
    const totalDurationRow = table2Idx >= 0 ? rows[table2Idx + 3] as unknown[] : null;
    const pctl10Row = table2Idx >= 0 ? rows[table2Idx + 5] as unknown[] : null;

    // Table 3 — EDM device operation
    const table3Idx = rows.findIndex(r =>
      Array.isArray(r) && typeof r[0] === 'string' && r[0].includes('Table 3:') && r.length > 3,
    );
    const edmAbove90Row = table3Idx >= 0 ? rows[table3Idx + 3] as unknown[] : null;

    // Table 4 — Spill performance
    const table4Idx = rows.findIndex(r =>
      Array.isArray(r) && typeof r[0] === 'string' && r[0].includes('Table 4:') && r.length > 3,
    );
    const pct60Row = table4Idx >= 0 ? rows[table4Idx + 8] as unknown[] : null;

    const companies: StormOverflowCompanySummary[] = companyNames.map((name, i) => {
      const col = i + 1; // offset for data columns (first col is label)
      return {
        company: String(name).replace(/\r?\n/g, ' ').trim(),
        shortName: COMPANY_SHORT_NAMES[String(name)] || String(name).replace(/\r?\n.*/, '').trim(),
        totalOverflows: safeNum(totalOverflowsRow?.[col]) ?? 0,
        activeOverflows: safeNum(activeOverflowsRow?.[col]) ?? 0,
        edmCommissioned: safeNum(edmCommRow?.[col]) ?? 0,
        overflowsWithSpillData: safeNum(spillDataRow?.[col]) ?? 0,
        avgSpillsPerOverflow: safeNum(avgSpillsRow?.[col]),
        avgDurationPerSpill: safeNum(avgDurationRow?.[col]),
        totalMonitoredSpills: safeNum(totalSpillsRow?.[col]) ?? 0,
        totalSpillDurationHrs: safeNum(totalDurationRow?.[col]),
        pctSpilled10OrLess: safeNum(pctl10Row?.[col]),
        pctSpilled60OrMore: safeNum(pct60Row?.[col]),
        pctEdmAbove90: safeNum(edmAbove90Row?.[col]),
      };
    });

    // Totals column (second-to-last)
    const totalsCol = (rows[headerRowIdx] as unknown[]).length - 2;
    stormOverflowSummary = {
      year: 2024,
      companies,
      totals: {
        totalOverflows: safeNum(totalOverflowsRow?.[totalsCol]) ?? 0,
        activeOverflows: safeNum(activeOverflowsRow?.[totalsCol]) ?? 0,
        totalMonitoredSpills: safeNum(totalSpillsRow?.[totalsCol]) ?? 0,
        avgSpillsPerOverflow: safeNum(avgSpillsRow?.[(rows[headerRowIdx] as unknown[]).length - 1]),
        avgDurationPerSpill: safeNum(avgDurationRow?.[(rows[headerRowIdx] as unknown[]).length - 1]),
      },
    };

    logger.info({ companies: companies.length }, 'Loaded EDM storm overflow summary');
  } catch (err) {
    logger.error({ err }, 'Failed to load EDM summary XLSX');
  }
}

function loadDetailedRecords(): void {
  const filePath = join(EDM_DIR, 'EDM 2024 Storm Overflow Annual Return - all water and sewerage companies.xlsx');
  try {
    const wb = XLSX.readFile(filePath);
    const records: StormOverflowRecord[] = [];

    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      // Row 0 = title, Row 1 = headers, Row 2+ = data
      if (rows.length < 3) continue;

      for (let i = 2; i < rows.length; i++) {
        const r = rows[i];
        if (!r || !r[0]) continue;

        // Convert duration from fractional days to hours if needed
        let durationHrs = parseDurationToHours(r[15]);
        // Excel stores time as fraction of day — values like 0.1875 are actually ~4.5 hours
        if (durationHrs !== null && durationHrs < 1 && durationHrs > 0) {
          durationHrs = durationHrs * 24; // Convert from days to hours
        }

        records.push({
          uniqueId: String(r[0] || ''),
          company: String(r[1] || ''),
          siteName: String(r[2] || ''),
          permitRef: String(r[4] || ''),
          assetType: String(r[7] || ''),
          waterbodyId: String(r[9] || ''),
          waterbodyCatchment: String(r[10] || ''),
          receivingWater: String(r[11] || ''),
          totalDurationHrs: durationHrs,
          spillCount: safeNum(r[16]),
          longTermAvgSpillCount: safeNum(r[17]),
          edmOperationPct: safeNum(r[19]),
        });
      }
    }

    stormOverflowRecords = records;
    logger.info({ count: records.length }, 'Loaded EDM storm overflow detailed records');
  } catch (err) {
    logger.error({ err }, 'Failed to load EDM detailed XLSX');
  }
}

// ── Initialization ───────────────────────────────────────────────────

export function initStormOverflows() {
  loadSummary();
  loadDetailedRecords();
}

// ── Public API ───────────────────────────────────────────────────────

export function getStormOverflowSummary(): StormOverflowSummary {
  return stormOverflowSummary;
}

export function getStormOverflowData(): StormOverflowData {
  return {
    summary: stormOverflowSummary,
    recordCount: stormOverflowRecords.length,
  };
}

/**
 * Get detailed overflow records, optionally filtered by company name.
 * Returns a paginated subset to avoid sending 14K+ records at once.
 */
export function getStormOverflowRecords(
  company?: string,
  limit = 500,
  offset = 0,
): { records: StormOverflowRecord[]; total: number } {
  let filtered = stormOverflowRecords;
  if (company) {
    const lc = company.toLowerCase();
    filtered = stormOverflowRecords.filter(r => r.company.toLowerCase().includes(lc));
  }
  return {
    records: filtered.slice(offset, offset + limit),
    total: filtered.length,
  };
}
