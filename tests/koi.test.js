import { test } from 'node:test';
import assert from 'node:assert/strict';
import { koiColor } from '../src/koi.js';

test('a fish keeps its colour for a seed and the palette has four colours', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const c = koiColor(7, i);
    assert.equal(c, koiColor(7, i));
    seen.add(c);
  }
  assert.equal(seen.size, 4);
});
