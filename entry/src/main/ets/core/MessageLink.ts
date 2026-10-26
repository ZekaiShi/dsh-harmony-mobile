export class MessageLink {
  kind: string = 'blocked';
  href: string = '';
  path: string = '';
  line: string = '';
  static parse(href: string): MessageLink {
    const result = new MessageLink(); result.href = href;
    if (!href || /[\u0000-\u001f\u007f]/.test(href)) return result;
    if (/^https?:\/\/[^\s/]+(?:\/|$)/i.test(href)) { result.kind = 'web'; return result; }
    if (href.startsWith('#')) { result.kind = 'anchor'; result.path = href.slice(1); return result; }
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) && !/^[a-z]:[\\/]/i.test(href) && !/^file:\/\/\//i.test(href)) return result;
    if (/^[\\/]{2}/.test(href)) return result;
    const split = href.indexOf('#'); const path = split >= 0 ? href.slice(0, split) : href;
    try { result.path = decodeURIComponent(path.replace(/^file:\/\/\//i, '')); } catch (_) { result.path = path; }
    if (/[\u0000-\u001f\u007f]/.test(result.path)) return result;
    result.line = split >= 0 ? href.slice(split + 1).replace(/^L/i, '').replace(/-L/gi, '-') : '';
    if (result.line && !/^\d+(?:-\d+)?$/.test(result.line)) result.line = '';
    result.kind = 'file'; return result;
  }
}
