// Real Samsung Notes files from the SDOCX Compatibility Corpus, checked against
// what the dataset documents and against Samsung's own PDF of each note.
//   npm run corpus && npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { readFileSync } from 'node:fs';
import { thickenInk, inkLineWidths } from '../src/ink.js';
import { NOTES, missing, load, pdfPageCount } from './corpus.mjs';
import { CORPUS_DIR } from '../scripts/fetch-corpus.mjs';

const penCounts = page => {
  const out = {};
  for(const o of page.objects){
    const pen = o.content?.Stroke?.rendering?.pen_name?.split('.').pop();
    if(pen) out[pen] = (out[pen] || 0) + 1;
  }
  return out;
};

for(const id of NOTES){
  test(`${id}: visible pages match Samsung's PDF`, { skip: missing }, () => {
    const { session, inspection, pdf } = load(id);
    assert.equal(session.page_count, pdfPageCount(pdf));
    assert.equal(inspection.layout.pages.length, session.page_count);
    assert.deepEqual(inspection.report?.diagnostics ?? [], []);
  });

  test(`${id}: every page renders, and the ink fix never gives up`, { skip: missing }, () => {
    const { session, pages } = load(id);
    for(let i = 0; i < session.page_count; i++){
      const svg = session.render_svg(i, 'light');
      assert.match(svg, /^<svg\b[^]*<\/svg>\s*$/);
      assert.equal(inkLineWidths(svg, pages[i].objects).missed, 0, `page ${i + 1}`);
      assert.ok(thickenInk(svg, pages[i].objects).length >= svg.length - 1);
    }
  });
}

// What the dataset README records about each fixture.
test('01-basic-formatting: six stored pages, five visible, all typed text', { skip: missing }, () => {
  const { session, inspection } = load('01-basic-formatting');
  assert.equal(inspection.document.pages.length, 6);
  assert.equal(session.page_count, 5);
  for(let i = 0; i < 5; i++) assert.match(session.render_svg(i, 'light'), /<text\b/);
});

test('03-image-placement: four stored pages, three visible, one 451×300 PNG', async t => {
  if(missing) return t.skip(missing);
  const { session, inspection } = load('03-image-placement');
  assert.equal(inspection.document.pages.length, 4);
  assert.equal(session.page_count, 3);
  const zip = await JSZip.loadAsync(readFileSync(`${CORPUS_DIR}03-image-placement.sdocx`));
  const pngs = await Promise.all(Object.keys(zip.files).filter(p => /\.png$/i.test(p)).map(p => zip.file(p).async('uint8array')));
  assert.equal(pngs.length, 1);
  const ihdr = new DataView(pngs[0].buffer, pngs[0].byteOffset + 16, 8);
  assert.deepEqual([ihdr.getUint32(0), ihdr.getUint32(4)], [451, 300]);
});

test('04-marker4-highlighter: 12 Marker4 and 29 FountainPen strokes', { skip: missing }, () => {
  assert.deepEqual(penCounts(load('04-marker4-highlighter').pages[0]), { FountainPen: 29, Marker4: 12 });
});
