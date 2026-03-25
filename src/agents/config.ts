// ─── FloodMAS Agent Configuration ────────────────────────────────────

/** Model assignments — GPT-5.4 family (production) */
export const MODELS = {
  supervisor: process.env.SUPERVISOR_MODEL || 'gpt-5.4',
  specialist: process.env.AGENT_MODEL || 'gpt-5.4-mini',
  nano: process.env.NANO_MODEL || 'gpt-5.4-nano',
} as const;

/** Temperature settings per role */
export const TEMPERATURE = {
  supervisor: 0.3,   // Low for consistent coordination
  specialist: 0.4,   // Moderate for informative responses
  nano: 0.1,         // Near-deterministic for triage
} as const;

/** Token budgets */
export const MAX_TOKENS = {
  supervisor: 4096,
  specialist: 3072,
  nano: 512,
} as const;

/** Guardrail limits */
export const GUARDRAILS = {
  /** Max tool-call iterations per specialist agent */
  specialistMaxIterations: 5,
  /** Max tool-call iterations for the coordinator */
  coordinatorMaxIterations: 10,
  /** Max total LLM calls (coordinator + all specialists) per query */
  maxLlmCalls: parseInt(process.env.MAX_LLM_CALLS || '12', 10),
  /** Abort timeout for entire query (ms) */
  queryTimeoutMs: 300_000,
  /** Session TTL after completion (ms) */
  sessionTtlMs: 300_000,
} as const;

/** Agent name → color mapping for UI serialization */
export const AGENT_COLORS: Record<string, string> = {
  Coordinator: '#0ea5e9',
  Forecasting: '#14b8a6',
  Monitoring: '#a855f6',
  'Risk Analysis': '#f97316',
  'Emergency Response': '#ef4444',
  System: '#64748b',
};
