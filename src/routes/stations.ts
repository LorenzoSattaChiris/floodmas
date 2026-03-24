import { Router, Request, Response } from 'express';
import * as ea from '../services/ea-api.js';
import { logger } from '../logger.js';

const router = Router();

/** GET /api/stations — active monitoring stations */
router.get('/', async (req: Request, res: Response) => {
  try {
    const params: Record<string, string> = {};
    if (typeof req.query.parameter === 'string') params.parameter = req.query.parameter;
    if (typeof req.query.type === 'string') params.type = req.query.type;
    if (typeof req.query._limit === 'string') params._limit = req.query._limit;
    const data = await ea.getStations(params);
    res.json(data);
  } catch (err) {
    console.error('Error fetching stations:', err);
    logger.error({ err }, 'Failed to fetch stations from EA API');
    res.status(502).json({ error: 'Failed to fetch stations from EA API' });
  }
});

/** GET /api/stations/:id/readings — readings for a specific station */
router.get('/:id/readings', async (req: Request, res: Response) => {
  try {
    const since = typeof req.query.since === 'string' ? req.query.since : undefined;
    const stationId = String(req.params.id);
    const data = await ea.getStationReadings(stationId, since);
    res.json(data);
  } catch (err) {
    console.error('Error fetching station readings:', err);
    logger.error({ err }, 'Failed to fetch station readings');
    res.status(502).json({ error: 'Failed to fetch station readings' });
  }
});

/** GET /api/readings/latest — latest readings from all stations */
router.get('/readings/latest', async (_req: Request, res: Response) => {
  try {
    const data = await ea.getLatestReadings();
    res.json(data);
  } catch (err) {
    console.error('Error fetching latest readings:', err);
    logger.error({ err }, 'Failed to fetch latest readings');
    res.status(502).json({ error: 'Failed to fetch latest readings' });
  }
});

export default router;
