// one schema drives the defaults, the settings pane, localStorage and the
// share link. lengths are in body lengths (bl) unless the unit says px.

export const GROUPS = [
  {
    key: 'pond',
    fields: [
      { key: 'count', label: 'fish', type: 'range', min: 1, max: 300, step: 1, def: 27 },
      { key: 'size', label: 'size', type: 'range', min: 3, max: 20, step: 0.5, def: 12, unit: '%', hint: 'of the shorter side of the window' },
      { key: 'variation', label: 'variation', type: 'range', min: 0, max: 1, step: 0.05, def: 0.5 },
      { key: 'seed', label: 'seed', type: 'range', min: 1, max: 9999, step: 1, def: 1 },
    ],
  },
  {
    key: 'motion',
    fields: [
      { key: 'cruise', label: 'cruise', type: 'range', min: 0.2, max: 3, step: 0.05, def: 0.5, unit: 'bl/s' },
      { key: 'coasting', label: 'coasting', type: 'range', min: 0, max: 1, step: 0.05, def: 0.5 },
      { key: 'agility', label: 'agility', type: 'range', min: 0.5, max: 8, step: 0.1, def: 2.4, unit: 'rad/s' },
      { key: 'wander', label: 'wander', type: 'range', min: 0, max: 2, step: 0.05, def: 0.8 },
      { key: 'perception', label: 'perception', type: 'range', min: 0.5, max: 10, step: 0.1, def: 2.4, unit: 'bl' },
      { key: 'space', label: 'personal space', type: 'range', min: 0.2, max: 3, step: 0.05, def: 0.9, unit: 'bl' },
      { key: 'separation', label: 'separation', type: 'range', min: 0, max: 5, step: 0.05, def: 1.8 },
      { key: 'alignment', label: 'alignment', type: 'range', min: 0, max: 3, step: 0.05, def: 0.4 },
      { key: 'cohesion', label: 'cohesion', type: 'range', min: 0, max: 3, step: 0.05, def: 0.2 },
      { key: 'edge', label: 'edge softness', type: 'range', min: 0.5, max: 6, step: 0.1, def: 2, unit: 'bl' },
    ],
  },
  {
    key: 'interaction',
    fields: [
      { key: 'pointer', label: 'pointer', type: 'bool', def: true },
      { key: 'attraction', label: 'attraction', type: 'range', min: 0, max: 4, step: 0.05, def: 1 },
      { key: 'reach', label: 'reach', type: 'range', min: 1, max: 15, step: 0.5, def: 2.5, unit: 'bl' },
      { key: 'startle', label: 'startle', type: 'range', min: 0, max: 4, step: 0.05, def: 1 },
      { key: 'startleSpeed', label: 'startle speed', type: 'range', min: 0.5, max: 10, step: 0.1, def: 3, unit: 'bl/s' },
      { key: 'fingertips', label: 'fingertips', type: 'range', min: 0, max: 3, step: 0.05, def: 0.6 },
      { key: 'feed', label: 'feed lasts', type: 'range', min: 1, max: 20, step: 0.5, def: 5, unit: 's' },
      { key: 'sound', label: 'drop on tap', type: 'bool', def: true },
      { key: 'stateColors', label: 'blue and purple', type: 'bool', def: true },
    ],
  },
  {
    key: 'look',
    fields: [
      { key: 'gridMark', label: 'mark', type: 'choice', choices: ['square', 'cross', 'ascii'], def: 'square' },
      { key: 'gridCell', label: 'cell', type: 'range', min: 3, max: 40, step: 1, def: 6, unit: 'px' },
      { key: 'gridInset', label: 'inset', type: 'range', min: 0.2, max: 1, step: 0.05, def: 0.55, when: (p) => p.gridMark !== 'ascii' },
      { key: 'gridLevels', label: 'levels', type: 'range', min: 2, max: 9, step: 1, def: 5, when: (p) => p.gridMark !== 'square' },
      { key: 'gridColor', label: 'colour', type: 'color', def: '#111111', when: (p) => !p.gridPerFish },
      { key: 'gridPerFish', label: 'koi colours', type: 'bool', def: false },
      { key: 'gridFade', label: 'fade', type: 'range', min: 0, max: 0.97, step: 0.01, def: 0 },
    ],
  },
  {
    key: 'hand',
    fields: [
      { key: 'source', label: 'source', type: 'choice', choices: ['off', 'camera', 'video'], def: 'off', session: true },
      { key: 'mirror', label: 'mirror the camera', type: 'bool', def: true },
      { key: 'feedView', label: 'feed', type: 'choice', choices: ['auto', 'hidden', 'thumbnail', 'background'], def: 'auto' },
      { key: 'feedOpacity', label: 'opacity', type: 'range', min: 0.05, max: 1, step: 0.05, def: 0.2, when: (p) => feedView(p) === 'background' },
      { key: 'marker', label: 'marker', type: 'bool', def: true },
    ],
  },
];

// auto shows the camera as a thumbnail and a clip as the background
export function feedView(p) {
  if (p.feedView !== 'auto') return p.feedView;
  if (p.source === 'camera') return 'thumbnail';
  if (p.source === 'video') return 'background';
  return 'hidden';
}

export const FIELDS = GROUPS.flatMap((g) => g.fields);
const BY_KEY = new Map(FIELDS.map((f) => [f.key, f]));

export function defaults() {
  const p = {};
  for (const f of FIELDS) p[f.key] = f.def;
  return p;
}

function coerce(f, v) {
  if (f.type === 'range') {
    const n = Number(v);
    if (!Number.isFinite(n)) return undefined;
    return Math.min(f.max, Math.max(f.min, n));
  }
  if (f.type === 'bool') return v === true || v === 'true' || v === '1' || v === 1;
  if (f.type === 'choice') return f.choices.includes(v) ? v : undefined;
  if (f.type === 'color') return /^#[0-9a-f]{6}$/i.test(String(v)) ? String(v).toLowerCase() : undefined;
  return undefined;
}

// settings that differ from the defaults, skipping per-session fields
export function diff(p) {
  const out = {};
  for (const f of FIELDS) {
    if (f.session) continue;
    if (p[f.key] !== f.def) out[f.key] = p[f.key];
  }
  return out;
}

export function apply(p, patch) {
  for (const [k, v] of Object.entries(patch || {})) {
    const f = BY_KEY.get(k);
    if (!f) continue;
    const c = coerce(f, v);
    if (c !== undefined) p[k] = c;
  }
  return p;
}

export function toHash(p) {
  const d = diff(p);
  const parts = Object.entries(d).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return parts.length ? '#' + parts.join('&') : '';
}

export function fromHash(hash) {
  const out = {};
  const s = (hash || '').replace(/^#/, '');
  if (!s) return out;
  for (const part of s.split('&')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i)] = decodeURIComponent(part.slice(i + 1));
  }
  return out;
}

const STORE = 'follow-me.settings.v1';

export function load(storage, hash) {
  const p = defaults();
  try {
    const raw = storage && storage.getItem(STORE);
    if (raw) apply(p, JSON.parse(raw));
  } catch (e) {
    // a corrupt store falls back to defaults
  }
  apply(p, fromHash(hash));
  return p;
}

export function save(storage, p) {
  try {
    storage.setItem(STORE, JSON.stringify(diff(p)));
  } catch (e) {
    // private mode or full storage. settings still live for the session
  }
}

export function field(key) {
  return BY_KEY.get(key);
}
