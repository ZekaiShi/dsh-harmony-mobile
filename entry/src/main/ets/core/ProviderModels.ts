import { AssistantCore, ModelTransport, ModelWire } from './AssistantCore';
import { ChatProtocol } from './ChatProtocol';
import { ProviderCatalog } from './ProviderCatalog';
import { StreamHandle } from './NativeModels';

export class ProviderModel {
  id: string = ''; name: string = ''; input: string[] = []; output: string[] = [];
  contextWindow: number = 0; reasoningOptions: string[] = []; categories: string[] = []; inferred: boolean = false;
}
interface ModelRow {
  id?: string; name?: string; display_name?: string; displayName?: string;
  supportedGenerationMethods?: string[]; architecture?: { input_modalities?: string[]; output_modalities?: string[] };
  context_length?: number; inputTokenLimit?: number; supported_parameters?: string[];
  reasoning?: { supported_efforts?: string[] | null; mandatory?: boolean };
  type?: string; sub_type?: string;
}
interface ModelPage { data?: ModelRow[]; models?: ModelRow[]; error?: Object; has_more?: boolean; last_id?: string; nextPageToken?: string; }
export class ModelList { models: ProviderModel[] = []; cursor: string = ''; }
export interface CatalogEvents { done(models: ProviderModel[], truncated: boolean): void; error(message: string): void; }

export class ProviderModels {
  static wire(provider: string, protocol: string, base: string, key: string, purpose: string = 'chat', cursor: string = ''): ModelWire {
    let url = ChatProtocol.base(AssistantCore.endpoint(base).url); const preset = ProviderCatalog.get(provider);
    if (!preset.discovery) throw new Error(preset.note || '请从服务商控制台复制模型 ID。');
    let query = ''; const auth = protocol === 'anthropic' ? 'anthropic' : protocol === 'gemini' ? 'google' : 'bearer';
    if (provider === 'qwen') url = url.replace(/\/compatible-mode\/v1$/, '/api/v1');
    url += provider === 'openrouter' && purpose === 'generate' ? '/images/models' : '/models';
    if (protocol === 'gemini') query = 'pageSize=1000' + (cursor ? '&pageToken=' + encodeURIComponent(cursor) : '');
    else if (protocol === 'anthropic') query = 'limit=100' + (cursor ? '&after_id=' + encodeURIComponent(cursor) : '');
    else if (provider === 'silicon') query = purpose === 'generate' ? 'type=image' : 'sub_type=chat';
    if (purpose === 'all' && provider === 'silicon') query = '';
    if (purpose === 'all' && provider === 'openrouter') query = 'output_modalities=all';
    return { url: url + (query ? '?' + query : ''), method: 'GET', body: '', key: AssistantCore.key(key), auth: auth };
  }
  static parse(raw: string, protocol: string, purpose: string = 'chat'): ModelList {
    const page = JSON.parse(raw) as ModelPage;
    if (!page || page.error || !Array.isArray(protocol === 'gemini' ? page.models : page.data)) throw new Error('format');
    const result = new ModelList();
    for (const row of (protocol === 'gemini' ? page.models : page.data) || []) {
      if (!row || purpose !== 'all' && protocol === 'gemini' && !row.supportedGenerationMethods?.includes('generateContent')) continue;
      const id = protocol === 'gemini' ? row.name?.replace(/^models\//, '') : row.id;
      if (typeof id !== 'string' || !id.trim() || id.length > 200 || /[\u0000-\u001f\u007f]/.test(id)) continue;
      const model = new ProviderModel(); model.id = id; model.name = (row.display_name || row.displayName || row.name || id).slice(0, 200);
      model.input = this.modalities(row.architecture?.input_modalities); model.output = this.modalities(row.architecture?.output_modalities);
      const window = row.context_length || row.inputTokenLimit || 0;
      model.contextWindow = Number.isInteger(window) && window > 0 && window <= 10000000 ? window : 0;
      const efforts = row.reasoning?.supported_efforts;
      model.reasoningOptions = Array.isArray(efforts) ? efforts.filter((v: string) => ['none','minimal','low','medium','high','xhigh','max'].includes(v)) : efforts === null ? ['minimal','low','medium','high','xhigh','max'] : [];
      if (row.reasoning?.mandatory) model.reasoningOptions = model.reasoningOptions.filter((v: string) => v !== 'none');
      const categories: string[] = [];
      if (model.output.includes('text')) categories.push('文本');
      if (model.input.includes('image') && model.output.includes('text')) categories.push('视觉');
      if (model.input.length > 1 || model.output.length > 1) categories.push('多模态');
      if (model.output.includes('image')) categories.push('生图');
      if (model.output.includes('audio')) categories.push('语音合成');
      if (model.input.includes('audio')) categories.push('音频理解');
      if (row.supported_parameters?.some((v: string) => ['reasoning','reasoning_effort'].includes(v)) || model.reasoningOptions.length) categories.push('推理');
      if (row.supportedGenerationMethods?.some((v: string) => /embed/i.test(v))) categories.push('嵌入');
      if (!categories.length) {
        const idLower = model.id.toLowerCase(); model.inferred = true;
        if (/embed|bge-|rerank/.test(idLower)) categories.push('嵌入');
        else if (/tts|speech|cosyvoice|kokoro/.test(idLower)) categories.push('语音合成');
        else if (/whisper|sensevoice|asr/.test(idLower)) categories.push('音频理解');
        else if (/image|flux|stable-diffusion|seedream|dall-e|kolors/.test(idLower)) categories.push('生图');
        else if (/gpt-|^o[134](?:-|$)|claude|gemini|deepseek|qwen|glm|moonshot|kimi|doubao|llama|mistral/.test(idLower)) {
          categories.push('文本');
          if (/vision|[-/]vl(?:-|$)|gemini|gpt-4o|claude/.test(idLower)) categories.push('视觉','多模态');
          if (/reason|thinking|deepseek-r1|^o[134](?:-|$)/.test(idLower)) categories.push('推理');
        }
        if (!categories.length) { categories.push('未标注'); model.inferred = false; }
      }
      model.categories = categories;
      result.models.push(model); if (result.models.length >= 2000) break;
    }
    result.cursor = protocol === 'gemini' ? page.nextPageToken || '' : page.has_more ? page.last_id || '' : '';
    if (result.cursor.length > 2048 || /[\u0000-\u001f\u007f]/.test(result.cursor)) throw new Error('cursor');
    return result;
  }
  private static modalities(values: string[] | undefined): string[] { return Array.isArray(values) ? values.filter((value: string) => ['text','image','audio','video','file'].includes(value)) : []; }
  static categories(): string[] { return ['全部','文本','推理','视觉','多模态','生图','语音合成','音频理解','嵌入','未标注']; }
  static chatCompatible(model: ProviderModel): boolean { return model.output.length ? model.output.includes('text') : !model.categories.some((v: string) => ['生图','语音合成','音频理解','嵌入'].includes(v)); }
  static search(models: ProviderModel[], query: string, category: string = '全部'): ProviderModel[] { const needle = query.trim().toLowerCase(); return models.filter((model: ProviderModel) => (category === '全部' || model.categories.includes(category)) && (!needle || (model.id + ' ' + model.name).toLowerCase().includes(needle))); }
}

export class CatalogClient {
  constructor(private transport: ModelTransport) {}
  start(provider: string, protocol: string, base: string, key: string, purpose: string, events: CatalogEvents): StreamHandle {
    let closed = false; let task: StreamHandle | undefined; let pages = 0; const models: ProviderModel[] = []; const cursors: string[] = [];
    const fail = (message: string): void => { if (!closed) { closed = true; task?.close(); events.error(message); } };
    const next = (cursor: string): void => {
      let wire: ModelWire;
      try { wire = ProviderModels.wire(provider, protocol, base, key, purpose, cursor); } catch (error) { fail((error as Error).message); return; }
      let raw = ''; pages++;
      const pageNumber = pages;
      const current = this.transport.start(wire, {
        data: (chunk: string): void => { if (!closed) { if (raw.length + chunk.length > 4 * 1024 * 1024) { fail('模型列表过大，已停止接收。'); return; } raw += chunk; } },
        end: (status: number): void => {
          if (closed) return;
          if (status !== 200) { fail(status === 401 || status === 403 ? '获取模型被拒绝，请检查密钥权限。' : status >= 300 && status < 400 ? '模型目录发生重定向，请填写最终地址。' : '模型目录返回 HTTP ' + status + '；可手动填写模型 ID。'); return; }
          try {
            const page = ProviderModels.parse(raw, protocol, purpose);
            for (const item of page.models) if (!models.some((model: ProviderModel) => model.id === item.id) && models.length < 2000) models.push(item);
            if (page.cursor && pages < 5 && models.length < 2000 && !cursors.includes(page.cursor)) { cursors.push(page.cursor); next(page.cursor); return; }
            closed = true; events.done(models, !!page.cursor || models.length >= 2000);
          } catch (_) { fail('模型目录格式不受支持，可手动填写模型 ID。'); }
        },
        error: (): void => { fail('无法获取模型列表，请检查网络与服务地址。'); }
      });
      if (pages === pageNumber) task = current;
      if (closed) current.close();
    };
    next(''); return { close: (): void => { closed = true; task?.close(); } };
  }
}
