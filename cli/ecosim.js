#!/usr/bin/env node
// Command-line runner: single runs, scenario comparison, Monte Carlo and sensitivity analysis.

import { writeFileSync } from 'node:fs';
import * as E from '../src/engine/index.js';

const HELP = `EcoSim — AI, jobs and aggregate demand simulator

Usage:
  node cli/ecosim.js list
  node cli/ecosim.js run <preset> [options]
  node cli/ecosim.js compare [preset ...] [options]
  node cli/ecosim.js mc <preset> [--runs 100] [options]
  node cli/ecosim.js tornado <preset> [--metric uPeak] [options]

Build a scenario instead of a preset with:
  --economy advanced|emerging  --ai none|gradual|rapid|boom|winnerTakeAll|cognitiveOnly
  --policy none|passive|austerity|stabilisers|ubiAiTax|jobGuarantee|wealthFund|shorterWeek|fullMix

Options:
  --set path=value   override any parameter, e.g. --set market.passThrough=0.2 (repeatable)
  --years N          horizon in years (default 25)
  --workers N        number of worker agents (default 2000)
  --seed N           random seed
  --csv FILE         write quarterly series (run) to CSV
  --json FILE        write full results to JSON
`;

function parseArgs(argv) {
  const pos = [], opt = { set: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      if (key === 'set') opt.set.push(val); else opt[key] = val;
    } else pos.push(a);
  }
  return { pos, opt };
}

function coerce(v) {
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v !== '' && !Number.isNaN(Number(v))) return Number(v);
  return v;
}

function buildFrom(id, opt) {
  const p = opt.economy || opt.ai || opt.policy || !id
    ? E.buildParams({ economy: opt.economy || 'advanced', ai: opt.ai || 'gradual', policy: opt.policy || 'none' })
    : E.presetParams(id);
  for (const s of opt.set) {
    const [path, raw] = s.split('=');
    if (E.getPath(p, path) === undefined) throw new Error(`Unknown parameter "${path}"`);
    E.setPath(p, path, coerce(raw));
  }
  if (opt.years) p.meta.years = Number(opt.years);
  if (opt.workers) p.meta.nWorkers = Number(opt.workers);
  if (opt.seed) p.meta.seed = Number(opt.seed);
  return p;
}

const pct = (x, d = 1) => (x * 100).toFixed(d) + '%';
const sign = (x, d = 1) => (x >= 0 ? '+' : '') + (x * 100).toFixed(d);

function printSummary(r) {
  const m = r.summary;
  console.log(`\n${r.name}`);
  console.log(`Outcome: ${E.OUTCOMES[m.outcome].label} — ${E.OUTCOMES[m.outcome].text}`);
  const rows = [
    ['Real GDP growth (avg/yr)', pct(m.gdpCagr, 2)],
    ['Unemployment peak', `${pct(m.uPeak)} in year ${m.uPeakYear}`],
    ['Unemployment, final 2y', pct(m.uFinal)],
    ['Median real income', sign(m.medianIncomeChange) + '%'],
    ['Real wage', sign(m.realWageChange) + '%'],
    ['Labour share of GDP', sign(m.laborShareChange) + ' pp'],
    ['Gini (disposable income)', sign(m.giniChange) + ' pts'],
    ['Poverty rate, final', pct(m.povertyFinal)],
    ['Average inflation', pct(m.avgInflation)],
    ['Public debt, final', pct(m.debtGdpFinal, 0) + ' of GDP'],
    ['Recessions', `${m.recessions} (${m.recessionQuarters} quarters)`],
    ['Max balance-sheet error', m.maxSfcError.toExponential(1)],
  ];
  for (const [k, v] of rows) console.log(`  ${k.padEnd(28)} ${v}`);
  if (r.warnings.length) console.log('Warnings:\n  ' + r.warnings.join('\n  '));
}

function printPath(r) {
  const s = r.series;
  console.log('\n  year   GDP    u     infl   LS    median  gini   debt');
  for (let q = 0; q < s.year.length; q += 8) {
    console.log(`  ${String(s.year[q]).padStart(4)} ${s.realGdp[q].toFixed(0).padStart(6)} ${pct(s.u[q]).padStart(6)} ${pct(s.inflation[q]).padStart(6)} ${pct(s.laborShare[q], 0).padStart(4)} ${s.medianIncome[q].toFixed(0).padStart(6)} ${s.gini[q].toFixed(2).padStart(6)} ${pct(s.debtGdp[q], 0).padStart(6)}`);
  }
}

function toCsv(series) {
  const keys = Object.keys(series);
  const lines = [keys.join(',')];
  for (let q = 0; q < series.year.length; q++) lines.push(keys.map((k) => +series[k][q].toFixed(6)).join(','));
  return lines.join('\n') + '\n';
}

async function main() {
  const { pos, opt } = parseArgs(process.argv.slice(2));
  const cmd = pos[0];
  if (!cmd || cmd === 'help' || opt.help) return console.log(HELP);

  if (cmd === 'list') {
    console.log('Presets:'); for (const p of E.PRESETS) console.log(`  ${p.id.padEnd(16)} ${p.label}`);
    console.log('\nEconomies:'); for (const [k, v] of Object.entries(E.ECONOMIES)) console.log(`  ${k.padEnd(16)} ${v.label}`);
    console.log('\nAI scenarios:'); for (const [k, v] of Object.entries(E.AI_SCENARIOS)) console.log(`  ${k.padEnd(16)} ${v.label}`);
    console.log('\nPolicies:'); for (const [k, v] of Object.entries(E.POLICIES)) console.log(`  ${k.padEnd(16)} ${v.label}`);
    return;
  }

  if (cmd === 'run') {
    const r = E.runSimulation(buildFrom(pos[1], opt));
    printSummary(r); printPath(r);
    if (opt.csv) { writeFileSync(opt.csv, toCsv(r.series)); console.log(`\nWrote ${opt.csv}`); }
    if (opt.json) { writeFileSync(opt.json, JSON.stringify(r)); console.log(`Wrote ${opt.json}`); }
    return;
  }

  if (cmd === 'compare') {
    const ids = pos.slice(1).length ? pos.slice(1) : E.PRESETS.map((p) => p.id);
    console.log(`${'preset'.padEnd(16)} ${'outcome'.padEnd(26)} GDP/yr  u peak   u end  median  labour  gini   poverty  debt`);
    const out = [];
    for (const id of ids) {
      const r = E.runSimulation(buildFrom(id, opt));
      const m = r.summary;
      out.push({ id, summary: m });
      console.log(`${id.padEnd(16)} ${E.OUTCOMES[m.outcome].label.padEnd(26)} ${pct(m.gdpCagr, 2).padStart(6)} ${pct(m.uPeak).padStart(7)} ${pct(m.uFinal).padStart(7)} ${sign(m.medianIncomeChange, 0).padStart(6)}% ${sign(m.laborShareChange).padStart(6)} ${sign(m.giniChange).padStart(6)} ${pct(m.povertyFinal).padStart(8)} ${pct(m.debtGdpFinal, 0).padStart(6)}`);
    }
    if (opt.json) { writeFileSync(opt.json, JSON.stringify(out, null, 2)); console.log(`Wrote ${opt.json}`); }
    return;
  }

  if (cmd === 'mc') {
    const p = buildFrom(pos[1], opt);
    const runs = Number(opt.runs || 100);
    const t0 = Date.now();
    const mc = await E.runMonteCarlo(p, {
      runs, seed: Number(opt.seed || 1), nWorkers: Number(opt.workers || 1200),
      onProgress: (k, n) => { if (process.stdout.isTTY) process.stdout.write(`\r  ${k}/${n}`); },
    });
    console.log(`\n${p.meta.name}: ${runs} draws in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    console.log('\nOutcome probabilities:');
    for (const [k, v] of Object.entries(mc.outcomes)) if (v > 0) console.log(`  ${E.OUTCOMES[k].label.padEnd(28)} ${pct(v, 0)}`);
    console.log(`  At least one recession         ${pct(mc.recessionProb, 0)}`);
    console.log('\nKey results (5th / median / 95th percentile):');
    for (const [k, v] of Object.entries(mc.summaries)) console.log(`  ${k.padEnd(22)} ${[v.p05, v.p50, v.p95].map((x) => pct(x)).join(' / ')}`);
    console.log('\nWhat drives peak unemployment (rank correlation):');
    mc.correlations.slice().sort((a, b) => Math.abs(b.uPeak) - Math.abs(a.uPeak)).slice(0, 8)
      .forEach((r) => console.log(`  ${r.uPeak >= 0 ? '+' : ''}${r.uPeak.toFixed(2)}  ${r.label}`));
    if (opt.json) { writeFileSync(opt.json, JSON.stringify(mc)); console.log(`\nWrote ${opt.json}`); }
    return;
  }

  if (cmd === 'tornado') {
    const metric = opt.metric || 'uPeak';
    const t = E.tornado(buildFrom(pos[1], opt), { metric, nWorkers: Number(opt.workers || 1200) });
    console.log(`\nSensitivity of ${metric} (central ${pct(t.central)}):`);
    for (const r of t.rows) console.log(`  ${r.label.padEnd(46)} low ${pct(r.low).padStart(7)}   high ${pct(r.high).padStart(7)}`);
    return;
  }

  console.log(HELP);
  process.exitCode = 1;
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; });
