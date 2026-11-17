// Compare, Monte Carlo and explainer views.

import * as E from '../src/engine/index.js';
import * as Charts from './charts.js';
import { $, fmt, SERIES_COLORS, OUTCOME_ICON, pill, request, state, card } from './core.js';

const METRICS = [
  ['u', 'Unemployment rate', (v) => fmt.pct(v, 1)],
  ['realGdp', 'Real GDP (index)', fmt.idx],
  ['medianIncome', 'Median real income (index)', fmt.idx],
  ['laborShare', 'Labour share of GDP', (v) => fmt.pct(v, 0)],
  ['consWorkers', 'Worker households\' real consumption (index)', fmt.idx],
  ['consOwners', 'Capital owners\' real consumption (index)', fmt.idx],
  ['gini', 'Gini coefficient', (v) => v.toFixed(2)],
  ['poverty', 'Poverty rate', (v) => fmt.pct(v, 0)],
  ['inflation', 'CPI inflation', (v) => fmt.pct(v, 1)],
  ['debtGdp', 'Public debt, % GDP', (v) => fmt.pct(v, 0)],
  ['realWage', 'Real wage (index)', fmt.idx],
];
const OUTCOME_COLOR = { boom: 'var(--good)', steady: 'var(--cf)', kshaped: 'var(--warning)', stagnation: 'var(--serious)', deflation: 'var(--serious)', collapse: 'var(--critical)' };

const cmp = { selected: ['baseline', 'rapid', 'rapidPassive', 'rapidAusterity', 'boom', 'rapidUbi', 'rapidMix'], colors: {}, results: null, metric: 'u' };
const mc = { result: null, metric: 'uPeak', busy: false };

function assignColors() {
  const used = new Set(Object.entries(cmp.colors).filter(([id]) => cmp.selected.includes(id)).map(([, c]) => c));
  for (const id of Object.keys(cmp.colors)) if (!cmp.selected.includes(id)) delete cmp.colors[id];
  for (const id of cmp.selected) {
    if (cmp.colors[id]) continue;
    const c = SERIES_COLORS.find((x) => !used.has(x));
    cmp.colors[id] = c; used.add(c);
  }
}

export function initViews() {
  assignColors();
  $('#cmp-metric').innerHTML = METRICS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('');
  $('#cmp-metric').addEventListener('change', (e) => { cmp.metric = e.target.value; drawCompare(); });
  $('#cmp-chips').addEventListener('click', (e) => {
    const c = e.target.closest('.chip');
    if (!c) return;
    const id = c.dataset.id;
    if (cmp.selected.includes(id)) cmp.selected = cmp.selected.filter((x) => x !== id);
    else if (cmp.selected.length < 8) cmp.selected.push(id);
    assignColors();
    renderChips();
  });
  $('#cmp-run').addEventListener('click', runCompare);
  const runs = $('#mc-runs');
  const note = () => {
    $('#mc-runs-v').textContent = runs.value;
    $('#mc-note').textContent = `Roughly ${Math.max(2, Math.round(runs.value * 0.12))} s at 1,200 workers per run.`;
  };
  runs.addEventListener('input', note); note();
  $('#mc-run').addEventListener('click', runMc);
}

// ---------------------------------------------------------------- compare
function renderChips() {
  $('#cmp-chips').innerHTML = E.PRESETS.map((p) => {
    const on = cmp.selected.includes(p.id);
    return `<button type="button" class="chip" data-id="${p.id}" aria-pressed="${on}">${on ? `<i class="sw" style="--c:${cmp.colors[p.id]}"></i>` : ''}${p.label}</button>`;
  }).join('');
}

export function renderCompare() {
  renderChips();
  $('#cmp-metric').value = cmp.metric;
  if (cmp.results) drawCompare();
}

async function runCompare() {
  const btn = $('#cmp-run');
  btn.disabled = true;
  const list = cmp.selected.map((id) => {
    const p = E.presetParams(id);
    Object.assign(p.meta, { years: state.params.meta.years, nWorkers: Math.min(state.params.meta.nWorkers, 1500), seed: state.params.meta.seed });
    return { id, params: p };
  });
  $('#cmp-prog').style.width = '0%';
  try {
    cmp.results = await request('compare', { list }, ({ done, total }) => { $('#cmp-prog').style.width = `${(100 * done) / total}%`; });
    drawCompare();
  } catch (err) {
    $('#cmp-chart').innerHTML = `<div class="empty">Comparison failed: ${err.message}</div>`;
  } finally { btn.disabled = false; }
}

function drawCompare() {
  const res = cmp.results;
  if (!res) return;
  const [key, label, f] = METRICS.find((m) => m[0] === cmp.metric);
  const host = $('#cmp-chart');
  host.innerHTML = `<h3 style="margin:0 0 6px;font-size:14px">${label}</h3><div></div>`;
  Charts.lineChart(host.lastElementChild, {
    x: res[0].series.year, fmt: f, height: 300,
    series: res.map((r) => ({ name: E.PRESETS.find((p) => p.id === r.id).label, values: r.series[key], color: cmp.colors[r.id] || 'var(--cf)' })),
  });
  const rows = res.map((r) => {
    const m = r.summary;
    return `<tr><td><i class="sw" style="--c:${cmp.colors[r.id]}"></i> ${E.PRESETS.find((p) => p.id === r.id).label}</td><td style="text-align:left">${pill(m.outcome)}</td>
      <td class="num">${fmt.pct(m.gdpCagr, 2)}</td><td class="num">${fmt.pct(m.uPeak)}</td><td class="num">${fmt.pct(m.uFinal)}</td>
      <td class="num">${fmt.chg(m.medianIncomeChange)}</td><td class="num">${fmt.pp(m.laborShareChange)}</td>
      <td class="num">${(m.giniChange * 100).toFixed(1)}</td><td class="num">${fmt.pct(m.povertyFinal)}</td><td class="num">${fmt.pct(m.debtGdpFinal, 0)}</td></tr>`;
  }).join('');
  $('#cmp-table').innerHTML = `<table><thead><tr><th>Scenario</th><th style="text-align:left">Outcome</th><th>GDP / yr</th><th>Peak unemp.</th><th>Final unemp.</th>
    <th>Median income</th><th>Labour share</th><th>Gini Δ (pts)</th><th>Poverty</th><th>Public debt</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// ---------------------------------------------------------------- Monte Carlo
async function runMc() {
  if (mc.busy) return;
  mc.busy = true;
  const btn = $('#mc-run');
  btn.disabled = true;
  $('#mc-prog').style.width = '0%';
  const runs = Number($('#mc-runs').value);
  const t0 = performance.now();
  try {
    mc.result = await request('mc', { params: E.deepClone(state.params), runs, nWorkers: 1200, seed: state.params.meta.seed },
      ({ done, total }) => { $('#mc-prog').style.width = `${(100 * done) / total}%`; });
    mc.result.seconds = (performance.now() - t0) / 1000;
    mc.result.scenario = state.params.meta.name;
    drawMc();
  } catch (err) {
    $('#mc-out').innerHTML = `<div class="empty">Monte Carlo failed: ${err.message}</div>`;
  } finally { mc.busy = false; btn.disabled = false; }
}

export function renderMc() { if (mc.result) drawMc(); }

const DRIVER_METRICS = [
  ['uPeak', 'Peak unemployment'], ['gdpCagr', 'GDP growth'], ['medianIncomeChange', 'Median real income'],
  ['laborShareChange', 'Labour share'], ['giniChange', 'Inequality (Gini)'], ['debtGdpFinal', 'Public debt'],
];

function drawMc() {
  const r = mc.result;
  const out = $('#mc-out');
  const order = ['boom', 'steady', 'kshaped', 'stagnation', 'deflation', 'collapse'];
  const probs = order.map((k) => `<div class="prob"><span>${pill(k)}</span><div class="bar"><i style="width:${(r.outcomes[k] * 100).toFixed(1)}%;background:${OUTCOME_COLOR[k]}"></i></div><span class="num">${fmt.pct(r.outcomes[k], 0)}</span></div>`).join('');
  const S = r.summaries;
  const row = (label, key, f) => `<tr><td>${label}</td><td class="num">${f(S[key].p05)}</td><td class="num">${f(S[key].p50)}</td><td class="num">${f(S[key].p95)}</td></tr>`;
  out.innerHTML = `
    <div class="grid2">
      <div class="card"><h3>Chance of each outcome</h3><p class="sub">${r.runs} runs of “${r.scenario}” · ${fmt.pct(r.recessionProb, 0)} include at least one recession · ${r.seconds.toFixed(1)} s</p><div class="probs">${probs}</div></div>
      <div class="card"><h3>Range of results</h3><p class="sub">5th percentile, median and 95th percentile across runs</p>
        <div class="table-wrap" style="border:0"><table><thead><tr><th>Result</th><th>5th</th><th>Median</th><th>95th</th></tr></thead><tbody>
        ${row('GDP growth / yr', 'gdpCagr', (v) => fmt.pct(v, 2))}
        ${row('Peak unemployment', 'uPeak', (v) => fmt.pct(v))}
        ${row('Final unemployment', 'uFinal', (v) => fmt.pct(v))}
        ${row('Median real income', 'medianIncomeChange', (v) => fmt.chg(v))}
        ${row('Labour share change', 'laborShareChange', (v) => fmt.pp(v))}
        ${row('Gini change (pts)', 'giniChange', (v) => (v * 100).toFixed(1))}
        ${row('Poverty, final', 'povertyFinal', (v) => fmt.pct(v))}
        ${row('Public debt, final', 'debtGdpFinal', (v) => fmt.pct(v, 0))}
        </tbody></table></div></div>
    </div>
    <div class="grid2" id="mc-fans"></div>
    <div class="card"><div class="toolbar" style="justify-content:space-between"><div><h3>Which assumptions matter most?</h3>
      <p class="sub">Rank correlation between each uncertain assumption and the result across runs. Bars to the right push the result up.</p></div>
      <div class="field" style="min-width:200px"><label for="mc-metric">Result</label><select id="mc-metric">${DRIVER_METRICS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div></div>
      <div class="drivers" id="mc-drivers"></div></div>`;
  $('#mc-metric').value = mc.metric;
  $('#mc-metric').addEventListener('change', (e) => { mc.metric = e.target.value; drawDrivers(); });
  const fans = $('#mc-fans');
  const x = r.year;
  const fan = (key, title, sub, f) => {
    const b = r.bands[key];
    Charts.lineChart(card(fans, title, sub), {
      x, fmt: f, legend: false,
      bands: [{ lo: b.p05, hi: b.p95, color: 'var(--s1)', opacity: 0.14 }, { lo: b.p25, hi: b.p75, color: 'var(--s1)', opacity: 0.26 }],
      series: [{ name: 'Median', values: b.p50, color: 'var(--s1)' }],
      bandLabel: (i) => `50% of runs ${f(b.p25[i])} – ${f(b.p75[i])}<br>90% of runs ${f(b.p05[i])} – ${f(b.p95[i])}`,
    });
  };
  fan('u', 'Unemployment rate', 'Median, 50% band and 90% band', (v) => fmt.pct(v, 1));
  fan('realGdp', 'Real GDP', 'Index, year 0 = 100', fmt.idx);
  fan('medianIncome', 'Median household real income', 'Index, year 0 = 100', fmt.idx);
  fan('laborShare', 'Labour share of GDP', 'Wages as a share of GDP', (v) => fmt.pct(v, 0));
  drawDrivers();
}

function drawDrivers() {
  const rows = mc.result.correlations.slice().sort((a, b) => Math.abs(b[mc.metric]) - Math.abs(a[mc.metric]));
  $('#mc-drivers').innerHTML = rows.map((row) => {
    const v = row[mc.metric];
    const w = Math.abs(v) * 50;
    const style = v >= 0 ? `left:50%;width:${w}%;background:var(--pos)` : `right:50%;width:${w}%;background:var(--neg)`;
    return `<div class="driver"><span>${row.label}</span><div class="dbar"><i style="${style}"></i></div><span class="num" style="text-align:right">${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}</span></div>`;
  }).join('');
}

// ---------------------------------------------------------------- explainer
let howDone = false;
export function renderHow() {
  if (howDone) return;
  howDone = true;
  $('#how').innerHTML = `<div class="prose">
  <h3>The question</h3>
  <p>Wages are most households' income and most firms' revenue. If AI takes over tasks people are paid for, labour income falls unless those people find other work. Workers spend nearly all they earn; the owners of the firms and the AI suppliers who receive the savings spend much less of it. So automation can open a gap in demand, and less demand means fewer jobs. The model asks when that loop turns into a recession, and what closes the gap.</p>
  </div>
  <div class="loop" aria-label="Diagram of the demand circuit">${LOOP_SVG}</div>
  <div class="prose">
  <h3>What can close the gap</h3>
  <ul>
    <li><b>Cheaper goods.</b> If competition passes AI savings on to prices, every remaining income buys more (<i>Savings passed to prices</i>).</li>
    <li><b>New work.</b> New tasks that need people (Acemoglu &amp; Restrepo's “reinstatement”), and spending shifting toward services AI can't do cheaply (Baumol).</li>
    <li><b>Owners spending their gains.</b> Profits turn into consumption slowly, through dividends and wealth effects.</li>
    <li><b>Investment.</b> Data-centre build-outs and business investment add demand while they last.</li>
    <li><b>Monetary policy.</b> Lower rates encourage borrowing, until they hit the floor.</li>
    <li><b>Fiscal policy.</b> Automatic stabilisers, spending that keeps pace with potential output, and new tools: AI taxes, UBI, job guarantees, wealth funds, shorter hours.</li>
  </ul>
  <h3>What is inside</h3>
  <ul>
    <li><b>Thousands of individual households</b>: workers with sector-specific skills, savings, debt and pension equity, and a Pareto-distributed class of capital owners. Each decides how much to spend from its own income, wealth, confidence and credit.</li>
    <li><b>Five sectors</b>: knowledge work, routine office, manufacturing &amp; logistics, in-person services, and AI &amp; digital. AI adoption follows cognitive and robotic capability curves and only proceeds when AI is cheaper than the wage it replaces.</li>
    <li><b>A labour market with frictions</b>: layoffs, churn, matching, retraining delays and pay penalties for switching sector.</li>
    <li><b>Prices and wages</b>: markup pricing with partial pass-through of AI savings, a wage Phillips curve with downward rigidity, and a Taylor-rule central bank with a lower bound.</li>
    <li><b>Complete balance sheets</b>: households, capital owners, firms, banks, government and the rest of the world. Every flow is booked twice, so money never appears or disappears; the identity is checked every quarter to about 10<sup>−14</sup>.</li>
  </ul>
  <h3>How runs start</h3>
  <p>Each run first simulates 30 years of today's economy without new AI and calibrates two constants so that it settles on a balanced-growth path: unemployment at its normal rate, stable inflation and a steady public-debt ratio. The scenario's AI trajectory, market structure and policy then switch on at year 0. Every chart compares it with the same economy without AI.</p>
  <h3>How to read the outcomes</h3>
  <ul>${Object.entries(E.OUTCOMES).map(([k, o]) => `<li>${pill(k)} ${o.text}</li>`).join('')}</ul>
  <h3>What it cannot tell you</h3>
  <ul>
    <li>It is a stylised, calibrated model, not a forecast. Parameters sit in plausible ranges; the Monte Carlo tab shows how much the answer depends on them.</li>
    <li>New industries appear only through the reinstatement parameter and consumer-AI spending; genuinely unimagined products are outside the model.</li>
    <li>Exchange rates, housing, migration and politics are absent or reduced to simple rules.</li>
  </ul>
  <h3>Running it yourself</h3>
<pre>npm start                                  # this dashboard at http://localhost:8080
node cli/ecosim.js compare                 # every preset side by side
node cli/ecosim.js run rapid --set market.passThrough=0.8 --csv out.csv
node cli/ecosim.js mc rapidPassive --runs 300
node cli/ecosim.js tornado rapid --metric uPeak</pre>
  </div>`;
}

const LOOP_SVG = `<svg viewBox="0 0 760 400" role="img">
  <title>The demand circuit: AI adoption cuts paid tasks, which cuts household income, consumer spending and firms' revenue. Cost savings flow to profits and AI vendors, from which part leaks out.</title>
  <defs>
    <marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" style="fill:var(--ink-3)"/></marker>
    <marker id="ahr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" style="fill:var(--critical)"/></marker>
    <marker id="ahg" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" style="fill:var(--good)"/></marker>
  </defs>
  <g class="node"><rect x="285" y="14" width="190" height="50" rx="8"/><text x="380" y="36" text-anchor="middle">AI adoption</text><text class="s" x="380" y="53" text-anchor="middle">where AI is cheaper than wages</text></g>
  <g class="node"><rect x="550" y="140" width="190" height="50" rx="8"/><text x="645" y="162" text-anchor="middle">Fewer paid tasks</text><text class="s" x="645" y="179" text-anchor="middle">layoffs, lower labour share</text></g>
  <g class="node"><rect x="285" y="266" width="190" height="50" rx="8"/><text x="380" y="288" text-anchor="middle">Household income</text><text class="s" x="380" y="305" text-anchor="middle">wages, benefits, dividends</text></g>
  <g class="node"><rect x="20" y="140" width="190" height="50" rx="8"/><text x="115" y="162" text-anchor="middle">Consumer spending</text><text class="s" x="115" y="179" text-anchor="middle">= firms' revenue</text></g>
  <g class="node center"><rect x="300" y="140" width="160" height="50" rx="8"/><text x="380" y="162" text-anchor="middle">Profits &amp; AI rents</text><text class="s" x="380" y="179" text-anchor="middle">owners spend less of it</text></g>
  <path class="flow" d="M477,40 C565,44 640,82 645,137" marker-end="url(#ah)"/>
  <path class="flow" d="M645,193 C640,250 565,286 478,291" marker-end="url(#ah)"/>
  <path class="flow" d="M283,291 C195,286 120,250 115,193" marker-end="url(#ah)"/>
  <path class="flow" d="M115,137 C120,82 195,44 282,40" marker-end="url(#ah)"/>
  <path class="leak" d="M380,66 L380,137" marker-end="url(#ahr)"/>
  <path class="div" d="M380,192 L380,263" marker-end="url(#ah)"/>
  <path class="leak" d="M462,178 C500,205 515,225 520,248" marker-end="url(#ahr)"/>
  <text class="lbl leak-t" x="390" y="98">cost savings</text>
  <text class="lbl leak-t" x="390" y="112">become margins</text>
  <text class="lbl" x="372" y="224" text-anchor="end">dividends,</text>
  <text class="lbl" x="372" y="238" text-anchor="end">slowly</text>
  <text class="lbl leak-t" x="530" y="258">saved, or paid</text>
  <text class="lbl leak-t" x="530" y="272">to foreign vendors</text>
  <text class="lbl" x="598" y="66">tasks automated</text>
  <text class="lbl" x="660" y="236">wage income</text>
  <text class="lbl" x="660" y="250">falls</text>
  <text class="lbl" x="150" y="318" text-anchor="end">workers spend</text>
  <text class="lbl" x="150" y="332" text-anchor="end">~90% of income</text>
  <text class="lbl" x="165" y="66" text-anchor="end">less revenue,</text>
  <text class="lbl" x="165" y="80" text-anchor="end">fewer jobs</text>
  <line x1="20" y1="352" x2="740" y2="352" style="stroke:var(--rule)"/>
  <path class="flow" d="M20,378 L52,378" marker-end="url(#ah)"/><text class="lbl" x="60" y="382">spending and income</text>
  <path class="leak" d="M190,378 L222,378" marker-end="url(#ahr)"/><text class="lbl" x="230" y="382">leak out of the circuit</text>
  <path class="offset" d="M375,378 L407,378" marker-end="url(#ahg)"/><text class="lbl off-t" x="415" y="382">refills: cheaper goods · new tasks · transfers · public spending</text>
</svg>`;
