import {spawn} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {dataDirectory} from '../packages/core/src/config';
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required.');
process.umask(0o077);
const dir=join(dataDirectory(),'backups');mkdirSync(dir,{recursive:true,mode:0o700});
const file=join(dir,`${new Date().toISOString().replace(/[:.]/g,'-')}.dump`);
// Keep credentials out of process arguments and shell history.
const result=spawn('pg_dump',['--format=custom','--file',file],{env:{...process.env,PGDATABASE:process.env.DATABASE_URL_UNPOOLED||process.env.DATABASE_URL},stdio:['ignore','inherit','inherit']});
result.on('error',()=>{console.error('Install PostgreSQL client tools (pg_dump) before running a backup.');process.exitCode=1;});
result.on('exit',code=>{if(code)process.exitCode=code;else console.log(`Backup saved to ${file}`);});
