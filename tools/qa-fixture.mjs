// The phone bridge and HTML below are upstream code. Only the agent Host is
// synthetic: no user's DSH instance, model, account, files, or API key is used.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { WebSocketServer, WebSocket } from 'ws';
import { LanMobileBridge } from '../.research/compiled/src/main/mobile/lan-mobile-bridge.mjs';

export async function createFixture() {
  const renderingSample = await readFile(new URL('../tests/fixtures/dsh-markdown.md', import.meta.url),'utf8');
  const sessions = new Map();
  const clients = new Set();
  const calls = [];
  const answers = [];
  const workspace = { workspaceId: 'qa-workspace', title: '兼容性测试工作区', path: '/qa', sessionIds: ['qa-session'] };
  let nextSession = 1;
  let replyDelay = 100;
  let streamOpens = 0;
  const scheduled = new Map();
  let clock = Date.now();
  const initial = { sessionId: 'qa-session', projections: { values: { title: '二维码连接验收' } }, updatedAt: Date.now(), blank: false, agentPreset: 'standard', records: [] };
  initial.records.push({ seq: 1, event: { type: 'assistant/message', time: clock, data: { stepId: 'initial', message: { content: [{ type: 'text', text: '已打开上游手机页面。这是隔离测试回复。' }] } } } });
  sessions.set(initial.sessionId, initial);
  const summary = session => ({ ...session, records: undefined, running: false, projections: { asOfSeq: session.records.length, values: session.projections.values } });
  const snapshot = session => ({ type: 'snapshot', records: session.records, projections: { asOfSeq: session.records.length, values: session.projections.values } });
  const send = (client, value) => { if (client.socket.readyState === WebSocket.OPEN) client.socket.send(JSON.stringify({ type: 'item', streamId: client.streamId, value })); };
  const broadcastWorkspace = () => { for (const client of clients) if (client.endpoint === 'workspace/follow') send(client, { type: 'upsert', workspace }); };
  function emitRecord(session, type, data) {
    const record = { seq: session.records.length + 1, event: { type, time: ++clock, data } };
    session.records.push(record);
    for (const client of clients) if (client.sessionId === session.sessionId) send(client, record);
  }
  async function dispatch(method, args) {
    calls.push({ method, args });
    if (method === 'session/list') return { items: [...sessions.values()].map(summary) };
    if (method === 'agentPresets/list') return { items: [{ id: 'standard', name: '标准模式' }] };
    if (method === 'session/modelCatalog') return { groups: [], default: { provider: 'qa', model: 'fixture' } };
    if (method === 'session/page') return { records: sessions.get(args.request.address.sessionId)?.records || [], hasMore: false };
    if (method === 'session/create') {
      const sessionId = `qa-created-${nextSession++}`;
      sessions.set(sessionId, { sessionId, projections: { values: { title: '新建兼容会话' } }, updatedAt: Date.now(), blank: true, agentPreset: 'standard', records: [] });
      workspace.sessionIds.unshift(sessionId);
      broadcastWorkspace();
      return { sessionId, agentPreset: 'standard' };
    }
    if (method === 'session/prompt') {
      const request = args.request;
      const session = sessions.get(request.sessionId);
      const message = request.content?.find(item => item.type === 'text')?.text || '';
      session.blank = false;
      emitRecord(session, 'user/message', { message: { source: { kind: 'user' }, content: [{ type: 'text', text: message }] } });
      emitRecord(session, 'turn/start', {});
      const stepId = `step-${session.records.length}`;
      const chunkTimer = setTimeout(() => emitRecord(session, 'assistant/chunk', { stepId, chunk: { type: 'text-delta', index: 0, text: '流式兼容：' } }), 25);
      const resultTimer = setTimeout(() => {
        emitRecord(session, 'assistant/message', { stepId, message: { content: [{ type: 'text', text: '流式兼容：收到「' + message + '」。' }] } });
        emitRecord(session, 'turn/end', {});
      }, replyDelay);
      scheduled.set(session.sessionId, [chunkTimer, resultTimer]);
      return { accepted: true };
    }
    if (method === 'session/cancel') {
      const sessionId = args.request.sessionId;
      for (const timer of scheduled.get(sessionId) || []) clearTimeout(timer);
      emitRecord(sessions.get(sessionId), 'turn/end', {});
      return { accepted: true };
    }
    if (method === '$events/result') { answers.push(args); return { accepted: true }; }
    return {};
  }
  const harness = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    try {
      const envelope = body ? JSON.parse(body) : {};
      const result = await dispatch(envelope.method, envelope.payload?.args || {});
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ rpcId: envelope.rpcId, result: { ok: true, value: result } }));
    } catch (error) {
      response.writeHead(500); response.end(String(error));
    }
  });
  const mux = new WebSocketServer({ noServer: true });
  harness.on('upgrade', (request, socket, head) => mux.handleUpgrade(request, socket, head, ws => mux.emit('connection', ws)));
  mux.on('connection', socket => {
    socket.on('message', raw => {
      const frame = JSON.parse(raw.toString());
      if (frame.type !== 'open') return;
      const client = { socket, streamId: frame.streamId, endpoint: frame.endpoint, sessionId: frame.payload?.args?.request?.address?.sessionId };
      clients.add(client);
      if (frame.endpoint === 'workspace/follow') send(client, { type: 'baseline', value: { items: [workspace], archivedSessionIds: [] } });
      if (frame.endpoint === '$events') send(client, { type: 'ready', clientId: 'qa-generation' });
      if (frame.endpoint === 'session/follow') { streamOpens++; send(client, snapshot(sessions.get(client.sessionId))); }
    });
    socket.on('close', () => { for (const client of clients) if (client.socket === socket) clients.delete(client); });
  });
  await new Promise(resolve => harness.listen(0, '127.0.0.1', resolve));
  let pinState = { pin: '246810', pinConsent: true };
  const bridge = new LanMobileBridge({
    harnessUrl: () => `http://127.0.0.1:${harness.address().port}`,
    locale: 'zh',
    now: () => clock,
    pairingPinStore: { load: () => pinState, save: state => { pinState = state; return true; } }
  });
  const started = await bridge.start();
  // Observe only credential presence, never cookie/token values or query strings.
  const observedRequests = [];
  bridge.server.on('request', request => observedRequests.push({
    path: new URL(request.url, 'http://qa.local').pathname,
    hasCookie: /(?:^|;\s*)dsh_mobile=/.test(request.headers.cookie || '')
  }));
  const base = `http://127.0.0.1:${started.port}`;
  const token = new URL(started.pairingUrl).searchParams.get('token');
  return {
    bridge, base, pairingUrl: `${base}/pair?token=${token}`, calls, answers, observedRequests,
    senderEvents(events, sessionId = 'qa-session') {
      for (const event of events) emitRecord(sessions.get(sessionId), event.type, event.data);
    },
    setReplyDelay(ms) { replyDelay = ms; },
    rename(title, sessionId = 'qa-session') {
      sessions.get(sessionId).projections.values.title = title;
      for (const client of clients) if (client.sessionId === sessionId) client.socket.close();
    },
    longTable(sessionId = 'qa-session') {
      const session = sessions.get(sessionId); session.records = [];
      const text = '## 长表格验收\n\n| 步骤 | 对象 | 说明 |\n| --- | --- | --- |\n| P0 备份 | [package.json](./package.json) | 备份当前配置。 |\n| P0 删依赖 | [package.json:5](./package.json#L5)<br>原位置 | 删除失效依赖，并保留当前版本的备份。 |\n| P0 隔离 | `profiles\\web\\node_modules\\@deepseek-ai\\dsh-host-apiproxy` | 这是隔离测试的长内容：移出插件之后，重新安装依赖并检查启动日志，确认目录、配置、插件版本与实际加载状态一致。 |\n\n表格后的正文。';
      emitRecord(session, 'assistant/message', { stepId: 'long-table', message: { content: [{ type: 'text', text }] } });
      for (const client of clients) if (client.sessionId === sessionId) client.socket.close();
    },
    streamOpenCount() { return streamOpens; },
    activityShowcase(sessionId = 'qa-session') {
      const session = sessions.get(sessionId); session.records = [];
      emitRecord(session,'assistant/message',{stepId:'activity-intro',message:{content:[{type:'text',text:'我会检查相关代码，修改界面，再查看实际运行效果。'}]}});
      emitRecord(session,'turn/start',{});
      for (const [id,name,args] of [
        ['github','mcp__codex_apps__github_fetch',{url:'https://github.com/dataelement/dsh-desktop'}],
        ['edit','apply_patch',{input:'*** Begin Patch\n*** Update File: entry/src/main/ets/components/MarkdownView.ets\n@@\n- old\n+ new\n*** End Patch'}],
        ['image','view_image',{path:'/qa/native-markdown-bottom.png'}],
        ['search','search_files',{query:'MarkdownView'}],
        ['read','read_file',{path:'/qa/Index.ets'}],
        ['web','web_fetch',{url:'https://developer.huawei.com/consumer/cn/design/harmonyos-symbol/'}],
        ['unknown','custom_project_tool',{}],
        ['shell','pwsh',{command:'npm run build:hap'}]
      ]) {
        emitRecord(session,'tool/call',{stepId:'activity-steps',callId:id,name,arguments:args});
        if (id !== 'shell') emitRecord(session,'tool/result',{stepId:'activity-steps',message:{content:[{type:'tool-result',toolCallId:id,content:[{type:'text',text:'隔离测试输出：操作完成。'}]}]}});
      }
      for (const client of clients) if (client.sessionId === sessionId) client.socket.close();
    },
    completeActivity(sessionId = 'qa-session') {
      emitRecord(sessions.get(sessionId),'tool/result',{stepId:'activity-steps',message:{content:[{type:'tool-result',toolCallId:'shell',content:[{type:'text',text:'BUILD SUCCESSFUL'}]}]}});
      emitRecord(sessions.get(sessionId),'turn/end',{});
    },
    renderingSample(sessionId = 'qa-session', compact = false) {
      const session = sessions.get(sessionId); session.records = [];
      const text = compact ? '## 文件引用与表格\n\n[harness.log:645–646](../logs/harness.log#L645-L646)\n\n| 项目 | 结果 |\n| --- | --- |\n| 配对 | **通过** |\n| SSE | `online` |\n\n> 这是隔离验收数据。' : renderingSample;
      emitRecord(session,'assistant/message',{stepId:compact?'reference-table':'user-rendering-regression',message:{content:[{type:'text',text}]}});
      emitRecord(session,'turn/end',{});
      for (const client of clients) if (client.sessionId === sessionId) client.socket.close();
    },
    showcase(sessionId = 'qa-session') {
      const session = sessions.get(sessionId); session.records = [];
      emitRecord(session, 'user/message', { message: { source: { kind: 'user' }, content: [{ type: 'text', text: '检查项目的连接流程。' }] } });
      emitRecord(session, 'assistant/message', { stepId: 'inspection', message: { content: [{ type: 'reasoning', text: '先检查配对入口和凭据隔离，再验证流式消息和断线重连。' }] } });
      for (const [id, name, command, output] of [['one','pwsh','npm run check','15 项检查通过'],['two','pwsh','npm run lint:native','0 errors, 0 warnings']]) {
        emitRecord(session,'tool/call',{stepId:'inspection',callId:id,name,arguments:{command}});
        emitRecord(session,'tool/result',{stepId:'inspection',message:{content:[{type:'tool-result',toolCallId:id,content:[{type:'text',text:output}]}]}});
      }
      emitRecord(session,'assistant/message',{stepId:'summary',message:{content:[{type:'text',text:'连接流程已检查，现有二维码可继续使用。\n\n### 验证结果\n- **配对与会话**：通过。\n- **实时消息**：通过。\n\n```sh\nnpm run check\n```'}]}});
      emitRecord(session,'turn/end',{});
      // Force a fresh snapshot so a shortened showcase replaces the prior history.
      for (const client of clients) if (client.sessionId === sessionId) client.socket.close();
    },
    expirePairing() { clock += 6 * 60_000; },
    requestQuestion(sessionId = 'qa-session') {
      for (const client of clients) if (client.endpoint === '$events') send(client, {
        type: 'waterfall', event: 'user-questions/request', eventId: 'qa-question', agentId: sessionId,
        request: { questions: [{ id: 'qa-choice', question: '是否继续兼容性测试？', header: '确认', options: [{ label: '继续', description: '仅测试隔离数据' }, { label: '停止', description: '停止本轮测试' }] }] }
      });
    },
    closeStreams() { for (const client of clients) if (client.sessionId) client.socket.close(); },
    async close() {
      for (const timers of scheduled.values()) for (const timer of timers) clearTimeout(timer);
      await bridge.stop();
      for (const socket of mux.clients) socket.terminate();
      await new Promise(resolve => mux.close(resolve));
      harness.closeAllConnections();
      await new Promise(resolve => harness.close(resolve));
    }
  };
}
