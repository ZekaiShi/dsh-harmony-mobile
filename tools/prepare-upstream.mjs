import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import ts from 'typescript';

export const UPSTREAM = '67df6719fb1895139cd1ac595b2367b5642be67c';
const root = path.resolve(import.meta.dirname, '..');
const sourceRoot = path.join(root, '.research/upstream');
const compiledRoot = path.join(root, '.research/compiled');
const seen = new Set();
const sources = [];

async function materialize(relative) {
  if (seen.has(relative)) return;
  if (relative.startsWith('../') || !relative.endsWith('.ts')) throw new Error('Unexpected upstream path');
  seen.add(relative);
  const response = await fetch(`https://raw.githubusercontent.com/dataelement/dsh-desktop/${UPSTREAM}/${relative}`);
  if (!response.ok) throw new Error(`Upstream ${relative}: HTTP ${response.status}`);
  const source = await response.text();
  const sourcePath = path.join(sourceRoot, relative);
  await mkdir(path.dirname(sourcePath), { recursive: true });
  await writeFile(sourcePath, source);
  sources.push({ path: relative, sha256: createHash('sha256').update(source).digest('hex') });
  let output = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
  }).outputText;
  const relatives = [...output.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)].map(match => match[1]);
  for (const specifier of relatives) {
    const dependency = path.posix.normalize(path.posix.join(path.posix.dirname(relative), specifier)) + '.ts';
    await materialize(dependency);
    output = output.replaceAll(`'${specifier}'`, `'${specifier}.mjs'`).replaceAll(`"${specifier}"`, `"${specifier}.mjs"`);
  }
  const destination = path.join(compiledRoot, relative.replace(/\.ts$/, '.mjs'));
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, output);
}

await materialize('src/main/mobile/lan-mobile-bridge.ts');
const licenseResponse = await fetch(`https://raw.githubusercontent.com/dataelement/dsh-desktop/${UPSTREAM}/LICENSE`);
if (!licenseResponse.ok) throw new Error('Upstream license unavailable');
await writeFile(path.join(sourceRoot, 'LICENSE'), await licenseResponse.text());
await mkdir(path.join(root, 'reports'), { recursive: true });
await writeFile(path.join(root, 'reports/upstream-source.json'), JSON.stringify({
  repository: 'https://github.com/dataelement/dsh-desktop', commit: UPSTREAM,
  note: 'Verification-only sources; native app loads the page served by the user\'s desktop.', sources
}, null, 2));
console.log(`Prepared ${sources.length} unmodified source files at ${UPSTREAM.slice(0, 7)} (compiled JS for local verification).`);
