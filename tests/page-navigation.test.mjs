import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the real shared controller, replacing only the platform stack with an in-memory double.
class Stack {
  names=[]; calls=[];
  getAllPathName(){return this.names.slice();}
  pushPath(info,animated){this.names.push(info.name);this.calls.push(['push',animated]);}
  replacePath(info,animated){this.names.splice(Math.max(0,this.names.length-1),1,info.name);this.calls.push(['replace',animated]);}
  popToIndex(index,animated){this.names.length=index+1;this.calls.push(['pop',animated]);}
  clear(animated){this.names=[];this.calls.push(['clear',animated]);}
}
const source=await readFile(new URL('../entry/src/main/ets/platform/PageNavigation.ets',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const exports={};vm.runInNewContext(compiled,{exports,NavPathStack:Stack});const {PageNavigation}=exports;
test('settings, picker and new conversations animate forward while back restores the nearest matching parent',()=>{
  const navigation=new PageNavigation('list');navigation.forward('chat',true);navigation.forward('chat',true);navigation.forward('settings');navigation.forward('providers');
  navigation.backward('settings');assert.deepEqual(navigation.paths.names,['chat','chat','settings']);
  navigation.backward('chat');assert.deepEqual(navigation.paths.names,['chat','chat']);
  navigation.backward('list');assert.deepEqual(navigation.paths.names,[]);
  assert.ok(navigation.paths.calls.every(call=>call[1]===true),'Every native stack operation keeps animation enabled');
});
test('rename has one animated native route and returns to the same conversation',()=>{
  const navigation=new PageNavigation('list');navigation.forward('chat',true);navigation.forward('rename');navigation.forward('rename');
  assert.deepEqual(navigation.paths.names,['chat','rename']);navigation.backward('chat');assert.deepEqual(navigation.paths.names,['chat']);
  assert.deepEqual(navigation.paths.calls.map(c=>c[0]),['push','push','pop']);assert.ok(navigation.paths.calls.every(c=>c[1]===true));
});
test('repeated ordinary taps do not pile up identical settings pages, but a fresh conversation always pushes',()=>{
  const navigation=new PageNavigation('main');navigation.forward('settings');navigation.forward('settings');assert.deepEqual(navigation.paths.names,['settings']);
  navigation.forward('chat',true);navigation.forward('chat',true);assert.deepEqual(navigation.paths.names,['settings','chat','chat']);
});
test('wide-pane conversation selection replaces its destination instead of growing the back stack',()=>{
 const navigation=new PageNavigation('list');navigation.forward('chat',true);navigation.forward('chat',true,true);navigation.forward('chat',true,true);
 assert.deepEqual(navigation.paths.names,['chat']);assert.deepEqual(navigation.paths.calls.map(c=>c[0]),['push','replace','replace']);
});
test('media preview returns through detail and history; missing stale parents recover using an animated replacement',()=>{
  const navigation=new PageNavigation('main');for(const page of ['history','detail','preview'])navigation.forward(page);
  navigation.backward('detail');assert.deepEqual(navigation.paths.names,['history','detail']);navigation.backward('history');assert.deepEqual(navigation.paths.names,['history']);
  navigation.backward('main');navigation.backward('settings');assert.deepEqual(navigation.paths.names,['settings']);assert.deepEqual(navigation.paths.calls.at(-1),['replace',true]);
});
