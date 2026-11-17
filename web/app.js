// Dashboard: scenario builder, worker orchestration, overview and distribution views.

import * as E from '../src/engine/index.js';
import * as Charts from './charts.js';
import { GROUPS } from './controls.js';
import * as Views from './views.js';
import { $, fmt, SERIES_COLORS, SECTOR_NAMES, pill, request, state, counterfactual, card } from './core.js';

function setStatus(text, busy) {
  $('#status-text').textContent = text;
  $('#status').classList.toggle('busy', !!busy);
}

let baseCache = { key: null, result: null };
let runTimer = null;
export function scheduleRun(delay = 350) {
  clearTimeout(runTimer);
  runTimer = setTimeout(run, delay);
}

async function run() {
  const token = ++state.runToken;
  const params = E.deepClone(state.params);
  const cf = counterfactual(params);
  const key = JSON.stringify(cf);
  setStatus('Simulating…', true);
  const t0 = performance.now();
  try {
    const out = await request('run', { params, baseline: baseCache.key === key ? null : cf });
    if (token !== state.runToken) return;
    if (out.baseline) baseCache = { key, result: out.baseline };
    state.scen = out.scenario;
    state.base = baseCache.result;
    setStatus(`Ran ${params.meta.years} years × ${params.meta.nWorkers.toLocaleString()} workers in ${((performance.now() - t0) / 1000).toFixed(1)} s`, false);
    renderCurrent();
  } catch (err) {
    setStatus(`Simulation failed: ${err.message}`, false);
  }
}

// ---------------------------------------------------------------- rail
function buildRail() {
  const pbox = $('#presets');
  pbox.innerHTML = E.PRESETS.map((p) => `<button class="preset" type="button" data-id="${p.id}" aria-pressed="false">${p.label}</button>`).join('');
  pbox.addEventListener('click', (e) => {
    const b = e.target.closest('.preset');
    if (!b) return;
    const pr = E.PRESETS.find((p) => p.id === b.dataset.id);
    loadScenario({ economy: pr.economy, ai: pr.ai, policy: pr.policy, presetId: pr.id });
  });
  const fill = (sel, obj) => { $(sel).innerHTML = Object.entries(obj).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join(''); };
  fill('#sel-economy', E.ECONOMIES); fill('#sel-ai', E.AI_SCENARIOS); fill('#sel-policy', E.POLICIES);
  for (const [sel, key] of [['#sel-economy', 'economy'], ['#sel-ai', 'ai'], ['#sel-policy', 'policy']]) {
    $(sel).addEventListener('change', (e) => loadScenario({ ...state, [key]: e.target.value, presetId: null }));
  }
  $('#btn-reset').addEventListener('click', () => loadScenario({ ...state }));
  $('#btn-copy').addEventListener('click', async (e) => {
    const text = JSON.stringify({ economy: state.economy, ai: state.ai, policy: state.policy, overrides: diff(state.preset, state.params) }, null, 2);
    try { await navigator.clipboard.writeText(text); e.target.textContent = 'Copied'; }
    catch { e.target.textContent = 'Copy blocked'; }
    setTimeout(() => { e.target.textContent = 'Copy settings'; }, 1600);
  });

  const host = $('#groups');
  host.innerHTML = GROUPS.map((g) => `
    <details class="group" ${g.open ? 'open' : ''} id="g-${g.id}">
      <summary>${g.title}</summary>
      ${g.note ? `<p class="gnote">${g.note}</p>` : ''}
      <div class="ctrls">${g.items.map(ctrlHtml).join('')}</div>
    </details>`).join('');
  host.addEventListener('input', onCtrl);
  host.addEventListener('change', onCtrl);
}

const ctrlId = (path) => 'c-' + path.replace(/\./g, '-');
function ctrlHtml(c) {
  const id = ctrlId(c.path);
  if (c.kind === 'toggle') return `<label class="toggle" for="${id}"><span>${c.label}</span><input type="checkbox" id="${id}" data-path="${c.path}"></label>`;
  if (c.kind === 'select') return `<div class="ctrl"><label class="ctrl-head" for="${id}"><span>${c.label}</span></label><select id="${id}" data-path="${c.path}">${c.options.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>${c.help ? `<small>${c.help}</small>` : ''}</div>`;
  return `<div class="ctrl"><div class="ctrl-head"><label for="${id}">${c.label}</label><output id="${id}-o" for="${id}"></output></div>
    <input type="range" id="${id}" data-path="${c.path}" min="${c.min}" max="${c.max}" step="${c.step}">${c.help ? `<small>${c.help}</small>` : ''}</div>`;
}
const CTRL_BY_PATH = Object.fromEntries(GROUPS.flatMap((g) => g.items).map((c) => [c.path, c]));

function onCtrl(e) {
  const t = e.target;
  const path = t.dataset?.path;
  if (!path) return;
  const c = CTRL_BY_PATH[path];
  let v = c.kind === 'toggle' ? t.checked : c.kind === 'select' ? t.value : Number(t.value);
  E.setPath(state.params, path, v);
  if (c.kind !== 'toggle' && c.kind !== 'select') showValue(c);
  markPreset();
  scheduleRun();
}

function showValue(c) {
  const out = document.getElementById(ctrlId(c.path) + '-o');
  if (!out) return;
  const v = E.getPath(state.params, c.path);
  out.textContent = c.fmt ? c.fmt(v) : v;
  out.classList.toggle('changed', Math.abs(v - E.getPath(state.preset, c.path)) > 1e-9);
}

function syncControls() {
  for (const c of Object.values(CTRL_BY_PATH)) {
    const inp = document.getElementById(ctrlId(c.path));
    const v = E.getPath(state.params, c.path);
    if (c.kind === 'toggle') inp.checked = !!v;
    else if (c.kind === 'select') inp.value = v;
    else { inp.value = v; showValue(c); }
  }
}

function diff(a, b, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(b)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (k === 'meta' || k === 'baseline') continue;
    if (v && typeof v === 'object' && !Array.isArray(v)) diff(a[k] || {}, v, path, out);
    else if (JSON.stringify(v) !== JSON.stringify(a[k])) out[path] = v;
  }
  return out;
}

function markPreset() {
  const changed = Object.keys(diff(state.preset, state.params)).length > 0;
  document.querySelectorAll('.preset').forEach((b) => b.setAttribute('aria-pressed', String(!changed && b.dataset.id === state.presetId)));
  const desc = [E.ECONOMIES[state.economy].description, E.AI_SCENARIOS[state.ai].description, E.POLICIES[state.policy].description];
  $('#builder-desc').textContent = desc.join(' ') + (changed ? ' (Assumptions edited.)' : '');
}

export function loadScenario({ economy, ai, policy, presetId }) {
  Object.assign(state, { economy, ai, policy, presetId });
  const keepMeta = state.params ? { years: state.params.meta.years, nWorkers: state.params.meta.nWorkers, seed: state.params.meta.seed } : null;
  const p = presetId ? E.presetParams(presetId) : E.buildParams({ economy, ai, policy });
  if (keepMeta) Object.assign(p.meta, keepMeta);
  else p.meta.nWorkers = 1500;
  state.params = p;
  state.preset = E.deepClone(p);
  $('#sel-economy').value = economy; $('#sel-ai').value = ai; $('#sel-policy').value = policy;
  syncControls();
  markPreset();
  scheduleRun(0);
}

// ---------------------------------------------------------------- tabs
const TABS = ['overview', 'compare', 'mc', 'dist', 'how'];
function selectTab(tab) {
  state.tab = tab;
  for (const t of TABS) {
    $(`#t-${t}`).setAttribute('aria-selected', String(t === tab));
    $(`#p-${t}`).hidden = t !== tab;
  }
  try { history.replaceState(null, '', '#' + tab); } catch { /* sandboxed */ }
  renderCurrent();
}

function renderCurrent() {
  if (state.tab === 'overview' && state.scen) renderOverview();
  else if (state.tab === 'dist' && state.scen) renderDist();
  else if (state.tab === 'compare') Views.renderCompare();
  else if (state.tab === 'mc') Views.renderMc();
  else if (state.tab === 'how') Views.renderHow();
}

// ---------------------------------------------------------------- overview
function verdictText(m, b) {
  const g = fmt.pct(m.gdpCagr, 1), up = fmt.pct(m.uPeak), ue = fmt.pct(m.uFinal);
  const heads = {
    collapse: `Demand collapses: unemployment peaks at ${up} in year ${Math.round(m.uPeakYear)}.`,
    deflation: `Prices fall for years while unemployment stays near ${ue}.`,
    stagnation: `Growth stalls at ${g} a year with unemployment at ${ue}.`,
    kshaped: `Output grows ${g} a year, but ${m.laborShareChange < -0.08 ? `labour's share of income falls ${Math.abs(m.laborShareChange * 100).toFixed(0)} points` : `unemployment ends at ${ue}`}.`,
    steady: `A steady transition: ${g} growth with unemployment ending at ${ue}.`,
    boom: `A broad-based boom: ${g} growth a year and median incomes up ${fmt.chg(m.medianIncomeChange)}.`,
  };
  let p = '';
  if (b) {
    const bm = b.summary;
    p = `Without AI, the same economy grows ${fmt.pct(bm.gdpCagr, 1)} a year with unemployment near ${fmt.pct(bm.uFinal)}. `;
  }
  p += `Over ${Math.round(m.years)} years the median household's real income changes ${fmt.chg(m.medianIncomeChange)}`
    + (b ? ` (${fmt.chg(b.summary.medianIncomeChange)} without AI)` : '')
    + `, workers' real consumption ${fmt.chg(m.consWorkersChange)} and capital owners' ${fmt.chg(m.consOwnersChange)}. `;
  if (m.povertyFinal > 0.05) p += `${fmt.pct(m.povertyFinal, 0)} of households end below the poverty line. `;
  if (m.debtGdpFinal > 1.5) p += `Public debt reaches ${fmt.pct(m.debtGdpFinal, 0)} of GDP. `;
  if (m.recessions) p += `${m.recessions} recession${m.recessions > 1 ? 's' : ''} along the way.`;
  return { head: heads[m.outcome], p };
}

function renderOverview() {
  const { scen, base } = state;
  const m = scen.summary, bm = base?.summary;
  const v = verdictText(m, base);
  $('#verdict').innerHTML = `<div class="verdict-head">${pill(m.outcome)}<span class="scen-name">${state.params.meta.name}</span></div>
    <h2>${v.head}</h2><p>${v.p}</p><p class="hint">${E.OUTCOMES[m.outcome].text}</p>`;
  const k = (label, val, bval) => `<div class="kpi"><span class="k">${label}</span><span class="v">${val}</span>${bval ? `<span class="b">no AI: ${bval}</span>` : ''}</div>`;
  $('#kpis').innerHTML = [
    k('GDP growth / yr', fmt.pct(m.gdpCagr, 2), bm && fmt.pct(bm.gdpCagr, 2)),
    k(`Peak unemployment · yr ${Math.round(m.uPeakYear)}`, fmt.pct(m.uPeak), bm && fmt.pct(bm.uPeak)),
    k('Unemployment, final', fmt.pct(m.uFinal), bm && fmt.pct(bm.uFinal)),
    k('Median real income', fmt.chg(m.medianIncomeChange), bm && fmt.chg(bm.medianIncomeChange)),
    k('Labour share of GDP', fmt.pp(m.laborShareChange), bm && fmt.pp(bm.laborShareChange)),
    k('Inequality (Gini)', `${m.giniChange >= 0 ? '+' : '−'}${Math.abs(m.giniChange * 100).toFixed(1)} pts`, bm && `${bm.giniChange >= 0 ? '+' : '−'}${Math.abs(bm.giniChange * 100).toFixed(1)} pts`),
    k('Public debt, final', fmt.pct(m.debtGdpFinal, 0), bm && fmt.pct(bm.debtGdpFinal, 0)),
    k('Poverty rate, final', fmt.pct(m.povertyFinal, 1), bm && fmt.pct(bm.povertyFinal, 1)),
  ].join('');

  const s = scen.series, b = base?.series, x = s.year;
  const host = $('#overview-charts');
  host.innerHTML = '';
  const pair = (key, name) => [
    { name, values: s[key], color: 'var(--s1)' },
    ...(b ? [{ name: 'No AI', values: b[key], color: 'var(--cf)', dash: true, width: 1.5 }] : []),
  ];
  const pctFmt = (v) => fmt.pct(v, Math.abs(v) < 0.1 ? 1 : 0);
  Charts.lineChart(card(host, 'Unemployment rate', 'Share of the labour force without a job'), {
    x, fmt: pctFmt, yMin: 0,
    series: [...pair('u', 'This scenario'), ...(state.params.gov.jobGuarantee ? [{ name: 'In job-guarantee jobs', values: s.jgShare, color: 'var(--s3)', width: 1.5 }] : [])],
  });
  Charts.lineChart(card(host, 'Real GDP', 'Index, year 0 = 100'), { x, fmt: fmt.idx, series: pair('realGdp', 'This scenario') });
  Charts.lineChart(card(host, 'Median household real income', 'Index, year 0 = 100 · includes transfers and capital income'), { x, fmt: fmt.idx, series: pair('medianIncome', 'This scenario') });
  Charts.lineChart(card(host, 'Labour share of GDP', 'Wages as a share of national income'), { x, fmt: pctFmt, series: pair('laborShare', 'This scenario') });
  Charts.lineChart(card(host, 'Who keeps spending?', 'Real consumption per household, index year 0 = 100'), {
    x, fmt: fmt.idx, series: [
      { name: 'Worker households', values: s.consWorkers, color: 'var(--s1)' },
      { name: 'Capital owners', values: s.consOwners, color: 'var(--s2)' },
      ...(b ? [{ name: 'Workers, no AI', values: b.consWorkers, color: 'var(--cf)', dash: true, width: 1.5 }] : []),
    ],
  });
  Charts.lineChart(card(host, 'Inflation and interest rates', 'Year-on-year CPI inflation and the central bank rate'), {
    x, fmt: pctFmt, series: [
      { name: 'Inflation', values: s.inflation, color: 'var(--s1)' },
      { name: 'Policy rate', values: s.policyRate, color: 'var(--s2)' },
      ...(b ? [{ name: 'Inflation, no AI', values: b.inflation, color: 'var(--cf)', dash: true, width: 1.5 }] : []),
    ],
  });
  Charts.lineChart(card(host, 'Public debt', 'Share of annual GDP'), { x, fmt: (v) => fmt.pct(v, 0), series: pair('debtGdp', 'This scenario') });
  Charts.lineChart(card(host, 'How much work AI does', 'Share of tasks performed by AI, by sector'), {
    x, fmt: (v) => fmt.pct(v, 0), yMin: 0,
    series: E.SECTORS.map((sec, i) => ({ name: SECTOR_NAMES[i], values: s[`alpha_${sec}`], color: SERIES_COLORS[i] })),
  });
}

// ---------------------------------------------------------------- distribution
function renderDist() {
  const { scen, base } = state;
  const s = scen.series, b = base?.series, x = s.year;
  const host = $('#dist-charts');
  host.innerHTML = '';
  const snaps = scen.snapshots;
  const pickSnaps = snaps.filter((sn, i) => i === 0 || i === snaps.length - 1 || sn.year % 10 === 0);
  const ramp = ['var(--q1)', 'var(--q2)', 'var(--q3)', 'var(--q4)', 'var(--q5)', 'var(--q6)'];
  const cut = 96;
  Charts.lineChart(card(host, 'Income ladder over time', `Real household income at each percentile, as a multiple of today's median (top ${100 - cut}% omitted for scale)`, true), {
    x: Array.from({ length: cut }, (_, k) => k), xfmt: (v) => `${Math.round(v)}th`, tipTitle: (v) => `Percentile ${v}`,
    fmt: (v) => `${v.toFixed(2)}×`, yMin: 0, height: 240,
    series: pickSnaps.map((sn, i) => ({ name: `Year ${sn.year}`, values: sn.pts.slice(0, cut), color: ramp[Math.round((i / Math.max(1, pickSnaps.length - 1)) * (ramp.length - 1))] })),
  });
  const u = s.u, jg = s.jgShare;
  Charts.stackedArea(card(host, 'Where people work', 'Share of the labour force by sector, job guarantee and unemployment'), {
    x, yMax: 1,
    series: [
      ...E.SECTORS.map((sec, i) => ({ name: SECTOR_NAMES[i], values: s[`emp_${sec}`], color: SERIES_COLORS[i] })),
      ...(state.params.gov.jobGuarantee ? [{ name: 'Job guarantee', values: jg, color: 'var(--s7)' }] : []),
      { name: 'Unemployed', values: u, color: 'var(--cf)' },
    ],
  });
  Charts.lineChart(card(host, 'Relative prices by sector', 'Sector price ÷ consumer price index. Automated sectors get cheaper; in-person services get relatively dearer (Baumol).'), {
    x, fmt: (v) => v.toFixed(2),
    series: E.SECTORS.slice(0, 4).map((sec, i) => ({ name: SECTOR_NAMES[i], values: s[`price_${sec}`], color: SERIES_COLORS[i] })),
  });
  const pair = (key, name) => [{ name, values: s[key], color: 'var(--s1)' }, ...(b ? [{ name: 'No AI', values: b[key], color: 'var(--cf)', dash: true, width: 1.5 }] : [])];
  Charts.lineChart(card(host, 'Where national income goes', 'Shares of GDP'), {
    x, fmt: (v) => fmt.pct(v, 0), yMin: 0,
    series: [
      { name: 'Wages', values: s.laborShare, color: 'var(--s1)' },
      { name: 'Operating surplus', values: s.profitShare, color: 'var(--s2)' },
      { name: 'Paid to foreign AI & owners', values: s.leakage, color: 'var(--s3)' },
      { name: 'AI purchases', values: s.aiSpendShare, color: 'var(--s4)' },
    ],
  });
  Charts.lineChart(card(host, 'Inequality', 'Gini coefficient of household disposable income'), { x, fmt: (v) => v.toFixed(2), series: pair('gini', 'This scenario') });
  Charts.lineChart(card(host, 'Poverty rate', 'Households below half of today\'s median real income'), { x, fmt: (v) => fmt.pct(v, 0), yMin: 0, series: pair('poverty', 'This scenario') });
  Charts.lineChart(card(host, 'Top 10% income share', 'Share of disposable income going to the top decile'), { x, fmt: (v) => fmt.pct(v, 0), series: pair('top10', 'This scenario') });
  Charts.lineChart(card(host, 'Household debt', 'Worker household debt ÷ annual income'), { x, fmt: (v) => fmt.pct(v, 0), series: pair('hhDebt', 'This scenario') });
}

// ---------------------------------------------------------------- boot
function boot() {
  buildRail();
  Views.initViews();
  document.querySelector('.tabs').addEventListener('click', (e) => {
    const t = e.target.closest('.tab');
    if (t) selectTab(t.id.slice(2));
  });
  document.querySelector('.tabs').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = TABS.indexOf(state.tab) + (e.key === 'ArrowRight' ? 1 : -1);
    const t = TABS[(i + TABS.length) % TABS.length];
    selectTab(t); $(`#t-${t}`).focus();
  });
  let rz = null;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(renderCurrent, 150); });
  const hash = (location.hash || '').slice(1);
  loadScenario({ economy: 'advanced', ai: 'rapid', policy: 'none', presetId: 'rapid' });
  selectTab(TABS.includes(hash) ? hash : 'overview');
}

boot();
