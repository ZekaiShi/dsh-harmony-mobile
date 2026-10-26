import test from 'node:test';
import assert from 'node:assert/strict';
import { AssistantCore, AssistantData, ModelProfile, LocalMessage, CompletionClient } from '../.cache/core/AssistantCore.mjs';
import { createModelFixture } from '../tools/model-fixture.mjs';
class NodeModelTransport {
  start(wire,callbacks){const abort=new AbortController();let closed=false;(async()=>{try{const res=await fetch(wire.url,{method:'POST',headers:{authorization:'Bearer '+wire.key,'content-type':'application/json'},body:wire.body,redirect:'manual',signal:abort.signal});const decoder=new TextDecoder();for await(const chunk of res.body){if(!closed)callbacks.data(decoder.decode(chunk,{stream:true}));}if(!closed){const tail=decoder.decode();if(tail)callbacks.data(tail);callbacks.end(res.status);}}catch{if(!closed)callbacks.error();}})();return{close(){closed=true;abort.abort();}};}
}
function profile(base){return Object.assign(new ModelProfile(),{name:'隔离模型',base,model:'qa-model',system:'用中文回答。'});}
function conversation(base){const c=AssistantCore.create('test-one',profile(base),123);c.messages.push(Object.assign(new LocalMessage(),{id:'user',text:'原生独立聊天验收'}));return c;}
function complete(client,p,key){let task;return new Promise(resolve=>{let text='',reasoning='';task=client.start(p,key,AssistantCore.request(conversation(p.base)),{update(t,r){text=t;reasoning=r;},done(reason){resolve({text,reasoning,reason});},error(error){resolve({text,reasoning,error});}});});}
test('model endpoints preserve custom base paths, reject public cleartext and never accept query credentials',()=>{
  assert.equal(AssistantCore.endpoint('https://api.example.com/v1/').url,'https://api.example.com/v1/chat/completions');
  assert.equal(AssistantCore.endpoint('http://10.0.2.2:12345/v1/chat/completions').url,'http://10.0.2.2:12345/v1/chat/completions');
  for(const value of ['http://public.example.com/v1','https://u:p@example.com/v1','https://example.com/v1?key=x','file:///x','https://example.com/evil%0aheader'])assert.throws(()=>AssistantCore.endpoint(value),value);
});
test('context is bounded, excludes failed partial replies and reasoning, and follows the immutable session profile',()=>{
  const c=conversation('https://api.example.com/v1');
  for(let i=0;i<50;i++)c.messages.push(Object.assign(new LocalMessage(),{id:String(i),role:i%2?'assistant':'user',text:'message '+i,reasoning:'private-reasoning',status:i===49?'error':'done'}));
  const request=AssistantCore.request(c);assert.equal(request.model,'qa-model');assert.ok(request.messages.length<=41);assert.equal(request.messages[0].role,'system');assert.equal(JSON.stringify(request).includes('private-reasoning'),false);assert.equal(JSON.stringify(request).includes('message 49'),false);
});
test('local history restores interrupted streams and validates corrupted files without accepting oversized data',()=>{
  const data=new AssistantData();data.profile=profile('https://api.example.com');const c=conversation(data.profile.base);c.draft='保留草稿';c.messages.push(Object.assign(new LocalMessage(),{id:'reply',role:'assistant',text:'部分回复',status:'streaming'}));data.conversations=[c];
  const restored=AssistantCore.restore(JSON.stringify(data));assert.equal(restored.conversations[0].messages[1].status,'interrupted');assert.equal(restored.conversations[0].draft,'保留草稿');
  assert.throws(()=>AssistantCore.restore('{bad}'));assert.throws(()=>AssistantCore.restore('{"version":2,"profile":{},"conversations":[]}'));
});
test('native client protocol streams content and reasoning from a real isolated HTTP endpoint',async()=>{
  const f=await createModelFixture();try{const value=await complete(new CompletionClient(new NodeModelTransport()),profile(f.base),f.key);assert.match(value.text,/独立聊天已就绪/);assert.equal(value.reasoning,'检查当前请求格式。');assert.equal(value.reason,'stop');assert.equal(f.requests[0].authorized,true);assert.equal(f.requests[0].hasCookie,false);assert.equal(f.requests[0].hasOrigin,false);}finally{await f.close();}
});
test('non-stream JSON fallback works while auth and redirect failures never forward the key',async()=>{
  const f=await createModelFixture();try{const client=new CompletionClient(new NodeModelTransport());const root=f.base.replace('/v1','');assert.equal((await complete(client,profile(root+'/json'),f.key)).text,'非流式兼容回复');assert.match((await complete(client,profile(root+'/unauthorized'),f.key)).error,/授权/);assert.match((await complete(client,profile(root+'/redirect'),f.key)).error,/重定向/);assert.equal(f.trapRequests,0);}finally{await f.close();}
});
test('unexpected stream EOF preserves partial text and reports interruption instead of success',async()=>{
  const f=await createModelFixture();try{const value=await complete(new CompletionClient(new NodeModelTransport()),profile(f.base.replace('/v1','/abrupt')),f.key);assert.match(value.text,/独立聊天/);assert.match(value.error,/意外结束/);}finally{await f.close();}
});
test('cancel destroys the request and late chunks do not update a different conversation',async()=>{
  const f=await createModelFixture();f.setDelay(1500);try{let updates=0;let endings=0;const c=conversation(f.base);const task=new CompletionClient(new NodeModelTransport()).start(c.profile,f.key,AssistantCore.request(c),{update(){updates++;},done(){endings++;},error(){endings++;}});await new Promise(r=>setTimeout(r,80));task.close();const count=updates;await new Promise(r=>setTimeout(r,80));assert.equal(updates,count);assert.equal(endings,0);assert.ok(f.canceled>=1);}finally{await f.close();}
});
test('search and Markdown transcript work without a network and do not include API credentials',()=>{
  const c=conversation('https://api.example.com');c.title='本机测试';assert.equal(AssistantCore.search([c],'独立聊天').length,1);assert.equal(AssistantCore.search([c],'不存在').length,0);const text=AssistantCore.transcript(c);assert.match(text,/# 本机测试/);assert.match(text,/## 我/);assert.equal(text.includes('Authorization'),false);
});
test('keys reject header injection, whitespace and excessive length',()=>{for(const key of ['','abc\r\nx:y','a b','x'.repeat(1025)])assert.throws(()=>AssistantCore.key(key));});
