// ─── FloodMAS — Chat Route (SSE Streaming) ──────────────────────────
// POST /api/chat          → starts orchestration, returns { sessionId }
// GET  /api/chat/:id      → SSE event stream for the session

import { Router } from 'express';
import { randomUUID } from 'crypto';
import { runCoordinator } from '../agents/coordinator.js';
import { logger } from '../logger.js';
import { GUARDRAILS } from '../agents/config.js';
import type { ChatSession, AgentEvent } from '../agents/types.js';

const router = Router();

/** In-memory session store — keyed by UUID */
const sessions = new Map<string, ChatSession>();

// ── Periodic cleanup of expired sessions ─────────────────────────────
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    // Only clean up finished sessions with no active listeners
    if (session.done && session.listeners.size === 0) {
      if (now - session.createdAt > GUARDRAILS.sessionTtlMs) {
        sessions.delete(id);
      }
    }
  }
}, 60_000);

// ── POST /api/chat — start a new query ───────────────────────────────
router.post('/', (req, res) => {
  const { message } = req.body as { message?: string };
  if (!message?.trim()) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  // Limit message length to prevent abuse
  const sanitised = message.trim().slice(0, 2000);

  const sessionId = randomUUID();
  const session: ChatSession = { events: [], done: false, listeners: new Set(), createdAt: Date.now() };
  sessions.set(sessionId, session);

  /** Emit an event to all SSE listeners + buffer for late joiners */
  const emit = (ev: Omit<AgentEvent, 'timestamp'>) => {
    const event: AgentEvent = { ...ev, timestamp: new Date().toISOString() };
    session.events.push(event);
    for (const listener of session.listeners) {
      listener(event);
    }
  };

  // Enforce query timeout
  const timeout = setTimeout(() => {
    if (!session.done) {
      logger.warn({ sessionId }, 'Query timed out');
      emit({ type: 'error', agent: 'System', content: 'Query timed out — please try a simpler question.' });
      session.done = true;
    }
  }, GUARDRAILS.queryTimeoutMs);

  // Run orchestration in the background (don't await)
  runCoordinator(sanitised, emit)
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err, sessionId }, 'Coordinator error');
      emit({ type: 'error', agent: 'System', content: msg });
    })
    .finally(() => {
      clearTimeout(timeout);
      session.done = true;
    });

  res.json({ sessionId });
});

// ── GET /api/chat/:id — SSE event stream ─────────────────────────────
router.get('/:id', (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const send = (event: AgentEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  // Replay buffered events (for late joiners)
  for (const ev of session.events) {
    send(ev);
  }

  // If already done, close immediately
  if (session.done) {
    res.write('data: [DONE]\n\n');
    res.end();
    return;
  }

  // Subscribe to live events
  const listener = (event: AgentEvent) => {
    send(event);
    if (event.type === 'stream_end' || event.type === 'error') {
      res.write('data: [DONE]\n\n');
      res.end();
    }
  };

  session.listeners.add(listener);

  // Cleanup on client disconnect
  req.on('close', () => {
    session.listeners.delete(listener);
  });
});

export default router;
