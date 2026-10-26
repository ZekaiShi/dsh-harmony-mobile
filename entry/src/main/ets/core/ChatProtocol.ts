import { CompletionRequest, ModelProfile, ModelWire, CompletionPacket, CompletionMessage } from './AssistantCore';
import { ChatFeatures, ResolvedAttachment } from './ChatFeatures';
import { RequestUsage, TokenUsage, UsagePacket } from './TokenUsage';

interface NativePart {
  type?: string; text?: string; thinking?: string; thought?: boolean; refusal?: string;
  image_url?: { url: string }; image_url_string?: string;
  source?: { type: string; media_type: string; data: string };
  inlineData?: { mimeType: string; data: string };
  filename?: string; file_data?: string;
}
interface InputPart { type: string; text?: string; image_url?: string; filename?: string; file_data?: string; }
interface WireMessage { role: string; content: string | NativePart[] | InputPart[]; }
interface NativeContent { role: string; parts: NativePart[]; }
interface NativeBody {
  model?: string; stream?: boolean; messages?: WireMessage[]; system?: string; max_tokens?: number;
  max_completion_tokens?: number; max_output_tokens?: number; stream_options?: { include_usage: boolean };
  instructions?: string; input?: WireMessage[]; store?: boolean;
  contents?: NativeContent[]; systemInstruction?: { parts: NativePart[] };
  reasoning_effort?: string; reasoning?: { effort?: string; enabled?: boolean; max_tokens?: number };
  thinking?: { type: string; budget_tokens?: number }; output_config?: { effort: string };
  generationConfig?: { thinkingConfig?: { thinkingBudget: number }; maxOutputTokens?: number };
}
interface NativePacket {
  type?: string; error?: Object; delta?: { type?: string; text?: string; thinking?: string; stop_reason?: string } | string;
  content_block?: NativePart; content?: NativePart[]; stop_reason?: string;
  candidates?: { content?: { parts?: NativePart[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string }; output?: { type?: string; content?: NativePart[] }[];
  response?: { status?: string; error?: Object }; status?: string;
}

export class ChatProtocol {
  static base(url: string): string { return url.replace(/\/(?:chat\/completions|responses|messages)$/, '').replace(/\/(?:responses|messages)$/, ''); }
  static wire(profile: ModelProfile, request: CompletionRequest, key: string, endpoint: string): ModelWire {
    const protocol = profile.protocol || 'chat'; const base = this.base(endpoint);
    let path = '/chat/completions'; let body: NativeBody = { model: request.model, stream: true }; let auth = 'bearer';
    let messages = request.messages.filter((item: CompletionMessage) => item.role !== 'system');
    if (protocol === 'anthropic' || protocol === 'gemini') messages = this.turns(messages);
    if (protocol === 'anthropic') {
      path = '/messages'; auth = 'anthropic'; body = { model: request.model, max_tokens: 4096, stream: true, messages: messages.map((item: CompletionMessage): WireMessage => ({ role: item.role, content: this.parts(item, 'anthropic') })) };
      if (profile.system.trim()) body.system = profile.system;
    } else if (protocol === 'responses') {
      path = '/responses'; body = { model: request.model, stream: true, input: messages.map((item: CompletionMessage): WireMessage => ({ role: item.role, content: this.parts(item, 'responses') })), store: false };
      if (profile.system.trim()) body.instructions = profile.system;
    } else if (protocol === 'gemini') {
      path = '/models/' + encodeURIComponent(request.model.replace(/^models\//, '')) + ':streamGenerateContent?alt=sse'; auth = 'google';
      body = { contents: messages.map((item: CompletionMessage): NativeContent => ({ role: item.role === 'assistant' ? 'model' : 'user', parts: this.geminiParts(item) })) };
      if (profile.system.trim()) body.systemInstruction = { parts: [{ text: profile.system }] };
    } else body.messages = request.messages.map((item: CompletionMessage): WireMessage => ({ role: item.role, content: this.parts(item, 'chat') }));
    this.reasoning(body, profile);
    if (protocol === 'chat' && ['openai','deepseek','openrouter','siliconflow','silicon','volcengine','ark','dashscope','moonshot','zhipu','minimax'].includes(profile.provider)) body.stream_options = { include_usage: true };
    if (request.maxOutputTokens) {
      if (protocol === 'responses') body.max_output_tokens = request.maxOutputTokens;
      else if (protocol === 'gemini') { if (!body.generationConfig) body.generationConfig = {}; body.generationConfig.maxOutputTokens = request.maxOutputTokens; }
      else if (protocol === 'chat' && /^(?:o[134](?:-|$)|gpt-[56](?:[.-]|$))/.test(profile.model)) body.max_completion_tokens = request.maxOutputTokens;
      else body.max_tokens = request.maxOutputTokens;
    }
    return { url: base + path, body: JSON.stringify(body), key: key, auth: auth };
  }
  private static text(item: CompletionMessage): string {
    let text = item.content;
    for (const attachment of item.attachments || []) if (attachment.kind === 'text') text += '\n\n<attached_file name=' + JSON.stringify(attachment.name) + '>\n' + attachment.data + '\n</attached_file>';
    return text;
  }
  private static parts(item: CompletionMessage, protocol: string): string | NativePart[] | InputPart[] {
    const text = this.text(item), files = (item.attachments || []).filter((a: ResolvedAttachment) => a.kind !== 'text');
    if (!files.length) return text;
    if (protocol === 'responses') {
      const parts: InputPart[] = [];
      if (text) parts.push({ type: 'input_text', text: text });
      for (const file of files) parts.push(file.kind === 'image' ? { type: 'input_image', image_url: 'data:' + file.mime + ';base64,' + file.data } : { type: 'input_file', filename: file.name, file_data: 'data:' + file.mime + ';base64,' + file.data });
      return parts;
    }
    const parts: NativePart[] = [];
    if (text) parts.push({ type: 'text', text: text });
    for (const file of files) {
      if (protocol === 'anthropic') parts.push({ type: file.kind === 'image' ? 'image' : 'document', source: { type: 'base64', media_type: file.mime, data: file.data } });
      else {
        if (file.kind !== 'image') throw new Error('当前 Chat Completions 接口未启用 PDF，请使用文本文件或原生 Responses / Claude / Gemini 协议。');
        parts.push({ type: 'image_url', image_url: { url: 'data:' + file.mime + ';base64,' + file.data } });
      }
    }
    return parts;
  }
  private static geminiParts(item: CompletionMessage): NativePart[] {
    const parts: NativePart[] = [], text = this.text(item);
    if (text) parts.push({ text: text });
    for (const file of item.attachments || []) if (file.kind !== 'text') parts.push({ inlineData: { mimeType: file.mime, data: file.data } });
    return parts;
  }
  private static reasoning(body: NativeBody, profile: ModelProfile): void {
    const value = profile.reasoningLevel || 'auto';
    if (value === 'auto') return;
    if (!ChatFeatures.levels(profile).includes(value)) throw new Error('当前模型不支持这个思考等级，请改回默认。');
    const mode = ChatFeatures.reasoningMode(profile);
    if (mode === 'router') body.reasoning = value === 'none' ? { enabled: false } : { effort: value };
    else if (mode === 'effort') { if (profile.protocol === 'responses') body.reasoning = { effort: value }; else body.reasoning_effort = value; }
    else if (mode === 'adaptive') { body.thinking = { type: 'adaptive' }; body.output_config = { effort: value }; body.max_tokens = 16384; }
    else if (mode === 'budget') { body.thinking = { type: 'enabled', budget_tokens: value === 'low' ? 1024 : value === 'medium' ? 4096 : 8192 }; body.max_tokens = 16384; }
    else if (mode === 'deepseek') {
      if (profile.protocol === 'responses') body.reasoning = { effort: value };
      else if (profile.protocol === 'anthropic') { body.thinking = { type: value === 'none' ? 'disabled' : 'enabled' }; if (value !== 'none') body.output_config = { effort: value }; }
      else { body.thinking = { type: value === 'none' ? 'disabled' : 'enabled' }; if (value !== 'none') body.reasoning_effort = value; }
    } else if (mode === 'gemini-budget') body.generationConfig = { thinkingConfig: { thinkingBudget: value === 'low' ? 1024 : value === 'medium' ? 4096 : 8192 } };
  }
  private static turns(source: CompletionMessage[]): CompletionMessage[] {
    const messages: CompletionMessage[] = []; const start = source.findIndex((item: CompletionMessage) => item.role === 'user');
    for (const item of source.slice(start < 0 ? source.length : start)) {
      const last = messages[messages.length - 1];
      if (last && last.role === item.role) { last.content += '\n\n' + item.content; if (item.attachments?.length) last.attachments = (last.attachments || []).concat(item.attachments); }
      else { const copy: CompletionMessage = { role: item.role, content: item.content }; if (item.attachments?.length) copy.attachments = item.attachments.slice(); messages.push(copy); }
    }
    return messages;
  }
}

export class ChatStream {
  text: string = ''; reasoning: string = ''; reason: string = ''; done: boolean = false;
  usage: RequestUsage = new RequestUsage();
  constructor(private protocol: string) {}
  packet(source: string, streaming: boolean): void {
    if (source.trim() === '[DONE]') { this.done = true; return; }
    this.usage = TokenUsage.packet(this.protocol, JSON.parse(source) as UsagePacket, this.usage);
    if (this.done) return;
    if (this.protocol === 'chat') {
      const value = JSON.parse(source) as CompletionPacket;
      if (value.error) throw new Error('service');
      const choice = value.choices?.[0]; const delta = streaming ? choice?.delta : choice?.message;
      if (typeof delta?.content === 'string') this.text += delta.content;
      if (typeof delta?.reasoning_content === 'string') this.reasoning += delta.reasoning_content;
      else if (typeof delta?.reasoning === 'string') this.reasoning += delta.reasoning;
      if (choice?.finish_reason) this.reason = choice.finish_reason;
      return;
    }
    const value = JSON.parse(source) as NativePacket;
    if (value.error || value.type === 'error' || value.type === 'response.failed' || value.type === 'response.incomplete') throw new Error('service');
    if (this.protocol === 'anthropic') {
      if (value.type === 'content_block_start' && value.content_block) this.part(value.content_block);
      if (value.type === 'content_block_delta' && typeof value.delta === 'object') {
        if (value.delta.type === 'text_delta') this.text += value.delta.text || '';
        if (value.delta.type === 'thinking_delta') this.reasoning += value.delta.thinking || '';
      }
      if (value.type === 'message_delta' && typeof value.delta === 'object' && value.delta.stop_reason) this.reason = this.stopReason(value.delta.stop_reason);
      if (value.type === 'message_stop') this.done = true;
      if (!streaming) { for (const part of value.content || []) this.part(part); this.reason = this.stopReason(value.stop_reason || 'stop'); }
    } else if (this.protocol === 'gemini') {
      if (value.promptFeedback?.blockReason) throw new Error('blocked');
      const candidate = value.candidates?.[0];
      for (const part of candidate?.content?.parts || []) { if (part.thought) this.reasoning += part.text || ''; else this.text += part.text || ''; }
      if (candidate?.finishReason) { this.reason = this.stopReason(candidate.finishReason); this.done = true; }
    } else {
      if (value.type === 'response.output_text.delta' || value.type === 'response.refusal.delta') { if (typeof value.delta === 'string') this.text += value.delta; }
      if (value.type === 'response.reasoning_summary_text.delta' && typeof value.delta === 'string') this.reasoning += value.delta;
      if (value.type === 'response.completed') { if (value.response?.error || value.response?.status && value.response.status !== 'completed') throw new Error('service'); this.done = true; this.reason = 'stop'; }
      if (!streaming) { if (value.status && value.status !== 'completed') throw new Error('service'); for (const item of value.output || []) for (const part of item.content || []) this.part(part); this.reason = 'stop'; }
    }
  }
  private part(part: NativePart): void { if (part.type === 'thinking') this.reasoning += part.thinking || ''; else this.text += part.text || part.refusal || ''; }
  private stopReason(value: string): string { return ['max_tokens','MAX_TOKENS','length'].includes(value) ? 'length' : value; }
  finished(): boolean { return this.done || (this.protocol === 'chat' || this.protocol === 'gemini') && !!this.reason; }
}
