import { common } from '@kit.AbilityKit';
import { fileIo } from '@kit.CoreFileKit';
import { asset } from '@kit.AssetStoreKit';
import { util } from '@kit.ArkTS';
import { BusinessError } from '@kit.BasicServicesKit';
import { AssistantCore, AssistantData } from '../core/AssistantCore';

export class AssistantStore {
  private path: string = '';
  private ready: boolean = false;
  load(context: common.Context): AssistantData {
    try {
    this.path = context.filesDir + '/assistant-v1.json';
    if (!fileIo.accessSync(this.path)) { this.ready = true; return new AssistantData(); }
    const stat = fileIo.statSync(this.path);
    if (stat.size > 16 * 1024 * 1024) throw new Error('本机会话文件过大，原文件已保留。');
    const data = AssistantCore.restore(fileIo.readTextSync(this.path)); this.ready = true; return data;
    } catch (_) { this.ready = false; throw new Error('本机会话暂时无法读取，原文件已保留。'); }
  }
  save(data: AssistantData): void {
    try {
    if (!this.ready) throw new Error('本机存储尚未就绪，未覆盖任何历史。');
    const text = JSON.stringify(data); if (new util.TextEncoder().encodeInto(text).length > 16 * 1024 * 1024) throw new Error('本机历史空间已满，请先复制并删除旧对话。');
    const file = fileIo.openSync(this.path + '.tmp', fileIo.OpenMode.CREATE | fileIo.OpenMode.WRITE_ONLY | fileIo.OpenMode.TRUNC);
    try { fileIo.writeSync(file.fd, text); fileIo.fsyncSync(file.fd); } finally { fileIo.closeSync(file); }
    fileIo.renameSync(this.path + '.tmp', this.path);
    } catch (_) { throw new Error('本机会话暂时无法保存。'); }
  }
  private alias(origin: string): Uint8Array { return new util.TextEncoder().encodeInto('dsh.assistant.api.' + origin); }
  async key(origin: string): Promise<string> {
    const query: asset.AssetMap = new Map(); query.set(asset.Tag.ALIAS, this.alias(origin)); query.set(asset.Tag.RETURN_TYPE, asset.ReturnType.ALL);
    try {
      const found = await asset.query(query); if (!found.length) return '';
      return util.TextDecoder.create('utf-8').decodeToString(found[0].get(asset.Tag.SECRET) as Uint8Array);
    } catch (error) { if ((error as BusinessError).code === 24000002) return ''; throw new Error('API Key 暂时无法从系统安全存储读取。'); }
  }
  async saveKey(origin: string, key: string): Promise<void> {
    const values: asset.AssetMap = new Map(); values.set(asset.Tag.ALIAS, this.alias(origin));
    values.set(asset.Tag.SECRET, new util.TextEncoder().encodeInto(AssistantCore.key(key)));
    values.set(asset.Tag.ACCESSIBILITY, asset.Accessibility.DEVICE_FIRST_UNLOCKED); values.set(asset.Tag.CONFLICT_RESOLUTION, asset.ConflictResolution.OVERWRITE);
    try { await asset.add(values); } catch (_) { throw new Error('API Key 无法保存到系统安全存储。'); }
  }
  async forgetKey(origin: string): Promise<void> {
    const query: asset.AssetMap = new Map(); query.set(asset.Tag.ALIAS, this.alias(origin));
    try { await asset.remove(query); } catch (error) { if ((error as BusinessError).code !== 24000002) throw new Error('API Key 暂时无法删除。'); }
  }
}
