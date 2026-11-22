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
