// a water drop on tap. one recording, sliced at the hits found offline:
// [start s, length s, gain to a common peak]. one slice plays per tap with
// a little pitch and level variation
export const CLIP = 6.384; // s
export const SLICES = [
  [0.193, 0.071, 7.3],
  [0.307, 0.105, 11.3],
  [0.485, 0.171, 5.1],
  [1.099, 0.069, 17.3],
  [1.505, 0.113, 4.9],
  [1.679, 0.129, 2.9],
  [1.853, 0.057, 13.9],
  [2.103, 0.093, 5.4],
  [3.377, 0.145, 3.8],
  [3.707, 0.079, 6.1],
  [3.887, 0.195, 4.4],
  [4.313, 0.079, 3.4],
  [4.449, 0.105, 15.8],
  [5.117, 0.087, 4.7],
  [5.265, 0.067, 11.3],
];

const ATTACK = 0.003; // s
const RELEASE = 0.02; // s
const MASTER = 0.6;

export class Drops {
  constructor(url) {
    this.url = url;
    this.bytes = null;
    this.buffer = null;
    this.ctx = null;
    this.decoding = null;
    this.last = -1;
  }

  // fetch ahead so the first tap does not wait on the network
  load() {
    if (!this.bytes) this.bytes = fetch(this.url).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null);
    return this.bytes;
  }

  // called from a user gesture: the context is created and resumed here
  play() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (this.buffer) {
      this.fire();
      return;
    }
    if (this.decoding) return;
    this.decoding = this.load()
      .then((b) => (b ? this.ctx.decodeAudioData(b.slice(0)) : null))
      .then((buf) => {
        this.buffer = buf;
        if (buf) this.fire();
      })
      .catch(() => {});
  }

  fire() {
    const ctx = this.ctx;
    let k = Math.floor(Math.random() * SLICES.length);
    if (k === this.last) k = (k + 1) % SLICES.length;
    this.last = k;
    const [start, dur, gain] = SLICES[k];
    const rate = 0.9 + Math.random() * 0.25;
    const level = gain * MASTER * (0.7 + Math.random() * 0.3);
    const t = ctx.currentTime;
    const end = t + dur / rate;
    const src = ctx.createBufferSource();
    src.buffer = this.buffer;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + ATTACK);
    g.gain.setValueAtTime(level, Math.max(t + ATTACK, end - RELEASE));
    g.gain.linearRampToValueAtTime(0, end);
    src.connect(g).connect(ctx.destination);
    src.start(t, start, dur);
    src.onended = () => g.disconnect();
  }
}
