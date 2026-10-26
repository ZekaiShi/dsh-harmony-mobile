import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import * as sender from '../packages/desktop-sender/src/index.mjs';
import { createFixture } from './qa-fixture.mjs';
import { ChatReducer } from '../.cache/core/ChatReducer.mjs';

// Official services in an isolated, ignored directory; no live DSH profile.
const root = path.resolve(import.meta.dirname,'..'), deps = path.join(root,'.cache/sender-host/node_modules');
const load = name => import(pathToFileURL(path.join(deps,'@deepseek-ai',name,'lib/index.js')).href);
const { Context } = await load('cordis');
const { default: Commands } = await load('dsh-commands');
const { Session } = await load('dsh-session');
const ctx = new Context(), fixture = await createFixture();
let commandPlugin, senderPlugin;
try {
  commandPlugin = ctx.plugin(Commands); await commandPlugin.await();
  senderPlugin = ctx.plugin(sender); await senderPlugin.await();
  const agent = { session: Session.create('qa-sender') };
  assert.ok(ctx.commands.list(agent).some(c=>c.name==='harmony-send'));
  const text = '## 鸿蒙发送端验收\n\n仅包含虚构文字，没有付费模型调用。';
  const execution = await ctx.commands.execute(agent,'/harmony-send '+text,[],new AbortController().signal);
  assert.deepEqual(execution.result,{kind:'success',text});
  // Test inspection only: production sender never reads session history.
  const records = agent.session.snapshotEvents();
  assert.deepEqual(records.map(e=>e.type),['command/run','command/done']);
  assert.equal(records[0].data.args,undefined); assert.equal(records[1].data.text,text);
  fixture.senderEvents(records);
  const paired = await fetch(fixture.pairingUrl,{redirect:'manual'});
  const cookie = paired.headers.get('set-cookie').split(';')[0];
  const history = await fetch(fixture.base+'/api/rpc',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({method:'session.history',payload:{sessionId:'qa-session',maxMessages:1000}})});
  const envelope = await history.json(); assert.equal(envelope.ok,true);
  const projection = ChatReducer.project(envelope.value.events);
  assert.ok(projection.messages.some(m=>m.blocks.some(b=>b.text===text)));
  await senderPlugin.dispose();
  assert.ok(!ctx.commands.list(agent).some(c=>c.name==='harmony-send'));
  const versions = {};
  for (const name of ['cordis','dsh-commands','dsh-session']) versions[name]=JSON.parse(await readFile(path.join(deps,'@deepseek-ai',name,'package.json'),'utf8')).version;
  await mkdir(path.join(root,'reports'),{recursive:true});
  await writeFile(path.join(root,'reports/sender-host.json'),JSON.stringify({pass:true,versions,checked:['Real Cordis plugin lifecycle','Official command runtime and Session log','Unmodified upstream Desktop bridge','Native projection of selected text'],limitations:['Full DSH desktop UI not exercised','No delivery/read acknowledgement','No real public tunnel exercised']},null,2));
  console.log('Official sender service, bridge history and native rendering contract passed.',versions);
} finally { try { await senderPlugin?.dispose(); await commandPlugin?.dispose(); } finally { await fixture.close(); } }
