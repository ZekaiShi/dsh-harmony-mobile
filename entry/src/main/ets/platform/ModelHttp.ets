import { rcp } from '@kit.RemoteCommunicationKit';
import { util } from '@kit.ArkTS';
import { ModelTransport, ModelWire, ModelCallbacks } from '../core/AssistantCore';
import { StreamHandle } from '../core/NativeModels';

export class ModelHttp implements ModelTransport {
  start(wire: ModelWire, callbacks: ModelCallbacks): StreamHandle {
    const decoder = util.TextDecoder.create('utf-8', { ignoreBOM: true });
    const headers: rcp.RequestHeaders = { 'Content-Type': 'application/json', 'Accept': 'text/event-stream, application/json' };
    if (wire.auth === 'google') headers['x-goog-api-key'] = wire.key;
    else if (wire.auth === 'anthropic') { headers['x-api-key'] = wire.key; headers['anthropic-version'] = '2023-06-01'; }
    else headers['Authorization'] = 'Bearer ' + wire.key;
    const request = new rcp.Request(wire.url, wire.method === 'GET' ? 'GET' : 'POST', headers, wire.method === 'GET' ? undefined : wire.body);
    let closed = false;
    let session: rcp.Session | undefined;
    const release = (cancel: boolean): void => {
      const current = session; session = undefined;
      if (cancel) { try { current?.cancel(request); } catch (_) {} }
      try { current?.close(); } catch (_) {}
    };
    try {
      session = rcp.createSession({
        cacheControl: { noStore: true },
        requestConfiguration: {
          transfer: { autoRedirect: false, timeout: { connectMs: 15000, transferMs: 300000 } },
          tracing: {
            verbose: false,
            httpEventsHandler: {
              onDataReceive: (data: ArrayBuffer): void => {
                if (closed) return;
                try { callbacks.data(decoder.decodeToString(new Uint8Array(data), { stream: true })); }
                catch (_) { closed = true; release(true); callbacks.error(); }
              }
            }
          }
        }
      });
      session.fetch(request).then((response: rcp.Response) => {
        if (closed) return;
        const tail = decoder.decodeToString(new Uint8Array(0)); if (tail) callbacks.data(tail);
        if (closed) return;
        closed = true; release(false); callbacks.end(response.statusCode);
      }).catch(() => { if (!closed) { closed = true; release(false); callbacks.error(); } });
    } catch (_) { closed = true; release(true); callbacks.error(); }
    return { close: (): void => { if (!closed) { closed = true; release(true); } } };
  }
}
