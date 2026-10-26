import { ChatFeatures } from './ChatFeatures';

export class RequestUsage {
  input: number = -1; output: number = -1; total: number = -1;
  cached: number = 0; cacheWrite: number = 0; reasoning: number = 0;
  source: string = 'unknown';
}
export class UsageEntry { id: string = ''; kind: string = 'chat'; model: string = ''; usage: RequestUsage = new RequestUsage(); }
export interface RawUsage {
  prompt_tokens?: number; completion_tokens?: number; total_tokens?: number;
  input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number }; completion_tokens_details?: { reasoning_tokens?: number };
  input_tokens_details?: { cached_tokens?: number }; output_tokens_details?: { reasoning_tokens?: number };
}
export interface UsagePacket {
  usage?: RawUsage; message?: { usage?: RawUsage }; response?: { usage?: RawUsage };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number; cachedContentTokenCount?: number; thoughtsTokenCount?: number };
}
export class TokenUsage {
  static count(value: number | undefined): boolean { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 1000000000000; }
  static restore(value: RequestUsage | undefined): RequestUsage {
    const result = new RequestUsage(); if (!value || !['reported','estimated'].includes(value.source)) return result;
    result.source = value.source;
    for (const key of ['input','output','total','cached','cacheWrite','reasoning']) {
      // Explicit fields keep the ArkTS implementation free of dynamic indexing.
      if (key === 'input' && this.count(value.input)) result.input = value.input;
      if (key === 'output' && this.count(value.output)) result.output = value.output;
      if (key === 'total' && this.count(value.total)) result.total = value.total;
      if (key === 'cached' && this.count(value.cached)) result.cached = value.cached;
      if (key === 'cacheWrite' && this.count(value.cacheWrite)) result.cacheWrite = value.cacheWrite;
      if (key === 'reasoning' && this.count(value.reasoning)) result.reasoning = value.reasoning;
    }
    return result;
  }
  static packet(protocol: string, packet: UsagePacket, previous: RequestUsage): RequestUsage {
    const result = this.restore(previous);
    if (protocol === 'gemini') {
      const value = packet.usageMetadata; if (!value) return result;
      if (this.count(value.promptTokenCount)) result.input = value.promptTokenCount!;
      if (this.count(value.thoughtsTokenCount)) result.reasoning = value.thoughtsTokenCount!;
      if (this.count(value.cachedContentTokenCount)) result.cached = value.cachedContentTokenCount!;
      if (this.count(value.candidatesTokenCount)) result.output = value.candidatesTokenCount! + result.reasoning;
      if (this.count(value.totalTokenCount)) result.total = value.totalTokenCount!;
    } else {
      const value = packet.usage || packet.message?.usage || packet.response?.usage; if (!value) return result;
      const input = protocol === 'chat' ? value.prompt_tokens : value.input_tokens;
      const output = protocol === 'chat' ? value.completion_tokens : value.output_tokens;
      if (this.count(input)) result.input = input!;
      if (this.count(output)) result.output = output!;
      const cached = protocol === 'anthropic' ? value.cache_read_input_tokens : value.prompt_tokens_details?.cached_tokens ?? value.input_tokens_details?.cached_tokens;
      if (this.count(cached)) result.cached = cached!;
      if (this.count(value.cache_creation_input_tokens)) result.cacheWrite = value.cache_creation_input_tokens!;
      if (protocol === 'anthropic' && this.count(input)) result.input = input! + result.cached + result.cacheWrite;
      const reasoning = value.completion_tokens_details?.reasoning_tokens ?? value.output_tokens_details?.reasoning_tokens;
      if (this.count(reasoning)) result.reasoning = reasoning!;
      if (this.count(value.total_tokens)) result.total = value.total_tokens!;
      else if (result.input >= 0 && result.output >= 0) result.total = result.input + result.output;
    }
    if (result.input >= 0 || result.output >= 0 || result.total >= 0) result.source = 'reported';
    return result;
  }
  static estimate(inputText: string, outputText: string, attachmentTokens: number = 0): RequestUsage {
    const value = new RequestUsage(); value.source = 'estimated';
    value.input = ChatFeatures.textTokens(inputText) + attachmentTokens; value.output = ChatFeatures.textTokens(outputText); value.total = value.input + value.output; return value;
  }
  static label(value: RequestUsage | undefined): string {
    if (!value || value.total < 0) return 'Token 未返回';
    return (value.source === 'reported' ? '' : '约 ') + value.total + ' token';
  }
  static summary(entries: UsageEntry[]): string {
    const actual = entries.filter((e) => e.usage.source === 'reported'); const estimated = entries.filter((e) => e.usage.source === 'estimated');
    const sum = (items: UsageEntry[], field: string): number => items.reduce((n, e) => n + Math.max(0, field === 'input' ? e.usage.input : field === 'output' ? e.usage.output : field === 'cached' ? e.usage.cached : field === 'cacheWrite' ? e.usage.cacheWrite : field === 'reasoning' ? e.usage.reasoning : e.usage.total), 0);
    return '服务端已报告：' + actual.length + ' 次请求\n输入：' + sum(actual, 'input') + ' · 输出：' + sum(actual, 'output') + ' · 总计：' + sum(actual, 'total') +
      '\n缓存读取：' + sum(actual, 'cached') + ' · 缓存写入：' + sum(actual, 'cacheWrite') + ' · 推理：' + sum(actual, 'reasoning') +
      '\n\n另有估算：' + estimated.length + ' 次，约 ' + sum(estimated, 'total') + ' token\n命名请求：' + entries.filter((e) => e.kind === 'title').length + ' 次（已计入上方）' +
      '\n\n从本版本开始记录，包括重新生成和已中断请求；旧消息没有可追溯账单。部分服务只返回总量，输入/输出可能未知。推理/缓存为细分项，不能重复加到总计。估算与账单可能有差异。';
  }
}
