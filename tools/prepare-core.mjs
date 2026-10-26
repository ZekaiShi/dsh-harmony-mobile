import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, '.cache/core');
await fs.mkdir(output, { recursive: true });
for (const file of await fs.readdir(path.join(root, 'entry/src/main/ets/core'))) {
  if (!file.endsWith('.ts')) continue;
  const input = await fs.readFile(path.join(root, 'entry/src/main/ets/core', file), 'utf8');
  const compiled = ts.transpileModule(input, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  await fs.writeFile(path.join(output, file.replace(/\.ts$/, '.mjs')), compiled.replace(/from '(\.\/[^']+)'/g, "from '$1.mjs'"));
}
