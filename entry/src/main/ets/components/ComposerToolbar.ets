@Component
export struct ComposerToolbar {
  @Builder private empty() {}
  @Prop side: number = 1;
  @BuilderParam details: () => void = this.empty;
  @BuilderParam action: () => void = this.empty;
  @State private measuredWidth: number = 0;
  build() {
    Column() {
      Stack({ alignContent: Alignment.TopStart }) {
        Row({ space: 5 }) { this.details() }.width('calc(100% - 49vp)').height(44)
          .translate({ x: 49 * (1 - this.side) })
        Row() { this.action() }.width(44).height(44)
          .translate({ x: Math.max(0, this.measuredWidth - 44) * this.side })
          .visibility(this.measuredWidth > 0 ? Visibility.Visible : Visibility.Hidden)
      }.width('100%').height(44).direction(Direction.Ltr)
        .onAreaChange((oldArea: Area, newArea: Area) => { const width = Number.parseFloat(String(newArea.width)); if (Number.isFinite(width) && width !== this.measuredWidth) this.measuredWidth = width; })
    }.width('100%').padding({ left: 10, right: 10, bottom: 10 })
  }
}
