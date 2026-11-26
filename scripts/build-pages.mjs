import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const at = s => fileURLToPath(new URL(s, import.meta.url));
const modules = ['analyzer', 'rules', 'tokenizer', 'schema-input'];
const check = process.argv.includes('--check');
if (!check) mkdirSync(at('../docs/engine'), {recursive:true});
for (const name of modules) {
  const source = readFileSync(at('../dist/' + name + '.js'), 'utf8').replace(/^\/\/# sourceMappingURL=.*$/m,'');
  if (/from ['"]node:/.test(source)) throw Error(name + ' is not browser-compatible.');
  const path = at('../docs/engine/' + name + '.js');
  if (check) {
    if (readFileSync(path,'utf8') !== source) throw Error('Stale browser engine: run npm run build:pages');
  } else writeFileSync(path,source);
}
