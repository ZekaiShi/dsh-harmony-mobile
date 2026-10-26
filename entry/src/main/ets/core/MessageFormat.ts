export class InlinePart {
  text: string = '';
  style: string = 'plain';
  bold: boolean = false;
  italic: boolean = false;
  strike: boolean = false;
  href: string = '';
}
export class TableCell { text: string = ''; parts: InlinePart[] = []; }
export class TableRow { cells: TableCell[] = []; }
export class TextSection {
  kind: string = 'paragraph';
  text: string = '';
  language: string = '';
  level: number = 0;
  marker: string = '';
  gap: number = 10;
  parts: InlinePart[] = [];
  rows: TableRow[] = [];
}
class LinkSyntax { label: string = ''; href: string = ''; end: number = 0; }

// Native Markdown tokens. No HTML evaluation, network fetch, or platform APIs.
export class MessageFormat {
  private static unescape(text: string): string {
    return text.replace(/\\([\\`*{}\[\]()#+.!_>~-])/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  }
  private static link(text: string, start: number, references: Map<string, string>): LinkSyntax | undefined {
    let end = start + 1; let depth = 1;
    for (; end < text.length; end++) {
      if (text[end] === '\\') { end++; continue; }
      if (text[end] === '[') depth++;
      if (text[end] === ']' && --depth === 0) break;
    }
    if (end >= text.length) return undefined;
    const label = text.slice(start + 1, end);
    let href = ''; let finish = end + 1;
    if (text[finish] === '(') {
      let cursor = finish + 1; let nesting = 1; const begin = cursor;
      for (; cursor < text.length; cursor++) {
        if (text[cursor] === '\\') { cursor++; continue; }
        if (text[cursor] === '(') nesting++;
        if (text[cursor] === ')' && --nesting === 0) break;
      }
      if (cursor >= text.length) return undefined;
      const destination = text.slice(begin, cursor).trim();
      const target = /^(?:<([^>]+)>|(\S+?))(?:\s+["'].*["'])?$/.exec(destination);
      if (!target) return undefined;
      href = target[1] || target[2]; finish = cursor + 1;
    } else if (text[finish] === '[') {
      const close = text.indexOf(']', finish + 1); if (close < 0) return undefined;
      href = references.get((text.slice(finish + 1, close) || label).trim().toLowerCase()) || ''; finish = close + 1;
    } else href = references.get(label.trim().toLowerCase()) || '';
    if (!href) return undefined;
    const result = new LinkSyntax(); result.label = label; result.href = this.unescape(href); result.end = finish; return result;
  }
  static inline(text: string, references: Map<string, string> = new Map<string, string>(), depth: number = 0): InlinePart[] {
    if (depth > 12 || text.length > 65536) { const literal = new InlinePart(); literal.text = text; return [literal]; }
    const parts: InlinePart[] = []; let plain = '';
    const flush = (): void => {
      if (!plain) return;
      const part = new InlinePart(); part.text = this.unescape(plain); parts.push(part); plain = '';
    };
    let cursor = 0; let syntaxBudget = 512;
    while (cursor < text.length) {
      const char = text[cursor];
      // Malformed model text can otherwise repeatedly scan the whole suffix.
      // Preserve the remaining content as literal text when work is exhausted.
      if ('`[!<*_~'.includes(char) && --syntaxBudget < 0) { plain += text.slice(cursor); break; }
      if (char === '\\' && cursor + 1 < text.length && /[\\`*{}\[\]()#+.!_>~-]/.test(text[cursor + 1])) {
        plain += text.slice(cursor, cursor + 2); cursor += 2; continue;
      }
      if (char === '`') {
        let count = 1; while (text[cursor + count] === '`') count++;
        const delimiter = '`'.repeat(count); let end = text.indexOf(delimiter, cursor + count);
        while (end >= 0 && (text[end - 1] === '`' || text[end + count] === '`')) end = text.indexOf(delimiter, end + count);
        if (end >= 0) {
          flush(); const part = new InlinePart(); part.style = 'code'; part.text = text.slice(cursor + count, end).replace(/\n/g, ' ');
          if (part.text.startsWith(' ') && part.text.endsWith(' ') && part.text.trim()) part.text = part.text.slice(1, -1);
          parts.push(part); cursor = end + count; continue;
        }
      }
      const image = char === '!' && text[cursor + 1] === '[';
      if (char === '[' || image) {
        const link = this.link(text, cursor + (image ? 1 : 0), references);
        if (link) {
          flush(); const children = this.inline(link.label, references, depth + 1);
          for (const part of children) { part.href = link.href; if (image) part.text = '图片：' + part.text; parts.push(part); }
          cursor = link.end; continue;
        }
      }
      if (char === '<') {
        const lineBreak = /^<br\s*\/?>/i.exec(text.slice(cursor));
        if (lineBreak) { plain += '\n'; cursor += lineBreak[0].length; continue; }
        const close = text.indexOf('>', cursor + 1); const href = close >= 0 ? text.slice(cursor + 1, close) : '';
        if (/^https?:\/\//i.test(href)) { flush(); const part = new InlinePart(); part.text = href; part.href = href; parts.push(part); cursor = close + 1; continue; }
      }
      let delimiter = '';
      if (text.startsWith('**', cursor) || text.startsWith('__', cursor) || text.startsWith('~~', cursor)) delimiter = text.slice(cursor, cursor + 2);
      else if (char === '*' || char === '_' && !/[\p{L}\p{N}]/u.test(text[cursor - 1] || '')) delimiter = char;
      if (delimiter) {
        let end = text.indexOf(delimiter, cursor + delimiter.length);
        while (end >= 0 && text[end - 1] === '\\') end = text.indexOf(delimiter, end + delimiter.length);
        if (end > cursor + delimiter.length) {
          flush(); const children = this.inline(text.slice(cursor + delimiter.length, end), references, depth + 1);
          for (const part of children) {
            if (delimiter === '**' || delimiter === '__') { part.bold = true; if (part.style === 'plain') part.style = 'bold'; }
            else if (delimiter === '~~') part.strike = true;
            else part.italic = true;
            parts.push(part);
          }
          cursor = end + delimiter.length; continue;
        }
      }
      plain += char; cursor++;
    }
    flush(); return parts;
  }
  private static cells(line: string): string[] {
    const text = line.trim().replace(/^\|/, '').replace(/\|$/, ''); const cells: string[] = [];
    let cell = ''; let code = false;
    for (let index = 0; index < text.length; index++) {
      if (text[index] === '\\' && text[index + 1] === '|') { cell += '|'; index++; continue; }
      if (text[index] === '`') code = !code;
      if (text[index] === '|' && !code) { cells.push(cell.trim()); cell = ''; } else cell += text[index];
    }
    cells.push(cell.trim()); return cells;
  }
  static sections(text: string): TextSection[] {
    const sections: TextSection[] = []; const lines = text.replace(/\r\n?/g, '\n').split('\n');
    const references = new Map<string, string>(); const definitions = new Set<number>();
    let inFence = '';
    for (let index = 0; index < lines.length; index++) {
      const fence = /^\s{0,3}(`{3,}|~{3,})/.exec(lines[index]);
      if (fence) { if (!inFence) inFence = fence[1][0]; else if (fence[1][0] === inFence) inFence = ''; continue; }
      if (inFence) continue;
      const definition = /^\s{0,3}\[([^\]]+)\]:\s*(?:<([^>]+)>|(\S+))/.exec(lines[index]);
      if (definition) { references.set(definition[1].trim().toLowerCase(), definition[2] || definition[3]); definitions.add(index); }
    }
    let active: TextSection | undefined; let fence = ''; let codeLines: string[] = []; let separated = true;
    const flush = (): void => {
      if (!active) return;
      if (active.kind === 'code') active.text = codeLines.join('\n');
      else active.parts = this.inline(active.text, references);
      sections.push(active); active = undefined;
    };
    const section = (kind: string, content: string): TextSection => {
      const value = new TextSection(); value.kind = kind; value.text = content; return value;
    };
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      if (fence) {
        if (new RegExp('^\\s{0,3}' + fence[0] + '{' + fence.length + ',}\\s*$').test(line)) { flush(); fence = ''; separated = true; }
        else codeLines.push(line);
        continue;
      }
      if (definitions.has(index)) { flush(); continue; }
      const opening = /^\s{0,3}(`{3,}|~{3,})(.*)$/.exec(line);
      if (opening) { flush(); active = section('code', ''); active.language = opening[2].trim().split(/\s/)[0]; fence = opening[1]; codeLines = []; continue; }
      if (!line.trim()) { flush(); separated = true; continue; }
      const heading = /^\s{0,3}(#{1,6})\s+(.+?)(?:\s+#+\s*)?$/.exec(line);
      if (heading) { flush(); active = section('heading', heading[2]); active.level = heading[1].length; active.gap = sections.length ? 16 : 0; flush(); separated = true; continue; }
      if (/^\s{0,3}(?:(?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,})$/.test(line)) { flush(); sections.push(section('rule', '')); separated = true; continue; }
      if (line.includes('|') && index + 1 < lines.length && this.cells(lines[index + 1]).every((cell: string) => /^:?-{3,}:?$/.test(cell.replace(/\s/g, '')))) {
        flush(); const table = section('table', ''); const header = this.cells(line); let rowIndex = index;
        while (rowIndex < lines.length && (rowIndex === index || lines[rowIndex].includes('|') && lines[rowIndex].trim().length > 0)) {
          if (rowIndex !== index + 1) {
            const row = new TableRow(); const cells = this.cells(lines[rowIndex]);
            for (let col = 0; col < header.length; col++) { const cell = new TableCell(); cell.text = cells[col] || ''; cell.parts = this.inline(cell.text, references); row.cells.push(cell); }
            table.rows.push(row);
          }
          rowIndex++;
        }
        sections.push(table); index = rowIndex - 1; separated = true; continue;
      }
      const bullet = /^(\s*)([-+*]|\d{1,9}[.)])\s+(.+)$/.exec(line);
      if (bullet) {
        flush(); active = section('list', bullet[3]); active.level = Math.min(6, Math.floor(bullet[1].replace(/\t/g, '    ').length / 2));
        active.marker = /^\d/.test(bullet[2]) ? bullet[2] : '•'; active.gap = separated ? 10 : 4;
        const task = /^\[([ xX])\]\s+(.*)$/.exec(active.text);
        if (task) { active.marker = task[1] === ' ' ? '☐' : '☑'; active.text = task[2]; }
        separated = false; continue;
      }
      const quote = /^\s{0,3}>\s?(.*)$/.exec(line);
      if (quote) {
        if (active?.kind !== 'quote') { flush(); active = section('quote', quote[1]); } else active.text += '\n' + quote[1];
        separated = false; continue;
      }
      if (!active || active.kind !== 'paragraph' && active.kind !== 'list') { flush(); active = section('paragraph', line.trimStart()); }
      else {
        const hardBreak = /(?: {2,}|\\)$/.test(active.text);
        active.text = active.text.replace(/(?: {2,}|\\)$/, '') + (hardBreak ? '\n' : ' ') + line.trim();
      }
      separated = false;
    }
    flush(); return sections;
  }
}
