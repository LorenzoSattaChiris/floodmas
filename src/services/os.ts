import proj4 from 'proj4';
import { getCached, setCache } from './cache.js';
import { logger } from '../logger.js';

const OS_API_KEY = process.env.OS_API_KEY || '';

// British National Grid (EPSG:27700) projection definition
const BNG =
  '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 ' +
  '+ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs';
const WGS84 = 'EPSG:4326';

// ── Types ────────────────────────────────────────────────────────────

export interface OSPlaceResult {
  name: string;
  type: string;
  localType: string;
  lat: number;
  lon: number;
  county: string;
  region: string;
  country: string;
  populatedPlace: string;
  postcodeDistrict: string;
}

export interface OSSearchResponse {
  results: OSPlaceResult[];
  totalResults: number;
  query: string;
}

// ── BNG ↔ WGS84 conversion ──────────────────────────────────────────

function bngToWgs84(easting: number, northing: number): { lat: number; lon: number } {
  const [lon, lat] = proj4(BNG, WGS84, [easting, northing]);
  return { lat, lon };
}

function wgs84ToBng(lat: number, lon: number): { easting: number; northing: number } {
  const [easting, northing] = proj4(WGS84, BNG, [lon, lat]);
  return { easting, northing };
}

// ── OS Names API — place search ──────────────────────────────────────

export async function searchPlaces(
  query: string,
  maxResults = 10,
): Promise<OSSearchResponse> {
  if (!OS_API_KEY) {
    logger.warn('OS_API_KEY not set — OS Names search unavailable');
    return { results: [], totalResults: 0, query };
  }

  const cacheKey = `os-search:${query}:${maxResults}`;
  const cached = getCached<OSSearchResponse>(cacheKey);
  if (cached) return cached.data;

  const params = new URLSearchParams({
    query,
    format: 'JSON',
    maxresults: String(maxResults),
    key: OS_API_KEY,
  });

  const url = `https://api.os.uk/search/names/v1/find?${params}`;
  logger.info({ query, maxResults }, 'OS Names API — searching');

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`OS Names API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();

  const results: OSPlaceResult[] = (data.results || []).map(
    (r: { GAZETTEER_ENTRY: Record<string, string | number> }) => {
      const e = r.GAZETTEER_ENTRY;
      const { lat, lon } = bngToWgs84(Number(e.GEOMETRY_X), Number(e.GEOMETRY_Y));
      return {
        name: String(e.NAME1 || ''),
        type: String(e.TYPE || ''),
        localType: String(e.LOCAL_TYPE || ''),
        lat,
        lon,
        county: String(e.COUNTY_UNITARY || ''),
        region: String(e.REGION || ''),
        country: String(e.COUNTRY || ''),
        populatedPlace: String(e.POPULATED_PLACE || ''),
        postcodeDistrict: String(e.POSTCODE_DISTRICT || ''),
      };
    },
  );

  const response: OSSearchResponse = {
    results,
    totalResults: data.header?.totalresults ?? results.length,
    query,
  };

  setCache(cacheKey, response, 'os');
  return response;
}

// ── OS Names API — nearest place ─────────────────────────────────────

export async function findNearest(
  lat: number,
  lon: number,
  radius = 500,
): Promise<OSSearchResponse> {
  if (!OS_API_KEY) {
    logger.warn('OS_API_KEY not set — OS Names nearest unavailable');
    return { results: [], totalResults: 0, query: `${lat},${lon}` };
  }

  const { easting, northing } = wgs84ToBng(lat, lon);
  const point = `${easting},${northing}`;

  const params = new URLSearchParams({
    point,
    radius: String(radius),
    format: 'JSON',
    key: OS_API_KEY,
  });

  const url = `https://api.os.uk/search/names/v1/nearest?${params}`;
  logger.info({ lat, lon, radius }, 'OS Names API — nearest');

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`OS Names nearest error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();

  const results: OSPlaceResult[] = (data.results || []).map(
    (r: { GAZETTEER_ENTRY: Record<string, string | number> }) => {
      const e = r.GAZETTEER_ENTRY;
      const coords = bngToWgs84(Number(e.GEOMETRY_X), Number(e.GEOMETRY_Y));
      return {
        name: String(e.NAME1 || ''),
        type: String(e.TYPE || ''),
        localType: String(e.LOCAL_TYPE || ''),
        lat: coords.lat,
        lon: coords.lon,
        county: String(e.COUNTY_UNITARY || ''),
        region: String(e.REGION || ''),
        country: String(e.COUNTRY || ''),
        populatedPlace: String(e.POPULATED_PLACE || ''),
        postcodeDistrict: String(e.POSTCODE_DISTRICT || ''),
      };
    },
  );

  return {
    results,
    totalResults: data.header?.totalresults ?? results.length,
    query: `${lat},${lon}`,
  };
}
