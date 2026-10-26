import { ConnectionPolicy, RemoteTarget } from './ConnectionPolicy';
import { CredentialStore, MobileTransport, PairOutcome, RpcEnvelope, RpcPayload, RpcRequest, RpcValue, SseFrame, StreamHandle, WireRequest, WireResponse } from './NativeModels';

export class DshClient {
  origin: string = '';
  credentialWarning: boolean = false;
  private cookie: string = '';
  private generation: number = 0;
  private transport: MobileTransport;
  private credentials: CredentialStore;

  constructor(transport: MobileTransport, credentials: CredentialStore) { this.transport = transport; this.credentials = credentials; }

  private wire(path: string, method: string = 'GET', body: string = ''): WireRequest {
    const url = path.startsWith('http') ? path : this.origin + path;
    if (!ConnectionPolicy.sameOrigin(url, this.origin)) throw new Error('连接地址发生变化，请返回重新扫码。');
    return { url: url, method: method, body: body, cookie: this.cookie, origin: this.origin };
  }

  private async request(path: string, method: string = 'GET', body: string = ''): Promise<WireResponse> {
    const generation = this.generation;
    const response = await this.transport.request(this.wire(path, method, body));
    if (generation !== this.generation) throw new Error('连接已切换。');
    const match = /(?:^|[\s;,\"])dsh_mobile=([A-Za-z0-9_-]{20,256})/.exec(response.cookie);
    if (match !== null) {
      this.cookie = 'dsh_mobile=' + match[1];
      try { await this.credentials.save(this.origin, this.cookie); } catch (_) { this.credentialWarning = true; }
    }
    if (generation !== this.generation) throw new Error('连接已切换。');
    return response;
  }

  async connect(target: RemoteTarget): Promise<PairOutcome> {
    const generation = ++this.generation;
    this.origin = target.origin; this.cookie = ''; this.credentialWarning = false;
    try {
      const cookie = await this.credentials.load(target.origin);
      if (generation !== this.generation) throw new Error('连接已切换。');
      this.cookie = cookie;
    } catch (_) { if (generation !== this.generation) throw new Error('连接已切换。'); this.credentialWarning = true; }
    let response = await this.request(target.url);
    for (let i = 0; i < 4 && response.status >= 300 && response.status < 400; i++) {
      const next = response.location.startsWith('/') && !response.location.startsWith('//') ? this.origin + response.location : response.location;
      const parsed = ConnectionPolicy.parse(next, false);
      if (!parsed.ok) throw new Error('电脑返回了不支持的跳转地址，请重新生成连接。');
      if (parsed.target.origin !== this.origin) return { pinRequired: false, migrationUrl: parsed.target.url };
      response = await this.request(parsed.target.url);
    }
    if (response.status === 401) throw new Error('二维码已失效或配对已撤销，请在电脑重新生成连接。');
    if (response.status !== 200) throw new Error('电脑连接服务返回 HTTP ' + response.status + '，请刷新链接。');
    if (response.body.includes('/pair/verify')) return { pinRequired: true, migrationUrl: '' };
    await this.status();
    return { pinRequired: false, migrationUrl: '' };
  }

  async verifyPin(pin: string): Promise<void> {
    if (!/^\d{6}$/.test(pin)) throw new Error('请输入电脑显示的六位连接密码。');
    const response = await this.request('/pair/verify', 'POST', JSON.stringify({ pin: pin }));
    if (response.status === 429) throw new Error('密码尝试过于频繁，请稍后再试。');
    const envelope = JSON.parse(response.body) as RpcEnvelope;
    if (response.status !== 200 || !envelope.ok) throw new Error(envelope.rescan ? '连接密码已过期，请在电脑重新生成。' : '连接密码不正确，请重新输入。');
    await this.status();
  }

  async status(): Promise<RpcValue> {
    const response = await this.request('/api/status');
    if (response.status === 401) throw new Error('配对已撤销或过期，请重新扫码。');
    if (response.status !== 200) throw new Error('电脑暂时无法连接（HTTP ' + response.status + '）。');
    const value = JSON.parse(response.body) as RpcValue;
    if (!value.connected) throw new Error('电脑连接已断开，请重新扫码。');
    return value;
  }

  async rpc(method: string, payload: RpcPayload = {}): Promise<RpcValue> {
    const request: RpcRequest = { method: method, payload: payload };
    const response = await this.request('/api/rpc', 'POST', JSON.stringify(request));
    if (response.status === 401) throw new Error('配对已撤销或过期，请重新扫码。');
    const envelope = JSON.parse(response.body) as RpcEnvelope;
    if (response.status !== 200 || !envelope.ok) throw new Error(envelope.error || '电脑暂时无法完成请求。');
    return envelope.value || {};
  }

  stream(sessionId: string, frame: (value: SseFrame) => void, state: (connected: boolean) => void): StreamHandle {
    return this.transport.stream(this.wire('/api/session/stream?sessionId=' + encodeURIComponent(sessionId)), frame, state);
  }

  close(): void { this.generation++; this.cookie = ''; this.origin = ''; }
  async forget(origin: string): Promise<void> { await this.credentials.remove(origin); }
}
