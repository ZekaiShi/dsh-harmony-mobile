import { ChatBlock, ChatMessage, ChatProjection, WireContent, WireData, WireRecord } from './NativeModels';
import { ToolPresentation } from './ToolPresentation';
interface ToolState { block: ChatBlock; message: ChatMessage; }

export class ChatReducer {
  private static tool(name: string, id: string, args?: Object): ChatBlock {
    const block = new ChatBlock(); block.kind = 'tool'; block.name = name; block.id = id; block.status = 'running';
    const activity = ToolPresentation.describe(name, args); block.category = activity.category; block.summary = activity.summary;
    block.key = id ? 'tool:' + id : '';
    block.text = typeof args === 'string' ? args : args ? JSON.stringify(args, null, 2) : ''; return block;
  }
  private static blocks(content: WireContent[]): ChatBlock[] {
    const result: ChatBlock[] = [];
    for (const item of content) {
      if ((item.type === 'text' || item.type === 'reasoning') && item.text) {
        const block = new ChatBlock(); block.kind = item.type; block.text = item.text; block.key = item.type + ':' + result.length; result.push(block);
      } else if (item.type === 'tool-call') {
        result.push(this.tool(item.name || '工具', item.id || '', item.arguments));
      }
    }
    return result;
  }

  static project(records: WireRecord[]): ChatProjection {
    const result = new ChatProjection();
    const steps = new Map<string, ChatMessage>();
    const senderCommands = new Set<string>();
    const calls = new Map<string, ToolState>();
    const latestCalls = new Map<string, ToolState>();
    const callKey = (data: WireData, id: string): string => String(data.turn ?? '') + ':' + id;
    const findCall = (data: WireData, id: string): ToolState | undefined => id ? calls.get(callKey(data, id)) || (data.turn === undefined ? latestCalls.get(id) : undefined) : undefined;
    const remember = (data: WireData, block: ChatBlock, message: ChatMessage): void => {
      if (block.id) { const state: ToolState = { block: block, message: message }; calls.set(callKey(data, block.id), state); latestCalls.set(block.id, state); }
    };
    let serial: number = 0;
    let revision: number = 0;
    const step = (data: WireData): ChatMessage => {
      const key = data.turn !== undefined || data.step !== undefined ? String(data.turn) + ':' + String(data.step) : (data.stepId || 'default');
      let message = steps.get(key);
      if (message === undefined) {
        message = new ChatMessage(); message.id = 'assistant-' + key + '-' + serial++; message.streaming = true;
        steps.set(key, message); result.messages.push(message);
      }
      message.version = revision;
      return message;
    };
    for (const record of records) {
      revision++;
      const event = record.event || record;
      const type = (event.type || '').toLowerCase();
      const data: WireData = event.data || {};
      if (type === 'turn/start') result.running = true;
      if (type === 'turn/end') {
        result.running = false;
        for (const state of calls.values()) if (state.block.status === 'running') { state.block.status = 'ended'; state.message.streaming = false; state.message.version = revision; }
      }
      if (type === 'user/message') {
        const source = data.message?.source || data.source;
        if (source?.kind === 'user') {
          const message = new ChatMessage(); message.id = 'user-' + (record.seq ?? serial++); message.role = 'user';
          message.blocks = this.blocks(data.message?.content || data.content || []).filter((block: ChatBlock) => block.kind === 'text');
          if (message.blocks.length > 0) result.messages.push(message);
        }
      } else if (type === 'command/run' && data.name === 'harmony-send' && typeof data.commandId === 'string') {
        senderCommands.add(data.commandId);
      } else if (type === 'command/done' && data.commandId && senderCommands.has(data.commandId)) {
        senderCommands.delete(data.commandId);
        if (data.kind !== 'success' || typeof data.text !== 'string' || !data.text.trim() || data.text.length > 16384) continue;
        const message = new ChatMessage(); message.id = 'harmony-' + data.commandId; message.version = revision;
        message.blocks = this.blocks([{ type: 'text', text: data.text }]); result.messages.push(message);
      } else if (type === 'assistant/chunk') {
        const chunk = data.chunk;
        if (chunk === undefined || (chunk.type !== 'text-delta' && chunk.type !== 'reasoning-delta')) continue;
        const message = step(data);
        const kind = chunk.type === 'text-delta' ? 'text' : 'reasoning';
        const key = kind + ':' + (chunk.index || 0);
        let block = message.blocks.find((item: ChatBlock) => item.key === key);
        if (block === undefined) { block = new ChatBlock(); block.kind = kind; block.key = key; message.blocks.push(block); }
        block.text += chunk.text || chunk.delta || '';
      } else if (type === 'assistant/message') {
        const message = step(data), blocks = this.blocks(data.message?.content || []);
        for (const block of blocks) if (block.kind === 'tool') {
          const previous = findCall(data, block.id);
          if (previous) { block.status = previous.block.status; block.text = previous.block.text || block.text; }
          remember(data, block, message);
        }
        message.blocks = blocks; message.streaming = false;
      } else if (type === 'tool/call') {
        const message = step(data), existing = findCall(data, data.callId || '');
        if (!existing) {
          const block = this.tool(data.name || '工具', data.callId || '', data.arguments); message.blocks.push(block); remember(data, block, message);
        }
      } else if (type === 'tool/result') {
        const content = data.message?.content || [];
        const nested = content.filter((item: WireContent) => item.type === 'tool-result');
        const outputs: WireContent[] = nested.length ? nested : [{ type: 'tool-result', toolCallId: data.message?.toolCallId || data.callId, isError: data.message?.isError, content: content }];
        for (const output of outputs) {
          const id = output.toolCallId || '', existing = findCall(data, id);
          const message = existing?.message || step(data);
          const block = existing?.block || this.tool(data.name || data.message?.name || '工具', id, undefined);
          if (!existing) { message.blocks.push(block); remember(data, block, message); }
          block.status = data.error || output.isError ? 'error' : 'done';
          const text = (output.content || []).filter((item: WireContent) => item.type === 'text').map((item: WireContent) => item.text || '').join('\n');
          if (text) block.text += (block.text ? '\n\n输出：\n' : '') + text;
          message.streaming = false; message.version = revision;
        }
      }
    }
    result.messages = result.messages.filter((message: ChatMessage) => message.blocks.length > 0);
    return result;
  }
}
