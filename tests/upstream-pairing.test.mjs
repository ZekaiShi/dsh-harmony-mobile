import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFixture } from '../tools/qa-fixture.mjs';
import { ConnectionPolicy } from '../entry/src/main/ets/core/ConnectionPolicy.ts';

test('upstream QR pairs with HttpOnly cookie and opens its real mobile HTML', async () => {
  const fixture = await createFixture();
  try {
    assert.equal(ConnectionPolicy.parse(fixture.pairingUrl).ok, true);
    const paired = await fetch(fixture.pairingUrl, { redirect: 'manual' });
    assert.equal(paired.status, 302);
    const cookie = paired.headers.get('set-cookie');
    assert.match(cookie, /dsh_mobile=.*HttpOnly; SameSite=Strict/);
    const page = await fetch(fixture.base + '/', { headers: { cookie: cookie.split(';')[0] } });
    assert.match(await page.text(), /id="sessionsView"/);
    // LAN intentionally remembers the IP. A tunnel-mode visitor has no such
    // authorization and must not be able to reuse the consumed QR.
    const replay = await fetch(fixture.pairingUrl, { redirect: 'manual', headers: { 'cf-connecting-ip': '203.0.113.6', 'cf-ray': 'qa' } });
    assert.equal(replay.status, 401, 'QR is consumed for an unpaired visitor');
    const status = await fetch(fixture.base + '/api/status', { headers: { cookie: cookie.split(';')[0] } });
    assert.equal((await status.json()).connected, true);
  } finally { await fixture.close(); }
});

test('expired upstream QR is rejected', async () => {
  const fixture = await createFixture();
  try {
    fixture.expirePairing();
    assert.equal((await fetch(fixture.pairingUrl, { redirect: 'manual' })).status, 401);
  } finally { await fixture.close(); }
});

test('upstream public-tunnel headers require PIN and issue a Secure cookie after success', async () => {
  const fixture = await createFixture();
  const headers = { host: 'qa.trycloudflare.com', 'cf-connecting-ip': '203.0.113.5', 'cf-ray': 'qa' };
  try {
    const paired = await fetch(fixture.pairingUrl, { headers, redirect: 'manual' });
    assert.equal(paired.status, 200);
    assert.equal(paired.headers.get('set-cookie'), null);
    assert.match(await paired.text(), /pair\/verify/);
    // These are local protocol requests with simulated tunnel headers, not a
    // real public tunnel or a browser HTTPS test.
    const verify = pin => fetch(fixture.base + '/pair/verify', { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ pin }) });
    assert.equal((await verify('000000')).status, 401);
    const verified = await verify('246810');
    assert.equal(verified.status, 200);
    assert.match(verified.headers.get('set-cookie'), /HttpOnly; SameSite=Strict; Path=\/; Secure/);
  } finally { await fixture.close(); }
});
