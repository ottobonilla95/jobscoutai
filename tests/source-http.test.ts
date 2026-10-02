import test from 'node:test';
import assert from 'node:assert/strict';
import { publicData } from '../packages/core/src/source-http';

test('public source retrieval follows a bounded same-origin search redirect', async t => {
  const requests:string[]=[];
  t.mock.method(globalThis,'fetch',async(url:string)=>{
    requests.push(url);
    return requests.length===1 ? new Response(null,{status:302,headers:{Location:'/jobs/software'}}) : new Response('public results');
  });
  assert.equal(await publicData('https://www.michaelpage.com.co/jobs?search=software','Michael Page',true),'public results');
  assert.deepEqual(requests,['https://www.michaelpage.com.co/jobs?search=software','https://www.michaelpage.com.co/jobs/software']);
});
test('public source retrieval stops on access limits and rejects off-origin redirects without another request', async t => {
  let calls=0;
  t.mock.method(globalThis,'fetch',async()=>{calls++;return new Response(null,{status:302,headers:{Location:'https://evil.test/private'}});});
  await assert.rejects(publicData('https://www.elempleo.com/co/','ElEmpleo',true),/unexpected redirect/);assert.equal(calls,1);
  t.mock.restoreAll();
  t.mock.method(globalThis,'fetch',async()=>{calls++;return new Response('Access challenge',{status:403});});
  await assert.rejects(publicData('https://www.elempleo.com/co/','ElEmpleo',true),/HTTP 403/);assert.equal(calls,2);
});
test('public source retrieval rejects oversized responses before parsing', async t => {
  t.mock.method(globalThis,'fetch',async()=>new Response(new Uint8Array(5*1024*1024+1)));
  await assert.rejects(publicData('https://www.getonbrd.com/api/v0/search/jobs','Get on Board'),/response too large/);
});
