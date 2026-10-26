// Shared native popup: three equal rows, without a second explanatory dialog.
@Builder
export function ExportOptions(select: (format: string) => void) {
  Menu() {
    MenuItem({ content: '长图 PNG' }).height(48).id('export-png').onClick(() => { select('png'); })
    MenuItem({ content: 'Markdown' }).height(48).id('export-md').onClick(() => { select('md'); })
    MenuItem({ content: 'PDF' }).height(48).id('export-pdf').onClick(() => { select('pdf'); })
  }.width(200)
}
