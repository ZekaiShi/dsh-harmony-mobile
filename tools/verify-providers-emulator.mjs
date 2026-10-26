import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { AssistantCore, ModelProfile } from '../.cache/core/AssistantCore.mjs';
import { createProviderFixture } from './provider-fixture.mjs';
import { createMediaFixture } from './media-fixture.mjs';

const root=path.resolve(import.meta.dirname,'..');
const hdc=process.env.HDC_PATH||'D:/DevEco Studio/sdk/default/openharmony/toolchains/hdc.exe';
const target=process.env.HDC_TARGET||'127.0.0.1:5555';
const cache=path.join(root,'.cache/provider-qa');
await mkdir(cache,{recursive:true});
await mkdir(path.join(root,'reports/screenshots'),{recursive:true});
const run=(...args)=>execFileSync(hdc,['-t',target,...args],{encoding:'utf8',windowsHide:true,timeout:15000});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const flatten=node=>[node.attributes,...(node.children||[]).flatMap(flatten)];
async function layout(){
  run('shell','uitest','dumpLayout','-p','/data/local/tmp/provider-qa.json','-b','com.szk.dshconnect');
  run('file','recv','/data/local/tmp/provider-qa.json',path.join(cache,'layout.json'));
  return flatten(JSON.parse(await readFile(path.join(cache,'layout.json'),'utf8')));
}
function point(node){assert.ok(node,'Native control exists');const v=node.bounds.match(/\d+/g).map(Number);return[String(Math.round((v[0]+v[2])/2)),String(Math.round((v[1]+v[3])/2))];}
const find=(nodes,value)=>nodes.find(n=>n?.id===value)||nodes.find(n=>n?.text===value&&!['TextInput','TextArea'].includes(n?.type));
const has=value=>nodes=>!!find(nodes,value);
async function waitFor(predicate,message,timeout=15000){const start=Date.now();while(Date.now()-start<timeout){const nodes=await layout();if(predicate(nodes))return nodes;await pause(200);}throw new Error(message);}
async function click(value){const nodes=await layout();const node=find(nodes,value);assert.ok(node,'Missing control: '+value);run('shell','uitest','uiInput','click',...point(node));await pause(400);}
async function reveal(value){
  for(let i=0;i<6;i++){
    const nodes=await layout();const node=find(nodes,value);
    if(node){const v=node.bounds.match(/\d+/g).map(Number);if(v[1]>=320&&v[3]<=2665)return node;
      if(v[3]>0&&v[1]<320){run('shell','uitest','uiInput','swipe','650','750','650','2080','650');await pause(450);continue;}}
    run('shell','uitest','uiInput','swipe','650','2080','650','750','650');await pause(450);
  }
  assert.fail('Control did not scroll into view: '+value);
}
async function input(id,text){
  const node=await reveal(id);run('shell','uitest','uiInput','click',...point(node));await pause(130);
  run('shell','uitest','uiInput','keyEvent','2072','2017');
  run('shell','uitest','uiInput','keyEvent','2055');
  if(text)run('shell','uitest','uiInput','text',text);
  await pause(120);run('shell','uitest','uiInput','keyEvent','Back');await pause(450);
}
async function screenshot(name){run('shell','uitest','screenCap','-p','/data/local/tmp/provider-qa.png');run('file','recv','/data/local/tmp/provider-qa.png',path.join(root,'reports/screenshots',name));}
async function restart(){run('shell','aa','force-stop','com.szk.dshconnect');run('shell','aa','start','-a','EntryAbility','-b','com.szk.dshconnect');await waitFor(has('open-assistant'),'Workbench missing');await click('open-assistant');await waitFor(has('assistant-settings'),'Assistant missing');}
const fixture=await createProviderFixture();const media=await createMediaFixture();
const base=fixture.base.replace('127.0.0.1','10.0.2.2');const imageBase=media.base.replace('127.0.0.1','10.0.2.2');
const previous=process.argv.includes('--resume-history')?JSON.parse(await readFile(path.join(root,'reports/providers-emulator.json'),'utf8')):null;
const tag=previous?.testTag||'QA-PROVIDERS-'+Date.now();const titles=previous?['anthropic','openai','gemini'].map(id=>tag+'-'+id):[];
const report={checkedAt:new Date().toISOString(),version:JSON.parse(await readFile(path.join(root,'package.json'),'utf8')).version,target,testTag:tag,pass:false,checked:[],limitations:['Isolated API fixtures and fake keys only; real services, paid inference and physical devices NOT_RUN']};
if(previous){assert.equal(previous.version,report.version);assert.ok(previous.checked.length>=11);report.checked=previous.checked.slice();report.resumedFromCheckedAt=previous.checkedAt;}
const check=label=>{report.checked.push(label);console.log('PASS: '+label);};
async function top(){for(let i=0;i<2;i++){run('shell','uitest','uiInput','swipe','650','650','650','2250','450');await pause(400);}}
async function choose(id){await waitFor(has('model-provider'),'Settings missing before choosing provider');await top();await click('model-provider');await waitFor(has('provider-silicon'),'Provider catalogue did not open');await top();await reveal('provider-'+id);await click('provider-'+id);await waitFor(has('model-base'),'Preset did not return to settings');}
async function save(){await reveal('保存模型配置');await pause(400);await click('保存模型配置');await waitFor(has('assistant-new'),'Provider config did not save');}
async function erase(title){await input('assistant-search',title);const nodes=await layout();if(!find(nodes,title)){await input('assistant-search','');return;}const y=point(find(nodes,title))[1];const row=nodes.find(n=>n?.id?.startsWith('delete-conversation-')&&Math.abs(Number(point(n)[1])-Number(y))<150);assert.ok(row,'Delete owned conversation');await click(row.id);await waitFor(has('删除本机对话'),'Delete dialog');await click('删除');await input('assistant-search','');}
try{
  if(!previous){
  await restart();await click('assistant-settings');await click('model-provider');await waitFor(has('provider-silicon'),'Provider catalogue missing');await screenshot('provider-catalogue.png');
  for(const id of ['silicon','anthropic','openai','deepseek','ark','openrouter','gemini','qwen','moonshot','zhipu','minimax','custom'])await reveal('provider-'+id);
  check('Native catalogue contains all 12 provider presets, including custom relay');await click('assistant-back');
  for(const [id,protocol,reply] of [['anthropic','anthropic','Claude 原生协议通过。'],['openai','responses','Responses 原生协议通过。'],['gemini','gemini','Gemini 原生协议通过。']]){
    await choose(id);let nodes=await layout();const url=find(nodes,'model-base');assert.ok(/^https?:\/\//.test(url.text));assert.ok(find(nodes,'model-protocol-'+protocol));check(id+' preset supplies its official base and native protocol');
    await input('model-base',base+'/'+(protocol==='responses'?'responses-api':protocol));await input('model-key',fixture.key);await reveal('model-fetch');await click('model-fetch');await waitFor(has('catalog-qa-'+protocol),'Native model discovery missing');await input('model-search','qa-'+protocol);await click('catalog-qa-'+protocol);await save();
    assert.ok(fixture.requests.at(-1).method==='GET');check(id+' fetches and selects a model using native authenticated GET');
    await click('assistant-new');const title=tag+'-'+id;await click('重命名');await input('conversation-title',title);await click('保存名称');titles.push(title);
    await input('assistant-draft','原生协议验收');await click('assistant-send');await waitFor(has(reply),'Native stream reply failed');assert.ok(fixture.requests.at(-1).authorized&&!fixture.requests.at(-1).wrongAuth);await screenshot('provider-'+id+'-chat.png');check(id+' renders its native streamed reply without Chat Completions conversion at the service');
    await click('assistant-back');await click('assistant-settings');
  }
  await choose('anthropic');await reveal('model-base');assert.equal(find(await layout(),'model-base').text,base+'/anthropic');check('Switching providers restores saved service address, model and protocol');await click('assistant-back');
  }
  if(!previous || previous.checked.length<12){
  await restart();await input('assistant-search',tag+'-anthropic');await click(tag+'-anthropic');await waitFor(has('Claude 原生协议通过。'),'Native provider history missing after process restart');check('Native-provider conversation and its original model profile survive process restart');await click('assistant-back');await input('assistant-search','');
  } else { await restart(); }
  run('shell','aa','force-stop','com.szk.dshconnect');
  const sandbox='/data/app/el2/100/base/com.szk.dshconnect/haps/entry/files/assistant-v1.json';
  const local=path.join(cache,'assistant-fixture-cleanup.json');run('file','recv',sandbox,local);
  const data=AssistantCore.restore(await readFile(local,'utf8'));
  const mock=p=>/^http:\/\/10\.0\.2\.2:\d+\/(?:anthropic|responses-api|gemini|chat)$/.test(p.base)&&/^qa-/.test(p.model);
  data.conversations=data.conversations.filter(c=>!c.title.startsWith('QA-PROVIDERS-'));
  data.profiles=data.profiles.filter(p=>!mock(p));if(mock(data.profile))data.profile=new ModelProfile();
  await writeFile(local,JSON.stringify(data));AssistantCore.restore(await readFile(local,'utf8'));run('file','send',local,sandbox);
  await restart();await click('assistant-back');
  await click('open-media');await click('media-settings');
  for(const id of ['silicon','openrouter']){
    await top();await reveal('media-provider-'+id);await click('media-provider-'+id);await input('media-base',imageBase+'/'+id);await input('media-key',media.key);await reveal('media-fetch-image');await click('media-fetch-image');await waitFor(has('media-catalog-vendor/qa-image'),'Image model discovery missing');await click('media-catalog-vendor/qa-image');await reveal('media-save-profile');await pause(400);await click('media-save-profile');await waitFor(has('media-prompt'),'Image preset save failed');
    check(id+' image model discovery is connected to native model selection');await input('media-prompt',tag+'-'+id);await reveal('media-run');await click('media-run');await waitFor(nodes=>has('media-result-0')(nodes)&&!has('media-stop')(nodes),'Provider-specific image response missing');
    const req=media.requests.at(-1);if(id==='openrouter')assert.equal(req.path,'/openrouter/images');else assert.equal(req.path,'/silicon/images/generations');await screenshot('provider-'+id+'-image.png');check(id+' native image endpoint and result decoding work end-to-end');
    await click('media-back');await click('media-history');const nodes=await waitFor(has(tag+'-'+id),'Image history missing');const y=point(find(nodes,tag+'-'+id))[1];const row=nodes.find(n=>n?.id?.startsWith('media-delete-')&&Math.abs(Number(point(n)[1])-Number(y))<200);await click(row.id);await click('删除');await click('media-back');await input('media-prompt','');await click('media-settings');await top();await click('media-provider-'+id);await reveal('media-clear-profile');await click('media-clear-profile');await click('media-settings');
  }
  await top();await click('media-provider-openrouter');await input('media-base',imageBase+'/openrouter');await input('media-model','vendor/qa-image');await input('media-key',media.key);await reveal('media-save-profile');await click('media-save-profile');await waitFor(has('media-prompt'),'Cleanup profile save failed');await click('media-settings');await reveal('删除此地址密钥');await click('删除此地址密钥');await reveal('media-clear-profile');await click('media-clear-profile');await click('media-back');
  assert.ok(fixture.requests.every(r=>r.authorized&&!r.wrongAuth&&!r.hasCookie));assert.ok(media.downloads.every(r=>!r.hasAuthorization&&!r.hasGoogleKey&&!r.hasCookie));check('Native requests use the correct auth family and image CDN receives no model credentials');
  check('Fixture-owned conversations, images and provider slots removed; test metadata cleared from app sandbox and workbench restored');report.pass=true;
}catch(error){report.error=error.message;try{await screenshot('provider-test-failure.png');}catch{}process.exitCode=1;}
finally{report.requests=(previous?.requests||[]).concat(fixture.requests.map(({method,route,query,authorized,wrongAuth,hasCookie})=>({method,route,query,authorized,wrongAuth,hasCookie})));report.imageRequests=media.requests.map(r=>({path:r.path,authorized:r.authorized,wrongAuth:r.wrongAuth}));report.downloads=media.downloads;await writeFile(path.join(root,'reports/providers-emulator.json'),JSON.stringify(report,null,2)+'\n');await fixture.close();await media.close();}
console.log(JSON.stringify(report,null,2));
