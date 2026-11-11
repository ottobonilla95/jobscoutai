import test from 'node:test';
import assert from 'node:assert/strict';
import {retrySource} from '../packages/core/src/source-retry';
import {SourceError,responseFailure} from '../packages/core/src/source-error';
import {searchQuery,locationCoverage,orderedQueries,queryKey,type SearchSession} from '../packages/core/src/search-session';
import {searchSources} from '../packages/core/src/sources';
import {defaultProfile} from '../packages/core/src/profile';
import {searchLinkedIn} from '../packages/core/src/linkedin';

test('temporary source failures recover with backoff and stop after three attempts',async()=>{
 const waits:number[]=[];let calls=0;
 const value=await retrySource(async()=>{if(++calls<3)throw new TypeError('Connection reset');return 'recovered';},{sleep:async ms=>{waits.push(ms);}});
 assert.equal(value,'recovered');assert.equal(calls,3);assert.deepEqual(waits,[2000,4000]);
 calls=0;waits.length=0;
 await assert.rejects(retrySource(async()=>{calls++;throw responseFailure('Test',new Response(null,{status:503}));},{sleep:async ms=>{waits.push(ms);}}));
 assert.equal(calls,3);assert.deepEqual(waits,[2000,4000]);
});
test('rate limits honor Retry-After and the run deadline; access challenges are not hammered',async()=>{
 let calls=0;const waits:number[]=[];
 await retrySource(async()=>{if(++calls===1)throw responseFailure('Test',new Response(null,{status:429,headers:{'Retry-After':'10'}}));return [];},{sleep:async ms=>{waits.push(ms);}});
 assert.equal(calls,2);assert.deepEqual(waits,[10000]);
 calls=0;waits.length=0;
 await assert.rejects(retrySource(async()=>{calls++;throw responseFailure('Test',new Response(null,{status:429,headers:{'Retry-After':'10'}}));},{deadline:5000,now:()=>0,sleep:async ms=>{waits.push(ms);}}));
 assert.equal(calls,1);assert.deepEqual(waits,[]);
 await assert.rejects(retrySource(async()=>{throw responseFailure('Test',new Response(null,{status:429,headers:{'Retry-After':'3600'}}));},{sleep:async()=>{assert.fail('must not wait an hour');}}));
 calls=0;
 await assert.rejects(retrySource(async()=>{calls++;throw responseFailure('Test',new Response(null,{status:403}));},{sleep:async()=>{assert.fail('must not retry an access block');}}));
 assert.equal(calls,1);
});
const session=():SearchSession=>({round:0,page:0,remaining:24,deadline:Date.now()+60000,seen:new Set(),blocked:new Set(),history:new Map(),cache:new Map(),perSource:new Map(),attempts:[],items:[]});
const q={source:'linkedin',query:'Engineer',location:'Colombia',page:0};
test('physical retries consume the query budget and cannot exceed it',async()=>{
 const s=session();s.remaining=1;let reads=0;
 await assert.rejects(searchQuery(s,q,async()=>{reads++;throw new TypeError('Disconnected');}));
 assert.equal(reads,1);assert.equal(s.remaining,0);assert.equal(s.attempts[0].retries,0);assert.equal(s.blocked.size,0);
});
test('previous failures remain retryable without starving locations never searched',async()=>{
 const s=session();s.round=1;s.successful=new Set();s.history.set(queryKey(q),'2026-11-11');
 const london={...q,location:'London, United Kingdom'};
 assert.deepEqual(orderedQueries([q,london],s),[london,q]);
 let reads=0;await searchQuery(s,q,async()=>{reads++;return [];});
 assert.equal(reads,1);assert.equal(s.attempts[0].status,'ok');
});
test('a failed Colombian query retries then allows Europe to run and reports incomplete coverage',async t=>{
 const s=session(),requested=['Colombia','London, United Kingdom','Berlin, Germany'];let reads=0;
 const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
 globalThis.fetch=async input=>{reads++;return new Response(new URL(String(input)).searchParams.get('location')==='Colombia'?'Unrecognized page':'No results');};
 const result=await searchSources({...defaultProfile,titles:['Engineer'],locations:requested.slice(0,2),sources:['linkedin']},{
  linkedin:searchLinkedIn,yc:async()=>[],company:async()=>[],country:async()=>[],
 },s);
 assert.equal(reads,4);assert.equal(s.remaining,20);assert.equal(s.attempts[0].retries,2);
 assert.equal(s.blocked.size,0);assert.deepEqual(result.blocked,[]);assert.ok(result.errors.some(e=>e.includes('Colombia')));
 assert.deepEqual(locationCoverage(requested,s.attempts),{checked:[requested[1]],unavailable:[requested[0]],unsearched:[requested[2]]});
});
