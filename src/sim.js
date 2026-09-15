// boids in typed arrays. positions, speeds and radii are pixels inside the
// step; parameters arrive in body lengths and are scaled by L, the length of
// a size-1 fish in pixels.
import { rng, subSeed } from './rng.js';

const TAU = Math.PI * 2;

function wrap(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

export class Sim {
  constructor({ count, w, h, L, seed }) {
    this.w = w;
    this.h = h;
    this.L = L;
    this.seed = seed;
    this.t = 0;
    this.n = 0;
    this.foods = [];
    this.head = new Int32Array(0);
    this.alloc(count);
    this.reseed(seed);
  }

  alloc(n) {
    const f = (k) => new Float32Array(k);
    const keep = Math.min(n, this.n);
    const old = this.n ? this : null;
    const next = {
      x: f(n), y: f(n), th: f(n), spd: f(n), fx: f(n), fy: f(n),
      sizeRel: f(n), pref: f(n), social: f(n), phase: f(n), amp: f(n),
      thrustOn: new Uint8Array(n), thrustT: f(n), startleT: f(n),
      attract: new Uint8Array(n), visited: f(n), turnRate: f(n), accel: f(n),
      wander: f(n * 6), next: new Int32Array(n),
    };
    if (old) {
      for (const k of Object.keys(next)) {
        if (k === 'wander') next.wander.set(old.wander.subarray(0, keep * 6));
        else next[k].set(old[k].subarray(0, keep));
      }
    }
    Object.assign(this, next);
    const r = rng(subSeed(this.seed, 7919 + n));
    for (let i = keep; i < n; i++) this.spawn(i, r);
    this.n = n;
  }

  spawn(i, r) {
    const m = this.L;
    this.x[i] = r.range(m, Math.max(m, this.w - m));
    this.y[i] = r.range(m, Math.max(m, this.h - m));
    this.th[i] = r.range(-Math.PI, Math.PI);
    this.fx[i] = Math.cos(this.th[i]);
    this.fy[i] = Math.sin(this.th[i]);
    this.spd[i] = 0.9 * this.L;
    this.phase[i] = r() * TAU;
    this.amp[i] = 1;
    this.thrustOn[i] = 1;
    this.thrustT[i] = r.range(1, 4);
    this.startleT[i] = 0;
    this.attract[i] = 0;
    this.visited[i] = 0;
    this.turnRate[i] = 0;
    this.accel[i] = 0;
    this.assignTraits(i);
  }

  // size, preferred speed and the three wander sines come from the seed and
  // the index, so they survive count changes
  assignTraits(i) {
    const r = rng(subSeed(this.seed, i));
    this.sizeRel[i] = r();
    this.pref[i] = r.range(0.7, 1.3);
    this.social[i] = r.range(0.35, 1.15);
    const w = this.wander;
    w[i * 6 + 0] = TAU / r.range(5, 12);
    w[i * 6 + 1] = TAU / r.range(2, 5);
    w[i * 6 + 2] = TAU / r.range(0.9, 2);
    w[i * 6 + 3] = r() * TAU;
    w[i * 6 + 4] = r() * TAU;
    w[i * 6 + 5] = r() * TAU;
  }

  // sizeRel is stored as a 0..1 draw and mapped through the variation setting
  size(i, variation) {
    return 1 - 0.45 * variation + this.sizeRel[i] * variation;
  }

  reseed(seed) {
    this.seed = seed;
    const r = rng(subSeed(seed, 104729));
    for (let i = 0; i < this.n; i++) this.spawn(i, r);
    this.foods.length = 0;
    this.t = 0;
  }

  setCount(n) {
    if (n === this.n) return;
    this.alloc(n);
  }

  resize(w, h) {
    const sx = w / this.w, sy = h / this.h;
    for (let i = 0; i < this.n; i++) {
      this.x[i] *= sx;
      this.y[i] *= sy;
    }
    for (const f of this.foods) {
      f.x *= sx;
      f.y *= sy;
    }
    this.w = w;
    this.h = h;
  }

  feed(x, y, seconds) {
    this.foods.push({ x, y, amount: 1, left: seconds });
  }

  // actors: { x, y, still, tips: [[x, y], ...] } in pixels
  step(dt, p, actors) {
    const n = this.n;
    if (!n) return;
    const { x, y, th, spd, fx, fy } = this;
    const L = this.L, w = this.w, h = this.h;
    const U = p.cruise * L;
    const rPer = Math.max(p.perception * L, 1);
    const rSep = Math.max(p.space * L, 1);
    const rPer2 = rPer * rPer;
    const reach = p.reach * L;
    const startleR = reach * 0.7;
    const tipR = 1.5 * L;
    const band = Math.max(p.edge * L, 1);
    const cell = Math.max(rPer, rSep);
    const cols = Math.ceil(w / cell) + 2;
    const rows = Math.ceil(h / cell) + 2;

    if (this.head.length < cols * rows) this.head = new Int32Array(cols * rows);
    const head = this.head, next = this.next;
    head.fill(-1, 0, cols * rows);
    for (let i = 0; i < n; i++) {
      const cx = Math.min(cols - 1, Math.max(0, Math.floor(x[i] / cell) + 1));
      const cy = Math.min(rows - 1, Math.max(0, Math.floor(y[i] / cell) + 1));
      const c = cy * cols + cx;
      next[i] = head[c];
      head[c] = i;
    }

    const foods = this.foods;
    const t = this.t;
    const wd = this.wander;
    const cxw = w * 0.5, cyh = h * 0.5, half = 0.5 * Math.min(w, h);
    const minSpd = 0.12 * U, maxSpd = 3.2 * U;

    for (let i = 0; i < n; i++) {
      const xi = x[i], yi = y[i];
      const fxi = fx[i], fyi = fy[i];
      const size = this.size(i, p.variation);
      let sx = 0, sy = 0;

      let ax = 0, ay = 0, na = 0, gx = 0, gy = 0, ng = 0, px = 0, py = 0;
      const ccx = Math.min(cols - 1, Math.max(0, Math.floor(xi / cell) + 1));
      const ccy = Math.min(rows - 1, Math.max(0, Math.floor(yi / cell) + 1));
      for (let oy = -1; oy <= 1; oy++) {
        const ry = ccy + oy;
        if (ry < 0 || ry >= rows) continue;
        for (let ox = -1; ox <= 1; ox++) {
          const rx = ccx + ox;
          if (rx < 0 || rx >= cols) continue;
          for (let j = head[ry * cols + rx]; j !== -1; j = next[j]) {
            if (j === i) continue;
            const dx = x[j] - xi, dy = y[j] - yi;
            const d2 = dx * dx + dy * dy;
            if (d2 > rPer2) continue;
            const d = Math.sqrt(d2);
            if (d < rSep && d > 1e-3) {
              const k = Math.min(4, rSep / d - 1);
              px -= (dx / d) * k;
              py -= (dy / d) * k;
            }
            ax += fx[j];
            ay += fy[j];
            na++;
            gx += x[j];
            gy += y[j];
            ng++;
          }
        }
      }
      const social = this.social[i];
      if (na) {
        const m = Math.hypot(ax, ay);
        if (m > 1e-6) {
          sx += p.alignment * social * (ax / m - fxi);
          sy += p.alignment * social * (ay / m - fyi);
        }
      }
      if (ng) {
        const dx = gx / ng - xi, dy = gy / ng - yi;
        const d = Math.hypot(dx, dy);
        if (d > L) {
          const k = p.cohesion * social * Math.min(1, (d - L) / rPer);
          sx += k * (dx / d - fxi);
          sy += k * (dy / d - fyi);
        }
      }
      const pm = Math.hypot(px, py);
      if (pm > 3) {
        px *= 3 / pm;
        py *= 3 / pm;
      }
      sx += p.separation * px;
      sy += p.separation * py;

      const o = i * 6;
      const nz = 0.6 * Math.sin(wd[o] * t + wd[o + 3]) + 0.3 * Math.sin(wd[o + 1] * t + wd[o + 4]) + 0.1 * Math.sin(wd[o + 2] * t + wd[o + 5]);
      const wa = th[i] + nz * 1.1 * p.wander;
      sx += 0.8 * (Math.cos(wa) - fxi);
      sy += 0.8 * (Math.sin(wa) - fyi);

      if (xi < band) { const u = 1 - xi / band; sx += 2.5 * u * u * (3 - 2 * u); }
      else if (xi > w - band) { const u = 1 - (w - xi) / band; sx -= 2.5 * u * u * (3 - 2 * u); }
      if (yi < band) { const u = 1 - yi / band; sy += 2.5 * u * u * (3 - 2 * u); }
      else if (yi > h - band) { const u = 1 - (h - yi) / band; sy -= 2.5 * u * u * (3 - 2 * u); }

      {
        const dx = cxw - xi, dy = cyh - yi;
        const d = Math.hypot(dx, dy);
        if (d > 1e-6) {
          const k = 0.04 * Math.min(1, d / half);
          sx += k * dx / d;
          sy += k * dy / d;
        }
      }

      let attracted = false, nearest = Infinity, startled = false;
      for (let a = 0; a < actors.length; a++) {
        const ac = actors[a];
        const dx = ac.x - xi, dy = ac.y - yi;
        const d = Math.hypot(dx, dy);
        if (d < 1e-3) continue;
        if (ac.still) {
          if (d < reach) {
            const k = p.attraction * (1 - 0.5 * d / reach) * Math.min(1, d / (0.8 * L));
            sx += k * dx / d;
            sy += k * dy / d;
            attracted = true;
            if (d < nearest) nearest = d;
          }
          const tips = ac.tips;
          if (tips) {
            for (let k2 = 0; k2 < tips.length; k2++) {
              const tx = tips[k2][0] - xi, ty = tips[k2][1] - yi;
              const td = Math.hypot(tx, ty);
              if (td < tipR && td > 1e-3) {
                const k = p.fingertips * (1 - td / tipR);
                sx += k * tx / td;
                sy += k * ty / td;
                attracted = true;
                if (td < nearest) nearest = td;
              }
            }
          }
        } else if (d < startleR) {
          const k = 3 * p.startle * (1 - d / startleR);
          sx -= k * dx / d;
          sy -= k * dy / d;
          if (p.startle > 0) startled = true;
        }
      }
      for (let f = 0; f < foods.length; f++) {
        const fd = foods[f];
        if (fd.amount <= 0) continue;
        const dx = fd.x - xi, dy = fd.y - yi;
        const d = Math.hypot(dx, dy);
        if (d < reach && d > 1e-3) {
          const k = 1.6 * p.attraction * (1 - 0.5 * d / reach) * Math.min(1, fd.amount * 2);
          sx += k * dx / d;
          sy += k * dy / d;
          attracted = true;
          if (d < nearest) nearest = d;
          if (d < 0.5 * L) fd.amount -= dt * 0.35;
        }
      }

      let delta = wrap(Math.atan2(fyi + sy, fxi + sx) - th[i]);
      const startleOn = startled || this.startleT[i] > 0;
      const turnMax = (p.agility * (startleOn ? 2.2 : 1)) / size;
      let dth = delta * Math.min(1, dt / 0.22);
      const cap = turnMax * dt;
      if (dth > cap) dth = cap;
      else if (dth < -cap) dth = -cap;
      th[i] = wrap(th[i] + dth);
      this.turnRate[i] += (dth / dt - this.turnRate[i]) * Math.min(1, dt / 0.15);

      const base = U * this.pref[i];
      this.thrustT[i] -= dt;
      if (this.thrustT[i] <= 0) {
        const r = rng(subSeed(this.seed, i * 31 + Math.floor(t * 7)));
        if (this.thrustOn[i]) {
          const coast = r.range(1, 3.5) * p.coasting * 2;
          if (coast > 0.2) {
            this.thrustOn[i] = 0;
            this.thrustT[i] = coast;
          } else {
            this.thrustT[i] = r.range(2, 5);
          }
        } else {
          this.thrustOn[i] = 1;
          this.thrustT[i] = r.range(2, 5);
        }
      }
      let T = this.thrustOn[i] ? base * 1.1 : base * 0.55;
      if (attracted) T = nearest > 0.9 * L ? Math.max(T, base * 1.35) : base * 0.3;
      if (startled) {
        this.startleT[i] = 0.8;
        this.thrustOn[i] = 1;
      }
      if (this.startleT[i] > 0) {
        T = base * 2.6;
        this.startleT[i] -= dt;
      }
      const prev = spd[i];
      const tau = T > prev ? (this.startleT[i] > 0 ? 0.12 : 0.9) : 2.2;
      let s = prev + (T - prev) * (1 - Math.exp(-dt / tau));
      if (s < minSpd) s = minSpd;
      else if (s > maxSpd) s = maxSpd;
      spd[i] = s;
      this.accel[i] += ((s - prev) / dt - this.accel[i]) * Math.min(1, dt / 0.2);

      const ampT = this.thrustOn[i] || attracted ? 1 : 0.18;
      this.amp[i] += (ampT - this.amp[i]) * Math.min(1, dt / 0.5);
      this.phase[i] = (this.phase[i] + TAU * (1.5 * s / (L * size)) * dt) % TAU;

      const c = Math.cos(th[i]), sn = Math.sin(th[i]);
      fx[i] = c;
      fy[i] = sn;
      let nx = xi + c * s * dt, ny = yi + sn * s * dt;
      const m = 0.15 * L;
      if (nx < m) { nx = m; if (c < 0) th[i] = wrap(Math.PI - th[i]); }
      else if (nx > w - m) { nx = w - m; if (c > 0) th[i] = wrap(Math.PI - th[i]); }
      if (ny < m) { ny = m; if (sn < 0) th[i] = -th[i]; }
      else if (ny > h - m) { ny = h - m; if (sn > 0) th[i] = -th[i]; }
      x[i] = nx;
      y[i] = ny;

      const was = this.attract[i];
      this.attract[i] = attracted ? 1 : 0;
      if (was && !attracted) this.visited[i] = 4;
      else if (this.visited[i] > 0) this.visited[i] = Math.max(0, this.visited[i] - dt);
    }

    for (let f = foods.length - 1; f >= 0; f--) {
      foods[f].left -= dt;
      if (foods[f].left <= 0 || foods[f].amount <= 0) foods.splice(f, 1);
    }
    this.t += dt;
  }
}
