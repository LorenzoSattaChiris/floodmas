// ─── FloodMAS — Proactive Monitoring Route ───────────────────────────
// POST /api/proactive/scan — triggers a single proactive scan
// The coordinator runs a brief assessment and returns via SSE.

import { Router } from 'express';
import { randomUUID } from 'crypto';
import { runCoordinator } from '../agents/coordinator.js';
import { logger } from '../logger.js';
import { GUARDRAILS } from '../agents/config.js';
import type { ChatSession, AgentEvent } from '../agents/types.js';

const router = Router();

const sessions = new Map<string, ChatSession>();

// Cleanup old scan sessions
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (session.done && session.listeners.size === 0 && now - session.createdAt > GUARDRAILS.sessionTtlMs) {
      sessions.delete(id);
    }
  }
}, 60_000);

const PROACTIVE_PROMPT = `You are running a PROACTIVE MONITORING SCAN. Perform a rapid assessment:
1. Check weather conditions and river levels across high-risk UK cities (London, York, Carlisle, Sheffield)
2. Read sensor networks and detect any anomalies
3. Assess current flood risk levels

Provide a CONCISE summary report card with:
- **Status**: Overall risk level (LOW / MODERATE / HIGH / CRITICAL)
- **Key Findings**: Top 3-5 bullet points of most important observations
- **Anomalies**: Any sensor or environmental anomalies detected
- **Recommended Actions**: 1-3 next steps for the operator

Keep the response brief and actionable — this is a recurring monitoring scan, not a full briefing.`;

router.post('/scan', (req, res) => {
  const sessionId = randomUUID();
  const session: ChatSession = { events: [], done: false, listeners: new Set(), createdAt: Date.now() };
  sessions.set(sessionId, session);

  const emit = (ev: Omit<AgentEvent, 'timestamp'>) => {
    const event: AgentEvent = { ...ev, timestamp: new Date().toISOString() };
    session.events.push(event);
    for (const listener of session.listeners) {
      listener(event);
    }
  };

  const timeout = setTimeout(() => {
    if (!session.done) {
      logger.warn({ sessionId }, 'Proactive scan timed out');
      emit({ type: 'error', agent: 'System', content: 'Proactive scan timed out.' });
      session.done = true;
    }
  }, GUARDRAILS.queryTimeoutMs);

  runCoordinator(PROACTIVE_PROMPT, emit)
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err, sessionId }, 'Proactive scan error');
      emit({ type: 'error', agent: 'System', content: msg });
    })
    .finally(() => {
      clearTimeout(timeout);
      session.done = true;
    });

  res.json({ sessionId });
});

// SSE stream for proactive scan
router.get('/:id', (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const send = (event: AgentEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  for (const ev of session.events) {
    send(ev);
  }

  if (session.done) {
    res.write('data: [DONE]\n\n');
    res.end();
    return;
  }

  const listener = (event: AgentEvent) => {
    send(event);
    if (event.type === 'stream_end' || event.type === 'error') {
      res.write('data: [DONE]\n\n');
      res.end();
    }
  };

  session.listeners.add(listener);
  req.on('close', () => {
    session.listeners.delete(listener);
  });
});

export default router;
