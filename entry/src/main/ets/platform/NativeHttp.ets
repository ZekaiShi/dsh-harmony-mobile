import { http } from '@kit.NetworkKit';
import { util } from '@kit.ArkTS';
import { BusinessError } from '@kit.BasicServicesKit';
import { MobileTransport, SseFrame, StreamHandle, WireRequest, WireResponse } from '../core/NativeModels';
import { SseParser } from '../core/SseParser';

interface HeaderFields { location?: string; Location?: string; 'status-line'?: string; }

export function networkMessage(error: Error): string {
  const code = (error as BusinessError).code;
  if (code === 2300006) return '无法解析电脑地址，请检查网络或重新生成连接。';
  if (code === 2300028) return '连接超时，请确认电脑仍在运行，或改用局域网连接。';
  if (code === 2300060 || code === 2300058) return '连接证书无法验证，请检查系统时间和电脑连接地址。';
  if (code === 2300035 || code === 2300056) return '网络连接被关闭或重置，请在电脑刷新连接链接。';
  return code ? '网络请求未完成（' + code + '），请检查电脑和网络连接。' : '网络请求未完成，请检查电脑和网络连接。';
}

class NativeStream implements StreamHandle {
  private request: http.HttpRequest = http.createHttp();
  private closed: boolean = false;

  start(wire: WireRequest, frame: (value: SseFrame) => void, state: (connected: boolean) => void): void {
    const parser = new SseParser();
    const decoder = util.TextDecoder.create('utf-8', { ignoreBOM: true });
    this.request.on('dataReceive', (data: ArrayBuffer) => {
      if (this.closed) return;
      try {
        const text = decoder.decodeToString(new Uint8Array(data), { stream: true });
        const frames = parser.push(text);
        if (frames.length > 0) state(true);
        for (const value of frames) frame(value);
      } catch (_) { this.close(); state(false); }
    });
    this.request.on('dataEnd', () => { if (!this.closed) { this.close(); state(false); } });
    this.request.requestInStream(wire.url, {
      method: http.RequestMethod.GET,
      header: { 'Accept': 'text/event-stream', 'Cookie': wire.cookie, 'Origin': wire.origin },
      usingCache: false, connectTimeout: 15000, readTimeout: 300000, maxRedirects: 0
    }).then((status: number) => { if (!this.closed && status !== 200) { this.close(); state(false); } })
      .catch(() => { if (!this.closed) { this.close(); state(false); } });
  }

  close(): void { if (!this.closed) { this.closed = true; this.request.destroy(); } }
}

export class NativeHttp implements MobileTransport {
  async request(wire: WireRequest): Promise<WireResponse> {
    const task = http.createHttp();
    let captured: string = '';
    task.on('headersReceive', (headers: Object) => { captured = JSON.stringify(headers); });
    try {
      const response: http.HttpResponse = await task.request(wire.url, {
        method: wire.method === 'POST' ? http.RequestMethod.POST : http.RequestMethod.GET,
        header: { 'Accept': 'application/json, text/html', 'Content-Type': 'application/json', 'Cookie': wire.cookie, 'Origin': wire.origin },
        extraData: wire.body, expectDataType: http.HttpDataType.STRING,
        usingCache: false, connectTimeout: 15000, readTimeout: 30000, maxRedirects: 0, maxLimit: 4 * 1024 * 1024
      });
      const headers = response.header as HeaderFields;
      return { status: response.responseCode, body: String(response.result),
        cookie: response.cookies + ';' + JSON.stringify(response.header), location: headers.location || headers.Location || '' };
    } catch (error) {
      // Some SDK revisions report CURLE_TOO_MANY_REDIRECTS for maxRedirects=0.
      // Return only the captured redirect; never follow or forward its cookie.
      const failure = error as BusinessError;
      if (failure.code === 2300047 && captured.length > 0) {
        const headers = JSON.parse(captured) as HeaderFields;
        const location = headers.location || headers.Location || '';
        if (location) return { status: 302, body: '', cookie: captured, location: location };
      }
      throw new Error(networkMessage(failure));
    } finally { task.destroy(); }
  }

  stream(wire: WireRequest, frame: (value: SseFrame) => void, state: (connected: boolean) => void): StreamHandle {
    const stream = new NativeStream(); stream.start(wire, frame, state); return stream;
  }
}
