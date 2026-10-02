import test from 'node:test';
import assert from 'node:assert/strict';
import { aiModel } from '../packages/core/src/ai-model';
import { integrations } from '../packages/core/src/config';
import { suggestProfile } from '../packages/core/src/profile-suggestions';
import { draftFromProfile } from '../packages/core/src/search-setup';
import { defaultProfile } from '../packages/core/src/profile';

function configure(t: test.TestContext, values: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(values)) {
    const old = process.env[key];
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
    t.after(() => { if (old === undefined) delete process.env[key]; else process.env[key] = old; });
  }
}

test('OpenAI key alone enables suggestions and sends structured requests directly to OpenAI', async t => {
  configure(t, { OPENAI_API_KEY: 'synthetic-openai-test-key', AI_GATEWAY_API_KEY: undefined, AI_MODEL: undefined, AI_REASONING_EFFORT: 'medium' });
  assert.equal(integrations().ai, true);
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    calls++;
    assert.equal(String(url), 'https://api.openai.com/v1/responses');
    assert.equal(new Headers(init.headers).get('authorization'), 'Bearer synthetic-openai-test-key');
    const body = JSON.parse(String(init.body));
    assert.equal(body.model, 'gpt-5.4-mini');
    assert.equal(body.store, false);
    assert.equal(body.reasoning.effort, 'medium');
    assert.equal(body.text.format.type, 'json_schema');
    assert.equal(body.text.format.strict, true);
    return Response.json({
      id: 'synthetic-response', model: 'gpt-5.4-mini', created_at: 1, status: 'completed',
      output: [{ type: 'message', role: 'assistant', id: 'synthetic-message', content: [{ type: 'output_text', text: JSON.stringify({ titles: ['Product Engineer'] }), annotations: [] }] }],
      usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120 },
    });
  });
  const answers = draftFromProfile(defaultProfile, 4).answers;
  const result = await suggestProfile(answers, 'roles', 'en');
  assert.ok('titles' in result);
  assert.deepEqual(result.titles, ['Product Engineer']);
  assert.equal(result.inputTokens, 100);
  assert.equal(result.outputTokens, 20);
  assert.equal(calls, 1);
});

test('OpenAI key takes priority over Gateway and cannot be used for another provider', t => {
  configure(t, { OPENAI_API_KEY: 'synthetic-openai-test-key', AI_GATEWAY_API_KEY: 'unused-gateway-key', AI_MODEL: 'openai/gpt-5.4-mini' });
  const model = aiModel();
  assert.equal(typeof model, 'object');
  if (typeof model !== 'object') throw new Error('Expected a direct provider model.');
  assert.equal(model.provider, 'openai.responses');
  assert.equal(model.modelId, 'gpt-5.4-mini');
  process.env.AI_MODEL = 'anthropic/test-model';
  assert.throws(aiModel, /requires an OpenAI AI_MODEL/);
});

test('Gateway remains available and missing credentials keep AI disabled', t => {
  configure(t, { OPENAI_API_KEY: undefined, AI_GATEWAY_API_KEY: 'synthetic-gateway-key', AI_MODEL: 'gpt-5.4-mini' });
  const model = aiModel();
  assert.equal(typeof model, 'object');
  if (typeof model !== 'object') throw new Error('Expected a Gateway model.');
  assert.equal(model.modelId, 'openai/gpt-5.4-mini');
  delete process.env.AI_GATEWAY_API_KEY;
  assert.equal(integrations().ai, false);
  assert.throws(aiModel, /Add OPENAI_API_KEY/);
});
