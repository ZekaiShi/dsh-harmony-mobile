import { InlinePart, MessageFormat, TextSection, TableRow, TableCell } from '../core/MessageFormat';
import { MessageLink } from '../core/MessageLink';
import { pasteboard } from '@kit.BasicServicesKit';
import { TableLayout } from '../core/TableLayout';

@Component
export struct MarkdownView {
  @Prop @Watch('parse') content: string = '';
  @State private sections: TextSection[] = [];
  @State private availableWidth: number = 0;
  private tableWidths: number[][] = [];
  private tableTotals: number[] = [];
  onLink: (href: string) => void = () => {};
  aboutToAppear(): void { this.parse(); }
  private parse(): void {
    const sections = MessageFormat.sections(this.content);
    this.tableWidths = sections.map((section: TextSection) => TableLayout.widths(section.rows));
    this.tableTotals = this.tableWidths.map((widths: number[]) => widths.reduce((sum: number, width: number) => sum + width, 0));
    this.sections = sections;
  }
  private textSize(section: TextSection): number { return section.kind === 'heading' ? section.level === 1 ? 22 : section.level === 2 ? 19 : 17 : 15; }
  private copy(text: string): void {
    pasteboard.getSystemPasteboard().setData(pasteboard.createData(pasteboard.MIMETYPE_TEXT_PLAIN, text))
      .then(() => { this.getUIContext().getPromptAction().showToast({ message: '已复制' }); })
      .catch(() => { this.getUIContext().getPromptAction().showToast({ message: '复制失败，请长按代码复制' }); });
  }
  private cellSection(cell: TableCell, header: boolean): TextSection {
    const section = new TextSection(); section.parts = cell.parts; section.kind = header ? 'table-header' : 'table-cell'; return section;
  }
  @Builder
  private prose(section: TextSection) {
    Text() {
      ForEach(section.parts, (part: InlinePart, index: number) => {
        if (part.href && MessageLink.parse(part.href).kind === 'file' && (index === 0 || section.parts[index - 1].href !== part.href)) {
          SymbolSpan($r('sys.symbol.doc')).fontSize(13).fontColor([$r('app.color.link')])
        }
        Span(part.style === 'code' ? '\u202F' + part.text + '\u202F' : part.text)
          .fontSize(part.style === 'code' ? 12.5 : this.textSize(section))
          .fontWeight(part.bold || section.kind === 'heading' || section.kind === 'table-header' ? FontWeight.Bold : FontWeight.Normal)
          .fontFamily(part.style === 'code' ? 'monospace' : 'HarmonyOS Sans')
          .fontStyle(part.italic ? FontStyle.Italic : FontStyle.Normal)
          .fontColor(part.href && MessageLink.parse(part.href).kind !== 'blocked' ? $r('app.color.link') : section.kind === 'quote' ? $r('app.color.text_secondary') : $r('app.color.text_primary'))
          .textBackgroundStyle({ color: part.style === 'code' ? $r('app.color.code_bg') : Color.Transparent, radius: 4 })
          .decoration({ type: part.strike ? TextDecorationType.LineThrough : TextDecorationType.None })
          .onClick(() => { if (part.href) this.onLink(part.href); })
      }, (part: InlinePart, index: number) => index.toString() + ':' + part.text + ':' + part.href + ':' + part.bold)
    }.fontSize(this.textSize(section)).lineHeight(section.kind === 'heading' ? 28 : 25).fontColor($r('app.color.text_primary'))
      .wordBreak(WordBreak.BREAK_WORD).lineBreakStrategy(LineBreakStrategy.GREEDY).copyOption(CopyOptions.LocalDevice).width('100%')
  }
  build() {
    Column({ space: 0 }) {
      ForEach(this.sections, (section: TextSection, index: number) => {
        Column({ space: 0 }) {
          if (section.kind === 'code') {
            Column({ space: 0 }) {
              Row() {
                Text(section.language || '代码').fontSize(11).fontColor($r('app.color.text_secondary')).layoutWeight(1)
                Button('复制', { type: ButtonType.Normal }).height(32).fontSize(11).backgroundColor(Color.Transparent).fontColor($r('app.color.text_secondary'))
                  .onClick(() => { this.copy(section.text); })
              }.width('100%').padding({ left: 12, right: 4 }).border({ width: { bottom: 0.5 }, color: $r('app.color.line') })
              Scroll() {
                Text(section.text).fontFamily('monospace').fontSize(12.5).lineHeight(21).fontColor($r('app.color.text_primary')).copyOption(CopyOptions.LocalDevice).padding(12)
              }.scrollable(ScrollDirection.Horizontal).width('100%').align(Alignment.Start)
            }.width('100%').backgroundColor($r('app.color.code_bg')).border({ width: 0.5, color: $r('app.color.line') }).borderRadius(10).clip(true)
          } else if (section.kind === 'list') {
            Row({ space: 7 }) {
              Text(section.marker).fontSize(14).lineHeight(25).fontColor($r('app.color.text_secondary')).width(section.marker.length > 2 ? 26 : 15).textAlign(TextAlign.End)
              Column() { this.prose(section) }.layoutWeight(1)
            }.width('100%').alignItems(VerticalAlign.Top).padding({ left: section.level * 14 })
          } else if (section.kind === 'quote') {
            Column() { this.prose(section) }.width('100%').padding({ left: 13, right: 4 }).border({ width: { left: 2 }, color: $r('app.color.line') })
          } else if (section.kind === 'rule') {
            Divider().color($r('app.color.line')).strokeWidth(0.7).margin({ top: 5, bottom: 5 })
          } else if (section.kind === 'table') {
            Scroll() {
              Column({ space: 0 }) {
                ForEach(section.rows, (row: TableRow, rowIndex: number) => {
                  Flex({ direction: FlexDirection.Row, alignItems: ItemAlign.Stretch }) {
                    ForEach(row.cells, (cell: TableCell, cellIndex: number) => {
                      Column() { this.prose(this.cellSection(cell, rowIndex === 0)) }.width(this.tableWidths[index][cellIndex]).flexShrink(0).padding(10)
                        .justifyContent(FlexAlign.Start).alignItems(HorizontalAlign.Start).id('md-table-' + index + '-cell-' + rowIndex + '-' + cellIndex)
                        .backgroundColor(rowIndex === 0 ? $r('app.color.code_bg') : Color.Transparent)
                        .border({ width: 0.5, color: $r('app.color.line') })
                    }, (cell: TableCell, cellIndex: number) => cellIndex.toString())
                  }.width(this.tableTotals[index]).id('md-table-' + index + '-row-' + rowIndex)
                }, (row: TableRow, rowIndex: number) => rowIndex.toString())
              }.width(this.tableTotals[index])
            }.scrollable(ScrollDirection.Horizontal).scrollBar(BarState.Auto).width('100%').align(Alignment.Start).id('md-table-' + index)
            if (this.availableWidth > 0 && this.tableTotals[index] > this.availableWidth + 1) {
              Text('左右滑动查看完整表格').fontSize(11).fontColor($r('app.color.text_secondary')).margin({ top: 6 })
            }
          } else this.prose(section)
        }.width('100%').alignItems(HorizontalAlign.Start).margin({ top: index === 0 ? 0 : section.gap })
      }, (section: TextSection, index: number) => index.toString() + ':' + section.kind + ':' + section.text + ':' + JSON.stringify(section.rows))
    }.width('100%').alignItems(HorizontalAlign.Start).onSizeChange((oldSize: SizeOptions, newSize: SizeOptions) => {
      const width = Number(newSize.width); if (Math.abs(width - this.availableWidth) > 1) this.availableWidth = width;
    })
  }
}
