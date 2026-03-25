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
  mainRivers:
    'https://services.arcgis.com/JJzESW51TqeY9uat/ArcGIS/rest/services/Statutory_Main_River_MapLine_unaltered/FeatureServer/0',
} as const;

/** ArcGIS FeatureServer endpoints for risk polygon layers (replacing broken MapServer tile services). */
const RISK_LAYER_ENDPOINTS: Record<string, string> = {
  'risk-rivers-sea':
    'https://services-eu1.arcgis.com/KB6uNVj5ZcJr7jUP/arcgis/rest/services/RiskOfFloodingFromRiversAndSea/FeatureServer/0',
  'risk-surface-water':
    'https://services1.arcgis.com/JZM7qJpmv7vJ0Hzx/arcgis/rest/services/Risk_of_Flooding_from_Surface_Water_Extents/FeatureServer/0',
  'flood-zone-2':
    'https://services1.arcgis.com/JZM7qJpmv7vJ0Hzx/arcgis/rest/services/Flood_Map_for_Planning/FeatureServer/2',
  'flood-zone-3':
    'https://services1.arcgis.com/JZM7qJpmv7vJ0Hzx/arcgis/rest/services/Flood_Map_for_Planning/FeatureServer/1',
  'reservoir-dry':
    'https://services7.arcgis.com/uZqSSlRPLgqdItQE/arcgis/rest/services/Reservoir_Flood_Extents/FeatureServer/1',
  'reservoir-wet':
    'https://services7.arcgis.com/uZqSSlRPLgqdItQE/arcgis/rest/services/Reservoir_Flood_Extents/FeatureServer/2',
};

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
  outFields = '*',
): Promise<ArcGISGeoJSON> {
  const cached = getCached<ArcGISGeoJSON>(cacheKey);
  if (cached) return cached.data;

  const params = new URLSearchParams({
    where: '1=1',
    outFields,
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
    signal: AbortSignal.timeout(35000),
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

/** Statutory main rivers — managed by the Environment Agency (polylines) */
export async function getMainRivers(
  bbox?: { xmin: number; ymin: number; xmax: number; ymax: number },
): Promise<ArcGISGeoJSON> {
  const bboxKey = bbox ? `${bbox.xmin},${bbox.ymin},${bbox.xmax},${bbox.ymax}` : 'all';
  return queryFeatureServer(
    ARCGIS_ENDPOINTS.mainRivers,
    `arcgis:main-rivers:${bboxKey}`,
    bbox,
    2000,
  );
}

export async function getRiskLayerFeatures(
  layer: string,
  bbox?: { xmin: number; ymin: number; xmax: number; ymax: number },
): Promise<ArcGISGeoJSON> {
  const endpoint = RISK_LAYER_ENDPOINTS[layer];
  if (!endpoint) throw new Error(`Unknown risk layer: ${layer}`);
  const bboxKey = bbox ? `${bbox.xmin},${bbox.ymin},${bbox.xmax},${bbox.ymax}` : 'all';
  return queryFeatureServer(
    endpoint,
    `arcgis:risk:${layer}:${bboxKey}`,
    bbox,
    2000,
    'OBJECTID', // minimal fields — only geometry needed for polygon rendering
  );
}
