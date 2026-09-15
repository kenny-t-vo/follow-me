// one frame of the pond as svg, in the current style
import { smoothClosed, smoothOpen } from './fish.js';
import { hexRgb, rgba, mix, stateColor } from './render.js';

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

function rgb(c) {
  return `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
}

export function snapshot(st, renderer) {
  const { sim, fish, p, L } = st;
  const w = renderer.w, h = renderer.h;
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`];
  if (p.style === 'grid') {
    for (const grp of renderer.gridCells(st).values()) {
      const cs = grp.cells;
      let d = '';
      for (let k = 0; k < cs.length; k += 3) {
        const half = cs[k + 2] * 0.5;
        d += `M${(cs[k] - half).toFixed(2)} ${(cs[k + 1] - half).toFixed(2)}h${cs[k + 2].toFixed(2)}v${cs[k + 2].toFixed(2)}h${(-cs[k + 2]).toFixed(2)}Z`;
      }
      out.push(`<path fill="${rgb(grp.rgb)}" d="${d}"/>`);
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
      if (p.style === 'ink') {
        const col = sc ? mix(ink, sc[0], sc[1]) : ink;
        out.push(`<g fill="${rgba(col, p.inkFill * depth)}"><path d="${fl}"/><path d="${fr}"/><path d="${body}"/></g>`);
        if (p.inkStroke) out.push(`<g fill="none" stroke="${rgba(col, 0.85 * depth)}" stroke-width="0.5"><path d="${edge}"/><path d="${body}"/></g>`);
        continue;
      }
      const pt = renderer.pattern(sim.seed, i);
      out.push(`<g opacity="${(0.82 + 0.18 * sim.sizeRel[i]).toFixed(3)}">`);
      out.push(`<g fill="${rgba(pt.rgb, 0.45)}"><path d="${fl}"/><path d="${fr}"/></g><path fill="none" stroke="rgba(17,17,17,0.22)" stroke-width="0.5" d="${edge}"/>`);
      out.push(`<path fill="${pt.base}" d="${body}"/>`);
      if (pt.blotches.length) {
        const id = `c${i}`;
        out.push(`<clipPath id="${id}"><path d="${body}"/></clipPath><g clip-path="url(#${id})">`);
        for (const b of pt.blotches) {
          const s = new PathSink();
          smoothClosed(renderer.blotchPoints(fish, i, b, g.L), s);
          out.push(`<path fill="${b.color}" d="${s.d}"/>`);
        }
        out.push('</g>');
      }
      if (sc) out.push(`<path fill="none" stroke="${rgba(sc[0], sc[1])}" stroke-width="0.75" d="${body}"/>`);
      else if (p.koiOutline) out.push(`<path fill="none" stroke="rgba(17,17,17,0.28)" stroke-width="0.5" d="${body}"/>`);
      out.push('</g>');
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
