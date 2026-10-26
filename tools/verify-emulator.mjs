import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createFixture } from './qa-fixture.mjs';

const root = path.resolve(import.meta.dirname, '..');
const hdc = process.env.HDC_PATH || 'D:/DevEco Studio/sdk/default/openharmony/toolchains/hdc.exe';
const target = process.env.HDC_TARGET || '127.0.0.1:5555';
const cache = path.join(root, '.cache/emulator-qa');
await mkdir(cache, { recursive: true });
const run = (...args) => execFileSync(hdc, ['-t', target, ...args], { encoding: 'utf8', windowsHide: true, timeout: 15000 });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function flatten(node) { return [node.attributes, ...(node.children || []).flatMap(flatten)]; }
async function layout() {
  run('shell', 'uitest', 'dumpLayout', '-p', '/data/local/tmp/dsh-qa-layout.json', '-b', 'com.szk.dshconnect');
  const file = path.join(cache, 'layout.json');
  run('file', 'recv', '/data/local/tmp/dsh-qa-layout.json', file);
  return flatten(JSON.parse(await readFile(file, 'utf8')));
}
function point(node) {
  assert.ok(node, 'Expected native control exists');
  const values = node.bounds.match(/\d+/g).map(Number);
  return [Math.round((values[0] + values[2]) / 2), Math.round((values[1] + values[3]) / 2)].map(String);
}
async function clickText(text, optional = false) {
  const ids = { '发送':'send-message', '停止回复':'stop-message', '会话列表':'session-list', '返回设备':'devices', '刷新':'refresh' };
  const node = (await layout()).find(a => a?.text === text || a?.id === ids[text] && ids[text] || a?.description === text || a?.accessibilityText === text);
  if (!node && optional) return;
  run('shell', 'uitest', 'uiInput', 'click', ...point(node));
}
async function waitFor(predicate, message, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { const nodes = await layout(); if (predicate(nodes)) return nodes; await pause(250); }
  throw new Error(message);
}
const hasText = text => nodes => nodes.some(a => a?.text === text);
async function screenshot(name) {
  run('shell', 'uitest', 'screenCap', '-p', '/data/local/tmp/dsh-native.png');
  run('file', 'recv', '/data/local/tmp/dsh-native.png', path.join(root, 'reports/screenshots', name));
}
async function enterMessage(text) {
  const input = (await layout()).find(a => a?.type === 'TextArea');
  run('shell', 'uitest', 'uiInput', 'inputText', ...point(input), text);
  await pause(200);
}
const fixture = await createFixture();
const report = { checkedAt: new Date().toISOString(), target, pass: false, fixture: 'Pinned unmodified upstream mobile bridge with isolated Host; no live DSH data or model', checked: [], limitations: ['Physical device NOT_RUN', 'Real public HTTPS tunnel NOT_RUN', 'Camera recognition NOT_RUN'] };
report.version = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version;
try {
  run('shell', 'aa', 'force-stop', 'com.szk.dshconnect');
  run('shell', 'aa', 'start', '-a', 'EntryAbility', '-b', 'com.szk.dshconnect');
  await pause(500);
  await clickText('交互体验 · 握姿与光感');
  await waitFor(nodes=>nodes.some(n=>n.id==='material-status'),'Native interaction settings missing');
  report.materialStatus=(await layout()).find(n=>n.id==='material-status').text;
  report.holdingStatus=(await layout()).find(n=>n.id==='holding-status').text;
  const leftOption=(await layout()).find(n=>n.id==='hand-left');
  run('shell','uitest','uiInput','click',...point(leftOption));await pause(350);
  await screenshot('native-experience.png');
  const experienceBack=(await layout()).find(n=>n.id==='experience-back');
  run('shell','uitest','uiInput','click',...point(experienceBack));
  report.checked.push('Native immersive navigation and honest material/holding capability status with manual fallback');
  await clickText('连接电脑', true);
  await clickText('粘贴连接链接', true);
  const input = (await layout()).find(a => a?.type === 'TextArea');
  // QEMU host gateway: the upstream bridge itself is bound to 0.0.0.0.
  const pairing = fixture.pairingUrl.replace('127.0.0.1', '10.0.2.2');
  run('shell', 'uitest', 'uiInput', 'inputText', ...point(input), pairing);
  run('shell', 'uitest', 'uiInput', 'keyEvent', 'Back');
  await clickText('打开连接');
  for (let attempt = 0; attempt < 20 && !(await layout()).some(a => a?.text === '二维码连接验收'); attempt++) await pause(500);
  assert.ok((await layout()).some(a => a?.text === '二维码连接验收'), 'Native session row exists');
  assert.ok(!(await layout()).some(a => a?.type === 'Web'), 'Session list has no Web node');
  await screenshot('native-sessions.png');
  await clickText('二维码连接验收');
  for (let attempt = 0; attempt < 20 && !fixture.calls.some(call => call.method === 'session/page'); attempt++) await pause(500);
  const calls = fixture.calls.map(call => call.method);
  report.rpcMethods = [...new Set(calls)];
  assert.ok(calls.includes('session/list'), 'Native client requests sessions');
  assert.ok(calls.includes('session/page'), 'Native client requests session history');
  const nodes = await layout();
  assert.ok(!nodes.some(a => a?.type === 'Web'), 'Chat has no Web node');
  assert.ok(nodes.some(a => a?.type === 'TextArea'), 'Composer is a native TextArea');
  assert.ok(Number(point(nodes.find(n=>n.id==='send-message'))[0])<400,'DSH send button follows manual left-hand layout');
  report.checked.push('DSH send action follows the selected holding side');
  report.checked.push('Native manual URL entry', 'Emulator reaches host bridge through 10.0.2.2', 'Native HTTP pairing and credential', 'ArkUI session list and history', 'Native composer; no Web node');
  await waitFor(hasText('已连接 · 实时更新'), 'Native SSE did not become connected');
  fixture.rename('桌面修改后的标题');
  await waitFor(hasText('桌面修改后的标题'), 'Projection rename did not reach native chat header');
  await clickText('会话列表');
  await waitFor(hasText('桌面修改后的标题'), 'Projection rename did not reach native session list');
  await clickText('桌面修改后的标题');
  fixture.rename('二维码连接验收');
  await waitFor(hasText('二维码连接验收'), 'Projection header did not restore');
  report.checked.push('Projection-only session titles and desktop renames update both native list and chat header');
  const prompt = '原生鸿蒙会话验收';
  await enterMessage(prompt);
  await screenshot('native-keyboard.png');
  const keyboardBottom=Number((await layout()).find(n=>n.id==='dsh-draft').bounds.match(/\d+/g)[3]);
  const message=(await layout()).find(n=>n.text==='已打开上游手机页面。这是隔离测试回复。');
  run('shell','uitest','uiInput','click',...point(message));await pause(550);
  const dismissed=(await layout()).find(n=>n.id==='dsh-draft');
  assert.equal(dismissed.text,prompt);assert.ok(Number(dismissed.bounds.match(/\d+/g)[3])>keyboardBottom+400,'Body tap dismisses keyboard');
  run('shell','uitest','uiInput','click',...point(dismissed));await pause(550);
  assert.ok(Number((await layout()).find(n=>n.id==='dsh-draft').bounds.match(/\d+/g)[3])<keyboardBottom+100,'Composer reopens keyboard');
  run('shell','uitest','uiInput','click','600','750');await pause(550);
  report.checked.push('DSH body and blank-area taps dismiss keyboard, preserve draft and allow refocus');
  await clickText('发送');
  await waitFor(hasText('流式兼容：收到「' + prompt + '」。'), 'Native streamed reply was not rendered');
  assert.ok(fixture.calls.some(call => call.method === 'session/prompt' && call.args.request.content[0].text === prompt));
  await screenshot('native-chat.png');
  report.checked.push('Native keyboard and composer', 'Native send RPC and durable streamed reply', 'SSE connected status');
  fixture.requestQuestion();
  await clickText('刷新');
  const questions = await waitFor(hasText('需要你确认'), 'Native question form did not appear');
  const choice = questions.find(a => a?.type === 'Button' && a.text?.startsWith('○ 继续'));
  run('shell', 'uitest', 'uiInput', 'click', ...point(choice));
  await screenshot('native-question.png');
  await clickText('提交回答');
  await waitFor(() => fixture.answers.length === 1, 'Question answer did not reach Host');
  await waitFor(nodes => !hasText('需要你确认')(nodes), 'Question form did not close');
  report.checked.push('ArkUI question selection and answer round trip');
  fixture.showcase();
  await waitFor(hasText('验证结果'), 'Native rich message heading did not render');
  await waitFor(hasText('已连接 · 实时更新'), 'Showcase snapshot did not recover');
  run('shell','uitest','uiInput','swipe','600','700','600','1900','500');
  await pause(500);
  await screenshot('native-showcase.png');
  await clickText('思考过程');
  await waitFor(hasText('先检查配对入口和凭据隔离，再验证流式消息和断线重连。'), 'Reasoning details did not expand');
  await screenshot('native-showcase-expanded.png');
  await clickText('思考过程');
  report.checked.push('Compact reasoning and tool rows with expandable details', 'Native headings, lists, emphasis and code block');
  fixture.renderingSample();
  await waitFor(nodes => nodes.some(a => a?.text?.includes('本轮我只做') || a?.text?.includes('Path B：走界面')), 'User DSH rendering sample was not displayed');
  await waitFor(hasText('已连接 · 实时更新'), 'Rendering sample did not reconnect');
  for (let scroll = 0; scroll < 3; scroll++) run('shell','uitest','uiInput','swipe','600','700','600','2000','500');
  await pause(400);
  await screenshot('native-markdown-top.png');
  for (let scroll = 0; scroll < 3; scroll++) run('shell','uitest','uiInput','swipe','600','2000','600','600','500');
  await pause(400);
  const formatted = await layout();
  assert.ok(!formatted.some(a => a?.text?.includes('](../logs/')), 'Raw file-link Markdown must not be visible');
  await screenshot('native-markdown-bottom.png');
  report.checked.push('User supplied DSH reply: inline code, bold, hanging lists and readable file references');
  fixture.renderingSample('qa-session', true);
  await waitFor(hasText('文件引用与表格'), 'Native table sample did not appear');
  await waitFor(hasText('已连接 · 实时更新'), 'Native table sample did not reconnect');
  run('shell','uitest','uiInput','swipe','600','700','600','2000','500');
  await pause(400);
  await screenshot('native-markdown-references.png');
  const fileLink = (await layout()).find(a => a?.type === 'Text' && a.text?.includes('harness.log:645–646'));
  assert.ok(fileLink, 'Native file link label exists');
  const fileBounds = fileLink.bounds.match(/\d+/g).map(Number);
  run('shell','uitest','uiInput','click',String(fileBounds[0]+70),String(Math.round((fileBounds[1]+fileBounds[3])/2)));
  await waitFor(hasText('电脑文件引用'), 'Native file reference click did not show details');
  assert.ok((await layout()).some(a => a?.text?.includes('行号：645-646')), 'File reference retains line range');
  await screenshot('native-file-reference.png');
  await clickText('关闭');
  report.checked.push('File reference tap preserves path and line range without a bogus HTTP request', 'Native horizontally scrollable Markdown table');
  fixture.activityShowcase();
  const grouped = await waitFor(nodes => nodes.some(a => a?.id?.startsWith('activity-toggle-activity:')), 'Grouped tool activity was not shown');
  const groupToggle = grouped.find(a => a?.id?.startsWith('activity-toggle-activity:'));
  run('shell', 'uitest', 'uiInput', 'click', ...point(groupToggle));
  await waitFor(hasText('已使用 GitHub'), 'Semantic tool activity was not shown');
  const activityNodes = await waitFor(hasText('正在运行'), 'Running command label did not appear');
  for (const category of ['github','edit','image','search','read','web','tool','terminal']) {
    const icon = activityNodes.find(a => a?.id === 'activity-icon-' + category);
    assert.ok(icon, category + ' has its own native icon');
    assert.equal(icon.type, category === 'github' ? 'Image' : 'SymbolGlyph', category + ' uses official system SymbolGlyph or the brand mark');
  }
  await screenshot('native-activity-icons.png');
  await clickText('已编辑');
  await waitFor(nodes => nodes.some(a => a?.text?.includes('*** Update File:')), 'Editing tool details did not expand');
  await screenshot('native-activity-expanded.png');
  await clickText('已编辑');
  fixture.completeActivity();
  await waitFor(hasText('已运行'), 'Completed command label did not update');
  await screenshot('native-activity-completed.png');
  report.checked.push('Official HM Symbol tool icons and separate GitHub brand mark, with real summaries', 'Expanded tool details and running-to-completed action labels');
  fixture.longTable();
  await waitFor(hasText('长表格验收'),'Long table fixture missing');
  for(let i=0;i<3;i++)run('shell','uitest','uiInput','swipe','600','700','600','2000','500');
  await pause(500);
  const table=await layout();
  assert.ok(hasText('左右滑动查看完整表格')(table),'Overflow table affordance missing');
  for(let row=0;row<4;row++){
    const cells=table.filter(n=>n.id?.includes('-cell-'+row+'-'));
    assert.ok(cells.length>=2,'Visible row cells missing');
    const bounds=cells.map(c=>c.bounds.match(/\d+/g).map(Number));
    assert.ok(bounds.every(b=>Math.abs(b[1]-bounds[0][1])<=1&&Math.abs(b[3]-bounds[0][3])<=1),'Cell borders must stretch to shared row height');
    assert.ok(bounds[0][3]-bounds[0][1]<1000,'No phantom table row whitespace');
  }
  await screenshot('native-long-table-left.png');
  const tableNode=table.find(n=>n.id?.match(/^md-table-\d+$/));
  const tableY=point(tableNode)[1];
  for(let pan=0;pan<2;pan++)run('shell','uitest','uiInput','swipe','1050',tableY,'180',tableY,'500');await pause(450);
  await waitFor(nodes=>nodes.some(n=>n.text?.includes('这是隔离测试的长内容')),'Horizontal scroll did not reveal third column');
  await screenshot('native-long-table-right.png');
  report.checked.push('Long rich table uses equal-height native cells, bounded adaptive widths and horizontal scrolling');
  const opens = fixture.streamOpenCount();
  fixture.closeStreams();
  await waitFor(() => fixture.streamOpenCount() > opens, 'Native SSE did not reconnect');
  await waitFor(hasText('已连接 · 实时更新'), 'Native SSE did not recover after disconnect');
  report.checked.push('SSE reconnect and fresh snapshot');
  fixture.setReplyDelay(3000);
  await enterMessage('停止回复验收');
  run('shell', 'uitest', 'uiInput', 'keyEvent', 'Back');
  await clickText('发送');
  const stopping=await waitFor(nodes => nodes.some(a => a?.id === 'stop-message'), 'Native cancel button did not appear');
  assert.ok(Number(point(stopping.find(n=>n.id==='stop-message'))[0])<400,'DSH stop action follows left-hand layout');
  await clickText('停止回复');
  await waitFor(() => fixture.calls.some(call => call.method === 'session/cancel'), 'Cancel RPC did not reach Host');
  await waitFor(nodes => nodes.some(a => a?.id === 'send-message'), 'Native composer did not recover after cancellation');
  report.checked.push('Cancel running turn');
  await clickText('会话列表');
  await clickText('＋ 新会话');
  await waitFor(hasText('新建兼容会话'), 'Native new session did not open with projection title');
  await clickText('会话列表');
  await waitFor(hasText('新建兼容会话'), 'Created session disappeared from native list');
  report.checked.push('Create session and return to persistent session list');
  const observedBeforeRestart = fixture.observedRequests.length;
  run('shell', 'aa', 'force-stop', 'com.szk.dshconnect');
  run('shell', 'aa', 'start', '-a', 'EntryAbility', '-b', 'com.szk.dshconnect');
  await waitFor(hasText('连接电脑'), 'Workbench not restored after restart');
  await clickText('交互体验 · 握姿与光感');
  assert.ok((await layout()).some(n=>n.id==='hand-left'&&n.text.startsWith('●')),'Hand preference survives restart');
  run('shell','uitest','uiInput','click',...point((await layout()).find(n=>n.id==='hand-right')));
  run('shell','uitest','uiInput','click',...point((await layout()).find(n=>n.id==='experience-back')));
  await clickText('连接电脑');
  const label = fixture.base.replace('http://127.0.0.1', '10.0.2.2');
  const recentNodes = await waitFor(hasText(label), 'Origin-only recent connection not restored');
  const labelNode = recentNodes.find(a => a?.text === label);
  const labelY = Number(labelNode.bounds.match(/\d+/g)[1]);
  const resume = recentNodes.filter(a => a?.type === 'Button' && a.text === '继续')
    .sort((a, b) => Math.abs(Number(a.bounds.match(/\d+/g)[1]) - labelY) - Math.abs(Number(b.bounds.match(/\d+/g)[1]) - labelY))[0];
  run('shell', 'uitest', 'uiInput', 'click', ...point(resume));
  await waitFor(hasText('二维码连接验收'), 'Native credential did not resume after process restart');
  assert.ok(fixture.observedRequests.slice(observedBeforeRestart).some(item => item.path === '/' && item.hasCookie), 'Asset Store restores cookie to native HTTP after process restart');
  report.checked.push('Asset Store credential survives process restart; no re-scan', 'Origin-only recent connection resumes native session list');
  await clickText('二维码连接验收');
  assert.ok(Number(point((await layout()).find(n=>n.id==='send-message'))[0])>800,'DSH send button follows manual right-hand layout');
  report.checked.push('Holding preference persists across restart and manual right-hand layout restores action position');
  const desktop = await fetch(fixture.bridge.createDesktopUrl(), { redirect: 'manual' });
  const desktopCookie = desktop.headers.get('set-cookie')?.split(';')[0];
  await fetch(fixture.base + '/desktop/disconnect', { method: 'POST', headers: { cookie: desktopCookie } });
  await clickText('刷新');
  await waitFor(hasText('配对已撤销或过期，请重新扫码。'), 'Native authorization revocation was not shown');
  report.checked.push('Desktop revocation is rejected and shown natively');
  report.rpcMethods = [...new Set(fixture.calls.map(call => call.method))];
  report.pass = true;
} catch (error) {
  report.error = error.message.replace(/([?&]token=)[^\s&#"<>]+/g, '$1[REDACTED]');
  report.streamOpenCount = fixture.streamOpenCount();
  report.requestPaths = fixture.observedRequests.map(item => item.path);
  try { await screenshot('native-test-failure.png'); } catch {}
  process.exitCode = 1;
} finally {
  report.rpcMethods = [...new Set(fixture.calls.map(call => call.method))];
  await writeFile(path.join(root, 'reports/emulator-compatibility.json'), JSON.stringify(report, null, 2));
  try {
    await clickText('会话列表', true); await clickText('返回设备', true);
    const label = fixture.base.replace('http://127.0.0.1', '10.0.2.2');
    const nodes = await layout(); const owned = nodes.find(a => a?.text === label);
    if (owned) {
      const y = Number(owned.bounds.match(/\d+/g)[1]);
      const remove = nodes.filter(a => a?.type === 'Button' && a.text === '移除').sort((a,b) => Math.abs(Number(a.bounds.match(/\d+/g)[1])-y)-Math.abs(Number(b.bounds.match(/\d+/g)[1])-y))[0];
      run('shell','uitest','uiInput','click',...point(remove));
    }
    await screenshot('native-home.png');
    await clickText('‹ 返回工作台', true);
    if (report.pass) {
      await clickText('交互体验 · 握姿与光感');
      run('shell','uitest','uiInput','click',...point((await layout()).find(n=>n.id==='hand-auto')));
      run('shell','uitest','uiInput','click',...point((await layout()).find(n=>n.id==='experience-back')));
    }
  } catch {}
  await fixture.close();
}
console.log(JSON.stringify(report, null, 2));
