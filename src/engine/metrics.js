// Per-quarter indicators, run summaries and outcome classification.

import { NS, SECTORS } from './params.js';

export const SERIES_META = {
  realGdp:       { label: 'Real GDP (index, t0 = 100)', unit: 'index' },
  gdpGrowth:     { label: 'Real GDP growth, y/y', unit: 'pct' },
  u:             { label: 'Unemployment rate', unit: 'pct' },
  uLong:         { label: 'Long-term unemployed (1y+), share of labour force', unit: 'pct' },
  jgShare:       { label: 'Job-guarantee workers, share of labour force', unit: 'pct' },
  laborShare:    { label: 'Labour share of GDP', unit: 'pct' },
  profitShare:   { label: 'Operating surplus share of GDP', unit: 'pct' },
  aiSpendShare:  { label: 'AI spending by firms, % of GDP', unit: 'pct' },
  leakage:       { label: 'Income leaking abroad (foreign AI + foreign dividends), % GDP', unit: 'pct' },
  inflation:     { label: 'CPI inflation, y/y', unit: 'pct' },
  realWage:      { label: 'Real wage index (t0 = 100)', unit: 'index' },
  medianIncome:  { label: 'Median real household income (t0 = 100)', unit: 'index' },
  consWorkers:   { label: 'Real consumption per worker household (t0 = 100)', unit: 'index' },
  consOwners:    { label: 'Real consumption per capital-owner household (t0 = 100)', unit: 'index' },
  realCons:      { label: 'Aggregate real consumption (t0 = 100)', unit: 'index' },
  gini:          { label: 'Gini, disposable income', unit: 'ratio' },
  poverty:       { label: 'Poverty rate (below 50% of initial median, real)', unit: 'pct' },
  top10:         { label: 'Top 10% income share', unit: 'pct' },
  ownerWealthShare: { label: 'Capital owners\' share of household net financial wealth', unit: 'pct' },
  policyRate:    { label: 'Policy interest rate', unit: 'pct' },
  realRate:      { label: 'Real policy rate', unit: 'pct' },
  deficit:       { label: 'Government deficit, % GDP', unit: 'pct' },
  debtGdp:       { label: 'Government debt, % annual GDP', unit: 'pct' },
  transfers:     { label: 'Transfers (UI, welfare, UBI, dividends), % GDP', unit: 'pct' },
  hhDebt:        { label: 'Worker household debt / annual income', unit: 'pct' },
  defaultRate:   { label: 'Household default rate (annualised)', unit: 'pct' },
  invGdp:        { label: 'Investment incl. AI capex, % GDP', unit: 'pct' },
  aiCapexGdp:    { label: 'AI data-centre capex, % GDP', unit: 'pct' },
  confidence:    { label: 'Consumer confidence (1 = normal)', unit: 'ratio' },
  tradeBalance:  { label: 'Trade balance, % GDP', unit: 'pct' },
  equityIndex:   { label: 'Equity valuation index (t0 = 100)', unit: 'index' },
  capCog:        { label: 'Cognitive AI capability', unit: 'ratio' },
  capPhys:       { label: 'Physical AI / robotics capability', unit: 'ratio' },
  hours:         { label: 'Average hours per worker (1 = today)', unit: 'ratio' },
  sfcError:      { label: 'Balance-sheet identity error, % GDP', unit: 'pct' },
};
for (let s = 0; s < NS; s++) {
  SERIES_META[`emp_${SECTORS[s]}`] = { label: `Employment share: ${SECTORS[s]}`, unit: 'pct' };
  SERIES_META[`alpha_${SECTORS[s]}`] = { label: `AI task share: ${SECTORS[s]}`, unit: 'pct' };
  SERIES_META[`price_${SECTORS[s]}`] = { label: `Relative price: ${SECTORS[s]}`, unit: 'ratio' };
}

function distribution(S) {
  const n = S.NW + S.NK;
  const inc = new Float64Array(n);
  inc.set(S.hInc, 0);
  inc.set(S.kInc, S.NW);
  inc.sort();
  const median = n % 2 ? inc[(n - 1) / 2] : 0.5 * (inc[n / 2 - 1] + inc[n / 2]);
  let total = 0, weighted = 0;
  for (let k = 0; k < n; k++) { const x = Math.max(0, inc[k]); total += x; weighted += (k + 1) * x; }
  const gini = total > 0 ? (2 * weighted) / (n * total) - (n + 1) / n : 0;
  let top = 0;
  const cut = Math.floor(0.9 * n);
  for (let k = cut; k < n; k++) top += Math.max(0, inc[k]);
  return { median, gini, top10: total > 0 ? top / total : 0, sorted: inc };
}

export function createRecorder(S) {
  const series = { year: [] };
  for (const k of Object.keys(SERIES_META)) series[k] = [];
  const snapshots = [];
  const d0 = distribution(S);
  const base = {
    cpi: S.cpi, median: d0.median, realWage: avgWageIdx(S) / S.cpi,
    equity: S.equityValue || 1,
    consW: meanOf(S.hCons, S.NW), consK: meanOf(S.kCons, S.NK), cons: null,
    povertyLine: 0.5 * d0.median / S.cpi,
  };

  function record(S) {
    const L = S.last, lm = L.lm, gdp = L.gdpNom;
    const d = distribution(S);
    let below = 0;
    const line = base.povertyLine * S.cpi;
    for (let k = 0; k < d.sorted.length; k++) if (d.sorted[k] < line) below++; else break;
    let hDebt = 0, hInc = 0, hNet = 0, kNet = 0;
    for (let k = 0; k < S.NW; k++) { hDebt += S.hDebt[k]; hInc += S.hInc[k]; hNet += S.hDep[k] - S.hDebt[k]; }
    for (let j = 0; j < S.NK; j++) kNet += S.kDep[j] - S.kDebt[j];
    let loans = S.fLoans, deps = S.fDep + S.rowDep;
    for (let k = 0; k < S.NW; k++) { loans += S.hDebt[k]; deps += S.hDep[k]; }
    for (let j = 0; j < S.NK; j++) { loans += S.kDebt[j]; deps += S.kDep[j]; }
    const sfc = (loans + S.bonds - deps - S.bankEq) / gdp;
    const consReal = L.Cpaid / S.cpi;
    if (base.cons === null) base.cons = consReal;
    const rg = S.realGdpHist;
    const push = (k, v) => series[k].push(v);
    push('year', S.t / 4);
    push('realGdp', S.realGdp);
    push('gdpGrowth', rg.length >= 5 ? rg[rg.length - 1] / rg[0] - 1 : 0);
    push('u', lm.unemployed / S.NW);
    push('uLong', lm.longTerm / S.NW);
    push('jgShare', lm.jg / S.NW);
    push('laborShare', (L.wageBill + L.jgBill) / gdp);
    push('profitShare', L.OS / gdp);
    push('aiSpendShare', L.aiPurch / gdp);
    push('leakage', (L.aiForeign + L.divRow + L.fShare * L.bAI * (L.Cpaid / (1 + S.p.gov.vat))) / gdp);
    push('inflation', S.piYoY);
    push('realWage', 100 * (avgWageIdx(S) / S.cpi) / base.realWage);
    push('medianIncome', 100 * (d.median / S.cpi) / (base.median / base.cpi));
    push('consWorkers', 100 * (meanOf(S.hCons, S.NW) / S.cpi) / (base.consW / base.cpi));
    push('consOwners', 100 * (meanOf(S.kCons, S.NK) / S.cpi) / (base.consK / base.cpi));
    push('realCons', 100 * consReal / base.cons);
    push('gini', d.gini);
    push('poverty', below / d.sorted.length);
    push('top10', d.top10);
    push('ownerWealthShare', kNet / Math.max(1e-9, kNet + Math.max(0, hNet)));
    push('policyRate', S.policyRate);
    push('realRate', L.rReal);
    push('deficit', -L.govBalance / gdp);
    push('debtGdp', S.bonds / (4 * gdp));
    push('transfers', (L.F.ui + L.F.welfare + L.F.ubi + L.F.socDiv) / gdp);
    push('hhDebt', hDebt / Math.max(1e-9, 4 * hInc));
    push('defaultRate', S.defaultRateQ * 4);
    push('invGdp', (L.InvNom + L.aiCapex) / gdp);
    push('aiCapexGdp', L.aiCapex / gdp);
    push('confidence', S.conf);
    push('tradeBalance', (L.Xreceived - L.cImports - L.invImports - L.aiForeign) / gdp);
    push('equityIndex', 100 * S.equityValue / base.equity);
    push('capCog', S.cap.cog);
    push('capPhys', S.cap.phys);
    let hrs = 0; for (let s = 0; s < NS; s++) hrs += S.p.sectors.empShare[s] * S.hours[s];
    push('hours', hrs);
    push('sfcError', sfc);
    const pbar = S.cpi;
    for (let s = 0; s < NS; s++) {
      push(`emp_${SECTORS[s]}`, lm.emp[s] / S.NW);
      push(`alpha_${SECTORS[s]}`, S.alpha[s]);
      push(`price_${SECTORS[s]}`, S.price[s] / pbar);
    }
    // income distribution snapshot every 5 years (real, relative to initial median)
    if (S.t % 20 === 0) {
      const rel = Array.from(d.sorted, (x) => (x / S.cpi) / (base.median / base.cpi));
      snapshots.push({ year: S.t / 4, incomes: rel });
    }
  }
  return { series, snapshots, record, base };
}

function meanOf(arr, n) { let s = 0; for (let k = 0; k < n; k++) s += arr[k]; return s / n; }
function avgWageIdx(S) {
  let w = 0; const e = S.p.sectors.empShare;
  for (let s = 0; s < NS; s++) w += e[s] * S.wage[s];
  return w;
}

const avg = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const tail = (a, n) => a.slice(Math.max(0, a.length - n));

export function summarise(series, p) {
  const T = series.year.length - 1;
  const years = series.year[T] || 1;
  const g = series.realGdp;
  // Recession: at least two consecutive quarterly declines adding up to 1% or more.
  let recessions = 0, recessionQuarters = 0, peak = g[0], maxDrawdown = 0;
  let k = 1;
  while (k <= T) {
    if (g[k] < g[k - 1]) {
      let j = k;
      while (j + 1 <= T && g[j + 1] < g[j]) j++;
      const len = j - k + 1, drop = 1 - g[j] / g[k - 1];
      if (len >= 2 && drop >= 0.01) { recessions++; recessionQuarters += len; }
      k = j + 1;
    } else k++;
  }
  for (let q = 1; q <= T; q++) { peak = Math.max(peak, g[q]); maxDrawdown = Math.max(maxDrawdown, 1 - g[q] / peak); }
  const half = Math.floor(T / 2);
  const infl2 = series.inflation.slice(half);
  const out = {
    years,
    gdpCagr: Math.pow(g[T] / g[0], 1 / years) - 1,
    gdpFinal: g[T],
    uStart: series.u[0],
    uFinal: avg(tail(series.u, 8)),
    uPeak: Math.max(...series.u),
    uPeakYear: series.year[series.u.indexOf(Math.max(...series.u))],
    medianIncomeChange: avg(tail(series.medianIncome, 8)) / 100 - 1,
    realWageChange: avg(tail(series.realWage, 8)) / 100 - 1,
    laborShareChange: avg(tail(series.laborShare, 8)) - series.laborShare[0],
    giniChange: avg(tail(series.gini, 8)) - series.gini[0],
    povertyFinal: avg(tail(series.poverty, 8)),
    top10Final: avg(tail(series.top10, 8)),
    avgInflation: avg(series.inflation.slice(1)),
    inflationLateAvg: avg(infl2),
    deflationQuarters: series.inflation.filter((x) => x < 0).length,
    debtGdpFinal: series.debtGdp[T],
    debtGdpChange: series.debtGdp[T] - series.debtGdp[0],
    hhDebtPeak: Math.max(...series.hhDebt),
    recessions, recessionQuarters, maxDrawdown,
    consWorkersChange: avg(tail(series.consWorkers, 8)) / 100 - 1,
    consOwnersChange: avg(tail(series.consOwners, 8)) / 100 - 1,
    aiShareFinal: avg(tail(series.alpha_COG, 4)),
    maxSfcError: Math.max(...series.sfcError.map(Math.abs)),
  };
  out.outcome = classify(out, p);
  return out;
}

export const OUTCOMES = {
  collapse:   { label: 'Demand collapse', color: 'c-red', text: 'Unemployment spikes past 18% or output falls 10%+ from its peak.' },
  deflation:  { label: 'Deflationary slump', color: 'c-violet', text: 'Falling prices with persistently high unemployment; debt burdens rise in real terms.' },
  stagnation: { label: 'Stagnation', color: 'c-orange', text: 'Growth under 1%/yr with unemployment well above normal.' },
  kshaped:    { label: 'Jobless / K-shaped growth', color: 'c-amber', text: 'Output grows but jobs or median incomes fail to keep up; gains go to capital.' },
  steady:     { label: 'Steady transition', color: 'c-blue', text: 'Employment near normal; incomes grow broadly in line with output.' },
  boom:       { label: 'Broad-based boom', color: 'c-green', text: 'Faster growth, near-normal unemployment and median incomes rising with output.' },
};

export function classify(m, p) {
  const uS = p.macro.uStar;
  const gdpCum = Math.pow(1 + m.gdpCagr, m.years) - 1;
  if (m.uPeak > 0.18 || m.maxDrawdown > 0.10) return 'collapse';
  if (m.inflationLateAvg < -0.005 && m.uFinal > uS + 0.03) return 'deflation';
  if (m.gdpCagr < 0.01 && m.uFinal > uS + 0.025) return 'stagnation';
  if (m.uFinal > uS + 0.025 || m.laborShareChange < -0.08 || m.medianIncomeChange < 0.5 * gdpCum) return 'kshaped';
  if (m.gdpCagr > p.macro.prodGrowth + 0.008 && m.medianIncomeChange > 0.7 * gdpCum) return 'boom';
  return 'steady';
}
