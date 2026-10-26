import { ChatBlock, ChatMessage } from './NativeModels';

// Presentation only: canonical messages and exports remain unchanged.
export class ChatActivity {
  static label(group: ChatBlock): string {
    const tools = group.children.filter((b) => b.kind === 'tool').length;
    return tools ? (group.children.some((b) => b.kind === 'reasoning') ? '思考与调用' : '工具调用') + ' · ' + tools : '思考过程';
  }
  static project(messages: ChatMessage[]): ChatMessage[] {
    const rows: ChatMessage[] = [];
    for (const message of messages) {
      if (message.role === 'user') { rows.push(message); continue; }
      for (let index = 0; index < message.blocks.length; index++) {
        const block = message.blocks[index];
        if (block.kind === 'text') {
          const row = new ChatMessage(); row.id = message.id + ':text:' + index; row.version = message.version;
          row.streaming = message.streaming; row.blocks = [block]; rows.push(row); continue;
        }
        const child = new ChatBlock(); child.kind = block.kind; child.text = block.text; child.name = block.name; child.id = block.id;
        child.category = block.category; child.summary = block.summary; child.status = block.status;
        child.key = message.id + ':' + (block.key || block.kind + ':' + index);
        let row = rows.length ? rows[rows.length - 1] : undefined;
        if (!row || row.role === 'user' || row.blocks[0]?.kind !== 'activity') {
          row = new ChatMessage(); row.id = 'activity:' + child.key;
          const group = new ChatBlock(); group.kind = 'activity'; group.key = row.id; row.blocks = [group]; rows.push(row);
        }
        const group = row.blocks[0]; group.children.push(child); row.version = Math.max(row.version, message.version);
        group.status = group.children.some((b) => b.status === 'running') ? 'running' : group.children.some((b) => b.status === 'error') ? 'error' : 'done';
      }
    }
    // A single call/reasoning uses one disclosure, rather than two nested ones.
    for (const row of rows) if (row.blocks[0]?.kind === 'activity' && row.blocks[0].children.length === 1) row.blocks = row.blocks[0].children;
    return rows;
  }
}
