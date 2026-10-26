import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { ConnectionPolicy, RecentConnection } from '../core/ConnectionPolicy';

export class RecentStore {
  private store: preferences.Preferences | undefined = undefined;

  async initialize(context: common.Context): Promise<RecentConnection[]> {
    try {
    this.store = await preferences.getPreferences(context, { name: 'dsh_connect' });
    const raw = await this.store.get('recent_origins', '[]');
    if (typeof raw !== 'string' || raw.length > 8192) return [];
    const saved = JSON.parse(raw) as RecentConnection[];
    if (!Array.isArray(saved)) return [];
    const result: RecentConnection[] = [];
    for (let i = 0; i < saved.length && result.length < ConnectionPolicy.MAX_RECENTS; i++) {
      const record = saved[i];
      if (record === null || typeof record.origin !== 'string' || typeof record.openedAt !== 'number') continue;
      const parsed = ConnectionPolicy.parse(record.origin + '/', false);
      if (!parsed.ok || parsed.target.origin !== record.origin) continue;
      const safe = new RecentConnection();
      safe.origin = parsed.target.origin;
      safe.label = parsed.target.label;
      safe.openedAt = record.openedAt;
      result.push(safe);
    }
      return result;
    } catch (_) {
      throw new Error('Unable to read recent connections.');
    }
  }

  async save(records: RecentConnection[]): Promise<void> {
    try {
      if (this.store === undefined) throw new Error('Recent store unavailable');
      await this.store.put('recent_origins', JSON.stringify(records));
      await this.store.flush();
    } catch (_) {
      throw new Error('Unable to save recent connections.');
    }
  }
}
