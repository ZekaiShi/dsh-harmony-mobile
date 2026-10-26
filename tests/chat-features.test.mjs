import test from 'node:test';
import assert from 'node:assert/strict';
import { AssistantCore, AssistantData, LocalMessage, ModelProfile } from '../.cache/core/AssistantCore.mjs';
import { ChatAttachment, ChatFeatures } from '../.cache/core/ChatFeatures.mjs';
import { ChatProtocol } from '../.cache/core/ChatProtocol.mjs';
import { ProviderModels } from '../.cache/core/ProviderModels.mjs';

const profile = (protocol = 'chat', provider = 'custom', model = 'qa-model') => Object.assign(new ModelProfile(), { protocol, provider, model, base: 'https://safe.example/v1' });
const ref = (kind = 'image') => Object.assign(new ChatAttachment(), { file: kind === 'image' ? 'qa-image.jpeg' : kind === 'pdf' ? 'qa-doc.pdf' : 'qa-text.txt', name: kind + (kind === 'pdf' ? '.pdf' : '.txt'), mime: kind === 'image' ? 'image/jpeg' : kind === 'pdf' ? 'application/pdf' : 'text/plain', kind, size: 32, width: kind === 'image' ? 100 : 0, height: kind === 'image' ? 100 : 0, tokens: 50 });
const resolve = a => ({ kind: a.kind, name: a.name, mime: a.mime, data: a.kind === 'text' ? 'hello <file> 世界' : 'YWJj' });
const wire = (p, attachments = [], text = '分析附件') => {
  const c = AssistantCore.create('qa', p, 1); c.messages.push(Object.assign(new LocalMessage(), { text, attachments }));
  return JSON.parse(ChatProtocol.wire(p, AssistantCore.request(c, resolve), 'dummy-key', AssistantCore.endpoint(p.base).url).body);
};

test('attachment-only messages use native image and PDF blocks across four protocols; text-only wire stays simple', () => {
  for (const protocol of ['chat', 'responses', 'anthropic', 'gemini']) {
    const p = profile(protocol), b = wire(p, [ref()], '');
    const block = protocol === 'chat' || protocol === 'anthropic' ? b.messages[0].content[0] : protocol === 'responses' ? b.input[0].content[0] : b.contents[0].parts[0];
    if (protocol === 'chat') assert.equal(block.image_url.url, 'data:image/jpeg;base64,YWJj');
    else if (protocol === 'responses') assert.equal(block.image_url, 'data:image/jpeg;base64,YWJj');
    else if (protocol === 'anthropic') assert.deepEqual(block.source, { type: 'base64', media_type: 'image/jpeg', data: 'YWJj' });
    else assert.equal(block.inlineData.mimeType, 'image/jpeg');
    const plain = wire(p, [ref('text')]);
    const bodyText = protocol === 'gemini' ? plain.contents[0].parts[0].text : (plain.messages || plain.input)[0].content;
    assert.match(bodyText, /hello <file> 世界/);
    if (protocol !== 'chat') assert.ok(JSON.stringify(wire(p, [ref('pdf')])).includes('application/pdf'));
    else assert.throws(() => wire(p, [ref('pdf')]), /PDF/);
  }
});
test('attachments survive native consecutive-turn merging without changing the source history', () => {
  for (const protocol of ['anthropic', 'gemini']) {
    const p = profile(protocol), c = AssistantCore.create('qa', p, 1);
    c.messages = [Object.assign(new LocalMessage(), { text: 'first', attachments: [ref()] }), Object.assign(new LocalMessage(), { text: 'second', attachments: [ref('text')] })];
    const before = JSON.stringify(c), request = AssistantCore.request(c, resolve);
    const b = JSON.parse(ChatProtocol.wire(p, request, 'dummy', AssistantCore.endpoint(p.base).url).body);
    assert.equal((b.messages || b.contents).length, 1); assert.match(JSON.stringify(b), /hello <file>/);
    assert.equal(JSON.stringify(c), before);
  }
});
test('private attachment references migrate older data and reject traversal, corrupt metadata and too many attachments', () => {
  const d = new AssistantData(); d.profile = profile(); const c = AssistantCore.create('old', d.profile, 1); d.conversations.push(c);
  const m = Object.assign(new LocalMessage(), { text: 'old' }); delete m.attachments; c.messages.push(m); delete c.draftAttachments;
  const restored = AssistantCore.restore(JSON.stringify(d)); assert.deepEqual(restored.conversations[0].draftAttachments, []); assert.deepEqual(restored.conversations[0].messages[0].attachments, []);
  c.draftAttachments = [ref()]; assert.equal(AssistantCore.restore(JSON.stringify(d)).conversations[0].draftAttachments[0].file, 'qa-image.jpeg');
  for (const change of [{ file: '../secret.jpeg' }, { file: '/outside.jpeg' }, { mime: 'text/html' }, { size: 10 ** 9 }, { tokens: NaN }]) assert.equal(ChatFeatures.attachment(Object.assign(ref(), change)), false);
  c.draftAttachments = Array.from({ length: 5 }, () => ref()); assert.throws(() => AssistantCore.restore(JSON.stringify(d)), /附件/);
});
test('request refuses missing attachment resolver and oversized payload before sending anything', () => {
  const c = AssistantCore.create('qa', profile(), 1); c.messages.push(Object.assign(new LocalMessage(), { text: '', attachments: [ref()] }));
  assert.throws(() => AssistantCore.request(c), /附件/);
  assert.throws(() => AssistantCore.request(c, a => ({ ...resolve(a), data: 'x'.repeat(16 * 1024 * 1024 + 1) })), /16 MiB/);
});
test('context estimates actual 40-message window plus draft and system; unknown denominator is not a fabricated percentage', () => {
  const c = AssistantCore.create('qa', profile(), 1); c.profile.system = '规则';
  c.messages = Array.from({ length: 45 }, (_, i) => Object.assign(new LocalMessage(), { text: '消息' + i }));
  c.messages[0].text = 'discarded'.repeat(10000);
  const unknown = ChatFeatures.context(c, '草稿', [ref()]); assert.equal(unknown.window, 0); assert.equal(unknown.percent, 0); assert.ok(unknown.tokens < 2000);
  c.profile.contextWindow = 10000; const known = ChatFeatures.context(c, '草稿', [ref()]); assert.equal(known.percent, Math.ceil(known.tokens / 100));
  const copy = Object.assign({}, c, { messages: c.messages.slice(-39) }); assert.equal(ChatFeatures.context(copy, '草稿', [ref()]).tokens, known.tokens);
});
test('reasoning levels are protocol-aware, default omits controls and unsupported models remain default', () => {
  for (const protocol of ['chat', 'responses']) {
    const p = profile(protocol, 'openai', 'o3'); assert.deepEqual(ChatFeatures.levels(p), ['auto', 'low', 'medium', 'high']);
    assert.equal(wire(p).reasoning_effort, undefined); assert.equal(wire(p).reasoning, undefined);
    p.reasoningLevel = 'high'; const b = wire(p); assert.equal(protocol === 'responses' ? b.reasoning.effort : b.reasoning_effort, 'high');
  }
  const claude = profile('anthropic', 'anthropic', 'claude-sonnet-4-6'); claude.reasoningLevel = 'low'; assert.equal(wire(claude).thinking.type, 'adaptive'); assert.equal(wire(claude).output_config.effort, 'low');
  const gemini = profile('gemini', 'gemini', 'gemini-2.5-pro'); gemini.reasoningLevel = 'high'; assert.equal(wire(gemini).generationConfig.thinkingConfig.thinkingBudget, 8192);
  const ds = profile('chat', 'deepseek', 'deepseek-flash'); ds.reasoningLevel = 'none'; assert.equal(wire(ds).thinking.type, 'disabled'); assert.equal(wire(ds).reasoning_effort, undefined);
  const router = profile('chat', 'openrouter', 'vendor/model'); router.reasoningOptions = ['low','high']; router.reasoningLevel = 'high'; assert.equal(wire(router).reasoning.effort, 'high'); assert.equal(ChatFeatures.levels(router).includes('medium'), false);
  const unknown = profile(); unknown.reasoningLevel = 'high'; assert.equal(AssistantCore.profile(unknown).reasoningLevel, 'auto');
});
test('catalog categories use metadata, retain audio and embeddings in all-mode, and label name inference', () => {
  const list = ProviderModels.parse(JSON.stringify({ data: [
    { id: 'vision', context_length: 128000, architecture: { input_modalities: ['text','image'], output_modalities: ['text'] }, reasoning: { supported_efforts: ['low','high'], mandatory: true } },
    { id: 'speak', architecture: { input_modalities: ['text'], output_modalities: ['audio'] } },
    { id: 'paint', architecture: { output_modalities: ['image'] } }, { id: 'deepseek-r1' }, { id: 'mystery' }
  ] }), 'chat', 'all').models;
  assert.deepEqual(list[0].categories, ['文本','视觉','多模态','推理']); assert.equal(list[0].contextWindow, 128000);
  assert.equal(ProviderModels.search(list, '', '视觉').length, 1); assert.equal(ProviderModels.chatCompatible(list[1]), false); assert.equal(ProviderModels.chatCompatible(list[2]), false);
  assert.equal(list[3].inferred, true); assert.deepEqual(list[4].categories, ['未标注']);
  const g = ProviderModels.parse('{"models":[{"name":"models/embedding","supportedGenerationMethods":["embedContent"]}]}', 'gemini', 'all'); assert.equal(g.models[0].categories[0], '嵌入');
  assert.ok(ProviderModels.wire('openrouter','chat','https://safe.example/v1','key','all').url.endsWith('?output_modalities=all'));
  assert.ok(ProviderModels.wire('silicon','chat','https://safe.example/v1','key','all').url.endsWith('/models'));
});
