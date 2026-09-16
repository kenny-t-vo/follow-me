// one frame of the pond as svg, in the current style
import { smoothClosed, smoothOpen } from './fish.js';
import { hexRgb, rgba, css, mix, stateColor, glyphs, level, FONT, GLYPH_SCALE, CROSS_ARM } from './render.js';

class PathSink {
  constructor() {
    this.d = '';
  }
  moveTo(x, y) {
    this.d += `M${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  quadraticCurveTo(cx, cy, x, y) {
    this.d += `Q${cx.toFixed(2)} ${cy.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  closePath() {
    this.d += 'Z';
  }
}

function pathOf(pts) {
  const s = new PathSink();
  smoothClosed(pts, s);
  return s.d;
}

function edgeOf(pts) {
  const s = new PathSink();
  smoothOpen(pts, s);
  return s.d;
}

function rect(x, y, w, h) {
  return `M${x.toFixed(2)} ${y.toFixed(2)}h${w.toFixed(2)}v${h.toFixed(2)}h${(-w).toFixed(2)}Z`;
}

export function snapshot(st, renderer) {
  const { sim, fish, p, L } = st;
  const w = renderer.w, h = renderer.h;
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`];
  if (p.style === 'grid') {
    const cell = p.gridCell, mark = p.gridMark, n = p.gridLevels, full = cell * p.gridInset;
    const ramp = glyphs(n);
    for (const grp of renderer.gridCells(st).values()) {
      const cs = grp.cells;
      if (mark === 'ascii') {
        out.push(`<g fill="${css(grp.rgb)}" font-family="${FONT}" font-size="${(cell * GLYPH_SCALE).toFixed(1)}" text-anchor="middle" dominant-baseline="central">`);
        for (let k = 0; k < cs.length; k += 3) {
          out.push(`<text x="${cs[k].toFixed(1)}" y="${cs[k + 1].toFixed(1)}">${ramp[level(cs[k + 2], n)]}</text>`);
        }
        out.push('</g>');
        continue;
      }
      let d = '';
      for (let k = 0; k < cs.length; k += 3) {
        const x = cs[k], y = cs[k + 1], a = cs[k + 2];
        if (mark === 'cross') {
          const size = (full * (level(a, n) + 1)) / n;
          const t = Math.max(0.5, size * CROSS_ARM);
          d += rect(x - size / 2, y - t / 2, size, t) + rect(x - t / 2, y - size / 2, t, size);
        } else {
          const size = full * a;
          d += rect(x - size / 2, y - size / 2, size, size);
        }
      }
      out.push(`<path fill="${css(grp.rgb)}" d="${d}"/>`);
    }
  } else {
    const ink = hexRgb(p.inkColor);
    const n = Math.min(sim.n, fish.n);
    let g = null;
    for (let i = 0; i < n; i++) {
      g = fish.geometry(i, sim, L, p, g);
      const depth = 0.7 + 0.3 * sim.sizeRel[i];
      const sc = stateColor(sim, i, p);
      const body = pathOf(g.body), fl = pathOf(g.finL), fr = pathOf(g.finR);
      const edge = edgeOf(g.finL) + edgeOf(g.finR);
      const col = sc ? mix(ink, sc[0], sc[1]) : ink;
      out.push(`<g fill="${rgba(col, p.inkFill * depth)}"><path d="${fl}"/><path d="${fr}"/><path d="${body}"/></g>`);
      if (p.inkStroke) out.push(`<g fill="none" stroke="${rgba(col, 0.85 * depth)}" stroke-width="0.5"><path d="${edge}"/><path d="${body}"/></g>`);
    }
  }
  out.push('</svg>');
  return out.join('\n');
}

export function download(text, name) {
  const blob = new Blob([text], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
