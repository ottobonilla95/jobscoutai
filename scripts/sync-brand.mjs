import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = path => readFileSync(resolve(root, path), 'utf8');
const product = JSON.parse(read('config/product.json'));
const values = {...product, ...product.compatibility};
const check = process.argv.includes('--check');

// Values are also rendered into YAML and shell/systemd files: reject syntax-breaking input.
if (!/^[A-Za-z0-9][A-Za-z0-9 .-]*$/.test(product.name)) throw new Error('Use letters, numbers, spaces, dots or hyphens in the product name.');
for (const key of ['slug', 'sessionCookie', 'languageCookie', 'composeProject', 'dataVolume', 'servicePrefix']) {
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(values[key])) throw new Error(`Invalid product configuration: ${key}`);
}
if (!/^\/[A-Za-z0-9/_-]+$/.test(values.installDirectory)) throw new Error('Use an absolute deployment directory without spaces or shell syntax.');
if (!/^[A-Za-z0-9._/-]+$/.test(product.httpAgent)) throw new Error('Invalid HTTP agent.');

const outputs = new Map();
for (const path of ['package.json', 'package-lock.json']) {
  const json = JSON.parse(read(path));
  json.name = product.slug;
  if (path === 'package-lock.json') json.packages[''].name = product.slug;
  outputs.set(path, `${JSON.stringify(json, null, 2)}\n`);
}

const templates = [
  ['compose.yaml', 'compose.yaml'],
  ['README.md', 'README.md'],
  ['install-timers.sh', 'deploy/install-timers.sh'],
  ...['worker.service', 'worker.timer', 'backup.service', 'backup.timer']
    .map(name => [name, `deploy/${values.servicePrefix}-${name}`]),
];
for (const [template, target] of templates) {
  let text = read(`config/templates/${template}.tpl`).replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (typeof values[key] !== 'string') throw new Error(`Unknown template parameter: ${key}`);
    return values[key];
  });
  const note = 'Generated from config/product.json and config/templates; run npm run brand:sync.';
  if (target.endsWith('.md')) text = `<!-- ${note} -->\n${text}`;
  else if (text.startsWith('#!')) text = text.replace('\n', `\n# ${note}\n`);
  else text = `# ${note}\n${text}`;
  outputs.set(target, text);
}

const changed = [];
for (const [path, expected] of outputs) {
  let actual;
  try { actual = read(path); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (actual === expected) continue;
  changed.push(path);
  if (!check) writeFileSync(resolve(root, path), expected);
}
if (check && changed.length) {
  console.error(`Product configuration is out of sync: ${changed.join(', ')}. Run npm run brand:sync.`);
  process.exitCode = 1;
} else console.log(check ? 'Product configuration is in sync.' : `Updated ${changed.length} generated files.`);
