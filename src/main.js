import * as P from './params.js';
import { Sim } from './sim.js';
import { Fish } from './fish.js';
import { Renderer } from './render.js';
import { HandInput } from './hand.js';
import { UI } from './ui.js';
import { snapshot, download } from './svg.js';
import { Drops } from './sound.js';

const STEP = 1 / 60;
const HINTED = 'follow-me.hinted';
const MARKS = ['square', 'cross', 'ascii'];
// lucky. leaves the count, the switches and the hand group alone
const LUCKY_KEEP = new Set(['count', 'pointer', 'stateColors', 'sound', 'handDrips', 'mirror', 'feedView', 'feedOpacity', 'marker']);

const canvas = document.getElementById('pond');
const clipInput = document.getElementById('clip');
const p = P.load(localStorage, location.hash);
if (location.hash) history.replaceState(null, '', location.pathname + location.search);

let w = innerWidth, h = innerHeight, dpr = 1;
const lengthFor = () => (p.size / 100) * Math.min(w, h);
let L = lengthFor();

const renderer = new Renderer(canvas);
const sim = new Sim({ count: p.count, w, h, L, seed: p.seed });
const fish = new Fish(p.count);
const ripples = [];
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const ui = new UI({ p, onChange, onAction });
const hand = new HandInput((t) => ui.status(t, true));
const drops = new Drops('sounds/drops.mp3');
const pointer = { kind: 'pointer', x: 0, y: 0, vx: 0, vy: 0, speed: 0, still: true, present: false, tx: 0, ty: 0, tips: null };

let paused = false;
let last = performance.now();
let acc = 0;
let fpsFrames = 0, fpsTime = 0;

function resize() {
  w = innerWidth;
  h = innerHeight;
  dpr = Math.min(2, devicePixelRatio || 1);
  renderer.resize(w, h, dpr);
  sim.resize(w, h);
  L = lengthFor();
  sim.L = L;
  fish.resetAll();
}

function onChange(key, v) {
  p[key] = v;
  P.save(localStorage, p);
  if (key === 'count') {
    sim.setCount(v);
    fish.setCount(v);
  } else if (key === 'size') {
    L = lengthFor();
    sim.L = L;
  } else if (key === 'seed') {
    sim.reseed(v);
    fish.resetAll();
  } else if (key === 'source') {
    setSource(v);
  } else if (key === 'sound') {
    if (v) drops.load();
    syncSoundLink();
  }
}

function onAction(name) {
  if (name === 'reset') {
    const source = p.source;
    Object.assign(p, P.defaults());
    p.source = source;
    P.save(localStorage, p);
    sim.setCount(p.count);
    fish.setCount(p.count);
    L = lengthFor();
    sim.L = L;
    sim.reseed(p.seed);
    fish.resetAll();
    ui.refresh();
    syncSoundLink();
    if (p.sound) drops.load();
    ui.status('settings reset.');
  } else if (name === 'link') {
    const url = location.origin + location.pathname + P.toHash(p);
    navigator.clipboard.writeText(url).then(
      () => ui.status('link copied.'),
      () => ui.status(url),
    );
  } else if (name === 'svg') {
    download(snapshot(state(hand.hands), renderer), 'follow-me.svg');
    ui.status('svg saved.');
  } else if (name === 'lucky') {
    for (const f of P.FIELDS) {
      if (LUCKY_KEEP.has(f.key) || f.session) continue;
      if (f.type === 'range') {
        const steps = Math.round((f.max - f.min) / f.step);
        p[f.key] = Number((f.min + Math.floor(Math.random() * (steps + 1)) * f.step).toFixed(4));
      } else if (f.type === 'choice') p[f.key] = f.choices[Math.floor(Math.random() * f.choices.length)];
      else if (f.type === 'color') p[f.key] = '#' + Math.floor(Math.random() * 0x1000000).toString(16).padStart(6, '0');
    }
    P.save(localStorage, p);
    L = lengthFor();
    sim.L = L;
    sim.reseed(p.seed);
    fish.resetAll();
    ui.refresh();
    ui.status('lucky.');
  } else if (name === 'reseed') {
    onChange('seed', 1 + Math.floor(Math.random() * 9999));
    ui.refresh();
  } else if (name === 'pause') {
    paused = !paused;
    ui.status(paused ? 'paused.' : '');
  }
}

// hand source. a clip needs a file first, so 'video' opens the picker and
// the start happens when a file arrives
function setSource(v) {
  if (v === 'off') hand.stop();
  else if (v === 'camera') hand.start('camera').then(finishSource);
  else if (v === 'video') clipInput.click();
  syncHandLinks();
}

function finishSource(ok) {
  if (!ok) {
    p.source = 'off';
    ui.refresh();
  }
  syncHandLinks();
}

clipInput.addEventListener('change', () => {
  const file = clipInput.files && clipInput.files[0];
  clipInput.value = '';
  if (!file) {
    p.source = 'off';
    ui.refresh();
    syncHandLinks();
    return;
  }
  hand.start('video', file).then(finishSource);
});

const handLink = document.getElementById('link-hand');
const handMenu = document.getElementById('hand-menu');
const handOff = document.getElementById('hand-off');
function syncHandLinks() {
  const on = p.source !== 'off';
  handLink.hidden = on;
  handOff.hidden = !on;
  if (on) handMenu.hidden = true;
}
handLink.addEventListener('click', () => (handMenu.hidden = !handMenu.hidden));
document.getElementById('hand-camera').addEventListener('click', () => ui.set('source', 'camera'));
document.getElementById('hand-video').addEventListener('click', () => ui.set('source', 'video'));
handOff.addEventListener('click', () => {
  ui.set('source', 'off');
  ui.status('');
});
const soundLink = document.getElementById('link-sound');
function syncSoundLink() {
  soundLink.textContent = p.sound ? 'mute.' : 'sound.';
}
soundLink.addEventListener('click', () => ui.set('sound', !p.sound));
document.getElementById('link-settings').addEventListener('click', () => ui.toggle('settings'));
document.getElementById('link-about').addEventListener('click', () => ui.toggle('about'));

let hinted = false;
try {
  hinted = !!localStorage.getItem(HINTED);
} catch (e) {
  hinted = true;
}
if (!hinted) ui.hint(true);
function hintSeen() {
  if (hinted) return;
  hinted = true;
  ui.hint(false);
  try {
    localStorage.setItem(HINTED, '1');
  } catch (e) {
    // nothing to do; the hint just shows again next time
  }
}

canvas.addEventListener('pointermove', (e) => {
  pointer.tx = e.clientX;
  pointer.ty = e.clientY;
  if (!pointer.present) {
    pointer.x = pointer.tx;
    pointer.y = pointer.ty;
    pointer.vx = pointer.vy = 0;
    pointer.present = true;
  }
  hintSeen();
});
canvas.addEventListener('pointerleave', () => (pointer.present = false));
canvas.addEventListener('pointerdown', (e) => {
  pointer.tx = pointer.x = e.clientX;
  pointer.ty = pointer.y = e.clientY;
  pointer.present = true;
  sim.feed(e.clientX, e.clientY, p.feed);
  ripples.push({ x: e.clientX, y: e.clientY, t0: sim.t, dur: 1.2, r: 1.2 * L });
  if (p.sound) drops.play();
  hintSeen();
});
canvas.addEventListener('pointerup', (e) => {
  if (e.pointerType === 'touch') setTimeout(() => (pointer.present = false), 400);
});

addEventListener('keydown', (e) => {
  const tag = e.target && e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key;
  if (k === 'Escape') ui.hide();
  else if (k === 's') ui.toggle('settings');
  else if (k === 'h') {
    if (p.source !== 'off') ui.set('source', 'off');
    else handMenu.hidden = !handMenu.hidden;
  } else if (k === ' ') {
    e.preventDefault();
    onAction('pause');
  } else if (k === 'r') onAction('reseed');
  else if (k === 'g') nextMark();
  else return;
  e.preventDefault();
});

function nextMark() {
  ui.set('gridMark', MARKS[(MARKS.indexOf(p.gridMark) + 1) % MARKS.length]);
}

function stepPointer(dt, stillPx) {
  if (!pointer.present) return;
  const k = Math.min(1, dt / 0.04);
  const nx = pointer.x + (pointer.tx - pointer.x) * k;
  const ny = pointer.y + (pointer.ty - pointer.y) * k;
  const kv = Math.min(1, dt / 0.12);
  pointer.vx += ((nx - pointer.x) / dt - pointer.vx) * kv;
  pointer.vy += ((ny - pointer.y) / dt - pointer.vy) * kv;
  pointer.x = nx;
  pointer.y = ny;
  pointer.speed = Math.hypot(pointer.vx, pointer.vy);
  pointer.still = pointer.speed < stillPx;
}

// a drop for every body length a hand travels, counted only while it moves
// faster than half a length per second, at most one every 150 ms
function stepHandDrops(hd) {
  if (hd.speed > 0.5 * L) hd.travel += Math.hypot(hd.x - hd.lx, hd.y - hd.ly);
  hd.lx = hd.x;
  hd.ly = hd.y;
  if (hd.travel >= L && sim.t - hd.dropAt > 0.15) {
    hd.travel = 0;
    hd.dropAt = sim.t;
    if (p.sound && p.handDrips) drops.play();
  }
}

function actorsOf(hands) {
  const a = [];
  if (p.pointer && pointer.present) a.push(pointer);
  for (const hd of hands) a.push(hd);
  return a;
}

function state(hands) {
  return {
    sim, fish, p, L,
    actors: actorsOf(hands),
    ripples,
    video: hand.ready ? hand.video : null,
    mirror: p.mirror && hand.kind === 'camera',
    t: sim.t,
    reduced: reduced.matches,
  };
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const stillPx = p.startleSpeed * L;
  const mirror = p.mirror && hand.kind === 'camera';
  const hands = hand.active ? hand.update(now, dt, w, h, mirror, stillPx) : [];
  if (!paused) {
    acc += dt;
    const pe = reduced.matches ? { ...p, cruise: p.cruise * 0.5 } : p;
    while (acc >= STEP) {
      stepPointer(STEP, stillPx);
      sim.step(STEP, pe, actorsOf(hands));
      acc -= STEP;
    }
    fish.update(sim, L, p, dt);
    for (const hd of hands) {
      if (hd.still && sim.t - hd.rippleAt > 2) {
        hd.rippleAt = sim.t;
        ripples.push({ x: hd.x, y: hd.y, t0: sim.t, dur: 1.6, r: 1.5 * L });
      }
      stepHandDrops(hd);
    }
  }
  renderer.frame(state(hands));
  fpsFrames++;
  fpsTime += dt;
  if (fpsTime >= 0.5) {
    ui.fps(`${Math.round(fpsFrames / fpsTime)} fps, ${sim.n} fish`);
    fpsFrames = 0;
    fpsTime = 0;
  }
}

addEventListener('resize', resize);
ui.build();
resize();
syncHandLinks();
syncSoundLink();
if (p.sound) drops.load();
requestAnimationFrame(frame);

// console handle. clip(url) runs the hand tracker on a video by url, which
// is how the video route gets tested without a file picker
window.followMe = {
  p, sim, fish, hand, renderer, ui, drops,
  clip(url) {
    p.source = 'video';
    ui.refresh();
    return hand.start('video', { url }).then(finishSource);
  },
};
