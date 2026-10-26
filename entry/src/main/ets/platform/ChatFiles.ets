import { common } from '@kit.AbilityKit';
import { fileIo, picker, fileUri } from '@kit.CoreFileKit';
import { util } from '@kit.ArkTS';
import { ChatAttachment, ChatFeatures, ResolvedAttachment } from '../core/ChatFeatures';
import { AssistantData, LocalConversation, LocalMessage } from '../core/AssistantCore';
import { ImageAsset } from '../core/MediaCore';
import { MediaFiles } from './MediaFiles';

export class ChatFiles {
  private root: string = '';
  private images: MediaFiles = new MediaFiles('chat-images');
  load(context: common.Context): void {
    this.root = context.filesDir + '/chat-files';
    if (!fileIo.accessSync(this.root)) fileIo.mkdirSync(this.root);
    this.images.load(context);
  }
  private imageAsset(ref: ChatAttachment): ImageAsset {
    const asset = new ImageAsset(); asset.file = ref.file; asset.mime = ref.mime; asset.width = ref.width; asset.height = ref.height; return asset;
  }
  uri(ref: ChatAttachment): string {
    if (!ChatFeatures.attachment(ref)) throw new Error('附件记录无效。');
    return ref.kind === 'image' ? this.images.uri(this.imageAsset(ref)) : 'file://' + this.root + '/' + ref.file;
  }
  private imageRef(image: ImageAsset): ChatAttachment {
    const ref = new ChatAttachment(); ref.kind = 'image'; ref.file = image.file; ref.mime = image.mime;
    ref.width = image.width; ref.height = image.height; ref.name = '图片.jpg';
    ref.size = fileIo.statSync(this.images.path(image)).size; ref.tokens = 2048; return ref;
  }
  async select(context: common.Context, photo: boolean): Promise<ChatAttachment | undefined> {
    if (photo) {
      const image = await this.images.select(context); if (!image) return undefined;
      return this.imageRef(image);
    }
    const uris = await new picker.DocumentViewPicker(context).select({ maxSelectNumber: 1, fileSuffixFilters: ['支持的附件|.png,.jpg,.jpeg,.webp,.txt,.md,.json,.csv,.log,.ts,.js,.py,.html,.css,.yaml,.yml,.xml,.pdf'] });
    if (!uris.length) return undefined;
    const uri = uris[0]; let name = '附件';
    try { name = new fileUri.FileUri(uri).name; } catch (_) {}
    try { name = decodeURIComponent(name); } catch (_) {}
    name = name.replace(/[\u0000-\u001f]/g, '').slice(0, 200);
    if (/\.(png|jpe?g|webp)$/i.test(name)) { const ref = this.imageRef(await this.images.importUri(uri)); ref.name = name; return ref; }
    const pdf = /\.pdf$/i.test(name);
    if (!pdf && !/\.(txt|md|json|csv|log|ts|js|py|html|css|ya?ml|xml)$/i.test(name)) throw new Error('目前支持 UTF-8 文本、代码和 PDF。Word、压缩包、音频暂不支持。');
    const file = fileIo.openSync(uri, fileIo.OpenMode.READ_ONLY); let bytes: Uint8Array;
    try {
      const size = fileIo.statSync(file.fd).size;
      if (size < 1 || size > (pdf ? 4 * 1024 * 1024 : 256 * 1024)) throw new Error(pdf ? 'PDF 需小于 4 MiB。' : '文本文件需小于 256 KiB。');
      const buffer = new ArrayBuffer(size);
      if (fileIo.readSync(file.fd, buffer) !== size) throw new Error('附件未读取完整。');
      bytes = new Uint8Array(buffer);
    } finally { fileIo.closeSync(file); }
    const ref = new ChatAttachment(); ref.kind = pdf ? 'pdf' : 'text'; ref.mime = pdf ? 'application/pdf' : 'text/plain'; ref.name = name;
    ref.size = bytes.length; ref.file = util.generateRandomUUID(true) + (pdf ? '.pdf' : '.txt');
    if (pdf) {
      if (bytes[0] !== 37 || bytes[1] !== 80 || bytes[2] !== 68 || bytes[3] !== 70 || bytes[4] !== 45) throw new Error('这个文件不是有效的 PDF。');
      ref.tokens = Math.ceil(bytes.length / 2);
      if (ref.tokens > 1000000) ref.tokens = 1000000;
    } else {
      const text = util.TextDecoder.create('utf-8', { fatal: true }).decodeToString(bytes);
      if (text.includes('\u0000')) throw new Error('文件不是可读取的 UTF-8 文本。');
      ref.tokens = ChatFeatures.textTokens(text);
    }
    let total = ref.size;
    for (const old of fileIo.listFileSync(this.root)) if (/^[a-zA-Z0-9_-]+\.(txt|pdf)$/.test(old)) total += fileIo.statSync(this.root + '/' + old).size;
    if (total > 64 * 1024 * 1024) throw new Error('本机文档达到 64 MiB，请删除不用的对话附件。');
    const output = fileIo.openSync(this.root + '/' + ref.file, fileIo.OpenMode.CREATE | fileIo.OpenMode.WRITE_ONLY | fileIo.OpenMode.TRUNC);
    try { if (fileIo.writeSync(output.fd, bytes.buffer as ArrayBuffer) !== bytes.length) throw new Error('附件未能完整保存。'); fileIo.fsyncSync(output.fd); }
    finally { fileIo.closeSync(output); }
    return ref;
  }
  resolve(ref: ChatAttachment): ResolvedAttachment {
    if (!ChatFeatures.attachment(ref)) throw new Error('附件记录无效。');
    if (ref.kind === 'image') return { kind: ref.kind, name: ref.name, mime: ref.mime, data: this.images.dataUrl(this.imageAsset(ref)).split(',')[1] };
    const path = this.root + '/' + ref.file;
    if (fileIo.statSync(path).size !== ref.size) throw new Error('附件已丢失或发生变化。');
    const file = fileIo.openSync(path, fileIo.OpenMode.READ_ONLY), buffer = new ArrayBuffer(ref.size);
    try { if (fileIo.readSync(file.fd, buffer) !== ref.size) throw new Error('附件读取不完整。'); }
    finally { fileIo.closeSync(file); }
    const bytes = new Uint8Array(buffer);
    return { kind: ref.kind, name: ref.name, mime: ref.mime, data: ref.kind === 'text' ? util.TextDecoder.create('utf-8', { fatal: true }).decodeToString(bytes) : new util.Base64Helper().encodeToStringSync(bytes) };
  }
  prune(data: AssistantData): void {
    const keep: string[] = [];
    const add = (refs: ChatAttachment[]): void => { for (const ref of refs || []) if (ChatFeatures.attachment(ref)) keep.push(ref.file); };
    for (const conversation of data.conversations) { add(conversation.draftAttachments); for (const message of conversation.messages) add(message.attachments); }
    for (const folder of ['chat-files','chat-images']) {
      const root = folder === 'chat-files' ? this.root : this.root.replace(/\/chat-files$/, '/chat-images');
      for (const file of fileIo.listFileSync(root)) if (/^[a-zA-Z0-9_-]+\.(txt|pdf|jpeg|png|webp)$/.test(file) && !keep.includes(file)) fileIo.unlinkSync(root + '/' + file);
    }
  }
}
