import { common } from '@kit.AbilityKit';
import { fileIo, picker } from '@kit.CoreFileKit';
import { image } from '@kit.ImageKit';
import { util } from '@kit.ArkTS';
import { RasterPdf } from '../core/RasterPdf';
import { LengthMetricsUnit } from '@kit.ArkUI';
import { ConversationExport, ExportDocument, ExportPage, PaintItem } from '../core/ConversationExport';

export class PreparedConversation { root: string = ''; files: string[] = []; names: string[] = []; format: string = ''; }

// No server, Web page or model is involved in an export. Only private cache
// images selected by a validated document may be read; no remote URL is fetched.
export class ConversationFiles {
  private static busy: boolean = false;
  private static font(size: number, bold: boolean, mono: boolean): string { return (bold ? 'bold ' : '') + size + 'px ' + (mono ? 'monospace' : 'sans-serif'); }
  private static async paint(context: common.Context, page: ExportPage, target: string, format: string): Promise<void> {
    const canvas = new OffscreenCanvas(ConversationExport.WIDTH, page.height, LengthMetricsUnit.PX);
    const drawing = canvas.getContext('2d', new RenderingContextSettings(true));
    drawing.fillStyle = '#faf9f5'; drawing.fillRect(0, 0, ConversationExport.WIDTH, page.height); drawing.textBaseline = 'top';
    try {
      for (const item of page.items) {
        if (item.kind === 'image' && item.image) {
          const ref = item.image;
          // Validate again at the I/O boundary, not just when the snapshot was built.
          ConversationExport.image({ file: ref.file, width: ref.width, height: ref.height, mime: '' }, ref.namespace);
          const source = image.createImageSource(context.filesDir + '/' + ref.namespace + '/' + ref.file);
          let pixels: image.PixelMap | undefined;
          try {
            const info = await source.getImageInfo();
            if (info.size.width * info.size.height > 40000000) throw new Error('图片像素超过导出范围。');
            pixels = await source.createPixelMap({ desiredSize: { width: Math.max(1, Math.round(item.width)), height: Math.max(1, Math.round(item.height)) } });
            drawing.drawImage(pixels, item.x, item.y, item.width, item.height);
          } finally { await pixels?.release(); await source.release(); }
          continue;
        }
        if (item.fill) { drawing.fillStyle = item.fill; drawing.fillRect(item.x, item.y, item.width, item.height); }
        if (item.kind === 'cell') { drawing.strokeStyle = '#dfddd4'; drawing.lineWidth = 1; drawing.strokeRect(item.x, item.y, item.width, item.height); }
        drawing.font = ConversationFiles.font(item.size, item.bold, item.mono); drawing.fillStyle = item.color;
        drawing.fillText(item.text, item.x + (item.kind === 'cell' ? 10 : item.fill ? 6 : 0), item.y + 4);
      }
      const pixels = drawing.getPixelMap(0, 0, ConversationExport.WIDTH, page.height), packer = image.createImagePacker();
      const file = fileIo.openSync(target, fileIo.OpenMode.CREATE | fileIo.OpenMode.WRITE_ONLY | fileIo.OpenMode.TRUNC);
      try { await packer.packToFile(pixels, file.fd, { format: format === 'png' ? 'image/png' : 'image/jpeg', quality: format === 'png' ? 100 : 94 }); fileIo.fsyncSync(file.fd); }
      finally { fileIo.closeSync(file); await pixels.release(); await packer.release(); }
    } finally { canvas.width = 0; canvas.height = 0; }
  }
  static async prepare(context: common.Context, doc: ExportDocument, format: string): Promise<PreparedConversation> {
    if (!['md','png','pdf'].includes(format)) throw new Error('导出格式不支持。');
    if (ConversationFiles.busy) throw new Error('已有导出正在处理，请稍候。');
    ConversationFiles.busy = true;
    const result = new PreparedConversation(); result.root = context.cacheDir + '/chat-export-' + util.generateRandomUUID(true); result.format = format;
    try {
      fileIo.mkdirSync(result.root);
      if (format === 'md') {
        const text = ConversationExport.markdown(doc), path = result.root + '/conversation.md';
        const bytes = new util.TextEncoder().encodeInto(text);
        if (bytes.length > 16 * 1024 * 1024) throw new Error('导出文件超过 16 MiB，请分段导出。');
        const file = fileIo.openSync(path, fileIo.OpenMode.CREATE | fileIo.OpenMode.WRITE_ONLY | fileIo.OpenMode.TRUNC);
        try { if (fileIo.writeSync(file.fd, bytes.buffer as ArrayBuffer) !== bytes.length) throw new Error('文件写入不完整。'); fileIo.fsyncSync(file.fd); } finally { fileIo.closeSync(file); }
        result.files = [path]; result.names = [ConversationExport.filename(doc.title, 'md')]; return result;
      }
      const measureCanvas = new OffscreenCanvas(1, 1, LengthMetricsUnit.PX), measuring = measureCanvas.getContext('2d');
      const widths = new Map<string, number>();
      const pages = ConversationExport.pages(doc, format === 'pdf' ? 1528 : 10000, (text: string, size: number, bold: boolean, mono: boolean): number => {
        const font = ConversationFiles.font(size, bold, mono), key = font + ':' + text, saved = widths.get(key);
        if (saved !== undefined) return saved;
        measuring.font = font; const width = measuring.measureText(text).width; widths.set(key, width); return width;
      }, format === 'pdf');
      measureCanvas.width = 0; measureCanvas.height = 0;
      let bytes = 0;
      for (let index = 0; index < pages.length; index++) {
        const path = result.root + '/page-' + index + (format === 'pdf' ? '.jpeg' : '.png');
        await ConversationFiles.paint(context, pages[index], path, format);
        bytes += fileIo.statSync(path).size;
        if (bytes > 80 * 1024 * 1024) throw new Error('导出缓存超过 80 MiB，请改用 Markdown。');
        result.files.push(path);
      }
      if (format === 'pdf') {
        const path = result.root + '/conversation.pdf';
        const document = fileIo.openSync(path, fileIo.OpenMode.CREATE | fileIo.OpenMode.WRITE_ONLY | fileIo.OpenMode.TRUNC);
        try {
          const writer = new RasterPdf(result.files.length, (data: Uint8Array): void => {
            if (fileIo.writeSync(document.fd, data.buffer as ArrayBuffer) !== data.length) throw new Error('PDF 写入不完整。');
          });
          for (let index = 0; index < result.files.length; index++) {
            const input = fileIo.openSync(result.files[index], fileIo.OpenMode.READ_ONLY);
            try {
              const bytes = new Uint8Array(fileIo.statSync(input.fd).size);
              if (fileIo.readSync(input.fd, bytes.buffer as ArrayBuffer) !== bytes.length) throw new Error('PDF 页面读取不完整。');
              writer.page(bytes, ConversationExport.WIDTH, pages[index].height);
            } finally { fileIo.closeSync(input); }
          }
          writer.finish(); fileIo.fsyncSync(document.fd);
        } finally { fileIo.closeSync(document); }
        for (const temporary of result.files) fileIo.unlinkSync(temporary);
        result.files = [path]; result.names = [ConversationExport.filename(doc.title, 'pdf')];
      } else result.names = result.files.map((file: string, index: number) => ConversationExport.filename(doc.title + (pages.length > 1 ? '-' + (index + 1) : ''), 'png'));
      return result;
    } catch (error) { ConversationFiles.dispose(context, result); throw new Error((error as Error).message || '导出未完成。'); }
    finally { ConversationFiles.busy = false; }
  }
  static dispose(context: common.Context, result: PreparedConversation): void {
    if (!result.root.startsWith(context.cacheDir + '/chat-export-') || !/^chat-export-[a-zA-Z0-9_-]+$/.test(result.root.slice(result.root.lastIndexOf('/') + 1))) return;
    try {
      for (const name of fileIo.listFileSync(result.root)) if (/^(?:conversation\.(?:md|pdf)|page-\d+\.(?:png|jpeg))$/.test(name)) fileIo.unlinkSync(result.root + '/' + name);
      fileIo.rmdirSync(result.root);
    } catch (_) {}
  }
  static async save(context: common.Context, result: PreparedConversation): Promise<number> {
    try {
      const uris = await new picker.DocumentViewPicker(context).save({ newFileNames: result.names, fileSuffixChoices: [result.format.toUpperCase() + '|.' + result.format] });
      if (!uris.length) return 0;
      if (uris.length !== result.files.length) throw new Error('请选择保存全部分段，或改用 PDF / Markdown。');
      for (let index = 0; index < uris.length; index++) {
        const target = fileIo.openSync(uris[index], fileIo.OpenMode.WRITE_ONLY | fileIo.OpenMode.TRUNC);
        try { fileIo.copyFileSync(result.files[index], target.fd); } finally { fileIo.closeSync(target); }
      }
      return uris.length;
    } finally { ConversationFiles.dispose(context, result); }
  }
  static async export(context: common.Context, doc: ExportDocument, format: string): Promise<number> { return await ConversationFiles.save(context, await ConversationFiles.prepare(context, doc, format)); }
}
