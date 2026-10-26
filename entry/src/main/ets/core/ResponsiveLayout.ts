// Use window vp, never screen pixels or a hard-coded device model.
export class AdaptiveMetrics {
  width: number = 360; height: number = 800; compact: boolean = false; tight: boolean = false;
  gutter: number = 20; sidebar: number = 0; chat: number = 360;
  form: number = 360; gallery: number = 360; dashboard: number = 360;
  homeColumns: number = 1; card: number = 320;
}
export class ResponsiveLayout {
  static measure(width: number, height: number): AdaptiveMetrics {
    const value = new AdaptiveMetrics();
    value.width = Number.isFinite(width) && width > 0 ? width : 360;
    value.height = Number.isFinite(height) && height > 0 ? height : 800;
    value.compact = value.height < 520;
    value.tight = value.height < 300;
    value.gutter = value.width < 360 ? 12 : value.width < 600 ? 20 : 28;
    value.sidebar = value.width >= 960 ? 280 : value.width >= 700 ? 240 : 0;
    value.chat = Math.min(820, Math.max(0, value.width - value.sidebar));
    value.form = Math.min(760, value.width); value.gallery = Math.min(1160, value.width); value.dashboard = Math.min(1160, value.width);
    value.homeColumns = value.width >= 960 ? 3 : value.width >= 600 ? 2 : 1;
    value.card = Math.max(0, (value.dashboard - 2 * value.gutter - (value.homeColumns - 1) * 16) / value.homeColumns);
    return value;
  }
  static galleryColumns(width: number): number { return width >= 960 ? 3 : width >= 560 ? 2 : 1; }
  static imageCard(width: number): number { const columns = this.galleryColumns(width); return Math.max(0, (width - (columns - 1) * 16) / columns); }
}
