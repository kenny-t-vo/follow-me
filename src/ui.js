// settings pane built from the schema, the about pane, status line and hint
import { GROUPS } from './params.js';

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

function decimals(step) {
  const s = String(step);
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
}

export class UI {
  constructor({ p, onChange, onAction }) {
    this.p = p;
    this.onChange = onChange;
    this.onAction = onAction;
    this.rows = new Map();
    this.controls = document.getElementById('controls');
    this.panes = {
      settings: document.getElementById('settings'),
      about: document.getElementById('about'),
    };
    this.statusEl = document.getElementById('status');
    this.fpsEl = document.getElementById('fps');
    this.hintEl = document.getElementById('hint');
    this.openName = null;
    this.statusTimer = 0;
    for (const [name, pane] of Object.entries(this.panes)) {
      pane.querySelector('.close').addEventListener('click', () => this.hide());
      pane.dataset.pane = name;
    }
    for (const b of document.querySelectorAll('[data-action]')) {
      b.addEventListener('click', () => this.onAction(b.dataset.action));
    }
  }

  build() {
    for (const g of GROUPS) {
      const sec = el('section', 'sec');
      sec.append(el('h3', 'lbl', g.key + '.'));
      for (const f of g.fields) sec.append(this.row(f));
      this.controls.append(sec);
    }
    this.refresh();
  }

  fmt(f, v) {
    return f.type === 'range' ? Number(v).toFixed(decimals(f.step)) : String(v);
  }

  row(f) {
    const row = el('div', 'row');
    row.dataset.key = f.key;
    row.append(el('span', 'row__l', f.label));
    if (f.hint) row.title = f.hint;
    const rec = { row, field: f };
    if (f.type === 'range') {
      const val = el('span', 'row__v');
      val.dataset.edit = '';
      rec.num = el('span', 'num');
      val.append(rec.num);
      if (f.unit) val.append(el('span', 'unit', ' ' + f.unit));
      val.title = 'click to type a value';
      val.addEventListener('click', () => this.edit(rec));
      const input = el('input');
      input.type = 'range';
      input.min = f.min;
      input.max = f.max;
      input.step = f.step;
      input.setAttribute('aria-label', f.label);
      input.addEventListener('input', () => this.set(f.key, Number(input.value)));
      rec.input = input;
      row.append(val, input);
    } else if (f.type === 'bool' || f.type === 'choice') {
      const cells = el('div', 'cells');
      const opts = f.type === 'bool' ? [['on', true], ['off', false]] : f.choices.map((c) => [c, c]);
      rec.buttons = opts.map(([label, value]) => {
        const b = el('button', null, label);
        b.type = 'button';
        b.addEventListener('click', () => this.set(f.key, value));
        cells.append(b);
        return [b, value];
      });
      row.append(cells);
    } else if (f.type === 'color') {
      const val = el('span', 'row__v');
      const input = el('input');
      input.type = 'color';
      input.setAttribute('aria-label', f.label);
      input.addEventListener('input', () => this.set(f.key, input.value));
      val.append(input);
      rec.input = input;
      row.append(val);
    }
    this.rows.set(f.key, rec);
    return row;
  }

  set(key, v) {
    this.onChange(key, v);
    this.refresh();
  }

  // the value becomes a text field until enter, escape or blur
  edit(rec) {
    const f = rec.field;
    if (rec.editing) return;
    rec.editing = true;
    const input = el('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.value = this.fmt(f, this.p[f.key]);
    const val = rec.row.querySelector('.row__v');
    val.replaceChildren(input);
    input.focus();
    input.select();
    const done = (commit) => {
      if (!rec.editing) return;
      rec.editing = false;
      if (commit) {
        const n = Number(input.value);
        if (Number.isFinite(n)) this.onChange(f.key, Math.min(f.max, Math.max(f.min, n)));
      }
      val.replaceChildren(rec.num);
      if (f.unit) val.append(el('span', 'unit', ' ' + f.unit));
      this.refresh();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') done(true);
      else if (e.key === 'Escape') done(false);
      e.stopPropagation();
    });
    input.addEventListener('blur', () => done(true));
  }

  refresh() {
    const p = this.p;
    for (const rec of this.rows.values()) {
      const f = rec.field, v = p[f.key];
      rec.row.hidden = f.when ? !f.when(p) : false;
      if (f.type === 'range') {
        rec.input.value = v;
        rec.num.textContent = this.fmt(f, v);
      } else if (rec.buttons) {
        for (const [b, value] of rec.buttons) b.setAttribute('aria-pressed', String(value === v));
      } else if (f.type === 'color') {
        rec.input.value = v;
      }
    }
  }

  show(name) {
    for (const [k, pane] of Object.entries(this.panes)) pane.hidden = k !== name;
    this.openName = name;
    document.body.dataset.pane = name;
  }

  hide() {
    for (const pane of Object.values(this.panes)) pane.hidden = true;
    this.openName = null;
    delete document.body.dataset.pane;
  }

  toggle(name) {
    if (this.openName === name) this.hide();
    else this.show(name);
  }

  // sticky messages stay until replaced; others clear after four seconds
  status(text, sticky) {
    this.statusEl.textContent = text || '';
    clearTimeout(this.statusTimer);
    if (text && !sticky) this.statusTimer = setTimeout(() => (this.statusEl.textContent = ''), 4000);
  }

  fps(text) {
    if (this.fpsEl) this.fpsEl.textContent = text;
  }

  hint(show) {
    this.hintEl.hidden = false;
    this.hintEl.classList.toggle('hint--gone', !show);
  }
}
