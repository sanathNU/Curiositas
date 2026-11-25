// Xournal++ export over the SDOCX Compatibility Corpus: `npm run corpus && npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { XOPP_PAGE_WIDTH_PT, strokeToXopp, xoppXml, xoppColor, gzipText } from '../src/xopp.js';
import { NOTES, missing, load } from './corpus.mjs';

const allPages = () => NOTES.flatMap(id => load(id).pages);

function samplePages(){
  return allPages().map(page => {
    const k = XOPP_PAGE_WIDTH_PT / page.width;
    const strokes = page.objects.map(o => strokeToXopp(o.content?.Stroke, k)).filter(Boolean);
    return { w: page.width * k, h: page.height * k, background: '#ffffffff', images: [], strokes };
  });
}

test('every stroke on every page is exported', { skip: missing }, () => {
  const xml = xoppXml(samplePages());
  const pages = allPages();
  const expected = pages.reduce((n, p) => n + p.objects.filter(o => o.content?.Stroke).length, 0);
  assert.ok(expected > 0);
  assert.equal((xml.match(/<stroke /g) || []).length, expected);
  assert.equal((xml.match(/<page /g) || []).length, pages.length);
});

test('Marker4 strokes become highlighters', { skip: missing }, () => {
  const k = XOPP_PAGE_WIDTH_PT / load('04-marker4-highlighter').pages[0].width;
  const tools = load('04-marker4-highlighter').pages[0].objects
    .map(o => strokeToXopp(o.content?.Stroke, k)).filter(Boolean).map(s => s.tool);
  assert.equal(tools.filter(t => t === 'highlighter').length, 12);
  assert.equal(tools.filter(t => t === 'pen').length, 29);
});

test('pressure widths are nominal plus one per segment', { skip: missing }, () => {
  for(const page of samplePages()){
    for(const s of page.strokes){
      assert.ok(s.points.length >= 2, 'Xournal++ drops strokes under two points');
      if(s.widths) assert.equal(s.widths.length, s.points.length - 1);
    }
  }
  const xml = xoppXml(samplePages());
  for(const m of xml.matchAll(/<stroke [^>]*width="([^"]+)"[^>]*>([^<]*)</g)){
    const widths = m[1].split(' ').length;
    const points = m[2].split(' ').length / 2;
    assert.ok(widths === 1 || widths === points, `width count ${widths} for ${points} points`);
  }
});

test('pages are A4-wide and strokes stay on the page', { skip: missing }, () => {
  for(const page of samplePages()){
    assert.equal(page.w, XOPP_PAGE_WIDTH_PT);
    for(const s of page.strokes) for(const [x, y] of s.points){
      assert.ok(x >= -1 && x <= page.w + 1 && y >= -1 && y <= page.h + 1);
    }
  }
});

test('colors are #rrggbbaa', () => {
  assert.equal(xoppColor({ r: 0, g: 47, b: 217 }), '#002fd9ff');
  assert.equal(xoppColor({ r: 217, g: 206, b: 0 }, 0x7f), '#d9ce007f');
});

test('gzip round-trips', { skip: missing }, async () => {
  const xml = xoppXml(samplePages());
  const gz = new Uint8Array(await (await gzipText(xml)).arrayBuffer());
  assert.equal(gunzipSync(gz).toString('utf8'), xml);
});
