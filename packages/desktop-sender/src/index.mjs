// Human-command sender. It deliberately owns no HTTP listener, model client,
// filesystem access, credentials, QR implementation, or mobile UI.
export const name = 'harmony-mobile-sender';
export const inject = ['commands'];
export const MAX_BYTES = 16 * 1024;

export function sendText({ rawInput, attachments = [], signal }) {
  if (signal?.aborted) return { kind: 'error', text: '发送已取消。' };
  if (attachments.length) return { kind: 'error', text: '此命令仅发送文字；附件请使用 DSH 原有会话功能。' };
  if (typeof rawInput !== 'string' || !rawInput.trim()) return { kind: 'error', text: '请输入 /harmony-send 要发给手机的文字。' };
  const text = rawInput.trim();
  if (Buffer.byteLength(text, 'utf8') > MAX_BYTES) return { kind: 'error', text: '单次文字超过 16 KiB，请分段发送。' };
  // The official command runtime persists this result as command/done, paired
  // with command/run by commandId. The existing bridge carries those events.
  // No new/unknown Session event schema and no model request are introduced.
  return { kind: 'success', text };
}

export function apply(ctx) {
  if (!ctx?.commands || typeof ctx.commands.register !== 'function') throw new Error('dsh-harmony-sender requires the DSH commands service.');
  const dispose = ctx.commands.register({
    name: 'harmony-send', description: '把指定文字发给已配对的鸿蒙客户端',
    input: { hint: '<要发送的文字>', attachments: false }, recordInput: false, handler: sendText,
  });
  ctx.on('dispose', dispose);
}
