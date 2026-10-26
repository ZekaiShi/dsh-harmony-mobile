import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';
import QRCode from 'qrcode';
import { createFixture } from './qa-fixture.mjs';

const root = path.resolve(import.meta.dirname, '..');
export async function startPreview(port = 0) {
  let fixture;
  let generation = 0;
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      if (request.method === 'POST' && url.pathname === '/qa/new-pairing') {
        if (fixture) await fixture.close();
        fixture = await createFixture(); generation++;
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ pairingUrl: fixture.pairingUrl, generation })); return;
      }
      if (url.pathname === '/qa/qr.svg' && fixture) {
        response.writeHead(200, { 'content-type': 'image/svg+xml', 'cache-control': 'no-store' });
        response.end(await QRCode.toString(fixture.pairingUrl, { type: 'svg', margin: 2 })); return;
      }
      const routes = new Map([
        ['/', ['preview/index.html', 'text/html; charset=utf-8']],
        ['/preview.js', ['preview/preview.js', 'text/javascript; charset=utf-8']],
        ['/icon.svg', ['AppScope/resources/base/media/app_icon.svg', 'image/svg+xml']],
        ['/core.js', ['entry/src/main/ets/core/ConnectionPolicy.ts', 'text/javascript; charset=utf-8']]
      ]);
      const route = routes.get(url.pathname);
      if (!route) { response.writeHead(404); response.end(); return; }
      let content = await readFile(path.join(root, route[0]), 'utf8');
      if (url.pathname === '/core.js') content = ts.transpileModule(content, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
      response.writeHead(200, { 'content-type': route[1], 'cache-control': 'no-store' }); response.end(content);
    } catch (error) { response.writeHead(500); response.end(String(error)); }
  });
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    async close() { if (fixture) await fixture.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const preview = await startPreview(Number(process.env.PORT || 4188));
  console.log(`DSH Connect browser preview (not HarmonyOS): ${preview.url}`);
  process.once('SIGINT', async () => { await preview.close(); process.exit(0); });
}
