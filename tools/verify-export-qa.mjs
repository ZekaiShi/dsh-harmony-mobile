import { execFileSync } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

// Requires build-export-qa.mjs's separate com.szk.dshconnect.qa on an emulator.
// Never acts on the user's installed production bundle or model configuration.
const root = path.resolve(import.meta.dirname, '..'), cache = path.join(root, '.cache/qa-export');
await mkdir(cache, { recursive: true });
const target = process.env.HDC_TARGET || '127.0.0.1:5555';
const hdc = process.env.HDC_PATH || 'D:/DevEco Studio/sdk/default/openharmony/toolchains/hdc.exe';
const run = (...args) => execFileSync(hdc, ['-t', target, ...args], { encoding: 'utf8', windowsHide: true, timeout: 15000 });
assert.match(run('shell', 'param', 'get', 'const.product.model'), /emulator/i);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const flatten = node => [node.attributes, ...(node.children || []).flatMap(flatten)];
async function layout() {
  run('shell', 'uitest', 'dumpLayout', '-p', '/data/local/tmp/dsh-export-qa-layout.json', '-b', 'com.szk.dshconnect.qa');
  run('file', 'recv', '/data/local/tmp/dsh-export-qa-layout.json', path.join(cache, 'layout.json'));
  return flatten(JSON.parse(await readFile(path.join(cache, 'layout.json'), 'utf8')));
}
async function click(value) {
  const node = (await layout()).find(n => n.id === value || n.text === value || n.accessibilityText === value || n.description === value);
  assert.ok(node, 'Expected QA control: ' + value);
  const [x1,y1,x2,y2] = node.bounds.match(/\d+/g).map(Number);
  run('shell','uitest','uiInput','click',String(Math.round((x1+x2)/2)),String(Math.round((y1+y2)/2))); await pause(650);
}
async function shot(name) {
  run('shell','uitest','screenCap','-p','/data/local/tmp/dsh-export-qa.png');
  run('file','recv','/data/local/tmp/dsh-export-qa.png',path.join(cache,name+'.png'));
}
await shot('home');
await click('独立 AI 聊天'); await shot('assistant');
const nodes = await layout();
await writeFile(path.join(cache,'assistant-controls.json'),JSON.stringify(nodes.filter(n => n.id || n.text),null,2));
run('shell','uitest','uiInput','keyEvent','Back'); await pause(650);
await click('图像工作室'); await shot('media');
run('shell','uitest','uiInput','keyEvent','Back'); await pause(650);
await click('连接电脑'); await shot('desktop');
await writeFile(path.join(cache,'desktop-controls.json'),JSON.stringify((await layout()).filter(n => n.id || n.text),null,2));
console.log('Captured home, Assistant, Media and Desktop in isolated QA bundle.');
