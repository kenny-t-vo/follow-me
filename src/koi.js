// koi varieties. one per fish from the seed and the fish index, stable across
// frames and count changes. the grid style paints with these colours
import { rng, subSeed } from './rng.js';

const WHITE = '#f3efe6';
const SUMI = '#1d1b1a';

// [weight, name, colour]. order and weights fix which fish gets which colour
// for a seed
const VARIETIES = [
  [0.25, 'kohaku', WHITE],
  [0.15, 'sanke', WHITE],
  [0.15, 'showa', SUMI],
  [0.12, 'ogon', '#d5a43c'],
  [0.12, 'shiro utsuri', WHITE],
  [0.1, 'chagoi', '#8a6a40'],
  [0.11, 'tancho', WHITE],
];

export function koiColor(seed, i) {
  const r = rng(subSeed(seed ^ 0x5bd1e995, i));
  let pick = r();
  let v = VARIETIES[0];
  for (const cand of VARIETIES) {
    pick -= cand[0];
    v = cand;
    if (pick <= 0) break;
  }
  return v[2];
}
