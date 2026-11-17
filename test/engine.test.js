import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine/index.js';

const small = (id, extra = {}) => {
  const p = E.presetParams(id);
  p.meta.nWorkers = 800;
  Object.assign(p.meta, extra);
  return p;
};

test('stock-flow consistency: loans + bonds = deposits + bank equity in every quarter', () => {
  for (const id of ['baseline', 'rapid', 'rapidPassive', 'rapidMix', 'indiaWinner', 'rapidJg']) {
    const r = E.runSimulation(small(id));
    assert.ok(r.summary.maxSfcError < 1e-9, `${id}: balance-sheet error ${r.summary.maxSfcError}`);
  }
});

test('no-AI baseline is a stable balanced-growth path', () => {
  const r = E.runSimulation(small('baseline'));
  const m = r.summary;
  assert.ok(Math.max(...r.series.u) < 0.075, `unemployment peaked at ${m.uPeak}`);
  assert.ok(Math.min(...r.series.u) > 0.025, 'unemployment implausibly low');
  assert.ok(Math.abs(m.avgInflation - 0.02) < 0.006, `avg inflation ${m.avgInflation}`);
  assert.ok(Math.abs(m.gdpCagr - 0.015) < 0.004, `GDP growth ${m.gdpCagr}`);
  assert.ok(Math.abs(m.laborShareChange) < 0.02, `labour share drifted ${m.laborShareChange}`);
  assert.equal(m.outcome, 'steady');
});

test('runs are deterministic for a given seed', () => {
  const a = E.runSimulation(small('rapid'));
  const b = E.runSimulation(small('rapid'));
  assert.deepEqual(a.series.u, b.series.u);
  assert.deepEqual(a.series.realGdp, b.series.realGdp);
  const c = E.runSimulation(small('rapid', { seed: 99 }));
  assert.notDeepEqual(a.series.u, c.series.u);
});

test('every preset produces finite series', () => {
  for (const pr of E.PRESETS) {
    const r = E.runSimulation(small(pr.id, { years: 12 }));
    for (const [k, arr] of Object.entries(r.series)) {
      assert.ok(arr.every(Number.isFinite), `${pr.id}: non-finite values in ${k}`);
    }
    assert.ok(E.OUTCOMES[r.summary.outcome], `${pr.id}: unknown outcome`);
  }
});

test('directional sanity of the main mechanisms', () => {
  const run = (id, set = {}) => {
    const p = small(id);
    for (const [k, v] of Object.entries(set)) E.setPath(p, k, v);
    return E.runSimulation(p).summary;
  };
  const rapid = run('rapid');
  const passive = run('rapidPassive');
  assert.ok(passive.uPeak > rapid.uPeak + 0.1, 'a passive budget should deepen the demand shortfall');
  assert.ok(run('rapid', { 'market.passThrough': 0.9 }).uPeak < run('rapid', { 'market.passThrough': 0.1 }).uPeak,
    'passing AI savings on to prices should support demand');
  assert.ok(run('rapidPassive', { 'ai.reinstatement': 0.7 }).uPeak < passive.uPeak, 'new tasks should absorb labour');
  const ubi = run('rapidPassive', { 'gov.ubi': 0.25, 'gov.aiTax': 0.25 });
  assert.ok(ubi.povertyFinal < passive.povertyFinal, 'UBI should reduce poverty');
  assert.ok(run('baseline').laborShareChange > rapid.laborShareChange + 0.1, 'automation should lower the labour share');
});

test('parameter paths can be read and written', () => {
  const p = E.presetParams('rapid');
  E.setPath(p, 'sectors.alphaMax.0', 0.1);
  assert.equal(E.getPath(p, 'sectors.alphaMax.0'), 0.1);
  assert.equal(E.getPath(p, 'no.such.path'), undefined);
});

test('Monte Carlo returns coherent bands, probabilities and correlations', async () => {
  const p = small('rapid', { years: 10 });
  const mc = await E.runMonteCarlo(p, { runs: 8, nWorkers: 600, yieldEvery: 0 });
  const total = Object.values(mc.outcomes).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 1) < 1e-9);
  const b = mc.bands.u;
  for (let q = 0; q < b.p50.length; q++) assert.ok(b.p05[q] <= b.p50[q] && b.p50[q] <= b.p95[q]);
  assert.equal(mc.correlations.length, E.UNCERTAIN.length);
  for (const row of mc.correlations) assert.ok(Math.abs(row.uPeak) <= 1);
});
