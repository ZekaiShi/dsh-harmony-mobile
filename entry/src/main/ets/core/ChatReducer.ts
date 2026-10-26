import { ChatBlock, ChatMessage, ChatProjection, WireContent, WireData, WireRecord } from './NativeModels';
import { ToolPresentation } from './ToolPresentation';

export class ChatReducer {
  private static tool(name: string, id: string, args?: Object): ChatBlock {
    const block = new ChatBlock(); block.kind = 'tool'; block.name = name; block.id = id; block.status = 'running';
    const activity = ToolPresentation.describe(name, args); block.category = activity.category; block.summary = activity.summary;
    block.text = args ? JSON.stringify(args, null, 2) : ''; return block;
  }
  private static blocks(content: WireContent[]): ChatBlock[] {
    const result: ChatBlock[] = [];
    for (const item of content) {
      if ((item.type === 'text' || item.type === 'reasoning') && item.text) {
        const block = new ChatBlock(); block.kind = item.type; block.text = item.text; result.push(block);
      } else if (item.type === 'tool-call') {
        result.push(this.tool(item.name || '工具', item.id || '', item.arguments));
      }
    }
    return result;
  }

  static project(records: WireRecord[]): ChatProjection {
    const result = new ChatProjection();
    const steps = new Map<string, ChatMessage>();
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
      if (type === 'turn/end') result.running = false;
      if (type === 'user/message') {
        const source = data.message?.source || data.source;
        if (source?.kind === 'user') {
          const message = new ChatMessage(); message.id = 'user-' + (record.seq || serial++); message.role = 'user';
          message.blocks = this.blocks(data.message?.content || data.content || []).filter((block: ChatBlock) => block.kind === 'text');
          if (message.blocks.length > 0) result.messages.push(message);
        }
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
        const message = step(data); message.blocks = this.blocks(data.message?.content || []); message.streaming = false;
      } else if (type === 'tool/call') {
        const message = step(data);
        if (!message.blocks.some((block: ChatBlock) => block.kind === 'tool' && block.id === data.callId)) {
          message.blocks.push(this.tool(data.name || '工具', data.callId || '', data.arguments));
        }
      } else if (type === 'tool/result') {
        const message = step(data);
        const toolResult = (data.message?.content || []).find((block: WireContent) => block.type === 'tool-result');
        const id = toolResult?.toolCallId || '';
        let block = message.blocks.find((item: ChatBlock) => item.kind === 'tool' && item.id === id);
        if (block === undefined) { block = this.tool(id || '工具', id); message.blocks.push(block); }
        block.status = data.error || toolResult?.isError ? 'error' : 'done';
        const output = (toolResult?.content || []).filter((item: WireContent) => item.type === 'text').map((item: WireContent) => item.text || '').join('\n');
        if (output) block.text += (block.text ? '\n\n输出：\n' : '') + output;
        message.streaming = false;
      }
    }
    result.messages = result.messages.filter((message: ChatMessage) => message.blocks.length > 0);
    return result;
  }
}
