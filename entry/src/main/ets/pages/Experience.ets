import { HarmonyExperience } from '../platform/HarmonyExperience';
import { PageBackdrop } from '../components/PageBackdrop';

@Entry
@Component
struct Experience {
  @StorageLink('chromeTextColor') private chromeTextColor: string = '#30302E';
  @StorageLink('handMode') private mode: string = 'auto';
  @StorageLink('holdingNote') private note: string = '等待握持状态';
  @StorageLink('materialSupported') private material: boolean = false;
  @Builder private heading() {
    Row() {
      Button({ type: ButtonType.Normal }) { SymbolGlyph($r('sys.symbol.chevron_left')).fontSize(21).fontColor([$r('app.color.text_primary')]) }
        .height(44).width(44).backgroundColor(Color.Transparent).id('experience-back').accessibilityText('返回工作台').onClick(() => this.getUIContext().getRouter().back())
      Text('交互体验').fontSize(18).fontColor($r('app.color.text_primary')).layoutWeight(1)
    }.width('100%').height(60)
  }
  @Builder private body() {
    Scroll() {
      Column({ space: 18 }) {
        Text('智感握姿').fontSize(22).fontWeight(FontWeight.Medium).fontColor($r('app.color.text_primary')).width('100%')
        Text('让聊天的发送、停止按钮靠近握持侧。双手、未握持或无法识别时，使用右侧布局。').fontSize(14).lineHeight(24).fontColor($r('app.color.text_secondary')).width('100%')
        ForEach(['auto', 'left', 'right'], (mode: string) => {
          Button((this.mode === mode ? '● ' : '○ ') + (mode === 'auto' ? '自动跟随握姿' : mode === 'left' ? '固定左手' : '固定右手'), { type: ButtonType.Normal })
            .width('100%').height(48).borderRadius(24).backgroundColor(this.mode === mode ? $r('app.color.accent_soft') : $r('app.color.surface')).fontColor($r('app.color.text_primary'))
            .id('hand-' + mode).onClick(() => HarmonyExperience.setMode(mode))
        }, (mode: string) => mode)
        Text(this.mode === 'auto' ? this.note : '已使用手动布局，不监听握姿').fontSize(13).lineHeight(22).fontColor($r('app.color.text_secondary')).width('100%').id('holding-status')
        Text('握姿仅在应用前台使用，不保存或上传。自动识别需要设备支持；模拟器可使用手动布局。').fontSize(12).lineHeight(21).fontColor($r('app.color.text_secondary')).width('100%')
        Divider().color($r('app.color.line')).margin({ top: 12, bottom: 12 })
        Text('沉浸光感').fontSize(22).fontWeight(FontWeight.Medium).fontColor($r('app.color.text_primary')).width('100%')
        Text('导航标题栏、系统菜单、选择器和弹窗使用系统材质，效果跟随系统设置和设备能力。聊天正文保留清晰的阅读背景。').fontSize(14).lineHeight(24).fontColor($r('app.color.text_secondary')).width('100%')
        Text(this.material ? '已接入系统材质，实际效果由系统决定' : '当前系统或设备不支持，已使用常规背景').fontSize(13).lineHeight(22).fontColor($r('app.color.text_secondary')).width('100%').id('material-status')
      }.padding(26).width('100%').alignItems(HorizontalAlign.Start)
    }.width('100%').height('100%').scrollBar(BarState.Off)
  }
  build() { Stack() { PageBackdrop(); Navigation() { this.body() }.title({ builder: this.heading, height: 60 }, HarmonyExperience.titleOptions()).ignoreLayoutSafeArea([], []).systemBarStyle({ statusBarContentColor: this.chromeTextColor }).titleMode(NavigationTitleMode.Mini).hideBackButton(true).hideToolBar(true).mode(NavigationMode.Stack).width('100%').height('100%').backgroundColor($r('app.color.page_bg')) }.width('100%').height('100%').backgroundColor($r('app.color.page_bg')) }
}
