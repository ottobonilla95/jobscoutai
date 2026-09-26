import { cpSync, mkdirSync } from 'node:fs';
const target='apps/web/.next/standalone/apps/web/.next/static';
mkdirSync(target,{recursive:true});
cpSync('apps/web/.next/static',target,{recursive:true});
