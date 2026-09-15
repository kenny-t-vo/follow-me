// three renderings of the same geometry: ink, koi and grid. overlays (food,
// ripples, hand markers, the camera feed) are shared.
import { smoothClosed, smoothOpen } from './fish.js';
import { koiPattern } from './koi.js';
import { cover } from './hand.js';
import { feedView } from './params.js';

export const BLUE = [0, 0, 238];
export const PURPLE = [85, 26, 139];
const INK = [17, 17, 17];

export function hexRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgba(c, a) {
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
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
    this.patterns = new Map();
    this.patternSeed = null;
    this.gridBuf = null;
    this.gridRgb = null;
    this.at = new Float32Array(5);
    this.blotch = new Float32Array(20);
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

  pattern(seed, i) {
    if (seed !== this.patternSeed) {
      this.patterns.clear();
      this.patternSeed = seed;
    }
    let pt = this.patterns.get(i);
    if (!pt) {
      pt = koiPattern(seed, i);
      pt.rgb = hexRgb(pt.base);
      for (const b of pt.blotches) b.rgb = hexRgb(b.color);
      this.patterns.set(i, pt);
    }
    return pt;
  }

  // st: { sim, fish, p, L, actors, ripples, video, t, reduced, now }
  frame(st) {
    const ctx = this.ctx, dpr = this.dpr, w = this.w, h = this.h;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const p = st.p;
    const feed = feedView(p);
    if (st.video && feed === 'background') this.drawVideo(ctx, st, 0, 0, w, h, p.feedOpacity);
    if (p.style === 'grid') this.drawGrid(ctx, st);
    else this.drawVector(ctx, st);
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

  drawVector(ctx, st) {
    const { sim, fish, p, L } = st;
    const n = Math.min(sim.n, fish.n);
    const hair = 1 / this.dpr;
    const ink = hexRgb(p.inkColor);
    const koi = p.style === 'koi';
    for (let i = 0; i < n; i++) {
      const g = this.geo = fish.geometry(i, sim, L, p, this.geo);
      const depth = 0.7 + 0.3 * sim.sizeRel[i];
      const sc = stateColor(sim, i, p);
      const { body, fl, fr, edge } = this.paths(g);
      if (!koi) {
        const col = sc ? mix(ink, sc[0], sc[1]) : ink;
        ctx.fillStyle = rgba(col, p.inkFill * depth);
        ctx.fill(fl);
        ctx.fill(fr);
        ctx.fill(body);
        if (p.inkStroke) {
          ctx.strokeStyle = rgba(col, 0.85 * depth);
          ctx.lineWidth = hair;
          ctx.stroke(edge);
          ctx.stroke(body);
        }
        if (g.L > 36) {
          ctx.fillStyle = rgba(col, 0.9 * depth);
          this.dots(ctx, g.eyes, g.eyeR);
        }
        continue;
      }
      const pt = this.pattern(sim.seed, i);
      ctx.globalAlpha = 0.82 + 0.18 * sim.sizeRel[i];
      ctx.fillStyle = rgba(pt.rgb, 0.45);
      ctx.fill(fl);
      ctx.fill(fr);
      ctx.strokeStyle = 'rgba(17,17,17,0.22)';
      ctx.lineWidth = hair;
      ctx.stroke(edge);
      ctx.fillStyle = pt.base;
      ctx.fill(body);
      if (pt.blotches.length) {
        ctx.save();
        ctx.clip(body);
        for (const b of pt.blotches) {
          ctx.fillStyle = b.color;
          ctx.fill(this.blotchPath(fish, i, b, g.L));
        }
        ctx.restore();
      }
      if (sc) {
        ctx.strokeStyle = rgba(sc[0], sc[1]);
        ctx.lineWidth = 1.5 * hair;
        ctx.stroke(body);
      } else if (p.koiOutline) {
        ctx.strokeStyle = 'rgba(17,17,17,0.28)';
        ctx.lineWidth = hair;
        ctx.stroke(body);
      }
      if (g.L > 36) {
        ctx.fillStyle = '#111';
        this.dots(ctx, g.eyes, g.eyeR);
      }
      ctx.globalAlpha = 1;
    }
  }

  dots(ctx, pts, r) {
    for (let k = 0; k < pts.length; k += 2) {
      ctx.beginPath();
      ctx.arc(pts[k], pts[k + 1], r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // a blotch is an ellipse in body space (arc position, side offset) with
  // ten wobbled radii, placed along the spine
  blotchPath(fish, i, b, L) {
    const path = new Path2D();
    smoothClosed(this.blotchPoints(fish, i, b, L), path);
    return path;
  }

  blotchPoints(fish, i, b, L) {
    const a = fish.at(i, b.s, this.at);
    const nx = a[2], ny = a[3], tx = ny, ty = -nx;
    const hw = a[4] * L;
    const cx = a[0] + nx * b.u * hw, cy = a[1] + ny * b.u * hw;
    const pts = this.blotch;
    for (let q = 0; q < 10; q++) {
      const ang = (q / 10) * Math.PI * 2;
      const dx = Math.cos(ang) * b.rs * L * b.wob[q];
      const dy = Math.sin(ang) * b.ru * hw * b.wob[q];
      pts[q * 2] = cx + tx * dx + nx * dy;
      pts[q * 2 + 1] = cy + ty * dx + ny * dy;
    }
    return pts;
  }

  // fills fish into an offscreen canvas one cell per pixel, then reads the
  // coverage back. returns groups of { rgb, cells: [cx, cy, size, ...] }
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
      let col = p.gridPerFish ? this.pattern(sim.seed, i).rgb : base;
      if (sc) col = mix(col, sc[0], sc[1]);
      octx.fillStyle = `rgb(${col[0] | 0},${col[1] | 0},${col[2] | 0})`;
      const { body, fl, fr } = this.paths(g);
      octx.fill(fl);
      octx.fill(fr);
      octx.fill(body);
    }
    const data = octx.getImageData(0, 0, cols, rows).data;
    const fade = p.gridFade;
    const buf = this.gridBuf, rgbBuf = this.gridRgb;
    const groups = new Map();
    const inset = cell * p.gridInset;
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
        grp.cells.push((c + 0.5) * cell, (r + 0.5) * cell, inset * a);
      }
    }
    return groups;
  }

  drawGrid(ctx, st) {
    const groups = this.gridCells(st);
    for (const grp of groups.values()) {
      const path = new Path2D();
      const cs = grp.cells;
      for (let k = 0; k < cs.length; k += 3) {
        const half = cs[k + 2] * 0.5;
        path.rect(cs[k] - half, cs[k + 1] - half, cs[k + 2], cs[k + 2]);
      }
      ctx.fillStyle = `rgb(${grp.rgb[0]},${grp.rgb[1]},${grp.rgb[2]})`;
      ctx.fill(path);
    }
  }

  drawOverlay(ctx, st) {
    const { sim, p, L, actors, ripples, t, reduced } = st;
    const hair = 1 / this.dpr;
    ctx.lineWidth = hair;
    for (const f of sim.foods) {
      const r = 0.02 * L * (0.5 + 0.5 * Math.max(0, f.amount));
      ctx.fillStyle = 'rgba(17,17,17,0.8)';
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
      ctx.strokeStyle = rgba(INK, 0.5 * (1 - u));
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
