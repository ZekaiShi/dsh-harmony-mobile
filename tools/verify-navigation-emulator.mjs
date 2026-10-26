import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createFixture} from './qa-fixture.mjs';
const root=path.resolve(import.meta.dirname,'..'),cache=path.join(root,'.cache/navigation');await mkdir(cache,{recursive:true});
const hdc=process.env.HDC_PATH||'D:/DevEco Studio/sdk/default/openharmony/toolchains/hdc.exe';
const target=process.env.HDC_TARGET||'127.0.0.1:5555';
const run=(...args)=>{const out=execFileSync(hdc,['-t',target,...args],{encoding:'utf8',windowsHide:true,timeout:15000});if(out.includes('[Fail]'))throw Error(out.trim());return out;};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const flat=n=>[n.attributes,...(n.children||[]).flatMap(flat)];
async function layout(){run('shell','uitest','dumpLayout','-p','/data/local/tmp/dsh-navigation.json','-b','com.szk.dshconnect');run('file','recv','/data/local/tmp/dsh-navigation.json',path.join(cache,'layout.json'));return flat(JSON.parse(await readFile(path.join(cache,'layout.json'),'utf8')));}
const find=(ns,s)=>ns.find(n=>n.id===s)||ns.find(n=>n.text===s&&!['TextArea','TextInput'].includes(n.type));
const box=n=>n.bounds.match(/\d+/g).map(Number);
const point=n=>{assert.ok(n,'Control must exist');const b=box(n);return[String(Math.round((b[0]+b[2])/2)),String(Math.round((b[1]+b[3])/2))];};
async function wait(s){for(let i=0;i<12;i++){const n=find(await layout(),s);if(n)return n;await pause(150);}throw Error('Missing control '+s);}
async function click(s){run('shell','uitest','uiInput','click',...point(await wait(s)));await pause(300);}
async function systemBack(){run('shell','uitest','uiInput','keyEvent','Back');await pause(400);}
async function input(s,value){const n=await wait(s);run('shell','uitest','uiInput','inputText',...point(n),value);await systemBack();}
const fixture=await createFixture(),tag='NAV-QA-'+Date.now();let owned='';let fixtureAdded=false;
const fixtureHost=target==='127.0.0.1:5555'?'10.0.2.2':'127.0.0.1',fixtureBase=fixture.base.replace('127.0.0.1',fixtureHost),fixturePort=new URL(fixture.base).port;let forwarded=false;
const report={version:JSON.parse(await readFile(path.join(root,'package.json'),'utf8')).version,target,pass:false,checked:[],scope:'Only back/navigation paths. No model API calls, key edits, raw history replacement or user-record deletions.',limits:[]};
const check=s=>{report.checked.push(s);console.log('PASS '+s);};
async function removeOwned(){if(!owned)return;await click('delete-conversation-'+owned);await click('删除');owned='';}
async function removeFixture(){const ns=await layout(),label=new URL(fixtureBase).host,own=find(ns,label);assert.ok(own,'QA connection row must be located before removing it');const y=Number(point(own)[1]),remove=ns.filter(n=>n.type==='Button'&&n.text==='移除').sort((a,b)=>Math.abs(Number(point(a)[1])-y)-Math.abs(Number(point(b)[1])-y))[0];assert.ok(remove);run('shell','uitest','uiInput','click',...point(remove));await pause(300);}
try{
 if(fixtureHost==='127.0.0.1'){run('rport','tcp:'+fixturePort,'tcp:'+fixturePort);forwarded=true;}
 run('shell','aa','force-stop','com.szk.dshconnect');run('shell','aa','start','-a','EntryAbility','-b','com.szk.dshconnect');
 await click('open-assistant');const assistantBounds=box(await wait('assistant-back'));const before=new Set((await layout()).filter(n=>n.id?.startsWith('delete-conversation-')).map(n=>n.id));
 await click('assistant-settings');await click('model-provider');await systemBack();await wait('model-provider');await click('assistant-back');await wait('assistant-search');check('Assistant provider -> settings -> conversation list: system and toolbar back agree');
 await click('assistant-new');
 if(find(await layout(),'assistant-draft')){
   await input('assistant-draft',tag);await click('assistant-settings');await click('assistant-back');assert.equal((await wait('assistant-draft')).text,tag);
   await click('assistant-back');const own=(await layout()).find(n=>n.id?.startsWith('delete-conversation-')&&!before.has(n.id));assert.ok(own);owned=own.id.replace('delete-conversation-','');
   await click('assistant-conversation-'+owned);assert.equal((await wait('assistant-draft')).text,tag);await systemBack();await wait('assistant-search');await removeOwned();check('Assistant settings and chat/list back preserve draft; only the QA conversation is removed');
 }else{await click('assistant-back');report.limits.push('Assistant draft path skipped: no default model configuration');}
 await click('assistant-back');await wait('open-assistant');
 await click('open-media');const mediaBounds=box(await wait('media-back'));assert.deepEqual(mediaBounds,assistantBounds);
 await click('media-history');await wait('作品与记录');await click('media-settings');await systemBack();await wait('作品与记录');check('Media settings returns to its source history page, with the shared back-button geometry');
 const record=(await layout()).find(n=>n.id?.startsWith('media-record-'));
 if(record){await click(record.id);const ns=await layout();if(find(ns,'media-preview-0')){await click('media-preview-0');await systemBack();await wait('media-preview-0');check('Media preview returns to the same detail');}await click('media-back');await wait('作品与记录');check('Media detail opened from history returns to history rather than skipping to main');}
 else report.limits.push('Native media detail/preview skipped: no existing record; parent policy covered by core tests');
 await click('media-back');await wait('media-history');await systemBack();await wait('open-media');check('Media history -> studio -> workbench returns one level at a time');
 await click('open-desktop');const desktopBounds=box(await wait('desktop-back'));assert.deepEqual(desktopBounds,assistantBounds);await click('desktop-back');await wait('open-desktop');check('Desktop connection page uses the same 44vp back control and returns to workbench');
 await click('open-desktop');await click('粘贴连接链接');const area=(await layout()).find(n=>n.type==='TextArea');assert.ok(area);run('shell','uitest','uiInput','inputText',...point(area),fixture.pairingUrl.replace('127.0.0.1',fixtureHost));await systemBack();await click('打开连接');fixtureAdded=true;await click('二维码连接验收');
 await input('dsh-draft',tag);await click('session-list');await wait('二维码连接验收');await click('二维码连接验收');assert.equal((await wait('dsh-draft')).text,tag);await systemBack();await wait('二维码连接验收');check('Desktop toolbar and system back return to sessions and preserve the session draft');
 await click('devices');await wait('desktop-back');await removeFixture();fixtureAdded=false;await systemBack();await wait('open-desktop');check('Desktop sessions -> connections -> workbench; only isolated QA connection removed');
 assert.equal(fixture.calls.filter(c=>['session/prompt','session/cancel'].includes(c.method)).length,0);check('Returning never sends or cancels a desktop task; no inference request was made');report.pass=true;
}catch(e){report.error=e.stack;process.exitCode=1;}
finally{
 try{
  for(let i=0;i<6&&(owned||fixtureAdded);i++){
   const ns=await layout();
   if(owned&&find(ns,'delete-conversation-'+owned)){await removeOwned();continue;}
   if(fixtureAdded&&find(ns,'desktop-back')){await removeFixture();fixtureAdded=false;continue;}
   if(find(ns,'open-assistant')){await click(owned?'open-assistant':'open-desktop');continue;}
   const back=find(ns,'assistant-back')||find(ns,'media-back')||find(ns,'session-list')||find(ns,'devices');if(back)await click(back.id);else await systemBack();
  }
 }catch(e){report.cleanupError=e.message;report.pass=false;process.exitCode=1;}
 await fixture.close();
 try{if(forwarded)run('fport','rm','tcp:'+fixturePort,'tcp:'+fixturePort);run('shell','aa','force-stop','com.szk.dshconnect');run('shell','aa','start','-a','EntryAbility','-b','com.szk.dshconnect');}catch(e){report.deviceError=e.message;report.pass=false;process.exitCode=1;}
 await writeFile(path.join(root,'reports/navigation-'+(fixtureHost==='10.0.2.2'?'emulator':'phone')+'-'+report.version+'.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
