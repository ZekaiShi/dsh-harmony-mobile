import { UIAbility, Configuration } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { HarmonyExperience } from '../platform/HarmonyExperience';

export default class EntryAbility extends UIAbility {
  private mainWindow: window.Window | undefined;
  private themeColor(name: string): string {
    return '#' + (this.context.resourceManager.getColorByNameSync(name) >>> 0).toString(16).padStart(8, '0');
  }
  private syncWindowColors(): void {
    if (!this.mainWindow) return;
    try {
      const background = this.themeColor('page_bg'), foreground = this.themeColor('text_primary');
      this.mainWindow.setWindowBackgroundColor(background);
      this.mainWindow.setWindowSystemBarProperties({ statusBarColor: background, navigationBarColor: background,
        statusBarContentColor: foreground, navigationBarContentColor: foreground }).catch(() => {});
    } catch (_) {}
  }
  onWindowStageCreate(windowStage: window.WindowStage): void {
    HarmonyExperience.initialize(this.context);
    try {
      this.mainWindow = windowStage.getMainWindowSync();
      this.syncWindowColors();
      windowStage.loadContent('pages/Index', (error) => {
        if (error.code !== 0) hilog.error(0x0000, 'DSHConnect', 'Page initialization failed.');
      });
    } catch (_) {
      hilog.error(0x0000, 'DSHConnect', 'Unable to initialize the application page.');
    }
  }
  onForeground(): void { HarmonyExperience.setForeground(true); this.syncWindowColors(); }
  onConfigurationUpdate(configuration: Configuration): void { this.syncWindowColors(); }
  onBackground(): void { HarmonyExperience.setForeground(false); }
  onDestroy(): void { HarmonyExperience.setForeground(false); }
}
