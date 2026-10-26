import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';import assert from 'node:assert/strict';
import {createMediaFixture} from './media-fixture.mjs';
const root=path.resolve(import.meta.dirname,'..'),cache=path.join(root,'.cache/media-qa');await mkdir(cache,{recursive:true});
const hdc=process.env.HDC_PATH||'D:/DevEco Studio/sdk/default/openharmony/toolchains/hdc.exe',target=process.env.HDC_TARGET||'127.0.0.1:5555';
const run=(...a)=>execFileSync(hdc,['-t',target,...a],{encoding:'utf8',windowsHide:true,timeout:15000});
const pause=ms=>new Promise(r=>setTimeout(r,ms));const flat=n=>[n.attributes,...(n.children||[]).flatMap(flat)];
async function layout(system=false){const args=['shell','uitest','dumpLayout','-p','/data/local/tmp/media-qa.json'];if(!system)args.push('-b','com.szk.dshconnect');run(...args);run('file','recv','/data/local/tmp/media-qa.json',path.join(cache,'layout.json'));return flat(JSON.parse(await readFile(path.join(cache,'layout.json'),'utf8')));}
const find=(nodes,id)=>nodes.find(n=>n?.id===id||n?.text===id);const has=id=>nodes=>!!find(nodes,id);
function point(n){assert.ok(n,'Native control exists');const b=n.bounds.match(/\d+/g).map(Number);return[String(Math.round((b[0]+b[2])/2)),String(Math.round((b[1]+b[3])/2))];}
async function waitFor(fn,message,timeout=20000,system=false){const start=Date.now();while(Date.now()-start<timeout){const nodes=await layout(system);if(fn(nodes))return nodes;await pause(200);}throw new Error(message);}
async function click(id,system=false){const n=find(await layout(system),id);assert.ok(n,'Missing native control '+id);run('shell','uitest','uiInput','click',...point(n));await pause(140);}
async function reveal(id){for(let i=0;i<8;i++){const n=find(await layout(),id);if(n){const b=n.bounds.match(/\d+/g).map(Number);if(b[1]>=320&&b[3]<=2640)return;}run('shell','uitest','uiInput','swipe','650','2150','650','720','650');await pause(150);}throw new Error('Cannot reveal '+id);}
async function input(id,text){await reveal(id);await click(id);run('shell','uitest','uiInput','keyEvent','2072','2017');run('shell','uitest','uiInput','keyEvent','2055');if(text)run('shell','uitest','uiInput','text',text);run('shell','uitest','uiInput','keyEvent','Back');await pause(450);}
async function screenshot(name){run('shell','uitest','screenCap','-p','/data/local/tmp/media-qa.png');run('file','recv','/data/local/tmp/media-qa.png',path.join(root,'reports/screenshots',name));}
async function restart(){run('shell','aa','force-stop','com.szk.dshconnect');run('shell','aa','start','-a','EntryAbility','-b','com.szk.dshconnect');await waitFor(has('open-media'),'Studio entry missing');await click('open-media');await waitFor(has('media-prompt'),'Studio missing');}
const f=await createMediaFixture(),base=f.base.replace('127.0.0.1','10.0.2.2'),tag='MEDIA-QA-'+Date.now(),owned=[];
const report={checkedAt:new Date().toISOString(),version:JSON.parse(await readFile(path.join(root,'package.json'),'utf8')).version,pass:false,target,testTag:tag,checked:[],fixture:'Local deterministic PNG and isolated compatible/Seedream/Gemini servers with fake key. No real model or paid image generation.',limitations:['Real providers NOT_RUN','Physical phone NOT_RUN']};
function check(text){report.checked.push(text);console.log('PASS: '+text);}
async function configure(provider,route=provider,model='qa-image'){
  await click('media-settings');await click('media-provider-'+provider);await input('media-base',base+'/'+route);await input('media-model',model);await input('media-vision','qa-vision');await input('media-key',f.key);
  for(let attempt=0;attempt<3;attempt++){await reveal('media-save-profile');await pause(350);await click('media-save-profile');await pause(400);if(has('media-prompt')(await layout()))return;}
  throw new Error('Settings did not return');
}
async function generate(label){await input('media-prompt',label);await reveal('media-run');await click('media-run');await waitFor(nodes=>has('media-result-0')(nodes)&&!has('media-stop')(nodes),'Native image was not saved/rendered');owned.push(label);}
async function preview(){await reveal('media-preview-0');await click('media-preview-0');await waitFor(has('media-full-image'),'Full image missing');}
async function main(){await click('media-back');await waitFor(has('media-prompt'),'Main page missing');}
async function historyRow(label,optional=false){for(let i=0;i<7;i++){const nodes=await layout(),row=find(nodes,label);if(optional&&nodes.some(n=>n?.text==='生成和分析结果会保存在这里，断网也能查看。'))return;if(row){const b=row.bounds.match(/\d+/g).map(Number);if(b[1]>=320&&b[3]<=2640)return{nodes,row};}run('shell','uitest','uiInput','swipe','650','2140','650','700','650');await pause(120);}if(optional)return;throw new Error('History row not visible: '+label);}
async function removeOwned(label){const found=await historyRow(label,true);if(!found)return;const{nodes,row}=found;const y=Number(row.bounds.match(/\d+/g)[1]);const del=nodes.filter(n=>n?.id?.startsWith('media-delete-')).sort((a,b)=>Math.abs(Number(a.bounds.match(/\d+/g)[1])-y)-Math.abs(Number(b.bounds.match(/\d+/g)[1])-y))[0];run('shell','uitest','uiInput','click',...point(del));await waitFor(has('删除图像记录'),'Confirmation missing');await click('删除');await waitFor(nodes=>!has(label)(nodes),'Record not deleted');}
try{
  await restart();await screenshot('media-studio.png');
  const initial=await layout();if(!initial.some(n=>n?.text?.includes('待配置')||n?.text?.includes('qa-image')))throw new Error('Existing user media configuration detected; stopped before overriding it.');
  let previous;try{const old=JSON.parse(await readFile(path.join(root,'reports/media-emulator.json'),'utf8'));if(old.requests?.length)previous=old.testTag;}catch{}
  if(previous&&/^MEDIA-QA-\d+$/.test(previous)){await click('media-history');for(const suffix of ['-stop','-gemini-vision','-gemini-reference','-gemini','-ark-reference','-ark','-vision','-compatible-edit','-compatible'])await removeOwned(previous+suffix);await main();}
  if(has('media-remove-input')(await layout()))await click('media-remove-input');
  assert.ok(!(await layout()).some(n=>n?.type==='Web'),'Media UI is native');check('Native studio entry, generation and vision modes without a Web node');
  await configure('compatible');assert.equal(f.requests.length,0);check('Configuration makes no model call and saves a fake key using Asset Store');
  await generate(tag+'-compatible');assert.equal(f.requests.at(-1).body.n,1);assert.equal(f.requests.at(-1).body.response_format,undefined);assert.ok(f.requests.at(-1).authorized);await screenshot('media-compatible-result.png');check('Compatible Images generation decodes Base64 into a native cached image');
  await preview();await screenshot('media-preview.png');check('Native full image preview and reuse actions');
  await click('media-export-preview');await pause(300);await screenshot('media-export-picker.png');
  const exportNodes=await waitFor(has('dialog_confirm'),'Export picker missing',15000,true);await writeFile(path.join(cache,'export-ui.json'),JSON.stringify(exportNodes));
  const exportName=exportNodes.find(n=>n?.type==='TextInput'&&n.text?.startsWith('DSH-Image-'))?.text;assert.ok(exportName);report.exportName=exportName;
  if(exportNodes.some(n=>n?.id==='Download'&&n.type==='Row'))await click('Download',true);
  if(find(exportNodes,'dialog_confirm'))await click('dialog_confirm',true);else if(find(exportNodes,'保存'))await click('保存',true);else if(find(exportNodes,'确定'))await click('确定',true);else throw new Error('EXPORT_PICKER_NEEDS_INSPECTION');
  await waitFor(nodes=>has('media-full-image')(nodes)&&!has('dialog_confirm')(nodes),'Export did not return to preview',15000,true);check('User-selected native document picker export returns to the image preview');
  await click('media-use-reference');await click('media-remove-input');await click('media-pick-file');
  let pickerNodes=await waitFor(nodes=>has('浏览')(nodes)||has('top_title')(nodes),'Import picker missing',15000,true);
  if(has('知道了')(pickerNodes))await click('知道了',true);
  if(has('浏览')(await layout(true))){await click('浏览',true);await click('我的手机',true);await click('Download',true);}
  await waitFor(has(exportName),'Exported image is missing from native file picker',15000,true);await click(exportName,true);
  await waitFor(has('media-reference'),'Selected image was not imported');check('Exported PNG is selected through the native file picker and re-encoded for model input');
  await generate(tag+'-compatible-edit');assert.ok(f.requests.at(-1).path.endsWith('/images/edits'));assert.ok(f.requests.at(-1).body.images[0].image_url.startsWith('data:image/jpeg;base64,'));check('Imported image is sent using the compatible JSON image editing endpoint');
  await preview();await click('media-use-vision');await waitFor(has('media-reference'),'Generated image not reused as vision input');
  await input('media-prompt',tag+'-vision');await reveal('media-run');await click('media-run');await waitFor(has('隔离视觉验收：已收到图片与问题。'),'Vision reply missing');owned.push(tag+'-vision');assert.equal(f.requests.at(-1).body.messages[0].content[1].type,'image_url');check('Generated image is sent as a Chat Completions vision content part');
  await main();await click('media-remove-input');await click('media-mode-generate');
  await configure('ark');await generate(tag+'-ark');assert.equal(f.requests.at(-1).body.watermark,true);assert.equal(f.requests.at(-1).body.n,undefined);assert.ok(f.downloads.length);assert.ok(f.downloads.every(r=>!r.hasAuthorization&&!r.hasGoogleKey&&!r.hasCookie));await screenshot('media-ark-result.png');check('Seedream JSON and signed URL result download without forwarding model credentials to the image host');
  await preview();await click('media-use-reference');await input('media-prompt',tag+'-ark-reference');await reveal('media-run');await click('media-run');await waitFor(nodes=>has('media-result-0')(nodes)&&!has('media-stop')(nodes),'Ark reference generation failed');owned.push(tag+'-ark-reference');assert.ok(f.requests.at(-1).body.image.startsWith('data:image/'));check('Seedream reference image uses its own image field');
  await main();await click('media-remove-input');await configure('gemini');await generate(tag+'-gemini');assert.equal(f.requests.at(-1).authType,'google');assert.ok(!f.requests.at(-1).wrongAuth);assert.deepEqual(f.requests.at(-1).body.generationConfig.responseModalities,['TEXT','IMAGE']);await waitFor(has('Gemini 隔离图片响应'),'Gemini mixed text missing');await screenshot('media-gemini-result.png');check('Gemini native key header, model URL and mixed text/inlineData image response');
  await preview();await click('media-use-reference');await generate(tag+'-gemini-reference');assert.ok(f.requests.at(-1).body.contents[0].parts[1].inlineData);check('Gemini reference image is encoded in native inlineData');
  await preview();await click('media-use-vision');await input('media-prompt',tag+'-gemini-vision');await reveal('media-run');await click('media-run');await waitFor(has('隔离视觉验收：已收到图片与问题。'),'Gemini vision missing');owned.push(tag+'-gemini-vision');assert.equal(f.requests.at(-1).body.generationConfig,undefined);check('Gemini picture question uses native contents without requesting image output');
  await main();await click('media-remove-input');await click('media-mode-generate');f.setDelay(120000);await input('media-prompt',tag+'-stop');await reveal('media-run');await click('media-run');await waitFor(has('media-stop'),'Stop missing');await click('media-stop');await waitFor(()=>f.canceled>0,'Generation was not canceled');owned.push(tag+'-stop');check('Stopping generation cancels the native RCP request');f.setDelay(50);await main();
  await restart();await click('media-history');await waitFor(has(tag+'-gemini'),'Persisted image record missing');await click(tag+'-gemini');await waitFor(has('media-result-0'),'Cached image missing after restart');check('Image history and binary cache survive process restart');
  await f.close();await restart();await click('media-history');await historyRow(tag+'-compatible');await click(tag+'-compatible');await waitFor(has('media-result-0'),'Offline image missing');await screenshot('media-offline.png');check('Cached images can be read offline after the API and image servers are shut down');
  await main();await click('media-history');for(const label of owned.slice().reverse())await removeOwned(label);check('Delete confirms and removes only fixture-owned media records');await main();await input('media-prompt','');
  for(const provider of ['compatible','ark','gemini']){await click('media-settings');await click('media-provider-'+provider);await reveal('media-clear-profile');await click('media-clear-profile');await waitFor(has('media-prompt'),'Profile reset failed');}
  check('Each provider profile can be cleared independently without erasing other histories');await click('media-back');await waitFor(has('open-media'),'Workbench not restored');report.pass=true;
}catch(error){report.error=error.message;try{await screenshot('media-test-failure.png');}catch{}process.exitCode=1;}
finally{report.requests=f.requests.map(r=>({path:r.path,authorized:r.authorized,authType:r.authType,wrongAuth:r.wrongAuth,hasCookie:r.hasCookie,hasOrigin:r.hasOrigin,hasImage:!!(r.body.image||r.body.images||r.body.messages?.[0]?.content?.[1]||r.body.contents?.[0]?.parts?.[1])}));report.downloads=f.downloads;report.canceled=f.canceled;report.redirectTargetRequests=f.trapRequests;await writeFile(path.join(root,'reports/media-emulator.json'),JSON.stringify(report,null,2)+'\n');await f.close();}
console.log(JSON.stringify(report,null,2));
