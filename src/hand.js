// hand landmarks from a camera or a clip, mapped into canvas pixels. the
// landmarker loads from the cdn on first use, and the model from google's
// bucket; nothing is vendored.
const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task';

const PALM = [0, 5, 9, 13, 17];
const TIPS = [4, 8, 12, 16, 20];

// scale and offset that make a vw by vh frame cover a w by h canvas
export function cover(vw, vh, w, h) {
  const s = Math.max(w / vw, h / vh);
  return { s, ox: (w - vw * s) * 0.5, oy: (h - vh * s) * 0.5 };
}

export class HandInput {
  constructor(status) {
    this.status = status || (() => {});
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.style.display = 'none';
    document.body.appendChild(v);
    this.video = v;
    this.kind = 'off';
    this.hands = [];
    this.landmarker = null;
    this.loading = null;
    this.stream = null;
    this.url = null;
    this.ready = false;
    this.lastTime = -1;
    this.nextId = 1;
  }

  get active() {
    return this.kind !== 'off';
  }

  async load() {
    if (this.landmarker) return;
    if (!this.loading) {
      this.loading = (async () => {
        const vision = await import(`${CDN}/vision_bundle.mjs`);
        const files = await vision.FilesetResolver.forVisionTasks(`${CDN}/wasm`);
        const make = (delegate) => vision.HandLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: MODEL, delegate },
          runningMode: 'VIDEO',
          numHands: 2,
        });
        try {
          this.landmarker = await make('GPU');
        } catch (e) {
          this.landmarker = await make('CPU');
        }
      })();
    }
    try {
      await this.loading;
    } catch (e) {
      this.loading = null;
      throw e;
    }
  }

  // source is 'camera' or 'video'. a clip comes as a File or as { url }
  async start(kind, clip) {
    this.stop();
    this.kind = kind;
    this.status('loading the hand model.');
    try {
      await this.load();
    } catch (e) {
      this.kind = 'off';
      this.status('the hand model did not load.');
      return false;
    }
    if (this.kind !== kind) return false;
    const v = this.video;
    if (kind === 'camera') {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
      } catch (e) {
        this.kind = 'off';
        this.status(e && e.name === 'NotAllowedError' ? 'camera declined.' : 'no camera found.');
        return false;
      }
      if (this.kind !== 'camera') {
        this.stop();
        return false;
      }
      v.srcObject = this.stream;
      v.loop = false;
    } else {
      this.url = clip && clip.url ? clip.url : URL.createObjectURL(clip);
      this.ownsUrl = !(clip && clip.url);
      v.srcObject = null;
      v.src = this.url;
      v.loop = true;
    }
    try {
      await v.play();
    } catch (e) {
      // autoplay refusals resolve once the user has interacted, which they
      // have by reaching this point
    }
    this.ready = true;
    this.lastTime = -1;
    this.status(kind === 'camera' ? 'following your hand.' : 'following the clip.');
    return true;
  }

  stop() {
    if (this.stream) {
      for (const t of this.stream.getTracks()) t.stop();
      this.stream = null;
    }
    const v = this.video;
    v.pause();
    v.srcObject = null;
    if (this.url && this.ownsUrl) URL.revokeObjectURL(this.url);
    this.url = null;
    v.removeAttribute('src');
    v.load();
    this.kind = 'off';
    this.ready = false;
    this.hands.length = 0;
  }

  // runs detection when the video has a new frame, then smooths each hand.
  // still is the speed in px/s below which a hand counts as resting
  update(now, dt, w, h, mirror, still) {
    const hands = this.hands;
    const v = this.video;
    let seen = null;
    if (this.ready && this.landmarker && v.readyState >= 2 && v.videoWidth && v.currentTime !== this.lastTime) {
      this.lastTime = v.currentTime;
      let res = null;
      try {
        res = this.landmarker.detectForVideo(v, now);
      } catch (e) {
        res = null;
      }
      if (res && res.landmarks) {
        const { s, ox, oy } = cover(v.videoWidth, v.videoHeight, w, h);
        const vw = v.videoWidth * s, vh = v.videoHeight * s;
        seen = res.landmarks.map((lm) => {
          const map = (pt) => {
            let x = ox + pt.x * vw;
            if (mirror) x = w - x;
            return [x, oy + pt.y * vh];
          };
          let px = 0, py = 0;
          for (const k of PALM) {
            const [x, y] = map(lm[k]);
            px += x;
            py += y;
          }
          return { x: px / PALM.length, y: py / PALM.length, tips: TIPS.map((k) => map(lm[k])) };
        });
      }
    }

    if (seen) {
      const taken = new Set();
      for (const det of seen) {
        let best = null, bd = 0.25 * Math.max(w, h);
        for (const hd of hands) {
          if (taken.has(hd)) continue;
          const d = Math.hypot(hd.x - det.x, hd.y - det.y);
          if (d < bd) {
            bd = d;
            best = hd;
          }
        }
        if (!best) {
          best = { kind: 'hand', id: this.nextId++, x: det.x, y: det.y, vx: 0, vy: 0, speed: 0, still: true, tips: det.tips, seen: now, rippleAt: 0, lx: det.x, ly: det.y, travel: 0, dropAt: 0 };
          hands.push(best);
        }
        taken.add(best);
        best.target = det;
        best.seen = now;
      }
    }

    for (let i = hands.length - 1; i >= 0; i--) {
      const hd = hands[i];
      const age = (now - hd.seen) / 1000;
      if (age > 0.45) {
        hands.splice(i, 1);
        continue;
      }
      const k = Math.min(1, dt / 0.05);
      if (hd.target) {
        const nx = hd.x + (hd.target.x - hd.x) * k;
        const ny = hd.y + (hd.target.y - hd.y) * k;
        const vx = (nx - hd.x) / dt, vy = (ny - hd.y) / dt;
        const kv = Math.min(1, dt / 0.12);
        hd.vx += (vx - hd.vx) * kv;
        hd.vy += (vy - hd.vy) * kv;
        hd.x = nx;
        hd.y = ny;
        hd.tips = hd.target.tips;
      } else {
        hd.x += hd.vx * dt * 0.6;
        hd.y += hd.vy * dt * 0.6;
        hd.vx *= 0.9;
        hd.vy *= 0.9;
      }
      hd.speed = Math.hypot(hd.vx, hd.vy);
      hd.still = hd.speed < still;
    }
    return hands;
  }
}
