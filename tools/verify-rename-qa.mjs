import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createModelFixture } from './model-fixture.mjs';
const root=path.resolve(import.meta.dirname,'..'),cache=path.join(root,'.cache/rename-qa');await mkdir(cache,{recursive:true});
const hdc=process.env.HDC_PATH||'D:/DevEco Studio/sdk/default/openharmony/toolchains/hdc.exe',target=process.env.HDC_TARGET||'127.0.0.1:5555',bundle='com.szk.dshconnect.qa';
const run=(...args)=>execFileSync(hdc,['-t',target,...args],{encoding:'utf8',windowsHide:true,timeout:15000});
assert.match(run('shell','param','get','const.product.model'),/emulator/i);
const pause=ms=>new Promise(r=>setTimeout(r,ms)),flatten=n=>[n.attributes,...(n.children||[]).flatMap(flatten)];
async function layout(){run('shell','uitest','dumpLayout','-p','/data/local/tmp/dsh-rename-qa.json','-b',bundle);run('file','recv','/data/local/tmp/dsh-rename-qa.json',path.join(cache,'layout.json'));return flatten(JSON.parse(await readFile(path.join(cache,'layout.json'),'utf8')));}
const find=(nodes,v)=>nodes.find(n=>n.id===v||n.text===v),bounds=n=>n.bounds.match(/\d+/g).map(Number);
async function click(v,settle=500){const n=find(await layout(),v);assert.ok(n,'Missing '+v);const [a,b,c,d]=bounds(n);run('shell','uitest','uiInput','click',String(Math.round((a+c)/2)),String(Math.round((b+d)/2)));await pause(settle);}
async function wait(v){for(let i=0;i<30;i++){const nodes=await layout();if(find(nodes,v))return nodes;await pause(200);}throw new Error('Missing '+v);}
async function input(id,text){await click(id);run('shell','uitest','uiInput','keyEvent','2072','2017');run('shell','uitest','uiInput','keyEvent','2055');if(text)run('shell','uitest','uiInput','text',text);run('shell','uitest','uiInput','keyEvent','Back');await pause(450);}
async function shot(name){run('shell','uitest','screenCap','-p','/data/local/tmp/dsh-rename-qa.png');run('file','recv','/data/local/tmp/dsh-rename-qa.png',path.join(cache,name+'.png'));}
const fixture=await createModelFixture({accounting:true}),report={pass:false,checked:[],limitations:['Isolated synthetic P90 data and local fake model only','Native material availability is system-dependent; no physical device material claim']};
try{
 await wait('qa-model-base');await input('qa-model-base',fixture.base.replace('127.0.0.1','10.0.2.2'));await click('qa-seed-menu');await wait('菜单测试数据已准备');await click('qa-home');await click('open-assistant');await click('菜单隔离验收');
 await click('assistant-rename',0);await shot('rename-entering');await wait('conversation-title');await pause(400);let nodes=await layout();
 for(const id of ['assistant-ai-title','assistant-save-title']){const n=find(nodes,id);assert.ok(n);const [a,b,c,d]=bounds(n);assert.equal(c-a,d-b,'Native circular action '+id);assert.ok(b>100,'Action below status bar');}
 await shot('rename-page');await input('conversation-title','手动名称验收');await click('assistant-save-title');await wait('手动名称验收');assert.equal(fixture.requests.length,0);report.checked.push('Rename uses a native destination with circular title-bar actions','Manual save animates back, updates title and makes no model request');
 await click('assistant-rename');await input('conversation-title','');nodes=await layout();assert.equal(find(nodes,'assistant-save-title').enabled,'false');await input('conversation-title','不应保存');await click('assistant-back');await wait('手动名称验收');report.checked.push('Empty title cannot save; returning without save preserves title');
 await click('assistant-rename');await click('assistant-ai-title');await wait('虚构对话验收');assert.equal(find(await layout(),'conversation-title').text,'虚构对话验收');await shot('ai-suggestion');await click('assistant-back');await wait('手动名称验收');assert.equal(fixture.requests.length,1);report.checked.push('AI suggestion remains a draft until saved');
 await click('assistant-rename');await click('assistant-ai-title');await wait('虚构对话验收');await click('assistant-save-title');await wait('虚构对话验收');assert.equal(fixture.requests.length,2);assert.ok(fixture.requests.every(r=>r.body.messages[0].content.includes('只负责给对话命名')));await shot('saved-ai-title');report.checked.push('AI suggestion can be confirmed with native save action and uses bounded title-only requests');
 report.pass=true;
}catch(error){report.error=error.message;await shot('failure').catch(()=>{});process.exitCode=1;}
finally{report.requestCount=fixture.requests.length;await mkdir(path.join(root,'reports'),{recursive:true});await writeFile(path.join(root,'reports/rename-qa.json'),JSON.stringify(report,null,2));await fixture.close();}
console.log(JSON.stringify(report,null,2));
