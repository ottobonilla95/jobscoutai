import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
if (existsSync('.env')) {
  console.log('.env already exists; no credentials changed.');
} else {
  const template = readFileSync('.env.example', 'utf8')
    .replace('DATA_DIR=\n', `DATA_DIR="${resolve('data')}"\n`);
  writeFileSync('.env', template, { mode: 0o600 });
  console.log('Created private .env. Add your AI/email keys, then create an account at /signup.');
}
mkdirSync('data', { recursive: true, mode: 0o700 });
