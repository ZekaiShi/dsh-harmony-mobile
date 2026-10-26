import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatReducer } from '../.cache/core/ChatReducer.mjs';
import { ChatActivity } from '../.cache/core/ChatActivity.mjs';

test('first-class tool results close the original call across steps without orphan generic rows', () => {
 const events=[
  {type:'tool/call',data:{turn:1,step:1,callId:'shell',name:'pwsh',arguments:'{"command":"echo synthetic"}'}},
  {type:'tool/result',data:{turn:1,step:2,message:{role:'tool',toolCallId:'shell',content:[{type:'text',text:'仅有折叠详情'}]}}},
 ];
 const messages=ChatReducer.project(events).messages;
 assert.equal(messages.length,1);assert.equal(messages[0].blocks.length,1);
 const block=messages[0].blocks[0];assert.equal(block.status,'done');assert.equal(block.name,'pwsh');assert.equal(block.summary,'echo synthetic');assert.match(block.text,/仅有折叠详情/);
});
test('completed calls stay completed when the canonical assistant message arrives later', () => {
 const events=[
  {type:'tool/call',data:{turn:1,step:1,callId:'agent',name:'spawn_agent',arguments:{task:'synthetic'}}},
  {type:'tool/result',data:{turn:1,step:1,message:{toolCallId:'agent',isError:true,content:[{type:'text',text:'错误详情'}]}}},
  {type:'assistant/message',data:{turn:1,step:1,message:{content:[{type:'tool-call',id:'agent',name:'spawn_agent',arguments:'{}'}]}}},
 ];
 const block=ChatReducer.project(events).messages[0].blocks[0];assert.equal(block.status,'error');assert.equal(block.category,'agent');assert.match(block.text,/错误详情/);
});
test('contiguous activity across assistant steps is one default disclosure without hiding answers', () => {
 const events=[
  {type:'assistant/message',data:{stepId:'intro',message:{content:[{type:'text',text:'正常回复'}]}}},
  {type:'assistant/message',data:{stepId:'a',message:{content:[{type:'reasoning',text:'思考详情'}]}}},
  ...['spawn_agent','custom_unknown_tool','read_file'].flatMap((name,i)=>[
   {type:'tool/call',data:{stepId:'tool-'+i,callId:'call-'+i,name,arguments:{}}},
   {type:'tool/result',data:{stepId:'result-'+i,message:{toolCallId:'call-'+i,content:[{type:'text',text:'详情'+i}]}}},
  ]),
  {type:'assistant/message',data:{stepId:'final',message:{content:[{type:'text',text:'最终答案'}]}}},
 ];
 const canonical=ChatReducer.project(events).messages, before=JSON.stringify(canonical), rows=ChatActivity.project(canonical);
 assert.equal(rows.length,3);assert.equal(rows[0].blocks[0].text,'正常回复');assert.equal(rows[2].blocks[0].text,'最终答案');
 const group=rows[1].blocks[0];assert.equal(group.kind,'activity');assert.equal(group.children.length,4);assert.equal(ChatActivity.label(group),'思考与调用 · 3');
 assert.equal(new Set(group.children.map(b=>b.key)).size,4);assert.equal(JSON.stringify(canonical),before);
});
test('turn boundaries settle missing results honestly; user messages separate groups; zero seq is stable', () => {
 const events=[
  {seq:0,type:'user/message',data:{message:{source:{kind:'user'},content:[{type:'text',text:'问题'}]}}},
  {type:'tool/call',data:{turn:1,step:1,callId:'x',name:'unknown',arguments:{}}},
  {type:'turn/end'},
 ];
 const blocks=ChatReducer.project(events).messages[1].blocks;assert.equal(blocks[0].status,'ended');
 const first=ChatActivity.project(ChatReducer.project(events).messages)[0];assert.equal(first.role,'user');assert.equal(first.id,'user-0');
});
test('uncorrelated tool results retain unique disclosure keys and never leak into normal answer text', () => {
 const events=[
  {type:'tool/result',data:{stepId:'orphan',message:{content:[{type:'text',text:'第一段工具输出'}]}}},
  {type:'tool/result',data:{stepId:'orphan',message:{content:[{type:'text',text:'第二段工具输出'}]}}},
 ];
 const rows=ChatActivity.project(ChatReducer.project(events).messages),group=rows[0].blocks[0];
 assert.equal(group.kind,'activity');assert.equal(group.children.length,2);assert.notEqual(group.children[0].key,group.children[1].key);
 assert.deepEqual(group.children.map(b=>b.status),['done','done']);
});
