import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createModelFixture } from './model-fixture.mjs';

const root=path.resolve(import.meta.dirname,'..');
const hdc=process.env.HDC_PATH||'D:/DevEco Studio/sdk/default/openharmony/toolchains/hdc.exe';
const target=process.env.HDC_TARGET||'127.0.0.1:5555';
const cache=path.join(root,'.cache/assistant-qa');
await mkdir(cache,{recursive:true});
await mkdir(path.join(root,'reports/screenshots'),{recursive:true});
const run=(...args)=>execFileSync(hdc,['-t',target,...args],{encoding:'utf8',windowsHide:true,timeout:15000});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const flatten=node=>[node.attributes,...(node.children||[]).flatMap(flatten)];
async function layout(){
  run('shell','uitest','dumpLayout','-p','/data/local/tmp/assistant-qa.json','-b','com.szk.dshconnect');
  run('file','recv','/data/local/tmp/assistant-qa.json',path.join(cache,'layout.json'));
  return flatten(JSON.parse(await readFile(path.join(cache,'layout.json'),'utf8')));
}
function point(node){assert.ok(node,'Native control exists');const v=node.bounds.match(/\d+/g).map(Number);return[String(Math.round((v[0]+v[2])/2)),String(Math.round((v[1]+v[3])/2))];}
const find=(nodes,value)=>nodes.find(n=>n?.id===value||n?.text===value);
const has=value=>nodes=>!!find(nodes,value);
async function waitFor(predicate,message,timeout=15000){const start=Date.now();while(Date.now()-start<timeout){const nodes=await layout();if(predicate(nodes))return nodes;await pause(200);}throw new Error(message);}
async function click(value){const nodes=await layout();const node=find(nodes,value);assert.ok(node,'Missing control: '+value);run('shell','uitest','uiInput','click',...point(node));await pause(130);}
async function reveal(value){
  for(let i=0;i<6;i++){
    const nodes=await layout();const node=find(nodes,value);
    if(node){const v=node.bounds.match(/\d+/g).map(Number);if(v[1]>=320&&v[3]<=2640)return;}
    run('shell','uitest','uiInput','swipe','650','2080','650','750','650');await pause(170);
  }
  assert.fail('Control did not scroll into view: '+value);
}
async function input(id,text){
  await reveal(id);await click(id);
  run('shell','uitest','uiInput','keyEvent','2072','2017');
  run('shell','uitest','uiInput','keyEvent','2055');
  if(text)run('shell','uitest','uiInput','text',text);
  await pause(120);run('shell','uitest','uiInput','keyEvent','Back');await pause(450);
}
async function screenshot(name){run('shell','uitest','screenCap','-p','/data/local/tmp/assistant-qa.png');run('file','recv','/data/local/tmp/assistant-qa.png',path.join(root,'reports/screenshots',name));}
async function restart(){run('shell','aa','force-stop','com.szk.dshconnect');run('shell','aa','start','-a','EntryAbility','-b','com.szk.dshconnect');await waitFor(has('open-assistant'),'Workbench missing');await click('open-assistant');await waitFor(has('assistant-settings'),'Assistant missing');}
const fixture=await createModelFixture();
const base=fixture.base.replace('127.0.0.1','10.0.2.2');
const tag='QA-'+Date.now();
const ownedTitles=new Set();
const report={checkedAt:new Date().toISOString(),version:'0.4.0',target,pass:false,fixture:'Isolated local Chat Completions endpoint with a fake API key. No paid model calls or live DSH session.',checked:[],limitations:['Physical device NOT_RUN','Real public HTTPS provider NOT_RUN','No paid model called']};
report.testTag=tag;
report.version=JSON.parse(await readFile(path.join(root,'package.json'),'utf8')).version;
function check(label){report.checked.push(label);console.log('PASS: '+label);}
async function configure(route='/v1',model='qa-model'){
  await click('assistant-settings');
  await input('model-name','隔离验收模型');
  await input('model-base',base.replace('/v1',route));
  await input('model-id',model);
  await input('model-key',fixture.key);
  await input('model-system','用中文回答。');
  await reveal('保存模型配置');await click('保存模型配置');
  await waitFor(has('assistant-new'),'Model settings did not close');
}
async function send(text){await input('assistant-draft',text);await click('assistant-send');}
async function done(){await waitFor(nodes=>has('assistant-send')(nodes)&&nodes.some(n=>n?.text==='重新生成'),'Reply did not complete');}
async function rename(title){await click('重命名');await input('conversation-title',title);await click('保存名称');await waitFor(has(title),'Conversation header did not update');ownedTitles.add(title);}
async function removeOwned(title){
  const nodes=await layout();const row=nodes.find(n=>n?.text===title);if(!row)return;
  const y=Number(row.bounds.match(/\d+/g)[1]);
  const button=nodes.filter(n=>n?.id?.startsWith('delete-conversation-')).sort((a,b)=>Math.abs(Number(a.bounds.match(/\d+/g)[1])-y)-Math.abs(Number(b.bounds.match(/\d+/g)[1])-y))[0];
  assert.ok(button,'Owned conversation delete button exists');run('shell','uitest','uiInput','click',...point(button));await waitFor(has('删除本机对话'),'Delete confirmation missing');await click('删除');
  await waitFor(nodes=>!has(title)(nodes),'Conversation was not deleted');
}
try{
  run('shell','aa','force-stop','com.szk.dshconnect');run('shell','aa','start','-a','EntryAbility','-b','com.szk.dshconnect');
  await waitFor(has('open-assistant'),'Workbench missing');await screenshot('native-workbench.png');
  await click('open-experience');await click('hand-left');await click('experience-back');
  await click('open-assistant');await waitFor(has('assistant-settings'),'Assistant page missing');
  const initial=await layout();
  if(!has('配置模型')(initial)&&!initial.some(n=>n?.text?.includes('qa-model')||n?.text?.includes('隔离验收模型')))throw new Error('Existing user model configuration detected; automated test stopped before overwriting it.');
  assert.ok(!initial.some(n=>n?.type==='Web'),'No Web surface');if(has('配置模型')(initial))await screenshot('assistant-welcome.png');
  let staleTag=process.env.STALE_ASSISTANT_QA_TITLE;
  if(!staleTag){try{staleTag=JSON.parse(await readFile(path.join(root,'reports/assistant-emulator.json'),'utf8')).testTag;}catch{}}
  if(staleTag&&/^QA-\d+$/.test(staleTag))for(const title of [staleTag,staleTag+'-auth',staleTag+'-redirect'])await removeOwned(title);
  check('Native two-mode workbench and standalone entry without a desktop connection');
  await configure();assert.equal(fixture.requests.length,0);
  check('Saving model URL, model ID, system instruction and Asset Store key makes no model request');
  await click('assistant-new');await waitFor(has('assistant-draft'),'New local chat missing');
  assert.ok(Number(point(find(await layout(),'assistant-send'))[0])<400,'Assistant send follows left-hand layout');
  check('Standalone composer follows the selected holding side');
  await click('assistant-draft');run('shell','uitest','uiInput','text','keyboard-draft');await pause(500);
  const keyboardBottom=Number(find(await layout(),'assistant-draft').bounds.match(/\d+/g)[3]);
  await click('有什么想一起完成的？');await pause(550);
  const hiddenDraft=find(await layout(),'assistant-draft');assert.equal(hiddenDraft.text,'keyboard-draft');
  assert.ok(Number(hiddenDraft.bounds.match(/\d+/g)[3])>keyboardBottom+400,'Assistant body tap hides keyboard');
  await click('assistant-draft');await pause(500);assert.ok(Number(find(await layout(),'assistant-draft').bounds.match(/\d+/g)[3])<keyboardBottom+100,'Assistant composer refocus restores keyboard');
  run('shell','uitest','uiInput','click','600','700');await pause(500);
  check('Assistant body and blank-area taps dismiss keyboard without losing draft or refocus');
  const prompt=tag+' 独立聊天';ownedTitles.add(prompt.slice(0,24));
  await send(prompt);await done();await waitFor(has('独立聊天已就绪'),'Streamed Markdown missing');
  assert.equal(fixture.requests.length,1);const first=fixture.requests[0];assert.ok(first.authorized);assert.equal(first.path,'/v1/chat/completions');assert.equal(first.body.model,'qa-model');assert.equal(first.body.messages[0].content,'用中文回答。');assert.equal(first.hasCookie,false);assert.equal(first.hasOrigin,false);
  check('Native POST sends the selected model, system instruction and Bearer key without DSH Cookie or Origin');
  check('Streaming Markdown reply completes and restores the send button');
  await click('思考过程');await waitFor(has('检查当前请求格式。'),'Reasoning detail missing');await screenshot('assistant-chat.png');await click('思考过程');
  check('Reasoning details expand independently of the final answer');
  await rename(tag);await click('复制会话');await screenshot('assistant-renamed.png');
  check('Rename updates the native header; full conversation copy action exercised');
  await send('继续验收');await done();assert.equal(fixture.requests.at(-1).body.messages.length,4);assert.ok(fixture.requests.at(-1).body.messages.some(m=>m.role==='assistant'));assert.ok(!JSON.stringify(fixture.requests.at(-1).body).includes('检查当前请求格式。'));
  check('Follow-up sends prior completed messages and excludes reasoning text');
  fixture.setDelay(120000);const canceledBefore=fixture.canceled;
  await send('中断验收');await waitFor(has('assistant-stop'),'Stop button missing');await waitFor(()=>fixture.requests.length>=3,'Stop request did not arrive');await click('assistant-stop');await waitFor(has('assistant-send'),'Stop did not restore composer');
  await waitFor(()=>fixture.canceled>canceledBefore,'Stop did not close the network request');
  check('Stop closes the native network request and leaves the conversation usable');
  fixture.setDelay(100);await click('重新生成');await done();assert.equal(fixture.requests.at(-1).body.messages.filter(m=>m.role==='user').length,3);
  check('Regenerate reuses the preceding user turn without adding duplicate user messages');
  await input('assistant-draft','离线草稿 '+tag);await click('assistant-back');await waitFor(has(tag),'History row missing');await screenshot('assistant-history.png');
  await restart();await click(tag);await waitFor(nodes=>nodes.some(n=>n?.id==='assistant-draft'&&n.text==='离线草稿 '+tag),'Draft did not survive restart');
  check('Private history, renamed title and unsent draft survive process restart');
  await send('重启后密钥恢复');await done();assert.ok(fixture.requests.at(-1).authorized);
  check('API key is restored from Asset Store after process restart');
  await click('assistant-back');
  // Change only the default profile. Reopening the original chat must retain its model.
  await configure('/unauthorized','qa-model-error');await click(tag);await send('原模型保持');await done();assert.equal(fixture.requests.at(-1).path,'/v1/chat/completions');assert.equal(fixture.requests.at(-1).body.model,'qa-model');
  check('Changing the default does not redirect an existing conversation to a different API or model');
  await click('assistant-back');await click('assistant-new');await rename(tag+'-auth');await send('授权失败');await waitFor(nodes=>nodes.some(n=>n?.text?.includes('拒绝了授权'))&&has('assistant-send')(nodes),'401 error not shown');
  check('HTTP 401 shows an actionable error and restores the composer');
  await screenshot('assistant-auth-error.png');await click('assistant-back');
  await configure('/redirect');await click('assistant-new');await rename(tag+'-redirect');await send('重定向验收');await waitFor(nodes=>nodes.some(n=>n?.text?.includes('重定向')||n?.text?.includes('无法连接模型服务'))&&has('assistant-send')(nodes),'Redirect did not fail safely');assert.equal(fixture.trapRequests,0);
  check('Native HTTP does not follow redirects or forward the key to another endpoint');await click('assistant-back');
  await fixture.close();
  await restart();await input('assistant-search','重启后密钥恢复');await waitFor(has(tag),'Offline body search failed');assert.ok(!has(tag+'-auth')(await layout()));await screenshot('assistant-offline-search.png');
  await click(tag);await waitFor(nodes=>nodes.some(n=>n?.text?.includes('收到：原模型保持')),'Offline history not readable');
  check('History and body search work after the model server is shut down');await click('assistant-back');await input('assistant-search','');
  for(const title of [tag,tag+'-auth',tag+'-redirect'])await removeOwned(title);
  check('Only fixture-owned conversations are deleted with native confirmation');
  await click('数据与隐私');await waitFor(nodes=>nodes.some(n=>n?.text?.includes('应用私有目录')),'Data explanation missing');await screenshot('assistant-privacy.png');await click('assistant-back');
  check('In-app data explanation identifies model requests, local history, key storage and desktop isolation');
  await click('assistant-settings');await reveal('删除当前服务密钥');await click('删除当前服务密钥');await waitFor(nodes=>!has('删除当前服务密钥')(nodes),'Key delete did not update settings');await reveal('清除默认配置');await click('清除默认配置');await waitFor(has('清除默认模型配置'),'Profile reset confirmation missing');await click('清除配置');await waitFor(has('配置模型'),'Default profile was not cleared');
  check('Delete current API key and reset default settings without deleting other histories');
  await click('assistant-back');await waitFor(has('open-assistant'),'Did not return to workbench');
  await click('open-experience');await click('hand-auto');await pause(500);
  report.holdingStatus=find(await layout(),'holding-status').text;
  await click('experience-back');
  report.pass=true;
}catch(error){report.error=error.message;try{await screenshot('assistant-test-failure.png');}catch{}process.exitCode=1;}
finally{
  report.requestCount=fixture.requests.length;report.redirectTargetRequests=fixture.trapRequests;report.canceledRequests=fixture.canceled;
  // Metadata and request shapes only; never serialize authorization values.
  report.requests=fixture.requests.map(r=>({path:r.path,model:r.body.model,messages:r.body.messages?.length,authorized:r.authorized,hasCookie:r.hasCookie,hasOrigin:r.hasOrigin}));
  await writeFile(path.join(root,'reports/assistant-emulator.json'),JSON.stringify(report,null,2)+'\n');
  await fixture.close();
}
console.log(JSON.stringify(report,null,2));
