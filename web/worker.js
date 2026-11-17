// Runs simulations off the main thread so the dashboard stays responsive.

import * as E from '../src/engine/index.js';

const KEEP = null; // send every series

function slim(r) {
  // Snapshots: downsample each sorted income array to 101 percentile points.
  const snapshots = r.snapshots.map((s) => {
    const n = s.incomes.length;
    return { year: s.year, pts: Array.from({ length: 101 }, (_, k) => s.incomes[Math.min(n - 1, Math.round((k / 100) * (n - 1)))]) };
  });
  return { name: r.name, series: KEEP ? pick(r.series, KEEP) : r.series, summary: r.summary, snapshots, warnings: r.warnings };
}
function pick(o, keys) { const out = {}; for (const k of keys) out[k] = o[k]; return out; }

self.onmessage = async (ev) => {
  const { id, type, payload } = ev.data;
  const post = (kind, data) => self.postMessage({ id, kind, data });
  try {
    if (type === 'run') {
      const { params, baseline } = payload;
      const out = { scenario: slim(E.runSimulation(params)) };
      if (baseline) out.baseline = slim(E.runSimulation(baseline));
      post('result', out);
    } else if (type === 'compare') {
      const out = [];
      for (let k = 0; k < payload.list.length; k++) {
        const { id: pid, params } = payload.list[k];
        const r = E.runSimulation(params);
        out.push({ id: pid, name: params.meta.name, summary: r.summary, series: r.series });
        post('progress', { done: k + 1, total: payload.list.length });
      }
      post('result', out);
    } else if (type === 'mc') {
      const mc = await E.runMonteCarlo(payload.params, {
        runs: payload.runs, nWorkers: payload.nWorkers, seed: payload.seed || 1, yieldEvery: 0,
        onProgress: (done, total) => post('progress', { done, total }),
      });
      post('result', mc);
    } else if (type === 'tornado') {
      post('result', E.tornado(payload.params, { metric: payload.metric, nWorkers: payload.nWorkers }));
    }
  } catch (err) {
    post('error', { message: err.message, stack: err.stack });
  }
};
