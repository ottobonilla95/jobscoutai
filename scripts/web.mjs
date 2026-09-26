import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { spawn } from 'node:child_process';
if (existsSync('.env')) loadEnvFile('.env');
const [mode,...args] = process.argv.slice(2);
const command = mode === 'start'
  ? ['apps/web/.next/standalone/apps/web/server.js']
  : ['node_modules/next/dist/bin/next',mode,'apps/web',...args];
const child = spawn(process.execPath,command,{stdio:'inherit',env:process.env});
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>child.kill(signal));
child.on('exit',code=>{process.exitCode=code || 0;});
