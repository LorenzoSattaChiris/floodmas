import { Router, Request, Response } from 'express';
import * as ea from '../services/ea-api.js';
import { logger } from '../logger.js';

const router = Router();

/** GET /api/flood-areas — flood warning/alert area polygons */
router.get('/', async (req: Request, res: Response) => {
  try {
    const rawType = typeof req.query.type === 'string' ? req.query.type : undefined;
    const type = rawType as 'FloodAlertArea' | 'FloodWarningArea' | undefined;
    const data = await ea.getFloodAreas(type);
    res.json(data);
  } catch (err) {
    logger.error({ err }, 'Failed to fetch flood areas');
    res.json({ items: [] });
  }
});

/** GET /api/flood-areas/:id — detail for a single flood area */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const data = await ea.getFloodAreaDetail(String(req.params.id));
    res.json(data);
  } catch (err) {
    console.error('Error fetching flood area detail:', err);
    logger.error({ err }, 'Failed to fetch flood area detail');
    res.status(502).json({ error: 'Failed to fetch flood area detail' });
  }
});

export default router;
