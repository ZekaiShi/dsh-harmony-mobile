import test from 'node:test';
import assert from 'node:assert/strict';
import { BackNavigation } from '../.cache/core/BackNavigation.mjs';
import { SessionDrafts } from '../.cache/core/SessionDrafts.mjs';

test('all three modes return through their own list or landing page before the workbench', () => {
  const chain = (mode, start, expected) => {
    const seen = []; let screen = start;
    for (let i = 0; i < expected.length; i++) { screen = BackNavigation.target(mode, screen); seen.push(screen); }
    assert.deepEqual(seen, expected);
  };
  chain('assistant', 'context', ['chat','list','home']);
  chain('assistant', 'providers', ['settings','list','home']);
  chain('media', 'models', ['settings','main','home']);
  chain('desktop', 'chat', ['sessions','devices','home','exit']);
  chain('desktop', 'pin', ['devices','home','exit']);
});
test('nested settings and preview restore their actual entry page without skipping a parent', () => {
  assert.equal(BackNavigation.target('assistant','settings','chat'), 'chat');
  assert.equal(BackNavigation.target('media','settings','history'), 'history');
  assert.equal(BackNavigation.target('media','settings','detail'), 'detail');
  assert.equal(BackNavigation.target('media','preview','detail'), 'detail');
  assert.equal(BackNavigation.target('media','detail','history'), 'history');
  assert.equal(BackNavigation.target('media','detail','main'), 'main');
  assert.equal(BackNavigation.target('media','settings','settings'), 'main');
  assert.equal(BackNavigation.target('assistant','settings','providers'), 'list');
});
test('desktop drafts survive returning through lists and remain isolated by origin and session', () => {
  const drafts = new SessionDrafts(); drafts.save('https://one.example','same','草稿 A'); drafts.save('https://two.example','same','草稿 B'); drafts.save('https://one.example','other','草稿 C');
  assert.equal(drafts.read('https://one.example','same'),'草稿 A');
  assert.equal(drafts.read('https://two.example','same'),'草稿 B');
  drafts.save('https://one.example','same',''); assert.equal(drafts.read('https://one.example','same'),'');
  drafts.forget('https://one.example'); assert.equal(drafts.read('https://one.example','other'),''); assert.equal(drafts.read('https://two.example','same'),'草稿 B');
});
test('desktop in-memory drafts have bounded count/size and ignore incomplete connections', () => {
  const drafts = new SessionDrafts(); drafts.save('','one','ignored'); drafts.save('x','','ignored');
  assert.equal(drafts.read('','one'),''); assert.equal(drafts.read('x',''),'');
  for (let i = 0; i < 101; i++) drafts.save('origin',String(i),'value');
  assert.equal(drafts.read('origin','0'),''); assert.equal(drafts.read('origin','1'),'value');
  drafts.save('origin','100','x'.repeat(18000)); assert.equal(drafts.read('origin','100').length,16000);
});
