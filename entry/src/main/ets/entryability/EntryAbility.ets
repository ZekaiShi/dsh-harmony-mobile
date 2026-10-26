import { UIAbility, Configuration } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { HarmonyExperience } from '../platform/HarmonyExperience';

export default class EntryAbility extends UIAbility {
  private mainWindow: window.Window | undefined;
  private themeColor(name: string): string {
    return '#' + (this.context.resourceManager.getColorByNameSync(name) >>> 0).toString(16).padStart(8, '0');
  }
  private async syncWindowColors(): Promise<void> {
    if (!this.mainWindow) return;
    try {
      const background = this.themeColor('page_bg'), foreground = this.themeColor('text_primary');
      AppStorage.setOrCreate('chromeTextColor', foreground);
      this.mainWindow.setWindowBackgroundColor(background);
      await this.mainWindow.setWindowLayoutFullScreen(true);
      await this.mainWindow.setWindowSystemBarProperties({ statusBarColor: '#00000000', navigationBarColor: '#00000000',
        statusBarContentColor: foreground, navigationBarContentColor: foreground });
    } catch (_) {}
  }
  onWindowStageCreate(windowStage: window.WindowStage): void {
    HarmonyExperience.initialize(this.context);
    try {
      this.mainWindow = windowStage.getMainWindowSync();
      // Finish the window setup before displaying the first application frame.
      this.syncWindowColors().then(() => {
        windowStage.loadContent('pages/Index', (error) => {
          if (error.code !== 0) hilog.error(0x0000, 'DSHConnect', 'Page initialization failed.');
        });
      });
    } catch (_) {
      hilog.error(0x0000, 'DSHConnect', 'Unable to initialize the application page.');
    }
  }
  onForeground(): void { HarmonyExperience.setForeground(true); void this.syncWindowColors(); }
  onConfigurationUpdate(configuration: Configuration): void { void this.syncWindowColors(); }
  onBackground(): void { HarmonyExperience.setForeground(false); }
  onDestroy(): void { HarmonyExperience.setForeground(false); }
}
