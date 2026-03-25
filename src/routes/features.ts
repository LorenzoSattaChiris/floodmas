import { Router, Request, Response } from 'express';
import { getFloodDefences, getHistoricFloods, getMainRivers, getRiskLayerFeatures } from '../services/arcgis.js';
import { logger } from '../logger.js';

const router = Router();

function parseBbox(query: Request['query']) {
  const raw = typeof query.bbox === 'string' ? query.bbox : '';
  if (!raw) return undefined;
  const parts = raw.split(',').map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return undefined;
  return { xmin: parts[0], ymin: parts[1], xmax: parts[2], ymax: parts[3] };
}

/** GET /api/features/defences — flood defence features (GeoJSON) */
router.get('/defences', async (req: Request, res: Response) => {
  try {
    const bbox = parseBbox(req.query);
    const data = await getFloodDefences(bbox);
    res.json(data);
  } catch (err) {
    console.error('Error fetching flood defences:', err);
    logger.error({ err }, 'Failed to fetch flood defences');
    res.status(502).json({ error: 'Failed to fetch flood defences' });
  }
});

/** GET /api/features/historic-floods — recorded flood outlines (GeoJSON) */
router.get('/historic-floods', async (req: Request, res: Response) => {
  try {
    const bbox = parseBbox(req.query);
    const data = await getHistoricFloods(bbox);
    res.json(data);
  } catch (err) {
    console.error('Error fetching historic floods:', err);
    logger.error({ err }, 'Failed to fetch historic flood outlines');
    res.status(502).json({ error: 'Failed to fetch historic flood outlines' });
  }
});

/** GET /api/features/main-rivers — statutory main rivers (GeoJSON polylines) */
router.get('/main-rivers', async (req: Request, res: Response) => {
  try {
    const bbox = parseBbox(req.query);
    const data = await getMainRivers(bbox);
    res.json(data);
  } catch (err) {
    console.error('Error fetching main rivers:', err);
    logger.error({ err }, 'Failed to fetch main rivers');
    res.status(502).json({ error: 'Failed to fetch main rivers' });
  }
});

const VALID_RISK_LAYERS = new Set([
  'risk-rivers-sea', 'risk-surface-water',
  'flood-zone-2', 'flood-zone-3',
  'reservoir-dry', 'reservoir-wet',
]);

/** GET /api/features/risk/:layer — EA risk polygon layers (GeoJSON) */
router.get('/risk/:layer', async (req: Request, res: Response) => {
  const layer = String(req.params.layer);
  if (!VALID_RISK_LAYERS.has(layer)) {
    res.status(400).json({ error: 'Invalid risk layer' });
    return;
  }
  try {
    const bbox = parseBbox(req.query);
    const data = await getRiskLayerFeatures(layer, bbox);
    res.json(data);
  } catch (err) {
    logger.error({ err, layer }, 'Failed to fetch risk layer');
    res.status(502).json({ error: `Failed to fetch risk layer: ${layer}` });
  }
});

export default router;
