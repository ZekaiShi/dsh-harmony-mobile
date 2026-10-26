import { UIAbility, Configuration } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { HarmonyExperience } from '../platform/HarmonyExperience';

export default class EntryAbility extends UIAbility {
  private mainWindow: window.Window | undefined;
  private layoutInitialized: boolean = false;
  private themeColor(name: string): string {
    return '#' + (this.context.resourceManager.getColorByNameSync(name) >>> 0).toString(16).padStart(8, '0');
  }
  private async syncWindowColors(): Promise<void> {
    if (!this.mainWindow) return;
    try {
      const background = this.themeColor('page_bg'), foreground = this.themeColor('text_primary');
      AppStorage.setOrCreate('chromeTextColor', foreground);
      this.mainWindow.setWindowBackgroundColor(background);
      // Let the system fit interactive content below/above its bars. Matching
      // bar colours keep one canvas without relying on fullscreen safe-area
      // negotiation, which can shift a visible destination after resume.
      if (!this.layoutInitialized) { this.layoutInitialized = true; await this.mainWindow.setWindowLayoutFullScreen(false); }
      await this.mainWindow.setWindowSystemBarProperties({ statusBarColor: background, navigationBarColor: background,
        statusBarContentColor: foreground, navigationBarContentColor: foreground });
    } catch (_) {}
  }
  onWindowStageCreate(windowStage: window.WindowStage): void {
    HarmonyExperience.initialize(this.context);
    try {
      this.mainWindow = windowStage.getMainWindowSync();
      this.layoutInitialized = false;
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
