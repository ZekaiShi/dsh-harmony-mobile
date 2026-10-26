import { AssistantCore, ModelTransport, ModelWire } from './AssistantCore';
import { StreamHandle } from './NativeModels';

export class MediaProfile {
  provider: string = 'compatible'; base: string = ''; model: string = ''; visionModel: string = '';
  size: string = ''; quality: string = ''; format: string = ''; ratio: string = '';
}
export class ImageAsset {
  file: string = ''; mime: string = ''; width: number = 0; height: number = 0;
}
export class MediaRecord {
  id: string = ''; prompt: string = ''; createdAt: number = 0; purpose: string = 'generate'; status: string = 'pending';
  profile: MediaProfile = new MediaProfile(); input: ImageAsset | undefined; images: ImageAsset[] = []; text: string = ''; error: string = '';
}
export class MediaData {
  version: number = 1; provider: string = 'compatible'; profiles: MediaProfile[] = []; history: MediaRecord[] = [];
  draft: string = ''; input: ImageAsset | undefined;
}
export class RemoteImage { data: string = ''; url: string = ''; mime: string = ''; }
export class MediaResult { text: string = ''; images: RemoteImage[] = []; }
interface ImageReference { image_url: string; }
interface VisionImage { url: string; }
interface VisionPart { type: string; text?: string; image_url?: VisionImage; }
interface VisionMessage { role: string; content: VisionPart[]; }
interface InlineImage { mimeType: string; data: string; }
interface GeminiPart { text?: string; inlineData?: InlineImage; inline_data?: InlineImageSnake; thought?: boolean; }
interface InlineImageSnake { mime_type: string; data: string; }
interface GeminiContent { role: string; parts: GeminiPart[]; }
interface GeminiImageConfig { imageSize?: string; aspectRatio?: string; }
interface GeminiConfig { responseModalities?: string[]; imageConfig?: GeminiImageConfig; }
interface MediaPayload {
  image_size?: string; aspect_ratio?: string; input_references?: VisionPart[];
  model?: string; prompt?: string; n?: number; size?: string; quality?: string; response_format?: string;
  image?: string; images?: ImageReference[]; watermark?: boolean;
  messages?: VisionMessage[]; stream?: boolean; contents?: GeminiContent[]; generationConfig?: GeminiConfig;
}
interface ImageReply { media_type?: string; b64_json?: string; url?: string; revised_prompt?: string; }
interface GeminiCandidate { content?: GeminiContent; finishReason?: string; }
interface VisionChoice { message?: { content?: string; images?: { image_url?: { url?: string } }[] }; }
interface MediaReply { data?: ImageReply[]; images?: ImageReply[]; candidates?: GeminiCandidate[]; choices?: VisionChoice[]; error?: Object; }
export interface MediaEvents { done(result: MediaResult): void; error(message: string): void; }

export class MediaCore {
  static providers(): string[] { return ['compatible','ark','gemini','silicon','openrouter']; }
  static label(provider: string): string { return provider === 'silicon' ? '硅基流动' : provider === 'openrouter' ? 'OpenRouter' : provider === 'gemini' ? 'Gemini 原生' : provider === 'ark' ? '火山方舟' : 'OpenAI 兼容'; }
  static defaults(provider: string): MediaProfile {
    const profile = new MediaProfile(); profile.provider = provider;
    if (provider === 'ark') profile.base = 'https://ark.cn-beijing.volces.com/api/v3';
    if (provider === 'gemini') profile.base = 'https://generativelanguage.googleapis.com/v1beta';
    if (provider === 'compatible') profile.base = 'https://api.openai.com/v1';
    if (provider === 'silicon') profile.base = 'https://api.siliconflow.cn/v1';
    if (provider === 'openrouter') profile.base = 'https://openrouter.ai/api/v1';
    return profile;
  }
  static base(raw: string): string {
    const endpoint = AssistantCore.endpoint(raw); return endpoint.url.slice(0, -'/chat/completions'.length).replace(/\/images\/(?:generations|edits)$/, '').replace(/\/+$/, '');
  }
  static profile(source: MediaProfile): MediaProfile {
    if (!source || !this.providers().includes(source.provider)) throw new Error('请选择支持的接口类型。');
    const profile = new MediaProfile(); profile.provider = source.provider; profile.base = this.base(source.base);
    const model = source.provider === 'gemini' ? source.model.replace(/^models\//, '') : source.model;
    const vision = source.provider === 'gemini' ? (source.visionModel || '').replace(/^models\//, '') : source.visionModel || '';
    for (const value of [model, vision]) if (typeof value !== 'string' || value.length > 200 || /[\u0000-\u001f\u007f]/.test(value)) throw new Error('模型 ID 不正确，请使用服务商提供的完整 ID。');
    if (!source.model) throw new Error('请填写图像模型 ID。');
    profile.model = model; profile.visionModel = vision;
    profile.size = (source.size || '').trim(); profile.quality = (source.quality || '').trim(); profile.format = source.format || ''; profile.ratio = (source.ratio || '').trim();
    if (profile.size && !/^(?:auto|[1-4](?:\.5)?K|\d{2,5}x\d{2,5})$/.test(profile.size)) throw new Error('尺寸请填写 auto、2K 或 1024x1024 等服务支持的值，也可以留空。');
    if (profile.quality && !/^[a-z0-9_-]{1,24}$/.test(profile.quality)) throw new Error('图像质量参数不正确。');
    if (!['','url','b64_json'].includes(profile.format)) throw new Error('返回格式不正确。');
    if (profile.ratio && !/^\d{1,2}:\d{1,2}$/.test(profile.ratio)) throw new Error('宽高比请填写 1:1 或 16:9 等格式。');
    if (profile.provider === 'gemini' && profile.size && !/^[1-4]K$/.test(profile.size)) throw new Error('Gemini 尺寸请使用模型支持的 1K、2K、4K 等档位，或留空。');
    if (profile.provider === 'silicon' && profile.size && !/^\d{2,5}x\d{2,5}$/.test(profile.size)) throw new Error('硅基流动尺寸请填写模型支持的宽x高，例如 1328x1328；编辑模型不需要时留空。');
    return profile;
  }
  static request(source: MediaProfile, purpose: string, prompt: string, image: string = ''): ModelWire {
    const profile = this.profile(source); const text = prompt.trim();
    if (!text || text.length > 16000) throw new Error('请输入 16000 字以内的描述或问题。');
    if (!['generate','vision'].includes(purpose)) throw new Error('操作类型不正确。');
    if (image && !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(image)) throw new Error('参考图片格式不正确。');
    if (image.length > 12 * 1024 * 1024) throw new Error('参考图片过大。');
    if (purpose === 'vision' && !image) throw new Error('请先选择一张图片。');
    const model = purpose === 'vision' ? profile.visionModel || (profile.provider === 'gemini' ? profile.model : '') : profile.model;
    if (!model) throw new Error('请在图像设置中填写支持图片输入的视觉模型 ID。');
    const body: MediaPayload = {}; let path = '/images/generations';
    if (profile.provider === 'gemini') {
      path = '/models/' + encodeURIComponent(model.replace(/^models\//, '')) + ':generateContent';
      const parts: GeminiPart[] = [{ text: text }];
      if (image) { const comma = image.indexOf(','); parts.push({ inlineData: { mimeType: image.slice(5, image.indexOf(';')), data: image.slice(comma + 1) } }); }
      body.contents = [{ role: 'user', parts: parts }];
      if (purpose === 'generate') {
        body.generationConfig = { responseModalities: ['TEXT','IMAGE'] };
        if (profile.size || profile.ratio) { const config: GeminiImageConfig = {}; if (profile.size) config.imageSize = profile.size; if (profile.ratio) config.aspectRatio = profile.ratio; body.generationConfig.imageConfig = config; }
      }
    } else if (purpose === 'vision') {
      path = '/chat/completions'; body.model = model; body.stream = false;
      body.messages = [{ role: 'user', content: [{ type: 'text', text: text }, { type: 'image_url', image_url: { url: image } }] }];
    } else {
      body.model = model; body.prompt = text;
      if (profile.provider === 'compatible') { body.n = 1; if (image) { path = '/images/edits'; body.images = [{ image_url: image }]; } if (profile.quality) body.quality = profile.quality; }
      else if (profile.provider === 'openrouter') {
        path = '/images'; body.n = 1;
        if (image) body.input_references = [{ type: 'image_url', image_url: { url: image } }];
        if (profile.ratio) body.aspect_ratio = profile.ratio;
        if (profile.quality) body.quality = profile.quality;
      } else if (profile.provider === 'silicon') { if (image) body.image = image; }
      else { body.watermark = true; if (image) body.image = image; }
      if (profile.size) { if (profile.provider === 'silicon') body.image_size = profile.size; else body.size = profile.size; }
      if (profile.format && ['compatible','ark'].includes(profile.provider)) body.response_format = profile.format;
    }
    return { url: profile.base + path, key: '', body: JSON.stringify(body), auth: profile.provider === 'gemini' ? 'google' : 'bearer' };
  }
  static remote(raw: string): string {
    if (typeof raw !== 'string' || raw.length > 16384 || /[\s\\#\u0000-\u001f\u007f]/.test(raw)) throw new Error('图片链接格式不正确。');
    const match = /^(https?:\/\/[^/?#]+)(\/[^#]*)?$/.exec(raw);
    if (!match) throw new Error('图片仅支持 HTTPS 或本机局域网地址。');
    const origin = AssistantCore.endpoint(match[1]).origin; return origin + (match[2] || '/');
  }
  static response(source: string): MediaResult {
    const value = JSON.parse(source) as MediaReply; if (!value || value.error) throw new Error('图像服务未能完成请求，请检查模型能力与服务限制。');
    const result = new MediaResult();
    for (const item of (value.data || []).concat(value.images || [])) {
      const image = new RemoteImage();
      if (typeof item.b64_json === 'string' && item.b64_json) image.data = item.b64_json;
      else if (typeof item.url === 'string' && item.url) image.url = this.remote(item.url);
      else continue;
      if (item.media_type) image.mime = item.media_type;
      result.images.push(image); if (item.revised_prompt) result.text += item.revised_prompt + '\n';
    }
    for (const part of value.candidates?.[0]?.content?.parts || []) {
      if (part.thought) continue;
      if (typeof part.text === 'string') result.text += part.text;
      const data = part.inlineData; const snake = part.inline_data;
      if (data || snake) { const image = new RemoteImage(); image.data = data ? data.data : snake!.data; image.mime = data ? data.mimeType : snake!.mime_type; result.images.push(image); }
    }
    if (typeof value.choices?.[0]?.message?.content === 'string') result.text += value.choices[0].message.content;
    for (const item of value.choices?.[0]?.message?.images || []) {
      const url = item.image_url?.url; if (!url) continue;
      const image = new RemoteImage(); const inline = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+=*)$/.exec(url);
      if (inline) { image.mime = inline[1]; image.data = inline[2]; } else image.url = this.remote(url);
      result.images.push(image);
    }
    if (result.images.length > 4) throw new Error('服务一次返回超过 4 张图片，请调整生成数量后重试。');
    for (const image of result.images) if (image.data && (image.data.length > 12 * 1024 * 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(image.data))) throw new Error('图片数据过大或 Base64 格式不正确。');
    if (!result.images.length && !result.text) throw new Error('服务没有返回可用的图片或文字，请检查模型能力与内容限制。');
    return result;
  }
  static asset(value: ImageAsset): boolean { return !!value && /^[a-zA-Z0-9_-]{1,80}\.(?:png|jpeg|webp)$/.test(value.file) && ['image/png','image/jpeg','image/webp'].includes(value.mime) && value.width > 0 && value.height > 0 && value.width * value.height <= 40000000; }
  static restore(raw: string): MediaData {
    if (raw.length > 2 * 1024 * 1024) throw new Error('图像记录文件过大。');
    const data = JSON.parse(raw) as MediaData;
    if (!data || data.version !== 1 || !this.providers().includes(data.provider) || !Array.isArray(data.profiles) || data.profiles.length > 5 || !Array.isArray(data.history) || data.history.length > 100 || typeof data.draft !== 'string') throw new Error('图像记录格式不正确，原文件已保留。');
    data.profiles = data.profiles.map((profile: MediaProfile) => this.profile(profile));
    if (data.input && !this.asset(data.input)) throw new Error('参考图记录不正确。');
    for (const record of data.history) {
      if (!record || !/^[a-zA-Z0-9_-]{1,80}$/.test(record.id) || typeof record.prompt !== 'string' || typeof record.text !== 'string' || typeof record.error !== 'string' || !Array.isArray(record.images) || record.images.length > 4 || !record.images.every((image: ImageAsset) => this.asset(image)) || (record.input && !this.asset(record.input)) || !Number.isFinite(record.createdAt) || !['generate','vision'].includes(record.purpose)) throw new Error('图像历史格式不正确，原文件已保留。');
      record.profile = this.profile(record.profile); if (record.status === 'pending') { record.status = 'interrupted'; record.error = '上次任务已中断，没有自动重发。'; }
    }
    return data;
  }
}

export class MediaClient {
  constructor(private transport: ModelTransport) {}
  start(wire: ModelWire, key: string, events: MediaEvents): StreamHandle {
    wire.key = AssistantCore.key(key); let raw = ''; let closed = false; let task: StreamHandle | undefined;
    const fail = (message: string): void => { if (!closed) { closed = true; task?.close(); events.error(message); } };
    task = this.transport.start(wire, {
      data: (chunk: string): void => { if (!closed) { if (raw.length + chunk.length > 48 * 1024 * 1024) { fail('图像响应过大，已停止接收。'); return; } raw += chunk; } },
      end: (status: number): void => {
        if (closed) return;
        if (status < 200 || status >= 300) { fail(status === 401 || status === 403 ? '图像服务拒绝授权，请检查密钥与模型权限。' : status === 429 ? '图像服务限流或额度不足。' : status >= 300 && status < 400 ? '服务发生重定向，请填写最终 API 地址。' : '图像服务返回 HTTP ' + status + '，请检查配置与模型能力。'); return; }
        try { const result = MediaCore.response(raw); closed = true; events.done(result); } catch (_) { fail('服务返回的数据不受支持，或没有可用结果。请核对模型与接口类型。'); }
      },
      error: (): void => { fail('无法连接图像服务，请检查网络、证书或 API 地址。'); }
    });
    if (closed) task.close();
    return { close: (): void => { if (!closed) { closed = true; task?.close(); } } };
  }
}
