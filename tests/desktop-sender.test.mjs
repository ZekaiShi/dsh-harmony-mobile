import test from 'node:test';
import assert from 'node:assert/strict';
import { apply, sendText, MAX_BYTES } from '../packages/desktop-sender/src/index.mjs';
import { ChatReducer } from '../.cache/core/ChatReducer.mjs';

test('sender registers a human-only command and disposes it with the plugin', () => {
  let command, disposed = false, lifecycle;
  apply({ commands: { register(value) { command = value; return () => { disposed = true; }; } }, on(event, fn) { assert.equal(event,'dispose'); lifecycle = fn; } });
  assert.equal(command.name,'harmony-send'); assert.equal(command.recordInput,false); assert.equal(command.input.attachments,false);
  lifecycle(); assert.equal(disposed,true);
});
test('sender returns only explicitly selected bounded text to the official command log', () => {
  const result = sendText({rawInput:'  ## 手机内容\n\n正文  '});
  assert.deepEqual(result,{kind:'success',text:'## 手机内容\n\n正文'});
  assert.equal(sendText({rawInput:'中'.repeat(MAX_BYTES)}).kind,'error');
  assert.equal(sendText({rawInput:' '}).kind,'error');
  assert.equal(sendText({rawInput:'x',signal:AbortSignal.abort()}).kind,'error');
  assert.equal(sendText({rawInput:'x',attachments:[{}]}).kind,'error');
});
test('native sender event displays as a separate complete message and never changes a live model step', () => {
  const events = [
    {seq:1,event:{type:'assistant/chunk',data:{stepId:'model',chunk:{type:'text-delta',text:'原回复'}}}},
    {seq:2,event:{type:'command/run',data:{name:'harmony-send',commandId:'cmd-1'}}},
    {seq:3,event:{type:'command/done',data:{commandId:'cmd-1',kind:'success',text:'手机文字'}}},
    {seq:3,event:{type:'assistant/message',data:{stepId:'model',message:{content:[{type:'text',text:'完整原回复'}]}}}},
    {seq:4,event:{type:'command/done',data:{commandId:'unknown',kind:'success',text:'无对应命令'}}},
  ];
  const projection = ChatReducer.project(events);
  assert.deepEqual(projection.messages.map(m => m.blocks[0].text),['完整原回复','手机文字']);
  assert.equal(projection.messages[1].streaming,false); assert.equal(projection.running,false);
});
