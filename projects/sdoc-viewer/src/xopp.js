/* Xournal++ (.xopp) export.

   A .xopp is gzip-compressed XML (Xournal++ also reads a zip form; the gzip
   form is what its own SaveHandler writes for plain documents):

     <xournal creator fileversion="4">
       <page width height>            points (1/72 in), origin top-left
         <background type="solid" color="#rrggbbaa" style="plain"/>
         <layer>
           <image left top right bottom>base64 PNG</image>
           <stroke tool color width capStyle>x y x y …</stroke>

   With pressure, `width` is the nominal width followed by one value per
   segment (points − 1), each the absolute width from that point to the next.
   Source: xournalpp src/core/control/xojfile/{SaveHandler,XmlParser}.cpp. */
import { isInkPen, isMarker, inkSegmentWidths } from './ink.js';

/** Exported pages are A4-wide; height keeps the note's aspect. */
export const XOPP_PAGE_WIDTH_PT = 595.28;
const HIGHLIGHTER_ALPHA = 0x7f;

const hex2 = n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
const fmt = v => (Math.round(v * 100) / 100).toString();

/** `#rrggbbaa`, the form Xournal++ writes. */
export function xoppColor({ r, g, b }, alpha = 255){
  return '#' + hex2(r) + hex2(g) + hex2(b) + hex2(alpha);
}

/**
 * Map one parsed sdocx stroke to a Xournal++ stroke, scaled by `k` (page units → pt).
 * Returns null for strokes Xournal++ can't hold (erasers, no points).
 */
export function strokeToXopp(st, k){
  if(!st?.points?.length || st.rendering?.properties?.eraser) return null;
  const pen = st.rendering?.pen_name || '';
  const size = +(st.rendering?.style?.pen_size ?? st.pen_width ?? 1);
  const pts = st.points.length === 1 ? [st.points[0], st.points[0]] : st.points;
  const points = pts.map(p => [p.x * k, p.y * k]);

  const argb = st.rendering?.style?.color_argb;
  const rgb = st.color ?? (typeof argb === 'number'
    ? { r: (argb >>> 16) & 255, g: (argb >>> 8) & 255, b: argb & 255 } : { r: 0, g: 0, b: 0 });
  if(isMarker(pen)){
    return { tool: 'highlighter', color: xoppColor(rgb, HIGHLIGHTER_ALPHA), width: size * k, points };
  }
  const alpha = typeof argb === 'number' ? (argb >>> 24) : 255;
  if(isInkPen(pen)){
    const widths = inkSegmentWidths({ points: pts, pressures: st.pressures }, size).map(w => w * k);
    return { tool: 'pen', color: xoppColor(rgb, alpha), width: size * k, widths, points };
  }
  return { tool: 'pen', color: xoppColor(rgb, alpha), width: size * k, points };
}

function strokeXml(s){
  const width = s.widths ? [s.width, ...s.widths].map(fmt).join(' ') : fmt(s.width);
  const coords = s.points.map(([x, y]) => fmt(x) + ' ' + fmt(y)).join(' ');
  return `<stroke tool="${s.tool}" color="${s.color}" width="${width}" capStyle="round">${coords}</stroke>`;
}

function imageXml(im){
  return `<image left="${fmt(im.x)}" top="${fmt(im.y)}" right="${fmt(im.x + im.w)}" bottom="${fmt(im.y + im.h)}">${im.png}</image>`;
}

/**
 * Serialize pages to Xournal++ XML.
 * @param {{w:number,h:number,background:string,images:{x,y,w,h,png:string}[],strokes:object[]}[]} pages
 *   sizes in pt; `png` is base64 PNG data.
 */
export function xoppXml(pages){
  const out = ['<?xml version="1.0" standalone="no"?>\n',
               '<xournal creator="unsdocx" fileversion="4">\n',
               '<title>Xournal++ document - see https://xournalpp.github.io/</title>\n'];
  for(const p of pages){
    out.push(`<page width="${fmt(p.w)}" height="${fmt(p.h)}">\n`,
             `<background type="solid" color="${p.background}" style="plain"/>\n<layer>\n`);
    for(const im of p.images) out.push(imageXml(im), '\n');
    for(const s of p.strokes) out.push(strokeXml(s), '\n');
    out.push('</layer>\n</page>\n');
  }
  out.push('</xournal>\n');
  return out.join('');
}

/** Gzip a string with the browser's (or Node's) CompressionStream. */
export async function gzipText(text){
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Blob([await new Response(stream).arrayBuffer()], { type: 'application/x-xopp' });
}
