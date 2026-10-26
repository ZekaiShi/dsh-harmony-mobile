import test from 'node:test';
import assert from 'node:assert/strict';
import { RasterPdf } from '../.cache/core/RasterPdf.mjs';

test('PDF byte offsets and stream lengths remain exact with binary image data', () => {
  const chunks = [], image = Uint8Array.from([255,216,0,128,255,217]);
  const pdf = new RasterPdf(2, data => chunks.push(Buffer.from(data)));
  pdf.page(image, 1080, 1528); pdf.page(image, 1080, 1528); pdf.finish();
  const bytes = Buffer.concat(chunks), text = bytes.toString('latin1');
  const start = Number(text.match(/startxref\n(\d+)/)[1]); assert.equal(bytes.subarray(start, start + 4).toString(), 'xref');
  const rows = text.slice(start).split('\n').slice(3, 11);
  rows.forEach((row, index) => { const offset = Number(row.slice(0,10)); assert.ok(text.slice(offset).startsWith((index + 1) + ' 0 obj\n')); });
  assert.match(text, /\/Count 2/); assert.equal((text.match(/\/Subtype \/Image/g) || []).length, 2);
  assert.throws(() => pdf.finish());
});
test('PDF refuses incomplete pages, invalid image references and excessive page counts', () => {
  assert.throws(() => new RasterPdf(101, () => {}));
  const pdf = new RasterPdf(1, () => {});
  assert.throws(() => pdf.finish()); assert.throws(() => pdf.page(new Uint8Array(10), 1, 1));
});
