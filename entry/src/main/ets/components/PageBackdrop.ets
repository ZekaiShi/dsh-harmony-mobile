// Only the canvas extends under system bars; interactive content keeps its safe
// area. Every route paints this layer, including while a native transition runs.
@Builder
export function PageBackdrop() {
  Column().width('100%').height('100%').backgroundColor($r('app.color.page_bg'))
    .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
    .hitTestBehavior(HitTestMode.None)
}
