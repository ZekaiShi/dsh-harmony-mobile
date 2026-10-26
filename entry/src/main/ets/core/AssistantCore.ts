import { ConnectionPolicy } from './ConnectionPolicy';
import { SseParser } from './SseParser';
import { StreamHandle } from './NativeModels';
import { ProviderCatalog } from './ProviderCatalog';
import { ChatProtocol, ChatStream } from './ChatProtocol';
import { ChatAttachment, ChatFeatures, ResolvedAttachment } from './ChatFeatures';
import { RequestUsage, TokenUsage, UsageEntry } from './TokenUsage';

export class ModelProfile {
  name: string = '我的模型'; base: string = ''; model: string = ''; system: string = '';
  provider: string = 'custom'; protocol: string = 'chat';
  contextWindow: number = 0; reasoningLevel: string = 'auto'; reasoningOptions: string[] = [];
  inputModalities: string[] = [];
  requestUsage?: boolean;
}
export class LocalMessage {
  id: string = ''; role: string = 'user'; text: string = ''; reasoning: string = ''; status: string = 'done';
  attachments: ChatAttachment[] = [];
  usage?: RequestUsage;
}
export class LocalConversation {
  id: string = ''; title: string = '新对话'; updatedAt: number = 0; draft: string = '';
  profile: ModelProfile = new ModelProfile(); messages: LocalMessage[] = [];
  draftAttachments: ChatAttachment[] = [];
  titleSource: string = 'local'; titleState: string = 'pending'; usageEntries: UsageEntry[] = [];
}
export class AssistantData { version: number = 1; profile: ModelProfile = new ModelProfile(); profiles: ModelProfile[] = []; conversations: LocalConversation[] = []; autoTitle: boolean = true; }
export class ModelEndpoint { url: string = ''; origin: string = ''; }
export interface CompletionMessage { role: string; content: string; attachments?: ResolvedAttachment[]; }
export interface CompletionRequest { model: string; messages: CompletionMessage[]; stream: boolean; maxOutputTokens?: number; }
export interface CompletionDelta { content?: string; reasoning_content?: string; reasoning?: string; }
export interface CompletionChoice { delta?: CompletionDelta; message?: CompletionDelta; finish_reason?: string | null; }
export interface CompletionPacket { choices?: CompletionChoice[]; error?: Object; }
export interface ModelWire { url: string; key: string; body: string; auth?: string; method?: string; }
export interface ModelCallbacks { data(text: string): void; end(status: number): void; error(): void; }
export interface ModelTransport { start(wire: ModelWire, callbacks: ModelCallbacks): StreamHandle; }
export interface ModelEvents { update(text: string, reasoning: string): void; done(reason: string): void; error(message: string): void; usage?(value: RequestUsage): void; }

export class AssistantCore {
  static endpoint(raw: string): ModelEndpoint {
    const value = raw.trim().replace(/\/+$/, '');
    if (value.length > 2048 || /[\s\\?#\u0000-\u001f\u007f]/.test(value)) throw new Error('API 地址不能包含空格、查询参数或配对码。');
    const match = /^(https?:\/\/[^/]+)(\/.*)?$/.exec(value);
    const parsed = match ? ConnectionPolicy.parse(match[1] + '/', false) : undefined;
    if (!match || !parsed?.ok) throw new Error('请输入完整的 HTTPS API 基础地址。');
    const origin = parsed.target.origin;
    if (origin.startsWith('http:') && !/^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)(?::\d+)?$/.test(origin)) {
      throw new Error('公网模型服务需要 HTTPS；HTTP 仅用于本机或局域网服务。');
    }
    const path = match[2] || '';
    if (/%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(path)) throw new Error('API 路径不正确。');
    const endpoint = new ModelEndpoint(); endpoint.origin = origin;
    endpoint.url = origin + path + (path.endsWith('/chat/completions') ? '' : '/chat/completions'); return endpoint;
  }
  static profile(profile: ModelProfile): ModelProfile {
    this.endpoint(profile.base);
    if (!profile.model.trim() || profile.model.length > 200 || /[\u0000-\u001f]/.test(profile.model)) throw new Error('请填写服务商提供的模型 ID。');
    if (profile.system.length > 8000) throw new Error('系统指令过长，请限制在 8000 字以内。');
    const copy = new ModelProfile(); copy.name = profile.name.trim().slice(0, 40) || '我的模型';
    copy.base = profile.base.trim().replace(/\/+$/, ''); copy.model = profile.model.trim(); copy.system = profile.system;
    copy.provider = profile.provider || 'custom'; copy.protocol = profile.protocol || 'chat';
    copy.requestUsage = profile.requestUsage === undefined ? copy.provider !== 'custom' : profile.requestUsage === true;
    const window = profile.contextWindow || 0;
    if (!Number.isInteger(window) || window < 0 || window > 10000000) throw new Error('上下文窗口需填写 1 到 10000000 的整数，留空表示未知。');
    copy.contextWindow = window;
    copy.inputModalities = Array.isArray(profile.inputModalities) ? profile.inputModalities.filter((v: string) => ['text','image','audio','video','file'].includes(v)) : [];
    copy.reasoningOptions = Array.isArray(profile.reasoningOptions) ? profile.reasoningOptions.filter((v: string) => ['none','minimal','low','medium','high','xhigh','max'].includes(v)) : [];
    copy.reasoningLevel = profile.reasoningLevel || 'auto';
    if (!ChatFeatures.levels(copy).includes(copy.reasoningLevel)) copy.reasoningLevel = 'auto';
    if (!ProviderCatalog.all().some((item) => item.id === copy.provider) || !ProviderCatalog.protocols().includes(copy.protocol)) throw new Error('服务商或接口协议不正确。');
    return copy;
  }
  static key(value: string): string {
    const key = value.trim(); if (!key || key.length > 1024 || /[^\x21-\x7e]/.test(key)) throw new Error('API Key 不能为空，且不能包含空格或换行。'); return key;
  }
  static request(conversation: LocalConversation, resolve?: (attachment: ChatAttachment) => ResolvedAttachment): CompletionRequest {
    const profile = this.profile(conversation.profile); const messages: CompletionMessage[] = [];
    if (profile.system.trim()) messages.push({ role: 'system', content: profile.system });
    const context = conversation.messages.filter((item: LocalMessage) => (item.text.length > 0 || item.attachments?.length > 0) && (item.role === 'user' || item.role === 'assistant' && item.status === 'done')).slice(-40);
    let payloadSize = 0;
    for (const item of context) {
      const message: CompletionMessage = { role: item.role, content: item.text };
      const attachments = ChatFeatures.attachments(item.attachments);
      if (attachments.length) {
        if (!resolve) throw new Error('附件尚未读取，请重试。');
        message.attachments = attachments.map((attachment: ChatAttachment) => resolve(attachment));
        for (const attachment of message.attachments) payloadSize += attachment.data.length;
      }
      payloadSize += item.text.length;
      if (payloadSize > 16 * 1024 * 1024) throw new Error('本次上下文附件超过 16 MiB，请新建对话或减少附件。');
      messages.push(message);
    }
    if (!messages.some((message: CompletionMessage) => message.role === 'user')) throw new Error('请先输入消息。');
    return { model: profile.model, messages: messages, stream: true };
  }
  static create(id: string, profile: ModelProfile, now: number): LocalConversation {
    const conversation = new LocalConversation(); conversation.id = id; conversation.profile = this.profile(profile); conversation.updatedAt = now; return conversation;
  }
  static transcript(conversation: LocalConversation): string {
    return '# ' + conversation.title + '\n\n模型：' + conversation.profile.model + '\n\n' + conversation.messages.filter((message: LocalMessage) => message.text).map((message: LocalMessage) => '## ' + (message.role === 'user' ? '我' : '助手') + '\n\n' + message.text).join('\n\n');
  }
  static search(conversations: LocalConversation[], query: string): LocalConversation[] {
    const needle = query.trim().toLowerCase(); return conversations.filter((item: LocalConversation) => !needle || item.title.toLowerCase().includes(needle) || item.messages.some((message: LocalMessage) => message.text.toLowerCase().includes(needle))).sort((a: LocalConversation,b: LocalConversation) => b.updatedAt-a.updatedAt);
  }
  static restore(raw: string): AssistantData {
    if (raw.length > 16 * 1024 * 1024) throw new Error('本机会话文件过大，请先备份后处理。');
    const data = JSON.parse(raw) as AssistantData;
    if (data.version !== 1 || !Array.isArray(data.conversations) || data.conversations.length > 100 || !data.profile) throw new Error('本机会话格式不正确，原文件已保留。');
    if (data.profile.base) data.profile = this.profile(data.profile); else data.profile = new ModelProfile();
    if (data.profiles === undefined) data.profiles = data.profile.base ? [this.profile(data.profile)] : [];
    if (!Array.isArray(data.profiles) || data.profiles.length > 20) throw new Error('服务配置格式不正确。');
    data.profiles = data.profiles.map((profile: ModelProfile) => this.profile(profile));
    data.autoTitle = data.autoTitle !== false;
    for (const conversation of data.conversations) {
      if (typeof conversation.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(conversation.id) || typeof conversation.title !== 'string' || !Number.isFinite(conversation.updatedAt) || !Array.isArray(conversation.messages) || conversation.messages.length > 400 || typeof conversation.draft !== 'string') throw new Error('本机会话数据损坏，原文件已保留。');
      conversation.profile = this.profile(conversation.profile);
      conversation.draftAttachments = ChatFeatures.attachments(conversation.draftAttachments);
      // Existing titles are preserved; upgrading must never start paid naming requests.
      conversation.titleSource = ['local','manual','ai'].includes(conversation.titleSource) ? conversation.titleSource : 'manual';
      conversation.titleState = ['pending','done','failed'].includes(conversation.titleState) ? conversation.titleState : 'failed';
      if (!Array.isArray(conversation.usageEntries) || conversation.usageEntries.length > 2000) conversation.usageEntries = [];
      conversation.usageEntries = conversation.usageEntries.filter((e: UsageEntry) => e && typeof e.id === 'string' && e.id.length <= 100 && ['chat','title'].includes(e.kind)).map((e: UsageEntry): UsageEntry => ({ id: e.id, kind: e.kind, model: typeof e.model === 'string' ? e.model.slice(0, 200) : '', usage: TokenUsage.restore(e.usage) }));
      for (const message of conversation.messages) {
        if (!['user','assistant'].includes(message.role) || typeof message.text !== 'string' || typeof message.reasoning !== 'string' || typeof message.id !== 'string') throw new Error('本机消息数据损坏，原文件已保留。');
        if (message.status === 'streaming') message.status = 'interrupted';
        message.attachments = ChatFeatures.attachments(message.attachments);
        if (message.usage) message.usage = TokenUsage.restore(message.usage);
      }
    }
    return data;
  }
}

export class CompletionClient {
  constructor(private transport: ModelTransport) {}
  start(profile: ModelProfile, key: string, request: CompletionRequest, events: ModelEvents): StreamHandle {
    const endpoint = AssistantCore.endpoint(profile.base); const safeKey = AssistantCore.key(key);
    const parser = new SseParser(); const stream = new ChatStream(profile.protocol || 'chat'); let raw = ''; let closed = false; let frames = 0;
    let handle: StreamHandle | undefined;
    const usage = (): void => {
      if (!events.usage) return;
      let attachmentTokens = 0;
      for (const message of request.messages) for (const attachment of message.attachments || []) attachmentTokens += attachment.kind === 'text' ? ChatFeatures.textTokens(attachment.data) : 1024;
      events.usage(stream.usage.source === 'reported' ? TokenUsage.restore(stream.usage) : TokenUsage.estimate(request.messages.map((m: CompletionMessage) => m.content).join('\n'), stream.text + stream.reasoning, attachmentTokens));
    };
    const fail = (message: string): void => { if (closed) return; closed = true; handle?.close(); events.error(message); };
    handle = this.transport.start(ChatProtocol.wire(profile, request, safeKey, endpoint.url), {
      data: (chunk: string): void => {
        if (closed) return;
        if (raw.length + chunk.length > 4 * 1024 * 1024) { fail('本次回复过长，已停止接收。'); return; }
        raw += chunk;
        try {
          for (const frame of parser.push(chunk)) {
            frames++; if (frame.data.trim()) { stream.packet(frame.data, true); usage(); events.update(stream.text, stream.reasoning); }
          }
        } catch (_) { fail('回复数据无法解析，已保留收到的内容。'); }
      },
      end: (status: number): void => {
        if (closed) return;
        if (status !== 200) {
          fail(status === 401 || status === 403 ? '模型服务拒绝了授权，请检查 API Key 与模型权限。' : status === 429 ? '模型服务限流或额度不足，请稍后重试并检查账户。' : status >= 300 && status < 400 ? 'API 地址发生重定向，请填写最终地址。' : '模型服务返回 HTTP ' + status + '，请检查地址、模型 ID 或服务状态。'); return;
        }
        try { if (frames === 0 && raw.trim()) stream.packet(raw, false); usage(); events.update(stream.text, stream.reasoning); } catch (_) { fail('模型服务返回了不支持的数据格式。'); return; }
        if (!stream.text && !stream.reasoning) { fail('模型服务没有返回有效回复。'); return; }
        if (frames > 0 && !stream.finished()) { fail('回复连接意外结束，已保留部分内容，可重新生成。'); return; }
        closed = true; events.done(stream.reason || 'stop');
      },
      error: (): void => { fail('无法连接模型服务，请检查网络、证书或 API 地址。'); }
    });
    if (closed) handle.close();
    return { close: (): void => { if (!closed) { closed = true; handle?.close(); } } };
  }
}
