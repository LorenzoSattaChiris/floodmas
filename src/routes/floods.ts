import { Router, Request, Response } from 'express';
import * as ea from '../services/ea-api.js';
import { logger } from '../logger.js';

const router = Router();

/** GET /api/floods — current flood warnings & alerts */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const data = await ea.getFloodWarnings();
    res.json(data);
  } catch (err) {
    console.error('Error fetching floods:', err);
    logger.error({ err }, 'Failed to fetch flood warnings from EA API');
    res.status(502).json({ error: 'Failed to fetch flood warnings from EA API' });
  }
});

/** GET /api/floods/severe — severity 1-2 only */
router.get('/severe', async (_req: Request, res: Response) => {
  try {
    const data = await ea.getFloodWarningsBySeverity(2);
    res.json(data);
  } catch (err) {
    console.error('Error fetching severe floods:', err);
    logger.error({ err }, 'Failed to fetch severe flood warnings');
    res.status(502).json({ error: 'Failed to fetch severe flood warnings' });
  }
});

export default router;
