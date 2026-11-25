// Shared loader for the SDOCX Compatibility Corpus (fetched by `npm run corpus`).
import { existsSync, readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { initSync, DocumentSession } from '@twango/sdocx';
import { CORPUS, CORPUS_DIR } from '../scripts/fetch-corpus.mjs';

initSync({ module: readFileSync(fileURLToPath(new URL('../node_modules/@twango/sdocx/sdocx_bg.wasm', import.meta.url))) });

export const NOTES = Object.keys(CORPUS).filter(n => n.endsWith('.sdocx')).map(n => n.slice(0, -6));

/** Why the corpus tests are skipped, or false when every file is present. */
export const missing = Object.keys(CORPUS).every(n => existsSync(CORPUS_DIR + n))
  ? false : 'corpus not downloaded; run `npm run corpus`';

const cache = new Map();
/** Parsed note: { session, inspection, pages (visible page objects), pdf (reference bytes) }. */
export function load(id){
  if(!cache.has(id)){
    const session = new DocumentSession(new Uint8Array(readFileSync(`${CORPUS_DIR}${id}.sdocx`)));
    const inspection = session.inspection();
    cache.set(id, { session, inspection, pages: inspection.layout.pages.map(p => p.page),
                    pdf: readFileSync(`${CORPUS_DIR}${id}.pdf`) });
  }
  return cache.get(id);
}

/* PDF objects can sit inside compressed object streams, so inflate every
   Flate stream and search those too. */
function pdfText(bytes){
  const raw = bytes.toString('latin1');
  const parts = [raw];
  for(const m of raw.matchAll(/stream\r?\n/g)){
    const start = m.index + m[0].length;
    const end = raw.indexOf('endstream', start);
    if(end < 0) continue;
    try{ parts.push(inflateSync(bytes.subarray(start, end)).toString('latin1')); }
    catch{ /* not Flate, or an image: nothing to find there */ }
  }
  return parts.join('\n');
}

/** Page count of a PDF, from its page tree root. */
export function pdfPageCount(bytes){
  const text = pdfText(bytes);
  // a flat dictionary holding both /Type /Pages and /Count, in either order
  const counts = [...text.matchAll(/<<([^<>]*)>>/g)]
    .filter(m => /\/Type\s*\/Pages\b/.test(m[1]))
    .map(m => +(m[1].match(/\/Count\s+(\d+)/)?.[1] ?? NaN)).filter(Number.isFinite);
  if(!counts.length) throw new Error('no /Pages tree found');
  return Math.max(...counts);
}
