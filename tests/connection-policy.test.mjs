import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConnectionPolicy } from '../entry/src/main/ets/core/ConnectionPolicy.ts';

const token = 'WZ1EpEwQ-TLW9U6iH2T9qLrrR2Z_64nMZtBvf-rOIO4';

test('accepts the upstream LAN and internet QR URL shapes without losing token bytes', () => {
  for (const origin of ['http://192.168.1.40:43128', 'http://10.0.0.5:54321', 'https://calm-tree.trycloudflare.com', 'https://abc.a.free.pinggy.link']) {
    const value = `${origin}/pair?token=${token}`;
    const parsed = ConnectionPolicy.parse(` ${value}\n`);
    assert.equal(parsed.ok, true, parsed.message);
    assert.equal(parsed.target.url, value);
    assert.equal(parsed.target.origin, origin);
    assert.equal(parsed.target.hasPairingToken, true);
  }
});

test('rejects incomplete QRs and browser URL confusion rather than loading arbitrary schemes', () => {
  const invalid = [
    '', 'DSH', 'javascript:alert(1)', 'file:///data/a', 'data:text/html,a',
    'https://example.com', 'https://example.com/?token=' + token,
    'https://example.com/pair', 'https://example.com/pair?token=short',
    'https://example.com/pair?token=' + token + '&token=' + token,
    'https://example.com/pair?token=' + token + '&next=https://evil.example',
    'https://example.com/pair?token=' + token + '#fragment',
    'https://user:password@example.com/pair?token=' + token,
    'https://example.com\\@evil.example/pair?token=' + token,
    'https://example.com\u0000/pair?token=' + token,
    'http://192.168.1.1:0/pair?token=' + token,
    'http://192.168.1.1:65536/pair?token=' + token,
    'http://192.168.999.1/pair?token=' + token,
    'http://010.0.0.1/pair?token=' + token,
    'http://2130706433/pair?token=' + token,
    'http://-bad.local/pair?token=' + token,
    'http://[:::1]/pair?token=' + token,
    'https://example.com/pair?token=' + 'a'.repeat(5000)
  ];
  for (const value of invalid) assert.equal(ConnectionPolicy.parse(value).ok, false, value);
});

test('normalizes authorities for exact origin comparison and guards navigation boundaries', () => {
  assert.equal(ConnectionPolicy.parse('HTTPS://PC.EXAMPLE:443/pair?token=' + token).target.origin, 'https://pc.example');
  assert.equal(ConnectionPolicy.parse('http://[fd00::1234]:43128/pair?token=' + token).ok, true);
  assert.equal(ConnectionPolicy.sameOrigin('https://pc.example:443/api/status', 'https://pc.example'), true);
  for (const value of ['https://pc.example.evil.test/', 'http://pc.example/', 'https://pc.example:444/', 'https://pc.example@evil.test/', 'file:///a', '//pc.example/a']) {
    assert.equal(ConnectionPolicy.sameOrigin(value, 'https://pc.example'), false, value);
  }
});

test('recent records contain only canonical origins and never store pairing credentials', () => {
  let recent = [];
  for (let i = 1; i <= 8; i++) {
    recent = ConnectionPolicy.remember(recent, ConnectionPolicy.parse(`http://192.168.1.${i}:43128/pair?token=${token}`).target, i);
  }
  assert.equal(recent.length, 5);
  assert.equal(recent[0].origin, 'http://192.168.1.8:43128');
  recent = ConnectionPolicy.remember(recent, ConnectionPolicy.parse(`http://192.168.1.6:43128/pair?token=${token}`).target, 99);
  assert.equal(recent.length, 5);
  assert.equal(recent[0].openedAt, 99);
  assert.equal(recent.filter(row => row.origin === 'http://192.168.1.6:43128').length, 1);
  assert.equal(JSON.stringify(recent).includes(token), false);
  assert.equal(JSON.stringify(recent).includes('/pair'), false);
  assert.equal(ConnectionPolicy.parse(recent[0].origin + '/', false).ok, true);
});

test('pairing secrets cannot be sent over public cleartext HTTP, including redirects and reconnects', () => {
  for (const host of ['8.8.8.8', '203.0.113.1', 'pc.example', 'localhost.evil.test', '127.0.0.evil', '10.a.b.c', '192.168.evil.test', '0.0.0.0', '[2001:db8::1]', '[::]', '[::ffff:7f00:1]']) {
    assert.equal(ConnectionPolicy.parse(`http://${host}/pair?token=${token}`).ok, false, host);
    assert.equal(ConnectionPolicy.parse(`http://${host}/`, false).ok, false, host);
    assert.equal(ConnectionPolicy.sameOrigin(`http://${host}/api/rpc`, `http://${host}`), false, host);
  }
  for (const host of ['localhost', '127.0.0.1', '10.0.0.1', '172.16.0.1', '172.31.255.254', '192.168.2.52', '169.254.1.2', '[::1]', '[0:0:0:0:0:0:0:1]', '[fd00::1]', '[fe80::1]']) {
    assert.equal(ConnectionPolicy.parse(`http://${host}:43128/pair?token=${token}`).ok, true, host);
  }
  for (const host of ['[:1::]', '[1::2:]', '[1:2:3:4:5:6:7:8::]']) assert.equal(ConnectionPolicy.parse(`https://${host}/pair?token=${token}`).ok, false, host);
});
