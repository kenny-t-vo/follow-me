// fish rasterised into a grid of marks. overlays: food, ripples, hand
// markers, the camera feed. the ink rendering is legacy, off the schema and
// reached only by followMe.p.style = 'ink' in the console.
import { smoothClosed, smoothOpen } from './fish.js';
import { koiColor } from './koi.js';
import { cover } from './hand.js';
import { feedView } from './params.js';

export const BLUE = [0, 0, 238];
export const PURPLE = [85, 26, 139];
const INK = [17, 17, 17];
const WHITE = [255, 255, 255];
const INK_FILL = 0.8; // legacy ink body alpha

// grid marks. the ramp is in order of ink, one glyph per tone level
export const RAMP = '.:-=+*#%@';
export const FONT = 'ui-monospace, Menlo, Consolas, monospace';
export const GLYPH_SCALE = 1.3; // font size over cell size
export const CROSS_ARM = 0.18; // arm width over cross size

export function glyphs(levels) {
  const n = Math.max(2, Math.min(RAMP.length, levels | 0));
  const out = [];
  for (let k = 0; k < n; k++) out.push(RAMP[Math.round((k * (RAMP.length - 1)) / (n - 1))]);
  return out;
}

// coverage 0..1 to a tone level 0..n-1
export function level(a, n) {
  return Math.min(n - 1, Math.floor(a * n));
}

export function hexRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgba(c, a) {
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

export function css(c) {
  return `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
}

export function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

// blue while attracted, purple for a few seconds after, else null
export function stateColor(sim, i, p) {
  if (!p.stateColors) return null;
  if (sim.attract[i]) return [BLUE, 1];
  const v = sim.visited[i];
  if (v > 0) return [PURPLE, Math.min(1, v / 1.5)];
  return null;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.off = document.createElement('canvas');
    this.offCtx = this.off.getContext('2d', { willReadFrequently: true });
    this.dpr = 1;
    this.w = 0;
    this.h = 0;
    this.geo = null;
    this.colors = new Map();
    this.colorSeed = null;
    this.gridBuf = null;
    this.gridRgb = null;
  }

  resize(w, h, dpr) {
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
  }

  color(seed, i) {
    if (seed !== this.colorSeed) {
      this.colors.clear();
      this.colorSeed = seed;
    }
    let c = this.colors.get(i);
    if (!c) {
      c = hexRgb(koiColor(seed, i));
      this.colors.set(i, c);
    }
    return c;
  }

  // st: { sim, fish, p, L, actors, ripples, video, t, reduced, now }
  frame(st) {
    const ctx = this.ctx, dpr = this.dpr, w = this.w, h = this.h;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const p = st.p;
    const feed = feedView(p);
    if (st.video && feed === 'background') this.drawVideo(ctx, st, 0, 0, w, h, p.feedOpacity);
    if (p.style === 'ink') this.drawInk(ctx, st);
    else this.drawGrid(ctx, st);
    this.drawOverlay(ctx, st);
    if (st.video && feed === 'thumbnail') {
      const v = st.video;
      const tw = Math.min(160, w * 0.3), th = tw * (v.videoHeight / v.videoWidth || 0.75);
      const x = 22, y = 22;
      this.drawVideo(ctx, st, x, y, tw, th, 1);
      ctx.strokeStyle = 'rgba(17,17,17,0.35)';
      ctx.lineWidth = 1 / dpr;
      ctx.strokeRect(x, y, tw, th);
    }
  }

  drawVideo(ctx, st, x, y, w, h, alpha) {
    const v = st.video;
    if (!v || v.readyState < 2 || !v.videoWidth) return;
    const { s, ox, oy } = cover(v.videoWidth, v.videoHeight, w, h);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    if (st.mirror) {
      ctx.translate(x + w, y);
      ctx.scale(-1, 1);
    } else {
      ctx.translate(x, y);
    }
    ctx.drawImage(v, ox, oy, v.videoWidth * s, v.videoHeight * s);
    ctx.restore();
  }

  paths(g) {
    const body = new Path2D(), fl = new Path2D(), fr = new Path2D(), edge = new Path2D();
    smoothClosed(g.body, body);
    smoothClosed(g.finL, fl);
    smoothClosed(g.finR, fr);
    smoothOpen(g.finL, edge);
    smoothOpen(g.finR, edge);
    return { body, fl, fr, edge };
  }

  drawInk(ctx, st) {
    const { sim, fish, p, L } = st;
    const n = Math.min(sim.n, fish.n);
    const hair = 1 / this.dpr;
    for (let i = 0; i < n; i++) {
      const g = this.geo = fish.geometry(i, sim, L, p, this.geo);
      const depth = 0.7 + 0.3 * sim.sizeRel[i];
      const sc = stateColor(sim, i, p);
      const { body, fl, fr, edge } = this.paths(g);
      const col = sc ? mix(INK, sc[0], sc[1]) : INK;
      ctx.fillStyle = rgba(col, INK_FILL * depth);
      ctx.fill(fl);
      ctx.fill(fr);
      ctx.fill(body);
      ctx.strokeStyle = rgba(col, 0.85 * depth);
      ctx.lineWidth = hair;
      ctx.stroke(edge);
      ctx.stroke(body);
      if (g.L > 36) {
        ctx.fillStyle = rgba(col, 0.9 * depth);
        this.dots(ctx, g.eyes, g.eyeR);
      }
    }
  }

  dots(ctx, pts, r) {
    for (let k = 0; k < pts.length; k += 2) {
      ctx.beginPath();
      ctx.arc(pts[k], pts[k + 1], r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // fills fish into an offscreen canvas one cell per pixel, then reads the
  // coverage back. returns groups of { rgb, cells: [cx, cy, coverage, ...] }
  gridCells(st) {
    const { sim, fish, p, L } = st;
    const cell = p.gridCell;
    const cols = Math.ceil(this.w / cell), rows = Math.ceil(this.h / cell);
    const off = this.off, octx = this.offCtx;
    if (off.width !== cols || off.height !== rows) {
      off.width = cols;
      off.height = rows;
      this.gridBuf = new Float32Array(cols * rows);
      this.gridRgb = new Uint32Array(cols * rows);
    }
    octx.setTransform(1 / cell, 0, 0, 1 / cell, 0, 0);
    octx.clearRect(0, 0, this.w + cell, this.h + cell);
    const base = hexRgb(p.gridColor);
    const n = Math.min(sim.n, fish.n);
    for (let i = 0; i < n; i++) {
      const g = this.geo = fish.geometry(i, sim, L, p, this.geo);
      const sc = stateColor(sim, i, p);
      let col = p.gridPerFish ? this.color(sim.seed, i) : base;
      if (sc) col = mix(col, sc[0], sc[1]);
      octx.fillStyle = css(col);
      const { body, fl, fr } = this.paths(g);
      octx.fill(fl);
      octx.fill(fr);
      octx.fill(body);
    }
    const data = octx.getImageData(0, 0, cols, rows).data;
    const fade = p.gridFade;
    const buf = this.gridBuf, rgbBuf = this.gridRgb;
    const groups = new Map();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const o = idx * 4;
        let a = data[o + 3] / 255;
        let key;
        if (fade > 0) {
          const kept = buf[idx] * fade;
          if (a >= kept) {
            buf[idx] = a;
            if (a > 0.12) rgbBuf[idx] = (data[o] << 16) | (data[o + 1] << 8) | data[o + 2];
          } else {
            buf[idx] = kept;
            a = kept;
          }
          key = rgbBuf[idx];
        } else {
          key = (data[o] << 16) | (data[o + 1] << 8) | data[o + 2];
        }
        if (a < 0.12) continue;
        let grp = groups.get(key);
        if (!grp) {
          grp = { rgb: [(key >> 16) & 255, (key >> 8) & 255, key & 255], cells: [] };
          groups.set(key, grp);
        }
        grp.cells.push((c + 0.5) * cell, (r + 0.5) * cell, a);
      }
    }
    return groups;
  }

  // one mark per covered cell: a square scaled by coverage, a cross scaled
  // in steps, or a glyph from the ramp
  drawGrid(ctx, st) {
    const p = st.p, cell = p.gridCell, mark = p.gridMark, n = p.gridLevels;
    const groups = this.gridCells(st);
    if (mark === 'ascii') {
      const ramp = glyphs(n);
      ctx.font = `${(cell * GLYPH_SCALE).toFixed(1)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const grp of groups.values()) {
        ctx.fillStyle = css(grp.rgb);
        const cs = grp.cells;
        for (let k = 0; k < cs.length; k += 3) ctx.fillText(ramp[level(cs[k + 2], n)], cs[k], cs[k + 1]);
      }
      return;
    }
    const full = cell * p.gridInset;
    const hair = 1 / this.dpr;
    for (const grp of groups.values()) {
      const path = new Path2D();
      const cs = grp.cells;
      for (let k = 0; k < cs.length; k += 3) {
        const x = cs[k], y = cs[k + 1], a = cs[k + 2];
        if (mark === 'cross') {
          const size = (full * (level(a, n) + 1)) / n;
          const t = Math.max(hair, size * CROSS_ARM);
          path.rect(x - size / 2, y - t / 2, size, t);
          path.rect(x - t / 2, y - size / 2, t, size);
        } else {
          const size = full * a;
          path.rect(x - size / 2, y - size / 2, size, size);
        }
      }
      ctx.fillStyle = css(grp.rgb);
      ctx.fill(path);
    }
  }

  // ripples and food take the fish colour. with koi colours they are ink,
  // moving toward white with the opacity of a background feed
  markColor(st) {
    const p = st.p;
    if (!p.gridPerFish) return hexRgb(p.gridColor);
    if (st.video && feedView(p) === 'background') return mix(INK, WHITE, p.feedOpacity);
    return INK;
  }

  drawOverlay(ctx, st) {
    const { sim, p, L, actors, ripples, t, reduced } = st;
    const hair = 1 / this.dpr;
    const mark = this.markColor(st);
    ctx.lineWidth = hair;
    for (const f of sim.foods) {
      const r = 0.02 * L * (0.5 + 0.5 * Math.max(0, f.amount));
      ctx.fillStyle = rgba(mark, 0.8);
      ctx.beginPath();
      ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = ripples.length - 1; i >= 0; i--) {
      const rp = ripples[i];
      const u = (t - rp.t0) / rp.dur;
      if (u >= 1) {
        ripples.splice(i, 1);
        continue;
      }
      const e = 1 - Math.pow(1 - u, 3);
      const r = reduced ? rp.r * 0.6 : rp.r * e;
      ctx.strokeStyle = rgba(mark, 0.5 * (1 - u));
      ctx.beginPath();
      ctx.arc(rp.x, rp.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (p.marker) {
      for (const a of actors) {
        if (a.kind !== 'hand') continue;
        ctx.strokeStyle = 'rgba(17,17,17,0.55)';
        ctx.beginPath();
        ctx.arc(a.x, a.y, 0.3 * L, 0, Math.PI * 2);
        ctx.stroke();
        if (a.tips) {
          ctx.fillStyle = 'rgba(17,17,17,0.7)';
          for (const tp of a.tips) {
            ctx.beginPath();
            ctx.arc(tp[0], tp[1], 1.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }
  }
}
