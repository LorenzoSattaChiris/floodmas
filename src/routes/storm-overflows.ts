import { Router, Request, Response } from 'express';
import {
  getStormOverflowSummary,
  getStormOverflowData,
  getStormOverflowRecords,
} from '../services/storm-overflows.js';
import { logger } from '../logger.js';

const router = Router();

/** GET /api/storm-overflows — summary + record count */
router.get('/', (_req: Request, res: Response) => {
  try {
    res.json(getStormOverflowData());
  } catch (err) {
    logger.error({ err }, 'Failed to get storm overflow data');
    res.status(500).json({ error: 'Failed to get storm overflow data' });
  }
});

/** GET /api/storm-overflows/summary — company-level summary statistics */
router.get('/summary', (_req: Request, res: Response) => {
  try {
    res.json(getStormOverflowSummary());
  } catch (err) {
    logger.error({ err }, 'Failed to get storm overflow summary');
    res.status(500).json({ error: 'Failed to get storm overflow summary' });
  }
});

/** GET /api/storm-overflows/records?company=&limit=500&offset=0 — paginated detailed records */
router.get('/records', (req: Request, res: Response) => {
  try {
    const company = typeof req.query.company === 'string' ? req.query.company : undefined;
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || '500'), 10) || 500, 1), 2000);
    const offset = Math.max(parseInt(String(req.query.offset || '0'), 10) || 0, 0);
    res.json(getStormOverflowRecords(company, limit, offset));
  } catch (err) {
    logger.error({ err }, 'Failed to get storm overflow records');
    res.status(500).json({ error: 'Failed to get storm overflow records' });
  }
});

export default router;
