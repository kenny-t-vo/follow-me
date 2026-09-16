import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SLICES, CLIP } from '../src/sound.js';

test('drop slices are in order, apart, and inside the clip', () => {
  let end = 0;
  for (const [start, dur, gain] of SLICES) {
    assert.ok(start >= end, `slice at ${start} overlaps the one before`);
    assert.ok(dur > 0.03 && dur < 0.5, `slice at ${start} lasts ${dur}`);
    assert.ok(gain > 1 && gain < 30, `slice at ${start} gain ${gain}`);
    end = start + dur;
  }
  assert.ok(end <= CLIP);
  assert.ok(SLICES.length >= 10);
});
