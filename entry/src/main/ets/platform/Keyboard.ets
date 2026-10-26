import { inputMethod } from '@kit.IMEKit';
import { UIContext } from '@kit.ArkUI';

export class Keyboard {
  static dismiss(context: UIContext): void {
    try { context.getFocusController().clearFocus(); } catch (_) {}
    try { inputMethod.getController().hideTextInput().catch(() => {}); } catch (_) {}
  }
}
