import {test} from 'node:test';
import assert from 'node:assert/strict';
import {TokenUsage,RequestUsage} from '../.cache/core/TokenUsage.mjs';

test('usage snapshots replace cumulative counts without adding cache/reasoning twice',()=>{
  let u=TokenUsage.packet('chat',{usage:{prompt_tokens:100,completion_tokens:20,total_tokens:120,prompt_tokens_details:{cached_tokens:50},completion_tokens_details:{reasoning_tokens:6}}},new RequestUsage());
  assert.deepEqual([u.input,u.output,u.total,u.cached,u.reasoning,u.source],[100,20,120,50,6,'reported']);
  u=TokenUsage.packet('chat',{usage:{prompt_tokens:100,completion_tokens:20,total_tokens:120}},u);
  assert.equal(u.total,120);
  const response=TokenUsage.packet('responses',{response:{usage:{input_tokens:9,output_tokens:3,total_tokens:12}}},new RequestUsage());
  assert.equal(response.total,12);
});
test('Claude start/cache counts merge with cumulative output deltas',()=>{
  let u=TokenUsage.packet('anthropic',{message:{usage:{input_tokens:10,cache_read_input_tokens:20,cache_creation_input_tokens:5,output_tokens:1}}},new RequestUsage());
  u=TokenUsage.packet('anthropic',{usage:{output_tokens:9}},u);
  assert.deepEqual([u.input,u.output,u.total,u.cached,u.cacheWrite],[35,9,44,20,5]);
});
test('Gemini counts include thoughts in output and preserve reported totals',()=>{
  let u=TokenUsage.packet('gemini',{usageMetadata:{promptTokenCount:10,candidatesTokenCount:5,thoughtsTokenCount:3,cachedContentTokenCount:4,totalTokenCount:18}},new RequestUsage());
  u=TokenUsage.packet('gemini',{usageMetadata:{promptTokenCount:10,candidatesTokenCount:5,thoughtsTokenCount:3,totalTokenCount:18}},u);
  assert.deepEqual([u.input,u.output,u.total,u.reasoning,u.cached],[10,8,18,3,4]);
});
test('missing and invalid usage never become an authoritative zero bill',()=>{
  const missing=TokenUsage.packet('chat',{},new RequestUsage());assert.equal(missing.source,'unknown');assert.equal(missing.total,-1);
  const invalid=TokenUsage.packet('chat',{usage:{prompt_tokens:-1,completion_tokens:NaN,total_tokens:Infinity}},missing);assert.equal(invalid.source,'unknown');
  const zero=TokenUsage.packet('chat',{usage:{prompt_tokens:0,completion_tokens:0,total_tokens:0}},missing);assert.equal(zero.source,'reported');assert.equal(zero.total,0);
  assert.equal(TokenUsage.estimate('用户问题','回答').source,'estimated');
});
