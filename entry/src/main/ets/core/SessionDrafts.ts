// Desktop drafts remain in memory and are isolated by connection origin and session.
export class SessionDrafts {
  private values: Map<string, string> = new Map();
  save(origin: string, session: string, text: string): void {
    if (!origin || !session) return;
    const key = origin + '\n' + session;
    if (!text) { this.values.delete(key); return; }
    if (!this.values.has(key) && this.values.size >= 100) {
      const oldest = this.values.keys().next().value;
      if (oldest !== undefined) this.values.delete(oldest);
    }
    this.values.set(key, text.slice(0, 16000));
  }
  read(origin: string, session: string): string { return this.values.get(origin + '\n' + session) || ''; }
  forget(origin: string): void { this.values.forEach((value: string, key: string): void => { if (key.startsWith(origin + '\n')) this.values.delete(key); }); }
}

// Keep drafts when the desktop router page is destroyed and reopened within the app process.
export const desktopSessionDrafts: SessionDrafts = new SessionDrafts();
