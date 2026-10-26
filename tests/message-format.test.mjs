import test from 'node:test';
import assert from 'node:assert/strict';
import { MessageFormat } from '../.cache/core/MessageFormat.mjs';
import { MessageLink } from '../.cache/core/MessageLink.mjs';
import { readFileSync } from 'node:fs';
test('native formatting retains code literally and renders headings, lists and inline emphasis', () => {
  const sections = MessageFormat.sections('## 验证结果\n\n已经**完成**，运行 `npm test`。\n\n- 配对通过\n1. 连接通过\n\n```ts\nconst value = "**literal**";\n```');
  assert.deepEqual(sections.map(s=>s.kind),['heading','paragraph','list','list','code']);
  assert.equal(sections[1].parts.find(p=>p.style==='bold').text,'完成');
  assert.equal(sections[1].parts.find(p=>p.style==='code').text,'npm test');
  assert.equal(sections[4].text,'const value = "**literal**";');
  assert.equal(sections[4].language,'ts');
});
test('streaming unfinished code fences and plain text remain visible without HTML execution', () => {
  assert.equal(MessageFormat.sections('```sh\necho hello')[0].text,'echo hello');
  assert.equal(MessageFormat.sections('<script>hello</script>')[0].text,'<script>hello</script>');
  assert.equal(MessageFormat.sections('第一行\n第二行')[0].text,'第一行 第二行');
});
test('the user supplied DSH excerpt keeps relative file links out of visible text', () => {
  const sections = MessageFormat.sections(readFileSync(new URL('./fixtures/dsh-markdown.md', import.meta.url),'utf8'));
  const parts = sections.flatMap(section=>section.parts);
  const links = parts.filter(part=>part.href);
  assert.deepEqual(links.map(part=>[part.text,part.href]),[
    ['harness.log:487–490','../logs/harness.log#L487-L490'],
    ['harness.log:645–646','../logs/harness.log#L645-L646']
  ]);
  assert.equal(parts.some(part=>part.text.includes('](../logs/')),false);
  assert.equal(parts.some(part=>part.style==='code' && part.text==='custom-bash (./custom-bash.mjs): never started'),true);
  assert.equal(parts.some(part=>part.bold && part.text==='没有修改任何文件或配置'),true);
  assert.equal(sections.filter(section=>section.kind==='list').every(section=>section.marker==='•' && !section.text.startsWith('•')),true);
});
test('inline links handle balanced paths, titles, nested emphasis and reference definitions', () => {
  const sections = MessageFormat.sections('[**日志** `file`](./logs/a(b).log#L2 "查看")，请看[官方][guide]。\n\n[guide]: https://example.com/guide');
  const parts = sections[0].parts;
  assert.equal(parts[0].bold,true); assert.equal(parts[0].href,'./logs/a(b).log#L2');
  assert.equal(parts[2].style,'code'); assert.equal(parts[2].href,'./logs/a(b).log#L2');
  assert.equal(parts.find(part=>part.text==='官方').href,'https://example.com/guide');
  assert.equal(sections.length,1);
});
test('code spans protect markdown syntax and double backticks retain literal backticks', () => {
  const parts=MessageFormat.inline('代码 ``a`b`` 与 `**raw** [x](y)`、\\[普通\\]、**粗体 `code`**。');
  assert.equal(parts.find(part=>part.text==='a`b').style,'code');
  assert.equal(parts.find(part=>part.text==='**raw** [x](y)').href,'');
  assert.equal(parts.find(part=>part.text==='code').bold,true);
  assert.equal(parts.filter(part=>part.href).length,0);
});
test('lists retain hanging markers, nesting, continuations, ordered numbers and task state', () => {
  const sections=MessageFormat.sections('- 很长的第一行\n  接在同一个列表项。\n  - 子项\n12. 编号\n- [x] 完成\n- [ ] 待办');
  assert.equal(sections[0].text,'很长的第一行 接在同一个列表项。');
  assert.deepEqual(sections.map(s=>s.marker),['•','•','12.','☑','☐']);
  assert.equal(sections[1].level,1); assert.equal(sections[1].gap,4);
});
test('fenced code preserves leading blank lines, internal shorter fences and empty lines', () => {
  const sections=MessageFormat.sections('````md\n\n```js\nconst x = 1;\n```\n\n````\n\n> 引用\n> 第二行');
  assert.equal(sections[0].text,'\n```js\nconst x = 1;\n```\n');
  assert.equal(sections[1].kind,'quote');
});
test('native tables preserve escaped pipes and inline code and do not consume following prose', () => {
  const sections=MessageFormat.sections('| 项目 | 说明 |\n| --- | :---: |\n| A | `a|b` |\n| B | x\\|y |\n\n结束');
  assert.equal(sections[0].kind,'table'); assert.equal(sections[0].rows.length,3);
  assert.equal(sections[0].rows[1].cells[1].parts[0].text,'a|b');
  assert.equal(sections[0].rows[2].cells[1].text,'x|y');
  assert.equal(sections[1].text,'结束');
});
test('file and web destinations are classified without launching untrusted schemes', () => {
  assert.equal(MessageLink.parse('../logs/harness.log#L645-L646').path,'../logs/harness.log');
  assert.equal(MessageLink.parse('../logs/harness.log#L645-L646').line,'645-646');
  assert.equal(MessageLink.parse('https://example.com/help').kind,'web');
  assert.equal(MessageLink.parse('C:\\logs\\harness.log').kind,'file');
  for(const href of ['javascript:alert(1)','data:text/html,test','//evil.example/x','https://example.com/\nheader','file:///a%00b']) assert.equal(MessageLink.parse(href).kind,'blocked',href);
});

test('hostile unmatched Markdown has bounded syntax work without losing content', () => {
  for (const input of ['['.repeat(32768), '<'.repeat(32768), '`'.repeat(32768), 'x'.repeat(65537)]) {
    assert.equal(MessageFormat.inline(input).map(part => part.text).join(''), input);
  }
  assert.equal(MessageFormat.inline('['.repeat(1000) + '**尾部**').map(part => part.text).join(''), '['.repeat(1000) + '**尾部**');
});
