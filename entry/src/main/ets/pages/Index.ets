import { AdaptiveMetrics, ResponsiveLayout } from '../core/ResponsiveLayout';
import { PageBackdrop } from '../components/PageBackdrop';

@Entry
@Component
struct Index {
  @State private layout: AdaptiveMetrics = ResponsiveLayout.measure(360, 800);
  @Builder private card(title: string, detail: string, symbol: Resource, id: string, page: string) {
    Button({ type: ButtonType.Normal }) {
      Row({ space: 12 }) {
        SymbolGlyph(symbol).fontSize(27).fontColor([$r('app.color.accent')]).flexShrink(0)
        Column({ space: 7 }) {
          Text(title).fontSize(19).fontWeight(FontWeight.Medium).fontColor($r('app.color.text_primary')).maxLines(2)
          Text(detail).fontSize(12).lineHeight(20).fontColor($r('app.color.text_secondary')).maxLines(2)
        }.alignItems(HorizontalAlign.Start).layoutWeight(1)
        SymbolGlyph($r('sys.symbol.chevron_right')).fontSize(13).fontColor([$r('app.color.text_secondary')]).flexShrink(0)
      }.padding(20).width('100%').constraintSize({ minHeight: 112 })
    }.width(this.layout.card).borderRadius(22).backgroundColor($r('app.color.surface')).margin({ bottom: 16 })
      .id(id).accessibilityText(title).onClick(() => { void this.getUIContext().getRouter().pushUrl({ url: page }); })
  }
  @Builder private dashboard() {
    Scroll() {
      Column({ space: this.layout.compact ? 16 : 24 }) {
        Row({ space: 12 }) {
          Image($r('app.media.app_icon')).width(40).height(40).borderRadius(12)
          Column({ space: 4 }) {
            Text('DSH Connect').fontSize(23).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary'))
            Text('手机聊天，电脑执行').fontSize(12).fontColor($r('app.color.text_secondary'))
          }.alignItems(HorizontalAlign.Start)
        }.width('100%').margin({ top: this.layout.compact ? 4 : 20, bottom: this.layout.compact ? 4 : 20 })
        Text('想先做点什么？').fontSize(this.layout.compact ? 27 : 31).fontWeight(FontWeight.Medium).fontColor($r('app.color.text_primary')).width('100%')
        Text('随手问一个问题，或让电脑继续手头的工作。').fontSize(15).lineHeight(25).fontColor($r('app.color.text_secondary')).width('100%')
        Flex({ wrap: FlexWrap.Wrap, justifyContent: FlexAlign.SpaceBetween }) {
          this.card('独立 AI 聊天', '自带模型 API · 本机会话 · 离线查阅', $r('sys.symbol.ellipsis_message'), 'open-assistant', 'pages/Assistant')
          this.card('图像工作室', '文生图 · 参考图编辑 · 图片问答', $r('sys.symbol.picture'), 'open-media', 'pages/Media')
          this.card('连接电脑', 'DSH 现有二维码 · 远程任务与确认', $r('sys.symbol.code_square'), 'open-desktop', 'pages/Desktop')
        }.width('100%')
        Button('交互体验 · 握姿与光感', { type: ButtonType.Normal }).height(44).fontSize(12).backgroundColor(Color.Transparent).fontColor($r('app.color.text_secondary')).id('open-experience')
          .onClick(() => { void this.getUIContext().getRouter().pushUrl({ url: 'pages/Experience' }); })
        Text('社区客户端 · 独立模式与电脑模式分别管理数据').fontSize(11).lineHeight(20).fontColor($r('app.color.text_secondary')).textAlign(TextAlign.Center)
      }.padding(this.layout.gutter).width(this.layout.dashboard).alignItems(HorizontalAlign.Start)
    }.width('100%').height('100%').scrollBar(BarState.Off).align(Alignment.Top)
  }
  build() {
    Stack() { PageBackdrop(); this.dashboard() }.width('100%').height('100%').backgroundColor($r('app.color.page_bg'))
      .onSizeChange((oldSize: SizeOptions, size: SizeOptions) => { this.layout = ResponsiveLayout.measure(Number(size.width), Number(size.height)); })
  }
}
