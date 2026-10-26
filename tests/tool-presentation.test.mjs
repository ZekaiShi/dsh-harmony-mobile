import test from 'node:test';
import assert from 'node:assert/strict';
import { ToolPresentation } from '../.cache/core/ToolPresentation.mjs';
import { ChatReducer } from '../.cache/core/ChatReducer.mjs';
test('tool rows distinguish shell, editing, image and GitHub activity from actual tool inputs', () => {
  assert.deepEqual({...ToolPresentation.describe('pwsh',{command:'npm run build:hap'})},{category:'terminal',summary:'npm run build:hap'});
  assert.deepEqual({...ToolPresentation.describe('apply_patch',{input:'*** Begin Patch\n*** Update File: app/MarkdownView.ets\n*** Add File: tests/render.mjs'})},{category:'edit',summary:'MarkdownView.ets 等 2 个文件'});
  assert.equal(ToolPresentation.describe('view_image',{path:'C:\\qa\\render.png'}).summary,'render.png');
  assert.equal(ToolPresentation.describe('mcp__codex_apps__github_fetch',{}).category,'github');
  assert.equal(ToolPresentation.describe('read_file',{path:'/qa/test.ts'}).category,'read');
  assert.equal(ToolPresentation.describe('search_files',{query:'Markdown'}).category,'search');
});
test('unknown tools keep their identity and summaries redact URL credentials and remain bounded', () => {
  assert.equal(ToolPresentation.describe('new_unknown_tool',{}).summary,'new_unknown_tool');
  assert.equal(ToolPresentation.describe('new_unknown_tool',{}).category,'tool');
  assert.equal(ToolPresentation.describe('web_fetch',{url:'https://example.com/a?token=private-value&x=1'}).summary.includes('private-value'),false);
  assert.ok(ToolPresentation.describe('pwsh',{command:'a'.repeat(1000)}).summary.length<=240);
});
test('tool result updates status while preserving its category and readable summary', () => {
  const events=[{type:'tool/call',data:{stepId:'one',callId:'edit',name:'edit_file',arguments:{path:'/qa/Index.ets'}}},{type:'tool/result',data:{stepId:'one',message:{content:[{type:'tool-result',toolCallId:'edit',isError:true,content:[{type:'text',text:'失败详情'}]}]}}}];
  const block=ChatReducer.project(events).messages[0].blocks[0];
  assert.equal(block.category,'edit'); assert.equal(block.summary,'Index.ets'); assert.equal(block.status,'error');
  assert.equal(ToolPresentation.label(block.category,block.status),'编辑失败');
  assert.equal(ToolPresentation.label('terminal','running'),'正在运行');
  assert.equal(ToolPresentation.label('terminal','done'),'已运行');
});
