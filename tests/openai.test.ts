import test from 'node:test';
import assert from 'node:assert/strict';
import { aiModel } from '../packages/core/src/ai-model';
import { integrations } from '../packages/core/src/config';
import { suggestProfile } from '../packages/core/src/profile-suggestions';
import { draftFromProfile } from '../packages/core/src/search-setup';
import { defaultProfile } from '../packages/core/src/profile';
import {rankJob} from '../packages/core/src/ranker';
import {investigationOutputSchema,investigationSchema} from '../packages/core/src/research-task-schema';
import {generateText,Output} from 'ai';

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

test('ranking requires nullable compensation in strict output and leaves room for reasoning plus the assessment',async t=>{
 configure(t,{OPENAI_API_KEY:'synthetic-openai-test-key',AI_GATEWAY_API_KEY:undefined});
 const description='Own the product roadmap and deliver customer-facing TypeScript software.';
 const output={score:90,eligibility:'eligible',summary:'Supported match.',reasons:[],concerns:[],salaryEvidence:null,equityEvidence:null,founderPathEvidence:null,compensation:null,research:{components:defaultProfile.strategy.groups.flatMap(g=>g.criteria.map(c=>({id:c.id,score:5,reason:'Supported by the listing.',evidence:description}))),requirements:[],countries:[]}};
 t.mock.method(globalThis,'fetch',async(_url:string,init:RequestInit)=>{
  const body=JSON.parse(String(init.body));
  const schema=body.text.format.schema;
  assert.ok(schema.required.includes('compensation'));
  assert.ok(body.max_output_tokens>=10000);
  return Response.json({id:'ranking-response',model:'gpt-5.4-mini',created_at:1,status:'completed',output:[{type:'message',role:'assistant',id:'ranking-message',content:[{type:'output_text',text:JSON.stringify(output),annotations:[]}]}],usage:{input_tokens:100,output_tokens:20,total_tokens:120}});
 });
 const result=await rankJob({id:'synthetic',title:'Product Engineer',company:'Example',location:'London',url:'https://example.com/job',postedAt:null,firstSeen:'2026-11-11',lastSeen:'2026-11-12',description,status:'new',assessment:null,evaluatedVersion:null,notifiedAt:null},defaultProfile);
 assert.equal(result.assessment.compensation,null);assert.equal(result.assessment.evaluation?.decision,'apply');
});

test('research generation avoids unsupported uri format while preserving URL validation afterward',async t=>{
 configure(t,{OPENAI_API_KEY:'synthetic-openai-test-key',AI_GATEWAY_API_KEY:undefined});
 t.mock.method(globalThis,'fetch',async(_url:string,init:RequestInit)=>{
  const body=JSON.parse(String(init.body));
  assert.ok(!JSON.stringify(body.text.format.schema).includes('"format":"uri"'));
  return Response.json({id:'research-response',model:'gpt-5.4-mini',created_at:1,status:'completed',output:[{type:'message',role:'assistant',id:'research-message',content:[{type:'output_text',text:'{"questions":[]}',annotations:[]}]}],usage:{input_tokens:100,output_tokens:20,total_tokens:120}});
 });
 const result=await generateText({model:aiModel(),output:Output.object({schema:investigationOutputSchema}),prompt:'Synthetic research schema check.'});
 assert.deepEqual(investigationSchema.parse(result.output),{questions:[]});
 const invalid={questions:[{question:'What is the base salary?',topic:'Salary',scope:'job',claims:[{url:'not-a-url',quote:'Salary is not specified.',scope:'job',stance:'supports'}]}]};
 assert.equal(investigationOutputSchema.safeParse(invalid).success,true);
 assert.equal(investigationSchema.safeParse(invalid).success,false);
});
