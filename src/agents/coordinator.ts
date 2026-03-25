// ─── FloodMAS — Coordinator (Supervisor Agent) ──────────────────────
// The coordinator receives the user's query, plans which specialists
// to invoke, calls them sequentially, then synthesises a final briefing.
// It uses OpenAI function calling where the "tools" are wrappers around
// the specialist agents (following the supervisor-as-tool pattern).

import { getOpenAI } from './openai.js';
import { MODELS, TEMPERATURE, MAX_TOKENS, GUARDRAILS } from './config.js';
import { PROMPTS } from './prompts.js';
import { runSpecialist } from './specialists.js';
import { logger } from '../logger.js';
import type { AgentResult, EmitFn, ToolCallTrace, LlmCallBudget } from './types.js';
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions.js';

/** Department tools the coordinator can invoke */
const DEPARTMENT_TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'forecasting_department',
      description: 'Consult the Forecasting department for weather forecasts, rainfall predictions, and river level monitoring.',
      parameters: {
        type: 'object',
        properties: { task: { type: 'string', description: 'Description of the forecasting task to perform' } },
        required: ['task'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'monitoring_department',
      description: 'Consult the Monitoring department for real-time IoT sensor data and anomaly detection.',
      parameters: {
        type: 'object',
        properties: { task: { type: 'string', description: 'Description of the monitoring task to perform' } },
        required: ['task'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'risk_analysis_department',
      description: 'Consult the Risk Analysis department for flood zone assessment, infrastructure vulnerability, and population impact.',
      parameters: {
        type: 'object',
        properties: { task: { type: 'string', description: 'Description of the risk analysis task to perform' } },
        required: ['task'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'emergency_response_department',
      description: 'Consult the Emergency Response department for alert generation, evacuation planning, and resource allocation.',
      parameters: {
        type: 'object',
        properties: { task: { type: 'string', description: 'Description of the emergency response task to perform' } },
        required: ['task'],
      },
    },
  },
];

/** Maps department tool name → specialist role key */
const DEPT_TO_ROLE: Record<string, 'forecasting' | 'monitoring' | 'riskAnalysis' | 'emergencyResponse'> = {
  forecasting_department: 'forecasting',
  monitoring_department: 'monitoring',
  risk_analysis_department: 'riskAnalysis',
  emergency_response_department: 'emergencyResponse',
};

/**
 * Run the coordinator agent. Streams SSE events during execution.
 *
 * @param userQuery - The user's message
 * @param emit      - SSE event emitter
 * @returns The final synthesised briefing
 */
export async function runCoordinator(userQuery: string, emit: EmitFn): Promise<AgentResult> {
  const agentName = 'Coordinator';
  emit({ type: 'stream_start', agent: agentName, content: '' });
  emit({ type: 'query_start', agent: agentName, content: userQuery });

  const openai = getOpenAI();
  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: PROMPTS.coordinator },
    { role: 'user', content: userQuery },
  ];

  const allToolCalls: ToolCallTrace[] = [];
  let totalPrompt = 0;
  let totalCompletion = 0;

  /** Shared budget — tracked across coordinator + all specialists */
  const budget: LlmCallBudget = { used: 0, limit: GUARDRAILS.maxLlmCalls };

  emit({ type: 'agent_start', agent: agentName, content: 'Analysing query and planning delegation…' });

  for (let i = 0; i < GUARDRAILS.coordinatorMaxIterations; i++) {
    // Budget check before coordinator LLM call
    if (budget.used >= budget.limit) {
      logger.info({ used: budget.used, limit: budget.limit }, 'LLM call budget exhausted — synthesising early');
      emit({ type: 'system', agent: agentName, content: `LLM call limit reached (${budget.limit}). Synthesising final briefing from collected data…` });
      break;
    }

    budget.used++;
    emit({ type: 'llm_call', agent: agentName, content: `LLM call ${budget.used}/${budget.limit}` });

    const response = await openai.chat.completions.create({
      model: MODELS.supervisor,
      temperature: TEMPERATURE.supervisor,
      max_completion_tokens: MAX_TOKENS.supervisor,
      messages,
      tools: DEPARTMENT_TOOLS,
    });

    const choice = response.choices[0];
    if (!choice) throw new Error('Coordinator: empty response from model');
    const msg = choice.message;
    totalPrompt += response.usage?.prompt_tokens ?? 0;
    totalCompletion += response.usage?.completion_tokens ?? 0;

    // No tool calls ⟹ final synthesised response
    if (!msg.tool_calls?.length) {
      const content = msg.content ?? '';
      emit({ type: 'final_response', agent: agentName, content, tokens: { prompt: totalPrompt, completion: totalCompletion } });
      emit({ type: 'stream_end', agent: agentName, content: '' });
      return { content, toolCalls: allToolCalls, tokensUsed: { prompt: totalPrompt, completion: totalCompletion } };
    }

    // Process department delegations
    messages.push(msg as ChatCompletionMessageParam);

    for (const tc of msg.tool_calls) {
      if (tc.type !== 'function') continue;
      const deptName = tc.function.name;
      const role = DEPT_TO_ROLE[deptName];

      let task = '';
      try {
        const parsed = JSON.parse(tc.function.arguments) as { task?: string };
        task = parsed.task ?? userQuery;
      } catch {
        task = userQuery;
      }

      if (!role) {
        logger.warn({ deptName }, 'Unknown department tool called');
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify({ error: `Unknown department: ${deptName}` }) });
        continue;
      }

      // Run the specialist agent (it will emit its own events)
      const specialistResult = await runSpecialist(role, task, emit, budget);

      allToolCalls.push(...specialistResult.toolCalls);
      totalPrompt += specialistResult.tokensUsed.prompt;
      totalCompletion += specialistResult.tokensUsed.completion;

      // Feed specialist response back to coordinator
      messages.push({ role: 'tool', tool_call_id: tc.id, content: specialistResult.content });
    }
  }

  // Guard: max iterations hit or budget exhausted — force synthesis
  logger.warn({ iterations: GUARDRAILS.coordinatorMaxIterations, llmCalls: budget.used }, 'Coordinator forcing final synthesis');

  budget.used++;
  emit({ type: 'llm_call', agent: agentName, content: `LLM call ${budget.used}/${budget.limit} (synthesis)` });

  const finalResp = await openai.chat.completions.create({
    model: MODELS.supervisor,
    temperature: TEMPERATURE.supervisor,
    max_completion_tokens: MAX_TOKENS.supervisor,
    messages: [...messages, { role: 'user', content: 'Synthesise all findings so far into a final briefing now.' }],
  });

  const content = finalResp.choices[0]?.message.content ?? '';
  totalPrompt += finalResp.usage?.prompt_tokens ?? 0;
  totalCompletion += finalResp.usage?.completion_tokens ?? 0;

  emit({ type: 'final_response', agent: agentName, content, tokens: { prompt: totalPrompt, completion: totalCompletion } });
  emit({ type: 'stream_end', agent: agentName, content: '' });
  return { content, toolCalls: allToolCalls, tokensUsed: { prompt: totalPrompt, completion: totalCompletion } };
}
