import { Router, Request, Response } from 'express';
import { logger } from '../logger.js';
import { existsSync, mkdirSync } from 'fs';
import { writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

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

// ── Disk tile cache ──────────────────────────────────────────────────
const TILE_CACHE_DIR = join(tmpdir(), 'floodmas-tiles');
if (!existsSync(TILE_CACHE_DIR)) mkdirSync(TILE_CACHE_DIR, { recursive: true });

function tileCachePath(prefix: string, style: string, z: string, x: string, y: string): string {
  const dir = join(TILE_CACHE_DIR, prefix, style, z, x);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, `${y}.png`);
}

// ── Concurrency limiter for upstream tile fetches ────────────────────
const TILE_CONCURRENCY = 4;
let _tileActive = 0;
const _tileQueue: (() => void)[] = [];

function tileAcquire(): Promise<void> {
  if (_tileActive < TILE_CONCURRENCY) { _tileActive++; return Promise.resolve(); }
  return new Promise<void>(r => _tileQueue.push(r));
}
function tileRelease(): void {
  if (_tileQueue.length > 0) _tileQueue.shift()!();
  else _tileActive--;
}

/** GET /api/tiles/os/:style/:z/:x/:y.png — proxy OS Maps raster tiles with disk cache */
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

  const zz = String(z), xx = String(x), yy = String(y);
  const cachePath = tileCachePath('os', style, zz, xx, yy);

  // Serve from disk cache
  try {
    const cached = await readFile(cachePath);
    res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400', 'X-Tile-Cache': 'HIT' });
    res.send(cached);
    return;
  } catch { /* cache miss — fetch upstream */ }

  await tileAcquire();
  try {
    // Re-check cache (another request may have populated it while we waited)
    try {
      const cached = await readFile(cachePath);
      res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400', 'X-Tile-Cache': 'HIT' });
      res.send(cached);
      return;
    } catch { /* still a miss */ }

    const url = `https://api.os.uk/maps/raster/v1/zxy/${style}/${zz}/${xx}/${yy}.png?key=${OS_API_KEY}`;
    const upstream = await fetch(url, { signal: AbortSignal.timeout(8000) });

    if (!upstream.ok) {
      res.status(upstream.status).end();
      return;
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());

    // Write to disk cache (fire-and-forget, don't block response)
    writeFile(cachePath, buffer).catch(() => {});

    res.set({
      'Content-Type': upstream.headers.get('content-type') || 'image/png',
      'Cache-Control': 'public, max-age=86400',
      'X-Tile-Cache': 'MISS',
    });
    res.send(buffer);
  } catch (err) {
    logger.error({ err, style, z, x, y }, 'OS tile proxy failed');
    res.status(502).end();
  } finally {
    tileRelease();
  }
});

/** GET /api/tiles/ea/:service/:z/:x/:y — proxy EA ArcGIS raster tiles with disk cache */
router.get('/ea/:service/:z/:x/:y', async (req: Request, res: Response) => {
  const service = String(req.params.service);
  const { z, x, y } = req.params;

  const baseUrl = ALLOWED_EA_SERVICES[service];
  if (!baseUrl) {
    res.status(400).json({ error: 'Invalid EA tile service' });
    return;
  }

  const zz = String(z), xx = String(x), yy = String(y);
  const cachePath = tileCachePath('ea', service, zz, xx, yy);

  // Serve from disk cache
  try {
    const cached = await readFile(cachePath);
    res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600', 'X-Tile-Cache': 'HIT' });
    res.send(cached);
    return;
  } catch { /* cache miss */ }

  await tileAcquire();
  try {
    // Re-check cache
    try {
      const cached = await readFile(cachePath);
      res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600', 'X-Tile-Cache': 'HIT' });
      res.send(cached);
      return;
    } catch { /* still a miss */ }

    // ArcGIS tile services use level/row/col = z/y/x
    const candidates = [`${baseUrl}/${zz}/${yy}/${xx}`, `${baseUrl}/${zz}/${xx}/${yy}`];
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
      res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=300' });
      res.send(TRANSPARENT_PNG);
      return;
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());

    // Write to disk cache (fire-and-forget)
    writeFile(cachePath, buffer).catch(() => {});

    res.set({
      'Content-Type': upstream.headers.get('content-type') || 'image/png',
      'Cache-Control': 'public, max-age=3600',
      'X-Upstream-Url': selectedUrl,
      'X-Tile-Cache': 'MISS',
    });
    res.send(buffer);
  } catch (err) {
    logger.error({ err, service, z, x, y }, 'EA tile proxy failed, returning transparent fallback tile');
    res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=300' });
    res.send(TRANSPARENT_PNG);
  } finally {
    tileRelease();
  }
});

export default router;
