// Builds a calibrated, balance-sheet-consistent initial state from parameters.
// Money is normalised so the average worker earns 1.0 per quarter at t = 0.

import { NS, AI_IDX } from './params.js';
import { makeRng } from './rng.js';

const JG = NS; // employment code for job-guarantee jobs; -1 means unemployed

export function logistic(max, mid, speed, years) {
  return max / (1 + Math.exp(-speed * (years - mid)));
}

export function capabilityAt(p, years) {
  const a = p.ai;
  return {
    cog: logistic(a.cogMax, a.cogMid, a.cogSpeed, years),
    phys: logistic(a.physMax, a.physMid, a.physSpeed, years),
  };
}

export function createState(p) {
  const rng = makeRng(p.meta.seed);
  const sec = p.sectors, mac = p.macro, hh = p.households;
  const NW = Math.max(200, Math.round(p.meta.nWorkers));
  const NK = Math.max(10, Math.round((NW * hh.capitalistShare) / (1 - hh.capitalistShare)));

  // --- sector wages and employment -------------------------------------------
  const empShare = normalise(sec.empShare);
  const avgRel = empShare.reduce((s, e, i) => s + e * sec.relWage[i], 0);
  const wage = sec.relWage.map((w) => w / avgRel);
  const emp0 = empShare.map((e) => e * NW * (1 - mac.uStar));
  const r0 = p.ai.costRatio0;
  const phi = p.market.passThrough;

  // Revenue (= real output at p = 1) consistent with the pricing rule at t = 0.
  const Y = new Float64Array(NS), h0 = new Float64Array(NS), aiCost = new Float64Array(NS);
  for (let s = 0; s < NS; s++) {
    const a0 = sec.alpha0[s];
    const W = wage[s] * emp0[s];
    if (s === AI_IDX) {
      Y[s] = (1 + sec.markup[s]) * W;
    } else {
      const H = (a0 / (1 - a0)) * W;       // human cost of the tasks AI already does
      const A = H * r0;                    // what AI charges for them
      Y[s] = (1 + sec.markup[s]) * (W + phi * A + (1 - phi) * H);
      aiCost[s] = A;
    }
    h0[s] = emp0[s] / ((1 - a0) * Y[s]);  // task-labour per unit of output
  }
  const aiInter = aiCost.reduce((a, b) => a + b, 0);
  const gdp0 = Y.reduce((a, b) => a + b, 0) - aiInter;

  // --- final demand calibration ------------------------------------------------
  const G0 = mac.gShare * gdp0;
  const Itot0 = mac.iShare * gdp0;
  const X0 = mac.xShare * gdp0;
  const expBasket = normalise(sec.expBasket), invBasket = normalise(sec.invBasket), govBasket = normalise(sec.govBasket);
  const f = p.ai.foreignShare;
  const Idom0 = (1 - mac.importI) * Itot0;
  const Cdom = new Float64Array(NS);
  for (let s = 0; s < NS; s++) {
    const other = govBasket[s] * G0 + invBasket[s] * Idom0 + expBasket[s] * X0;
    Cdom[s] = s === AI_IDX ? Y[s] - other - (1 - f) * aiInter : Y[s] - other;
  }
  const warnings = [];
  for (let s = 0; s < NS; s++) {
    if (Cdom[s] < 0.02 * Y[s]) {
      warnings.push(`Sector ${s}: implied household demand ${Cdom[s].toFixed(3)} too small; clamped. Adjust baskets or shares.`);
      Cdom[s] = 0.02 * Y[s];
    }
  }
  const cAIgross = Cdom[AI_IDX] / (1 - f);
  let cNonAI = 0;
  for (let s = 0; s < NS; s++) if (s !== AI_IDX) cNonAI += Cdom[s];
  const Cnet0 = (cNonAI + cAIgross) / (1 - mac.importC);
  const b0 = new Float64Array(NS);
  for (let s = 0; s < NS; s++) if (s !== AI_IDX) b0[s] = Cdom[s] / cNonAI;
  const bAI0 = cAIgross / Cnet0;

  // Investment: AI capex first, the rest spread over sectors in proportion to capital needs.
  const gq = mac.prodGrowth / 4, dq = mac.depreciation / 4, daiq = p.ai.aiDepreciation / 4;
  const KAI = p.ai.capitalIntensity * Y[AI_IDX];
  const aiCapex0 = Math.min(0.5 * Itot0, (daiq + gq) * KAI);
  const Inon = Itot0 - aiCapex0;
  const kWeight = sec.capOutput.map((v, s) => (s === AI_IDX ? 0 : v * Y[s]));
  const kwSum = kWeight.reduce((a, b) => a + b, 0);
  const K = new Float64Array(NS), capOut = new Float64Array(NS), invReal = new Float64Array(NS);
  for (let s = 0; s < NS; s++) {
    if (s === AI_IDX) continue;
    invReal[s] = Inon * kWeight[s] / kwSum;
    K[s] = invReal[s] / (dq + gq);
    capOut[s] = K[s] * p.firms.utilNormal / Y[s]; // capital per unit output at normal utilisation
  }
  const Xreal0 = expBasket.map((b) => b * X0);

  // --- agents -------------------------------------------------------------------
  const hSector = new Int8Array(NW), hEmp = new Int8Array(NW), hSkill = new Float64Array(NW);
  const hDep = new Float64Array(NW), hDebt = new Float64Array(NW), hEq = new Float64Array(NW);
  const hYp = new Float64Array(NW), hUdur = new Int16Array(NW), hInc = new Float64Array(NW);
  const hLastWage = new Float64Array(NW), hCons = new Float64Array(NW);
  let idx = 0;
  const counts = largestRemainder(empShare, NW);
  for (let s = 0; s < NS; s++) for (let k = 0; k < counts[s]; k++) hSector[idx++] = s;
  // Skill: log-normal, normalised to mean 1 within each sector.
  const sums = new Float64Array(NS), ns = new Float64Array(NS);
  for (let i = 0; i < NW; i++) { hSkill[i] = rng.lognormal(p.labor.skillSigma); sums[hSector[i]] += hSkill[i]; ns[hSector[i]]++; }
  for (let i = 0; i < NW; i++) hSkill[i] /= sums[hSector[i]] / ns[hSector[i]];
  // Unemployment at u*, spread evenly across sectors.
  const order = rng.shuffle(Array.from({ length: NW }, (_, i) => i));
  const unemp = Math.round(NW * mac.uStar);
  for (let k = 0; k < NW; k++) {
    const i = order[k];
    hEmp[i] = k < unemp ? -1 : hSector[i];
    hUdur[i] = k < unemp ? 1 : 0;
  }
  const netW = 1 - p.gov.laborTax;
  let eqSum = 0, incSum = 0;
  for (let i = 0; i < NW; i++) {
    const w = wage[hSector[i]] * hSkill[i];
    hLastWage[i] = w;
    const inc = hEmp[i] >= 0 ? w * netW : p.gov.uiReplacement * w * netW + 0.05;
    hInc[i] = inc; hYp[i] = inc; incSum += inc;
    hDep[i] = 1.5 * w * rng.lognormal(0.9);
    hEq[i] = hSkill[i] * hSkill[i] * rng.lognormal(0.8);
    eqSum += hEq[i];
    hCons[i] = inc;
  }
  for (let i = 0; i < NW; i++) hEq[i] /= eqSum;
  // Household debt: ~60% of households carry debt, total = hhDebt0 x annual net income.
  const debtTarget = mac.hhDebt0 * 4 * incSum;
  let debtRaw = 0;
  for (let i = 0; i < NW; i++) {
    if (rng.next() < 0.6) { hDebt[i] = hYp[i] * rng.uniform(0.3, 1.7); debtRaw += hDebt[i]; }
  }
  for (let i = 0; i < NW; i++) hDebt[i] *= debtTarget / (debtRaw || 1);

  // Capital owners: Pareto-distributed ownership weights.
  const kW = new Float64Array(NK), kDep = new Float64Array(NK), kYp = new Float64Array(NK), kInc = new Float64Array(NK);
  let kwS = 0;
  for (let j = 0; j < NK; j++) { kW[j] = rng.pareto(hh.paretoAlpha); kwS += kW[j]; }
  for (let j = 0; j < NK; j++) kW[j] /= kwS;

  // --- balance sheets -----------------------------------------------------------
  const wageBill0 = emp0.reduce((a, e, s) => a + e * wage[s], 0);
  const B = mac.govDebt0 * 4 * gdp0;
  const Lf = mac.firmDebt0 * 4 * gdp0;
  const Df = p.firms.depositBuffer * wageBill0;
  const Lh = hDebt.reduce((a, b) => a + b, 0);
  const Dw = hDep.reduce((a, b) => a + b, 0);
  const Eb = 0.1 * (Lh + Lf);
  const Dk = Lh + Lf + B - Dw - Df - Eb; // capital owners hold the remaining deposits
  if (Dk <= 0) warnings.push('Capital-owner deposits non-positive at t=0; check debt ratios.');
  for (let j = 0; j < NK; j++) kDep[j] = Math.max(0, Dk) * kW[j];

  const i0 = mac.rNeutral + mac.piTarget;
  const profit0 = gdp0 - wageBill0 - dq * K.reduce((a, b) => a + b, 0) - daiq * KAI - (i0 + p.banks.firmSpread) / 4 * Lf;
  const div0 = p.firms.payout * profit0 * (1 - p.gov.corpTax);
  for (let j = 0; j < NK; j++) { kYp[j] = kW[j] * (div0 * 0.6 + i0 / 4 * Dk); kInc[j] = kYp[j]; }

  return {
    p, rng, NW, NK, t: -p.meta.burnInQuarters, burnIn: true, warnings,
    // sectors
    wage: Float64Array.from(wage), wage0: Float64Array.from(wage),
    price: new Float64Array(NS).fill(1), pricePrev: new Float64Array(NS).fill(1),
    alpha: Float64Array.from(sec.alpha0), nu: new Float64Array(NS), lamBase: 1, lam: new Float64Array(NS).fill(1),
    h0, Y: Float64Array.from(Y), Yprev: Float64Array.from(Y), D: Float64Array.from(Y), Dema: Float64Array.from(Y),
    K, capOut, invReal, gExp: new Float64Array(NS).fill(gq), util: new Float64Array(NS).fill(p.firms.utilNormal),
    hours: new Float64Array(NS).fill(1), ell: new Float64Array(NS), ellCore: new Float64Array(NS), aiUnit: new Float64Array(NS),
    b0, bAI0, Xreal0, G0real: G0, austerityMult: 1, calib: { wealthK: 1, gScale: 1 },
    expBasket, invBasket, govBasket,
    KAI, aiRevEMA: Y[AI_IDX], aiRevGrowth: gq + mac.piTarget / 4,
    // aggregates and prices
    Pf: 1, cpi: 1, cpiHist: [1, 1, 1, 1], pAI: 1, PG: 1, PI: 1,
    world: 1, cap: capabilityAt(p, 0), cap0: capabilityAt(p, 0), costRatio: r0,
    policyRate: i0, piYoY: mac.piTarget, piExp: mac.piTarget,
    u: mac.uStar, uEMA: mac.uStar, uHist: [mac.uStar, mac.uStar, mac.uStar, mac.uStar],
    conf: 1, shock: 0, defaultRateQ: 0.002, profitEMA: profit0, divEMA: div0,
    equityValue0: 0, equityValue: 0,
    // balance sheets
    hSector, hEmp, hSkill, hDep, hDebt, hEq, hYp, hUdur, hInc, hLastWage, hCons,
    kW, kDep, kYp, kInc, kCons: new Float64Array(NK), kDebt: new Float64Array(NK),
    baseBorrow: mac.hhDebt0 * 4 * (hh.repayRate + (mac.prodGrowth + mac.piTarget) / 4) / Math.max(0.2, hh.loanSize) / (1 - mac.uStar),
    fDep: Df, fLoans: Lf, bonds: B, bankEq: Eb, rowDep: 0,
    levTarget: Lf / (K.reduce((a, b) => a + b, 0) + KAI),
    // bookkeeping
    base: { gdp0, wageBill0, avgWage0: 1, Cnet0, aiInter0: aiInter, NW, NK },
    lastRetrainees: 0, gdpNomPrev: gdp0, realGdp: 100, realGdpHist: [100, 100, 100, 100],
    medianIncome0: null, povertyLine: null,
    hist: null,
  };
}

export { JG };

function normalise(arr) {
  const s = arr.reduce((a, b) => a + b, 0) || 1;
  return arr.map((x) => x / s);
}

function largestRemainder(shares, n) {
  const raw = shares.map((x) => x * n);
  const out = raw.map(Math.floor);
  let rem = n - out.reduce((a, b) => a + b, 0);
  const order = raw.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; rem > 0; k++, rem--) out[order[k % order.length][1]]++;
  return out;
}
