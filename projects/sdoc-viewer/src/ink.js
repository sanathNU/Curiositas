/* Stroke width model shared by the page renderer and the exporters.

   The engine draws Samsung's InkPen ~4–5× thinner than Samsung Notes does.
   These constants were fitted to a Samsung Notes screenshot of a real note:
   rendered width ≈ 1.1× pen size at the median, ≈ 1.45× at p90. */
export const INK_A = 0.16, INK_B = 3.14, INK_MIN = 0.15, INK_MAX = 2;

/** True for the pressure-sensitive fountain-style pens (InkPen, InkPen2, …). */
export const isInkPen = penName => /InkPen/.test(penName || '');

/** True for the translucent highlighter pens (Marker, Marker4, …). */
export const isMarker = penName => /Marker/.test(penName || '');

/**
 * Width of one InkPen segment, in page units.
 * @param {number} size     the stroke's pen size
 * @param {number} pressure pressure averaged over the segment's two points, 0..1
 */
export function inkWidth(size, pressure){
  return size * Math.min(INK_MAX, Math.max(INK_MIN, INK_A + INK_B * pressure));
}

/**
 * Per-segment widths for an InkPen stroke (points − 1 values, at least one).
 * @param {{pressures: number[], points: unknown[]}} stroke
 * @param {number} size
 */
export function inkSegmentWidths(stroke, size){
  const pr = stroke.pressures || [];
  const n = Math.max(stroke.points.length - 1, 1);
  const out = new Array(n);
  for(let i = 0; i < n; i++){
    const p = ((pr[i] ?? 0) + (pr[i + 1] ?? pr[i] ?? 0)) / 2;
    out[i] = inkWidth(size, p);
  }
  return out;
}

/* ---------------------------------------------------------------
   Rewriting the engine's InkPen widths in a page SVG.
   The engine draws each InkPen stroke as one <line> per segment, in stroke
   order. Other things are <line>s too (typed tables, rules, some pens), so
   each InkPen stroke looks ahead for the line that starts its first segment
   and leaves everything it skips alone. FountainPen and Marker4 draw no lines.
----------------------------------------------------------------*/
const LINE_RE = /<line\b(?=[^>]*\bx1="([-\d.]+)")(?=[^>]*\by1="([-\d.]+)")(?=[^>]*\bx2="([-\d.]+)")(?=[^>]*\by2="([-\d.]+)")[^>]*?stroke-width="([\d.]+)"/g;
const NEAR = 0.011;   // the engine prints coordinates to two decimals

const near = (a, b) => Math.abs(a - b) <= NEAR;

/**
 * New width per <line> on the page (null = keep the engine's), plus how many
 * InkPen strokes had no lines to match.
 */
export function inkLineWidths(svg, objects){
  const lines = [...svg.matchAll(LINE_RE)].map(m => [+m[1], +m[2], +m[3], +m[4]]);
  const widths = new Array(lines.length).fill(null);
  let from = 0, missed = 0;
  for(const o of objects){
    const st = o.content?.Stroke;
    if(!st || !isInkPen(st.rendering?.pen_name) || !st.points?.length) continue;
    const p0 = st.points[0], p1 = st.points[1] ?? p0;
    let j = from;
    while(j < lines.length && !(near(lines[j][0], p0.x) && near(lines[j][1], p0.y) &&
                                near(lines[j][2], p1.x) && near(lines[j][3], p1.y))) j++;
    if(j === lines.length){ missed++; continue; }
    const segs = inkSegmentWidths(st, +st.rendering.style.pen_size);
    segs.forEach((w, i) => { if(j + i < lines.length) widths[j + i] = w; });
    from = j + segs.length;
  }
  return { widths, missed };
}

/** Page SVG with every matched InkPen segment at Samsung Notes weight. */
export function thickenInk(svg, objects){
  const { widths, missed } = inkLineWidths(svg, objects);
  if(missed) console.warn(`[ink] ${missed} InkPen stroke(s) had no matching lines; drawn at engine width`);
  if(!widths.some(w => w != null)) return svg;
  let k = 0;
  return svg.replace(LINE_RE, (m, _x1, _y1, _x2, _y2, w) => {
    const nw = widths[k++];
    return nw == null ? m : m.slice(0, m.length - w.length - 1) + nw.toFixed(2) + '"';
  });
}
