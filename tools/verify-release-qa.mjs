import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createModelFixture } from './model-fixture.mjs';
import { createFixture } from './qa-fixture.mjs';
const root=path.resolve(import.meta.dirname,'..'),cache=path.join(root,'.cache/qa-export');
const hdc=process.env.HDC_PATH||'D:/DevEco Studio/sdk/default/openharmony/toolchains/hdc.exe';
const target=process.env.HDC_TARGET||'127.0.0.1:5555',bundle='com.szk.dshconnect.qa';
const run=(...args)=>execFileSync(hdc,['-t',target,...args],{encoding:'utf8',windowsHide:true,timeout:15000});
assert.match(run('shell','param','get','const.product.model'),/emulator/i);
const pause=ms=>new Promise(r=>setTimeout(r,ms)),flatten=n=>[n.attributes,...(n.children||[]).flatMap(flatten)];
async function layout(){run('shell','uitest','dumpLayout','-p','/data/local/tmp/dsh-release-qa.json','-b',bundle);run('file','recv','/data/local/tmp/dsh-release-qa.json',path.join(cache,'layout.json'));return flatten(JSON.parse(await readFile(path.join(cache,'layout.json'),'utf8')));}
const find=(nodes,value)=>nodes.find(n=>n.id===value||n.text===value);
function point(n){assert.ok(n,'QA control exists');const v=n.bounds.match(/\d+/g).map(Number);return[String(Math.round((v[0]+v[2])/2)),String(Math.round((v[1]+v[3])/2))];}
async function click(value){const n=find(await layout(),value);assert.ok(n,'Missing '+value);run('shell','uitest','uiInput','click',...point(n));await pause(300);}
async function wait(value){for(let i=0;i<35;i++){const nodes=await layout();if(find(nodes,value))return nodes;await pause(200);}throw new Error('Missing '+value);}
async function input(id,text){
 for(let i=0;i<7;i++){const n=find(await layout(),id);if(n){const v=n.bounds.match(/\d+/g).map(Number);if(v[1]>320&&v[3]<2600)break;}run('shell','uitest','uiInput','swipe','650','2080','650','750','450');await pause(150);}
 await click(id);run('shell','uitest','uiInput','keyEvent','2072','2017');run('shell','uitest','uiInput','keyEvent','2055');run('shell','uitest','uiInput','text',text);run('shell','uitest','uiInput','keyEvent','Back');await pause(450);
}
async function shot(name){run('shell','uitest','screenCap','-p','/data/local/tmp/dsh-release-qa.png');run('file','recv','/data/local/tmp/dsh-release-qa.png',path.join(cache,name+'.png'));}
const model=await createModelFixture({accounting:true}),bridge=await createFixture();
const report={pass:false,checked:[],limitations:['Only isolated fake API and upstream bridge used','No paid model, physical Mate 90 or real public tunnel exercised','Static system bars inspected; physical launcher zoom animation remains unverified']};
try{
 await click('qa-home');await wait('open-assistant');await click('open-assistant');await click('assistant-settings');await shot('assistant-settings');
 await input('model-name','隔离验收模型');await input('model-base',model.base.replace('127.0.0.1','10.0.2.2'));await input('model-id','qa-model');await input('model-key',model.key);
 for(let i=0;i<8&&!find(await layout(),'保存模型配置');i++){run('shell','uitest','uiInput','swipe','650','2080','650','750','450');await pause(150);}
 await click('保存模型配置');await wait('assistant-new');assert.equal(model.requests.length,0);await click('assistant-new');await wait('assistant-draft');
 await input('assistant-draft','检查虚构回复及自动命名');await click('assistant-send');await wait('虚构对话验收');assert.equal(model.requests.length,2);
 assert.ok(model.requests[1].body.messages[0].content.includes('只负责给对话命名'));
 await input('assistant-draft','这是第二次提问');await click('assistant-send');await wait('重新生成');await pause(700);assert.equal(model.requests.length,3,'Automatic title runs once');
 await click('assistant-usage');const usage=await wait('会话 Token 统计');const message=usage.find(n=>n.text.includes('服务端已报告：'))?.text||'';assert.match(message,/总计：324/);assert.match(message,/命名请求：1 次/);await shot('token-usage');await click('知道了');
 report.checked.push('First complete reply automatically names once','Follow-up does not trigger a second title call','Reported usage includes 2 replies and 1 title (324 synthetic tokens)');
 await click('assistant-export');await wait('export-png');await shot('export-menu');run('shell','uitest','uiInput','keyEvent','Back');await pause(400);
 await click('assistant-back');await click('assistant-back');await wait('open-desktop');await click('open-desktop');await click('粘贴连接链接');
 const manual=(await layout()).find(n=>n.type==='TextArea');run('shell','uitest','uiInput','inputText',...point(manual),bridge.pairingUrl.replace('127.0.0.1','10.0.2.2'));run('shell','uitest','uiInput','keyEvent','Back');await pause(400);await click('打开连接');await wait('二维码连接验收');await click('二维码连接验收');
 bridge.senderEvents([{type:'command/run',data:{name:'harmony-send',commandId:'qa-native-sender'}},{type:'command/done',data:{commandId:'qa-native-sender',kind:'success',text:'鸿蒙发送端：虚构文字已显示。'}}]);
 await wait('鸿蒙发送端：虚构文字已显示。');await shot('sender-chat');report.checked.push('Original Desktop QR pairs in the native QA client','Sender command result crosses original bridge SSE and renders as native text');
 await click('dsh-export');await wait('export-png');await shot('desktop-export-menu');run('shell','uitest','uiInput','keyEvent','Back');await pause(350);
 report.pass=true;
}catch(error){report.error=error.message;await shot('release-qa-failure').catch(()=>{});process.exitCode=1;}
finally{report.requests=model.requests.map(r=>({model:r.body.model,messages:r.body.messages?.map(m=>({role:m.role,characters:m.content?.length})),isTitle:r.body.messages?.[0]?.content?.includes('只负责给对话命名')}));await mkdir(path.join(root,'reports'),{recursive:true});await writeFile(path.join(root,'reports/release-qa.json'),JSON.stringify(report,null,2));await model.close();await bridge.close();}
console.log(JSON.stringify(report,null,2));
