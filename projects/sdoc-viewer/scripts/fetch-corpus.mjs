// Download the SDOCX Compatibility Corpus into test/corpus/ (git-ignored).
//
//   npm run corpus
//
// Real Samsung Notes files, each paired with the PDF Samsung Notes itself
// exported, pinned to one dataset revision and checked against the hashes the
// dataset publishes. Files already present with the right hash are skipped.
//
// Dataset: https://huggingface.co/datasets/twangodev/sdocx-compatibility
// © SDOCX Compatibility Corpus contributors, CC BY 4.0. Used unmodified.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const REPO = 'twangodev/sdocx-compatibility';
const REVISION = '0865fd317776fa4fd60388e93724f789476541d4';
export const CORPUS_DIR = fileURLToPath(new URL('../test/corpus/', import.meta.url));

// SHA-256 per file, from the dataset README at REVISION.
export const CORPUS = {
  '01-basic-formatting.sdocx':           '86716d1ccc070d101272ff0760276b8e2d913bfcde88e34d3d64c5c51a1fd21b',
  '01-basic-formatting.pdf':             'fb1437be8c1c172374b6c798cb65ace68e7ccffaad61db3807e4e8e0d2dcc2a1',
  '02-shapes-and-dot-calibration.sdocx': 'dd6580a0531cf1712ef6526f1b0d51c42adaeb0d11feacca5d23ba562239da82',
  '02-shapes-and-dot-calibration.pdf':   '2971d07e8aeb8e63d6322d535d4db91311e54830482506828b67273f22e0e507',
  '03-image-placement.sdocx':            '8bfa5a5117ab2d11a28058dee0f8fc61fdeaeb40a454af971e3bfb9a0ab7af9a',
  '03-image-placement.pdf':              '9d304575876ada6a32da5c4d8a5ffa6bc6c8f64aa4df1a4372d16daa2d60d854',
  '04-marker4-highlighter.sdocx':        '8299abbf763e8e3e5af746815d13dfdf45443da27b0eb79192c328571905cdd2',
  '04-marker4-highlighter.pdf':          'b951e506c2d5ebd0ae100ac5cf7179e2575e6fcc8dcdea59be822de4341f8a9a',
};

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

async function present(name){
  try{ return sha256(await readFile(CORPUS_DIR + name)) === CORPUS[name]; }
  catch{ return false; }
}

/** Fetch every corpus file that is missing or stale; throws on a hash mismatch. */
export async function fetchCorpus({ log = console.log } = {}){
  await mkdir(CORPUS_DIR, { recursive: true });
  for(const [name, hash] of Object.entries(CORPUS)){
    if(await present(name)) continue;
    const url = `https://huggingface.co/datasets/${REPO}/resolve/${REVISION}/${name}`;
    const res = await fetch(url);
    if(!res.ok) throw new Error(`${name}: HTTP ${res.status} from ${url}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const got = sha256(bytes);
    if(got !== hash) throw new Error(`${name}: sha256 ${got}, expected ${hash}`);
    await writeFile(CORPUS_DIR + name, bytes);
    log(`fetched ${name} (${(bytes.length / 1024).toFixed(0)} KB)`);
  }
}

if(import.meta.url === `file://${process.argv[1]}`){
  await fetchCorpus();
  console.log(`corpus ready in ${CORPUS_DIR}`);
}
