// ─── FloodMAS Agent System — Shared Types ───────────────────────────

import type { ChatCompletionTool } from 'openai/resources/chat/completions.js';

/** SSE event types emitted during agent orchestration */
export type AgentEventType =
  | 'stream_start'
  | 'query_start'
  | 'agent_start'
  | 'agent_end'
  | 'tool_call'
  | 'tool_result'
  | 'llm_call'
  | 'agent_response'
  | 'final_response'
  | 'stream_end'
  | 'system'
  | 'error';

export interface AgentEvent {
  type: AgentEventType;
  agent: string;
  content: string;
  tool?: string;
  args?: Record<string, unknown>;
  timestamp?: string;
  tokens?: { prompt: number; completion: number };
  durationMs?: number;
}

export type EmitFn = (event: Omit<AgentEvent, 'timestamp'>) => void;

/** Each tool provides its OpenAI schema + an execute function */
export interface FloodTool {
  definition: ChatCompletionTool;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

/** Result returned by a specialist agent run */
export interface AgentResult {
  content: string;
  toolCalls: ToolCallTrace[];
  tokensUsed: { prompt: number; completion: number };
}

export interface ToolCallTrace {
  tool: string;
  args: Record<string, unknown>;
  result: string;
}

/** Shared LLM call budget — passed from coordinator to specialists */
export interface LlmCallBudget {
  used: number;
  limit: number;
}

/** Session stored in-memory for SSE streaming */
export interface ChatSession {
  events: AgentEvent[];
  done: boolean;
  listeners: Set<(event: AgentEvent) => void>;
  createdAt: number;
}

/** Proactive alert from autonomous monitoring */
export interface ProactiveAlert {
  id: string;
  city: string;
  severity: 'NORMAL' | 'WARNING' | 'ALERT' | 'CRITICAL';
  summary: string;
  details: string;
  timestamp: string;
  acknowledged: boolean;
}

/** Agent card following A2A protocol */
export interface AgentCard {
  name: string;
  description: string;
  version: string;
  role: 'supervisor' | 'worker';
  agentType: string;
  iconUrl: string;
  skills: Array<{
    id: string;
    name: string;
    description: string;
    tags: string[];
    examples: string[];
  }>;
  capabilities: {
    streaming: boolean;
    tools?: string[];
    multiAgentDelegation?: boolean;
    proactiveMonitoring?: boolean;
  };
}
