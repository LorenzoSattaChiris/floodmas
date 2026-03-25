import { Router, Request, Response } from 'express';
import { getIMDBoundaries, getLSOAByCode, getIMDSummary } from '../services/imd.js';
import { logger } from '../logger.js';

const router = Router();

function parseBbox(query: Request['query']) {
  const raw = typeof query.bbox === 'string' ? query.bbox : '';
  if (!raw) return undefined;
  const parts = raw.split(',').map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return undefined;
  return { xmin: parts[0], ymin: parts[1], xmax: parts[2], ymax: parts[3] };
}

/**
 * GET /api/imd?bbox=minLon,minLat,maxLon,maxLat
 * Returns LSOA polygons with IMD 2019 deprivation scores for the given bbox.
 * Requires bbox — prevents accidentally fetching all 32,844 LSOAs at once.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const bbox = parseBbox(req.query);
    if (!bbox) {
      res.status(400).json({ error: 'Missing or invalid bbox query parameter (minLon,minLat,maxLon,maxLat)' });
      return;
    }

    // Limit bbox to reasonable UK area
    const clampedBbox = {
      xmin: Math.max(bbox.xmin, -8),
      ymin: Math.max(bbox.ymin, 49),
      xmax: Math.min(bbox.xmax, 2),
      ymax: Math.min(bbox.ymax, 61),
    };

    const data = await getIMDBoundaries(clampedBbox);
    res.json(data);
  } catch (err) {
    logger.error({ err }, 'Failed to get IMD boundaries');
    res.status(500).json({ error: 'Failed to fetch IMD data' });
  }
});

/**
 * GET /api/imd/summary
 * Returns aggregate IMD dataset summary stats.
 */
router.get('/summary', (_req: Request, res: Response) => {
  try {
    res.json(getIMDSummary());
  } catch (err) {
    logger.error({ err }, 'Failed to get IMD summary');
    res.status(500).json({ error: 'Failed to get IMD summary' });
  }
});

/**
 * GET /api/imd/lsoa/:code
 * Returns IMD deprivation data for a single LSOA by code (e.g. E01000001).
 */
router.get('/lsoa/:code', (req: Request, res: Response) => {
  try {
    const code = req.params['code'] as string;
    const record = getLSOAByCode(code);
    if (!record) {
      res.status(404).json({ error: `LSOA ${code} not found in IMD dataset` });
      return;
    }
    res.json(record);
  } catch (err) {
    logger.error({ err }, 'Failed to get LSOA IMD data');
    res.status(500).json({ error: 'Failed to get LSOA data' });
  }
});

export default router;
