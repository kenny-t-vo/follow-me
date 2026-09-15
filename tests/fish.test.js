import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sim } from '../src/sim.js';
import { Fish, NB, S, smoothClosed } from '../src/fish.js';
import { defaults } from '../src/params.js';

const W = 1000, H = 700, L = 80;
const STEP = 1 / 60;

function settled() {
  const sim = new Sim({ count: 12, w: W, h: H, L, seed: 5 });
  const fish = new Fish(12);
  const p = defaults();
  for (let k = 0; k < 400; k++) {
    sim.step(STEP, p, []);
    fish.update(sim, L, p, STEP);
  }
  return { sim, fish, p };
}

test('spine segments keep their lengths while the fish turns', () => {
  const { sim, fish, p } = settled();
  const sp = fish.spine;
  for (let i = 0; i < sim.n; i++) {
    const Li = L * sim.size(i, p.variation);
    const o = i * NB * 2;
    for (let k = 1; k < NB; k++) {
      const d = Math.hypot(sp[o + k * 2] - sp[o + (k - 1) * 2], sp[o + k * 2 + 1] - sp[o + (k - 1) * 2 + 1]);
      const want = (S[k] - S[k - 1]) * Li;
      assert.ok(Math.abs(d - want) < 1e-3, `fish ${i} segment ${k}: ${d} vs ${want}`);
    }
    assert.equal(sp[o], sim.x[i]);
    assert.equal(sp[o + 1], sim.y[i]);
  }
});

test('geometry is finite and closed with the expected point counts', () => {
  const { sim, fish, p } = settled();
  let g = null;
  for (let i = 0; i < sim.n; i++) {
    g = fish.geometry(i, sim, L, p, g);
    assert.equal(g.body.length, (1 + NB + 1 + NB) * 2);
    assert.equal(g.finL.length, 8);
    assert.equal(g.finR.length, 8);
    assert.equal(g.eyes.length, 4);
    for (const v of [...g.body, ...g.finL, ...g.finR, ...g.eyes]) assert.ok(Number.isFinite(v));
    // the nose cap sits ahead of the nose node
    const Li = g.L;
    const nose = Math.hypot(g.body[0] - sim.x[i], g.body[1] - sim.y[i]);
    assert.ok(nose < 0.06 * Li && nose > 0.02 * Li, `nose cap ${nose} for length ${Li}`);
  }
});

test('the body outline spans about one length from nose to tail', () => {
  const { sim, fish, p } = settled();
  const g = fish.geometry(0, sim, L, p, null);
  let far = 0;
  for (let k = 0; k < g.body.length; k += 2) {
    far = Math.max(far, Math.hypot(g.body[k] - g.body[0], g.body[k + 1] - g.body[1]));
  }
  assert.ok(far > 0.85 * g.L && far < 1.15 * g.L, `span ${far} for length ${g.L}`);
});

test('smoothClosed emits one curve per point and closes', () => {
  const calls = [];
  const sink = {
    moveTo: () => calls.push('m'),
    quadraticCurveTo: () => calls.push('q'),
    closePath: () => calls.push('z'),
  };
  smoothClosed([0, 0, 10, 0, 10, 10, 0, 10], sink);
  assert.deepEqual(calls, ['m', 'q', 'q', 'q', 'q', 'z']);
});

test('a fresh fish lays its spine straight behind the heading', () => {
  const sim = new Sim({ count: 1, w: W, h: H, L, seed: 2 });
  const fish = new Fish(1);
  const p = defaults();
  sim.x[0] = 500;
  sim.y[0] = 350;
  sim.th[0] = 0;
  fish.update(sim, L, p, STEP);
  const sp = fish.spine;
  for (let k = 1; k < NB; k++) {
    assert.ok(sp[k * 2] < sp[(k - 1) * 2], 'nodes trail to the left of a fish heading right');
    assert.ok(Math.abs(sp[k * 2 + 1] - 350) < 1e-6);
  }
});
