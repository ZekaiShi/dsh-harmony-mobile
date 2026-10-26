import { LocalConversation } from './AssistantCore';
import { ChatMessage } from './NativeModels';
import { MessageFormat } from './MessageFormat';
import { ChatFeatures } from './ChatFeatures';
import { ImageAsset, MediaRecord } from './MediaCore';

export class ExportImage { file: string = ''; namespace: string = ''; width: number = 0; height: number = 0; }
export class ExportMessage { role: string = ''; text: string = ''; note: string = ''; attachments: string[] = []; images: ExportImage[] = []; }
export class ExportDocument { title: string = ''; source: string = ''; model: string = ''; partial: boolean = false; messages: ExportMessage[] = []; }
export class PaintItem {
  kind: string = 'text'; text: string = ''; x: number = 0; y: number = 0; width: number = 0; height: number = 0;
  size: number = 28; bold: boolean = false; mono: boolean = false; color: string = '#30302e'; fill: string = ''; image?: ExportImage;
}
export class ExportPage { height: number = 0; items: PaintItem[] = []; }
export type ExportMeasure = (text: string, size: number, bold: boolean, mono: boolean) => number;

export class ConversationExport {
  static readonly WIDTH: number = 1080;
  static image(asset: ImageAsset, namespace: string): ExportImage {
    if (!/^[a-zA-Z0-9_-]{1,100}\.(png|jpeg|webp)$/.test(asset.file) || !['chat-images','media'].includes(namespace) || !Number.isFinite(asset.width * asset.height) || asset.width <= 0 || asset.height <= 0 || asset.width * asset.height > 40000000) throw new Error('图片引用无效。');
    return { file: asset.file, namespace: namespace, width: asset.width, height: asset.height };
  }
  static assistant(conversation: LocalConversation): ExportDocument {
    const doc = new ExportDocument(); doc.title = conversation.title; doc.source = '独立 AI 聊天'; doc.model = conversation.profile.model;
    for (const item of conversation.messages) {
      const message = new ExportMessage(); message.role = item.role; message.text = item.text;
      if (item.status !== 'done') message.note = item.status === 'streaming' ? '导出时回复仍在生成，仅包含当时内容' : '此条回复未完整完成';
      for (const ref of ChatFeatures.attachments(item.attachments)) {
        message.attachments.push(ref.name);
        if (ref.kind === 'image') message.images.push(this.image({ file: ref.file, mime: ref.mime, width: ref.width, height: ref.height }, 'chat-images'));
      }
      if (message.text || message.attachments.length) doc.messages.push(message);
    }
    return doc;
  }
  static desktop(title: string, messages: ChatMessage[], partial: boolean): ExportDocument {
    const doc = new ExportDocument(); doc.title = title; doc.source = 'DSH 电脑会话'; doc.partial = partial;
    for (const item of messages) {
      if (!['user','assistant'].includes(item.role)) continue;
      const message = new ExportMessage(); message.role = item.role; message.text = item.blocks.filter((b) => b.kind === 'text').map((b) => b.text).join('\n\n');
      if (item.streaming) message.note = '导出时回复仍在生成，仅包含当时内容';
      if (message.text) doc.messages.push(message);
    }
    return doc;
  }
  static media(record: MediaRecord): ExportDocument {
    const doc = new ExportDocument(); doc.title = record.purpose === 'vision' ? '图片问答' : '图像作品'; doc.source = '图像工作室'; doc.model = record.profile.model;
    const user = new ExportMessage(); user.role = 'user'; user.text = record.prompt;
    if (record.input) user.images.push(this.image(record.input, 'media'));
    const reply = new ExportMessage(); reply.role = 'assistant'; reply.text = record.text;
    reply.images = record.images.map((asset: ImageAsset) => this.image(asset, 'media'));
    for (const asset of record.images) reply.attachments.push('生成图片 ' + asset.width + '×' + asset.height);
    doc.messages = [user, reply]; return doc;
  }
  static filename(title: string, extension: string): string {
    if (!['md','png','pdf'].includes(extension)) throw new Error('导出格式不支持。');
    const name = Array.from(title.replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '')).slice(0, 48).join('') || '对话';
    return 'DSH-' + name + '.' + extension;
  }
  static markdown(doc: ExportDocument): string {
    let result = '# ' + doc.title.replace(/[\r\n]/g, ' ') + '\n\n> ' + doc.source + ' · 助手内容由 AI 生成，请核对重要信息。\n';
    if (doc.model) result += '> 模型：' + doc.model + '\n';
    if (doc.partial) result += '> 部分历史：电脑仍有未返回的较早消息，本文件不代表完整会话。\n';
    result += '> 本文件不包含系统指令、草稿、隐藏思考和工具内部参数；附件仅列出名称，图片未嵌入 Markdown。\n';
    for (const message of doc.messages) {
      result += '\n## ' + (message.role === 'user' ? '你' : '助手 · AI 生成') + '\n\n' + message.text + '\n';
      if (message.note) result += '\n> ' + message.note + '\n';
      for (const name of message.attachments) result += '\n> 附件：' + name.replace(/[\r\n]/g, ' ').replace(/[\\`<>\[\]*_]/g, '\\$&') + '\n';
    }
    if (result.length > 16 * 1024 * 1024) throw new Error('对话超过当前单文件导出上限，请选择较短会话。');
    return result;
  }
  static wrap(text: string, width: number, size: number, bold: boolean, mono: boolean, measure: ExportMeasure): string[] {
    const lines: string[] = []; let line = ''; let length = 0;
    for (const char of text.replace(/\r\n?/g, '\n')) {
      if (char === '\n') { lines.push(line); line = ''; length = 0; continue; }
      const next = measure(char, size, bold, mono);
      if (line && length + next > width) { lines.push(line); line = ''; length = 0; }
      line += char; length += next;
    }
    lines.push(line); return lines;
  }
  static pages(doc: ExportDocument, maxHeight: number, measure: ExportMeasure, fixedHeight: boolean = false): ExportPage[] {
    if (doc.messages.reduce((n, m) => n + m.text.length, 0) > 200000) throw new Error('图文内容较长，请改用 Markdown 导出，或分条导出。');
    const pages: ExportPage[] = []; let page = new ExportPage(); let y = 68;
    const bottom = maxHeight - 88, left = 64, width = this.WIDTH - 128;
    const finish = (): void => { page.height = fixedHeight ? maxHeight : Math.min(maxHeight, Math.max(240, y + 88)); pages.push(page); if (pages.length > 100) throw new Error('图文导出超过 100 页，请改用 Markdown。'); };
    const next = (): void => { finish(); page = new ExportPage(); y = 68; };
    const space = (height: number): void => { if (y + height > bottom) next(); };
    const line = (value: string, size: number = 28, bold: boolean = false, mono: boolean = false, color: string = '#30302e', indent: number = 0, fill: string = ''): void => {
      const height = Math.ceil(size * 1.58); space(height);
      const item = new PaintItem(); item.text = value; item.x = left + indent; item.y = y; item.width = width - indent; item.height = height; item.size = size; item.bold = bold; item.mono = mono; item.color = color; item.fill = fill; page.items.push(item); y += height;
    };
    const prose = (value: string, size: number = 28, bold: boolean = false, mono: boolean = false, color: string = '#30302e', indent: number = 0, fill: string = ''): void => {
      for (const valueLine of this.wrap(value, width - indent - 16, size, bold, mono, measure)) line(valueLine, size, bold, mono, color, indent, fill);
    };
    prose(doc.title, 42, true); prose(doc.source + (doc.model ? ' · ' + doc.model : ''), 23, false, false, '#817f78');
    prose('助手内容由 AI 生成，请核对重要信息。', 23, false, false, '#817f78');
    if (doc.partial) prose('部分历史：未包含电脑尚未返回的较早消息。', 23, true, false, '#a14832');
    y += 24;
    for (const message of doc.messages) {
      space(110); line(message.role === 'user' ? '你' : '助手 · AI 生成', 26, true, false, message.role === 'user' ? '#a4573b' : '#30302e'); y += 10;
      for (const section of MessageFormat.sections(message.text)) {
        if (section.kind === 'table' && section.rows.length) {
          const columns = Math.max(...section.rows.map((r) => r.cells.length));
          if (columns > 6) { for (const row of section.rows) for (let c = 0; c < row.cells.length; c++) prose('第 ' + (c + 1) + ' 列：' + row.cells[c].parts.map((p) => p.text).join('')); }
          else {
            const columnWidth = width / Math.max(1, columns), cellSize = 25, rowLine = 42;
            for (let rowIndex = 0; rowIndex < section.rows.length; rowIndex++) {
              const cells = section.rows[rowIndex].cells.map((cell) => this.wrap(cell.parts.map((p) => p.text).join(''), columnWidth - 24, cellSize, rowIndex === 0, false, measure));
              const count = Math.max(1, ...cells.map((cell) => cell.length));
              for (let r = 0; r < count; r++) {
                space(rowLine);
                for (let c = 0; c < columns; c++) {
                  const item = new PaintItem(); item.text = cells[c]?.[r] || ''; item.x = left + c * columnWidth; item.y = y; item.width = columnWidth; item.height = rowLine; item.size = cellSize; item.bold = rowIndex === 0; item.kind = 'cell'; item.fill = rowIndex === 0 ? '#efeee8' : '#faf9f5'; page.items.push(item);
                }
                y += rowLine;
              }
              y += 2;
            }
          }
        } else if (section.kind === 'rule') { line('────────────────────', 22, false, false, '#d9d7cf'); }
        else {
          const content = section.kind === 'code' ? section.text : section.parts.map((p) => p.text).join('') || section.text;
          const heading = section.kind === 'heading', code = section.kind === 'code';
          prose((section.marker ? section.marker + ' ' : '') + content, heading ? 34 : code ? 25 : 28, heading, code, section.kind === 'quote' ? '#817f78' : '#30302e', section.level && !heading ? Math.min(96, section.level * 24) : 0, code ? '#efeee8' : '');
        }
        y += 12;
      }
      if (message.note) prose(message.note, 23, false, false, '#817f78');
      for (const name of message.attachments) prose('附件：' + name, 23, false, false, '#817f78');
      for (const image of message.images) {
        const height = Math.min(680, width * image.height / image.width); space(height + 16);
        const item = new PaintItem(); item.kind = 'image'; item.image = image; item.x = left; item.y = y; item.width = Math.min(width, height * image.width / image.height); item.height = height; page.items.push(item); y += height + 16;
      }
      y += 28;
    }
    finish();
    for (let index = 0; index < pages.length; index++) {
      const footer = new PaintItem(); footer.text = 'DSH Harmony Mobile · ' + (index + 1) + '/' + pages.length + ' · AI 生成内容'; footer.x = left; footer.y = pages[index].height - 58; footer.size = 21; footer.color = '#817f78'; footer.height = 34; pages[index].items.push(footer);
    }
    return pages;
  }
}
