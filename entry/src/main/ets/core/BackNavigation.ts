// The title-bar button and system back gesture use the same destination policy.
export class BackNavigation {
  static target(mode: string, screen: string, parent: string = ''): string {
    if (mode === 'assistant') {
      if (screen === 'providers' || screen === 'models') return 'settings';
      if (screen === 'settings') return parent === 'chat' ? 'chat' : 'list';
      if (screen === 'context') return 'chat';
      if (screen === 'chat' || screen === 'privacy') return 'list';
      return 'home';
    }
    if (mode === 'media') {
      if (screen === 'models') return 'settings';
      if (screen === 'settings' || screen === 'preview') return ['main','history','detail'].includes(parent) ? parent : 'main';
      if (screen === 'detail') return parent === 'history' ? 'history' : 'main';
      if (screen === 'history') return 'main';
      return 'home';
    }
    if (mode === 'desktop') {
      if (screen === 'chat') return 'sessions';
      if (screen === 'sessions' || screen === 'pin') return 'devices';
      return screen === 'home' ? 'exit' : 'home';
    }
    return 'home';
  }
}
