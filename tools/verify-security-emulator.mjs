import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createFixture} from './qa-fixture.mjs';
const root=path.resolve(import.meta.dirname,'..'),cache=path.join(root,'.cache/security');await mkdir(cache,{recursive:true});
const hdc=process.env.HDC_PATH||'D:/DevEco Studio/sdk/default/openharmony/toolchains/hdc.exe';
const target='127.0.0.1:5555';
const run=(...args)=>{const out=execFileSync(hdc,['-t',target,...args],{encoding:'utf8',windowsHide:true,timeout:15000});if(/\[Fail\]|Install Failed|install bundle failed/i.test(out))throw Error(out.trim());return out;};
assert.match(run('shell','param','get','const.product.model'),/emulator/i,'This check must not operate a physical phone');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const flat=n=>[n.attributes,...(n.children||[]).flatMap(flat)];
async function layout(){run('shell','uitest','dumpLayout','-p','/data/local/tmp/dsh-security-layout.json','-b','com.szk.dshconnect');run('file','recv','/data/local/tmp/dsh-security-layout.json',path.join(cache,'layout.json'));return flat(JSON.parse(await readFile(path.join(cache,'layout.json'),'utf8')));}
const find=(ns,s)=>ns.find(n=>n.id===s)||ns.find(n=>n.text===s&&!['TextArea','TextInput'].includes(n.type));
const point=n=>{assert.ok(n);const b=n.bounds.match(/\d+/g).map(Number);return[String(Math.round((b[0]+b[2])/2)),String(Math.round((b[1]+b[3])/2))];};
async function wait(s){for(let i=0;i<12;i++){const n=find(await layout(),s);if(n)return n;await pause(150);}throw Error('Missing control '+s);}
async function click(s){run('shell','uitest','uiInput','click',...point(await wait(s)));await pause(300);}
async function input(value){const n=(await layout()).find(n=>n.type==='TextArea');assert.ok(n);run('shell','uitest','uiInput','inputText',...point(n),value);run('shell','uitest','uiInput','keyEvent','Back');await pause(200);}
const fixture=await createFixture(),port=new URL(fixture.base).port;
const version=JSON.parse(await readFile(path.join(root,'package.json'),'utf8')).version;
const hap=path.join(root,`deliveries/DSH-Connect-${version}-unsigned.hap`);
const report={version,hapSha256:createHash('sha256').update(await readFile(hap)).digest('hex'),target,pass:false,checked:[],scope:'Native public-HTTP rejection and isolated LAN pairing; no model calls, key edits, user messages or private history export.'};
let paired=false;
async function cleanup(){
  await click('session-list');await wait('二维码连接验收');await click('devices');await wait('desktop-back');
  const ns=await layout(),own=find(ns,new URL(fixture.base).host);assert.ok(own,'Only the fixture origin may be removed');
  const y=Number(point(own)[1]);const button=ns.filter(n=>n.type==='Button'&&n.text==='移除').sort((a,b)=>Math.abs(Number(point(a)[1])-y)-Math.abs(Number(point(b)[1])-y))[0];
  assert.ok(button);run('shell','uitest','uiInput','click',...point(button));paired=false;await pause(250);await click('desktop-back');await wait('open-desktop');
}
try{
  assert.match(run('install',hap),/install bundle successfully/);
  run('rport','tcp:'+port,'tcp:'+port);
  run('shell','aa','force-stop','com.szk.dshconnect');
  assert.match(run('shell','aa','start','-a','EntryAbility','-b','com.szk.dshconnect'),/start ability successfully/);
  await click('open-desktop');await click('粘贴连接链接');
  await input('http://192.168.evil.test/pair?token=security_fixture_abcdefghijklmnop');await click('打开连接');
  assert.ok((await layout()).some(n=>n.text?.includes('公网连接必须使用 HTTPS')));
  report.checked.push('Public HTTP pairing, including numeric-prefix domains posing as private IPs, is rejected before entering the network flow');
  // inputText appends to an existing TextArea; re-enter with a fresh page so
  // the rejected value cannot contaminate the subsequent isolated LAN check.
  await click('desktop-back');await wait('open-desktop');await click('open-desktop');await click('粘贴连接链接');
  await input(fixture.pairingUrl);await click('打开连接');await wait('二维码连接验收');paired=true;await click('二维码连接验收');await wait('dsh-draft');
  assert.ok(fixture.observedRequests.some(r=>r.path==='/api/rpc'&&r.hasCookie));
  report.checked.push('Existing LAN QR, same-origin redirect and credential-bearing RPC remain compatible');
  assert.equal(fixture.calls.filter(c=>['session/prompt','session/cancel'].includes(c.method)).length,0);
  await cleanup();report.checked.push('Only the temporary fixture connection is removed; model settings and conversations are untouched');report.pass=true;
}catch(e){report.error=e.message;process.exitCode=1;}
finally{
  if(paired){try{await cleanup();}catch(e){report.cleanupError=e.message;report.pass=false;process.exitCode=1;}}
  await fixture.close();try{run('fport','rm','tcp:'+port,'tcp:'+port);}catch(e){report.forwardCleanupError=e.message;report.pass=false;process.exitCode=1;}
  await writeFile(path.join(root,`reports/security-emulator-${version}.json`),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
