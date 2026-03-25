/**
 * LLFA (Lead Local Flood Authority) service
 * Loads:
 *  - County/Unitary Authority boundaries GeoJSON (EPSG:4326, 218 features)
 *  - Russell LFRMS audit 2022 XLSX (152 LLFAs with strategy info)
 * Merges XLSX info into GeoJSON feature properties for per-LLFA information cards.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';
import { logger } from '../logger.js';
import { getDefences, getSpend, getHomesBetterProtected, getPropertiesAtRisk } from './datasets.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LLFA_DIR = existsSync(join(__dirname, '../../src/dataset/LLFA'))
  ? join(__dirname, '../../src/dataset/LLFA')
  : join(__dirname, '../dataset/LLFA');

// ── Types ────────────────────────────────────────────────────────────

export interface LLFAStrategyInfo {
  yearPublished: number | null;
  hasBeenUpdated: string;
  isLivingDocument: string;
  activePeriod: string;
  wordCount: number | null;
  hasCoverSheet: string;
  externalConsultant: string;
  isCoastalArea: string;
  /** Stakeholder mentions */
  stakeholders: {
    idbMentions: number | null;
    nationalHighwaysMentions: number | null;
    waterCompanyMentions: string;
    rfccMentions: number | null;
    defraMentions: number | null;
    eaMentions: number | null;
    riparianMentions: number | null;
    publicMentions: number | null;
    consultationMentions: number | null;
  };
  /** Strategy quality indicators */
  quality: {
    clearObjectives: string;
    smartObjectives: string;
    monitoringEvaluation: string;
    referencesSFRAs: string;
    climateChangeScenarios: string;
    climateChangeRisk: string;
    surfaceWaterMeasures: string;
    adaptationPathways: string;
    defenceAssetRegister: string;
    populationChange: string;
    fcermAlignment: string;
  };
  /** Specific term mention counts */
  termMentions: {
    greenBlueInfra: number | null;
    suds: number | null;
    plrPlp: number | null;
    csoManagement: number | null;
    spatialPlanning: number | null;
    nfm: number | null;
    natureBasedSolutions: number | null;
    floodWarning: number | null;
    demountableBarriers: number | null;
    multiAgencyPlans: number | null;
    recovery: number | null;
    uplandStorage: number | null;
    landManagement: number | null;
    localFloodGroup: number | null;
    climateChange: number | null;
    rofrs: number | null;
    rofsw: number | null;
    floodMapPlanning: number | null;
    floodMapSurfaceWater: number | null;
    climateProjections: number | null;
    resilience: number | null;
    sea: number | null;
    ccra: number | null;
    nppf: number | null;
    localPlan: number | null;
    environmentPlan25yr: number | null;
    fcermStrategy: string;
    floodWaterManagementAct: number | null;
    climateChangeAct: number | null;
    nationalAdaptation: number | null;
  };
  /** Coastal-specific if applicable */
  coastal: {
    smpMentions: number | null;
    slrMentions: number | null;
  };
}

export interface LLFAFeatureProperties {
  CTYUA24CD: string;
  CTYUA24NM: string;
  CTYUA24NMW: string;
  BNG_E: number;
  BNG_N: number;
  LONG: number;
  LAT: number;
  hasStrategy: boolean;
  strategy?: LLFAStrategyInfo;
  // Flood management stats (joined from floodriskmanage dataset by ONS code)
  defenceCount: number | null;
  defenceCondition: number | null;
  totalSpend: number | null;
  homesProtected: number | null;
  propertiesHighRisk: number | null;
  propertiesHighRiskPct: number | null;
}

export interface LLFAGeoJSON {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry: { type: string; coordinates: unknown };
    properties: LLFAFeatureProperties;
  }>;
}

// ── In-memory cache ──────────────────────────────────────────────────

let llfaGeoJSON: LLFAGeoJSON = { type: 'FeatureCollection', features: [] };
let llfaInfoMap = new Map<string, LLFAStrategyInfo>();

// ── Name normalisation for matching XLSX→GeoJSON ─────────────────────

function normaliseName(name: string): string {
  return name
    .trim()
    .replace(/\s+UA$/i, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

// ── Parse XLSX ───────────────────────────────────────────────────────

function safeNum(val: unknown): number | null {
  if (val === null || val === undefined || val === '' || val === ' ') return null;
  const n = typeof val === 'number' ? val : parseFloat(String(val));
  return isNaN(n) ? null : n;
}

function safeStr(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

function loadLFRMSData(): Map<string, LLFAStrategyInfo> {
  const filePath = join(LLFA_DIR, 'Russell Local Flood Risk Management Strategies (LFRMSs) audit 2022 Accepted.xlsx');
  const map = new Map<string, LLFAStrategyInfo>();

  try {
    const wb = XLSX.readFile(filePath);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

    // Row 0 = section headers, Row 1 = column headers, Row 2+ = data
    // Column indices (0-based): B=1(LLFA), C=2(Year), D=3(Updated?), E=4(Living doc?),
    // F=5(Active Period), G=6(Word count), H=7(Cover sheet?), I=8(External consultant?),
    // J=9(Coastal?), K=10(IDB), L=11(Nat Highways), M=12(Water co.), N=13(RFCCs),
    // O=14(DEFRA), P=15(EA), Q=16(Riparian), R=17(Public), S=18(Consultation),
    // U=20(Clear obj?), V=21(SMART?), W=22(M&E?), X=23(SFRAs?), Y=24(CC scenarios?),
    // Z=25(CC risk?), AA=26(Surface water?), AB=27(Adaptation pathways?),
    // AC=28(Defence register?), AD=29(Population change?), AE=30(FCERM alignment?)
    // AG=32(Green/blue), AH=33(SuDS), AI=34(PLR/PLP), AJ=35(CSO), AK=36(Spatial planning),
    // AL=37(NFM), AM=38(NBS), AN=39(Flood warn), AO=40(Demountable), AP=41(Multi-agency),
    // AQ=42(Recovery), AR=43(Upland storage), AS=44(Land mgmt), AT=45(Local flood grp),
    // AU=46(Climate change), AV=47(RoFRS), AW=48(RoFSW), AX=49(Flood map planning),
    // AY=50(Flood map SW), AZ=51(Climate projections), BA=52(SMP), BB=53(SLR),
    // BC=54(Resilience), BD=55(SEA), BE=56(CCRA), BF=57(NPPF), BG=58(Local Plan),
    // BH=59(25yr Env Plan), BI=60(FCERM Strategy), BJ=61(Flood & Water Mgmt Act),
    // BK=62(Climate Change Act), BL=63(National Adaptation)

    for (let i = 2; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row[1] || typeof row[1] !== 'string' || !row[1].trim()) continue;

      const name = normaliseName(row[1] as string);
      const info: LLFAStrategyInfo = {
        yearPublished: safeNum(row[2]),
        hasBeenUpdated: safeStr(row[3]),
        isLivingDocument: safeStr(row[4]),
        activePeriod: safeStr(row[5]),
        wordCount: safeNum(row[6]),
        hasCoverSheet: safeStr(row[7]),
        externalConsultant: safeStr(row[8]),
        isCoastalArea: safeStr(row[9]),
        stakeholders: {
          idbMentions: safeNum(row[10]),
          nationalHighwaysMentions: safeNum(row[11]),
          waterCompanyMentions: safeStr(row[12]),
          rfccMentions: safeNum(row[13]),
          defraMentions: safeNum(row[14]),
          eaMentions: safeNum(row[15]),
          riparianMentions: safeNum(row[16]),
          publicMentions: safeNum(row[17]),
          consultationMentions: safeNum(row[18]),
        },
        quality: {
          clearObjectives: safeStr(row[20]),
          smartObjectives: safeStr(row[21]),
          monitoringEvaluation: safeStr(row[22]),
          referencesSFRAs: safeStr(row[23]),
          climateChangeScenarios: safeStr(row[24]),
          climateChangeRisk: safeStr(row[25]),
          surfaceWaterMeasures: safeStr(row[26]),
          adaptationPathways: safeStr(row[27]),
          defenceAssetRegister: safeStr(row[28]),
          populationChange: safeStr(row[29]),
          fcermAlignment: safeStr(row[30]),
        },
        termMentions: {
          greenBlueInfra: safeNum(row[32]),
          suds: safeNum(row[33]),
          plrPlp: safeNum(row[34]),
          csoManagement: safeNum(row[35]),
          spatialPlanning: safeNum(row[36]),
          nfm: safeNum(row[37]),
          natureBasedSolutions: safeNum(row[38]),
          floodWarning: safeNum(row[39]),
          demountableBarriers: safeNum(row[40]),
          multiAgencyPlans: safeNum(row[41]),
          recovery: safeNum(row[42]),
          uplandStorage: safeNum(row[43]),
          landManagement: safeNum(row[44]),
          localFloodGroup: safeNum(row[45]),
          climateChange: safeNum(row[46]),
          rofrs: safeNum(row[47]),
          rofsw: safeNum(row[48]),
          floodMapPlanning: safeNum(row[49]),
          floodMapSurfaceWater: safeNum(row[50]),
          climateProjections: safeNum(row[51]),
          resilience: safeNum(row[54]),
          sea: safeNum(row[55]),
          ccra: safeNum(row[56]),
          nppf: safeNum(row[57]),
          localPlan: safeNum(row[58]),
          environmentPlan25yr: safeNum(row[59]),
          fcermStrategy: safeStr(row[60]),
          floodWaterManagementAct: safeNum(row[61]),
          climateChangeAct: safeNum(row[62]),
          nationalAdaptation: safeNum(row[63]),
        },
        coastal: {
          smpMentions: safeNum(row[52]),
          slrMentions: safeNum(row[53]),
        },
      };

      map.set(name, info);
    }

    logger.info({ count: map.size }, 'Loaded LFRMS audit data from XLSX');
  } catch (err) {
    logger.error({ err }, 'Failed to load LFRMS audit XLSX');
  }

  return map;
}

// ── Load GeoJSON and merge XLSX info ─────────────────────────────────

function loadLLFABoundaries(): LLFAGeoJSON {
  const geoPath = join(
    LLFA_DIR,
    'Counties_and_Unitary_Authorities_December_2024_Boundaries_UK_BGC_3152178837812104842.geojson',
  );

  try {
    const raw = readFileSync(geoPath, 'utf8');
    const geojson = JSON.parse(raw);

    // Build stats lookup maps from floodriskmanage datasets (joined by ONS code)
    const defMap = new Map(getDefences('utla').map(d => [d.code, d]));
    const spendMap = new Map(getSpend('utla').map(s => [s.code, s]));
    const homesMap = new Map(getHomesBetterProtected('utla').map(h => [h.code, h]));
    const propsMap = new Map(getPropertiesAtRisk('utla').map(p => [p.code, p]));

    const features = (geojson.features || []).map((f: any) => {
      const code: string = f.properties?.CTYUA24CD || '';
      const name: string = f.properties?.CTYUA24NM || '';
      const normName = normaliseName(name);

      const strategyInfo = llfaInfoMap.get(normName);

      // Enrich with flood management stats
      const def = defMap.get(code);
      const spend = spendMap.get(code);
      const homes = homesMap.get(code);
      const props = propsMap.get(code);
      const latestSpendYear = spend ? Object.keys(spend.years).sort().pop() : null;
      const latestPropsYear = props ? Object.keys(props.years).sort().pop() : null;

      return {
        type: 'Feature' as const,
        geometry: f.geometry,
        properties: {
          CTYUA24CD: code,
          CTYUA24NM: name,
          CTYUA24NMW: f.properties?.CTYUA24NMW?.trim() || '',
          BNG_E: f.properties?.BNG_E ?? 0,
          BNG_N: f.properties?.BNG_N ?? 0,
          LONG: f.properties?.LONG ?? 0,
          LAT: f.properties?.LAT ?? 0,
          hasStrategy: !!strategyInfo,
          ...(strategyInfo ? { strategy: strategyInfo } : {}),
          defenceCount: def?.numberOfDefences ?? null,
          defenceCondition: def?.avgCondition ?? null,
          totalSpend: latestSpendYear ? spend!.years[latestSpendYear].totalCapitalSpend : null,
          homesProtected: homes ? Object.values(homes.years).reduce((sum: number, v) => sum + (v ?? 0), 0) || null : null,
          propertiesHighRisk: latestPropsYear ? props!.years[latestPropsYear].numberAtHighRisk : null,
          propertiesHighRiskPct: latestPropsYear ? props!.years[latestPropsYear].pctAtHighRisk : null,
        } as LLFAFeatureProperties,
      };
    });

    logger.info(
      { total: features.length, withStrategy: features.filter((f: any) => f.properties.hasStrategy).length },
      'Loaded LLFA boundaries GeoJSON (WGS84) with strategy info',
    );
    return { type: 'FeatureCollection', features };
  } catch (err) {
    logger.error({ err }, 'Failed to load LLFA boundaries GeoJSON');
    return { type: 'FeatureCollection', features: [] };
  }
}

// ── Initialization ───────────────────────────────────────────────────

export function initLLFA() {
  // Load XLSX first so we can merge into GeoJSON
  llfaInfoMap = loadLFRMSData();
  llfaGeoJSON = loadLLFABoundaries();
}

// ── Public API ───────────────────────────────────────────────────────

export function getLLFABoundaries(): LLFAGeoJSON {
  return llfaGeoJSON;
}

export function getLLFAInfo(code: string): LLFAFeatureProperties | null {
  const feature = llfaGeoJSON.features.find(
    (f) => f.properties.CTYUA24CD === code.trim().toUpperCase(),
  );
  return feature?.properties ?? null;
}

export function getLLFASummary() {
  return {
    total: llfaGeoJSON.features.length,
    withStrategy: llfaGeoJSON.features.filter((f) => f.properties.hasStrategy).length,
    withoutStrategy: llfaGeoJSON.features.filter((f) => !f.properties.hasStrategy).length,
  };
}
