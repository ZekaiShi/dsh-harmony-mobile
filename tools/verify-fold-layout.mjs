import { execFileSync } from 'node:child_process';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createFixture } from './qa-fixture.mjs';
const root=path.resolve(import.meta.dirname,'..'),target=process.env.HDC_TARGET;
assert.match(target||'',/^127\.0\.0\.1:\d+$/,'Choose an explicit emulator target');
const cache=path.join(root,'.cache/fold-qa',target.split(':')[1]);await mkdir(cache,{recursive:true});
const hdc=process.env.HDC_PATH||'D:/DevEco Studio/sdk/default/openharmony/toolchains/hdc.exe',bundle='com.szk.dshconnect.qa';
const run=(...args)=>{try{return execFileSync(hdc,['-t',target,...args],{encoding:'utf8',windowsHide:true,timeout:25000});}catch(error){throw new Error(args.slice(0,5).join(' ')+': '+error.message);}};
assert.match(run('shell','param','get','const.product.model'),/emulator/i);
const pause=ms=>new Promise(r=>setTimeout(r,ms)),flatten=n=>[n.attributes,...(n.children||[]).flatMap(flatten)];
async function layout(){run('shell','uitest','dumpLayout','-p','/data/local/tmp/dsh-fold-qa.json','-b',bundle);run('file','recv','/data/local/tmp/dsh-fold-qa.json',path.join(cache,'layout.json'));return flatten(JSON.parse(await readFile(path.join(cache,'layout.json'),'utf8')));}
const find=(nodes,v)=>nodes.find(n=>n.id===v||n.text===v),bounds=n=>(n.bounds.match(/-?\d+/g)||[]).map(Number);
function point(n){assert.ok(n,'Control exists');const[a,b,c,d]=bounds(n);return[String(Math.round((a+c)/2)),String(Math.round((b+d)/2))];}
async function click(v){const n=typeof v==='string'?find(await layout(),v):v;assert.ok(n,'Missing '+v);run('shell','uitest','uiInput','click',...point(n));await pause(500);}
async function wait(v){for(let i=0;i<35;i++){const nodes=await layout();if(find(nodes,v))return nodes;await pause(200);}throw new Error('Missing '+v);}
async function back(){run('shell','uitest','uiInput','keyEvent','Back');await pause(500);}
async function shot(name){run('shell','uitest','screenCap','-p','/data/local/tmp/dsh-fold-qa.png');run('file','recv','/data/local/tmp/dsh-fold-qa.png',path.join(cache,name+'.png'));}
async function input(id,text){
 await click(id);
 // Fresh emulators show the system IME's first-use sheet. Choose its basic,
 // local mode, never full/cloud features or optional permissions.
 run('shell','uitest','dumpLayout','-p','/data/local/tmp/dsh-ime-qa.json');run('file','recv','/data/local/tmp/dsh-ime-qa.json',path.join(cache,'ime.json'));
 let system=flatten(JSON.parse(await readFile(path.join(cache,'ime.json'),'utf8')));
 if(find(system,'Paf.Permission.button_cancel')){
  await click(find(system,'Paf.Permission.button_cancel'));
  run('shell','uitest','dumpLayout','-p','/data/local/tmp/dsh-ime-qa.json');run('file','recv','/data/local/tmp/dsh-ime-qa.json',path.join(cache,'ime.json'));
  system=flatten(JSON.parse(await readFile(path.join(cache,'ime.json'),'utf8')));
  const basic=find(system,'同意基本模式');assert.ok(basic,'Local basic IME mode exists');await click(basic);
  run('shell','aa','start','-a','EntryAbility','-b',bundle);await wait(id);await click(id);
 }
 run('shell','uitest','uiInput','keyEvent','2072','2017');run('shell','uitest','uiInput','keyEvent','2055');run('shell','uitest','uiInput','text',text);await pause(300);await shot(id+'-keyboard-'+text.split('-').at(-1));
 if(id==='dsh-draft'||id==='assistant-draft'){
  const keyboardLayout=await layout(),appRoot=keyboardLayout.find(n=>n.type==='root'&&n.bundleName===bundle);
  inside(find(keyboardLayout,id),appRoot,'Draft above keyboard');inside(find(keyboardLayout,id==='dsh-draft'?'send-message':'assistant-send'),appRoot,'Send above keyboard');
 }
 await back();
 const nodes=await wait(id);assert.equal(find(nodes,id).text,text,'Input fixture was entered');
}
async function fold(flag){run('shell','hidumper','-s','DisplayManagerService','-a',flag);await pause(1600);}
async function scrollDown(){const nodes=await layout(),[a,b,c,d]=bounds(nodes[0]);run('shell','uitest','uiInput','swipe',String(Math.round((a+c)/2)),String(Math.round(b+(d-b)*0.75)),String(Math.round((a+c)/2)),String(Math.round(b+(d-b)*0.3)),'450');await pause(300);}
async function reveal(id){for(let i=0;i<12;i++){const nodes=await layout(),n=find(nodes,id),[a,b,c,d]=bounds(nodes[0]);if(n&&n.visible==='true'&&bounds(n)[1]>=b&&bounds(n)[3]<=d)return;if(n&&bounds(n)[1]<b){run('shell','uitest','uiInput','swipe',String(Math.round((a+c)/2)),String(Math.round(b+(d-b)*0.3)),String(Math.round((a+c)/2)),String(Math.round(b+(d-b)*0.8)),'450');await pause(300);}else await scrollDown();}throw new Error('Cannot reveal '+id);}
function inside(node,rootNode,label){assert.ok(node,label+' exists');const[a,b,c,d]=bounds(node),[x,y,w,h]=bounds(rootNode);assert.ok(a>=x-2&&c<=w+2&&b>=y-2&&d<=h+2,label+' stays inside window '+node.bounds+' '+rootNode.bounds);}
let fixture;
const report={pass:false,target,checked:[],states:[],limitations:['Native emulator layouts, not physical panels or hinge/hand sensors','All conversations and images synthetic; no model or user data']};
const states=process.env.FOLD_KIND==='trifold'?[['full','-yy'],['two','-y'],['cover','-p']]:[['full','-y'],['cover','-p']];
async function bootstrap(){
 console.log('Starting isolated fold QA',target);await fold(states[0][1]);run('shell','aa','force-stop',bundle);await pause(700);run('shell','aa','start','-a','EntryAbility','-b',bundle);await wait('qa-seed-menu');await click('qa-seed-menu');await wait('菜单测试数据已准备');await click('qa-home');
}
async function connectDesktop(){
 fixture=await createFixture();await fold(states[0][1]);await reveal('open-desktop');await click('open-desktop');await click('粘贴连接链接');const area=(await layout()).find(n=>n.type==='TextArea');run('shell','uitest','uiInput','inputText',...point(area),fixture.pairingUrl.replace('127.0.0.1','10.0.2.2'));await back();await reveal('打开连接');await click('打开连接');await wait('二维码连接验收');await click('二维码连接验收');await wait('dsh-draft');await input('dsh-draft','电脑会话折叠草稿');await shot('full-desktop');
}
async function keyboardChecks(){
  console.log('Checking short landscape and keyboard',target);await fold('-p');
  run('shell','hidumper','-s','DisplayManagerService','-a','-rotationlock,0');run('shell','hidumper','-s','DisplayManagerService','-a','-motion,1');await pause(1400);await wait('dsh-draft');
  await input('dsh-draft','short-landscape-draft');let nodes=await layout();inside(find(nodes,'dsh-draft'),nodes[0],'Short landscape draft');inside(find(nodes,'send-message'),nodes[0],'Short landscape send');await shot('short-landscape-desktop');report.states.push({name:'cover-landscape',root:nodes[0].bounds});
  run('shell','hidumper','-s','DisplayManagerService','-a','-motion,0');await pause(1200);
  for(let i=0;i<6;i++){if(find(await layout(),'open-assistant'))break;await back();}await wait('open-assistant');await reveal('open-assistant');await click('open-assistant');await click('菜单隔离验收');await input('assistant-draft','cover-keyboard-draft');
  await click('assistant-draft');run('shell','uitest','uiInput','text','-tap-dismiss');await pause(400);await shot('cover-assistant-keyboard');await click('assistant-messages');nodes=await wait('assistant-draft');assert.equal(find(nodes,'assistant-draft').focused,'false','Touching conversation releases keyboard focus');const savedDraft=find(nodes,'assistant-draft').text;assert.ok(savedDraft.includes('tap-dismiss'));await shot('cover-assistant-dismissed');
  await click('assistant-settings');await wait('model-provider');await reveal('model-name');await input('model-name','fold-qa-unsaved');await shot('cover-model-settings');await reveal('model-provider');await click('model-provider');await wait('选择服务商');await shot('cover-provider-list');await back();await back();await wait('assistant-draft');
  await fold(states[0][1]);await wait('assistant-draft');assert.equal(find(await layout(),'assistant-draft').text,savedDraft);await click('assistant-settings');await wait('model-provider');await shot('full-model-settings');await back();
  report.checked.push('Short landscape composer and keyboard','Cover chat keyboard dismissed by conversation tap','Scrollable model settings and provider picker on cover/full','Draft survives settings and fold');
}
try{
 await bootstrap();
 if(process.env.FOLD_RESUME==='keyboard'){await connectDesktop();await keyboardChecks();report.pass=true;}else{
 for(const [name,flag] of states){
  console.log('Checking',name);await fold(flag);await wait('open-assistant');const nodes=await layout();report.states.push({name,root: nodes[0].bounds});
  for(const id of ['open-assistant','open-media','open-desktop']){await reveal(id);inside(find(await layout(),id),(await layout())[0],id);}
  await shot(name+'-home');await reveal('open-assistant');await click('open-assistant');await click('菜单隔离验收');await wait('assistant-draft');
  console.log(name,'chat draft');await input('assistant-draft','fold-draft-'+name);await shot(name+'-assistant');let chat=await layout();inside(find(chat,'assistant-draft'),chat[0],'Assistant draft');inside(find(chat,'assistant-send'),chat[0],'Assistant send');
  console.log(name,'fold continuity');await fold(name==='cover'?states[0][1]:'-p');await wait('assistant-draft');assert.equal(find(await layout(),'assistant-draft').text,'fold-draft-'+name,'Fold keeps draft and current chat');await fold(flag);await wait('assistant-draft');assert.equal(find(await layout(),'assistant-draft').text,'fold-draft-'+name);
  if(find(await layout(),'assistant-sidebar-qa-second')){await click('assistant-sidebar-qa-second');await wait('另一条隔离会话');await click('assistant-sidebar-qa-menu');await wait('菜单隔离验收');}
  await click('assistant-rename');await wait('conversation-title');await shot(name+'-rename');await click('assistant-back');await click('assistant-back');await click('assistant-back');await wait('open-media');await reveal('open-media');await click('open-media');await reveal('media-prompt');await input('media-prompt','图像草稿-'+name);await shot(name+'-media');
  await reveal('media-history');await click('media-history');await click('media-record-qa-menu');await wait('media-result-0');await shot(name+'-gallery');await back();await back();await back();await wait('open-desktop');
  report.checked.push(name+': home entries, native chat, rename, image form/gallery, fold draft continuity');
 }
 await connectDesktop();
 await fold('-p');await wait('dsh-draft');assert.equal(find(await layout(),'dsh-draft').text,'电脑会话折叠草稿');let dsh=await layout();inside(find(dsh,'send-message'),dsh[0],'DSH send');await shot('cover-desktop');
 run('shell','hidumper','-s','DisplayManagerService','-a','-rotationlock,0');run('shell','hidumper','-s','DisplayManagerService','-a','-motion,1');await pause(1400);await wait('dsh-draft');dsh=await layout();inside(find(dsh,'dsh-draft'),dsh[0],'Short landscape draft');inside(find(dsh,'send-message'),dsh[0],'Short landscape send');assert.equal(find(dsh,'dsh-draft').text,'电脑会话折叠草稿');await shot('cover-landscape-desktop');report.checked.push('Short cover landscape retains draft and composer bounds');run('shell','hidumper','-s','DisplayManagerService','-a','-motion,0');
 await fold(states[0][1]);await wait('dsh-draft');assert.equal(find(await layout(),'dsh-draft').text,'电脑会话折叠草稿');report.checked.push('DSH paired history and draft survive cover/full switch');
 // Physical rotation is injected through the documented emulator sensor command.
 run('shell','hidumper','-s','DisplayManagerService','-a','-rotationlock,0');run('shell','hidumper','-s','DisplayManagerService','-a','-motion,1');await pause(1400);await wait('dsh-draft');dsh=await layout();inside(find(dsh,'send-message'),dsh[0],'Rotated send');assert.equal(find(dsh,'dsh-draft').text,'电脑会话折叠草稿');await shot('rotated-desktop');report.checked.push('Rotation retains DSH draft and visible send control');
 await keyboardChecks();report.pass=true;
 }
}catch(error){report.error=error.message;await shot('failure').catch(()=>{});process.exitCode=1;}
finally{try{run('shell','hidumper','-s','DisplayManagerService','-a','-motion,0');}catch{}await fold(states[0][1]).catch(()=>{});if(fixture)await fixture.close();await mkdir(path.join(root,'reports'),{recursive:true});await writeFile(path.join(root,'reports/fold-'+target.split(':')[1]+(process.env.FOLD_RESUME==='keyboard'?'-keyboard':'')+'.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify(report,null,2));
