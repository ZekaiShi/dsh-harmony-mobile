import { uiMaterial } from '@kit.ArkUI';
import { deviceInfo } from '@kit.BasicServicesKit';

// Native immersive material is only requested in documented eligible regions.
// Unsupported regions/devices retain an ordinary circle; there is no simulated glass.
export class NativeCircleStyle implements AttributeModifier<ButtonAttribute> {
  private diameter: number;
  private nativeRegion: boolean;
  constructor(diameter: number = 48, nativeRegion: boolean = false) {
    this.diameter = diameter; this.nativeRegion = nativeRegion;
  }
  applyNormalAttribute(button: ButtonAttribute): void {
    button.width(this.diameter).height(this.diameter).aspectRatio(1).padding(0).flexShrink(0)
      .backgroundColor($r('app.color.surface')).borderRadius(this.diameter / 2).clip(true)
      .buttonStyle(ButtonStyleMode.NORMAL).stateEffect(true);
    if (deviceInfo.sdkApiVersion >= 26) {
      try {
        if (this.nativeRegion && uiMaterial.isImmersiveMaterialSupported() && uiMaterial.getMaterialInfo().state !== uiMaterial.MaterialState.DISABLE) {
          button.backgroundColor(Color.Transparent).systemMaterial(new uiMaterial.ImmersiveMaterial({
            style: uiMaterial.ImmersiveStyle.THIN, interactive: true, lightEffect: {}, applyShadow: true
          }));
        }
      } catch (_) {}
    }
  }
  applyDisabledAttribute(button: ButtonAttribute): void { this.applyNormalAttribute(button); }
}
