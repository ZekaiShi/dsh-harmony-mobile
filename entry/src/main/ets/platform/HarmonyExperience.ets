import { motion } from '@kit.MultimodalAwarenessKit';
import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { deviceInfo, BusinessError } from '@kit.BasicServicesKit';
import { uiMaterial } from '@kit.ArkUI';
import { InteractionPolicy } from '../core/InteractionPolicy';

// Only UI preferences are persisted. Sensor states stay in memory and never leave the device.
export class HarmonyExperience {
  private static prefs: preferences.Preferences | undefined;
  private static foreground: boolean = false;
  private static subscribed: boolean = false;
  private static timer: number = -1;
  private static generation: number = 0;
  private static callback: (status: motion.HoldingHandStatus) => void = (status: motion.HoldingHandStatus) => {
    clearTimeout(HarmonyExperience.timer);
    const generation = HarmonyExperience.generation;
    HarmonyExperience.timer = setTimeout(() => {
      if (!HarmonyExperience.subscribed || !HarmonyExperience.foreground || generation !== HarmonyExperience.generation) return;
      AppStorage.setOrCreate('holdingStatus', status);
      AppStorage.setOrCreate('holdingNote', InteractionPolicy.holdingLabel(status));
      HarmonyExperience.publish();
    }, 400);
  };
  static initialize(context: common.Context): void {
    let mode = 'auto';
    try {
      HarmonyExperience.prefs = preferences.getPreferencesSync(context, { name: 'interaction-ui' });
      mode = InteractionPolicy.mode(HarmonyExperience.prefs.getSync('handMode', 'auto') as string);
    } catch (_) {}
    AppStorage.setOrCreate('handMode', mode);
    AppStorage.setOrCreate('holdingStatus', 16);
    AppStorage.setOrCreate('holdingNote', '等待握持状态');
    AppStorage.setOrCreate('leftControls', mode === 'left');
    AppStorage.setOrCreate('materialSupported', HarmonyExperience.materialSupported());
  }
  static materialSupported(): boolean {
    try { return deviceInfo.sdkApiVersion >= 26 && uiMaterial.isImmersiveMaterialSupported() && uiMaterial.getMaterialInfo().state !== uiMaterial.MaterialState.DISABLE; }
    catch (_) { return false; }
  }
  static titleOptions(): NavigationTitleOptions {
    // Material belongs to the individual title buttons. A material covering the
    // entire bar introduces a tinted strip against the chat canvas in motion.
    return { backgroundColor: $r('app.color.page_bg'), barStyle: BarStyle.STANDARD };
  }
  static setMode(value: string): void {
    const mode = InteractionPolicy.mode(value);
    if (AppStorage.get<string>('handMode') === mode) return;
    AppStorage.setOrCreate('handMode', mode);
    try { HarmonyExperience.prefs?.putSync('handMode', mode); HarmonyExperience.prefs?.flush().catch(() => {}); } catch (_) {}
    HarmonyExperience.stop();
    HarmonyExperience.publish();
    if (HarmonyExperience.foreground) HarmonyExperience.start();
  }
  static setForeground(value: boolean): void {
    HarmonyExperience.foreground = value;
    if (value) { AppStorage.setOrCreate('materialSupported', HarmonyExperience.materialSupported()); HarmonyExperience.start(); }
    else HarmonyExperience.stop();
  }
  private static publish(): void {
    const left = InteractionPolicy.left(AppStorage.get<string>('handMode') || 'auto', AppStorage.get<number>('holdingStatus') ?? 16);
    if (AppStorage.get<boolean>('leftControls') !== left) AppStorage.setOrCreate('leftControls', left);
  }
  private static start(): void {
    if (HarmonyExperience.subscribed || AppStorage.get<string>('handMode') !== 'auto') return;
    if (!canIUse('SystemCapability.MultimodalAwareness.Motion')) {
      AppStorage.setOrCreate('holdingNote', '当前设备不支持握姿识别，可手动选择'); return;
    }
    try {
      if (canIUse('SystemCapability.MultimodalAwareness.Motion')) motion.on('holdingHandChanged', HarmonyExperience.callback);
      HarmonyExperience.subscribed = true;
      AppStorage.setOrCreate('holdingNote', '等待握持状态');
    } catch (error) {
      const code = (error as BusinessError).code;
      AppStorage.setOrCreate('holdingNote', code === 201 ? '握姿权限不可用，可手动选择' : code === 801 ? '当前设备不支持握姿识别，可手动选择' : '握姿服务暂不可用，可手动选择');
    }
  }
  private static stop(): void {
    HarmonyExperience.generation++; clearTimeout(HarmonyExperience.timer);
    if (HarmonyExperience.subscribed) {
      HarmonyExperience.subscribed = false;
      try { if (canIUse('SystemCapability.MultimodalAwareness.Motion')) motion.off('holdingHandChanged', HarmonyExperience.callback); } catch (_) {}
    }
    AppStorage.setOrCreate('holdingStatus', 16); HarmonyExperience.publish();
  }
}
