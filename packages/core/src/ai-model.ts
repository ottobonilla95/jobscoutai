import { createOpenAI } from '@ai-sdk/openai';
import { gateway, type LanguageModel } from 'ai';
import { integrations } from './config';

export function aiModel(): LanguageModel {
  const { model } = integrations();
  if (process.env.OPENAI_API_KEY) {
    if (model.includes('/') && !model.startsWith('openai/')) {
      throw new Error('OPENAI_API_KEY requires an OpenAI AI_MODEL.');
    }
    return createOpenAI({ apiKey: process.env.OPENAI_API_KEY }).responses(model.replace(/^openai\//, ''));
  }
  if (process.env.AI_GATEWAY_API_KEY) {
    return gateway(model.includes('/') ? model : `openai/${model}`);
  }
  throw new Error('Add OPENAI_API_KEY on the server to enable AI matching.');
}
