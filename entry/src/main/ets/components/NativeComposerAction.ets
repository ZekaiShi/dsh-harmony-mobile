import { deviceInfo } from '@kit.BasicServicesKit';
import { uiMaterial } from '@kit.ArkUI';
import { HarmonyExperience } from '../platform/HarmonyExperience';

// Toggle's button form is an explicitly supported full-page native material host.
class NativeToggleMaterial implements AttributeModifier<ToggleAttribute> {
  applyNormalAttribute(toggle: ToggleAttribute): void {
    toggle.width(44).height(44).aspectRatio(1).padding(0).borderRadius(22).clip(true)
      .backgroundColor($r('app.color.ink')).selectedColor($r('app.color.ink'));
    if (deviceInfo.sdkApiVersion >= 26) {
      try {
        if (uiMaterial.isImmersiveMaterialSupported() && uiMaterial.getMaterialInfo().state !== uiMaterial.MaterialState.DISABLE) {
          toggle.backgroundColor(Color.Transparent).selectedColor(Color.Transparent)
            .systemMaterial(new uiMaterial.ImmersiveMaterial({ style: uiMaterial.ImmersiveStyle.THIN, interactive: true, lightEffect: {} }));
        }
      } catch (_) {}
    }
  }
  applyDisabledAttribute(toggle: ToggleAttribute): void { this.applyNormalAttribute(toggle); }
}

@Component
export struct NativeComposerAction {
  @Prop @Watch('sync') running: boolean = false;
  @Prop @Watch('sync') pending: boolean = false;
  @Prop sendEnabled: boolean = false;
  @Prop sendId: string = '';
  @Prop stopId: string = '';
  onSend: () => void = () => {};
  onStop: () => void = () => {};
  @State private selected: boolean = false;
  @State private nativeMaterial: boolean = false;
  private settleTimer: number = -1;
  aboutToAppear(): void { this.nativeMaterial = HarmonyExperience.materialSupported(); this.sync(); }
  aboutToDisappear(): void { clearTimeout(this.settleTimer); }
  private sync(): void { this.selected = this.running || this.pending; }
  private change(value: boolean): void {
    this.selected = value;
    if (value && !this.running && !this.pending && this.sendEnabled) this.onSend();
    else if (!value && this.running) this.onStop();
    // Restore the actual operation state even if an immediate validation failure
    // coalesces the parent's busy=true/false updates into one render frame.
    clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(() => this.sync(), 0);
  }
  build() {
    Toggle({ type: ToggleType.Button, isOn: this.selected }) {
      SymbolGlyph(this.running ? $r('sys.symbol.square_fill') : $r('sys.symbol.arrow_up'))
        .fontSize(this.running ? 14 : 20)
        .fontColor([this.nativeMaterial ? $r('app.color.text_primary') : $r('app.color.on_ink')])
    }.attributeModifier(new NativeToggleMaterial()).flexShrink(0)
      .id(this.running ? this.stopId : this.sendId)
      .accessibilityText(this.running ? '停止回复' : this.pending ? '发送中' : '发送消息')
      .enabled(this.running || (!this.pending && this.sendEnabled))
      .opacity(this.running || this.sendEnabled ? 1 : 0.55)
      .onChange((value: boolean) => this.change(value))
  }
}
