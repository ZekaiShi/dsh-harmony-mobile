import { common } from '@kit.AbilityKit';
import { fileIo, picker } from '@kit.CoreFileKit';
import { image } from '@kit.ImageKit';
import { photoAccessHelper } from '@kit.MediaLibraryKit';
import { util } from '@kit.ArkTS';
import { rcp } from '@kit.RemoteCommunicationKit';
import { MediaCore, MediaData, ImageAsset, RemoteImage } from '../core/MediaCore';

export class MediaFiles {
  private namespace: string = 'media';
  constructor(namespace: string = 'media') { this.namespace = namespace; }
  private root: string = '';
  private ready: boolean = false;
  private downloads: rcp.Session[] = [];
  private generation: number = 0;
  load(context: common.Context): MediaData {
    if (!['media','chat-images'].includes(this.namespace)) throw new Error('图片缓存目录无效。');
    this.root = context.filesDir + '/' + this.namespace;
    try {
      if (!fileIo.accessSync(this.root)) fileIo.mkdirSync(this.root);
      let data = new MediaData();
      if (fileIo.accessSync(this.root + '/index.json')) {
        if (fileIo.statSync(this.root + '/index.json').size > 2 * 1024 * 1024) throw new Error('记录过大');
        data = MediaCore.restore(fileIo.readTextSync(this.root + '/index.json'));
      }
      this.ready = true; return data;
    } catch (_) { this.ready = false; throw new Error('本机图像记录无法读取，原文件已保留。'); }
  }
  save(data: MediaData): void {
    try {
    if (!this.ready) throw new Error('图像存储尚未就绪。');
    const text = JSON.stringify(data);
    if (new util.TextEncoder().encodeInto(text).length > 2 * 1024 * 1024) throw new Error('图像记录已满，请先删除旧记录。');
    const file = fileIo.openSync(this.root + '/index.tmp', fileIo.OpenMode.CREATE | fileIo.OpenMode.WRITE_ONLY | fileIo.OpenMode.TRUNC);
    try { fileIo.writeSync(file.fd, text); fileIo.fsyncSync(file.fd); } finally { fileIo.closeSync(file); }
    fileIo.renameSync(this.root + '/index.tmp', this.root + '/index.json');
    } catch (_) { throw new Error('图像记录无法保存。'); }
  }
  path(asset: ImageAsset): string { if (!MediaCore.asset(asset)) throw new Error('图片路径不正确。'); return this.root + '/' + asset.file; }
  uri(asset: ImageAsset): string { return 'file://' + this.path(asset); }
  private bytes(asset: ImageAsset): Uint8Array {
    try {
    const path = this.path(asset); const size = fileIo.statSync(path).size;
    if (size > 8 * 1024 * 1024 || size < 1) throw new Error('图片大小不受支持。');
    const buffer = new ArrayBuffer(size); const file = fileIo.openSync(path, fileIo.OpenMode.READ_ONLY);
    try { if (fileIo.readSync(file.fd, buffer) !== size) throw new Error('图片读取不完整。'); } finally { fileIo.closeSync(file); }
    return new Uint8Array(buffer);
    } catch (_) { throw new Error('无法读取本机图片。'); }
  }
  dataUrl(asset: ImageAsset): string { return 'data:' + asset.mime + ';base64,' + new util.Base64Helper().encodeToStringSync(this.bytes(asset)); }
  private quota(bytes: number): void {
    try {
    let total = bytes;
    for (const name of fileIo.listFileSync(this.root)) if (/^[a-zA-Z0-9_-]+\.(png|jpeg|webp)$/.test(name)) total += fileIo.statSync(this.root + '/' + name).size;
    if (total > 256 * 1024 * 1024) throw new Error('本机图片已达到 256 MiB，请先导出或删除旧记录。');
    } catch (_) { throw new Error('本机图片空间不足，请先导出或删除旧记录。'); }
  }
  async cache(bytes: Uint8Array): Promise<ImageAsset> {
    try {
    if (!this.ready || bytes.length < 12 || bytes.length > 8 * 1024 * 1024) throw new Error('图片为空或超过 8 MiB。');
    let mime = '';
    if (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) mime = 'image/png';
    else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) mime = 'image/jpeg';
    else if (bytes[0] === 82 && bytes[1] === 73 && bytes[8] === 87 && bytes[9] === 69 && bytes[10] === 66 && bytes[11] === 80) mime = 'image/webp';
    if (!mime) throw new Error('只支持 PNG、JPEG 和 WebP 图片。');
    const source = image.createImageSource(bytes.buffer as ArrayBuffer);
    let info: image.ImageInfo;
    try { info = await source.getImageInfo(); } finally { await source.release(); }
    if (info.size.width * info.size.height > 40000000) throw new Error('图片像素超过当前支持范围。');
    this.quota(bytes.length);
    const asset = new ImageAsset(); asset.file = util.generateRandomUUID(true) + '.' + mime.split('/')[1]; asset.mime = mime; asset.width = info.size.width; asset.height = info.size.height;
    const file = fileIo.openSync(this.path(asset), fileIo.OpenMode.CREATE | fileIo.OpenMode.WRITE_ONLY | fileIo.OpenMode.TRUNC);
    try { if (fileIo.writeSync(file.fd, bytes.buffer as ArrayBuffer) !== bytes.length) throw new Error('图片写入不完整。'); fileIo.fsyncSync(file.fd); } finally { fileIo.closeSync(file); }
    return asset;
    } catch (_) { throw new Error('图片格式、像素或本机空间不受支持，未能保存。'); }
  }
  async select(context: common.Context, fromFile: boolean = false): Promise<ImageAsset | undefined> {
    try {
    let uris: string[] = [];
    if (fromFile) uris = await new picker.DocumentViewPicker(context).select({ maxSelectNumber: 1, fileSuffixFilters: ['.png','.jpg','.jpeg','.webp'] });
    else uris = (await new photoAccessHelper.PhotoViewPicker().select({ MIMEType: photoAccessHelper.PhotoViewMIMETypes.IMAGE_TYPE, maxSelectNumber: 1 })).photoUris;
    if (!uris.length) return undefined;
    return await this.importUri(uris[0]);
    } catch (_) { throw new Error('图片未能读取或转换。'); }
  }
  async importUri(uri: string): Promise<ImageAsset> {
    try {
    const file = fileIo.openSync(uri, fileIo.OpenMode.READ_ONLY);
    const source = image.createImageSource(file.fd); let pixels: image.PixelMap | undefined; const packer = image.createImagePacker();
    try {
      const info = await source.getImageInfo(); const ratio = Math.min(1, 2048 / Math.max(info.size.width, info.size.height));
      if (info.size.width * info.size.height > 100000000) throw new Error('原始图片像素过大，请先缩小后重试。');
      pixels = await source.createPixelMap({ desiredSize: { width: Math.max(1, Math.round(info.size.width * ratio)), height: Math.max(1, Math.round(info.size.height * ratio)) } });
      const buffer = await packer.packToData(pixels, { format: 'image/jpeg', quality: 88 }); return await this.cache(new Uint8Array(buffer));
    } finally { await pixels?.release(); await source.release(); await packer.release(); fileIo.closeSync(file); }
    } catch (_) { throw new Error('图片未能读取或转换。'); }
  }
  async receive(remote: RemoteImage): Promise<ImageAsset> {
    try {
    const generation = this.generation;
    if (remote.data) return await this.cache(new util.Base64Helper().decodeSync(remote.data));
    const url = MediaCore.remote(remote.url); const chunks: ArrayBuffer[] = []; let length = 0;
    const session = rcp.createSession({ cacheControl: { noStore: true }, requestConfiguration: {
      transfer: { autoRedirect: false, timeout: { connectMs: 15000, transferMs: 60000 } },
      tracing: { verbose: false, httpEventsHandler: { onDataReceive: (data: ArrayBuffer): void => {
        length += data.byteLength;
        if (length > 8 * 1024 * 1024) { try { session.cancel(); } catch (_) {} return; }
        chunks.push(data);
      } } }
    } });
    this.downloads.push(session);
    try {
      // Image URLs may belong to a CDN. Never attach API keys or DSH cookies.
      const response = await session.get(url);
      if (generation !== this.generation) throw new Error('图片下载已取消。');
      if (response.statusCode !== 200 || length > 8 * 1024 * 1024) throw new Error('图片下载失败或发生重定向，未转发任何密钥。');
      const bytes = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { bytes.set(new Uint8Array(chunk), offset); offset += chunk.byteLength; }
      return await this.cache(bytes);
    } finally { this.downloads = this.downloads.filter((item: rcp.Session) => item !== session); try { session.close(); } catch (_) {} }
    } catch (_) { throw new Error('图片下载或保存失败。'); }
  }
  cancel(): void { this.generation++; for (const session of this.downloads) { try { session.cancel(); session.close(); } catch (_) {} } this.downloads = []; }
  prune(data: MediaData): void {
    try {
    if (!this.ready) return;
    const keep: string[] = [];
    if (data.input) keep.push(data.input.file);
    for (const record of data.history) { if (record.input) keep.push(record.input.file); for (const asset of record.images) keep.push(asset.file); }
    for (const name of fileIo.listFileSync(this.root)) if (/^[a-zA-Z0-9_-]+\.(png|jpeg|webp)$/.test(name) && !keep.includes(name)) fileIo.unlinkSync(this.root + '/' + name);
    } catch (_) { throw new Error('未能清理本机图片。'); }
  }
  async export(context: common.Context, asset: ImageAsset): Promise<boolean> {
    try {
    const extension = asset.mime.split('/')[1];
    const selected = await new picker.DocumentViewPicker(context).save({ newFileNames: ['DSH-Image-' + Date.now() + '.' + extension], fileSuffixChoices: [extension.toUpperCase() + '|.' + extension] });
    if (!selected.length) return false;
    const target = fileIo.openSync(selected[0], fileIo.OpenMode.WRITE_ONLY);
    try { fileIo.copyFileSync(this.path(asset), target.fd); } finally { fileIo.closeSync(target); }
    return true;
    } catch (_) { throw new Error('图片导出失败。'); }
  }
}
