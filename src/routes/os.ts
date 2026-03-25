import { Router, Request, Response } from 'express';
import { searchPlaces, findNearest } from '../services/os.js';
import { logger } from '../logger.js';

const router = Router();

/** GET /api/os/search?q=<query>&limit=<n> — OS Names place search */
router.get('/search', async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) {
      res.status(400).json({ error: 'Missing required query parameter: q' });
      return;
    }
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || '10'), 10) || 10, 1), 100);
    const data = await searchPlaces(q, limit);
    res.json(data);
  } catch (err) {
    logger.error({ err }, 'OS Names search failed');
    res.status(502).json({ error: 'Failed to search OS Names' });
  }
});

/** GET /api/os/nearest?lat=<lat>&lon=<lon>&radius=<m> — OS Names nearest place */
router.get('/nearest', async (req: Request, res: Response) => {
  try {
    const lat = parseFloat(String(req.query.lat || ''));
    const lon = parseFloat(String(req.query.lon || ''));
    if (isNaN(lat) || isNaN(lon)) {
      res.status(400).json({ error: 'Missing required query parameters: lat, lon' });
      return;
    }
    const radius = Math.min(Math.max(parseFloat(String(req.query.radius || '500')) || 500, 0.01), 1000);
    const data = await findNearest(lat, lon, radius);
    res.json(data);
  } catch (err) {
    logger.error({ err }, 'OS Names nearest failed');
    res.status(502).json({ error: 'Failed to find nearest OS Names' });
  }
});

export default router;
