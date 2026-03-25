import { Router, Request, Response } from 'express';
import { getLLFABoundaries, getLLFAInfo, getLLFASummary } from '../services/llfa.js';
import { logger } from '../logger.js';

const router = Router();

/** GET /api/llfa — LLFA boundary GeoJSON with strategy info merged */
router.get('/', (_req: Request, res: Response) => {
  try {
    res.json(getLLFABoundaries());
  } catch (err) {
    logger.error({ err }, 'Failed to get LLFA boundaries');
    res.status(500).json({ error: 'Failed to get LLFA boundaries' });
  }
});

/** GET /api/llfa/summary — quick count of LLFAs */
router.get('/summary', (_req: Request, res: Response) => {
  try {
    res.json(getLLFASummary());
  } catch (err) {
    logger.error({ err }, 'Failed to get LLFA summary');
    res.status(500).json({ error: 'Failed to get LLFA summary' });
  }
});

/** GET /api/llfa/:code — single LLFA info by ONS code (e.g. E06000001) */
router.get('/:code', (req: Request, res: Response) => {
  try {
    const code = String(req.params.code || '');
    if (!code || code.length < 3) {
      res.status(400).json({ error: 'Invalid LLFA code' });
      return;
    }
    const info = getLLFAInfo(code);
    if (!info) {
      res.status(404).json({ error: 'LLFA not found' });
      return;
    }
    res.json(info);
  } catch (err) {
    logger.error({ err }, 'Failed to get LLFA info');
    res.status(500).json({ error: 'Failed to get LLFA info' });
  }
});

export default router;
