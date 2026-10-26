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

const fixture=await createFixture(),port=new URL(fixture.base).port,tag='COMPOSER-QA-'+Date.now();
const report={version:JSON.parse(await readFile(path.join(root,'package.json'),'utf8')).version,target,pass:false,checked:[],scope:'Only composer crash regression: new chats, settings return, draft, isolated DSH chat. No model calls, key edits or private history export.'};
let paired=false,beforeIds=new Set(),owned=[];
const check=s=>{report.checked.push(s);console.log('PASS '+s);};
async function findOwned(){const ns=await layout();owned=ns.filter(n=>n.id?.startsWith('delete-conversation-')&&!beforeIds.has(n.id)).map(n=>n.id);}
async function cleanupOwned(){for(const id of owned){await click(id);await click('删除');}owned=[];}
async function cleanupFixture(){const ns=await layout(),own=find(ns,new URL(fixture.base).host);assert.ok(own);const y=Number(point(own)[1]),button=ns.filter(n=>n.type==='Button'&&n.text==='移除').sort((a,b)=>Math.abs(Number(point(a)[1])-y)-Math.abs(Number(point(b)[1])-y))[0];assert.ok(button);run('shell','uitest','uiInput','click',...point(button));paired=false;await pause(300);}
try{
 run('rport','tcp:'+port,'tcp:'+port);
 const started=run('shell','aa','start','-a','EntryAbility','-b','com.szk.dshconnect');assert.ok(started.includes('start ability successfully'),started);
 await click('open-assistant');beforeIds=new Set((await layout()).filter(n=>n.id?.startsWith('delete-conversation-')).map(n=>n.id));const pid=run('shell','pidof','com.szk.dshconnect').trim();
 await click('assistant-new');await wait('assistant-draft');await wait('assistant-context');await wait('assistant-send');assert.equal(run('shell','pidof','com.szk.dshconnect').trim(),pid);check('New conversation renders composer/context/send without process exit');
 await click('assistant-attach');await wait('assistant-attach-image');await wait('assistant-attach-file');await systemBack();await wait('assistant-draft');check('Attachment menu opens and closes with the parent conversation still available');
 await input('assistant-draft',tag);assert.equal((await wait('assistant-draft')).text,tag);assert.equal((await wait('assistant-send')).enabled,'true');
 await click('assistant-settings');await wait('model-provider');await click('assistant-back');assert.equal((await wait('assistant-draft')).text,tag);await wait('assistant-context');check('Settings -> chat restores the composer and draft with parent state intact');
 await click('assistant-new');await wait('assistant-draft');await wait('assistant-send');assert.equal((await wait('assistant-draft')).text,'');assert.equal(run('shell','pidof','com.szk.dshconnect').trim(),pid);check('Creating a fresh conversation from inside a chat also remains running');
 await click('assistant-back');await wait('assistant-search');await findOwned();assert.equal(owned.length,2,'Exactly two QA-created conversations may be removed');
 const first=owned[owned.length-1].replace('delete-conversation-','assistant-conversation-');await click(first);await wait('assistant-send');await click('assistant-back');await wait('assistant-search');await cleanupOwned();check('History reopen works; only the two QA-created conversations are deleted');
 await click('assistant-back');await click('open-desktop');await click('粘贴连接链接');const area=(await layout()).find(n=>n.type==='TextArea');run('shell','uitest','uiInput','inputText',...point(area),fixture.pairingUrl);await systemBack();await click('打开连接');paired=true;await click('二维码连接验收');await wait('dsh-draft');await wait('send-message');check('Desktop composer also renders after applying the same Builder binding fix');
 await click('session-list');await wait('二维码连接验收');await click('devices');await wait('desktop-back');await cleanupFixture();await click('desktop-back');await wait('open-assistant');
 assert.equal(fixture.calls.filter(c=>['session/prompt','session/cancel'].includes(c.method)).length,0);report.pass=true;
}catch(e){report.error=e.stack;process.exitCode=1;}
finally{
 try{
  for(let i=0;i<6&&(owned.length||paired);i++){
   const ns=await layout();
   if(owned.length&&find(ns,'assistant-search')){await cleanupOwned();continue;}
   if(paired&&find(ns,'desktop-back')){await cleanupFixture();continue;}
   const back=find(ns,'assistant-back')||find(ns,'session-list')||find(ns,'devices');if(back)await click(back.id);else break;
  }
 }catch(e){report.cleanupError=e.message;report.pass=false;process.exitCode=1;}
 await fixture.close();try{run('fport','rm','tcp:'+port,'tcp:'+port);}catch(e){report.forwardCleanupError=e.message;report.pass=false;process.exitCode=1;}
 await writeFile(path.join(root,'reports/composer-crash-'+(target==='127.0.0.1:5555'?'emulator':'phone')+'-'+report.version+'.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
