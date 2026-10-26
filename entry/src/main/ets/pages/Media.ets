import { HarmonyExperience } from '../platform/HarmonyExperience';
import { KeyboardAvoidMode } from '@kit.ArkUI';
import { common } from '@kit.AbilityKit';
import { util } from '@kit.ArkTS';
import { pasteboard } from '@kit.BasicServicesKit';
import { CatalogClient, ProviderModel, ProviderModels } from '../core/ProviderModels';
import { AssistantCore } from '../core/AssistantCore';
import { MediaCore, MediaProfile, MediaData, MediaRecord, MediaResult, ImageAsset } from '../core/MediaCore';
import { StreamHandle } from '../core/NativeModels';
import { ModelHttp } from '../platform/ModelHttp';
import { MediaClient } from '../core/MediaCore';
import { MediaFiles } from '../platform/MediaFiles';
import { AssistantStore } from '../platform/AssistantStore';
import { MarkdownView } from '../components/MarkdownView';
import { NativeBackButton } from '../components/NativeBackButton';
import { NativeCircleStyle } from '../components/NativeCircleStyle';
import { BackNavigation } from '../core/BackNavigation';
import { Keyboard } from '../platform/Keyboard';
import { PageNavigation } from '../platform/PageNavigation';
import { PageBackdrop } from '../components/PageBackdrop';
import { ConversationExport } from '../core/ConversationExport';
import { ConversationFiles } from '../platform/ConversationFiles';
import { ExportOptions } from '../components/ExportOptions';
import { AdaptiveFrame } from '../components/AdaptiveFrame';
import { AdaptiveMetrics, ResponsiveLayout } from '../core/ResponsiveLayout';

@Entry
@Component
struct Media {
  @State private layout: AdaptiveMetrics = ResponsiveLayout.measure(360, 800);
  @State private galleryWidth: number = 312;
  @StorageLink('chromeTextColor') private chromeTextColor: string = '#30302E';
  @State private screen: string = 'main';
  @State private provider: string = 'compatible';
  @State private purpose: string = 'generate';
  @State private prompt: string = '';
  @State private reference: ImageAsset | undefined = undefined;
  @State private profile: MediaProfile = new MediaProfile();
  @State private records: MediaRecord[] = [];
  @State private busy: boolean = false;
  @State private ready: boolean = false;
  @State private error: string = '';
  @State private activeText: string = '';
  @State private activePrompt: string = '';
  @State private activeStatus: string = '';
  @State private exporting: boolean = false;
  @State private activeError: string = '';
  @State private outputs: ImageAsset[] = [];
  @State private preview: ImageAsset | undefined = undefined;
  @State private revision: number = 0;
  @State private editProvider: string = 'compatible';
  @State private editBase: string = '';
  @State private editModel: string = '';
  @State private editVision: string = '';
  @State private editSize: string = '';
  @State private editRatio: string = '';
  @State private editQuality: string = '';
  @State private editFormat: string = '';
  @State private keyInput: string = '';
  @State private hasKey: boolean = false;
  @State private catalogModels: ProviderModel[] = [];
  @State private catalogQuery: string = '';
  @State private catalogLoading: boolean = false;
  @State private catalogNote: string = '';
  private catalogTask: StreamHandle | undefined;
  private catalogEpoch: number = 0;
  private catalogPurpose: string = 'generate';
  private data: MediaData = new MediaData();
  private files: MediaFiles = new MediaFiles();
  private secrets: AssistantStore = new AssistantStore();
  private client: MediaClient = new MediaClient(new ModelHttp());
  private active: MediaRecord = new MediaRecord();
  private task: StreamHandle | undefined;
  private epoch: number = 0;
  private timer: number = -1;
  private settingsReturn: string = 'main';
  private previewReturn: string = 'detail';
  private detailReturn: string = 'main';
  private navigation: PageNavigation = new PageNavigation('main');
  private forward(page: string): void { this.screen = page; this.navigation.forward(page); }
  private returnTo(page: string): void { this.screen = page; this.navigation.backward(page); }

  aboutToAppear(): void {
    this.getUIContext().setKeyboardAvoidMode(KeyboardAvoidMode.RESIZE);
    try { this.data = this.files.load(this.getUIContext().getHostContext() as common.Context); this.provider = this.data.provider; this.prompt = this.data.draft; this.reference = this.data.input; this.selectProfile(); this.records = this.data.history.slice(); this.ready = true; }
    catch (_) { this.error = '本机图像记录无法读取，原文件已保留。'; }
  }
  onPageHide(): void { this.cancelCatalog(); this.stop(); this.keyInput = ''; this.save(); }
  aboutToDisappear(): void { this.cancelCatalog(); clearTimeout(this.timer); this.stop(); this.keyInput = ''; }
  private toast(message: string): void { try { this.getUIContext().getPromptAction().showToast({ message: message }); } catch (_) {} }
  private save(): void {
    if (!this.ready) return;
    this.data.draft = this.prompt; this.data.input = this.reference; this.data.provider = this.provider;
    try { this.files.save(this.data); } catch (_) { this.error = '图像记录未能保存，请及时导出重要结果。'; }
  }
  private scheduleSave(): void { clearTimeout(this.timer); this.timer = setTimeout(() => this.save(), 500); }
  private selectProfile(): void { this.profile = this.data.profiles.find((item: MediaProfile) => item.provider === this.provider) || MediaCore.defaults(this.provider); }
  private publish(record: MediaRecord): void {
    this.active = record; this.activeText = record.text; this.activePrompt = record.prompt; this.activeStatus = record.status; this.activeError = record.error; this.outputs = record.images.slice(); this.records = this.data.history.slice(); this.revision++;
  }
  private configure(): void { this.stop(); this.settingsReturn = this.screen; this.forward('settings'); this.chooseProvider(this.provider); }
  private chooseProvider(provider: string): void {
    this.cancelCatalog();
    this.editProvider = provider; const profile = this.data.profiles.find((item: MediaProfile) => item.provider === provider) || MediaCore.defaults(provider);
    this.editBase = profile.base; this.editModel = profile.model; this.editVision = profile.visionModel; this.editSize = profile.size; this.editRatio = profile.ratio; this.editQuality = profile.quality; this.editFormat = profile.format;
    this.keyInput = ''; this.hasKey = false; this.error = '';
    if (profile.base) { try { const origin = AssistantCore.endpoint(profile.base).origin; this.secrets.key(origin).then((key: string) => { if (this.editProvider === provider && this.editBase === profile.base) this.hasKey = key.length > 0; }).catch(() => {}); } catch (_) {} }
  }
  private cancelCatalog(): void { this.catalogEpoch++; this.catalogTask?.close(); this.catalogTask = undefined; this.catalogLoading = false; }
  private async fetchModels(purpose: string): Promise<void> {
    this.cancelCatalog(); const epoch = this.catalogEpoch; this.error = ''; this.catalogModels = []; this.catalogQuery = ''; this.catalogNote = ''; this.catalogPurpose = purpose; this.catalogLoading = true;
    try {
      const key = this.keyInput.trim() ? AssistantCore.key(this.keyInput) : await this.secrets.key(AssistantCore.endpoint(this.editBase).origin);
      if (epoch !== this.catalogEpoch) return;
      if (!key) throw new Error('请先填写 API Key。');
      if (this.editProvider === 'ark') throw new Error('方舟请填写控制台的模型 ID 或 ep- 接入点 ID。');
      this.forward('models'); const protocol = this.editProvider === 'gemini' ? 'gemini' : 'chat';
      this.catalogTask = new CatalogClient(new ModelHttp()).start(this.editProvider === 'compatible' ? 'custom' : this.editProvider, protocol, this.editBase, key, purpose === 'generate' ? 'generate' : 'chat', {
        done: (models: ProviderModel[], truncated: boolean): void => { if (epoch !== this.catalogEpoch) return; this.catalogModels = models; this.catalogLoading = false; this.catalogTask = undefined; this.catalogNote = '已获取 ' + models.length + ' 个模型' + (truncated ? '（部分）' : '') + '。请选支持' + (purpose === 'generate' ? '图像输出' : '图片输入') + '的模型；通用列表可能含其他类型。'; },
        error: (message: string): void => { if (epoch !== this.catalogEpoch) return; this.catalogLoading = false; this.catalogTask = undefined; this.error = message; }
      });
    } catch (error) { if (epoch === this.catalogEpoch) { this.catalogLoading = false; this.error = (error as Error).message; } }
  }
  private async saveProfile(): Promise<void> {
    if (this.busy || !this.ready) return;
    this.busy = true; this.error = '';
    try {
      const source = new MediaProfile(); source.provider = this.editProvider; source.base = this.editBase; source.model = this.editModel.trim(); source.visionModel = this.editVision.trim(); source.size = this.editSize; source.ratio = this.editRatio; source.quality = this.editQuality; source.format = this.editFormat;
      const profile = MediaCore.profile(source); const origin = AssistantCore.endpoint(profile.base).origin;
      const key = this.keyInput.trim() ? AssistantCore.key(this.keyInput) : await this.secrets.key(origin);
      if (!key) throw new Error('请填写当前服务的 API Key。');
      await this.secrets.saveKey(origin, key); this.data.profiles = this.data.profiles.filter((item: MediaProfile) => item.provider !== profile.provider).concat([profile]);
      this.provider = profile.provider; this.selectProfile(); this.keyInput = ''; this.hasKey = true; this.save(); if (!this.error) { this.returnTo(this.settingsReturn); this.toast('图像配置已保存，尚未发送请求'); }
    } catch (error) { this.error = (error as Error).message || '图像配置无法保存。'; }
    finally { this.busy = false; }
  }
  private async forgetKey(): Promise<void> {
    try { const origin = AssistantCore.endpoint(this.editBase).origin; await this.secrets.forgetKey(origin); this.hasKey = false; this.keyInput = ''; this.toast('该地址的密钥已删除，独立聊天中使用同一地址也会受影响'); }
    catch (_) { this.error = '密钥未能删除，请检查地址。'; }
  }
  private async chooseImage(fromFile: boolean = false): Promise<void> {
    if (this.busy || !this.ready) return;
    this.error = '';
    try { const asset = await this.files.select(this.getUIContext().getHostContext() as common.Context, fromFile); if (asset) { this.reference = asset; this.save(); this.files.prune(this.data); } }
    catch (_) { this.error = '未能读取图片，请选择较小的本机图片重试。'; }
  }
  private clearImage(): void { this.reference = undefined; this.save(); try { this.files.prune(this.data); } catch (_) {} }
  private async run(): Promise<void> {
    if (this.busy || !this.ready) return;
    if (!this.profile.model) { this.configure(); return; }
    const epoch = ++this.epoch; this.busy = true; this.error = '';
    try {
      if (this.data.history.length >= 100) throw new Error('已达到 100 条图像记录，请先导出并删除旧记录。');
      const profile = MediaCore.profile(this.profile); const image = this.reference ? this.files.dataUrl(this.reference) : '';
      const wire = MediaCore.request(profile, this.purpose, this.prompt, image); const key = await this.secrets.key(AssistantCore.endpoint(profile.base).origin);
      if (epoch !== this.epoch) return;
      if (!key) throw new Error('当前服务没有 API Key，请先配置。');
      const record = new MediaRecord(); record.id = util.generateRandomUUID(true); record.createdAt = Date.now(); record.prompt = this.prompt.trim(); record.profile = profile; record.purpose = this.purpose; record.input = this.reference;
      this.data.history.unshift(record); this.publish(record); this.detailReturn = 'main'; this.forward('detail'); this.save();
      this.task = this.client.start(wire, key, {
        done: (result: MediaResult): void => { if (epoch === this.epoch) void this.receive(record, result, epoch); },
        error: (message: string): void => { if (epoch === this.epoch) { record.status = 'error'; record.error = message; this.busy = false; this.task = undefined; this.publish(record); this.save(); } }
      });
    } catch (error) { if (epoch === this.epoch) { this.busy = false; this.error = (error as Error).message || '请求未完成。'; } }
  }
  private async receive(record: MediaRecord, result: MediaResult, epoch: number): Promise<void> {
    this.task = undefined; record.text = result.text;
    try {
      for (const remote of result.images) {
        if (epoch !== this.epoch) return;
        const asset = await this.files.receive(remote);
        if (epoch !== this.epoch) { try { this.files.prune(this.data); } catch (_) {} return; }
        record.images.push(asset); this.publish(record); this.save();
      }
      if (epoch !== this.epoch) return;
      record.status = 'done';
      if (record.purpose === 'generate' && !record.images.length) record.error = '服务只返回了文字，没有生成图片。请检查所选模型是否支持图像输出。';
    } catch (_) { if (epoch !== this.epoch) return; record.status = 'error'; record.error = '图片下载或保存失败，已保留收到的文字和图片。请检查网络与本机空间。'; }
    if (epoch === this.epoch) { this.busy = false; this.publish(record); this.save(); }
  }
  private stop(): void {
    this.epoch++; this.task?.close(); this.task = undefined; this.files.cancel();
    if (this.busy && this.active.status === 'pending') { this.active.status = 'interrupted'; this.active.error = '已停止接收，没有自动重发。服务端计费停止时机由服务商决定。'; this.publish(this.active); }
    this.busy = false; this.save();
  }
  private back(): void {
    Keyboard.dismiss(this.getUIContext());
    if (this.screen === 'settings' && this.busy) return;
    const parent = this.screen === 'settings' ? this.settingsReturn : this.screen === 'preview' ? this.previewReturn : this.detailReturn;
    const target = BackNavigation.target('media', this.screen, parent);
    if (this.screen === 'models') this.cancelCatalog();
    if (this.screen === 'settings') this.keyInput = '';
    if (this.screen === 'detail' || target === 'home') this.stop();
    this.error = ''; this.save();
    if (target === 'home') this.getUIContext().getRouter().back();
    else this.returnTo(target);
  }
  onBackPress(): boolean { this.back(); return true; }
  private showPreview(asset: ImageAsset, from: string): void { this.preview = asset; this.previewReturn = from; this.forward('preview'); }
  private openRecord(record: MediaRecord): void { this.detailReturn = 'history'; this.publish(record); this.forward('detail'); }
  private useImage(asset: ImageAsset, purpose: string): void { this.stop(); this.reference = asset; this.purpose = purpose; this.returnTo('main'); this.prompt = ''; this.save(); }
  private async export(asset: ImageAsset): Promise<void> { try { if (await this.files.export(this.getUIContext().getHostContext() as common.Context, asset)) this.toast('图片已导出'); } catch (_) { this.toast('图片未能导出，请重试'); } }
  private copy(text: string): void { pasteboard.getSystemPasteboard().setData(pasteboard.createData(pasteboard.MIMETYPE_TEXT_PLAIN, text)).then(() => this.toast('已复制')).catch(() => this.toast('复制失败')); }
  @Builder private exportOptions() {
    ExportOptions((format: string): void => { void this.exportRecord(format); })
  }
  private async exportRecord(format: string): Promise<void> {
    if (this.exporting) return; this.exporting = true;
    try { const count = await ConversationFiles.export(this.getUIContext().getHostContext() as common.Context, ConversationExport.media(this.active), format); if (count) this.toast('已导出 ' + count + ' 个文件'); }
    catch (error) { this.toast((error as Error).message || '导出未完成'); }
    finally { this.exporting = false; }
  }
  private remove(record: MediaRecord): void {
    this.getUIContext().showAlertDialog({ title: '删除图像记录', message: '删除该记录及未被其他记录或草稿引用的本机图片？已导出的文件不受影响。',
      primaryButton: { value: '取消', action: () => {} }, secondaryButton: { value: '删除', action: () => {
        this.data.history = this.data.history.filter((item: MediaRecord) => item.id !== record.id); this.records = this.data.history.slice(); this.revision++; this.save(); try { this.files.prune(this.data); } catch (_) {}
      } } });
  }
  @Builder private header(page: string) {
    Row({ space: 10 }) {
      NativeBackButton({ controlId: 'media-back', onBack: () => this.back() })
      Column({ space: 3 }) {
        Text(page === 'models' ? '选择模型' : page === 'settings' ? '图像设置' : page === 'history' ? '作品与记录' : page === 'preview' ? '图片预览' : '图像工作室').fontSize(17).fontWeight(FontWeight.Medium).fontColor($r('app.color.text_primary'))
        Text(this.busy ? '正在处理…' : '生成、理解，留在手机。').fontSize(11).fontColor($r('app.color.text_secondary'))
      }.layoutWeight(1).alignItems(HorizontalAlign.Start)
      if (page !== 'settings' && page !== 'preview' && page !== 'models') Button({ type: ButtonType.Circle }) { SymbolGlyph($r('sys.symbol.gearshape')).fontSize(21).fontColor([$r('app.color.text_primary')]) }.attributeModifier(new NativeCircleStyle(44, true)).id('media-settings').accessibilityText('图像设置').onClick(() => this.configure())
    }.height(60).padding({ left: 8, right: 12 }).width('100%')
  }
  @Builder private banner() { if (this.error) Text(this.error).fontSize(13).lineHeight(21).fontColor($r('app.color.danger')).width('100%').padding({ top: 8, bottom: 8 }) }
  @Builder private primary(label: string, id: string, action: () => void) { Button(label, { type: ButtonType.Normal }).width('100%').height(48).borderRadius(24).backgroundColor($r('app.color.ink')).fontColor($r('app.color.on_ink')).id(id).enabled(this.ready).onClick(action) }
  @Builder private main() {
    Scroll() {
      Column({ space: 18 }) {
        Text('把想法变成图像。').fontSize(28).fontWeight(FontWeight.Medium).fontColor($r('app.color.text_primary')).width('100%').margin({ top: 20 })
        Row() {
          Text(MediaCore.label(this.provider) + (this.profile.model ? ' · ' + this.profile.model : ' · 待配置')).fontSize(12).fontColor($r('app.color.text_secondary')).maxLines(2).layoutWeight(1)
          Button('作品与记录', { type: ButtonType.Normal }).fontSize(12).height(40).backgroundColor(Color.Transparent).fontColor($r('app.color.text_primary')).id('media-history').onClick(() => { this.records = this.data.history.slice(); this.forward('history'); })
        }.width('100%')
        Row({ space: 8 }) {
          Button('图像生成', { type: ButtonType.Normal }).height(42).layoutWeight(1).borderRadius(21).fontSize(14).backgroundColor(this.purpose === 'generate' ? $r('app.color.ink') : $r('app.color.accent_soft')).fontColor(this.purpose === 'generate' ? $r('app.color.on_ink') : $r('app.color.text_primary')).id('media-mode-generate').onClick(() => { this.purpose = 'generate'; })
          Button('图片问答', { type: ButtonType.Normal }).height(42).layoutWeight(1).borderRadius(21).fontSize(14).backgroundColor(this.purpose === 'vision' ? $r('app.color.ink') : $r('app.color.accent_soft')).fontColor(this.purpose === 'vision' ? $r('app.color.on_ink') : $r('app.color.text_primary')).id('media-mode-vision').onClick(() => { this.purpose = 'vision'; })
        }.width('100%')
        if (this.reference) {
          Row({ space: 14 }) {
            Image(this.files.uri(this.reference)).width(90).height(90).objectFit(ImageFit.Cover).borderRadius(12).id('media-reference').onClick(() => this.showPreview(this.reference!, 'main'))
            Column({ space: 5 }) { Text('已选择 1 张图片').fontSize(14).fontColor($r('app.color.text_primary')); Text('仅在发送时上传到当前模型服务').fontSize(11).fontColor($r('app.color.text_secondary')); Button('移除图片', { type: ButtonType.Normal }).fontSize(12).height(32).backgroundColor(Color.Transparent).fontColor($r('app.color.danger')).id('media-remove-input').onClick(() => this.clearImage()) }.alignItems(HorizontalAlign.Start).layoutWeight(1)
          }.width('100%')
        }
        Row({ space: 8 }) {
          Button(this.purpose === 'vision' ? '从相册选择' : '添加参考图', { type: ButtonType.Normal }).height(44).layoutWeight(1).fontSize(13).borderRadius(22).backgroundColor($r('app.color.accent_soft')).fontColor($r('app.color.text_primary')).id('media-pick').onClick(() => { void this.chooseImage(); })
          Button('从文件选择', { type: ButtonType.Normal }).height(44).layoutWeight(1).fontSize(13).borderRadius(22).backgroundColor($r('app.color.accent_soft')).fontColor($r('app.color.text_primary')).id('media-pick-file').onClick(() => { void this.chooseImage(true); })
        }.width('100%')
        TextArea({ text: this.prompt, placeholder: this.purpose === 'vision' ? '想了解这张图片的什么？' : '描述你想生成的图像…' }).height(this.layout.compact ? 90 : 140).fontSize(16).lineHeight(25).padding(16).backgroundColor($r('app.color.surface')).fontColor($r('app.color.text_primary')).borderRadius(18).maxLength(16000).id('media-prompt').onChange((value: string) => { this.prompt = value; this.scheduleSave(); })
        this.banner()
        this.primary(this.profile.model ? this.purpose === 'vision' ? '分析图片' : '生成图像' : '先配置图像模型', 'media-run', () => { void this.run(); })
        Text('请求直接发送给你配置的服务，按服务商规则计费。生成结果下载到本机，断网仍可查看；导出时由你选择保存位置。').fontSize(12).lineHeight(21).fontColor($r('app.color.text_secondary')).width('100%')
        Text('参考图会按最长边 2048 像素转为 JPEG 上传。OpenAI 兼容参考图编辑需要服务支持 JSON images/edits；方舟与 Gemini 使用各自原生格式。').fontSize(11).lineHeight(19).fontColor($r('app.color.text_secondary')).width('100%')
      }.padding({ left: 24, right: 24, bottom: 26 }).width('100%')
    }.layoutWeight(1).width('100%').scrollBar(BarState.Off)
  }
  @Builder private modelsPage() {
    Column({ space: 10 }) {
      TextInput({ text: this.catalogQuery, placeholder: '搜索模型名称或 ID' }).height(44).fontSize(14).width('90%').id('media-model-search').onChange((value: string) => { this.catalogQuery = value; })
      if (this.catalogLoading) LoadingProgress().width(30).height(30)
      Text(this.catalogNote).fontSize(12).lineHeight(20).width('88%').fontColor($r('app.color.text_secondary'))
      this.banner()
      List() {
        ForEach(ProviderModels.search(this.catalogModels, this.catalogQuery), (model: ProviderModel) => {
          ListItem() {
            Column({ space: 6 }) {
              Text(model.name).fontSize(15).fontColor($r('app.color.text_primary')).width('100%')
              Text(model.id + (model.input.length ? ' · 输入 ' + model.input.join('/') : '') + (model.output.length ? ' · 输出 ' + model.output.join('/') : '')).fontSize(11).fontColor($r('app.color.text_secondary')).width('100%')
            }.padding({ top: 16, bottom: 16 }).width('100%').id('media-catalog-' + model.id).onClick(() => { if (this.catalogPurpose === 'generate') this.editModel = model.id; else this.editVision = model.id; this.cancelCatalog(); this.returnTo('settings'); this.error = ''; })
          }
        }, (model: ProviderModel) => model.id)
      }.layoutWeight(1).width('100%').padding({ left: 24, right: 24 })
    }.layoutWeight(1).width('100%')
  }
  @Builder private settings() {
    Scroll() {
      Column({ space: 10 }) {
        Text('选择图像服务').fontSize(24).fontColor($r('app.color.text_primary')).width('100%')
        Flex({ wrap: FlexWrap.Wrap, justifyContent: FlexAlign.SpaceBetween }) {
          ForEach(MediaCore.providers(), (provider: string) => { Button(MediaCore.label(provider), { type: ButtonType.Normal }).height(40).fontSize(12).width('48%').margin({ bottom: 8 }).borderRadius(20).backgroundColor(this.editProvider === provider ? $r('app.color.ink') : $r('app.color.accent_soft')).fontColor(this.editProvider === provider ? $r('app.color.on_ink') : $r('app.color.text_primary')).id('media-provider-' + provider).onClick(() => this.chooseProvider(provider)) }, (provider: string) => provider + ':' + this.editProvider)
        }.width('100%').margin({ bottom: 8 })
        Text('服务地址已预填，各服务分别保存配置。可获取模型列表，也可手动填写 ID。OpenRouter 使用独立图像接口；保存配置不调用模型。').fontSize(12).lineHeight(21).fontColor($r('app.color.text_secondary')).width('100%')
        Text('API 基础地址').fontSize(12).fontColor($r('app.color.text_secondary')).width('100%')
        TextInput({ text: this.editBase, placeholder: 'https://api.example.com/v1' }).height(44).fontSize(14).maxLength(2048).id('media-base').onChange((value: string) => { this.editBase = value; this.hasKey = false; })
        Text('图像生成模型 ID').fontSize(12).fontColor($r('app.color.text_secondary')).width('100%')
        TextInput({ text: this.editModel, placeholder: '支持图像生成的模型或接入点 ID' }).height(44).fontSize(14).maxLength(200).id('media-model').onChange((value: string) => { this.editModel = value; })
        Text('视觉模型 ID（图片问答使用）').fontSize(12).fontColor($r('app.color.text_secondary')).width('100%')
        TextInput({ text: this.editVision, placeholder: this.editProvider === 'gemini' ? '留空沿用上述模型' : '填写支持图片输入的聊天模型' }).height(44).fontSize(14).maxLength(200).id('media-vision').onChange((value: string) => { this.editVision = value; })
        Text('API Key').fontSize(12).fontColor($r('app.color.text_secondary')).width('100%')
        TextInput({ text: this.keyInput, placeholder: '留空使用此地址在系统安全存储中的密钥' }).type(InputType.Password).showPasswordIcon(false).height(44).fontSize(14).maxLength(1024).id('media-key').onChange((value: string) => { this.keyInput = value; })
        Row({ space: 8 }) {
          Button('选择生图模型', { type: ButtonType.Normal }).height(40).fontSize(12).layoutWeight(1).backgroundColor($r('app.color.accent_soft')).fontColor($r('app.color.text_primary')).id('media-fetch-image').onClick(() => { void this.fetchModels('generate'); })
          Button('选择视觉模型', { type: ButtonType.Normal }).height(40).fontSize(12).layoutWeight(1).backgroundColor($r('app.color.accent_soft')).fontColor($r('app.color.text_primary')).id('media-fetch-vision').onClick(() => { void this.fetchModels('vision'); })
        }.width('100%')
        Text('输出尺寸（选填）').fontSize(12).fontColor($r('app.color.text_secondary')).width('100%')
        TextInput({ text: this.editSize, placeholder: this.editProvider === 'gemini' ? '如 2K；留空使用模型默认值' : '如 1024x1024、2K；以模型支持为准' }).height(44).fontSize(14).maxLength(24).id('media-size').onChange((value: string) => { this.editSize = value; })
        if (this.editProvider === 'gemini' || this.editProvider === 'openrouter') {
          Text('宽高比（选填）').fontSize(12).fontColor($r('app.color.text_secondary')).width('100%')
          TextInput({ text: this.editRatio, placeholder: '例如 1:1、16:9' }).height(44).fontSize(14).id('media-ratio').onChange((value: string) => { this.editRatio = value; })
        } else if (this.editProvider !== 'silicon') {
          if (this.editProvider === 'compatible') {
            Text('质量（选填）').fontSize(12).fontColor($r('app.color.text_secondary')).width('100%')
            TextInput({ text: this.editQuality, placeholder: '如 auto、high；留空不发送' }).height(44).fontSize(14).id('media-quality').onChange((value: string) => { this.editQuality = value; })
          }
          Text('返回格式').fontSize(12).fontColor($r('app.color.text_secondary')).width('100%')
          Row({ space: 8 }) {
            ForEach(['','b64_json','url'], (format: string) => { Button(format || '模型默认', { type: ButtonType.Normal }).height(38).fontSize(11).layoutWeight(1).backgroundColor(this.editFormat === format ? $r('app.color.ink') : $r('app.color.accent_soft')).fontColor(this.editFormat === format ? $r('app.color.on_ink') : $r('app.color.text_primary')).borderRadius(19).id('media-format-' + (format || 'auto')).onClick(() => { this.editFormat = format; }) }, (format: string) => format + ':' + this.editFormat + ':' + this.editProvider)
          }.width('100%')
          Text('GPT Image 使用「模型默认」，不要强制 response_format；部分兼容服务和 Seedream 可指定 URL 或 Base64。').fontSize(11).lineHeight(19).fontColor($r('app.color.text_secondary')).width('100%')
        }
        this.banner()
        this.primary(this.busy ? '保存中…' : '保存图像配置', 'media-save-profile', () => { void this.saveProfile(); })
        if (this.hasKey) Button('删除此地址密钥', { type: ButtonType.Normal }).height(40).fontSize(12).backgroundColor(Color.Transparent).fontColor($r('app.color.danger')).onClick(() => { void this.forgetKey(); })
        if (this.data.profiles.some((item: MediaProfile) => item.provider === this.editProvider)) Button('清除该接口配置', { type: ButtonType.Normal }).height(40).fontSize(12).backgroundColor(Color.Transparent).fontColor($r('app.color.text_secondary')).id('media-clear-profile').onClick(() => {
          this.data.profiles = this.data.profiles.filter((item: MediaProfile) => item.provider !== this.editProvider); this.selectProfile(); this.keyInput = ''; this.save(); this.returnTo('main'); this.toast('已清除接口配置，历史和其他接口配置已保留');
        })
        Text('密钥与独立聊天共用按服务地址隔离的安全存储，不会发送给图片下载地址。图像记录和图片只保存在应用私有目录，卸载后清除。').fontSize(11).lineHeight(19).fontColor($r('app.color.text_secondary')).width('100%')
      }.padding({ left: 24, right: 24, top: 16, bottom: 30 }).width('100%')
    }.layoutWeight(1).width('100%').scrollBar(BarState.Off)
  }
  @Builder private detail() {
    Scroll() {
      Column({ space: 16 }) {
        Text(this.activePrompt).fontSize(17).lineHeight(27).fontColor($r('app.color.text_primary')).width('100%').copyOption(CopyOptions.LocalDevice)
        Text(MediaCore.label(this.active.profile.provider) + ' · ' + (this.active.purpose === 'vision' ? this.active.profile.visionModel || this.active.profile.model : this.active.profile.model)).fontSize(11).fontColor($r('app.color.text_secondary')).width('100%')
        if (this.active.input) Image(this.files.uri(this.active.input)).width(80).height(80).objectFit(ImageFit.Cover).borderRadius(12).onClick(() => this.showPreview(this.active.input!, 'detail'))
        if (this.activeStatus === 'pending') { LoadingProgress().width(32).height(32).color($r('app.color.accent')); Text('等待服务返回结果并保存到本机…').fontSize(13).fontColor($r('app.color.text_secondary')); this.primary('停止', 'media-stop', () => this.stop()) }
        Flex({ wrap: FlexWrap.Wrap, justifyContent: FlexAlign.SpaceBetween }) {
        ForEach(this.outputs, (asset: ImageAsset, index: number) => {
          Column({ space: 8 }) {
            Image(this.files.uri(asset)).width('100%').aspectRatio(asset.width / asset.height).constraintSize({ maxHeight: 380 }).objectFit(ImageFit.Contain).borderRadius(16).id('media-result-' + index).onClick(() => this.showPreview(asset, 'detail'))
            Row({ space: 10 }) {
              Text(asset.width + ' × ' + asset.height).fontSize(11).fontColor($r('app.color.text_secondary')).layoutWeight(1)
              Button('预览', { type: ButtonType.Normal }).fontSize(12).height(36).backgroundColor(Color.Transparent).fontColor($r('app.color.text_primary')).id('media-preview-' + index).onClick(() => this.showPreview(asset, 'detail'))
              Button('导出图片', { type: ButtonType.Normal }).fontSize(12).height(36).backgroundColor($r('app.color.accent_soft')).fontColor($r('app.color.text_primary')).borderRadius(18).id('media-export-' + index).onClick(() => { void this.export(asset); })
            }.width('100%')
          }.width(ResponsiveLayout.imageCard(this.galleryWidth)).margin({ bottom: 16 })
        }, (asset: ImageAsset) => asset.file)
        }.width('100%').onSizeChange((oldSize: SizeOptions, size: SizeOptions) => { this.galleryWidth = Number(size.width); })
        if (this.activeText) MarkdownView({ content: this.activeText })
        if (this.activeError) Text(this.activeError).fontSize(13).lineHeight(22).fontColor($r('app.color.danger')).width('100%')
        if (this.activeStatus !== 'pending') {
          Button(this.exporting ? '导出中…' : '导出对话 / 作品', { type: ButtonType.Normal }).fontSize(12).height(40).width('100%').borderRadius(20).backgroundColor($r('app.color.accent_soft')).fontColor($r('app.color.text_primary')).id('media-export-record').enabled(!this.exporting).bindMenu(this.exportOptions)
          Row({ space: 8 }) {
            Button('使用描述', { type: ButtonType.Normal }).fontSize(12).height(40).layoutWeight(1).borderRadius(20).backgroundColor($r('app.color.accent_soft')).fontColor($r('app.color.text_primary')).id('media-reuse').onClick(() => { this.prompt = this.active.prompt; this.returnTo('main'); this.save(); })
            if (this.activeText) Button('复制文字', { type: ButtonType.Normal }).fontSize(12).height(40).layoutWeight(1).borderRadius(20).backgroundColor($r('app.color.accent_soft')).fontColor($r('app.color.text_primary')).onClick(() => this.copy(this.activeText))
          }.width('100%')
        }
      }.width('100%').padding({ left: 24, right: 24, top: 18, bottom: 28 })
    }.layoutWeight(1).width('100%').scrollBar(BarState.Off)
  }
  @Builder private history() {
    List({ space: 16 }) {
      ForEach(this.records, (record: MediaRecord) => {
        ListItem() {
          Row({ space: 12 }) {
            if (record.images.length) Image(this.files.uri(record.images[0])).width(62).height(62).borderRadius(10).objectFit(ImageFit.Cover).onClick(() => this.openRecord(record))
            Column({ space: 6 }) {
              Text(record.prompt).fontSize(15).fontColor($r('app.color.text_primary')).maxLines(2).textOverflow({ overflow: TextOverflow.Ellipsis })
              Text(MediaCore.label(record.profile.provider) + ' · ' + (record.purpose === 'vision' ? '图片问答' : record.images.length + ' 张图片')).fontSize(11).fontColor($r('app.color.text_secondary'))
            }.layoutWeight(1).alignItems(HorizontalAlign.Start).id('media-record-' + record.id).onClick(() => this.openRecord(record))
            Button({ type: ButtonType.Normal }) { SymbolGlyph($r('sys.symbol.trash')).fontSize(18).fontColor([$r('app.color.text_secondary')]) }.height(42).width(36).backgroundColor(Color.Transparent).id('media-delete-' + record.id).onClick(() => this.remove(record))
          }.width('100%').padding({ top: 12, bottom: 12 })
        }
      }, (record: MediaRecord) => record.id + ':' + this.revision)
      if (!this.records.length) ListItem() { Text('生成和分析结果会保存在这里，断网也能查看。').fontSize(14).lineHeight(24).fontColor($r('app.color.text_secondary')).padding(24) }
    }.layoutWeight(1).padding({ left: 22, right: 22 }).width('100%')
  }
  @Builder private previewPage() {
    if (this.preview) Column({ space: 12 }) {
      Image(this.files.uri(this.preview)).width('100%').layoutWeight(1).objectFit(ImageFit.Contain).id('media-full-image')
      Row({ space: 8 }) {
        Button('用作参考图', { type: ButtonType.Normal }).height(42).fontSize(12).layoutWeight(1).borderRadius(21).backgroundColor($r('app.color.accent_soft')).fontColor($r('app.color.text_primary')).id('media-use-reference').onClick(() => this.useImage(this.preview!, 'generate'))
        Button('问这张图', { type: ButtonType.Normal }).height(42).fontSize(12).layoutWeight(1).borderRadius(21).backgroundColor($r('app.color.accent_soft')).fontColor($r('app.color.text_primary')).id('media-use-vision').onClick(() => this.useImage(this.preview!, 'vision'))
      }.width('100%')
      this.primary('导出图片', 'media-export-preview', () => { void this.export(this.preview!); })
    }.padding({ left: 20, right: 20, bottom: 20 }).layoutWeight(1).width('100%')
  }
  @Builder private mainHeader() { this.header('main') }
  @Builder private settingsHeader() { this.header('settings') }
  @Builder private modelsHeader() { this.header('models') }
  @Builder private historyHeader() { this.header('history') }
  @Builder private detailHeader() { this.header('detail') }
  @Builder private previewHeader() { this.header('preview') }
  @Builder private destination(page: string) {
    if (page === 'settings') {
      NavDestination() { AdaptiveFrame({ maxWidth: this.layout.form, content: (): void => { this.settings(); } }) }.title({ builder: this.settingsHeader, height: 60 }, HarmonyExperience.titleOptions()).ignoreLayoutSafeArea([], []).systemBarStyle({ statusBarContentColor: this.chromeTextColor }).hideBackButton(true).backgroundColor($r('app.color.page_bg')).onBackPressed(() => { this.back(); return true; })
    }
    else if (page === 'models') {
      NavDestination() { AdaptiveFrame({ maxWidth: this.layout.form, content: (): void => { this.modelsPage(); } }) }.title({ builder: this.modelsHeader, height: 60 }, HarmonyExperience.titleOptions()).ignoreLayoutSafeArea([], []).systemBarStyle({ statusBarContentColor: this.chromeTextColor }).hideBackButton(true).backgroundColor($r('app.color.page_bg')).onBackPressed(() => { this.back(); return true; })
    }
    else if (page === 'history') {
      NavDestination() { AdaptiveFrame({ maxWidth: this.layout.form, content: (): void => { this.history(); } }) }.title({ builder: this.historyHeader, height: 60 }, HarmonyExperience.titleOptions()).ignoreLayoutSafeArea([], []).systemBarStyle({ statusBarContentColor: this.chromeTextColor }).hideBackButton(true).backgroundColor($r('app.color.page_bg')).onBackPressed(() => { this.back(); return true; })
    }
    else if (page === 'detail') {
      NavDestination() { AdaptiveFrame({ maxWidth: this.layout.gallery, content: (): void => { this.detail(); } }) }.title({ builder: this.detailHeader, height: 60 }, HarmonyExperience.titleOptions()).ignoreLayoutSafeArea([], []).systemBarStyle({ statusBarContentColor: this.chromeTextColor }).hideBackButton(true).backgroundColor($r('app.color.page_bg')).onBackPressed(() => { this.back(); return true; })
    }
    else if (page === 'preview') {
      NavDestination() { AdaptiveFrame({ maxWidth: this.layout.gallery, content: (): void => { this.previewPage(); } }) }.title({ builder: this.previewHeader, height: 60 }, HarmonyExperience.titleOptions()).ignoreLayoutSafeArea([], []).systemBarStyle({ statusBarContentColor: this.chromeTextColor }).hideBackButton(true).backgroundColor($r('app.color.page_bg')).onBackPressed(() => { this.back(); return true; })
    }
  }
  build() {
    Stack() {
    PageBackdrop()
    Navigation(this.navigation.paths) { AdaptiveFrame({ maxWidth: this.layout.form, content: (): void => { this.main(); } }) }
      .navDestination(this.destination).title({ builder: this.mainHeader, height: 60 }, HarmonyExperience.titleOptions())
      .titleMode(NavigationTitleMode.Mini).hideBackButton(true).hideToolBar(true).mode(NavigationMode.Stack)
      .width('100%').height('100%').backgroundColor($r('app.color.page_bg'))
      .ignoreLayoutSafeArea([], []).systemBarStyle({ statusBarContentColor: this.chromeTextColor })
    }.width('100%').height('100%').backgroundColor($r('app.color.page_bg'))
      .onSizeChange((oldSize: SizeOptions, size: SizeOptions) => { this.layout = ResponsiveLayout.measure(Number(size.width), Number(size.height)); })
  }
}
