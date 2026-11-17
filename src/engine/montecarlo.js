// Monte Carlo over the genuinely uncertain parameters, plus one-at-a-time sensitivity (tornado).
// All sampled parameters are neutral at the calibrated steady state, so every draw can start
// from the same burned-in economy and differences are purely due to the AI transition.

import { deepClone, getPath, setPath } from './params.js';
import { initialise, runFrom } from './model.js';
import { OUTCOMES } from './metrics.js';
import { makeRng } from './rng.js';

export const UNCERTAIN = [
  { path: 'ai.cogMid', label: 'Timing of cognitive AI (years to midpoint)', lo: -3, hi: 4, mode: 'add', min: 1 },
  { path: 'ai.cogMax', label: 'Ceiling of cognitive AI capability', lo: 0.7, hi: 1.05, mode: 'mul', min: 0, max: 1 },
  { path: 'ai.physMid', label: 'Timing of robotics (years to midpoint)', lo: -4, hi: 6, mode: 'add', min: 2 },
  { path: 'ai.costDecline', label: 'Speed of AI cost decline', lo: 0.5, hi: 1.5, mode: 'mul' },
  { path: 'ai.adoptSpeed', label: 'Speed of firm adoption', lo: 0.5, hi: 1.6, mode: 'mul' },
  { path: 'ai.reinstatement', label: 'New human tasks per automated task', lo: -0.2, hi: 0.25, mode: 'add', min: 0, max: 0.95 },
  { path: 'ai.augmentation', label: 'Productivity boost to remaining work', lo: 0.5, hi: 1.5, mode: 'mul' },
  { path: 'ai.foreignShare', label: 'Share of AI bought from foreign providers', lo: -0.15, hi: 0.15, mode: 'add', min: 0, max: 0.95 },
  { path: 'market.passThrough', label: 'Pass-through of AI savings to prices', lo: -0.25, hi: 0.25, mode: 'add', min: 0, max: 1 },
  { path: 'market.sigmaC', label: 'Substitutability between sectors', lo: -0.3, hi: 0.4, mode: 'add', min: 0.2 },
  { path: 'labor.mobility', label: 'Worker mobility across sectors', lo: 0.5, hi: 1.6, mode: 'mul', max: 1 },
  { path: 'households.confChange', label: 'Precautionary saving response', lo: 0.3, hi: 2.0, mode: 'mul' },
  { path: 'labor.phillips', label: 'Wage response to unemployment', lo: 0.5, hi: 1.5, mode: 'mul' },
];

export const MC_SERIES = [
  'realGdp', 'u', 'laborShare', 'medianIncome', 'realWage', 'consWorkers', 'consOwners',
  'gini', 'poverty', 'inflation', 'debtGdp', 'deficit', 'profitShare', 'policyRate', 'alpha_COG', 'emp_PER',
];

export const SUMMARY_KEYS = ['gdpCagr', 'uPeak', 'uFinal', 'medianIncomeChange', 'laborShareChange', 'giniChange', 'povertyFinal', 'debtGdpFinal'];

function perturb(base, spec, rng) {
  const neutral = spec.mode === 'mul' ? 1 : 0;
  const x = rng.triangular(spec.lo, neutral, spec.hi);
  let v = spec.mode === 'mul' ? base * x : base + x;
  if (spec.min !== undefined) v = Math.max(spec.min, v);
  if (spec.max !== undefined) v = Math.min(spec.max, v);
  return { value: v, shock: x };
}

function percentile(sorted, q) {
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function ranks(arr) {
  const idx = arr.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(arr.length);
  for (let k = 0; k < idx.length;) {
    let j = k;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[k][0]) j++;
    for (let m = k; m <= j; m++) r[idx[m][1]] = (k + j) / 2;
    k = j + 1;
  }
  return r;
}

export function spearman(x, y) {
  const rx = ranks(x), ry = ranks(y), n = x.length;
  const mx = rx.reduce((a, b) => a + b, 0) / n, my = ry.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const a = rx[i] - mx, b = ry[i] - my; sxy += a * b; sxx += a * a; syy += b * b; }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
}

/**
 * Run `runs` draws of the uncertain parameters around `params`.
 * Returns percentile bands per series, outcome probabilities and parameter-outcome correlations.
 */
export async function runMonteCarlo(params, {
  runs = 100, seed = 1, nWorkers = 1200, demandSigma = 0.01, specs = UNCERTAIN,
  keepPaths = 30, onProgress = null, yieldEvery = 4,
} = {}) {
  const base = deepClone(params);
  base.meta.nWorkers = nWorkers;
  const S0 = initialise(base);
  const rng = makeRng(seed * 7919 + 13);
  const results = [];
  const samples = specs.map(() => []);
  for (let k = 0; k < runs; k++) {
    const p = deepClone(base);
    specs.forEach((spec, j) => {
      const cur = getPath(p, spec.path);
      const { value } = perturb(cur, spec, rng);
      setPath(p, spec.path, value);
      samples[j].push(value);
    });
    p.shocks.demandSigma = demandSigma;
    const r = runFrom(S0, p, { seed: seed * 1000 + k });
    const series = {};
    for (const key of MC_SERIES) series[key] = r.series[key];
    results.push({ series, summary: r.summary });
    if (onProgress) onProgress(k + 1, runs);
    if (yieldEvery && (k + 1) % yieldEvery === 0) await new Promise((res) => setTimeout(res, 0));
  }
  return aggregate(results, samples, specs, base, keepPaths);
}

function aggregate(results, samples, specs, params, keepPaths) {
  const T = results[0].series.realGdp.length;
  const year = Array.from({ length: T }, (_, q) => q / 4);
  const bands = {};
  for (const key of MC_SERIES) {
    const b = { p05: [], p25: [], p50: [], p75: [], p95: [], mean: [] };
    for (let q = 0; q < T; q++) {
      const col = results.map((r) => r.series[key][q]).sort((a, c) => a - c);
      b.p05.push(percentile(col, 0.05)); b.p25.push(percentile(col, 0.25)); b.p50.push(percentile(col, 0.5));
      b.p75.push(percentile(col, 0.75)); b.p95.push(percentile(col, 0.95));
      b.mean.push(col.reduce((a, c) => a + c, 0) / col.length);
    }
    bands[key] = b;
  }
  const outcomes = {};
  for (const k of Object.keys(OUTCOMES)) outcomes[k] = 0;
  for (const r of results) outcomes[r.summary.outcome]++;
  for (const k of Object.keys(outcomes)) outcomes[k] /= results.length;

  const summaries = {};
  for (const key of SUMMARY_KEYS) {
    const vals = results.map((r) => r.summary[key]).sort((a, c) => a - c);
    summaries[key] = { p05: percentile(vals, 0.05), p50: percentile(vals, 0.5), p95: percentile(vals, 0.95), values: results.map((r) => r.summary[key]) };
  }
  const correlations = specs.map((spec, j) => {
    const row = { path: spec.path, label: spec.label };
    for (const key of SUMMARY_KEYS) row[key] = spearman(samples[j], results.map((r) => r.summary[key]));
    return row;
  });
  const recessionProb = results.filter((r) => r.summary.recessions > 0).length / results.length;
  const paths = results.slice(0, keepPaths).map((r) => ({ u: r.series.u, realGdp: r.series.realGdp, outcome: r.summary.outcome }));
  return { runs: results.length, year, bands, outcomes, summaries, correlations, recessionProb, paths, name: params.meta.name };
}

/** One-at-a-time sensitivity of a summary metric to each uncertain parameter (low vs high end). */
export function tornado(params, { metric = 'uPeak', nWorkers = 1200, specs = UNCERTAIN, seed = 7 } = {}) {
  const base = deepClone(params);
  base.meta.nWorkers = nWorkers;
  const S0 = initialise(base);
  const central = runFrom(S0, base, { seed }).summary[metric];
  const rows = specs.map((spec) => {
    const at = (x) => {
      const p = deepClone(base);
      const cur = getPath(p, spec.path);
      let v = spec.mode === 'mul' ? cur * x : cur + x;
      if (spec.min !== undefined) v = Math.max(spec.min, v);
      if (spec.max !== undefined) v = Math.min(spec.max, v);
      setPath(p, spec.path, v);
      return { v, m: runFrom(S0, p, { seed }).summary[metric] };
    };
    const lo = at(spec.lo), hi = at(spec.hi);
    return { path: spec.path, label: spec.label, low: lo.m, high: hi.m, lowValue: lo.v, highValue: hi.v, swing: Math.abs(hi.m - lo.m) };
  });
  rows.sort((a, b) => b.swing - a.swing);
  return { metric, central, rows };
}
