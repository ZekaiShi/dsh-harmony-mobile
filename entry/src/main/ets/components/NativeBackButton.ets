import { NativeCircleStyle } from './NativeCircleStyle';

@Component
export struct NativeBackButton {
  @Prop controlId: string = 'back';
  onBack: () => void = () => {};
  build() {
    Button({ type: ButtonType.Circle }) {
      SymbolGlyph($r('sys.symbol.chevron_left')).fontSize(21).fontColor([$r('app.color.text_primary')])
    }.attributeModifier(new NativeCircleStyle(44, true)).id(this.controlId).accessibilityText('返回').onClick(() => this.onBack())
  }
}
