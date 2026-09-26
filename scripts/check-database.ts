import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Accounts} from '../packages/core/src/accounts';
import {createDatabase} from '../packages/core/src/database';
const url=process.env.DATABASE_URL;if(!url)throw new Error('DATABASE_URL is required.');
const first=new Accounts(createDatabase(url)),second=new Accounts(createDatabase(url));
const users:string[]=[];
try{
 const suffix=randomUUID();
 const one=await first.signup({email:`db-check-${suffix}@example.test`,password:randomUUID()});users.push(one.id);
 const two=await second.signup({email:`db-check-2-${suffix}@example.test`,password:randomUUID()});users.push(two.id);
 const a=await first.store(one.id),b=await second.store(two.id),other=await second.store(one.id);
 await a.saveProfile({...((await a.profile()).profile),objective:'Database verification',cvText:'Private synthetic CV'});
 assert.equal((await other.profile()).profile.cvText,'Private synthetic CV');assert.equal((await b.profile()).profile.cvText,'');
 const listing={id:'same-id',title:'Synthetic role',company:'Test',location:'Remote',url:'https://example.test/job',postedAt:null};
 await a.upsert(listing);assert.equal(await b.job(listing.id),null);await b.upsert({...listing,title:'Different account'});
 await b.setStatus(listing.id,'dismissed');assert.equal((await a.job(listing.id))!.status,'new');
 await a.requestRun();const claimed=await Promise.all([a.claim(),other.claim(),a.claim(),other.claim()]);assert.equal(claimed.filter(Boolean).length,1);
 await a.finish(claimed.find(Boolean)!,'completed',{discovered:0,evaluated:0,matched:0,inputTokens:0,outputTokens:0},null);
 const token=await first.session(one);assert.equal((await second.current(token))?.id,one.id);await second.revoke(token);assert.equal(await first.current(token),null);
 const verify=await first.issueToken(one,'verify');const consumed=await Promise.all([first.consumeToken(verify,'verify'),second.consumeToken(verify,'verify')]);assert.equal(consumed.filter(Boolean).length,1);
 const limits=await Promise.all(Array.from({length:8},(_,i)=>(i%2?first:second).allow(`db-check:${suffix}`,3,1)));assert.ok(limits.some(Boolean));
 // A fresh long-lived window must allow exactly three concurrent reservations.
 const limited=await Promise.all(Array.from({length:8},(_,i)=>(i%2?first:second).allow(`db-check-long:${suffix}`,3,60000)));assert.equal(limited.filter(Boolean).length,3);
 console.log('Neon checks passed: persistence across pools, account isolation, exclusive worker claims, shared sessions, single-use tokens, concurrent rate limits.');
}finally{
 for(const id of users)await first.db.prepare('DELETE FROM accounts WHERE id=?').run(id);
 await first.db.close();await second.db.close();
}
