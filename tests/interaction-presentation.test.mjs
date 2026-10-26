import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionPresentation } from '../.cache/core/SessionPresentation.mjs';
import { InteractionPolicy } from '../.cache/core/InteractionPolicy.mjs';
import { TableLayout } from '../.cache/core/TableLayout.mjs';
import { MessageFormat } from '../.cache/core/MessageFormat.mjs';

test('DSH projection titles take upstream precedence and retain both historical aliases', () => {
  for (const field of ['title','sessionTitle','session.title']) assert.equal(SessionPresentation.title({projections:{values:{[field]:'  更新当前 dsh 的方法  '}}}), '更新当前 dsh 的方法');
  assert.equal(SessionPresentation.title({title:'old',projections:{values:{title:'new',sessionTitle:'older'}}}),'new');
  assert.equal(SessionPresentation.title({title:'legacy',projections:{values:{title:' ',sessionTitle:null}}}),'legacy');
  assert.equal(SessionPresentation.title({projections:{values:{title:42}}}),'新会话');
  assert.equal(SessionPresentation.projectedTitle(undefined),'');
});
test('holding adaptation only follows a confirmed left grip, with explicit manual overrides', () => {
  for (const status of [0,2,3,16,99]) assert.equal(InteractionPolicy.left('auto',status),false);
  assert.equal(InteractionPolicy.left('auto',1),true);
  for (const status of [0,1,2,3,16]) {
    assert.equal(InteractionPolicy.left('left',status),true);
    assert.equal(InteractionPolicy.left('right',status),false);
  }
  assert.equal(InteractionPolicy.mode('corrupted'),'auto');
});
test('wide table columns preserve rich links and code, allocate bounded readable widths and retain following prose', () => {
  const sections=MessageFormat.sections('| 步骤 | 对象 | 说明 |\n| --- | --- | --- |\n| P0 隔离 | `profiles\\web\\node_modules\\@deepseek-ai\\dsh-host-apiproxy` | 这是用于验证长文本换行和表格单元格对齐的说明。 |\n| P0 备份 | [package.json:5](./package.json#L5) | 备份 |\n\n之后的正文');
  const rows=sections[0].rows, widths=TableLayout.widths(rows);
  assert.ok(widths[0]<widths[1]); assert.ok(widths.every(w=>w>=96&&w<=300));
  assert.equal(TableLayout.total(rows),widths.reduce((sum,w)=>sum+w,0));
  assert.equal(rows[1].cells[1].parts[0].style,'code');
  assert.equal(rows[2].cells[1].parts[0].href,'./package.json#L5');
  assert.equal(sections[1].text,'之后的正文');
});
test('table line breaks render outside code while literal code and other HTML stay inert', () => {
  const rows=MessageFormat.sections('| 内容 | 示例 |\n| --- | --- |\n| 第一行<br>第二行 | `<br>` 与 <script>hello</script> |')[0].rows;
  assert.equal(rows[1].cells[0].parts.map(p=>p.text).join(''),'第一行\n第二行');
  assert.equal(rows[1].cells[1].parts[0].text,'<br>');
  assert.equal(rows[1].cells[1].parts[0].style,'code');
  assert.ok(rows[1].cells[1].parts.some(p=>p.text.includes('<script>hello</script>')));
});
