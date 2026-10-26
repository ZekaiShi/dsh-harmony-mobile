// Pure rules shared by the ArkTS app and the desktop verification tools.
export class RemoteTarget {
  origin: string = '';
  url: string = '';
  label: string = '';
  path: string = '';
  hasPairingToken: boolean = false;
}

export class LinkResult {
  ok: boolean = false;
  message: string = '';
  target: RemoteTarget = new RemoteTarget();
}

export class RecentConnection {
  origin: string = '';
  label: string = '';
  openedAt: number = 0;
}

export class ConnectionPolicy {
  static readonly MAX_RECENTS: number = 5;

  private static reject(message: string): LinkResult {
    const result = new LinkResult();
    result.message = message;
    return result;
  }

  private static validIPv6(host: string): boolean {
    const value = host.slice(1, -1);
    if (!/^[0-9a-f:]+$/i.test(value) || value.includes(':::')) return false;
    const halves = value.split('::');
    if (halves.length > 2) return false;
    const chunks = value.split(':').filter((part: string) => part.length > 0);
    if (value.startsWith(':') && !value.startsWith('::') || value.endsWith(':') && !value.endsWith('::')) return false;
    if (chunks.some((part: string) => part.length > 4)) return false;
    if (halves.length === 2) return chunks.length < 8;
    return chunks.length === 8 && !value.startsWith(':') && !value.endsWith(':');
  }

  private static localHttpHost(host: string): boolean {
    if (host === 'localhost') return true;
    if (host.startsWith('[')) {
      const address = host.slice(1, -1);
      if (/^0*(?::0*){1,6}:0*1$/.test(address)) return true;
      const first = parseInt(address.split(':')[0], 16);
      return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80;
    }
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(host)) return false;
    const octets = host.split('.').map((part: string) => Number(part));
    return octets.length === 4 && (octets[0] === 127 || octets[0] === 10 ||
      octets[0] === 192 && octets[1] === 168 || octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31 ||
      octets[0] === 169 && octets[1] === 254);
  }

  static parse(raw: string, requirePairing: boolean = true): LinkResult {
    const value = raw.trim();
    if (value.length === 0) return this.reject('请扫描电脑上的二维码，或粘贴完整连接链接。');
    if (value.length > 4096 || /[\s\\\u0000-\u001f\u007f]/.test(value)) {
      return this.reject('链接格式不正确，请重新复制电脑上的完整配对链接。');
    }
    const match = /^(https?):\/\/(\[[0-9a-f:]+\]|[a-z0-9.-]+)(?::([0-9]{1,5}))?(\/[^#]*)?$/i.exec(value);
    if (match === null) return this.reject('仅支持 DSH Desktop 的 HTTP 或 HTTPS 配对链接。');
    const scheme = match[1].toLowerCase();
    const host = match[2].toLowerCase();
    const port = match[3] || '';
    const tail = match[4] || '/';
    if (port.length > 0 && (Number(port) < 1 || Number(port) > 65535)) return this.reject('链接端口不正确。');
    if (host.startsWith('[')) {
      if (!this.validIPv6(host)) return this.reject('链接地址不正确。');
    } else {
      const labels = host.split('.');
      if (host.length > 253 || labels.some((label: string) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
        return this.reject('链接地址不正确。');
      }
      if (/^[0-9.]+$/.test(host)) {
        if (labels.length !== 4 || labels.some((label: string) => Number(label) > 255 || (label.length > 1 && label.startsWith('0')))) {
          return this.reject('链接 IP 地址不正确。');
        }
      }
    }
    // Upstream LAN QRs use literal interface addresses. Public tunnels must use
    // TLS before any pairing token, PIN or persisted credential can leave us.
    if (scheme === 'http' && !this.localHttpHost(host)) return this.reject('公网连接必须使用 HTTPS，请重新生成安全隧道链接；HTTP 仅支持本机或局域网 IP。');
    const separator = tail.indexOf('?');
    const path = separator < 0 ? tail : tail.slice(0, separator);
    const query = separator < 0 ? '' : tail.slice(separator + 1);
    const fields: string[] = query.length === 0 ? [] : query.split('&');
    let token: string = '';
    for (let i = 0; i < fields.length; i++) {
      if (!fields[i].startsWith('token=')) return this.reject('配对链接包含不支持的参数，请重新扫码。');
      if (token.length > 0) return this.reject('配对链接包含重复 token，请重新扫码。');
      token = fields[i].slice(6);
      if (!/^[A-Za-z0-9_-]{20,256}$/.test(token)) return this.reject('配对码不完整，请重新扫码。');
    }
    if (requirePairing && (path !== '/pair' || token.length === 0)) {
      return this.reject('这不是配对二维码。请在电脑的「连接手机」窗口重新扫码。');
    }
    if (!requirePairing && path !== '/' && path !== '/pair' && path !== '/reconnect' && path !== '/disconnected') {
      return this.reject('这不是 DSH 手机连接页面。');
    }
    if (token.length > 0 && path !== '/pair') return this.reject('配对参数所在路径不正确。');
    const defaultPort = (scheme === 'http' && Number(port) === 80) || (scheme === 'https' && Number(port) === 443);
    const suffix = port.length === 0 || defaultPort ? '' : ':' + String(Number(port));
    const result = new LinkResult();
    result.ok = true;
    result.target.origin = scheme + '://' + host + suffix;
    result.target.path = path;
    result.target.url = result.target.origin + path + (token.length > 0 ? '?token=' + token : '');
    result.target.label = host + suffix;
    result.target.hasPairingToken = token.length > 0;
    return result;
  }

  static sameOrigin(candidate: string, origin: string): boolean {
    // Deliberately parse only the authority. Ordinary upstream page paths may
    // contain their own parameters; they must not be treated as new pairing links.
    const match = /^(https?:\/\/(?:\[[0-9a-f:]+\]|[a-z0-9.-]+)(?::[0-9]{1,5})?)(?:[/?#]|$)/i.exec(candidate);
    if (match === null || /[\\\s\u0000-\u001f]/.test(candidate)) return false;
    const result = this.parse(match[1] + '/', false);
    return result.ok && result.target.origin === origin;
  }

  static remember(current: RecentConnection[], target: RemoteTarget, now: number): RecentConnection[] {
    const records: RecentConnection[] = [];
    const next = new RecentConnection();
    next.origin = target.origin;
    next.label = target.label;
    next.openedAt = now;
    records.push(next);
    for (let i = 0; i < current.length && records.length < this.MAX_RECENTS; i++) {
      if (current[i].origin !== target.origin) {
        const parsed = this.parse(current[i].origin + '/', false);
        if (parsed.ok && current[i].origin === parsed.target.origin) {
          const safe = new RecentConnection();
          safe.origin = parsed.target.origin;
          safe.label = parsed.target.label;
          safe.openedAt = current[i].openedAt;
          records.push(safe);
        }
      }
    }
    return records;
  }
}
