// ─── FloodMAS — Agent Cards Route ────────────────────────────────────
// GET /api/agents — returns A2A-compliant agent cards

import { Router } from 'express';
import { AGENT_CARDS } from '../agents/cards.js';

const router = Router();

router.get('/', (_req, res) => {
  res.json(AGENT_CARDS);
});

export default router;
