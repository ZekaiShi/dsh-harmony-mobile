import { asset } from '@kit.AssetStoreKit';
import { util } from '@kit.ArkTS';
import { BusinessError } from '@kit.BasicServicesKit';
import { CredentialStore } from '../core/NativeModels';

// App-private, OS-encrypted session authorization. Pairing links and PINs never
// enter this store, Preferences, reports, or application logs.
export class SessionSecrets implements CredentialStore {
  private alias(origin: string): Uint8Array { return new util.TextEncoder().encodeInto('dsh.native.session.' + origin); }

  async load(origin: string): Promise<string> {
    const query: asset.AssetMap = new Map();
    query.set(asset.Tag.ALIAS, this.alias(origin)); query.set(asset.Tag.RETURN_TYPE, asset.ReturnType.ALL);
    try {
      const found = await asset.query(query);
      if (found.length === 0) return '';
      const secret = found[0].get(asset.Tag.SECRET) as Uint8Array;
      const cookie = util.TextDecoder.create('utf-8').decodeToString(secret);
      return /^dsh_mobile=[A-Za-z0-9_-]{20,256}$/.test(cookie) ? cookie : '';
    } catch (error) {
      if ((error as BusinessError).code === 24000002) return '';
      throw new Error('安全凭据暂时无法读取。');
    }
  }

  async save(origin: string, cookie: string): Promise<void> {
    const attributes: asset.AssetMap = new Map();
    attributes.set(asset.Tag.ALIAS, this.alias(origin));
    attributes.set(asset.Tag.SECRET, new util.TextEncoder().encodeInto(cookie));
    attributes.set(asset.Tag.ACCESSIBILITY, asset.Accessibility.DEVICE_FIRST_UNLOCKED);
    attributes.set(asset.Tag.CONFLICT_RESOLUTION, asset.ConflictResolution.OVERWRITE);
    try { await asset.add(attributes); } catch (_) { throw new Error('安全凭据暂时无法保存。'); }
  }

  async remove(origin: string): Promise<void> {
    const query: asset.AssetMap = new Map(); query.set(asset.Tag.ALIAS, this.alias(origin));
    try { await asset.remove(query); } catch (error) {
      if ((error as BusinessError).code !== 24000002) throw new Error('安全凭据暂时无法移除。');
    }
  }
}
