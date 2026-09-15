// koi varieties and per-fish blotch patterns, derived from the seed and the
// fish index so they are stable across frames and count changes
import { rng, subSeed } from './rng.js';

const WHITE = '#f3efe6';
const RED = '#c9321f';
const SUMI = '#1d1b1a';

// [weight, name, base, marks]. a mark is [colour, min, max, kind]
const VARIETIES = [
  [0.25, 'kohaku', WHITE, [[RED, 3, 6]]],
  [0.15, 'sanke', WHITE, [[RED, 2, 5], [SUMI, 2, 5, 'small']]],
  [0.15, 'showa', SUMI, [[RED, 2, 4], [WHITE, 2, 4]]],
  [0.12, 'ogon', '#d5a43c', []],
  [0.12, 'shiro utsuri', WHITE, [[SUMI, 3, 6]]],
  [0.1, 'chagoi', '#8a6a40', []],
  [0.11, 'tancho', WHITE, [[RED, 1, 1, 'head']]],
];

export function koiPattern(seed, i) {
  const r = rng(subSeed(seed ^ 0x5bd1e995, i));
  let pick = r();
  let v = VARIETIES[0];
  for (const cand of VARIETIES) {
    pick -= cand[0];
    v = cand;
    if (pick <= 0) break;
  }
  const [, name, base, marks] = v;
  const blotches = [];
  for (const [color, lo, hi, kind] of marks) {
    const count = lo + r.int(hi - lo + 1);
    for (let k = 0; k < count; k++) {
      let s, u, rs, ru;
      if (kind === 'head') {
        s = 0.09;
        u = 0;
        rs = 0.055;
        ru = 0.9;
      } else if (kind === 'small') {
        s = r.range(0.12, 0.75);
        u = r.range(-0.7, 0.7);
        rs = r.range(0.025, 0.05);
        ru = r.range(0.3, 0.6);
      } else {
        s = r.range(0.08, 0.78);
        u = r.range(-0.6, 0.6);
        rs = r.range(0.06, 0.16);
        ru = r.range(0.55, 1.15);
      }
      const wob = new Float32Array(10);
      for (let q = 0; q < 10; q++) wob[q] = r.range(0.72, 1.28);
      // one smoothing pass keeps the edge organic without spikes
      const sm = new Float32Array(10);
      for (let q = 0; q < 10; q++) sm[q] = (wob[(q + 9) % 10] + 2 * wob[q] + wob[(q + 1) % 10]) / 4;
      blotches.push({ s, u, rs, ru, color, wob: sm });
    }
  }
  return { name, base, fin: base, blotches };
}
