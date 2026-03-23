import { getCached, setCache } from './cache.js';

/**
 * Proxy and transform ArcGIS FeatureServer queries into GeoJSON
 * for flood defences and historic flood outlines.
 * Free Defra Open Data — no API key required.
 */

const ARCGIS_ENDPOINTS = {
  floodDefences:
    'https://services.arcgis.com/JJzESW51TqeY9uat/ArcGIS/rest/services/SpatialFloodDefences/FeatureServer/0',
  historicFloods:
    'https://services.arcgis.com/JJzESW51TqeY9uat/ArcGIS/rest/services/FloodExtents_16_07_24_shapefile/FeatureServer/0',
} as const;

export interface ArcGISGeoJSON {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry: { type: string; coordinates: unknown };
    properties: Record<string, unknown>;
  }>;
}

/**
 * Query ArcGIS FeatureServer for features within a bounding box.
 * Returns GeoJSON FeatureCollection.
 */
async function queryFeatureServer(
  endpoint: string,
  cacheKey: string,
  bbox?: { xmin: number; ymin: number; xmax: number; ymax: number },
  maxRecords = 500,
): Promise<ArcGISGeoJSON> {
  const cached = getCached<ArcGISGeoJSON>(cacheKey);
  if (cached) return cached.data;

  const params = new URLSearchParams({
    where: '1=1',
    outFields: '*',
    f: 'geojson',
    resultRecordCount: String(maxRecords),
    outSR: '4326',
  });

  if (bbox) {
    params.set('geometry', JSON.stringify({
      xmin: bbox.xmin, ymin: bbox.ymin, xmax: bbox.xmax, ymax: bbox.ymax,
      spatialReference: { wkid: 4326 },
    }));
    params.set('geometryType', 'esriGeometryEnvelope');
    params.set('spatialRel', 'esriSpatialRelIntersects');
    params.set('inSR', '4326');
  }

  const url = `${endpoint}/query?${params}`;
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) {
    throw new Error(`ArcGIS error: ${res.status} for ${endpoint}`);
  }

  const data = await res.json() as ArcGISGeoJSON;
  setCache(cacheKey, data, 'floodAreas');
  return data;
}

/** Flood defences (lines/polygons) — coastal and river defences */
export async function getFloodDefences(
  bbox?: { xmin: number; ymin: number; xmax: number; ymax: number },
): Promise<ArcGISGeoJSON> {
  const bboxKey = bbox ? `${bbox.xmin},${bbox.ymin},${bbox.xmax},${bbox.ymax}` : 'all';
  return queryFeatureServer(
    ARCGIS_ENDPOINTS.floodDefences,
    `arcgis:defences:${bboxKey}`,
    bbox,
    1000,
  );
}

/** Historic recorded flood outlines (polygons) */
export async function getHistoricFloods(
  bbox?: { xmin: number; ymin: number; xmax: number; ymax: number },
): Promise<ArcGISGeoJSON> {
  const bboxKey = bbox ? `${bbox.xmin},${bbox.ymin},${bbox.xmax},${bbox.ymax}` : 'all';
  return queryFeatureServer(
    ARCGIS_ENDPOINTS.historicFloods,
    `arcgis:historic:${bboxKey}`,
    bbox,
    500,
  );
}
