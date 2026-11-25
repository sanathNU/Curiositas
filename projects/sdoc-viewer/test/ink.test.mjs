// InkPen width rewriting on page SVGs: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { thickenInk, inkSegmentWidths } from '../src/ink.js';

const INKPEN = 'com.samsung.android.sdk.pen.pen.preload.InkPen2';

function inkStroke(points, pressure = 0.3, pen = INKPEN){
  return { content: { Stroke: {
    points: points.map(([x, y]) => ({ x, y })),
    pressures: points.map(() => pressure),
    rendering: { pen_name: pen, style: { pen_size: 3.6 } },
  } } };
}
const line = (x1, y1, x2, y2, w = 0.5) =>
  `<line stroke="#000" stroke-width="${w}" x1="${x1}" x2="${x2}" y1="${y1}" y2="${y2}"/>`;
const widthsOf = svg => [...svg.matchAll(/stroke-width="([\d.]+)"/g)].map(m => +m[1]);

test('InkPen segments get the fitted width', () => {
  const s = inkStroke([[10, 10], [20, 10], [30, 12]]);
  const svg = `<svg>${line(10, 10, 20, 10)}${line(20, 10, 30, 12)}</svg>`;
  const want = inkSegmentWidths(s.content.Stroke, 3.6).map(w => +w.toFixed(2));
  assert.deepEqual(widthsOf(thickenInk(svg, [s])), want);
});

test('a table border before the ink does not block the fix', () => {
  // Typed tables and rules are <line>s too, with no stroke behind them.
  const s = inkStroke([[10, 10], [20, 10]]);
  const svg = `<svg>${line(0, 500, 900, 500, 1)}${line(10, 10, 20, 10)}</svg>`;
  const [border, ink] = widthsOf(thickenInk(svg, [s]));
  assert.equal(border, 1, 'non-ink lines keep their width');
  assert.equal(ink, +inkSegmentWidths(s.content.Stroke, 3.6)[0].toFixed(2));
});

test('a table border between strokes does not block the fix', () => {
  const a = inkStroke([[10, 10], [20, 10]]);
  const b = inkStroke([[40, 40], [50, 40]]);
  const svg = `<svg>${line(10, 10, 20, 10)}${line(0, 500, 900, 500, 1)}${line(40, 40, 50, 40)}</svg>`;
  const [wa, border, wb] = widthsOf(thickenInk(svg, [a, b]));
  assert.equal(border, 1);
  assert.ok(wa > 1 && wb > 1, `ink thickened: ${wa}, ${wb}`);
});

test('strokes drawn without lines (FountainPen, Marker4) are skipped', () => {
  const fountain = inkStroke([[5, 5], [6, 6]], 0.3, 'com.samsung.android.sdk.pen.pen.preload.FountainPen');
  const s = inkStroke([[10, 10], [20, 10]]);
  const svg = `<svg><rect/>${line(10, 10, 20, 10)}</svg>`;
  assert.ok(widthsOf(thickenInk(svg, [fountain, s]))[0] > 1);
});

test('a page with no InkPen is returned unchanged', () => {
  const svg = `<svg>${line(0, 500, 900, 500, 1)}</svg>`;
  assert.equal(thickenInk(svg, []), svg);
});
