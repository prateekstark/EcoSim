// Run driver: calibrate, burn in to a steady state, then simulate the scenario.

import { createState } from './init.js';
import { deepClone, AI_IDX } from './params.js';
import { makeRng } from './rng.js';
import { step } from './step.js';
import { createRecorder, summarise } from './metrics.js';

// Burn-in uses today's economy: the scenario's market structure and policy switch on at t = 0.
export function burnInParams(params) {
  const b = params.baseline;
  if (!b) return params;
  const pb = deepClone(params);
  pb.gov = deepClone(b.gov);
  pb.ai.foreignShare = b.foreignShare;
  pb.ai.capexImport = b.capexImport;
  pb.firms.foreignEquityShare = b.foreignEquityShare;
  return pb;
}

export function initialise(params) {
  const S = createState(burnInParams(params));
  while (S.t < 0) step(S);
  S.p = params;
  S.burnIn = false;
  // references for the potential-output index
  S.ellCoreRef = Float64Array.from(S.ellCore);
  let yNonAI = 0;
  for (let s = 0; s < S.Y.length; s++) if (s !== AI_IDX) yNonAI += S.Y[s] * S.price[s];
  S.potW = Float64Array.from(S.Y, (y, s) => (s === AI_IDX ? 0 : (y * S.price[s]) / yNonAI));
  S.Gref = S.Gtrend;
  S.realGdp = 100;
  S.realGdpHist = [100, 100, 100, 100, 100];
  return S;
}

// Deep copy of a burned-in state so many scenarios can start from identical initial conditions.
export function cloneState(S) {
  const C = {};
  for (const [k, v] of Object.entries(S)) {
    if (ArrayBuffer.isView(v)) C[k] = v.slice();
    else if (Array.isArray(v)) C[k] = v.slice();
    else if (k === 'rng' || k === 'p' || k === 'last') C[k] = v;
    else if (v && typeof v === 'object') C[k] = structuredClone(v);
    else C[k] = v;
  }
  return C;
}

// Simulate `params` from an already burned-in state (cloned, so S0 can be reused).
export function runFrom(S0, params, { seed = params.meta.seed, onQuarter } = {}) {
  const S = cloneState(S0);
  S.p = params;
  S.rng = makeRng(seed);
  const rec = createRecorder(S);
  rec.record(S);
  const T = Math.round(params.meta.years * 4);
  for (let q = 1; q <= T; q++) {
    step(S);
    rec.record(S);
    if (onQuarter) onQuarter(S, q);
  }
  return {
    name: params.meta.name,
    params,
    series: rec.series,
    snapshots: rec.snapshots,
    summary: summarise(rec.series, params),
    warnings: S.warnings,
  };
}

export function runSimulation(params, opts = {}) {
  return runFrom(initialise(params), params, opts);
}
