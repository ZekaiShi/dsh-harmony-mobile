// A bounded viewport repair for the pinned upstream page: its floating Back
// button otherwise covers the first assistant line on a small phone screen.
// No content, authentication, request, storage, or event handlers are changed.
export const MOBILE_VIEWPORT_PATCH: string = `(() => {
  function apply() {
    if (!document.querySelector('#chatView .chat-toolbar .back')) return;
    if (document.getElementById('dsh-connect-viewport')) return;
    const style = document.createElement('style');
    style.id = 'dsh-connect-viewport';
    style.textContent = 'body.chat-open #messages{padding-top:54px!important}';
    document.head.appendChild(style);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply, {once:true});
  else apply();
})();`;
