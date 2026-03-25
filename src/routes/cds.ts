import { Router, Request, Response } from 'express';
import { getCDSReanalysisGrid } from '../services/cds.js';
import { logger } from '../logger.js';

const router = Router();

/** GET /api/cds/reanalysis — ERA5-Land reanalysis grid for UK */
router.get('/reanalysis', async (_req: Request, res: Response) => {
  try {
    const data = await getCDSReanalysisGrid();
    res.json(data);
  } catch (err) {
    logger.error({ err }, 'Failed to fetch CDS reanalysis data');
    res.status(502).json({ error: 'Failed to fetch CDS reanalysis data' });
  }
});

export default router;
