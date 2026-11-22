// Annotation model: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PEN_SIZE, segmentWidth, displayColor, strokeSvg, annotationSvg, withAnnotations,
         hitsStroke, annotationToXopp } from '../src/annotate.js';
import { inkWidth } from '../src/ink.js';

const pen = { tool: 'pen', color: '#1a1a1a', size: PEN_SIZE, pts: [[0, 0, 0.2], [10, 0, 0.4], [20, 0, 0.6]] };
const hi = { tool: 'highlighter', color: '#ffd400', size: 28, pts: [[0, 50, 0.5], [100, 50, 0.5]] };

test('pen width uses the shared InkPen model on the segment pressure', () => {
  assert.ok(Math.abs(segmentWidth(pen, 0) - inkWidth(PEN_SIZE, 0.3)) < 1e-9);
  assert.ok(Math.abs(segmentWidth(pen, 1) - inkWidth(PEN_SIZE, 0.5)) < 1e-9);
});

test('near-black flips only on a dark page', () => {
  assert.equal(displayColor('#1a1a1a', 'light'), '#1a1a1a');
  assert.equal(displayColor('#1a1a1a', 'dark'), '#ececec');
  assert.equal(displayColor('#d12a2a', 'dark'), '#d12a2a');
});

test('a pen stroke is one line per segment; a single tap still draws', () => {
  assert.equal((strokeSvg(pen, 'light').match(/<line /g) || []).length, 2);
  assert.equal((strokeSvg({ ...pen, pts: [[5, 5, 0.5]] }, 'light').match(/<line /g) || []).length, 1);
});

test('highlighters are drawn under pens', () => {
  const svg = annotationSvg([pen, hi], 'light');
  assert.ok(svg.indexOf('<polyline') < svg.indexOf('<line'));
  assert.equal(annotationSvg([], 'light'), '');
});

test('annotations go just before the page svg closes', () => {
  const page = '<svg viewBox="0 0 1600 2262"><rect/></svg>\n';
  const out = withAnnotations(page, [pen], 'light');
  assert.match(out, /<rect\/><g data-unsdocx-annotations="">.*<\/g><\/svg>$/s);
  assert.equal(withAnnotations(page, [], 'light'), page);
});

test('eraser hits within reach and misses beyond it', () => {
  assert.ok(hitsStroke(pen, 15, 5, 3));
  assert.ok(!hitsStroke(pen, 15, 30, 3));
  assert.ok(hitsStroke(hi, 50, 60, 1));
  assert.ok(!hitsStroke(hi, 50, 80, 1));
});

test('xopp: pen keeps per-segment widths, highlighter is translucent', () => {
  const k = 0.5;
  const x = annotationToXopp(pen, k);
  assert.equal(x.tool, 'pen');
  assert.equal(x.widths.length, pen.pts.length - 1);
  assert.equal(x.widths[0], segmentWidth(pen, 0) * k);
  assert.deepEqual(x.points[2], [10, 0]);
  assert.equal(x.color, '#1a1a1aff');
  const h = annotationToXopp(hi, k);
  assert.equal(h.tool, 'highlighter');
  assert.equal(h.color, '#ffd4007f');
  assert.equal(h.widths, undefined);
});
