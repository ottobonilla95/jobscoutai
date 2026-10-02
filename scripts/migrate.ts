import {readFile} from 'node:fs/promises';
import {getDatabase} from '../packages/core/src/database';
const db=getDatabase();
try{
 await db.transaction(async tx=>{
  await tx.exec('SELECT pg_advisory_xact_lock(1936028276)');
  await tx.exec('CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY,applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  if(!await tx.prepare('SELECT 1 FROM schema_migrations WHERE version=1').get()){
   await tx.exec(await readFile(new URL('../migrations/001_postgres.sql',import.meta.url),'utf8'));
   await tx.exec('INSERT INTO schema_migrations(version) VALUES(1)');
  }
  if(!await tx.prepare('SELECT 1 FROM schema_migrations WHERE version=2').get()){
   await tx.exec(await readFile(new URL('../migrations/002_cv_builder.sql',import.meta.url),'utf8'));
   await tx.exec('INSERT INTO schema_migrations(version) VALUES(2)');
  }
 });
 console.log('PostgreSQL schema is up to date.');
}finally{await db.close();}
