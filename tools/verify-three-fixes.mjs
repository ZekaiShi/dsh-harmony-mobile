import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createFixture } from './qa-fixture.mjs';
const root=path.resolve(import.meta.dirname,'..'),cache=path.join(root,'.cache/three-fixes');
await mkdir(cache,{recursive:true});
const hdc=process.env.HDC_PATH||'D:/DevEco Studio/sdk/default/openharmony/toolchains/hdc.exe',target=process.env.HDC_TARGET||'127.0.0.1:5555',bundle='com.szk.dshconnect.qa';
const run=(...args)=>execFileSync(hdc,['-t',target,...args],{encoding:'utf8',windowsHide:true,timeout:15000});
assert.match(run('shell','param','get','const.product.model'),/emulator/i);
const pause=ms=>new Promise(r=>setTimeout(r,ms)),flatten=n=>[n.attributes,...(n.children||[]).flatMap(flatten)];
async function layout(){run('shell','uitest','dumpLayout','-p','/data/local/tmp/dsh-three-fixes.json','-b',bundle);run('file','recv','/data/local/tmp/dsh-three-fixes.json',path.join(cache,'layout.json'));return flatten(JSON.parse(await readFile(path.join(cache,'layout.json'),'utf8')));}
const find=(nodes,value)=>nodes.find(n=>n.id===value||n.text===value);
const bounds=n=>n.bounds.match(/\d+/g).map(Number);
function point(n){assert.ok(n,'QA control exists');const [a,b,c,d]=bounds(n);return[String(Math.round((a+c)/2)),String(Math.round((b+d)/2))];}
async function click(value){const n=typeof value==='string'?find(await layout(),value):value;assert.ok(n,'Missing '+value);run('shell','uitest','uiInput','click',...point(n));await pause(500);}
async function wait(value){for(let i=0;i<25;i++){const nodes=await layout();if(find(nodes,value))return nodes;await pause(200);}throw new Error('Missing '+value);}
async function shot(name){run('shell','uitest','screenCap','-p','/data/local/tmp/dsh-three-fixes.png');run('file','recv','/data/local/tmp/dsh-three-fixes.png',path.join(cache,name+'.png'));}
async function back(){run('shell','uitest','uiInput','keyEvent','Back');await pause(500);}
async function menu(button,name){
 await click(button);const nodes=await wait('export-png'),rows=['export-png','export-md','export-pdf'].map(id=>find(nodes,id));
 assert.ok(rows.every(Boolean),'Exactly three shared export controls');
 assert.deepEqual(rows.map(n=>n.text),['长图 PNG','Markdown','PDF']);
 const heights=rows.map(n=>bounds(n)[3]-bounds(n)[1]);assert.ok(Math.max(...heights)-Math.min(...heights)<=2,'Equal-height menu rows');
 await shot(name);await back();
}
const fixture=await createFixture(),report={pass:false,checked:[],limitations:['Isolated P90 bundle with synthetic data only; physical Mate 90 not exercised','Coordinates require independent screenshot review; the script alone cannot prove system-bar layout']};
try{
 const first=await wait('qa-safe-top');const safeTop=Number(find(first,'qa-safe-top').text.split('：')[1]);assert.ok(safeTop>0,'System reports a nonzero status-bar safe inset');report.safeTopPx=safeTop;
 await click('qa-seed-menu');await click('qa-home');await wait('open-assistant');
 await click('open-assistant');await click('菜单隔离验收');await menu('assistant-export','assistant-menu');await click('assistant-back');await click('assistant-back');await wait('open-media');
 await click('open-media');await click('作品与记录');await click('media-record-qa-menu');await menu('media-export-record','media-menu');await back();await back();await back();await wait('open-desktop');
 await click('open-desktop');await click('粘贴连接链接');const input=(await layout()).find(n=>n.type==='TextArea');run('shell','uitest','uiInput','inputText',...point(input),fixture.pairingUrl.replace('127.0.0.1','10.0.2.2'));await back();await click('打开连接');await wait('二维码连接验收');
 const checkTop=async(id)=>{const node=find(await layout(),id);assert.ok(node);const y=bounds(node)[1];assert.ok(y>=safeTop,'Header '+id+' clears status bar: '+y+' >= '+safeTop);return y;};
 report.sessionsHeaderTopPx=await checkTop('devices');await click('二维码连接验收');await wait('session-list');report.chatHeaderTopPx=await checkTop('session-list');await shot('dsh-safe-top');
 await menu('dsh-export','desktop-menu');report.checked.push('Three native export menus have the same three equal-height rows without long explanations');
 fixture.foldingSample();await wait('最终回复仍然直接显示。');
 let nodes=await layout();assert.ok(!nodes.some(n=>n.text?.includes('QA-HIDDEN-')),'All activity details initially hidden');
 let toggle=nodes.find(n=>n.id?.startsWith('activity-toggle-activity:'));assert.ok(toggle,'One grouped activity disclosure');assert.equal(nodes.filter(n=>n.id?.startsWith('activity-toggle-')).length,1);
 await shot('calls-collapsed');await click(toggle);nodes=await layout();assert.ok(nodes.filter(n=>n.id?.startsWith('activity-toggle-')).length>=7,'All reasoning, agent and unknown tool rows expand');
 assert.ok(!nodes.some(n=>n.text?.includes('QA-HIDDEN-RESULT-')),'Details stay folded after opening group');
 const shell=nodes.find(n=>n.id?.startsWith('activity-toggle-')&&n.id.endsWith(':tool:fold-2'));assert.ok(shell);await click(shell);await wait('{"command":"QA-HIDDEN-COMMAND"}\n\n输出：\nQA-HIDDEN-RESULT-2');await shot('calls-details');
 nodes=await layout();toggle=nodes.find(n=>n.id?.startsWith('activity-toggle-activity:'));await click(toggle);nodes=await layout();assert.ok(!nodes.some(n=>n.text?.includes('QA-HIDDEN-')));await shot('calls-recollapsed');
 report.checked.push('Contiguous calls and reasoning default to one collapsed row','Agent and unknown calls can expand and collapse; raw results stay hidden until selected','First-class tool results finish the original calls, preserving errors and details');
 run('shell','uitest','uiInput','keyEvent','Home');await pause(400);run('shell','aa','start','-a','EntryAbility','-b',bundle);await pause(700);report.resumedHeaderTopPx=await checkTop('session-list');await shot('dsh-resumed');report.checked.push('Session list, chat and foreground return keep header below actual status-bar inset');
 report.pass=true;
}catch(error){report.error=error.message;await shot('failure').catch(()=>{});process.exitCode=1;}
finally{await mkdir(path.join(root,'reports'),{recursive:true});await writeFile(path.join(root,'reports/three-fixes.json'),JSON.stringify(report,null,2));await fixture.close();}
console.log(JSON.stringify(report,null,2));
