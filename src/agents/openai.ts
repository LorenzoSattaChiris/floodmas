// ─── FloodMAS — OpenAI Client Singleton ──────────────────────────────

import OpenAI from 'openai';
import { logger } from '../logger.js';

let client: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_KEY;
    if (!apiKey) {
      logger.error('OPENAI_KEY environment variable is not set');
      throw new Error('OPENAI_KEY environment variable is not set');
    }
    client = new OpenAI({ apiKey });
    logger.info('OpenAI client initialised');
  }
  return client;
}

/** Check whether the API key is configured */
export function isOpenAIConfigured(): boolean {
  return !!process.env.OPENAI_KEY;
}
