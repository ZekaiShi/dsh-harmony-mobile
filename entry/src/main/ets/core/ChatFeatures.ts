import { LocalConversation, ModelProfile } from './AssistantCore';

// Only relative private-cache references are persisted. Payload bytes exist for one request.
export class ChatAttachment {
  file: string = ''; name: string = ''; mime: string = ''; kind: string = '';
  size: number = 0; width: number = 0; height: number = 0; tokens: number = 0;
}
export interface ResolvedAttachment { kind: string; name: string; mime: string; data: string; }
export class ContextStat { tokens: number = 0; window: number = 0; percent: number = 0; approximate: boolean = true; }

export class ChatFeatures {
  static attachment(value: ChatAttachment): boolean {
    return !!value && /^[a-zA-Z0-9_-]{1,100}\.(jpeg|png|webp|txt|pdf)$/.test(value.file) &&
      typeof value.name === 'string' && value.name.length > 0 && value.name.length <= 200 && !/[\u0000-\u001f]/.test(value.name) &&
      ['image','text','pdf'].includes(value.kind) &&
      (value.kind === 'image' ? ['image/jpeg','image/png','image/webp'].includes(value.mime) && /\.(jpeg|png|webp)$/.test(value.file) : value.kind === 'pdf' ? value.mime === 'application/pdf' && value.file.endsWith('.pdf') : value.mime === 'text/plain' && value.file.endsWith('.txt')) &&
      Number.isInteger(value.size) && value.size > 0 && value.size <= (value.kind === 'text' ? 256 * 1024 : value.kind === 'pdf' ? 4 * 1024 * 1024 : 8 * 1024 * 1024) &&
      Number.isFinite(value.tokens) && value.tokens >= 0 && value.tokens <= 1000000 &&
      Number.isFinite(value.width) && Number.isFinite(value.height) && value.width >= 0 && value.height >= 0 && value.width * value.height <= 40000000;
  }
  static attachments(values: ChatAttachment[] | undefined): ChatAttachment[] {
    if (values === undefined) return [];
    if (!Array.isArray(values) || values.length > 4 || values.some((item: ChatAttachment) => !this.attachment(item))) throw new Error('附件记录损坏，原文件已保留。');
    return values;
  }
  static textTokens(value: string): number {
    let wide = 0, narrow = 0;
    for (const char of value) { if (char.charCodeAt(0) > 255) wide++; else narrow++; }
    return Math.ceil(wide * 1.5 + narrow / 3);
  }
  static context(conversation: LocalConversation, draft: string, attachments: ChatAttachment[]): ContextStat {
    const stat = new ContextStat(); stat.window = conversation.profile.contextWindow || 0;
    stat.tokens = this.textTokens(conversation.profile.system || '') + 8;
    // Match request truncation including the pending user turn, rather than counting lifetime usage.
    const messages = conversation.messages.filter((item) => (item.text.length > 0 || item.attachments?.length > 0) && (item.role === 'user' || item.status === 'done'));
    const pending = draft.trim().length > 0 || attachments.length > 0;
    for (const item of messages.slice(pending ? -39 : -40)) stat.tokens += 8 + this.textTokens(item.text) + (item.attachments || []).reduce((sum, a) => sum + a.tokens, 0);
    if (pending) stat.tokens += 8 + this.textTokens(draft) + attachments.reduce((sum, a) => sum + a.tokens, 0);
    stat.percent = stat.window ? Math.min(100, Math.ceil(stat.tokens / stat.window * 100)) : 0;
    return stat;
  }
  static reasoningMode(profile: ModelProfile): string {
    if (profile.provider === 'openrouter' && (profile.reasoningOptions || []).length) return 'router';
    if ((profile.provider === 'openai' || profile.provider === 'custom') && ['chat','responses'].includes(profile.protocol) && /^(o[134](?:-|$)|gpt-[56](?:[.-]|$))/.test(profile.model) && !/chat|pro/.test(profile.model)) return 'effort';
    if (profile.protocol === 'anthropic' && /^claude-(?:sonnet|opus)-4-[6-9]/.test(profile.model)) return 'adaptive';
    if (profile.protocol === 'anthropic' && /^claude-(?:3-7|(?:sonnet|opus)-4-(?:0|1|5))/.test(profile.model)) return 'budget';
    if (profile.provider === 'deepseek' && /^deepseek-(?:flash|pro)(?:-|$)/.test(profile.model)) return 'deepseek';
    if (profile.protocol === 'gemini' && /^gemini-2\.5-(?:pro|flash)(?:-|$)/.test(profile.model)) return 'gemini-budget';
    return '';
  }
  static levels(profile: ModelProfile): string[] {
    const mode = this.reasoningMode(profile);
    if (mode === 'router') return ['auto'].concat((profile.reasoningOptions || []).filter((v: string) => ['none','minimal','low','medium','high','xhigh','max'].includes(v)));
    if (mode === 'deepseek') return ['auto','none','low','high','max'];
    return mode ? ['auto','low','medium','high'] : ['auto'];
  }
  static levelLabel(value: string): string {
    if (value === 'auto') return '默认'; if (value === 'none') return '关闭'; if (value === 'minimal') return '最低';
    if (value === 'low') return '低'; if (value === 'medium') return '中'; if (value === 'high') return '高';
    return value === 'xhigh' ? '极高' : value === 'max' ? '最高' : '默认';
  }
}
