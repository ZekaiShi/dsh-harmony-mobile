@Entry
@Component
struct Index {
  @Builder private dashboard() {
    Column({ space: 24 }) {
      Row({ space: 12 }) {
        Image($r('app.media.app_icon')).width(40).height(40).borderRadius(12)
        Column({ space: 4 }) {
          Text('DSH Connect').fontSize(23).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary'))
          Text('手机聊天，电脑执行').fontSize(12).fontColor($r('app.color.text_secondary'))
        }.alignItems(HorizontalAlign.Start)
      }.width('100%').margin({ top: 20 })
      Blank().layoutWeight(0.4)
      Text('想先做点什么？').fontSize(31).fontWeight(FontWeight.Medium).fontColor($r('app.color.text_primary')).width('100%')
      Text('随手问一个问题，或让电脑继续手头的工作。').fontSize(15).lineHeight(25).fontColor($r('app.color.text_secondary')).width('100%')
      Button({ type: ButtonType.Normal }) {
        Row({ space: 16 }) {
          SymbolGlyph($r('sys.symbol.ellipsis_message')).fontSize(27).fontColor([$r('app.color.accent')])
          Column({ space: 7 }) {
            Text('独立 AI 聊天').fontSize(19).fontWeight(FontWeight.Medium).fontColor($r('app.color.text_primary'))
            Text('自带模型 API · 本机会话 · 离线查阅').fontSize(12).fontColor($r('app.color.text_secondary'))
          }.alignItems(HorizontalAlign.Start).layoutWeight(1)
          SymbolGlyph($r('sys.symbol.chevron_right')).fontSize(13).fontColor([$r('app.color.text_secondary')])
        }.padding(22).width('100%')
      }.width('100%').borderRadius(22).backgroundColor($r('app.color.surface')).id('open-assistant').accessibilityText('独立 AI 聊天').onClick(() => { void this.getUIContext().getRouter().pushUrl({ url: 'pages/Assistant' }); })
      Button({ type: ButtonType.Normal }) {
        Row({ space: 16 }) {
          SymbolGlyph($r('sys.symbol.picture')).fontSize(27).fontColor([$r('app.color.accent')])
          Column({ space: 7 }) {
            Text('图像工作室').fontSize(19).fontWeight(FontWeight.Medium).fontColor($r('app.color.text_primary'))
            Text('文生图 · 参考图编辑 · 图片问答').fontSize(12).fontColor($r('app.color.text_secondary'))
          }.alignItems(HorizontalAlign.Start).layoutWeight(1)
          SymbolGlyph($r('sys.symbol.chevron_right')).fontSize(13).fontColor([$r('app.color.text_secondary')])
        }.padding(22).width('100%')
      }.width('100%').borderRadius(22).backgroundColor($r('app.color.surface')).id('open-media').onClick(() => { void this.getUIContext().getRouter().pushUrl({ url: 'pages/Media' }); })
      Button({ type: ButtonType.Normal }) {
        Row({ space: 16 }) {
          SymbolGlyph($r('sys.symbol.code_square')).fontSize(27).fontColor([$r('app.color.accent')])
          Column({ space: 7 }) {
            Text('连接电脑').fontSize(19).fontWeight(FontWeight.Medium).fontColor($r('app.color.text_primary'))
            Text('DSH 现有二维码 · 远程任务与确认').fontSize(12).fontColor($r('app.color.text_secondary'))
          }.alignItems(HorizontalAlign.Start).layoutWeight(1)
          SymbolGlyph($r('sys.symbol.chevron_right')).fontSize(13).fontColor([$r('app.color.text_secondary')])
        }.padding(22).width('100%')
      }.width('100%').borderRadius(22).backgroundColor($r('app.color.surface')).id('open-desktop').accessibilityText('连接电脑').onClick(() => { void this.getUIContext().getRouter().pushUrl({ url: 'pages/Desktop' }); })
      Blank().layoutWeight(1)
      Button('交互体验 · 握姿与光感', { type: ButtonType.Normal }).height(40).fontSize(12).backgroundColor(Color.Transparent).fontColor($r('app.color.text_secondary')).id('open-experience')
        .onClick(() => { void this.getUIContext().getRouter().pushUrl({ url: 'pages/Experience' }); })
      Text('社区客户端 · 独立模式与电脑模式分别管理数据').fontSize(11).lineHeight(20).fontColor($r('app.color.text_secondary')).textAlign(TextAlign.Center)
    }.padding(26).width('100%').height('100%').backgroundColor($r('app.color.page_bg'))
  }
  build() {
    Stack() {
      Column().width('100%').height('100%').backgroundColor($r('app.color.page_bg'))
        .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM]).hitTestBehavior(HitTestMode.None)
      this.dashboard()
    }.width('100%').height('100%').backgroundColor($r('app.color.page_bg'))
  }
}
