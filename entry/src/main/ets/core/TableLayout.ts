import { TableRow } from './MessageFormat';

export class TableLayout {
  static widths(rows: TableRow[]): number[] {
    let count = 0;
    for (const row of rows) count = Math.max(count, row.cells.length);
    const widths: number[] = [];
    for (let col = 0; col < count; col++) {
      let desired = 96;
      for (const row of rows) {
        const cell = row.cells[col];
        if (!cell) continue;
        let visual = 0;
        for (const char of cell.parts.map(part => part.text).join('')) visual += char.charCodeAt(0) > 255 ? 15 : 8;
        desired = Math.max(desired, visual + 24);
      }
      widths.push(Math.min(300, Math.ceil(desired)));
    }
    return widths;
  }
  static total(rows: TableRow[]): number { return TableLayout.widths(rows).reduce((sum, width) => sum + width, 0); }
}
