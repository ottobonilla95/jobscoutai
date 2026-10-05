import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import type {TestContext} from 'node:test';
import {Database, type Connection} from '../packages/core/src/database';
import {Accounts} from '../packages/core/src/accounts';
export async function accountsFixture(t:TestContext){
 const pg=new PGlite();
 await pg.exec(await readFile(new URL('../migrations/001_postgres.sql',import.meta.url),'utf8'));
 await pg.exec(await readFile(new URL('../migrations/002_cv_builder.sql',import.meta.url),'utf8'));
 await pg.exec(await readFile(new URL('../migrations/003_generation_results.sql',import.meta.url),'utf8'));
 const db=new Database(pg as Connection,fn=>pg.transaction(async tx=>{
  const nested=new Database(tx as Connection,f=>f(nested),async()=>{});return fn(nested);
 }),()=>pg.close());
 t.after(()=>db.close());return new Accounts(db);
}
export async function storeFixture(t:TestContext){
 const accounts=await accountsFixture(t);
 const user=await accounts.signup({email:'test@example.test',password:'A private test password 2026'});
 return accounts.store(user.id);
}
