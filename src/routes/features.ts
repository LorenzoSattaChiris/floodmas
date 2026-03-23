import { Router, Request, Response } from 'express';
import { getFloodDefences, getHistoricFloods } from '../services/arcgis.js';

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
    res.status(502).json({ error: 'Failed to fetch historic flood outlines' });
  }
});

export default router;
