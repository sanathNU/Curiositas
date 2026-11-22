/* Your own ink, drawn over a note's pages.

   The original .sdocx is never changed. Annotations live beside it, per page,
   in page units (the same 1600-wide space the engine renders in):

     { tool: 'pen' | 'highlighter', color: '#rrggbb', size, pts: [[x, y, pressure], …] }

   Pens use the same pressure-to-width model as the note's own InkPen strokes,
   so your writing and Samsung's sit at the same weight. */
import { inkWidth } from './ink.js';
import { xoppColor } from './xopp.js';

export const PEN_SIZE = 3.6;            // Samsung Notes' default InkPen size
export const HIGHLIGHTER_SIZE = 28;
export const HIGHLIGHTER_OPACITY = 0.38;
export const MIN_POINT_GAP = 0.6;       // page units; closer samples are dropped

/** Width of segment i → i+1 of a pen stroke, in page units. */
export function segmentWidth(stroke, i){
  const a = stroke.pts[i], b = stroke.pts[i + 1] ?? a;
  return inkWidth(stroke.size, (a[2] + b[2]) / 2);
}

/* Dark ink would vanish on a dark page, so near-black flips to near-white
   when `mode` is 'dark' (the page's own tone, not the app theme), the way
   Samsung Notes treats its own black ink. */
export function displayColor(hex, mode){
  if(mode !== 'dark') return hex;
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.2126 * (n >> 16 & 255) + 0.7152 * (n >> 8 & 255) + 0.0722 * (n & 255)) / 255;
  return lum < 0.2 ? '#ececec' : hex;
}

const f = v => (Math.round(v * 100) / 100).toString();

/** SVG markup (no wrapper) for one stroke. */
export function strokeSvg(stroke, mode){
  const color = displayColor(stroke.color, mode);
  const pts = stroke.pts.length === 1 ? [stroke.pts[0], stroke.pts[0]] : stroke.pts;
  if(stroke.tool === 'highlighter'){
    const d = pts.map(p => f(p[0]) + ',' + f(p[1])).join(' ');
    return `<polyline points="${d}" fill="none" stroke="${color}" stroke-opacity="${HIGHLIGHTER_OPACITY}" ` +
           `stroke-width="${f(stroke.size)}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  const s = { ...stroke, pts };
  let out = `<g stroke="${color}" stroke-linecap="round">`;
  for(let i = 0; i < pts.length - 1; i++){
    out += `<line x1="${f(pts[i][0])}" y1="${f(pts[i][1])}" x2="${f(pts[i + 1][0])}" y2="${f(pts[i + 1][1])}" stroke-width="${f(segmentWidth(s, i))}"/>`;
  }
  return out + '</g>';
}

/** SVG markup for a page's annotations; highlighters go under pens. */
export function annotationSvg(strokes, mode){
  if(!strokes?.length) return '';
  const hi = strokes.filter(s => s.tool === 'highlighter');
  const pens = strokes.filter(s => s.tool !== 'highlighter');
  return `<g data-unsdocx-annotations="">${[...hi, ...pens].map(s => strokeSvg(s, mode)).join('')}</g>`;
}

/** Page SVG with the annotations drawn on top, for export. */
export function withAnnotations(pageSvg, strokes, mode){
  const g = annotationSvg(strokes, mode);
  return g ? pageSvg.replace(/<\/svg>\s*$/, g + '</svg>') : pageSvg;
}

function distToSegment(px, py, a, b){
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / len2)) : 0;
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}

/** Does a circle of radius r at (x, y) touch the stroke? */
export function hitsStroke(stroke, x, y, r){
  const half = stroke.tool === 'highlighter' ? stroke.size / 2 : stroke.size;
  const pts = stroke.pts;
  if(pts.length === 1) return Math.hypot(x - pts[0][0], y - pts[0][1]) <= r + half;
  for(let i = 0; i < pts.length - 1; i++){
    if(distToSegment(x, y, pts[i], pts[i + 1]) <= r + half) return true;
  }
  return false;
}

/** Map an annotation to a Xournal++ stroke, scaled by k (page units → pt). */
export function annotationToXopp(stroke, k){
  const pts = stroke.pts.length === 1 ? [stroke.pts[0], stroke.pts[0]] : stroke.pts;
  const rgb = { r: parseInt(stroke.color.slice(1, 3), 16), g: parseInt(stroke.color.slice(3, 5), 16), b: parseInt(stroke.color.slice(5, 7), 16) };
  const points = pts.map(p => [p[0] * k, p[1] * k]);
  if(stroke.tool === 'highlighter'){
    return { tool: 'highlighter', color: xoppColor(rgb, 0x7f), width: stroke.size * k, points };
  }
  const s = { ...stroke, pts };
  const widths = pts.slice(1).map((_, i) => segmentWidth(s, i) * k);
  return { tool: 'pen', color: xoppColor(rgb), width: stroke.size * k, widths, points };
}
