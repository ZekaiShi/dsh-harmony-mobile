import { scanBarcode, scanCore } from '@kit.ScanKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { KeyboardAvoidMode } from '@kit.ArkUI';
import { i18n } from '@kit.LocalizationKit';
import { pasteboard } from '@kit.BasicServicesKit';
import { ConnectionPolicy, RecentConnection, RemoteTarget } from '../core/ConnectionPolicy';
import { DshClient } from '../core/DshClient';
import { ChatReducer } from '../core/ChatReducer';
import { MessageLink } from '../core/MessageLink';
import { ToolPresentation } from '../core/ToolPresentation';
import { MarkdownView } from '../components/MarkdownView';
import { common } from '@kit.AbilityKit';
import { ChatBlock, ChatMessage, MobileQuestion, PendingQuestion, QuestionAnswer, QuestionOption, RpcValue, ServerItem, SnapshotFrame, SseFrame, StreamHandle, WireContent, WireRecord } from '../core/NativeModels';
import { NativeHttp } from '../platform/NativeHttp';
import { SessionSecrets } from '../platform/SessionSecrets';
import { RecentStore } from '../platform/RecentStore';
import { SessionPresentation } from '../core/SessionPresentation';
import { Keyboard } from '../platform/Keyboard';
import { HarmonyExperience } from '../platform/HarmonyExperience';
import { NativeComposerAction } from '../components/NativeComposerAction';
import { NativeBackButton } from '../components/NativeBackButton';
import { NativeCircleStyle } from '../components/NativeCircleStyle';
import { BackNavigation } from '../core/BackNavigation';
import { PageBackdrop } from '../components/PageBackdrop';
import { HoldingMotion } from '../platform/HoldingMotion';
import { ComposerToolbar } from '../components/ComposerToolbar';
import { SessionDrafts, desktopSessionDrafts } from '../core/SessionDrafts';

@Entry
@Component
struct Desktop {
  @StorageLink('chromeTextColor') private chromeTextColor: string = '#30302E';
  @StorageLink('leftControls') @Watch('handChanged') private leftControls: boolean = false;
  @State private screen: string = 'devices';
  @State private manual: boolean = false;
  @State private manualLink: string = '';
  @State private scanning: boolean = false;
  @State private busy: boolean = false;
  @State private error: string = '';
  @State private notice: string = '';
  @State private hostLabel: string = '';
  @State private pin: string = '';
  @State private recents: RecentConnection[] = [];
  @State private workspaces: ServerItem[] = [];
  @State private workspaceIndex: number = 0;
  @State private sessions: ServerItem[] = [];
  @State private sessionId: string = '';
  @State private sessionTitle: string = '';
  @State private messages: ChatMessage[] = [];
  @State private running: boolean = false;
  @State private sending: boolean = false;
  @State private historyLoading: boolean = false;
  @State private streamOnline: boolean = false;
  @State private draft: string = '';
  @State private expanded: string[] = [];
  @State private pending: PendingQuestion | null = null;
  @State private questionIndex: number = 0;
  @State private questionSelected: string[] = [];
  @State private questionCustom: string = '';
  @State private questionBusy: boolean = false;
  private client: DshClient = new DshClient(new NativeHttp(), new SessionSecrets());
  private recentStore: RecentStore = new RecentStore();
  private scroller: Scroller = new Scroller();
  private rows: ServerItem[] = [];
  private created: ServerItem[] = [];
  private archived: string[] = [];
  private records: WireRecord[] = [];
  private stream: StreamHandle | undefined = undefined;
  private pollTimer: number = -1;
  private reconnectTimer: number = -1;
  private pendingTimer: number = -1;
  private paintTimer: number = -1;
  private scrollTimer: number = -1;
  private epoch: number = 0;
  private connectionEpoch: number = 0;
  private revision: number = 0;
  private historyBusy: boolean = false;
  private foreground: boolean = true;
  private followBottom: boolean = true;
  private reconnectDelay: number = 1000;
  private optimisticText: string = '';
  private optimisticCount: number = 0;
  private answers: QuestionAnswer[] = [];
  private drafts: SessionDrafts = desktopSessionDrafts;
  private paths: NavPathStack = new NavPathStack();
  @State private composerSide: number = 1;
  private motionReady: boolean = false;
  private handChanged(): void { if (this.motionReady) HoldingMotion.move(this.getUIContext(), () => { this.composerSide = this.leftControls ? 0 : 1; }); }

  aboutToAppear(): void {
    this.composerSide = this.leftControls ? 0 : 1; this.motionReady = true;
    this.getUIContext().setKeyboardAvoidMode(KeyboardAvoidMode.RESIZE);
    const context = this.getUIContext().getHostContext();
    if (context !== undefined) this.recentStore.initialize(context).then((records: RecentConnection[]) => {
      if (this.recents.length === 0) this.recents = records;
    }).catch(() => { this.notice = '最近连接暂时无法读取，仍可扫码连接。'; });
  }
  onPageHide(): void { this.foreground = false; this.stopLive(); }
  onPageShow(): void {
    this.foreground = true;
    if (this.screen === 'chat' && this.sessionId) { this.openStream(); void this.loadHistory(); }
  }
  aboutToDisappear(): void { this.motionReady = false; this.stopLive(); this.client.close(); }
  private toast(text: string): void {
    try { this.getUIContext().getPromptAction().showToast({ message: text }); } catch (_) {}
  }
  private fail(error: Error): void { this.error = error.message || '操作未完成，请稍后重试。'; }
  private async scan(): Promise<void> {
    if (this.scanning || this.busy) return;
    const context = this.getUIContext().getHostContext();
    if (context === undefined) { this.manual = true; this.error = '暂时无法打开扫码，请粘贴配对链接。'; return; }
    this.scanning = true;
    const epoch = this.connectionEpoch;
    try {
      const options: scanBarcode.ScanOptions = { scanTypes: [scanCore.ScanType.QR_CODE], enableMultiMode: false, enableAlbum: true };
      const task: Promise<scanBarcode.ScanResult> = scanBarcode.startScanForResult(context, options);
      const result: scanBarcode.ScanResult = await task;
      if (epoch === this.connectionEpoch && this.screen === 'devices') this.connectLink(result.originalValue);
    } catch (error) {
      const failure = error as BusinessError;
      this.toast('扫码未完成，可重试或粘贴链接。' + (failure.code ? '（' + failure.code + '）' : ''));
    } finally { this.scanning = false; }
  }
  private connectLink(raw: string): void {
    const result = ConnectionPolicy.parse(raw);
    if (!result.ok) { this.error = result.message; this.manual = true; return; }
    this.manualLink = ''; void this.connect(result.target);
  }
  private async connect(target: RemoteTarget): Promise<void> {
    if (this.busy) return;
    const epoch = ++this.connectionEpoch;
    this.stopLive(); this.busy = true; this.error = ''; this.hostLabel = target.label;
    try {
      const outcome = await this.client.connect(target);
      if (epoch !== this.connectionEpoch) return;
      if (outcome.migrationUrl) {
        const next = ConnectionPolicy.parse(outcome.migrationUrl, false);
        if (next.ok) this.getUIContext().showAlertDialog({ title: '切换电脑连接地址', message: '电脑请求连接至：' + next.target.label,
          primaryButton: { value: '取消', action: () => {} },
          secondaryButton: { value: '继续连接', action: () => { void this.connect(next.target); } } });
      } else if (outcome.pinRequired) { this.pin = ''; this.navigate('pin'); }
      else await this.connected();
    } catch (error) { if (epoch === this.connectionEpoch) this.fail(error as Error); }
    finally { if (epoch === this.connectionEpoch) this.busy = false; }
  }
  private async verifyPin(): Promise<void> {
    if (this.busy) return;
    this.busy = true; this.error = ''; const epoch = this.connectionEpoch;
    try { await this.client.verifyPin(this.pin); if (epoch !== this.connectionEpoch) return; this.pin = ''; await this.connected(); }
    catch (error) { if (epoch === this.connectionEpoch) this.fail(error as Error); }
    finally { if (epoch === this.connectionEpoch) this.busy = false; }
  }
  private async connected(): Promise<void> {
    const target = ConnectionPolicy.parse(this.client.origin + '/', false);
    if (target.ok) {
      this.recents = ConnectionPolicy.remember(this.recents, target.target, Date.now());
      this.recentStore.save(this.recents).catch(() => { this.notice = '最近连接未能保存，本次连接不受影响。'; });
    }
    if (this.client.credentialWarning) this.notice = '本次连接可用，系统安全存储暂不可用；下次可能需要重新扫码。';
    this.navigate('sessions'); this.created = []; this.workspaceIndex = 0; await this.refreshLists();
  }
  private navigate(page: string): void {
    const previous = this.screen; this.screen = page;
    if (previous === 'pin') this.paths.replacePath({ name: page }, true);
    else this.paths.pushPath({ name: page }, true);
  }
  private showDevices(): void {
    this.drafts.save(this.client.origin, this.sessionId, this.draft);
    this.connectionEpoch++; this.stopLive(); this.client.close(); this.screen = 'devices';
    this.paths.clear(true);
    this.busy = false; this.pin = ''; this.manual = false; this.manualLink = ''; this.error = ''; this.sessionId = '';
    this.messages = []; this.draft = ''; this.pending = null; this.optimisticText = ''; this.running = false; this.sending = false; this.questionBusy = false;
  }
  private async forget(record: RecentConnection): Promise<void> {
    this.drafts.forget(record.origin);
    this.recents = this.recents.filter((item: RecentConnection) => item.origin !== record.origin);
    this.recentStore.save(this.recents).catch(() => this.toast('记录未能保存，请稍后重试。'));
    try { await this.client.forget(record.origin); } catch (_) { this.toast('安全凭据未能移除，请稍后重试。'); }
  }
  private async refreshLists(): Promise<void> {
    const epoch = this.connectionEpoch; this.error = '';
    try {
      const values = await Promise.all([this.client.rpc('workspace.list'), this.client.rpc('session.list')]);
      if (epoch !== this.connectionEpoch) return;
      this.workspaces = values[0].items || []; this.archived = values[0].archivedSessionIds || [];
      if (this.workspaceIndex >= this.workspaces.length) this.workspaceIndex = 0;
      this.rows = values[1].items || [];
      this.created = this.created.filter((item: ServerItem) => !this.archived.includes(item.sessionId || ''));
      for (const item of this.created) if (!this.rows.some((row: ServerItem) => row.sessionId === item.sessionId)) this.rows.push(item);
      this.filterSessions();
    } catch (error) { if (epoch === this.connectionEpoch) this.fail(error as Error); }
  }
  private filterSessions(): void {
    const workspace = this.workspaces[this.workspaceIndex], allowed = workspace?.sessionIds || [];
    this.sessions = this.rows.filter((item: ServerItem) => !this.archived.includes(item.sessionId || '') &&
      (allowed.includes(item.sessionId || '') || this.created.some((local: ServerItem) => local.sessionId === item.sessionId && local.workspaceId === workspace?.workspaceId)))
      .sort((a: ServerItem, b: ServerItem) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }
  private async createSession(): Promise<void> {
    const workspace = this.workspaces[this.workspaceIndex];
    if (!workspace?.workspaceId || this.busy) return;
    this.busy = true; this.error = ''; const epoch = this.connectionEpoch;
    try {
      const value = await this.client.rpc('session.create', { workspaceId: workspace.workspaceId });
      if (epoch !== this.connectionEpoch) return;
      if (!value.sessionId) throw new Error('电脑没有返回新会话，请刷新列表。');
      const item: ServerItem = { sessionId: value.sessionId, workspaceId: workspace.workspaceId, title: '新会话', updatedAt: Date.now(), blank: true, agentPreset: value.agentPreset };
      this.created.push(item); this.rows.push(item); this.filterSessions(); this.openSession(item);
    } catch (error) { if (epoch === this.connectionEpoch) this.fail(error as Error); }
    finally { if (epoch === this.connectionEpoch) this.busy = false; }
  }
  private openSession(item: ServerItem): void {
    this.drafts.save(this.client.origin, this.sessionId, this.draft);
    this.stopLive(); this.sessionId = item.sessionId || ''; this.sessionTitle = SessionPresentation.title(item);
    this.error = ''; this.draft = this.drafts.read(this.client.origin, this.sessionId); this.records = []; this.messages = []; this.pending = null; this.sending = false; this.questionBusy = false;
    this.optimisticText = ''; this.expanded = []; this.followBottom = true; this.running = item.running || false;
    this.historyLoading = true; this.navigate('chat'); this.openStream(); void this.loadHistory();
  }
  private showSessions(): void {
    this.drafts.save(this.client.origin, this.sessionId, this.draft);
    this.stopLive(); this.screen = 'sessions'; this.sessionId = ''; this.pending = null; this.error = ''; this.sending = false; this.questionBusy = false;
    this.paths.popToName('sessions', true); void this.refreshLists();
  }
  private stopLive(): void {
    this.epoch++; this.stream?.close(); this.stream = undefined; this.streamOnline = false; this.historyBusy = false;
    clearTimeout(this.pollTimer); clearTimeout(this.reconnectTimer); clearTimeout(this.pendingTimer); clearTimeout(this.paintTimer); clearTimeout(this.scrollTimer);
    this.pollTimer = -1; this.reconnectTimer = -1; this.pendingTimer = -1; this.paintTimer = -1;
  }
  private openStream(): void {
    if (!this.foreground || this.screen !== 'chat' || !this.sessionId) return;
    this.stream?.close(); clearTimeout(this.reconnectTimer); this.reconnectTimer = -1; const epoch = this.epoch;
    this.stream = this.client.stream(this.sessionId, (frame: SseFrame) => {
      if (epoch !== this.epoch || this.screen !== 'chat') return;
      try {
        if (frame.event === 'snapshot') {
          const value = JSON.parse(frame.data) as SnapshotFrame; this.records = value.records || [];
          this.sessionTitle = SessionPresentation.projectedTitle(value.projections) || this.sessionTitle;
          this.revision++; this.paintChat();
        } else if (frame.event === 'event') {
          const record = JSON.parse(frame.data) as WireRecord;
          if (record.seq !== undefined && this.records.some((item: WireRecord) => item.seq === record.seq)) return;
          this.records.push(record); this.revision++;
          if (this.paintTimer < 0) this.paintTimer = setTimeout(() => { this.paintTimer = -1; this.paintChat(); }, 40);
        }
        if (this.pendingTimer < 0) this.pendingTimer = setTimeout(() => { this.pendingTimer = -1; void this.refreshPending(epoch); }, 350);
      } catch (_) { this.error = '电脑返回了无法识别的消息，请刷新会话。'; }
    }, (online: boolean) => {
      if (epoch !== this.epoch || this.screen !== 'chat') return;
      this.streamOnline = online;
      if (online) this.reconnectDelay = 1000;
      else if (this.reconnectTimer < 0 && this.foreground) {
        this.reconnectTimer = setTimeout(() => { this.reconnectTimer = -1; this.openStream(); }, this.reconnectDelay); this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
      }
    });
  }
  private async refreshPending(epoch: number): Promise<void> {
    try { const value = await this.client.rpc('interaction.pending', { sessionId: this.sessionId }); if (epoch === this.epoch) this.applyPending(value); } catch (_) {}
  }
  private applyPending(value: RpcValue): void {
    if (value.rpcId && value.sessionId && value.questions) {
      if (this.pending?.rpcId !== value.rpcId) {
        this.pending = { rpcId: value.rpcId, sessionId: value.sessionId, questions: value.questions };
        this.questionIndex = 0; this.answers = []; this.questionSelected = []; this.questionCustom = ''; this.questionBusy = false;
      }
    } else { this.pending = null; this.questionBusy = false; }
  }
  private async loadHistory(): Promise<void> {
    if (this.historyBusy || this.screen !== 'chat' || !this.sessionId || !this.foreground) return;
    const epoch = this.epoch, revision = this.revision; this.historyBusy = true;
    try {
      const values = await Promise.all([this.client.rpc('session.history', { sessionId: this.sessionId, maxMessages: 100 }), this.client.rpc('interaction.pending', { sessionId: this.sessionId })]);
      if (epoch !== this.epoch) return;
      if (!this.streamOnline || revision === this.revision) { this.sessionTitle = SessionPresentation.projectedTitle(values[0].projections) || this.sessionTitle; this.records = values[0].events || []; this.paintChat(); }
      this.applyPending(values[1]); this.error = '';
    } catch (error) { if (epoch === this.epoch) this.fail(error as Error); }
    finally {
      if (epoch === this.epoch) {
        this.historyBusy = false; this.historyLoading = false; clearTimeout(this.pollTimer);
        if (this.foreground && this.screen === 'chat') this.pollTimer = setTimeout(() => { void this.loadHistory(); }, this.streamOnline ? 12000 : 2500);
      }
    }
  }
  private userTextCount(text: string): number {
    return ChatReducer.project(this.records).messages.filter((message: ChatMessage) => message.role === 'user' &&
      message.blocks.filter((block: ChatBlock) => block.kind === 'text').map((block: ChatBlock) => block.text).join('\n') === text).length;
  }
  private paintChat(): void {
    const projection = ChatReducer.project(this.records);
    if (this.optimisticText && this.userTextCount(this.optimisticText) <= this.optimisticCount) {
      const message = new ChatMessage(); message.id = 'optimistic'; message.role = 'user'; const block = new ChatBlock(); block.text = this.optimisticText;
      message.blocks = [block]; projection.messages.push(message);
    } else this.optimisticText = '';
    this.messages = projection.messages; this.running = projection.running || this.sending;
    if (this.followBottom) {
      clearTimeout(this.scrollTimer); this.scrollTimer = setTimeout(() => { try { this.scroller.scrollEdge(Edge.Bottom); } catch (_) {} }, 50);
    }
  }
  private async send(): Promise<void> {
    const text = this.draft.trim(); if (!text || !this.sessionId || this.sending || this.running) return;
    const epoch = this.epoch; this.optimisticCount = this.userTextCount(text); this.optimisticText = text; this.draft = ''; this.error = '';
    this.sending = true; this.followBottom = true; this.paintChat();
    try {
      const content: WireContent[] = [{ type: 'text', text: text }];
      await this.client.rpc('session.prompt', { sessionId: this.sessionId, mode: 'steer', content: content, clientTimeZone: i18n.getTimeZone().getID() });
      if (epoch === this.epoch) await this.loadHistory();
    } catch (error) { if (epoch === this.epoch) { this.optimisticText = ''; if (!this.draft) this.draft = text; this.fail(error as Error); } }
    finally { if (epoch === this.epoch) { this.sending = false; this.paintChat(); } }
  }
  private async cancelTurn(): Promise<void> {
    const epoch = this.epoch;
    try { await this.client.rpc('session.cancel', { sessionId: this.sessionId }); if (epoch === this.epoch) await this.loadHistory(); }
    catch (error) { if (epoch === this.epoch) this.fail(error as Error); }
  }
  private question(): MobileQuestion | undefined { return this.pending?.questions[this.questionIndex]; }
  private async openMessageLink(href: string): Promise<void> {
    const target = MessageLink.parse(href);
    if (target.kind === 'web') {
      try {
        const context = this.getUIContext().getHostContext() as common.UIAbilityContext;
        await context.startAbility({ action: 'ohos.want.action.viewData', uri: target.href, entities: ['entity.system.browsable'] });
      } catch (_) { this.toast('无法打开浏览器，可长按链接文字复制'); }
    } else if (target.kind === 'file') {
      this.getUIContext().showAlertDialog({
        title: '电脑文件引用',
        message: target.path + (target.line ? '\n行号：' + target.line : '') + '\n\n当前二维码接口不提供电脑文件预览，可复制引用后在电脑打开。',
        primaryButton: { value: '复制引用', action: () => { this.copyText(target.path + (target.line ? ':' + target.line : '')); } },
        secondaryButton: { value: '关闭', action: () => {} }
      });
    } else if (target.kind === 'anchor') this.toast('章节引用：' + target.path);
    else this.toast('不支持打开此链接');
  }
  private copyText(text: string): void {
    pasteboard.getSystemPasteboard().setData(pasteboard.createData(pasteboard.MIMETYPE_TEXT_PLAIN, text))
      .then(() => { this.toast('已复制'); }).catch(() => { this.toast('复制失败，请长按文字复制'); });
  }
  private selectAnswer(label: string): void {
    if (this.questionBusy) return;
    if (this.question()?.multiSelect) this.questionSelected = this.questionSelected.includes(label) ? this.questionSelected.filter((item: string) => item !== label) : this.questionSelected.concat([label]);
    else { this.questionSelected = [label]; this.questionCustom = ''; }
  }
  private async advanceAnswer(skip: boolean): Promise<void> {
    const question = this.question(), pending = this.pending; if (!question || !pending || this.questionBusy) return;
    const custom = this.questionCustom.trim();
    if (!skip && this.questionSelected.length === 0 && !custom) { this.toast('请选择一个选项或填写回答。'); return; }
    const answer: QuestionAnswer = { id: question.id, selected: skip ? [] : (!question.multiSelect && custom ? [] : this.questionSelected), custom: skip ? '' : custom };
    this.answers[this.questionIndex] = answer;
    if (this.questionIndex < pending.questions.length - 1) { this.questionIndex++; this.restoreAnswer(); return; }
    this.questionBusy = true; const epoch = this.epoch;
    try {
      await this.client.rpc('interaction.answer', { rpcId: pending.rpcId, sessionId: pending.sessionId, answers: this.answers });
      if (epoch === this.epoch) { this.pending = null; await this.loadHistory(); }
    } catch (error) { if (epoch === this.epoch) this.fail(error as Error); }
    finally { if (epoch === this.epoch) this.questionBusy = false; }
  }
  private restoreAnswer(): void { const answer = this.answers[this.questionIndex]; this.questionSelected = answer?.selected || []; this.questionCustom = answer?.custom || ''; }
  private async cancelQuestions(): Promise<void> {
    const pending = this.pending; if (!pending || this.questionBusy) return; this.questionBusy = true;
    const epoch = this.epoch;
    try { await this.client.rpc('interaction.cancel', { rpcId: pending.rpcId, sessionId: pending.sessionId }); if (epoch === this.epoch) this.pending = null; }
    catch (error) { if (epoch === this.epoch) this.fail(error as Error); } finally { if (epoch === this.epoch) this.questionBusy = false; }
  }
  private back(): boolean {
    const target = BackNavigation.target('desktop', this.screen);
    if (target === 'exit') return false;
    Keyboard.dismiss(this.getUIContext());
    if (target === 'sessions') this.showSessions();
    else if (target === 'devices') this.showDevices();
    else { this.connectionEpoch++; this.stopLive(); this.client.close(); this.pin = ''; this.manualLink = ''; this.getUIContext().getRouter().back(); }
    return true;
  }
  onBackPress(): boolean { return this.back(); }

  @Builder
  private errorBanner() {
    if (this.error) Text(this.error).fontSize(13).fontColor($r('app.color.danger')).lineHeight(20).padding(14).width('100%').backgroundColor($r('app.color.surface'))
  }
  @Builder
  private header(page: string) {
    Row({ space: 10 }) {
      NativeBackButton({ controlId: page === 'chat' ? 'session-list' : page === 'devices' ? 'desktop-back' : 'devices', onBack: () => { this.back(); } })
      Column({ space: 3 }) {
        Text(page === 'devices' ? '连接电脑' : page === 'chat' ? this.sessionTitle : page === 'pin' ? '连接密码' : '会话')
          .fontSize(17).fontWeight(FontWeight.Medium).fontColor($r('app.color.text_primary')).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis })
        Text(page === 'devices' ? 'DSH Desktop · 扫码或粘贴连接' : page === 'chat' ? this.running ? '电脑正在处理…' : this.streamOnline ? '已连接 · 实时更新' : '正在恢复实时连接…' : this.hostLabel)
          .fontSize(11).fontColor($r('app.color.text_secondary')).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis })
      }.layoutWeight(1).alignItems(HorizontalAlign.Start)
      if (page === 'chat' || page === 'sessions') Button({ type: ButtonType.Circle }) { SymbolGlyph($r('sys.symbol.arrow_clockwise')).fontSize(20).fontColor([$r('app.color.text_primary')]) }
        .attributeModifier(new NativeCircleStyle(44, true)).id('refresh').accessibilityText('刷新')
        .onClick(() => { if (this.screen === 'chat') { void this.loadHistory(); this.openStream(); } else void this.refreshLists(); })
      if (page === 'chat') {
        Button({ type: ButtonType.Circle }) { SymbolGlyph($r('sys.symbol.square_and_pencil')).fontSize(22).fontColor([$r('app.color.text_primary')]) }
          .attributeModifier(new NativeCircleStyle(44, true)).id('new-session').accessibilityText('新会话').enabled(!this.busy)
          .onClick(() => { void this.createSession(); })
      }
    }.padding({ left: 8, right: 12 }).width('100%').height(60)
  }
  @Builder
  private devices() {
    Scroll() {
      Column({ space: 22 }) {
        Row({ space: 12 }) {
          Image($r('app.media.app_icon')).width(42).height(42).borderRadius(12)
          Column({ space: 4 }) {
            Text('DSH Connect').fontSize(22).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary'))
            Text('电脑上的工作，在手机继续').fontSize(12).fontColor($r('app.color.text_secondary'))
          }.alignItems(HorizontalAlign.Start)
          Blank()
        }.width('100%').margin({ top: 12 })
        Column({ space: 18 }) {
          Text('随时，接着聊。').fontSize(32).fontWeight(FontWeight.Medium).fontColor($r('app.color.text_primary')).width('100%')
          Text('在 DSH Desktop 打开「连接手机」，扫描二维码，或粘贴完整配对链接。').fontSize(14).lineHeight(23).fontColor($r('app.color.text_secondary')).width('100%')
          Button(this.busy ? '正在连接…' : this.scanning ? '正在打开扫码…' : '扫码连接', { type: ButtonType.Normal })
            .width('100%').height(52).borderRadius(15).fontSize(17).backgroundColor($r('app.color.accent')).fontColor(Color.White)
            .enabled(!this.scanning && !this.busy).onClick(() => { void this.scan(); })
          Button(this.manual ? '收起链接输入' : '粘贴连接链接', { type: ButtonType.Normal }).width('100%').height(44).backgroundColor($r('app.color.accent_soft')).fontColor($r('app.color.accent')).borderRadius(13)
            .onClick(() => { this.manual = !this.manual; })
          if (this.manual) {
            TextArea({ text: this.manualLink, placeholder: '粘贴完整配对链接' }).height(90).fontSize(14).backgroundColor($r('app.color.page_bg')).fontColor($r('app.color.text_primary')).onChange((text: string) => { this.manualLink = text; })
            Button('打开连接', { type: ButtonType.Normal }).width('100%').height(48).borderRadius(13).backgroundColor($r('app.color.accent')).fontColor(Color.White).enabled(!this.busy).onClick(() => this.connectLink(this.manualLink))
          }
        }.padding({ top: 56, bottom: 28 }).width('100%')
        this.errorBanner()
        if (this.recents.length > 0) {
          Column({ space: 12 }) {
            Text('最近连接').fontSize(16).fontWeight(FontWeight.Medium).fontColor($r('app.color.text_primary')).width('100%')
            ForEach(this.recents, (record: RecentConnection) => {
              Row({ space: 8 }) {
                Column({ space: 6 }) {
                  Text(record.label).fontSize(14).fontColor($r('app.color.text_primary')).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis })
                  Text(record.origin.startsWith('https:') ? '互联网连接' : '局域网连接').fontSize(12).fontColor($r('app.color.text_secondary'))
                }.layoutWeight(1).alignItems(HorizontalAlign.Start)
                Button('继续', { type: ButtonType.Normal }).height(44).fontSize(13).backgroundColor($r('app.color.accent_soft')).fontColor($r('app.color.accent')).borderRadius(12).enabled(!this.busy)
                  .onClick(() => { const value = ConnectionPolicy.parse(record.origin + '/', false); if (value.ok) void this.connect(value.target); })
                Button('移除', { type: ButtonType.Normal }).height(44).fontSize(12).backgroundColor(Color.Transparent).fontColor($r('app.color.text_secondary')).onClick(() => { void this.forget(record); })
              }.padding(14).width('100%').backgroundColor($r('app.color.surface')).borderRadius(18)
            }, (record: RecentConnection) => record.origin)
          }.width('100%')
        }
        if (this.notice) Text(this.notice).fontSize(12).fontColor($r('app.color.text_secondary')).lineHeight(20)
        Text('电脑负责运行，手机负责连接。\n社区客户端 · 兼容 DSH Desktop').fontSize(12).fontColor($r('app.color.text_secondary')).lineHeight(21).textAlign(TextAlign.Center).margin({ top: 8, bottom: 20 })
      }.width('100%').constraintSize({ maxWidth: 620 }).padding(26)
    }.width('100%').height('100%').scrollBar(BarState.Off).backgroundColor($r('app.color.page_bg'))
  }
  @Builder
  private pinPage() {
    Column({ space: 22 }) {
      Blank()
      Text('输入电脑显示的密码').fontSize(25).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary'))
      Text('互联网连接需要六位密码来确认身份。').fontSize(14).fontColor($r('app.color.text_secondary'))
      TextInput({ text: this.pin, placeholder: '六位连接密码' }).type(InputType.Number).maxLength(6).fontSize(28).textAlign(TextAlign.Center).height(60).width('82%')
        .backgroundColor($r('app.color.surface')).fontColor($r('app.color.text_primary')).onChange((text: string) => { this.pin = text; })
      Button(this.busy ? '正在验证…' : '确认连接', { type: ButtonType.Normal }).width('82%').height(50).borderRadius(15).backgroundColor($r('app.color.accent')).fontColor(Color.White)
        .enabled(!this.busy && this.pin.length === 6).onClick(() => { void this.verifyPin(); })
      this.errorBanner()
      Blank()
    }.width('100%').height('100%').backgroundColor($r('app.color.page_bg'))
  }
  @Builder
  private sessionList() {
    Column({ space: 0 }) {
      this.errorBanner()
      Row({ space: 12 }) {
        if (this.workspaces.length > 0) {
          Select(this.workspaces.map((item: ServerItem): SelectOption => { return { value: item.title || item.path || '工作区' }; })).selected(this.workspaceIndex)
            .value(this.workspaces[this.workspaceIndex]?.title || this.workspaces[this.workspaceIndex]?.path || '选择工作区').layoutWeight(1)
            .font({ size: 13 }).fontColor($r('app.color.text_secondary')).backgroundColor(Color.Transparent).onSelect((index: number) => { this.workspaceIndex = index; this.filterSessions(); })
        } else Text('暂无工作区').layoutWeight(1).fontColor($r('app.color.text_secondary'))
        Button('＋ 新会话', { type: ButtonType.Normal }).height(40).fontSize(13).borderRadius(20).backgroundColor($r('app.color.ink')).fontColor($r('app.color.on_ink'))
          .enabled(this.workspaces.length > 0 && !this.busy).onClick(() => { void this.createSession(); })
      }.padding(16).width('100%')
      if (this.sessions.length === 0) {
        Column({ space: 12 }) {
          Text(this.workspaces.length > 0 ? '还没有会话' : '等待电脑工作区').fontSize(22).fontWeight(FontWeight.Medium).fontColor($r('app.color.text_primary'))
          Text(this.workspaces.length > 0 ? '点「新会话」开始，也可以在电脑端继续已有工作。' : '请先在电脑 DSH 中打开工作区，再刷新。').fontSize(14).fontColor($r('app.color.text_secondary')).lineHeight(22).textAlign(TextAlign.Center)
        }.padding(28).layoutWeight(1).justifyContent(FlexAlign.Center)
      } else {
        List({ space: 0 }) {
          ForEach(this.sessions, (item: ServerItem) => {
            ListItem() {
              Row({ space: 14 }) {
                Column({ space: 7 }) {
                  Text(SessionPresentation.title(item)).fontSize(16).fontWeight(FontWeight.Medium).fontColor($r('app.color.text_primary')).maxLines(2).textOverflow({ overflow: TextOverflow.Ellipsis })
                  Text(item.running ? '● 正在处理' : '在手机上继续').fontSize(12).fontColor($r('app.color.text_secondary'))
                }.layoutWeight(1).alignItems(HorizontalAlign.Start)
                SymbolGlyph($r('sys.symbol.chevron_right')).fontSize(14).fontColor([$r('app.color.text_secondary')])
              }.padding({ left: 8, right: 8, top: 20, bottom: 20 }).width('100%').border({ width: { bottom: 0.5 }, color: $r('app.color.line') })
            }.onClick(() => this.openSession(item))
          }, (item: ServerItem) => (item.sessionId || '') + ':' + SessionPresentation.title(item) + ':' + (item.updatedAt || 0) + ':' + (item.running || false))
        }.padding({ left: 16, right: 16 }).layoutWeight(1).width('100%').scrollBar(BarState.Off)
      }
    }.width('100%').height('100%').backgroundColor($r('app.color.page_bg'))
  }
  @Builder
  private formattedText(text: string) {
    MarkdownView({ content: text, onLink: (href: string) => { void this.openMessageLink(href); } })
  }
  private toolIcon(category: string): Resource {
    if (category === 'terminal') return $r('sys.symbol.code_square');
    if (category === 'edit') return $r('sys.symbol.pencil_line');
    if (category === 'image' || category === 'image-create') return $r('sys.symbol.picture');
    if (category === 'search') return $r('sys.symbol.magnifyingglass');
    if (category === 'read') return $r('sys.symbol.doc_text');
    if (category === 'web') return $r('sys.symbol.worldclock');
    return $r('sys.symbol.wrench_and_screwdriver');
  }
  @Builder
  private messageBlock(block: ChatBlock, key: string) {
    if (block.kind === 'text') this.formattedText(block.text)
    else {
      Column({ space: 0 }) {
        Row({ space: 9 }) {
          if (block.kind === 'tool' && block.category === 'github') {
            Image($r('app.media.ic_github')).width(16).height(16).opacity(0.65).id('activity-icon-github')
          } else {
            SymbolGlyph(block.kind === 'reasoning' ? $r('sys.symbol.lightbulb') : this.toolIcon(block.category))
              .fontSize(16).fontWeight(FontWeight.Normal).fontColor([$r('app.color.text_secondary')]).id('activity-icon-' + block.category)
          }
          Text(block.kind === 'reasoning' ? '思考过程' : ToolPresentation.label(block.category, block.status)).fontSize(13)
            .fontColor(block.status === 'error' ? $r('app.color.danger') : $r('app.color.text_secondary'))
          if (block.kind === 'tool') {
            Text(block.summary || block.name).fontSize(12).fontColor($r('app.color.text_secondary')).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis }).layoutWeight(1)
          } else Blank()
          if (block.status === 'running') LoadingProgress().width(12).height(12).color($r('app.color.text_secondary'))
          SymbolGlyph($r('sys.symbol.chevron_right')).fontSize(12).fontColor([$r('app.color.text_secondary')]).rotate({ angle: this.expanded.includes(key) ? 90 : 0 }).opacity(0.6)
        }.width('100%').height(36).accessibilityText((block.kind === 'reasoning' ? '思考过程' : block.name) + (this.expanded.includes(key) ? '，收起详情' : '，展开详情'))
          .onClick(() => { this.expanded = this.expanded.includes(key) ? this.expanded.filter((item: string) => item !== key) : this.expanded.concat([key]); })
        if (this.expanded.includes(key)) {
          Text(block.text || '暂无详细内容').fontSize(12).fontFamily(block.kind === 'tool' ? 'monospace' : 'HarmonyOS Sans').lineHeight(21)
            .fontColor($r('app.color.text_secondary')).copyOption(CopyOptions.LocalDevice).width('100%').padding({ left: 15, top: 5, bottom: 12 })
            .border({ width: { left: 1 }, color: $r('app.color.line') }).margin({ left: 7, bottom: 8 })
        }
      }.width('100%')
    }
  }
  @Builder
  private questionPanel() {
    Column({ space: 10 }) {
      Row() {
        Text('需要你确认').fontSize(14).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary')).layoutWeight(1)
        Text((this.questionIndex + 1) + ' / ' + (this.pending?.questions.length || 0)).fontSize(12).fontColor($r('app.color.text_secondary'))
      }.width('100%')
      Text(this.question()?.question || '').fontSize(15).lineHeight(23).fontColor($r('app.color.text_primary')).width('100%')
      Scroll() {
        Column({ space: 8 }) {
          ForEach(this.question()?.options || [], (option: QuestionOption) => {
            Button((this.questionSelected.includes(option.label) ? '● ' : '○ ') + option.label + (option.description ? '  ' + option.description : ''), { type: ButtonType.Normal })
              .fontSize(14).height(48).width('100%').borderRadius(12).fontColor($r('app.color.text_primary'))
              .backgroundColor(this.questionSelected.includes(option.label) ? $r('app.color.accent_soft') : $r('app.color.page_bg')).enabled(!this.questionBusy).onClick(() => this.selectAnswer(option.label))
          }, (option: QuestionOption) => option.label)
        }.width('100%')
      }.constraintSize({ maxHeight: 150 }).width('100%')
      TextInput({ text: this.questionCustom, placeholder: '或填写你的回答' }).height(44).fontSize(14).backgroundColor($r('app.color.page_bg')).fontColor($r('app.color.text_primary')).enabled(!this.questionBusy)
        .onChange((text: string) => { this.questionCustom = text; if (!this.question()?.multiSelect && text.trim()) this.questionSelected = []; })
      Row({ space: 8 }) {
        Button(this.questionIndex > 0 ? '上一题' : '取消', { type: ButtonType.Normal }).height(44).fontSize(13).backgroundColor(Color.Transparent).fontColor($r('app.color.text_secondary')).enabled(!this.questionBusy)
          .onClick(() => { if (this.questionIndex > 0) { this.questionIndex--; this.restoreAnswer(); } else void this.cancelQuestions(); })
        Blank()
        Button('跳过', { type: ButtonType.Normal }).height(44).fontSize(13).backgroundColor(Color.Transparent).fontColor($r('app.color.text_secondary')).enabled(!this.questionBusy).onClick(() => { void this.advanceAnswer(true); })
        Button(this.questionBusy ? '提交中…' : this.questionIndex === (this.pending?.questions.length || 0) - 1 ? '提交回答' : '下一题', { type: ButtonType.Normal })
          .height(44).fontSize(13).borderRadius(12).backgroundColor($r('app.color.accent')).fontColor(Color.White).enabled(!this.questionBusy).onClick(() => { void this.advanceAnswer(false); })
      }.width('100%')
    }.padding(16).width('100%').backgroundColor($r('app.color.surface'))
  }
  @Builder
  private chatPage() {
    Column({ space: 0 }) {
      this.errorBanner()
      List({ scroller: this.scroller, space: 26 }) {
        if (this.messages.length === 0) {
          ListItem() {
            Column({ space: 14 }) {
              SymbolGlyph($r('sys.symbol.lightbulb')).fontSize(40).fontColor([$r('app.color.accent')])
              Text(this.historyLoading ? '正在读取消息…' : '有什么想一起完成的？').fontSize(26).fontColor($r('app.color.text_primary'))
              Text('消息会同步到电脑上的当前会话').fontSize(12).fontColor($r('app.color.text_secondary'))
            }.padding({ top: 100, bottom: 40 }).width('100%')
          }
        }
        ForEach(this.messages, (message: ChatMessage) => {
          ListItem() {
            Column({ space: 0 }) {
              Column({ space: message.role === 'user' ? 8 : 2 }) {
                ForEach(message.blocks, (block: ChatBlock, index: number) => {
                  if (message.role === 'user') Text(block.text).fontSize(16).lineHeight(25).fontColor($r('app.color.text_primary')).copyOption(CopyOptions.LocalDevice)
                  else this.messageBlock(block, message.id + ':' + index)
                },
                  (block: ChatBlock, index: number) => block.kind + ':' + index)
              }.padding(message.role === 'user' ? 14 : 0).constraintSize({ maxWidth: message.role === 'user' ? '90%' : '100%' })
                .alignItems(HorizontalAlign.Start).backgroundColor(message.role === 'user' ? $r('app.color.accent_soft') : Color.Transparent).borderRadius(20)
              if (message.role !== 'user' && !message.streaming && message.blocks.some((block: ChatBlock) => block.kind === 'text')) {
                Button({ type: ButtonType.Normal }) { SymbolGlyph($r('sys.symbol.doc_text_on_doc_text')).fontSize(17).fontColor([$r('app.color.text_secondary')]) }
                  .width(36).height(40).backgroundColor(Color.Transparent).accessibilityText('复制回复').margin({ top: 8 })
                  .onClick(() => { this.copyText(message.blocks.filter((block: ChatBlock) => block.kind === 'text').map((block: ChatBlock) => block.text).join('\n\n')); })
              }
            }.width('100%').alignItems(message.role === 'user' ? HorizontalAlign.End : HorizontalAlign.Start)
          }
        }, (message: ChatMessage) => message.id + ':' + message.version)
      }.padding({ left: 24, right: 24, top: 24, bottom: 12 }).layoutWeight(1).width('100%').scrollBar(BarState.Off)
        .id('dsh-messages').onTouch((event: TouchEvent) => { if (event.type === TouchType.Down) Keyboard.dismiss(this.getUIContext()); })
        .onDidScroll((offset: number, state: ScrollState) => { if (state !== ScrollState.Idle) this.followBottom = this.scroller.isAtEnd(); })
      if (this.pending !== null) this.questionPanel()
      else {
        Column({ space: 0 }) {
        Column({ space: 2 }) {
          TextArea({ text: this.draft, placeholder: '回复…' }).height(64).fontSize(16).padding({ left: 17, right: 17, top: 16, bottom: 4 }).borderRadius(22)
            .backgroundColor(Color.Transparent).fontColor($r('app.color.text_primary')).id('dsh-draft').onChange((text: string) => { this.draft = text; })
          ComposerToolbar({ side: this.composerSide,
            details: (): void => { this.composerDetails(); }, action: (): void => { this.composerAction(); } })
        }.width('100%').backgroundColor($r('app.color.surface')).border({ width: 0.7, color: $r('app.color.line') }).borderRadius(24)
        }.padding({ left: 14, right: 14, top: 8, bottom: 12 }).width('100%').backgroundColor($r('app.color.page_bg'))
      }
    }.width('100%').height('100%').backgroundColor($r('app.color.page_bg'))
  }
  @Builder private composerDetails() { Text(this.running ? '正在处理' : 'DSH Desktop').fontSize(12).fontColor($r('app.color.text_secondary')).layoutWeight(1).direction(Direction.Ltr) }
  @Builder private composerAction() {
    NativeComposerAction({ running: this.running, pending: this.sending, sendEnabled: this.draft.trim().length > 0,
      sendId: 'send-message', stopId: 'stop-message', onSend: () => { void this.send(); }, onStop: () => { void this.cancelTurn(); } })
  }
  @Builder private deviceHeader() { this.header('devices') }
  @Builder private pinHeader() { this.header('pin') }
  @Builder private sessionsHeader() { this.header('sessions') }
  @Builder private chatHeader() { this.header('chat') }
  @Builder private destination(name: string) {
    if (name === 'pin') {
      NavDestination() { this.pinPage() }
        .title({ builder: this.pinHeader, height: 60 }, HarmonyExperience.titleOptions()).systemBarStyle({ statusBarContentColor: this.chromeTextColor }).hideBackButton(true).backgroundColor($r('app.color.page_bg')).onBackPressed(() => this.back())
    } else if (name === 'sessions') {
      NavDestination() { this.sessionList() }
        .title({ builder: this.sessionsHeader, height: 60 }, HarmonyExperience.titleOptions()).systemBarStyle({ statusBarContentColor: this.chromeTextColor }).hideBackButton(true).backgroundColor($r('app.color.page_bg')).onBackPressed(() => this.back())
        .onShown(() => { if (this.screen === 'chat') this.showSessions(); })
    } else if (name === 'chat') {
      NavDestination() { this.chatPage() }
        .title({ builder: this.chatHeader, height: 60 }, HarmonyExperience.titleOptions()).systemBarStyle({ statusBarContentColor: this.chromeTextColor }).hideBackButton(true).backgroundColor($r('app.color.page_bg')).onBackPressed(() => this.back())
    }
  }
  build() {
    Stack() {
    PageBackdrop()
    Navigation(this.paths) { this.devices() }
      .navDestination(this.destination).title({ builder: this.deviceHeader, height: 60 }, HarmonyExperience.titleOptions())
      .onNavBarStateChange((visible: boolean) => { if (visible && this.paths.size() === 0 && this.screen !== 'devices') this.showDevices(); })
      .titleMode(NavigationTitleMode.Mini).hideBackButton(true).hideToolBar(true).mode(NavigationMode.Stack)
      .width('100%').height('100%').backgroundColor($r('app.color.page_bg'))
      .systemBarStyle({ statusBarContentColor: this.chromeTextColor })
    }.width('100%').height('100%').backgroundColor($r('app.color.page_bg'))
  }
}
