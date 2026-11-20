// Tests for scripts/covers.mjs. Run: node --test scripts/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COVERS, coverSvg, fakeFile, rng } from './covers.mjs';

const SEEDS = [20261119, ...Array.from({ length: 40 }, (_, i) => i + 1)];

/**
 * A plain stable insertion sort: a valid Array.prototype.sort, but one that calls the comparator in a
 * different order from V8's, the way JavaScriptCore or SpiderMonkey might.
 */
function insertionSort(cmp) {
  for (let i = 1; i < this.length; i++) {
    const x = this[i];
    let j = i - 1;
    while (j >= 0 && cmp(this[j], x) > 0) { this[j + 1] = this[j]; j--; }
    this[j + 1] = x;
  }
  return this;
}

test('covers do not depend on how the engine sorts', () => {
  const native = SEEDS.map(seed => COVERS.map(c => coverSvg(c, seed)));
  const original = Array.prototype.sort;
  Array.prototype.sort = insertionSort;
  try {
    SEEDS.forEach((seed, i) => COVERS.forEach((c, k) => assert.equal(coverSvg(c, seed), native[i][k], `${c.file} at seed ${seed}`)));
  } finally {
    Array.prototype.sort = original;
  }
});

test('sdoc records decode as x, y and a pen pressure, so the 12-byte stride shows', () => {
  for (const seed of SEEDS) {
    const bytes = fakeFile(rng(seed ^ 0x9e3779b9));
    const view = new DataView(Uint8Array.from(bytes.slice(4 * 16, 17 * 16)).buffer); // rows 4 to 16
    for (let k = 0; k + 12 <= view.byteLength; k += 12) {
      const [x, y, pressure] = [0, 4, 8].map(o => view.getFloat32(k + o, true));
      assert.ok(x >= 512 && x < 2048 && y >= 512 && y < 2048, `x, y at seed ${seed}, record ${k / 12}: ${x}, ${y}`);
      assert.ok(pressure >= 0.25 && pressure < 1, `pressure at seed ${seed}, record ${k / 12}: ${pressure}`);
    }
  }
});
