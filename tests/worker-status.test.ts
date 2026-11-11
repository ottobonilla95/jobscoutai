import test from 'node:test';
import assert from 'node:assert/strict';
import {workerCheckedRecently,workerCheckGraceMs} from '../packages/core/src/worker-status';

test('a healthy 15-minute scheduler remains recent between checks',()=>{
  const now=Date.parse('2026-11-11T11:41:00Z');
  assert.equal(workerCheckedRecently('2026-11-11T11:32:59Z',now),true);
  assert.equal(workerCheckedRecently(new Date(now-15*60_000).toISOString(),now),true);
  assert.equal(workerCheckedRecently(new Date(now-workerCheckGraceMs).toISOString(),now),false);
});

test('missing, invalid, and future heartbeats do not indicate a recent worker check',()=>{
  const now=Date.parse('2026-11-11T11:41:00Z');
  for(const heartbeat of [null,'invalid','2026-11-11T11:42:00Z']){
    assert.equal(workerCheckedRecently(heartbeat,now),false);
  }
});
