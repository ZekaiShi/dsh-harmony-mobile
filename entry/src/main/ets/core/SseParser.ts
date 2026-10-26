import { SseFrame } from './NativeModels';

// HTTP chunks can split both UTF-8 characters and CRLF separators. UTF-8 is
// decoded with a streaming decoder by the platform adapter before reaching here.
export class SseParser {
  private buffer: string = '';
  private event: string = 'message';
  private lines: string[] = [];
  private size: number = 0;

  push(text: string): SseFrame[] {
    this.buffer += text;
    if (this.buffer.length + this.size > 4 * 1024 * 1024) throw new Error('流式消息过大，请重新连接。');
    const frames: SseFrame[] = [];
    let end = this.buffer.indexOf('\n');
    while (end >= 0) {
      let line = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 1);
      if (line.endsWith('\r')) line = line.slice(0, -1);
      if (line.length === 0) {
        if (this.lines.length > 0) frames.push({ event: this.event, data: this.lines.join('\n') });
        this.lines = []; this.event = 'message'; this.size = 0;
      } else if (!line.startsWith(':')) {
        const colon = line.indexOf(':');
        const field = colon < 0 ? line : line.slice(0, colon);
        let value = colon < 0 ? '' : line.slice(colon + 1);
        if (value.startsWith(' ')) value = value.slice(1);
        if (field === 'event') this.event = value;
        if (field === 'data') {
          // Empty data lines still allocate array slots and newline separators.
          // Charge both and bound the line count even when values are empty.
          this.size += value.length + 1;
          if (this.size > 4 * 1024 * 1024 || this.lines.length >= 16384) throw new Error('流式消息过大，请重新连接。');
          this.lines.push(value);
        }
      }
      end = this.buffer.indexOf('\n');
    }
    return frames;
  }
}
