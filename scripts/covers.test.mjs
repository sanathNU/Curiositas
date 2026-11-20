// Tests for scripts/covers.mjs. Run: node --test scripts/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COVERS, coverSvg } from './covers.mjs';

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
