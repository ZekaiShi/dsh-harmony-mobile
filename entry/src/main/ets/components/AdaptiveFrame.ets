@Component
export struct AdaptiveFrame {
  @Prop maxWidth: number = 760;
  @BuilderParam content: () => void;
  build() {
    Row() {
      Column() { this.content() }.width('100%').constraintSize({ maxWidth: this.maxWidth }).height('100%')
    }.width('100%').height('100%').justifyContent(FlexAlign.Center)
  }
}
