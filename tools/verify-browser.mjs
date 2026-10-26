import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createFixture } from './qa-fixture.mjs';
import { startPreview } from './preview-server.mjs';
import { MOBILE_VIEWPORT_PATCH } from '../entry/src/main/ets/core/HostPresentation.ts';

const root = path.resolve(import.meta.dirname, '..');
const shots = path.join(root, 'reports/screenshots');
await mkdir(shots, { recursive: true });
const fixture = await createFixture();
const preview = await startPreview();
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await context.addInitScript(MOBILE_VIEWPORT_PATCH);
await context.addInitScript(() => {
  window.qaStreamEvents = { snapshots: 0, events: 0 };
  const Original = window.EventSource;
  window.EventSource = class extends Original {
    constructor(...args) {
      super(...args);
      this.addEventListener('snapshot', () => window.qaStreamEvents.snapshots++);
      this.addEventListener('event', () => window.qaStreamEvents.events++);
    }
  };
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const checked = [];
try {
  await page.goto(preview.url);
  await page.screenshot({ path: path.join(shots, 'browser-home.png'), fullPage: true });
  await page.locator('#manual-toggle').click();
  await page.locator('#link').fill('javascript:alert(1)');
  await page.locator('#open').click();
  assert.match(await page.locator('#error').textContent(), /HTTP/);
  assert.equal(page.url(), preview.url + '/');
  checked.push('invalid URL stays on connection screen');

  await page.locator('#link').fill(fixture.pairingUrl);
  await page.locator('#open').click();
  await page.waitForURL(fixture.base + '/');
  const mobileCookie = (await context.cookies()).find(item => item.name === 'dsh_mobile');
  assert.ok(mobileCookie?.httpOnly);
  assert.equal((await page.evaluate(() => document.cookie)).includes('dsh_mobile'), false);
  checked.push('official pairing redirect and HttpOnly cookie');
  // Upstream automatically opens the most recent conversation on entry.
  await page.locator('[data-id="qa-session"]').waitFor({ state: 'attached' });
  await page.getByText('已打开上游手机页面。这是隔离测试回复。', { exact: true }).waitFor();
  const firstLine = await page.locator('#messages .message.assistant').first().boundingBox();
  const floatingBack = await page.locator('#back').boundingBox();
  assert.ok(firstLine.y >= floatingBack.y + floatingBack.height, 'host padding keeps first message below floating Back');
  checked.push('unmodified upstream workspace/session/history page');

  await page.locator('#prompt').fill('鸿蒙连接验收');
  await page.locator('#send').click();
  await page.getByText('流式兼容：收到「鸿蒙连接验收」。', { exact: true }).waitFor();
  await page.waitForFunction(() => window.qaStreamEvents.events >= 4 && window.qaStreamEvents.snapshots >= 1);
  assert.ok(fixture.calls.some(item => item.method === 'session/prompt' && item.args.request.content[0].text === '鸿蒙连接验收'));
  checked.push('prompt reaches Host through real bridge and SSE renders answer');
  await page.screenshot({ path: path.join(shots, 'upstream-chat.png'), fullPage: true });

  fixture.requestQuestion();
  await page.getByText('是否继续兼容性测试？', { exact: true }).waitFor();
  await page.locator('[data-option-index="0"]').click();
  await page.locator('[data-question-action="continue"]').click();
  await page.waitForFunction(() => document.querySelector('#questionComposer').hidden);
  assert.equal(fixture.answers.length, 1);
  checked.push('upstream user-question response round trip');

  const before = await page.evaluate(() => window.qaStreamEvents.snapshots);
  fixture.closeStreams();
  await page.waitForFunction(value => window.qaStreamEvents.snapshots > value, before);
  checked.push('SSE reconnects after dropped stream');
  await page.reload();
  await page.locator('[data-id="qa-session"]').waitFor({ state: 'attached' });
  await page.getByText('流式兼容：收到「鸿蒙连接验收」。', { exact: true }).waitFor();
  checked.push('reload continues with cookie and durable session history');

  await page.locator('#back').click();
  await page.locator('#newSession').click();
  await page.locator('#prompt').waitFor({ state: 'visible' });
  await page.locator('#back').click();
  await page.locator('[data-id="qa-created-1"]').waitFor();
  checked.push('new phone session remains visible after returning to list');

  await page.goto(preview.url);
  const records = await page.evaluate(() => JSON.parse(localStorage.getItem('qa-recent-origins')));
  assert.equal(records[0].origin, fixture.base);
  assert.equal(JSON.stringify(records).includes('token'), false);
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await page.locator('[data-id="qa-session"]').waitFor({ state: 'attached' });
  checked.push('origin-only recent connection resumes upstream page');

  const desktopPage = await fetch(fixture.bridge.createDesktopUrl(), { redirect: 'manual' });
  const desktopCookie = desktopPage.headers.get('set-cookie')?.split(';')[0];
  assert.ok(desktopCookie);
  const disconnected = await fetch(fixture.base + '/desktop/disconnect', { method: 'POST', headers: { cookie: desktopCookie } });
  assert.equal(disconnected.ok, true);
  await page.waitForURL('**/disconnected', { timeout: 15000 });
  await page.screenshot({ path: path.join(shots, 'upstream-disconnected.png'), fullPage: true });
  checked.push('desktop revocation moves phone to upstream disconnected page');
  assert.deepEqual(errors, []);

  await writeFile(path.join(root, 'reports/browser-check.json'), JSON.stringify({
    pass: true, engine: 'Microsoft Edge / Chromium', viewport: '390 x 844',
    upstreamCommit: '67df6719fb1895139cd1ac595b2367b5642be67c',
    hostAdaptation: 'same MOBILE_VIEWPORT_PATCH used by native host; first message clears upstream floating Back button',
    checked, pageErrors: errors,
    limitations: ['Native scanner/camera/album NOT_RUN', 'ArkWeb/device lifecycle NOT_RUN', 'Real public tunnel NOT_RUN', 'Agent Host is an isolated fixture, not a live model']
  }, null, 2));
  console.log(`Browser compatibility checks passed: ${checked.length} flows. Not a HarmonyOS device test.`);
} catch (error) {
  await page.screenshot({ path: path.join(shots, 'failure.png'), fullPage: true }).catch(() => {});
  await writeFile(path.join(root, 'reports/browser-failure.json'), JSON.stringify({ checked, errors, error: String(error) }, null, 2));
  throw error;
} finally {
  await context.close(); await browser.close(); await preview.close(); await fixture.close();
}
