import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

export function dataDirectory(): string {
  if (process.env.DATA_DIR) {
    if (!isAbsolute(process.env.DATA_DIR)) throw new Error('DATA_DIR must be an absolute path.');
    return process.env.DATA_DIR;
  }
  let dir = process.cwd();
  while (dirname(dir) !== dir) {
    if (existsSync(join(dir, '.env.example'))) return join(dir, 'data');
    dir = dirname(dir);
  }
  return resolve('data');
}

export function integrations() {
  return {
    research:Boolean(process.env.OPENAI_API_KEY),
    ai: Boolean(process.env.OPENAI_API_KEY || process.env.AI_GATEWAY_API_KEY),
    email: Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
    model: process.env.AI_MODEL || 'openai/gpt-5.4-mini',
    reasoning: process.env.AI_REASONING_EFFORT || 'medium',
  };
}
