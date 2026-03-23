import { Router, Request, Response } from 'express';
import { getFloodFeed } from '../services/feed.js';

const router = Router();

/** GET /api/social/feed — unified flood feed (EA warnings + Bluesky) */
router.get('/feed', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 25, 100);
    const mode = req.query.mode === 'broad' ? 'broad' : 'focused' as const;
    const data = await getFloodFeed(limit, mode);
    res.json(data);
  } catch (err) {
    console.error('Error fetching flood feed:', err);
    res.status(502).json({ error: 'Failed to fetch flood feed' });
  }
});

export default router;
