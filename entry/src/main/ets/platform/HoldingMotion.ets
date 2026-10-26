import { curves, UIContext } from '@kit.ArkUI';

export class HoldingMotion {
  static move(context: UIContext, update: () => void): void {
    context.animateTo({ duration: 380, curve: curves.cubicBezierCurve(0.4, 0.0, 0.2, 1.0) }, update);
  }
  static swap(context: UIContext, updateSide: () => void, updateLift: (lift: number) => void): void {
    HoldingMotion.move(context, updateSide);
    // A separate offset property lets the plus pass above the send button without colliding.
    context.keyframeAnimateTo({ iterations: 1 }, [
      { duration: 190, curve: Curve.EaseOut, event: () => updateLift(-56) },
      { duration: 190, curve: Curve.EaseIn, event: () => updateLift(0) }
    ]);
  }
}
