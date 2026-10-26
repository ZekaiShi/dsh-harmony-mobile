import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DshClient } from '../.cache/core/DshClient.mjs';
import { ConnectionPolicy } from '../.cache/core/ConnectionPolicy.mjs';
import { SseParser } from '../.cache/core/SseParser.mjs';
import { ChatReducer } from '../.cache/core/ChatReducer.mjs';
import { createFixture } from '../tools/qa-fixture.mjs';

class MemorySecrets {
  values = new Map();
  async load(origin) { return this.values.get(origin) || ''; }
  async save(origin, cookie) { this.values.set(origin, cookie); }
  async remove(origin) { this.values.delete(origin); }
}
class NodeTransport {
  constructor(tunnel = false) { this.tunnel = tunnel; this.requests = []; }
  headers(wire) {
    return { 'content-type': 'application/json', cookie: wire.cookie,
      ...(this.tunnel ? { host: 'qa.trycloudflare.com', 'cf-connecting-ip': '203.0.113.21', 'cf-ray': 'isolated-qa' } : { origin: wire.origin }) };
  }
  async request(wire) {
    this.requests.push(wire);
    const response = await fetch(wire.url, { method: wire.method, headers: this.headers(wire), body: wire.method === 'POST' ? wire.body : undefined, redirect: 'manual' });
    return { status: response.status, body: await response.text(), cookie: response.headers.getSetCookie().join(';'), location: response.headers.get('location') || '' };
  }
  stream(wire, frame, state) {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(wire.url, { headers: this.headers(wire), signal: controller.signal, redirect: 'manual' });
        if (response.status !== 200) throw new Error('stream unauthorized');
        const reader = response.body.getReader(), parser = new SseParser(), decoder = new TextDecoder();
        for (;;) {
          const value = await reader.read(); if (value.done) break;
          for (const item of parser.push(decoder.decode(value.value, { stream: true }))) { state(true); frame(item); }
        }
      } catch { if (!controller.signal.aborted) state(false); }
    })();
    return { close() { controller.abort(); } };
  }
}
async function until(predicate, message) {
  for (let attempt = 0; attempt < 100; attempt++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 20)); }
  assert.fail(message);
}

test('native client pairs with unmodified upstream, resumes by origin-scoped credential, and receives durable SSE reply', async () => {
  const fixture = await createFixture(), secrets = new MemorySecrets(), transport = new NodeTransport();
  const client = new DshClient(transport, secrets);
  let stream;
  try {
    assert.deepEqual(await client.connect(ConnectionPolicy.parse(fixture.pairingUrl).target), { pinRequired: false, migrationUrl: '' });
    assert.match(secrets.values.get(fixture.base), /^dsh_mobile=[A-Za-z0-9_-]+$/);
    assert.equal([...secrets.values.values()].some(value => value.includes('token=')), false);
    assert.equal((await client.rpc('workspace.list')).items[0].workspaceId, 'qa-workspace');
    const session = (await client.rpc('session.list')).items[0];
    assert.equal(session.title, undefined, 'Fixture must match upstream projection-only title shape');
    assert.equal(session.projections.values.title, '二维码连接验收');
    const records = [];
    stream = client.stream('qa-session', value => {
      const frame = JSON.parse(value.data);
      if (value.event === 'snapshot') records.splice(0, records.length, ...frame.records);
      if (value.event === 'event') records.push(frame);
    }, () => {});
    await until(() => records.length > 0, 'SSE snapshot');
    await client.rpc('session.prompt', { sessionId: 'qa-session', mode: 'steer', content: [{ type: 'text', text: '原生中文流式验证' }], clientTimeZone: 'Asia/Shanghai' });
    await until(() => records.some(record => record.event?.type === 'turn/end'), 'SSE durable turn completion');
    const messages = ChatReducer.project(records);
    assert.equal(messages.running, false);
    assert.equal(messages.messages.filter(message => message.role === 'user').length, 1);
    assert.equal(messages.messages.at(-1).blocks[0].text, '流式兼容：收到「原生中文流式验证」。');
    assert.equal(messages.messages.at(-1).streaming, false, 'durable message replaces deltas');
    const resumed = new DshClient(new NodeTransport(), secrets);
    await resumed.connect(ConnectionPolicy.parse(fixture.base + '/', false).target);
    assert.equal((await resumed.status()).connected, true);
    assert.equal(transport.requests.filter(wire => wire.url.includes('/api/rpc')).every(wire => wire.cookie.startsWith('dsh_mobile=')), true);
  } finally { stream?.close(); await fixture.close(); }
});

test('native PIN flow preserves upstream validation and persists only the issued credential', async () => {
  const fixture = await createFixture(), secrets = new MemorySecrets();
  const client = new DshClient(new NodeTransport(true), secrets);
  try {
    assert.equal((await client.connect(ConnectionPolicy.parse(fixture.pairingUrl).target)).pinRequired, true);
    assert.equal(secrets.values.size, 0);
    await assert.rejects(client.verifyPin('000000'), /密码不正确/);
    await client.verifyPin('246810');
    assert.match(secrets.values.get(fixture.base), /^dsh_mobile=/);
    assert.equal(secrets.values.get(fixture.base).includes('246810'), false);
  } finally { await fixture.close(); }
});

test('native cross-origin migration stops before forwarding credentials or fetching the new URL', async () => {
  const secrets = new MemorySecrets(); await secrets.save('https://old.example', 'dsh_mobile=old_credential_1234567890');
  const requests = [];
  const transport = { async request(wire) { requests.push(wire); return { status: 302, body: '', cookie: '', location: 'https://new.example/pair?token=abcdefghijklmnopqrstuvwx' }; } };
  const client = new DshClient(transport, secrets);
  const result = await client.connect(ConnectionPolicy.parse('https://old.example/pair?token=abcdefghijklmnopqrstuvwx').target);
  assert.equal(result.migrationUrl.startsWith('https://new.example/'), true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].origin, 'https://old.example');
  assert.equal(secrets.values.has('https://new.example'), false);
});

test('late credential lookup cannot poison a newer origin after switching connections', async () => {
  let release;
  const secrets = new MemorySecrets();
  secrets.load = async origin => origin === 'https://old.example' ? await new Promise(resolve => { release = resolve; }) : 'dsh_mobile=new_credential_1234567890';
  const requests = [];
  const transport = { async request(wire) { requests.push(wire); return { status: 200, body: wire.url.endsWith('/api/status') ? '{"connected":true}' : '<html></html>', cookie: '', location: '' }; } };
  const client = new DshClient(transport, secrets);
  const old = client.connect(ConnectionPolicy.parse('https://old.example/', false).target);
  const rejectedOld = assert.rejects(old, /连接已切换/);
  await client.connect(ConnectionPolicy.parse('https://new.example/', false).target);
  release('dsh_mobile=old_credential_1234567890'); await rejectedOld; await client.status();
  assert.equal(requests.every(wire => wire.origin === 'https://new.example' && wire.cookie.includes('new_credential')), true);
});

test('SSE parser handles split CRLF, comments, multiline data and bounded frames', () => {
  const parser = new SseParser();
  const source = ': keepalive\r\nevent: snapshot\r\ndata: 第一行\r\ndata: 第二行\r\n\r\nevent: event\ndata: {"中文":"完整"}\n\n';
  const frames = [...source].flatMap(character => parser.push(character));
  assert.deepEqual(frames, [{ event: 'snapshot', data: '第一行\n第二行' }, { event: 'event', data: '{"中文":"完整"}' }]);
  assert.throws(() => parser.push('x'.repeat(4 * 1024 * 1024 + 1)), /过大/);
});

test('SSE limits count empty data lines and reset only after a complete frame', () => {
  const parser = new SseParser();
  for (let index = 0; index < 16384; index++) assert.deepEqual(parser.push('data:\n'), []);
  assert.throws(() => parser.push('data:\n'), /过大/);
  const reset = new SseParser();
  for (let index = 0; index < 20000; index++) assert.deepEqual(reset.push('data:\n\n'), [{ event: 'message', data: '' }]);
});

test('native projection keeps tool and reasoning blocks, streamed turns and errors', () => {
  const records = [
    { event: { type: 'turn/start' } },
    { event: { type: 'assistant/chunk', data: { turn: 1, step: 1, chunk: { type: 'reasoning-delta', text: '推理中' } } } },
    { event: { type: 'tool/call', data: { turn: 1, step: 1, callId: 'read-1', name: 'read_file', arguments: { path: 'test.txt' } } } },
    { event: { type: 'tool/result', data: { turn: 1, step: 1, message: { content: [{ type: 'tool-result', toolCallId: 'read-1', isError: true, content: [{ type: 'text', text: '文件不存在' }] }] } } } },
    { event: { type: 'turn/end' } }
  ];
  const value = ChatReducer.project(records);
  assert.equal(value.running, false);
  assert.equal(value.messages[0].blocks[0].kind, 'reasoning');
  assert.equal(value.messages[0].blocks[1].status, 'error');
  assert.match(value.messages[0].blocks[1].text, /文件不存在/);
});
