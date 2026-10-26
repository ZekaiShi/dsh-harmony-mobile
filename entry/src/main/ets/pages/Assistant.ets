import { KeyboardAvoidMode } from '@kit.ArkUI';
import { util } from '@kit.ArkTS';
import { common } from '@kit.AbilityKit';
import { pasteboard } from '@kit.BasicServicesKit';
import { AssistantCore, AssistantData, ModelProfile, LocalConversation, LocalMessage, CompletionClient } from '../core/AssistantCore';
import { StreamHandle } from '../core/NativeModels';
import { AssistantStore } from '../platform/AssistantStore';
import { ModelHttp } from '../platform/ModelHttp';
import { MarkdownView } from '../components/MarkdownView';
import { MessageLink } from '../core/MessageLink';
import { ProviderCatalog, ProviderPreset } from '../core/ProviderCatalog';
import { CatalogClient, ProviderModel, ProviderModels } from '../core/ProviderModels';
import { Keyboard } from '../platform/Keyboard';
import { HarmonyExperience } from '../platform/HarmonyExperience';
import { NativeCircleStyle } from '../components/NativeCircleStyle';
import { NativeComposerAction } from '../components/NativeComposerAction';
import { ChatAttachment, ChatFeatures, ContextStat } from '../core/ChatFeatures';
import { ChatFiles } from '../platform/ChatFiles';
import { ChatProtocol } from '../core/ChatProtocol';
import { BackNavigation } from '../core/BackNavigation';
import { NativeBackButton } from '../components/NativeBackButton';
import { NativeTitleAction } from '../components/NativeTitleAction';
import { PageNavigation } from '../platform/PageNavigation';
import { HoldingMotion } from '../platform/HoldingMotion';
import { ComposerToolbar } from '../components/ComposerToolbar';
import { PageBackdrop } from '../components/PageBackdrop';
import { RequestUsage, TokenUsage, UsageEntry } from '../core/TokenUsage';
import { ConversationTitle } from '../core/ConversationTitle';
import { ConversationExport } from '../core/ConversationExport';
import { ConversationFiles } from '../platform/ConversationFiles';
import { ExportOptions } from '../components/ExportOptions';

@Entry
@Component
struct Assistant {
  @StorageLink('chromeTextColor') private chromeTextColor: string = '#30302E';
  @StorageLink('leftControls') @Watch('handChanged') private leftControls: boolean = false;
  @State private screen: string = 'list';
  @State private conversations: LocalConversation[] = [];
  @State private active: LocalConversation = new LocalConversation();
  @State private profile: ModelProfile = new ModelProfile();
  @State private query: string = '';
  @State private draft: string = '';
  @State private keyInput: string = '';
  @State private hasKey: boolean = false;
  @State private busy: boolean = false;
  @State private error: string = '';
  @State private ready: boolean = false;
  @State private revision: number = 0;
  @State private activeTitle: string = '新对话';
  @State private editName: string = '';
  @State private editBase: string = '';
  @State private editModel: string = '';
  @State private editSystem: string = '';
  @State private editProvider: string = 'custom';
  @State private editProtocol: string = 'chat';
  @State private models: ProviderModel[] = [];
  @State private modelQuery: string = '';
  @State private loadingModels: boolean = false;
  @State private catalogNote: string = '';
  @State private modelCategory: string = '全部';
  @State private editWindow: string = '';
  @State private editInput: string[] = [];
  @State private editReasoningOptions: string[] = [];
  @State private attachments: ChatAttachment[] = [];
  @State private picking: boolean = false;
  @State private contextStat: ContextStat = new ContextStat();
  @State private reasoningLevel: string = 'auto';
  private files: ChatFiles = new ChatFiles();
  private attachmentEpoch: number = 0;
  private catalogTask: StreamHandle | undefined;
  private catalogEpoch: number = 0;
  @State private titleInput: string = '';
  @State private naming: boolean = false;
  @State private automaticTitles: boolean = true;
  @State private editUsage: boolean = false;
  @State private exporting: boolean = false;
  private titleTask: StreamHandle | undefined;
  private titleEpoch: number = 0;
  private titleConversation: LocalConversation | undefined;
  @State private thinking: string[] = [];
  private data: AssistantData = new AssistantData();
  private store: AssistantStore = new AssistantStore();
  private client: CompletionClient = new CompletionClient(new ModelHttp());
  private task: StreamHandle | undefined;
  private epoch: number = 0;
  private timer: number = -1;
  private scroller: Scroller = new Scroller();
  private follow: boolean = true;
  private returnScreen: string = 'list';
  private navigation: PageNavigation = new PageNavigation('list');
  @State private composerSide: number = 1;
  @State private composerWidth: number = 0;
  @State private composerLift: number = 0;
  private motionReady: boolean = false;
  private keyStatusEpoch: number = 0;

  private handChanged(): void {
    if (!this.motionReady) return;
    const target = this.leftControls ? 0 : 1;
    if (this.composerSide === target) return;
    HoldingMotion.swap(this.getUIContext(), () => { this.composerSide = target; }, (lift: number) => { this.composerLift = lift; });
  }
  private forward(page: string, fresh: boolean = false): void { this.screen = page; this.navigation.forward(page, fresh); }
  private returnTo(page: string): void { this.screen = page; this.navigation.backward(page); }
  aboutToAppear(): void {
    this.composerSide = this.leftControls ? 0 : 1; this.motionReady = true;
    this.getUIContext().setKeyboardAvoidMode(KeyboardAvoidMode.RESIZE);
    try {
      this.data = this.store.load(this.getUIContext().getHostContext() as common.Context);
      this.files.load(this.getUIContext().getHostContext() as common.Context);
      this.profile = this.data.profile; this.conversations = this.data.conversations.slice(); this.automaticTitles = this.data.autoTitle; this.ready = true;
    } catch (_) { this.error = '本机历史暂时无法读取，原文件已保留。请重启后重试。'; }
  }
  onPageHide(): void { this.attachmentEpoch++; this.cancelCatalog(); this.stop(); this.save(); this.keyInput = ''; }
  aboutToDisappear(): void { this.motionReady = false; this.attachmentEpoch++; this.cancelCatalog(); clearTimeout(this.timer); this.stop(); this.keyInput = ''; }
  private toast(message: string): void { try { this.getUIContext().getPromptAction().showToast({ message: message }); } catch (_) {} }
  private save(): void {
    if (!this.ready) return;
    if (this.active.id) { this.active.draft = this.draft; this.active.draftAttachments = this.attachments.slice(); }
    try { this.store.save(this.data); } catch (_) { this.error = '本机历史暂时未能保存，请复制重要内容后重试。'; }
  }
  private scheduleSave(): void { clearTimeout(this.timer); this.timer = setTimeout(() => { this.save(); }, 500); }
  private changed(): void {
    this.updateContext();
    this.revision++; this.activeTitle = this.active.title; this.conversations = this.data.conversations.slice();
    if (this.follow) setTimeout(() => { try { this.scroller.scrollEdge(Edge.Bottom); } catch (_) {} }, 40);
  }
  private open(conversation: LocalConversation): void {
    this.attachmentEpoch++; this.stop(); this.save(); this.active = conversation; this.draft = conversation.draft; this.attachments = (conversation.draftAttachments || []).slice(); this.reasoningLevel = conversation.profile.reasoningLevel || 'auto'; this.error = ''; this.forward('chat', true); this.follow = true; this.changed();
  }
  private createConversation(): void {
    if (!this.profile.base) { this.settings(); return; }
    if (this.data.conversations.length >= 100) { this.error = '已达到 100 个本机会话，请先复制或删除旧对话。'; return; }
    const conversation = AssistantCore.create(util.generateRandomUUID(true), this.profile, Date.now());
    this.data.conversations.unshift(conversation); this.open(conversation); this.save();
  }
  private settings(): void {
    this.stop(); this.save(); this.returnScreen = this.screen === 'chat' ? 'chat' : 'list';
    this.editProvider = this.profile.provider; this.editProtocol = this.profile.protocol; this.editName = this.profile.name; this.editBase = this.profile.base; this.editModel = this.profile.model; this.editSystem = this.profile.system;
    this.editUsage = this.profile.requestUsage ?? this.profile.provider !== 'custom';
    this.editWindow = this.profile.contextWindow ? String(this.profile.contextWindow) : ''; this.editInput = this.profile.inputModalities || []; this.editReasoningOptions = this.profile.reasoningOptions || [];
    this.keyInput = ''; this.hasKey = false; this.error = ''; this.forward('settings');
    this.refreshKeyStatus();
  }
  private refreshKeyStatus(): void {
    const epoch = ++this.keyStatusEpoch, base = this.editBase;
    this.hasKey = false;
    if (!base) return;
    try {
      const origin = AssistantCore.endpoint(base).origin;
      this.store.key(origin).then((key: string) => {
        if (epoch === this.keyStatusEpoch && this.screen === 'settings' && this.editBase === base) this.hasKey = key.length > 0;
      }).catch(() => {
        if (epoch === this.keyStatusEpoch && this.screen === 'settings' && this.editBase === base) this.error = '系统安全存储暂时无法读取。';
      });
    } catch (_) {}
  }
  private chooseProvider(preset: ProviderPreset): void {
    this.cancelCatalog(); const saved = this.data.profiles.find((item: ModelProfile) => item.provider === preset.id);
    this.editProvider = preset.id; this.editProtocol = saved?.protocol || preset.protocol; this.editBase = saved?.base || preset.base;
    this.editName = saved?.name || preset.name; this.editModel = saved?.model || ''; this.editSystem = saved?.system || '';
    this.editUsage = saved?.requestUsage ?? preset.id !== 'custom';
    this.editWindow = saved?.contextWindow ? String(saved.contextWindow) : ''; this.editInput = saved?.inputModalities || []; this.editReasoningOptions = saved?.reasoningOptions || [];
    this.keyInput = ''; this.hasKey = false; this.models = []; this.error = ''; this.returnTo('settings');
    this.refreshKeyStatus();
  }
  private cancelCatalog(): void { this.catalogEpoch++; this.catalogTask?.close(); this.catalogTask = undefined; this.loadingModels = false; }
  private async fetchModels(): Promise<void> {
    this.cancelCatalog(); const epoch = this.catalogEpoch; this.error = ''; this.catalogNote = ''; this.modelQuery = ''; this.models = []; this.loadingModels = true;
    try {
      const origin = AssistantCore.endpoint(this.editBase).origin;
      const key = this.keyInput.trim() ? AssistantCore.key(this.keyInput) : await this.store.key(origin);
      if (epoch !== this.catalogEpoch) return;
      if (!key) throw new Error('请先填写当前服务的 API Key。');
      if (!ProviderCatalog.get(this.editProvider).discovery) throw new Error(ProviderCatalog.get(this.editProvider).note);
      this.forward('models'); this.modelCategory = '全部';
      this.catalogTask = new CatalogClient(new ModelHttp()).start(this.editProvider, this.editProtocol, this.editBase, key, 'all', {
        done: (models: ProviderModel[], truncated: boolean): void => { if (epoch !== this.catalogEpoch) return; this.models = models; this.loadingModels = false; this.catalogTask = undefined; this.catalogNote = (truncated ? '列表较长，已显示前部分模型。' : '已获取 ' + models.length + ' 个模型。') + ' 列表不代表当前账户已开通全部模型；仍可返回手动填写。'; },
        error: (message: string): void => { if (epoch !== this.catalogEpoch) return; this.loadingModels = false; this.error = message; this.catalogTask = undefined; }
      });
    } catch (error) { if (epoch === this.catalogEpoch) { this.loadingModels = false; this.error = (error as Error).message; } }
  }
  private async configure(): Promise<void> {
    if (this.busy || !this.ready) return;
    this.error = ''; this.busy = true;
    try {
      const candidate = new ModelProfile(); candidate.name = this.editName; candidate.base = this.editBase; candidate.model = this.editModel; candidate.system = this.editSystem; candidate.provider = this.editProvider; candidate.protocol = this.editProtocol;
      candidate.requestUsage = this.editUsage;
      candidate.contextWindow = this.windowValue(); candidate.inputModalities = this.editInput; candidate.reasoningOptions = this.editReasoningOptions;
      const profile = AssistantCore.profile(candidate); const origin = AssistantCore.endpoint(profile.base).origin;
      const key = this.keyInput.trim() ? AssistantCore.key(this.keyInput) : await this.store.key(origin);
      if (!key) throw new Error('请填写此服务的 API Key。更换服务地址时不会沿用其他地址的密钥。');
      await this.store.saveKey(origin, key); this.profile = profile; this.data.profile = profile; this.data.profiles = this.data.profiles.filter((item: ModelProfile) => item.provider !== profile.provider).concat([profile]); this.keyInput = ''; this.hasKey = true; this.save();
      if (!this.error) { this.returnTo(this.returnScreen); this.toast('模型配置已保存'); }
    } catch (error) { this.error = (error as Error).message || '配置未能保存。'; }
    finally { this.busy = false; }
  }
  private async forgetKey(): Promise<void> {
    if (!this.editBase) return;
    try { await this.store.forgetKey(AssistantCore.endpoint(this.editBase).origin); this.hasKey = false; this.keyInput = ''; this.toast('当前服务的 API Key 已删除'); }
    catch (_) { this.error = 'API Key 暂时无法删除，请稍后重试。'; }
  }
  private clearProfile(): void {
    this.getUIContext().showAlertDialog({ title: '清除默认模型配置', message: '已有对话及其模型保持原样。密钥可通过「删除当前服务密钥」单独删除。',
      primaryButton: { value: '取消', action: () => {} }, secondaryButton: { value: '清除配置', action: () => {
        this.data.profiles = this.data.profiles.filter((item: ModelProfile) => item.provider !== this.profile.provider); this.profile = new ModelProfile(); this.data.profile = this.profile; this.keyInput = ''; this.hasKey = false; this.save(); this.returnTo('list');
      } } });
  }
  private async send(regenerate: boolean = false): Promise<void> {
    if (this.busy || !this.active.id || !this.ready) return;
    const text = this.draft.trim(); if (!regenerate && !text && !this.attachments.length) return;
    if (this.active.messages.length >= 398) { this.error = '本对话较长，请新建对话继续。'; return; }
    if (this.active.usageEntries.length >= 1998) { this.error = '本对话请求记录较多，请新建对话继续。'; return; }
    const epoch = ++this.epoch; this.busy = true; this.error = ''; this.follow = true;
    try {
      const key = await this.store.key(AssistantCore.endpoint(this.active.profile.base).origin);
      if (epoch !== this.epoch) return;
      if (!key) throw new Error('此会话的模型服务尚无 API Key，请在模型设置中配置同一服务地址。');
      const pending = new LocalMessage(); pending.id = util.generateRandomUUID(true); pending.text = text; pending.attachments = this.attachments.slice();
      const preview = new LocalConversation(); preview.profile = this.active.profile; preview.messages = this.active.messages.slice();
      if (regenerate && preview.messages[preview.messages.length - 1]?.role === 'assistant') preview.messages.pop();
      else if (!regenerate) preview.messages.push(pending);
      const request = AssistantCore.request(preview, (attachment: ChatAttachment) => this.files.resolve(attachment));
      // Validate native content/effort before moving the draft into history.
      const checkWire = ChatProtocol.wire(this.active.profile, request, key, AssistantCore.endpoint(this.active.profile.base).url);
      if (!checkWire.body) throw new Error('消息为空。');
      if (regenerate) {
        if (this.active.messages[this.active.messages.length - 1]?.role === 'assistant') this.active.messages.pop();
      } else {
        this.active.messages.push(pending); this.draft = ''; this.active.draft = ''; this.attachments = []; this.active.draftAttachments = [];
        if (this.active.title === '新对话') this.active.title = Array.from((text || pending.attachments[0]?.name || '附件对话').replace(/\s+/g, ' ')).slice(0, 24).join('');
      }
      const reply = new LocalMessage(); reply.id = util.generateRandomUUID(true); reply.role = 'assistant'; reply.status = 'streaming'; this.active.messages.push(reply);
      this.recordUsage(this.active, reply.id, 'chat', TokenUsage.estimate(request.messages.map((m) => m.content).join('\n'), ''));
      this.active.updatedAt = Date.now(); this.changed(); this.save();
      this.task = this.client.start(this.active.profile, key, request, {
        usage: (value: RequestUsage): void => { if (epoch === this.epoch) { reply.usage = value; this.recordUsage(this.active, reply.id, 'chat', value); } },
        update: (content: string, reasoning: string): void => {
          if (epoch !== this.epoch) return;
          reply.text = content; reply.reasoning = reasoning; this.changed(); this.scheduleSave();
        },
        done: (reason: string): void => {
          if (epoch !== this.epoch) return;
          reply.status = 'done'; this.busy = false; this.task = undefined;
          if (reason === 'length') this.error = '回复达到服务端长度上限，可继续追问。';
          this.active.updatedAt = Date.now(); this.changed(); this.save();
          if (reason !== 'length') void this.nameConversation(false);
        },
        error: (message: string): void => {
          if (epoch !== this.epoch) return;
          reply.status = 'error'; this.busy = false; this.task = undefined; this.error = message; this.changed(); this.save();
        }
      });
    } catch (error) { if (epoch === this.epoch) { this.busy = false; this.error = (error as Error).message || '请求未完成。'; this.changed(); this.save(); } }
  }
  private stop(): void {
    this.cancelTitle();
    this.epoch++; this.task?.close(); this.task = undefined;
    if (this.busy && this.active.id) {
      const last = this.active.messages[this.active.messages.length - 1];
      if (last?.status === 'streaming') last.status = 'interrupted';
    }
    this.busy = false; this.changed(); this.save();
  }
  private recordUsage(conversation: LocalConversation, id: string, kind: string, usage: RequestUsage): void {
    let entry = conversation.usageEntries.find((item: UsageEntry) => item.id === id);
    if (!entry) { entry = new UsageEntry(); entry.id = id; entry.kind = kind; entry.model = conversation.profile.model; conversation.usageEntries.push(entry); }
    entry.usage = usage;
  }
  private cancelTitle(): void {
    this.titleEpoch++; this.titleTask?.close(); this.titleTask = undefined;
    if (this.titleConversation?.titleState === 'running') this.titleConversation.titleState = 'failed';
    this.titleConversation = undefined; this.naming = false;
  }
  private async nameConversation(manual: boolean): Promise<void> {
    const conversation = this.active;
    if (this.naming || this.busy || !conversation.id || conversation.usageEntries.length >= 1998) return;
    if (!manual && (this.screen === 'rename' || !ConversationTitle.eligible(conversation, this.data.autoTitle))) return;
    const epoch = ++this.titleEpoch, original = conversation.title, id = util.generateRandomUUID(true);
    let title = '';
    try {
      const request = ConversationTitle.request(conversation), profile = ConversationTitle.profile(conversation.profile);
      conversation.titleState = 'running'; this.naming = true; this.titleConversation = conversation; this.save();
      const key = await this.store.key(AssistantCore.endpoint(profile.base).origin);
      if (epoch !== this.titleEpoch) return;
      if (!key) throw new Error('未配置密钥');
      this.recordUsage(conversation, id, 'title', TokenUsage.estimate(request.messages.map((m) => m.content).join('\n'), ''));
      this.titleTask = this.client.start(profile, key, request, {
        usage: (value: RequestUsage): void => { if (epoch === this.titleEpoch) this.recordUsage(conversation, id, 'title', value); },
        update: (text: string): void => { if (epoch === this.titleEpoch) title = text; },
        done: (): void => {
          if (epoch !== this.titleEpoch) return;
          this.naming = false; this.titleTask = undefined; this.titleConversation = undefined;
          try {
            const proposed = ConversationTitle.clean(title);
            if (manual && this.screen === 'rename') this.titleInput = proposed;
            else if (conversation.title === original && (manual || conversation.titleSource !== 'manual')) { conversation.title = proposed; conversation.titleSource = 'ai'; }
            conversation.titleState = 'done'; conversation.updatedAt = Date.now();
          } catch (_) { conversation.titleState = 'failed'; this.toast('AI 命名未完成，已保留原名称'); }
          this.changed(); this.save();
        },
        error: (): void => { if (epoch === this.titleEpoch) { this.naming = false; this.titleTask = undefined; this.titleConversation = undefined; conversation.titleState = 'failed'; this.changed(); this.save(); this.toast('AI 命名未完成，已保留原名称'); } }
      });
    } catch (_) { if (epoch === this.titleEpoch) { conversation.titleState = 'failed'; this.naming = false; this.titleConversation = undefined; this.save(); if (manual) this.toast('请先完成一轮对话，并配置该服务的密钥'); } }
  }
  private usageDetails(): void {
    Keyboard.dismiss(this.getUIContext());
    this.getUIContext().showAlertDialog({ title: '会话 Token 统计', message: TokenUsage.summary(this.active.usageEntries), primaryButton: { value: '知道了', action: () => {} } });
  }
  @Builder private exportOptions() {
    ExportOptions((format: string): void => { Keyboard.dismiss(this.getUIContext()); void this.exportConversation(format); })
  }
  private async exportConversation(format: string): Promise<void> {
    if (this.exporting) return; this.exporting = true;
    try {
      const document = ConversationExport.assistant(this.active), count = await ConversationFiles.export(this.getUIContext().getHostContext() as common.Context, document, format);
      if (count) this.toast('已导出 ' + count + ' 个文件');
    } catch (error) { this.toast((error as Error).message || '导出未完成，请重试'); }
    finally { this.exporting = false; }
  }
  private back(): void {
    Keyboard.dismiss(this.getUIContext());
    if (this.screen === 'settings' && this.busy) return;
    const target = BackNavigation.target('assistant', this.screen, this.returnScreen);
    if (this.screen === 'providers' || this.screen === 'models') this.cancelCatalog();
    if (this.screen === 'settings') this.keyInput = '';
    if (this.screen === 'rename') this.cancelTitle();
    if (this.screen === 'chat') { this.attachmentEpoch++; this.stop(); this.save(); }
    this.error = '';
    if (target === 'home') { this.save(); this.getUIContext().getRouter().back(); }
    else this.returnTo(target);
  }
  onBackPress(): boolean { this.back(); return true; }
  private remove(conversation: LocalConversation): void {
    this.getUIContext().showAlertDialog({ title: '删除本机对话', message: '删除「' + conversation.title + '」及本机草稿？',
      primaryButton: { value: '取消', action: () => {} }, secondaryButton: { value: '删除', action: () => {
        if (this.active.id === conversation.id) { this.attachmentEpoch++; this.stop(); this.active = new LocalConversation(); this.draft = ''; this.attachments = []; this.returnTo('list'); }
        this.data.conversations = this.data.conversations.filter((item: LocalConversation) => item.id !== conversation.id); this.changed(); this.save();
        if (!this.error) { try { this.files.prune(this.data); } catch (_) {} }
      } } });
  }
  private copy(text: string): void { pasteboard.getSystemPasteboard().setData(pasteboard.createData(pasteboard.MIMETYPE_TEXT_PLAIN, text)).then(() => { this.toast('已复制'); }).catch(() => { this.toast('复制失败'); }); }
  private async openLink(href: string): Promise<void> {
    const target = MessageLink.parse(href);
    if (target.kind !== 'web') { this.toast('此引用不是手机可直接打开的网页'); return; }
    try { await (this.getUIContext().getHostContext() as common.UIAbilityContext).startAbility({ action: 'ohos.want.action.viewData', uri: target.href, entities: ['entity.system.browsable'] }); }
    catch (_) { this.toast('无法打开浏览器'); }
  }
  private updateContext(): void { this.contextStat = ChatFeatures.context(this.active, this.draft, this.attachments); }
  private windowValue(): number {
    if (!this.editWindow.trim()) return 0;
    if (!/^\d{1,8}$/.test(this.editWindow.trim())) throw new Error('上下文窗口需填写整数 token 数，留空表示未知。');
    const value = Number(this.editWindow);
    if (value < 1 || value > 10000000) throw new Error('上下文窗口需在 1 到 10000000 之间。');
    return value;
  }
  private contextDetails(): void {
    Keyboard.dismiss(this.getUIContext()); this.updateContext();
    this.getUIContext().showAlertDialog({ title: '上下文 · 估算',
      message: '下一次请求约 ' + this.contextStat.tokens + ' token' + (this.contextStat.window ? ' / ' + this.contextStat.window : '；模型窗口大小未知') + '。\n计算系统指令、最近 40 条有效消息、草稿与附件。文字按字符估算；图片与 PDF 的误差较大，不代表账单或服务端精确用量。',
      primaryButton: { value: '知道了', action: () => {} }, secondaryButton: { value: '设置窗口大小', action: () => { this.editWindow = this.active.profile.contextWindow ? String(this.active.profile.contextWindow) : ''; this.forward('context'); } } });
  }
  private reasoningMenu(): void {
    const levels = ChatFeatures.levels(this.active.profile);
    if (levels.length < 2) { this.toast('此模型尚无已确认的等级参数，使用服务端默认思考设置。'); return; }
    Keyboard.dismiss(this.getUIContext());
    const conversationId = this.active.id;
    this.getUIContext().showActionSheet({ title: '思考等级', message: '下一次请求生效；默认不覆盖服务端参数',
      sheets: levels.map((value: string): SheetInfo => ({ title: ChatFeatures.levelLabel(value) + (this.reasoningLevel === value ? '  ✓' : ''), action: () => {
        if (this.busy || this.active.id !== conversationId) return;
        this.active.profile.reasoningLevel = value; this.reasoningLevel = value; this.save();
      } })) });
  }
  @Builder private attachmentOptions() {
    Menu() {
      MenuItem({ startIcon: $r('app.media.ic_attach_image'), content: '图片' }).id('assistant-attach-image').onClick(() => { Keyboard.dismiss(this.getUIContext()); void this.pickAttachment(true); })
      MenuItem({ startIcon: $r('app.media.ic_attach_file'), content: '文件' }).id('assistant-attach-file').onClick(() => { Keyboard.dismiss(this.getUIContext()); void this.pickAttachment(false); })
    }
  }
  private async pickAttachment(photo: boolean): Promise<void> {
    if (this.attachments.length >= 4) { this.toast('每条消息最多添加 4 个附件'); return; }
    const conversationId = this.active.id, epoch = ++this.attachmentEpoch;
    this.picking = true; this.error = '';
    try {
      const ref = await this.files.select(this.getUIContext().getHostContext() as common.Context, photo);
      if (!ref || this.active.id !== conversationId || epoch !== this.attachmentEpoch || this.busy) return;
      if (ref.kind === 'image' && this.active.profile.inputModalities?.length && !this.active.profile.inputModalities.includes('image')) throw new Error('模型目录未标注图片输入，请换用视觉或多模态模型。');
      if (ref.kind === 'pdf' && this.active.profile.protocol === 'chat') throw new Error('此接口暂不支持 PDF。请添加 UTF-8 文本，或新建使用 Responses / Claude / Gemini 原生协议的对话。');
      this.attachments = this.attachments.concat([ref]); this.active.draftAttachments = this.attachments.slice(); this.updateContext(); this.save();
    } catch (error) { if (epoch === this.attachmentEpoch) this.error = (error as Error).message || '附件读取失败。'; }
    finally { this.picking = false; }
  }
  private removeAttachment(ref: ChatAttachment): void {
    this.attachments = this.attachments.filter((a: ChatAttachment) => a.file !== ref.file); this.updateContext(); this.save();
    if (!this.error) { try { this.files.prune(this.data); } catch (_) {} }
  }
  @Builder private banner() {
    if (this.error) Text(this.error).fontSize(13).lineHeight(21).fontColor($r('app.color.danger')).padding({ left: 22, right: 22, top: 8, bottom: 8 }).width('100%')
  }
  @Builder private header(page: string) {
    Row({ space: 10 }) {
      NativeBackButton({ controlId: 'assistant-back', onBack: () => this.back() })
      Column({ space: 3 }) {
        Text(page === 'rename' ? '重命名' : page === 'context' ? '上下文窗口' : page === 'chat' ? this.activeTitle : page === 'providers' ? '选择服务商' : page === 'models' ? '选择模型' : page === 'settings' ? '模型设置' : page === 'privacy' ? '数据与隐私' : '独立 AI 聊天').fontSize(17).fontWeight(FontWeight.Medium).fontColor($r('app.color.text_primary')).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis })
        Text(page === 'rename' ? '编辑后保存' : page === 'chat' ? this.busy ? '正在回复…' : this.active.profile.model : '手机直连模型服务').fontSize(11).fontColor($r('app.color.text_secondary')).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis })
      }.alignItems(HorizontalAlign.Start).layoutWeight(1)
      if (page === 'chat' || page === 'list') {
        NativeTitleAction({ symbol: $r('sys.symbol.gearshape'), controlId: 'assistant-settings', label: '模型设置', onAction: () => this.settings() })
        NativeTitleAction({ symbol: $r('sys.symbol.square_and_pencil'), controlId: 'assistant-new', label: '新建独立对话', available: this.ready && !this.busy, onAction: () => this.createConversation() })
      } else if (page === 'rename') {
        NativeTitleAction({ symbol: $r('sys.symbol.lightbulb'), controlId: 'assistant-ai-title', label: 'AI 命名', pending: this.naming,
          available: !this.busy && this.active.messages.some((m: LocalMessage) => m.role === 'assistant' && m.status === 'done' && !!m.text), onAction: () => { void this.nameConversation(true); } })
        NativeTitleAction({ symbol: $r('sys.symbol.checkmark'), controlId: 'assistant-save-title', label: '保存名称',
          available: !!this.titleInput.trim() && !this.naming, onAction: () => this.saveTitle() })
      }
    }.padding({ left: 8, right: 12 }).height(60).width('100%')
  }
  @Builder private history() {
    Column({ space: 0 }) {
      this.banner()
      if (!this.profile.base) {
        Column({ space: 16 }) {
          SymbolGlyph($r('sys.symbol.ellipsis_message')).fontSize(42).fontColor([$r('app.color.accent')])
          Text('不连电脑，也能开始。').fontSize(25).fontWeight(FontWeight.Medium).fontColor($r('app.color.text_primary'))
          Text('配置你自己的模型 API，直接在手机聊天。会话和草稿保存在本机，随时可以查阅与删除。').fontSize(14).lineHeight(24).fontColor($r('app.color.text_secondary')).textAlign(TextAlign.Center)
          Button('配置模型', { type: ButtonType.Normal }).height(46).borderRadius(23).backgroundColor($r('app.color.ink')).fontColor($r('app.color.on_ink')).enabled(this.ready).onClick(() => this.settings())
        }.padding(28).width('100%')
      } else {
        Row() {
          Text(this.profile.name + ' · ' + this.profile.model).fontSize(13).fontColor($r('app.color.text_secondary')).layoutWeight(1).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis })
          Button('新对话', { type: ButtonType.Normal }).height(40).borderRadius(20).backgroundColor($r('app.color.ink')).fontColor($r('app.color.on_ink')).onClick(() => this.createConversation()).enabled(this.ready)
        }.padding({ left: 22, right: 22, top: 12, bottom: 12 })
      }
      TextInput({ text: this.query, placeholder: '搜索本机会话与正文' }).fontSize(14).height(42).backgroundColor($r('app.color.accent_soft')).fontColor($r('app.color.text_primary')).margin({ left: 20, right: 20, bottom: 10 }).id('assistant-search').onChange((text: string) => { this.query = text; })
      List({ space: 0 }) {
        ForEach(AssistantCore.search(this.conversations, this.query), (conversation: LocalConversation) => {
          ListItem() {
            Row({ space: 12 }) {
              Column({ space: 6 }) {
                Text(conversation.title).fontSize(16).fontColor($r('app.color.text_primary')).maxLines(2).textOverflow({ overflow: TextOverflow.Ellipsis })
                Text(conversation.profile.model + (conversation.draft ? ' · 有草稿' : ' · ' + conversation.messages.length + ' 条消息')).fontSize(11).fontColor($r('app.color.text_secondary'))
              }.layoutWeight(1).alignItems(HorizontalAlign.Start).id('assistant-conversation-' + conversation.id).onClick(() => this.open(conversation))
              Button({ type: ButtonType.Circle }) { SymbolGlyph($r('sys.symbol.trash')).fontSize(17).fontColor([$r('app.color.text_secondary')]) }
                .attributeModifier(new NativeCircleStyle(44)).id('delete-conversation-' + conversation.id).accessibilityText('删除 ' + conversation.title).onClick(() => this.remove(conversation))
            }.padding({ top: 17, bottom: 17 }).border({ width: { bottom: 0.5 }, color: $r('app.color.line') }).width('100%')
          }
        }, (conversation: LocalConversation) => conversation.id + ':' + conversation.updatedAt + ':' + this.revision)
        if (this.conversations.length === 0 && this.profile.base) ListItem() { Text('点「新对话」开始。已保存的会话在断网时也能阅读。').fontSize(14).lineHeight(23).fontColor($r('app.color.text_secondary')).padding({ top: 40, bottom: 20 }).width('100%') }
      }.padding({ left: 22, right: 22 }).layoutWeight(1).width('100%').scrollBar(BarState.Off)
      Button('数据与隐私', { type: ButtonType.Normal }).height(44).fontSize(12).backgroundColor(Color.Transparent).fontColor($r('app.color.text_secondary')).onClick(() => { this.forward('privacy'); })
    }.width('100%').height('100%')
  }
  @Builder private providersPage() {
    Column() {
      List({ space: 0 }) {
        ForEach(ProviderCatalog.all(), (preset: ProviderPreset) => {
          ListItem() {
            Column({ space: 6 }) {
              Text(preset.name).fontSize(17).fontColor($r('app.color.text_primary')).width('100%')
              Text(ProviderCatalog.protocolLabel(preset.protocol) + (this.data.profiles.some((item: ModelProfile) => item.provider === preset.id) ? ' · 已配置' : '')).fontSize(12).fontColor($r('app.color.text_secondary')).width('100%')
            }.width('100%').padding({ top: 18, bottom: 18 }).border({ width: { bottom: 0.5 }, color: $r('app.color.line') }).id('provider-' + preset.id).onClick(() => this.chooseProvider(preset))
          }
        }, (preset: ProviderPreset) => preset.id)
      }.layoutWeight(1).width('100%').padding({ left: 24, right: 24 })
    }.width('100%').height('100%')
  }
  @Builder private modelsPage() {
    Column({ space: 10 }) {
      TextInput({ text: this.modelQuery, placeholder: '搜索模型名称或 ID' }).height(44).fontSize(14).width('90%').id('model-search').onChange((value: string) => { this.modelQuery = value; })
      Scroll() {
        Row({ space: 8 }) {
          ForEach(ProviderModels.categories(), (category: string) => {
            Button(category, { type: ButtonType.Capsule }).height(32).fontSize(12).padding({ left: 14, right: 14 })
              .backgroundColor(this.modelCategory === category ? $r('app.color.ink') : $r('app.color.accent_soft'))
              .fontColor(this.modelCategory === category ? $r('app.color.on_ink') : $r('app.color.text_secondary'))
              .id('model-category-' + category).onClick(() => { this.modelCategory = category; })
          }, (category: string) => category)
        }.padding({ left: 22, right: 22 })
      }.scrollable(ScrollDirection.Horizontal).scrollBar(BarState.Off).width('100%').height(38)
      if (this.loadingModels) { LoadingProgress().height(28).width(28); Text('正在获取模型目录…').fontSize(13).fontColor($r('app.color.text_secondary')) }
      if (this.catalogNote) Text(this.catalogNote).fontSize(12).lineHeight(20).width('88%').fontColor($r('app.color.text_secondary'))
      this.banner()
      List({ space: 0 }) {
        ForEach(ProviderModels.search(this.models, this.modelQuery, this.modelCategory), (model: ProviderModel) => {
          ListItem() {
            Column({ space: 5 }) {
              Text(model.name).fontSize(15).fontColor($r('app.color.text_primary')).width('100%')
              Text(model.id).fontSize(11).fontColor($r('app.color.text_secondary')).width('100%')
              Text(model.categories.join(' · ') + (model.inferred ? ' · 名称推断' : '') + (model.contextWindow ? ' · ' + model.contextWindow + ' token' : '')).fontSize(11).fontColor($r('app.color.text_secondary')).width('100%')
              if (model.input.length || model.output.length) Text('输入 ' + model.input.join(' / ') + ' → 输出 ' + model.output.join(' / ')).fontSize(10).fontColor($r('app.color.text_secondary')).width('100%')
            }.padding({ top: 14, bottom: 14 }).width('100%').border({ width: { bottom: 0.5 }, color: $r('app.color.line') }).id('catalog-' + model.id).onClick(() => {
              if (!ProviderModels.chatCompatible(model)) { this.toast(model.categories.includes('生图') ? '此模型用于图像接口，请在主页「图像工作室」配置。' : '已列出模型类型；当前聊天入口暂不调用语音或嵌入接口。'); return; }
              this.editModel = model.id; this.editWindow = model.contextWindow ? String(model.contextWindow) : ''; this.editInput = model.input.slice(); this.editReasoningOptions = model.reasoningOptions.slice(); this.cancelCatalog(); this.returnTo('settings'); this.error = '';
            })
          }
        }, (model: ProviderModel) => model.id)
      }.layoutWeight(1).width('100%').padding({ left: 24, right: 24 })
    }.width('100%').height('100%')
  }
  @Builder private settingsPage() {
    Column({ space: 0 }) {
      Scroll() {
        Column({ space: 10 }) {
          Text('添加你信任的模型服务').fontSize(23).fontWeight(FontWeight.Medium).fontColor($r('app.color.text_primary')).width('100%').margin({ bottom: 10 })
          Text('选择服务商，填写密钥并获取模型。支持四种原生协议；请求直连当前地址，保存配置不发送推理请求。').fontSize(13).lineHeight(22).fontColor($r('app.color.text_secondary')).width('100%')
          Button(ProviderCatalog.get(this.editProvider).name + '  ›', { type: ButtonType.Normal }).width('100%').height(48).fontSize(16).backgroundColor($r('app.color.accent_soft')).fontColor($r('app.color.text_primary')).borderRadius(14).id('model-provider').onClick(() => { this.forward('providers'); this.error = ''; })
          Flex({ wrap: FlexWrap.Wrap, justifyContent: FlexAlign.SpaceBetween }) {
              ForEach(ProviderCatalog.protocols(), (protocol: string) => {
                Button(ProviderCatalog.protocolLabel(protocol), { type: ButtonType.Normal }).height(36).fontSize(11).width('48%').margin({ bottom: 8 }).borderRadius(18).backgroundColor(this.editProtocol === protocol ? $r('app.color.ink') : $r('app.color.accent_soft')).fontColor(this.editProtocol === protocol ? $r('app.color.on_ink') : $r('app.color.text_primary')).id('model-protocol-' + protocol).onClick(() => { this.editProtocol = protocol; this.models = []; })
              }, (protocol: string) => protocol + ':' + this.editProtocol)
          }.width('100%')
          if (ProviderCatalog.get(this.editProvider).note) Text(ProviderCatalog.get(this.editProvider).note).fontSize(12).lineHeight(20).fontColor($r('app.color.text_secondary')).width('100%')
          Text('服务名称').fontSize(12).fontColor($r('app.color.text_secondary')).width('100%').margin({ top: 12 })
          TextInput({ text: this.editName, placeholder: '例如：我的模型服务' }).height(44).fontSize(15).maxLength(40).id('model-name').onChange((value: string) => { this.editName = value; })
          Text('API 基础地址').fontSize(12).fontColor($r('app.color.text_secondary')).width('100%')
          TextInput({ text: this.editBase, placeholder: 'https://api.example.com/v1' }).height(44).fontSize(14).maxLength(2048).id('model-base').onChange((value: string) => {
            if (value === this.editBase) return;
            this.editBase = value; this.models = []; this.refreshKeyStatus();
          })
          Text('模型 ID').fontSize(12).fontColor($r('app.color.text_secondary')).width('100%')
          TextInput({ text: this.editModel, placeholder: '填写服务商提供的模型 ID' }).height(44).fontSize(15).maxLength(200).id('model-id').onChange((value: string) => { if (this.editModel !== value) { this.editModel = value; this.editWindow = ''; this.editInput = []; this.editReasoningOptions = []; } })
          Text('API Key').fontSize(12).fontColor($r('app.color.text_secondary')).width('100%')
          TextInput({ text: this.keyInput, placeholder: this.hasKey ? '已保存在系统安全存储，留空保留' : '仅保存到本机系统安全存储' }).type(InputType.Password).showPasswordIcon(false).height(44).fontSize(14).maxLength(1024).id('model-key').onChange((value: string) => { this.keyInput = value; })
          Button('获取模型列表 / 选择模型', { type: ButtonType.Normal }).height(42).width('100%').fontSize(13).backgroundColor($r('app.color.accent_soft')).fontColor($r('app.color.text_primary')).borderRadius(21).id('model-fetch').enabled(!this.busy).onClick(() => { void this.fetchModels(); })
          Text('上下文窗口 token 数（选填，优先读取目录）').fontSize(12).fontColor($r('app.color.text_secondary')).width('100%')
          TextInput({ text: this.editWindow, placeholder: '未知时留空，例如 128000' }).type(InputType.Number).maxLength(8).height(44).fontSize(14).id('model-context-window').onChange((value: string) => { this.editWindow = value; })
          Text('系统指令（选填）').fontSize(12).fontColor($r('app.color.text_secondary')).width('100%')
          if (this.editProtocol === 'chat') Row({ space: 12 }) {
            Text('请求服务端 Token 用量').fontSize(13).fontColor($r('app.color.text_primary')).layoutWeight(1)
            Toggle({ type: ToggleType.Switch, isOn: this.editUsage }).id('model-request-usage').onChange((value: boolean) => { this.editUsage = value; })
          }.width('100%')
          Text('首次完整回复后，额外调用当前模型生成一次标题，可能计费；可随时关闭。旧会话和手动标题不会自动覆盖。').fontSize(12).lineHeight(20).fontColor($r('app.color.text_secondary')).width('100%')
          Row({ space: 12 }) {
            Text('新会话自动 AI 命名').fontSize(13).fontColor($r('app.color.text_primary')).layoutWeight(1)
            Toggle({ type: ToggleType.Switch, isOn: this.automaticTitles }).id('assistant-auto-title').onChange((value: boolean) => { this.automaticTitles = value; this.data.autoTitle = value; if (!value) this.cancelTitle(); this.save(); })
          }.width('100%')
          TextArea({ text: this.editSystem, placeholder: '例如：使用中文，先给结论，再说明依据。' }).height(86).fontSize(14).maxLength(8000).id('model-system').onChange((value: string) => { this.editSystem = value; })
          Text('新配置用于新对话；已有对话保留原来的服务和模型。每次发送最近 40 条有效消息与系统指令。').fontSize(12).lineHeight(20).fontColor($r('app.color.text_secondary')).width('100%')
          this.banner()
          Button(this.busy ? '保存中…' : '保存模型配置', { type: ButtonType.Normal }).height(48).width('100%').borderRadius(24).backgroundColor($r('app.color.ink')).fontColor($r('app.color.on_ink')).enabled(!this.busy && this.ready).onClick(() => { void this.configure(); })
          if (this.hasKey) Button('删除当前服务密钥', { type: ButtonType.Normal }).height(44).fontSize(13).backgroundColor(Color.Transparent).fontColor($r('app.color.danger')).enabled(!this.busy).onClick(() => { void this.forgetKey(); })
          if (this.profile.base) Button('清除默认配置', { type: ButtonType.Normal }).height(44).fontSize(13).backgroundColor(Color.Transparent).fontColor($r('app.color.text_secondary')).enabled(!this.busy).onClick(() => this.clearProfile())
        }.padding({ left: 24, right: 24, top: 18, bottom: 24 }).width('100%')
      }.layoutWeight(1).width('100%').scrollBar(BarState.Off)
    }.width('100%').height('100%')
  }
  @Builder private chat() {
    Column({ space: 0 }) {
      Row({ space: 4 }) {
        Button('重命名', { type: ButtonType.Normal }).layoutWeight(1).padding({ left: 8, right: 8 }).height(32).fontSize(11).backgroundColor(Color.Transparent).fontColor($r('app.color.text_secondary')).id('assistant-rename').onClick(() => this.openRename())
        Button('复制会话', { type: ButtonType.Normal }).layoutWeight(1).padding({ left: 8, right: 8 }).height(32).fontSize(11).backgroundColor(Color.Transparent).fontColor($r('app.color.text_secondary')).id('assistant-copy-conversation').onClick(() => this.copy(AssistantCore.transcript(this.active)))
        Button('Token', { type: ButtonType.Normal }).layoutWeight(1).padding({ left: 8, right: 8 }).height(32).fontSize(11).backgroundColor(Color.Transparent).fontColor($r('app.color.text_secondary')).id('assistant-usage').onClick(() => this.usageDetails())
        Button(this.exporting ? '导出中…' : '导出', { type: ButtonType.Normal }).layoutWeight(1).padding({ left: 8, right: 8 }).height(32).fontSize(11).backgroundColor(Color.Transparent).fontColor($r('app.color.text_secondary')).id('assistant-export').enabled(!this.exporting && this.active.messages.length > 0).bindMenu(this.exportOptions)
      }.padding({ left: 15, right: 23 }).width('100%')
      this.banner()
      List({ scroller: this.scroller, space: 24 }) {
        if (!this.active.messages.length) ListItem() {
          Column({ space: 13 }) {
            SymbolGlyph($r('sys.symbol.ellipsis_message')).fontSize(38).fontColor([$r('app.color.accent')])
            Text('有什么想一起完成的？').fontSize(24).fontColor($r('app.color.text_primary'))
            Text(this.active.profile.name + ' · ' + this.active.profile.model).fontSize(12).fontColor($r('app.color.text_secondary'))
          }.width('100%').padding({ top: 70, bottom: 30 })
        }
        ForEach(this.active.messages, (message: LocalMessage) => {
          ListItem() {
            Column({ space: 8 }) {
              if (message.role === 'user') {
                ForEach(message.attachments || [], (ref: ChatAttachment) => {
                  if (ref.kind === 'image') Image(this.files.uri(ref)).width(172).height(128).objectFit(ImageFit.Cover).borderRadius(14).accessibilityText(ref.name)
                  else Row({ space: 7 }) {
                    SymbolGlyph($r('sys.symbol.doc_text')).fontSize(18).fontColor([$r('app.color.text_secondary')])
                    Text(ref.name).fontSize(12).maxLines(2).fontColor($r('app.color.text_primary'))
                  }.padding(12).constraintSize({ maxWidth: '92%' }).borderRadius(14).backgroundColor($r('app.color.accent_soft'))
                }, (ref: ChatAttachment) => ref.file)
                if (message.text) Text(message.text).fontSize(15).lineHeight(25).fontColor($r('app.color.text_primary')).copyOption(CopyOptions.LocalDevice).padding(14).constraintSize({ maxWidth: '92%' }).borderRadius(20).backgroundColor($r('app.color.accent_soft'))
              }
              else {
                if (message.reasoning) {
                  Row({ space: 7 }) {
                    SymbolGlyph($r('sys.symbol.lightbulb')).fontSize(15).fontColor([$r('app.color.text_secondary')])
                    Text('思考过程').fontSize(12).fontColor($r('app.color.text_secondary'))
                    SymbolGlyph($r('sys.symbol.chevron_right')).fontSize(10).rotate({ angle: this.thinking.includes(message.id) ? 90 : 0 }).fontColor([$r('app.color.text_secondary')])
                  }.height(34).width('100%').onClick(() => { this.thinking = this.thinking.includes(message.id) ? this.thinking.filter((id: string) => id !== message.id) : this.thinking.concat([message.id]); })
                  if (this.thinking.includes(message.id)) Text(message.reasoning).fontSize(12).lineHeight(21).fontColor($r('app.color.text_secondary')).copyOption(CopyOptions.LocalDevice).width('100%')
                }
                if (message.text) MarkdownView({ content: message.text, onLink: (href: string) => { void this.openLink(href); } })
                else Text(message.status === 'streaming' ? '正在等待模型回复…' : message.status === 'interrupted' ? '已停止接收' : '未收到回复').fontSize(13).fontColor($r('app.color.text_secondary')).width('100%')
                if (message.status !== 'streaming') {
                  Row({ space: 6 }) {
                    if (message.text) Button({ type: ButtonType.Normal }) { SymbolGlyph($r('sys.symbol.doc_text_on_doc_text')).fontSize(16).fontColor([$r('app.color.text_secondary')]) }
                      .width(36).height(36).backgroundColor(Color.Transparent).id('assistant-copy-' + message.id).accessibilityText('复制这条回复').onClick(() => this.copy(message.text))
                    if (message.usage) Text(TokenUsage.label(message.usage)).fontSize(10).fontColor($r('app.color.text_secondary')).onClick(() => this.usageDetails())
                    if (message.status === 'error' || message.status === 'interrupted') Text(message.status === 'error' ? '请求未完成' : '已停止').fontSize(11).fontColor($r('app.color.text_secondary'))
                    if (message.id === this.active.messages[this.active.messages.length - 1]?.id && !this.busy) Button('重新生成', { type: ButtonType.Normal }).height(36).fontSize(11).backgroundColor(Color.Transparent).fontColor($r('app.color.text_secondary')).onClick(() => { void this.send(true); })
                  }.width('100%')
                }
              }
            }.width('100%').alignItems(message.role === 'user' ? HorizontalAlign.End : HorizontalAlign.Start)
          }
        }, (message: LocalMessage) => message.id + ':' + this.revision)
      }.layoutWeight(1).width('100%').padding({ left: 24, right: 24, top: 20, bottom: 12 }).scrollBar(BarState.Off)
        .id('assistant-messages').onTouch((event: TouchEvent) => { if (event.type === TouchType.Down) Keyboard.dismiss(this.getUIContext()); })
        .onDidScroll((offset: number, state: ScrollState) => { if (state !== ScrollState.Idle) this.follow = this.scroller.isAtEnd(); })
      Column() {
      Stack({ alignContent: Alignment.BottomStart }) {
        Button({ type: ButtonType.Circle }) { SymbolGlyph($r('sys.symbol.plus')).fontSize(21).fontColor([$r('app.color.text_primary')]) }
          .attributeModifier(new NativeCircleStyle(40)).backgroundColor($r('app.color.accent_soft')).margin({ bottom: 10 }).zIndex(2).translate({ x: Math.max(0, this.composerWidth - 40) * this.composerSide }).offset({ y: this.composerLift }).visibility(this.composerWidth > 0 ? Visibility.Visible : Visibility.Hidden)
          .id('assistant-attach').accessibilityText('添加图片或文件').enabled(!this.busy && !this.picking).bindMenu(this.attachmentOptions)
        Column({ space: 2 }) {
          if (this.attachments.length) Scroll() {
            Row({ space: 8 }) {
              ForEach(this.attachments, (ref: ChatAttachment) => {
                Row({ space: 5 }) {
                  if (ref.kind === 'image') Image(this.files.uri(ref)).width(30).height(30).objectFit(ImageFit.Cover).borderRadius(6)
                  else SymbolGlyph($r('sys.symbol.doc_text')).fontSize(18).fontColor([$r('app.color.text_secondary')])
                  Text(ref.name).fontSize(11).fontColor($r('app.color.text_primary')).maxLines(1).constraintSize({ maxWidth: 85 }).textOverflow({ overflow: TextOverflow.Ellipsis })
                  Button({ type: ButtonType.Circle }) { SymbolGlyph($r('sys.symbol.xmark')).fontSize(10).fontColor([$r('app.color.text_secondary')]) }
                    .width(28).height(28).backgroundColor(Color.Transparent).accessibilityText('移除 ' + ref.name).enabled(!this.busy).onClick(() => this.removeAttachment(ref))
                }.height(38).padding({ left: 6, right: 2 }).borderRadius(10).backgroundColor($r('app.color.accent_soft'))
              }, (ref: ChatAttachment) => ref.file)
            }.padding({ left: 12, right: 12, top: 10 })
          }.width('100%').scrollable(ScrollDirection.Horizontal).scrollBar(BarState.Off)
        TextArea({ text: this.draft, placeholder: this.picking ? '正在添加附件…' : '发消息…' }).height(62).maxLength(16000).fontSize(16).padding({ left: 17, right: 17, top: 15, bottom: 4 }).backgroundColor(Color.Transparent).id('assistant-draft').onChange((text: string) => { this.draft = text; this.active.draft = text; this.updateContext(); this.scheduleSave(); })
          ComposerToolbar({ side: this.composerSide,
            details: (): void => { this.composerDetails(); }, action: (): void => { this.composerAction(); } })
        }.width('calc(100% - 50vp)').direction(Direction.Ltr).translate({ x: 50 * (1 - this.composerSide) }).backgroundColor($r('app.color.surface')).border({ width: 0.7, color: $r('app.color.line') }).borderRadius(24)
      }.width('100%').onAreaChange((oldArea: Area, newArea: Area) => { const width = Number.parseFloat(String(newArea.width)); if (Number.isFinite(width) && width !== this.composerWidth) this.composerWidth = width; })
      }.padding({ left: 14, right: 14, top: 8, bottom: 12 }).width('100%')
    }.width('100%').height('100%')
  }
  @Builder private composerDetails() {
    Button('思考 · ' + ChatFeatures.levelLabel(this.reasoningLevel), { type: ButtonType.Normal }).height(34).padding({ left: 4, right: 4 }).fontSize(11).fontColor($r('app.color.text_secondary')).backgroundColor(Color.Transparent)
      .id('assistant-reasoning').enabled(!this.busy).onClick(() => { void this.reasoningMenu(); })
    Blank().layoutWeight(1)
    Button({ type: ButtonType.Normal }) {
      Row({ space: 5 }) {
        Progress({ value: this.contextStat.percent, total: 100, type: ProgressType.Ring }).width(13).height(13).color($r('app.color.text_secondary')).backgroundColor($r('app.color.line')).style({ strokeWidth: 2, enableSmoothEffect: false })
        Text(this.contextStat.window ? this.contextStat.percent + '%' : '—').fontSize(11).fontColor($r('app.color.text_secondary'))
      }.direction(Direction.Ltr)
    }.height(34).padding({ left: 4, right: 5 }).backgroundColor(Color.Transparent).id('assistant-context').accessibilityText('查看上下文估算').onClick(() => this.contextDetails())
  }
  @Builder private composerAction() {
    NativeComposerAction({ running: this.busy, sendEnabled: !this.picking && (this.draft.trim().length > 0 || this.attachments.length > 0),
      sendId: 'assistant-send', stopId: 'assistant-stop', onSend: () => { void this.send(); }, onStop: () => this.stop() })
  }
  @Builder private contextPage() {
    Column({ space: 18 }) {
      Text('当前对话的模型窗口').fontSize(21).fontColor($r('app.color.text_primary')).width('100%')
      Text('填写服务商标注的上下文 token 数。此项只用于显示估算占比，不会扩大模型的实际限制。留空显示未知。').fontSize(14).lineHeight(24).fontColor($r('app.color.text_secondary')).width('100%')
      TextInput({ text: this.editWindow, placeholder: '例如 128000' }).type(InputType.Number).maxLength(8).id('conversation-context-window').onChange((value: string) => { this.editWindow = value; })
      this.banner()
      Button('保存', { type: ButtonType.Capsule }).width('100%').height(44).backgroundColor($r('app.color.ink')).fontColor($r('app.color.on_ink')).onClick(() => {
        try { this.active.profile.contextWindow = this.windowValue(); this.save(); this.updateContext(); this.returnTo('chat'); this.error = ''; } catch (error) { this.error = (error as Error).message; }
      })
    }.padding(24).width('100%').height('100%').alignItems(HorizontalAlign.Start)
  }
  @Builder private privacy() {
    Column() {
      Scroll() {
        Column({ space: 16 }) {
          Text('数据说明 · 开发版').fontSize(23).fontWeight(FontWeight.Medium).fontColor($r('app.color.text_primary')).width('100%')
          Text('独立聊天：你发送时，当前对话最近 40 条有效消息、关联附件与系统指令会直接发送给该对话配置的模型服务。选取附件只保存到本机，点击发送后才上传；后续追问会重新发送上下文中的附件。图片会缩小到最长边 2048 像素。应用没有自建聊天中转服务器，也未接入广告或统计 SDK。').fontSize(15).lineHeight(26).fontColor($r('app.color.text_primary'))
          Text('API Key：按服务地址隔离存入鸿蒙 Asset Store，不写入本机会话文件或日志。可在模型设置中删除当前服务的密钥。').fontSize(15).lineHeight(26).fontColor($r('app.color.text_primary'))
          Text('本机历史：独立会话与草稿保存在应用私有目录，可离线阅读、搜索、复制或逐条删除。应用不对这些文件额外声称端到端加密；卸载应用会清除本机文件。').fontSize(15).lineHeight(26).fontColor($r('app.color.text_primary'))
          Text('电脑模式：仅在你选择连接后联系 DSH Desktop，沿用电脑端的模型与执行环境。独立聊天的密钥和历史不会自动同步给电脑。').fontSize(15).lineHeight(26).fontColor($r('app.color.text_primary'))
          Text('这是开发测试版本。正式发行前仍需补齐发行主体、联系方式、正式隐私政策及相应资质，并完成真机和上架审核。').fontSize(13).lineHeight(23).fontColor($r('app.color.text_secondary'))
        }.padding(26).width('100%').alignItems(HorizontalAlign.Start)
      }.layoutWeight(1).width('100%')
    }.width('100%').height('100%')
  }
  private openRename(): void {
    Keyboard.dismiss(this.getUIContext()); this.cancelTitle(); this.titleInput = this.active.title; this.error = ''; this.forward('rename');
  }
  private saveTitle(): void {
    if (!this.titleInput.trim() || this.naming) return;
    Keyboard.dismiss(this.getUIContext()); this.error = ''; this.cancelTitle(); this.active.title = this.titleInput.trim(); this.active.titleSource = 'manual'; this.active.titleState = 'done'; this.active.updatedAt = Date.now(); this.changed(); this.save();
    if (!this.error) this.returnTo('chat');
  }
  @Builder private renamePage() {
    Column({ space: 14 }) {
      this.banner()
      Text('会话名称').fontSize(14).fontColor($r('app.color.text_secondary')).width('100%')
      TextInput({ text: this.titleInput, placeholder: '输入会话名称' }).height(52).fontSize(17).maxLength(80).borderRadius(18)
        .backgroundColor($r('app.color.surface')).fontColor($r('app.color.text_primary')).id('conversation-title').enabled(!this.naming)
        .onChange((text: string) => { this.titleInput = text; }).onSubmit(() => this.saveTitle())
      Text(this.naming ? '正在生成名称…' : '也可点右上角 AI 生成建议，编辑后保存。').fontSize(13).fontColor($r('app.color.text_secondary')).width('100%')
      Blank()
    }.padding(24).width('100%').height('100%').alignItems(HorizontalAlign.Start)
  }
  @Builder private renameHeader() { this.header('rename') }
  @Builder private listHeader() { this.header('list') }
  @Builder private chatHeader() { this.header('chat') }
  @Builder private settingsHeader() { this.header('settings') }
  @Builder private providersHeader() { this.header('providers') }
  @Builder private modelsHeader() { this.header('models') }
  @Builder private contextHeader() { this.header('context') }
  @Builder private privacyHeader() { this.header('privacy') }
  @Builder private destination(page: string) {
    if (page === 'rename') {
      NavDestination() { this.renamePage() }.title({ builder: this.renameHeader, height: 60 }, HarmonyExperience.titleOptions()).ignoreLayoutSafeArea([], []).systemBarStyle({ statusBarContentColor: this.chromeTextColor }).hideBackButton(true).backgroundColor($r('app.color.page_bg')).onBackPressed(() => { this.back(); return true; })
    }
    else if (page === 'chat') {
      NavDestination() { this.chat() }.title({ builder: this.chatHeader, height: 60 }, HarmonyExperience.titleOptions()).ignoreLayoutSafeArea([], []).systemBarStyle({ statusBarContentColor: this.chromeTextColor }).hideBackButton(true).backgroundColor($r('app.color.page_bg')).onBackPressed(() => { this.back(); return true; })
    }
    else if (page === 'settings') {
      NavDestination() { this.settingsPage() }.title({ builder: this.settingsHeader, height: 60 }, HarmonyExperience.titleOptions()).ignoreLayoutSafeArea([], []).systemBarStyle({ statusBarContentColor: this.chromeTextColor }).hideBackButton(true).backgroundColor($r('app.color.page_bg')).onBackPressed(() => { this.back(); return true; })
    }
    else if (page === 'providers') {
      NavDestination() { this.providersPage() }.title({ builder: this.providersHeader, height: 60 }, HarmonyExperience.titleOptions()).ignoreLayoutSafeArea([], []).systemBarStyle({ statusBarContentColor: this.chromeTextColor }).hideBackButton(true).backgroundColor($r('app.color.page_bg')).onBackPressed(() => { this.back(); return true; })
    }
    else if (page === 'models') {
      NavDestination() { this.modelsPage() }.title({ builder: this.modelsHeader, height: 60 }, HarmonyExperience.titleOptions()).ignoreLayoutSafeArea([], []).systemBarStyle({ statusBarContentColor: this.chromeTextColor }).hideBackButton(true).backgroundColor($r('app.color.page_bg')).onBackPressed(() => { this.back(); return true; })
    }
    else if (page === 'context') {
      NavDestination() { this.contextPage() }.title({ builder: this.contextHeader, height: 60 }, HarmonyExperience.titleOptions()).ignoreLayoutSafeArea([], []).systemBarStyle({ statusBarContentColor: this.chromeTextColor }).hideBackButton(true).backgroundColor($r('app.color.page_bg')).onBackPressed(() => { this.back(); return true; })
    }
    else if (page === 'privacy') {
      NavDestination() { this.privacy() }.title({ builder: this.privacyHeader, height: 60 }, HarmonyExperience.titleOptions()).ignoreLayoutSafeArea([], []).systemBarStyle({ statusBarContentColor: this.chromeTextColor }).hideBackButton(true).backgroundColor($r('app.color.page_bg')).onBackPressed(() => { this.back(); return true; })
    }
  }
  build() {
    Stack() {
    PageBackdrop()
    Navigation(this.navigation.paths) { this.history() }
      .navDestination(this.destination).title({ builder: this.listHeader, height: 60 }, HarmonyExperience.titleOptions())
      .titleMode(NavigationTitleMode.Mini).hideBackButton(true).hideToolBar(true).mode(NavigationMode.Stack)
      .width('100%').height('100%').backgroundColor($r('app.color.page_bg'))
      .ignoreLayoutSafeArea([], []).systemBarStyle({ statusBarContentColor: this.chromeTextColor })
    }.width('100%').height('100%').backgroundColor($r('app.color.page_bg'))
  }
}
