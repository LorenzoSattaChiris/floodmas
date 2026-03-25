import { Router, Request, Response } from 'express';
import { getNRFAStations } from '../services/nrfa.js';
import { logger } from '../logger.js';

const router = Router();

/** GET /api/nrfa/stations — all NRFA gauging stations */
router.get('/stations', async (_req: Request, res: Response) => {
  try {
    const data = await getNRFAStations();
    res.json(data);
  } catch (err) {
    console.error('Error fetching NRFA stations:', err);
    logger.error({ err }, 'Failed to fetch NRFA stations');
    res.status(502).json({ error: 'Failed to fetch NRFA gauging stations' });
  }
});

export default router;
