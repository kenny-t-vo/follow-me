import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sim } from '../src/sim.js';
import { defaults } from '../src/params.js';

const W = 1200, H = 800, L = 64;
const STEP = 1 / 60;

function make(count = 40, seed = 1) {
  return new Sim({ count, w: W, h: H, L, seed });
}

function run(sim, p, steps, actors = []) {
  for (let k = 0; k < steps; k++) sim.step(STEP, p, actors);
}

function finite(sim) {
  for (let i = 0; i < sim.n; i++) {
    for (const k of ['x', 'y', 'th', 'spd', 'phase', 'amp']) {
      if (!Number.isFinite(sim[k][i])) return `${k}[${i}] = ${sim[k][i]}`;
    }
  }
  return null;
}

test('a minute of swimming stays finite, inside the pond and within the speed clamps', () => {
  const sim = make();
  const p = defaults();
  run(sim, p, 3600);
  assert.equal(finite(sim), null);
  const U = p.cruise * L;
  for (let i = 0; i < sim.n; i++) {
    assert.ok(sim.x[i] >= 0 && sim.x[i] <= W, `x[${i}] = ${sim.x[i]}`);
    assert.ok(sim.y[i] >= 0 && sim.y[i] <= H, `y[${i}] = ${sim.y[i]}`);
    assert.ok(sim.spd[i] >= 0.12 * U - 1e-3 && sim.spd[i] <= 3.2 * U + 1e-3, `spd[${i}] = ${sim.spd[i]}`);
  }
});

test('the same seed gives the same pond', () => {
  const a = make(30, 7), b = make(30, 7);
  const p = defaults();
  run(a, p, 300);
  run(b, p, 300);
  for (let i = 0; i < a.n; i++) {
    assert.equal(a.x[i], b.x[i]);
    assert.equal(a.y[i], b.y[i]);
    assert.equal(a.th[i], b.th[i]);
  }
});

test('separation keeps neighbours apart', () => {
  const sim = make(60);
  const p = defaults();
  run(sim, p, 1800);
  let tooClose = 0;
  for (let i = 0; i < sim.n; i++) {
    let nearest = Infinity;
    for (let j = 0; j < sim.n; j++) {
      if (i === j) continue;
      const d = Math.hypot(sim.x[i] - sim.x[j], sim.y[i] - sim.y[j]);
      if (d < nearest) nearest = d;
    }
    if (nearest < 0.25 * L) tooClose++;
  }
  assert.ok(tooClose <= sim.n * 0.1, `${tooClose} of ${sim.n} fish sit closer than a quarter length`);
});

test('a still pointer draws fish in and marks them attracted', () => {
  const sim = make(40);
  const p = defaults();
  p.reach = 6;
  run(sim, p, 300);
  const actor = { kind: 'pointer', x: W / 2, y: H / 2, still: true, tips: null };
  const before = mean(sim, (i) => Math.hypot(sim.x[i] - W / 2, sim.y[i] - H / 2));
  run(sim, p, 600, [actor]);
  const after = mean(sim, (i) => Math.hypot(sim.x[i] - W / 2, sim.y[i] - H / 2));
  assert.ok(after < before * 0.7, `mean distance ${before.toFixed(0)} -> ${after.toFixed(0)}`);
  let attracted = 0;
  for (let i = 0; i < sim.n; i++) attracted += sim.attract[i];
  assert.ok(attracted > sim.n / 2, `${attracted} attracted`);
  run(sim, p, 5, []);
  let visited = 0;
  for (let i = 0; i < sim.n; i++) visited += sim.visited[i] > 0 ? 1 : 0;
  assert.ok(visited > sim.n / 2, `${visited} visited after the pointer left`);
});

test('a fast hand startles fish into a burst', () => {
  const sim = make(40);
  const p = defaults();
  run(sim, p, 300);
  const actor = { kind: 'hand', x: W / 2, y: H / 2, still: false, tips: null };
  run(sim, p, 3, [actor]);
  let bursting = 0;
  for (let i = 0; i < sim.n; i++) bursting += sim.startleT[i] > 0 ? 1 : 0;
  assert.ok(bursting > 0, 'no fish startled');
  const U = p.cruise * L;
  run(sim, p, 30, [actor]);
  let fast = 0;
  for (let i = 0; i < sim.n; i++) fast += sim.spd[i] > 1.6 * U ? 1 : 0;
  assert.ok(fast > 0, 'no fish sped up');
});

test('food is eaten and removed', () => {
  const sim = make(40);
  const p = defaults();
  run(sim, p, 120);
  sim.feed(W / 2, H / 2, 20);
  run(sim, p, 1200);
  assert.equal(sim.foods.length, 0);
});

test('changing the count keeps the existing fish', () => {
  const sim = make(10, 3);
  const p = defaults();
  run(sim, p, 60);
  const x0 = sim.x[0], th0 = sim.th[0];
  sim.setCount(25);
  assert.equal(sim.n, 25);
  assert.equal(sim.x[0], x0);
  assert.equal(sim.th[0], th0);
  assert.equal(finite(sim), null);
  sim.setCount(4);
  assert.equal(sim.n, 4);
  run(sim, p, 60);
  assert.equal(finite(sim), null);
});

test('resize scales positions into the new pond', () => {
  const sim = make(20);
  sim.resize(W * 2, H / 2);
  for (let i = 0; i < sim.n; i++) {
    assert.ok(sim.x[i] <= W * 2 && sim.y[i] <= H / 2);
  }
});

function mean(sim, f) {
  let s = 0;
  for (let i = 0; i < sim.n; i++) s += f(i);
  return s / sim.n;
}
