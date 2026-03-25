import { Router, Request, Response } from 'express';
import { logger } from '../logger.js';

const router = Router();

const OS_API_KEY = process.env.OS_API_KEY || '';

const ALLOWED_OS_STYLES = new Set(['Light_3857', 'Road_3857', 'Outdoor_3857']);

const ALLOWED_EA_SERVICES: Record<string, string> = {
  'RiskOfFloodingFromRiversAndSea': 'https://environment.data.gov.uk/arcgis/rest/services/EA/RiskOfFloodingFromRiversAndSea/MapServer/tile',
  'RiskOfFloodingFromSurfaceWater': 'https://environment.data.gov.uk/arcgis/rest/services/EA/RiskOfFloodingFromSurfaceWater/MapServer/tile',
  'FloodMapForPlanningRiversAndSeaFloodZone2': 'https://environment.data.gov.uk/arcgis/rest/services/EA/FloodMapForPlanningRiversAndSeaFloodZone2/MapServer/tile',
  'FloodMapForPlanningRiversAndSeaFloodZone3': 'https://environment.data.gov.uk/arcgis/rest/services/EA/FloodMapForPlanningRiversAndSeaFloodZone3/MapServer/tile',
  'ReservoirFloodExtentsDryDay': 'https://environment.data.gov.uk/arcgis/rest/services/EA/ReservoirFloodExtentsDryDay/MapServer/tile',
  'ReservoirFloodExtentsWetDay': 'https://environment.data.gov.uk/arcgis/rest/services/EA/ReservoirFloodExtentsWetDay/MapServer/tile',
};

// 1x1 transparent PNG fallback to avoid noisy 5xx tile errors in the client
// when upstream ArcGIS services intermittently fail for specific tiles.
const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aRsAAAAASUVORK5CYII=',
  'base64'
);

/** GET /api/tiles/os/:style/:z/:x/:y.png — proxy OS Maps raster tiles */
router.get('/os/:style/:z/:x/:y.png', async (req: Request, res: Response) => {
  const style = String(req.params.style);
  const { z, x, y } = req.params;

  if (!ALLOWED_OS_STYLES.has(style)) {
    res.status(400).json({ error: 'Invalid OS tile style' });
    return;
  }
  if (!OS_API_KEY) {
    res.status(503).json({ error: 'OS_API_KEY not configured' });
    return;
  }

  try {
    const url = `https://api.os.uk/maps/raster/v1/zxy/${style}/${z}/${x}/${y}.png?key=${OS_API_KEY}`;
    const upstream = await fetch(url, { signal: AbortSignal.timeout(8000) });

    if (!upstream.ok) {
      res.status(upstream.status).end();
      return;
    }

    res.set({
      'Content-Type': upstream.headers.get('content-type') || 'image/png',
      'Cache-Control': 'public, max-age=86400',
    });

    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.send(buffer);
  } catch (err) {
    logger.error({ err, style, z, x, y }, 'OS tile proxy failed');
    res.status(502).end();
  }
});

/** GET /api/tiles/ea/:service/:z/:x/:y — proxy EA ArcGIS raster tiles */
router.get('/ea/:service/:z/:x/:y', async (req: Request, res: Response) => {
  const service = String(req.params.service);
  const { z, x, y } = req.params;

  const baseUrl = ALLOWED_EA_SERVICES[service];
  if (!baseUrl) {
    res.status(400).json({ error: 'Invalid EA tile service' });
    return;
  }

  try {
    // ArcGIS tile services use level/row/col = z/y/x
    const candidates = [`${baseUrl}/${z}/${y}/${x}`, `${baseUrl}/${z}/${x}/${y}`];
    let upstream: globalThis.Response | null = null;
    let selectedUrl = '';

    for (const url of candidates) {
      const attempt = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (attempt.ok) {
        const ct = attempt.headers.get('content-type') || '';
        if (ct.startsWith('image/')) {
          upstream = attempt;
          selectedUrl = url;
          break;
        }
      }
    }

    if (!upstream) {
      logger.warn({ service, z, x, y }, 'EA tile unavailable upstream, returning transparent fallback tile');
      res.set({
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=300',
      });
      res.send(TRANSPARENT_PNG);
      return;
    }

    res.set({
      'Content-Type': upstream.headers.get('content-type') || 'image/png',
      'Cache-Control': 'public, max-age=3600',
      'X-Upstream-Url': selectedUrl,
    });

    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.send(buffer);
  } catch (err) {
    logger.error({ err, service, z, x, y }, 'EA tile proxy failed, returning transparent fallback tile');
    res.set({
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=300',
    });
    res.send(TRANSPARENT_PNG);
  }
});

export default router;
