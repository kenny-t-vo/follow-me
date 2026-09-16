import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaults, diff, apply, toHash, fromHash, load, save, feedView, FIELDS } from '../src/params.js';

function storage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) };
}

test('defaults produce an empty diff and an empty hash', () => {
  const p = defaults();
  assert.deepEqual(diff(p), {});
  assert.equal(toHash(p), '');
});

test('a share link round-trips every field type', () => {
  const p = defaults();
  p.count = 55;
  p.gridMark = 'ascii';
  p.pointer = false;
  p.gridColor = '#0000ee';
  p.cruise = 1.25;
  const q = apply(defaults(), fromHash(toHash(p)));
  assert.equal(q.count, 55);
  assert.equal(q.gridMark, 'ascii');
  assert.equal(q.pointer, false);
  assert.equal(q.gridColor, '#0000ee');
  assert.equal(q.cruise, 1.25);
});

test('apply clamps ranges and refuses unknown values', () => {
  const p = apply(defaults(), { count: 9999, cruise: -4, gridMark: 'neon', gridColor: 'red', bogus: 1, mirror: 'false' });
  assert.equal(p.count, 300);
  assert.equal(p.cruise, 0.2);
  assert.equal(p.gridMark, 'square');
  assert.equal(p.gridColor, '#111111');
  assert.equal('bogus' in p, false);
  assert.equal(p.mirror, false);
});

test('the source is a per-session choice and never persists', () => {
  const st = storage();
  const p = defaults();
  p.source = 'camera';
  p.count = 3;
  save(st, p);
  const q = load(st, '');
  assert.equal(q.count, 3);
  assert.equal(q.source, 'off');
});

test('the hash wins over the store', () => {
  const st = storage();
  const p = defaults();
  p.count = 3;
  save(st, p);
  const q = load(st, '#count=12&gridMark=cross');
  assert.equal(q.count, 12);
  assert.equal(q.gridMark, 'cross');
});

test('every field has a default inside its own range or choices', () => {
  for (const f of FIELDS) {
    if (f.type === 'range') assert.ok(f.def >= f.min && f.def <= f.max, f.key);
    if (f.type === 'choice') assert.ok(f.choices.includes(f.def), f.key);
  }
});

test('the auto feed view follows the source until a choice is made', () => {
  const p = defaults();
  assert.equal(feedView(p), 'hidden');
  p.source = 'camera';
  assert.equal(feedView(p), 'thumbnail');
  p.source = 'video';
  assert.equal(feedView(p), 'background');
  p.feedView = 'hidden';
  assert.equal(feedView(p), 'hidden');
});
