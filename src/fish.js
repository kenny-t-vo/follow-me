// each fish is a spine of NB nodes. the nose is the boid position, the rest
// follow the path it took with fixed segment lengths, and a travelling wave
// is added laterally when the outline is built. widths are fractions of the
// fish length.

export const NB = 14;
export const PEDUNCLE = 11;

// node arc positions, nose 0 to tail tip 1. body nodes are evenly spaced to
// the peduncle at 0.78, then two caudal segments
const S = new Float32Array(NB);
for (let k = 0; k <= PEDUNCLE; k++) S[k] = (0.78 * k) / PEDUNCLE;
S[12] = 0.89;
S[13] = 1.0;

const SEG = new Float32Array(NB);
for (let k = 1; k < NB; k++) SEG[k] = S[k] - S[k - 1];

// half-width control points along the body, top-down koi
const PROFILE = [
  [0.0, 0.03], [0.06, 0.07], [0.15, 0.1], [0.3, 0.11], [0.45, 0.105],
  [0.6, 0.08], [0.72, 0.048], [0.78, 0.03], [0.85, 0.05], [0.93, 0.09], [1.0, 0.115],
];

function profile(s) {
  for (let i = 1; i < PROFILE.length; i++) {
    const [s0, w0] = PROFILE[i - 1], [s1, w1] = PROFILE[i];
    if (s <= s1) {
      const u = (s - s0) / (s1 - s0);
      const c = u * u * (3 - 2 * u);
      return w0 + (w1 - w0) * c;
    }
  }
  return PROFILE[PROFILE.length - 1][1];
}

const W = new Float32Array(NB);
for (let k = 0; k < NB; k++) W[k] = profile(S[k]);

// lateral wave amplitude envelope, fraction of length at full thrust
function envelope(s) {
  return 0.09 * (0.04 + 0.16 * s + 0.8 * s * s);
}
const ENV = new Float32Array(NB);
for (let k = 0; k < NB; k++) ENV[k] = envelope(S[k]);

const WAVE_K = (Math.PI * 2) / 0.95;
const JOINT_MAX = 0.28;
const CAUDAL_JOINT_MAX = 0.55;
const FIN_NODE = 4;
const EYE_NODE = 1;

export class Fish {
  constructor(n) {
    this.n = 0;
    this.alloc(n);
  }

  alloc(n) {
    const keep = Math.min(n, this.n);
    const spine = new Float32Array(n * NB * 2);
    const fin = new Float32Array(n * 2);
    const fresh = new Uint8Array(n);
    if (this.n) {
      spine.set(this.spine.subarray(0, keep * NB * 2));
      fin.set(this.fin.subarray(0, keep * 2));
    }
    fresh.fill(1, keep);
    this.spine = spine;
    this.fin = fin;
    this.fresh = fresh;
    this.n = n;
  }

  setCount(n) {
    if (n !== this.n) this.alloc(n);
  }

  resetAll() {
    this.fresh.fill(1);
  }

  // lay the spine straight behind the nose
  straighten(i, x, y, th, L) {
    const sp = this.spine, o = i * NB * 2;
    const bx = -Math.cos(th), by = -Math.sin(th);
    for (let k = 0; k < NB; k++) {
      sp[o + k * 2] = x + bx * S[k] * L;
      sp[o + k * 2 + 1] = y + by * S[k] * L;
    }
    this.fin[i * 2] = 0.6;
    this.fin[i * 2 + 1] = 0.6;
    this.fresh[i] = 0;
  }

  // sim: the Sim instance. L: pixels per unit length. p: params
  update(sim, L, p, dt) {
    const n = Math.min(this.n, sim.n);
    const sp = this.spine, fin = this.fin;
    const relax = Math.min(1, dt * 1.5);
    for (let i = 0; i < n; i++) {
      const size = sim.size(i, p.variation);
      const Li = L * size;
      const x = sim.x[i], y = sim.y[i], th = sim.th[i];
      if (this.fresh[i]) this.straighten(i, x, y, th, Li);
      const o = i * NB * 2;
      sp[o] = x;
      sp[o + 1] = y;
      let pdx = -Math.cos(th), pdy = -Math.sin(th);
      for (let k = 1; k < NB; k++) {
        const ax = sp[o + (k - 1) * 2], ay = sp[o + (k - 1) * 2 + 1];
        let dx = sp[o + k * 2] - ax, dy = sp[o + k * 2 + 1] - ay;
        let d = Math.hypot(dx, dy);
        if (d < 1e-4) {
          dx = pdx;
          dy = pdy;
        } else {
          dx /= d;
          dy /= d;
        }
        dx += (pdx - dx) * relax;
        dy += (pdy - dy) * relax;
        let ang = Math.atan2(dy, dx);
        const pang = Math.atan2(pdy, pdx);
        let da = ang - pang;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        const lim = k > PEDUNCLE ? CAUDAL_JOINT_MAX : JOINT_MAX;
        if (da > lim) da = lim;
        else if (da < -lim) da = -lim;
        ang = pang + da;
        dx = Math.cos(ang);
        dy = Math.sin(ang);
        sp[o + k * 2] = ax + dx * SEG[k] * Li;
        sp[o + k * 2 + 1] = ay + dy * SEG[k] * Li;
        pdx = dx;
        pdy = dy;
      }

      // pectoral fins. a left turn (negative turn rate on a y-down canvas)
      // flares the left fin, braking flares both
      const tr = sim.turnRate[i] / Math.max(0.5, p.agility);
      const brake = Math.max(0, -sim.accel[i] / (0.6 * p.cruise * L));
      const rest = 0.6;
      const left = rest - 0.45 * Math.min(1, Math.max(0, -tr)) + 0.4 * Math.min(1, Math.max(0, tr)) - 0.3 * Math.min(1, brake);
      const right = rest - 0.45 * Math.min(1, Math.max(0, tr)) + 0.4 * Math.min(1, Math.max(0, -tr)) - 0.3 * Math.min(1, brake);
      const k = Math.min(1, dt / 0.25);
      fin[i * 2] += (Math.max(0.1, left) - fin[i * 2]) * k;
      fin[i * 2 + 1] += (Math.max(0.1, right) - fin[i * 2 + 1]) * k;
    }
  }

  // world-space geometry for one fish. returns points for the body outline,
  // the two fins, the eyes, and the frame along the spine for pattern mapping
  geometry(i, sim, L, p, out) {
    const size = sim.size(i, p.variation);
    const Li = L * size;
    const o = i * NB * 2;
    const sp = this.spine;
    const amp = sim.amp[i];
    const phase = sim.phase[i];
    const g = out || { q: new Float32Array(NB * 2), t: new Float32Array(NB * 2), body: [], finL: [], finR: [], eyes: [] };
    const q = g.q, tn = g.t;

    for (let k = 0; k < NB; k++) {
      const k0 = Math.max(0, k - 1), k1 = Math.min(NB - 1, k + 1);
      let tx = sp[o + k1 * 2] - sp[o + k0 * 2], ty = sp[o + k1 * 2 + 1] - sp[o + k0 * 2 + 1];
      const d = Math.hypot(tx, ty) || 1;
      tx /= d;
      ty /= d;
      tn[k * 2] = tx;
      tn[k * 2 + 1] = ty;
      const wave = ENV[k] * amp * Li * Math.sin(WAVE_K * S[k] - phase);
      q[k * 2] = sp[o + k * 2] + -ty * wave;
      q[k * 2 + 1] = sp[o + k * 2 + 1] + tx * wave;
    }

    const body = g.body;
    body.length = 0;
    // nose cap, then the right edge to the tail, the fork notch, and the
    // left edge back. n = (-ty, tx) is the visual left on a y-down canvas
    body.push(q[0] - tn[0] * W[0] * 1.2 * Li, q[1] - tn[1] * W[0] * 1.2 * Li);
    for (let k = 0; k < NB; k++) {
      const w = W[k] * Li;
      body.push(q[k * 2] + tn[k * 2 + 1] * w, q[k * 2 + 1] - tn[k * 2] * w);
    }
    body.push(q[12 * 2], q[12 * 2 + 1]);
    for (let k = NB - 1; k >= 0; k--) {
      const w = W[k] * Li;
      body.push(q[k * 2] - tn[k * 2 + 1] * w, q[k * 2 + 1] + tn[k * 2] * w);
    }

    const fk = FIN_NODE;
    const ftx = tn[fk * 2], fty = tn[fk * 2 + 1];
    const fnx = -fty, fny = ftx;
    const bw = W[fk] * Li;
    const cx = q[fk * 2], cy = q[fk * 2 + 1];
    const finLen = 0.17 * Li, finBase = 0.075 * Li;
    // the base sits a little inside the body so the fill merges with it
    const root = bw - 0.02 * Li;
    this.finPoints(g.finL, cx + fnx * root, cy + fny * root, ftx, fty, fnx, fny, this.fin[i * 2], finLen, finBase);
    this.finPoints(g.finR, cx - fnx * root, cy - fny * root, ftx, fty, -fnx, -fny, this.fin[i * 2 + 1], finLen, finBase);

    const ek = EYE_NODE;
    const ew = W[ek] * Li * 0.72;
    g.eyes.length = 0;
    g.eyes.push(q[ek * 2] - tn[ek * 2 + 1] * ew, q[ek * 2 + 1] + tn[ek * 2] * ew);
    g.eyes.push(q[ek * 2] + tn[ek * 2 + 1] * ew, q[ek * 2 + 1] - tn[ek * 2] * ew);
    g.eyeR = 0.012 * Li;
    g.L = Li;
    return g;
  }

  // sweep is the angle from the body normal toward the tail, radians
  finPoints(out, bx, by, tx, ty, nx, ny, sweep, len, base) {
    out.length = 0;
    const c = Math.cos(sweep), s = Math.sin(sweep);
    const dx = nx * c + tx * s, dy = ny * c + ty * s;
    const hx = tx * base * 0.5, hy = ty * base * 0.5;
    out.push(bx - hx, by - hy);
    out.push(bx - hx * 0.2 + dx * len * 0.95 - tx * len * 0.1, by - hy * 0.2 + dy * len * 0.95 - ty * len * 0.1);
    out.push(bx + hx * 0.3 + dx * len + tx * len * 0.35, by + hy * 0.3 + dy * len + ty * len * 0.35);
    out.push(bx + hx, by + hy);
  }

  // point and left normal on the spine at arc position s, for pattern mapping
  at(i, s, out) {
    const sp = this.spine, o = i * NB * 2;
    let k = 1;
    while (k < NB - 1 && S[k] < s) k++;
    const u = Math.min(1, Math.max(0, (s - S[k - 1]) / (S[k] - S[k - 1])));
    const x0 = sp[o + (k - 1) * 2], y0 = sp[o + (k - 1) * 2 + 1];
    const x1 = sp[o + k * 2], y1 = sp[o + k * 2 + 1];
    let tx = x1 - x0, ty = y1 - y0;
    const d = Math.hypot(tx, ty) || 1;
    tx /= d;
    ty /= d;
    out[0] = x0 + (x1 - x0) * u;
    out[1] = y0 + (y1 - y0) * u;
    out[2] = -ty;
    out[3] = tx;
    out[4] = profile(s);
    return out;
  }
}

// open curve from the first point to the last, bending through the ones
// between. used for the outer edge of a fin
export function smoothOpen(pts, sink) {
  const n = pts.length / 2;
  if (n < 2) return;
  sink.moveTo(pts[0], pts[1]);
  for (let k = 1; k < n - 1; k++) {
    const cx = pts[k * 2], cy = pts[k * 2 + 1];
    const ex = k === n - 2 ? pts[(k + 1) * 2] : (cx + pts[(k + 1) * 2]) * 0.5;
    const ey = k === n - 2 ? pts[(k + 1) * 2 + 1] : (cy + pts[(k + 1) * 2 + 1]) * 0.5;
    sink.quadraticCurveTo(cx, cy, ex, ey);
  }
}

// closed smooth curve through the midpoints of a point list. sink has
// moveTo, quadraticCurveTo and closePath, so Path2D and an svg builder both fit
export function smoothClosed(pts, sink) {
  const n = pts.length / 2;
  if (n < 3) return;
  const mx = (pts[0] + pts[2]) * 0.5, my = (pts[1] + pts[3]) * 0.5;
  sink.moveTo(mx, my);
  for (let k = 1; k <= n; k++) {
    const a = k % n, b = (k + 1) % n;
    const cx = pts[a * 2], cy = pts[a * 2 + 1];
    const ex = (cx + pts[b * 2]) * 0.5, ey = (cy + pts[b * 2 + 1]) * 0.5;
    sink.quadraticCurveTo(cx, cy, ex, ey);
  }
  sink.closePath();
}

export { S, W };
