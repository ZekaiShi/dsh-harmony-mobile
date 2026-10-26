import { NativeCircleStyle } from './NativeCircleStyle';

// Title-bar actions share the native material and interaction by default.
// Mount in a Navigation/NavDestination title builder, not an arbitrary body row.
@Component
export struct NativeTitleAction {
  @Prop symbol: Resource = $r('sys.symbol.checkmark');
  @Prop label: string = '';
  @Prop controlId: string = '';
  @Prop available: boolean = true;
  @Prop pending: boolean = false;
  onAction: () => void = () => {};
  build() {
    Button({ type: ButtonType.Circle }) {
      if (this.pending) LoadingProgress().width(20).height(20).color($r('app.color.text_secondary'))
      else SymbolGlyph(this.symbol).fontSize(21).fontColor([$r('app.color.text_primary')])
    }.attributeModifier(new NativeCircleStyle(44, true)).id(this.controlId).accessibilityText(this.label)
      .enabled(this.available && !this.pending).onClick(() => this.onAction())
  }
}
