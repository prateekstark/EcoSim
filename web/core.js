// Shared state, formatting and the simulation worker client.

import * as E from '../src/engine/index.js';

export const $ = (sel) => document.querySelector(sel);
export const fmt = {
  pct: (v, d = 1) => (Number.isFinite(v) ? `${(v * 100).toFixed(d)}%` : '–'),
  pp: (v, d = 1) => (Number.isFinite(v) ? `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(d)} pp` : '–'),
  chg: (v, d = 0) => (Number.isFinite(v) ? `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(d)}%` : '–'),
  idx: (v) => (Number.isFinite(v) ? v.toFixed(0) : '–'),
  ratio: (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '–'),
  yr: (v) => `${Math.round(v)}`,
};
export const SERIES_COLORS = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)', 'var(--s8)'];
export const SECTOR_NAMES = ['Knowledge work', 'Routine office', 'Manufacturing & logistics', 'In-person services', 'AI & digital'];
export const OUTCOME_ICON = { boom: '▲', steady: '●', kshaped: '◆', stagnation: '▬', deflation: '▼', collapse: '✕' };

export function pill(outcome) {
  const o = E.OUTCOMES[outcome];
  return `<span class="pill ${outcome}"><i aria-hidden="true">${OUTCOME_ICON[outcome]}</i>${o.label}</span>`;
}

// ---------------------------------------------------------------- worker
let worker = null, reqId = 0;
const pending = new Map();
function createWorker() {
  const src = document.getElementById('worker-src');
  if (src) {
    const url = URL.createObjectURL(new Blob([src.textContent], { type: 'text/javascript' }));
    return new Worker(url);
  }
  return new Worker('./worker.js', { type: 'module' });
}
export function request(type, payload, onProgress) {
  if (!worker) {
    worker = createWorker();
    worker.onmessage = (ev) => {
      const { id, kind, data } = ev.data;
      const p = pending.get(id);
      if (!p) return;
      if (kind === 'progress') p.onProgress?.(data);
      else { pending.delete(id); kind === 'error' ? p.reject(new Error(data.message)) : p.resolve(data); }
    };
  }
  const id = ++reqId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress });
    worker.postMessage({ id, type, payload });
  });
}

// ---------------------------------------------------------------- state
export const state = {
  economy: 'advanced', ai: 'rapid', policy: 'none', presetId: 'rapid',
  params: null, preset: null, scen: null, base: null, tab: 'overview', runToken: 0,
};

export function counterfactual(p) {
  const b = E.deepClone(p);
  Object.assign(b.ai, { cogMax: 0, physMax: 0, costDecline: 0, reinstatement: 0 });
  b.meta.name = 'No AI';
  return b;
}

export function card(host, title, sub, wide) {
  const c = document.createElement('div');
  c.className = 'card' + (wide ? ' wide' : '');
  c.innerHTML = `<h3>${title}</h3>${sub ? `<p class="sub">${sub}</p>` : ''}<div class="chart-host"></div>`;
  host.appendChild(c);
  return c.querySelector('.chart-host');
}

