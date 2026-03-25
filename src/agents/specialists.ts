// ─── FloodMAS — Specialist ReAct Agents ──────────────────────────────
// Each specialist runs a tool-calling loop with OpenAI, emitting SSE
// events for each step. The loop exits when the model stops calling
// tools or the iteration guard is hit.

import { getOpenAI } from './openai.js';
import { MODELS, TEMPERATURE, MAX_TOKENS, GUARDRAILS } from './config.js';
import { PROMPTS, type AgentRole } from './prompts.js';
import { getToolDefinitions, executeTool } from '../tools/registry.js';
import { logger } from '../logger.js';
import type { AgentResult, EmitFn, ToolCallTrace, LlmCallBudget } from './types.js';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions.js';

/** Tool names assigned to each specialist */
const SPECIALIST_TOOLS: Record<string, readonly string[]> = {
  forecasting:        [
    'get_weather_forecast', 'get_river_levels', 'forecast_flood_levels',
    // Live map layer data
    'get_precipitation_data', 'get_river_discharge_data', 'get_soil_moisture_data',
    // Met Office NWP model data
    'query_atmospheric_models',
  ],
  monitoring:         [
    'read_sensor_network', 'detect_sensor_anomalies',
    // Live map layer data
    'query_live_flood_warnings', 'query_ea_stations', 'query_nrfa_stations',
  ],
  riskAnalysis:       [
    'get_flood_zone_info', 'assess_infrastructure_vulnerability', 'estimate_population_at_risk', 'predict_flood_risk',
    // Map layer data
    'query_flood_warning_areas', 'query_flood_risk_areas', 'query_llfa', 'query_imd_deprivation',
  ],
  emergencyResponse:  [
    'generate_flood_alert', 'plan_evacuation', 'allocate_resources', 'escalate_emergency',
    // Spatial map layer data
    'query_flood_defences', 'query_historic_floods', 'query_main_rivers',
  ],
} as const;

/** Display names for SSE events */
const DISPLAY_NAMES: Record<string, string> = {
  forecasting: 'Forecasting',
  monitoring: 'Monitoring',
  riskAnalysis: 'Risk Analysis',
  emergencyResponse: 'Emergency Response',
};

/**
 * Run a specialist agent's ReAct loop.
 *
 * @param role       - Agent role key (forecasting | monitoring | riskAnalysis | emergencyResponse)
 * @param userQuery  - The delegated task description from the coordinator
 * @param emit       - SSE event emitter
 */
export async function runSpecialist(
  role: AgentRole,
  userQuery: string,
  emit: EmitFn,
  budget?: LlmCallBudget,
): Promise<AgentResult> {
  const agentName = DISPLAY_NAMES[role] ?? role;
  const toolNames = SPECIALIST_TOOLS[role];
  if (!toolNames) throw new Error(`Unknown specialist role: ${role}`);

  emit({ type: 'agent_start', agent: agentName, content: `Analysing: ${userQuery.slice(0, 120)}` });

  const openai = getOpenAI();
  const tools = getToolDefinitions(toolNames);
  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: PROMPTS[role] },
    { role: 'user', content: userQuery },
  ];

  const allToolCalls: ToolCallTrace[] = [];
  let totalPrompt = 0;
  let totalCompletion = 0;

  for (let i = 0; i < GUARDRAILS.specialistMaxIterations; i++) {
    // Budget check before specialist LLM call
    if (budget && budget.used >= budget.limit) {
      logger.info({ role, used: budget.used, limit: budget.limit }, 'LLM budget exhausted in specialist — returning early');
      emit({ type: 'system', agent: agentName, content: `LLM call limit reached. Summarising available data…` });
      break;
    }

    if (budget) budget.used++;
    emit({ type: 'llm_call', agent: agentName, content: `LLM call ${budget ? `${budget.used}/${budget.limit}` : i + 1}` });

    const response = await openai.chat.completions.create({
      model: MODELS.specialist,
      temperature: TEMPERATURE.specialist,
      max_completion_tokens: MAX_TOKENS.specialist,
      messages,
      tools,
    });

    const choice = response.choices[0];
    if (!choice) throw new Error(`${agentName}: empty response from model`);
    const msg = choice.message;
    totalPrompt += response.usage?.prompt_tokens ?? 0;
    totalCompletion += response.usage?.completion_tokens ?? 0;

    // If no tool calls, the agent has produced its final answer
    if (!msg.tool_calls?.length) {
      const content = msg.content ?? '';
      emit({ type: 'agent_response', agent: agentName, content });
      emit({ type: 'agent_end', agent: agentName, content: `Completed (${allToolCalls.length} tool calls)`, tokens: { prompt: totalPrompt, completion: totalCompletion } });
      return { content, toolCalls: allToolCalls, tokensUsed: { prompt: totalPrompt, completion: totalCompletion } };
    }

    // Process each tool call
    messages.push(msg as ChatCompletionMessageParam);

    for (const tc of msg.tool_calls) {
      if (tc.type !== 'function') continue;
      const toolName = tc.function.name;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
      } catch {
        logger.warn({ toolName, raw: tc.function.arguments }, 'Failed to parse tool arguments');
      }

      emit({ type: 'tool_call', agent: agentName, content: toolName, tool: toolName, args });

      let result: string;
      try {
        result = await executeTool(toolName, args);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error({ toolName, err }, 'Tool execution failed');
        result = JSON.stringify({ error: `Tool ${toolName} failed: ${errMsg}` });
      }

      emit({ type: 'tool_result', agent: agentName, content: result.slice(0, 300), tool: toolName });

      allToolCalls.push({ tool: toolName, args, result });
      messages.push({ role: 'tool', tool_call_id: tc.id, content: result });
    }
  }

  // Guard: hit max iterations or budget exhausted — force a response from what we have
  logger.warn({ role, iterations: GUARDRAILS.specialistMaxIterations, llmCalls: budget?.used }, 'Specialist forcing final synthesis');

  if (budget) budget.used++;
  emit({ type: 'llm_call', agent: agentName, content: `LLM call ${budget ? `${budget.used}/${budget.limit}` : '?'} (synthesis)` });

  const finalResp = await openai.chat.completions.create({
    model: MODELS.specialist,
    temperature: TEMPERATURE.specialist,
    max_completion_tokens: MAX_TOKENS.specialist,
    messages: [...messages, { role: 'user', content: 'Summarise your findings so far in a final response.' }],
  });

  const content = finalResp.choices[0]?.message.content ?? '';
  totalPrompt += finalResp.usage?.prompt_tokens ?? 0;
  totalCompletion += finalResp.usage?.completion_tokens ?? 0;

  emit({ type: 'agent_response', agent: agentName, content });
  emit({ type: 'agent_end', agent: agentName, content: `Completed (max iterations reached)`, tokens: { prompt: totalPrompt, completion: totalCompletion } });
  return { content, toolCalls: allToolCalls, tokensUsed: { prompt: totalPrompt, completion: totalCompletion } };
}
