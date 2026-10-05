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
  if(!await tx.prepare('SELECT 1 FROM schema_migrations WHERE version=3').get()){
   await tx.exec(await readFile(new URL('../migrations/003_generation_results.sql',import.meta.url),'utf8'));
   await tx.exec('INSERT INTO schema_migrations(version) VALUES(3)');
  }
  if(!await tx.prepare('SELECT 1 FROM schema_migrations WHERE version=4').get()){
   await tx.exec(await readFile(new URL('../migrations/004_adaptive_discovery.sql',import.meta.url),'utf8'));
   await tx.exec('INSERT INTO schema_migrations(version) VALUES(4)');
  }
  if(!await tx.prepare('SELECT 1 FROM schema_migrations WHERE version=5').get()){
   await tx.exec(await readFile(new URL('../migrations/005_research_memory.sql',import.meta.url),'utf8'));
   await tx.exec('INSERT INTO schema_migrations(version) VALUES(5)');
  }
  if(!await tx.prepare('SELECT 1 FROM schema_migrations WHERE version=6').get()){
   await tx.exec(await readFile(new URL('../migrations/006_goal_investigation.sql',import.meta.url),'utf8'));
   await tx.exec('INSERT INTO schema_migrations(version) VALUES(6)');
  }
 });
 console.log('PostgreSQL schema is up to date.');
}finally{await db.close();}
