// One quarter of the economy. Every monetary flow debits one balance and credits another,
// so the stock identity (loans + bonds = deposits + bank equity) holds exactly each quarter.

import { NS, AI_IDX } from './params.js';
import { capabilityAt, JG } from './init.js';
import { clearLabourMarket } from './labor.js';

const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

export function step(S) {
  const p = S.p, mac = p.macro, ai = p.ai, sec = p.sectors, mk = p.market, hh = p.households;
  const fm = p.firms, bk = p.banks, gov = p.gov, cb = p.cb, lab = p.labor;
  const { NW, NK, rng } = S;
  S.t += 1;
  const years = S.burnIn ? 0 : S.t / 4;
  const dq = mac.depreciation / 4, daiq = ai.aiDepreciation / 4;

  // ---- 1. Exogenous drivers ---------------------------------------------------
  S.Pf *= (1 + mac.foreignInflation) ** 0.25;
  S.lamBase *= (1 + mac.prodGrowth) ** 0.25;
  S.world *= (1 + mac.worldGrowth) ** 0.25;
  S.cap = capabilityAt(p, years);
  S.costRatio = Math.max(ai.costFloor, ai.costRatio0 * Math.exp(-ai.costDecline * years));
  S.pAI = (S.costRatio / ai.costRatio0) * S.Pf;
  const dCog = Math.max(0, S.cap.cog - S.cap0.cog);
  // Market structure of AI (who supplies it, who owns the firms) phases in with diffusion.
  const bl = p.baseline || {};
  const ramp = S.burnIn ? 0 : clamp(dCog / Math.max(0.05, ai.cogMax - S.cap0.cog), 0, 1);
  const lerp = (a, b) => (a === undefined ? b : a + (b - a) * ramp);
  const fShare = lerp(bl.foreignShare, ai.foreignShare);
  const capexImp = lerp(bl.capexImport, ai.capexImport);
  const fEquity = lerp(bl.foreignEquityShare, fm.foreignEquityShare);
  // Consumer-facing AI price: only part of the quality-adjusted cost collapse shows up in the CPI/GDP.
  const pAIcPrev = S.pAIc || 1;
  S.pAIc = S.Pf * Math.pow(S.pAI / S.Pf, mk.aiHedonic);

  // ---- 2. Technology: AI adoption, new tasks, productivity, hours ------------------
  const humanAuto = new Float64Array(NS);
  const displaced = new Float64Array(NS);
  for (let s = 0; s < NS; s++) {
    const capS = sec.cogWeight[s] * S.cap.cog + (1 - sec.cogWeight[s]) * S.cap.phys;
    const taskCostAI = S.wage0[s] * S.costRatio * S.Pf;         // AI cost of one worker-quarter of tasks
    const rEff = (taskCostAI * (1 + gov.aiTax)) / S.wage[s];
    const profitable = clamp((1 - rEff) / (1 - ai.fullAdoptRatio), 0, 1);
    const target = Math.max(sec.alpha0[s], sec.alphaMax[s] * capS * profitable);
    const gap = target - S.alpha[s];
    const da = gap > 0 ? ai.adoptSpeed * gap : ai.deAdoptSpeed * gap;
    S.alpha[s] += da;
    if (da > 0) S.nu[s] = Math.min(S.nu[s] + ai.reinstatement * da, 0.9 * S.alpha[s]);
    S.lam[s] = S.lamBase * (1 + ai.augmentation * (S.alpha[s] - sec.alpha0[s]));
    const hS = S.h0[s] / S.lam[s];
    const humanShare = 1 - S.alpha[s] + S.nu[s];
    displaced[s] = Math.max(0, 1 - humanShare / (1 - sec.alpha0[s]));
    S.hours[s] = Math.max(0.6, 1 - gov.hoursReduction * displaced[s]);
    if (s === AI_IDX) {
      // AI sector output is measured in AI units whose price falls; labour per unit falls with it.
      S.ell[s] = S.h0[s] * humanShare * S.pAI * (S.wage0[s] / S.wage[s]);
      S.aiUnit[s] = 0;
    } else {
      S.ell[s] = hS * humanShare;
      S.ellCore[s] = hS * (1 - S.alpha[s]); // excludes new tasks: used for potential output
      S.aiUnit[s] = S.alpha[s] * hS * taskCostAI;
      humanAuto[s] = S.alpha[s] * hS * S.wage[s];
    }
  }

  // ---- 3. Prices: markup over unit cost, with partial pass-through of AI savings -------
  for (let s = 0; s < NS; s++) S.pricePrev[s] = S.price[s];
  const phi = mk.passThrough;
  for (let s = 0; s < NS; s++) {
    if (s === AI_IDX) { S.price[s] = S.pAI; continue; }
    const ulc = S.wage[s] * S.ell[s];
    const aic = S.aiUnit[s] * (1 + gov.aiTax);
    const mu = sec.markup[s] * (1 + mk.markupCyc * (S.util[s] - fm.utilNormal));
    const target = (1 + mu) * (ulc + aic + (1 - phi) * Math.max(0, humanAuto[s] - aic));
    S.price[s] *= Math.pow(target / S.price[s], mk.priceStickiness);
  }

  // ---- 4. Monetary policy and interest rates ------------------------------------
  S.piExp = lab.expAnchor * mac.piTarget + (1 - lab.expAnchor) * S.piYoY;
  if (cb.taylor) {
    const iStar = mac.rNeutral + S.piYoY + cb.phiPi * (S.piYoY - mac.piTarget) + cb.phiU * (mac.uStar - S.u);
    S.policyRate = Math.max(cb.elb, cb.smoothing * S.policyRate + (1 - cb.smoothing) * iStar);
  }
  const i = S.policyRate;
  const laborTax = gov.laborTax;
  const defaultAnn = S.defaultRateQ * 4;
  const rd = Math.max(0, i - bk.depositSpread) / 4;
  const rb = Math.max(0, i + bk.bondPremium) / 4;
  const rf = (i + bk.firmSpread) / 4;
  const rh = (i + bk.hhSpread + bk.defaultSpreadSens * Math.max(0, defaultAnn - 0.01)) / 4;
  const rReal = i - S.piExp;
  const tight = clamp(1 - bk.creditTightening * Math.max(0, defaultAnn - 0.01), 0.2, 1);

  // ---- 5. Planned demand ---------------------------------------------------------
  // 5a. household budget shares respond to relative prices (sigmaC < 1: Baumol reallocation)
  let pbar = 0;
  for (let s = 0; s < NS; s++) if (s !== AI_IDX) pbar += S.b0[s] * S.price[s];
  const bs = new Float64Array(NS);
  let bsum = 0;
  for (let s = 0; s < NS; s++) {
    if (s === AI_IDX) continue;
    bs[s] = S.b0[s] * Math.pow(S.price[s] / pbar, 1 - mk.sigmaC);
    bsum += bs[s];
  }
  for (let s = 0; s < NS; s++) bs[s] /= bsum;
  const bAI = Math.min(0.3, S.bAI0 * (1 + ai.consumerBoost * dCog));
  const domShare = 1 - mac.importC - bAI;

  // 5b. confidence and interest-rate effects on spending
  S.shock = p.shocks.demandRho * S.shock + p.shocks.demandSigma * rng.normal();
  const du = S.u - S.uHist[0];
  S.conf = clamp(1 - hh.confLevel * Math.max(0, S.uEMA - mac.uStar) - hh.confChange * Math.max(0, du) + S.shock, 0.85, 1.05);
  const rateF = clamp(1 - hh.rateSensitivity * (rReal - mac.rNeutral), 0.85, 1.15);
  const subsist = hh.subsistence * S.base.avgWage0 * S.cpi;
  const borrowProb = S.baseBorrow * S.conf * rateF * rateF * tight;

  let Cg = 0, newLoans = 0;
  for (let k = 0; k < NW; k++) {
    const yp = S.hYp[k];
    let desired = S.conf * rateF * (hh.mpcW * yp + hh.mpcWealthW * S.hDep[k]);
    if (desired < subsist) desired = subsist;
    const emp = S.hEmp[k];
    if (emp >= 0 && emp < NS && rng.next() < borrowProb && S.hDebt[k] + hh.loanSize * yp <= hh.creditMult * yp * tight) {
      const loan = hh.loanSize * yp;
      S.hDebt[k] += loan; S.hDep[k] += loan; desired += loan; newLoans += loan;
    }
    const cash = S.hDep[k] + Math.max(0, S.hInc[k]);
    const c = desired < cash ? desired : Math.max(0, cash);
    S.hCons[k] = c; Cg += c;
  }
  const equityForK = Math.max(0, 1 - hh.workerEquityShare - fEquity - publicShare(S));
  const confK = Math.sqrt(S.conf);
  for (let j = 0; j < NK; j++) {
    const eqW = S.equityValue * equityForK * S.kW[j];
    const desired = confK * rateF * (hh.mpcK * S.kYp[j] + S.calib.wealthK * hh.mpcWealthK * S.kDep[j] + hh.equityWealthEffect * eqW);
    const cash = S.kDep[j] + Math.max(0, S.kInc[j]);
    const c = Math.max(0, Math.min(desired, cash));
    S.kCons[j] = c; Cg += c;
  }
  const Cnet = Cg / (1 + gov.vat);

  // 5c. government purchases (+ retraining services bought from education providers)
  S.PG = 0; for (let s = 0; s < NS; s++) S.PG += S.govBasket[s] * S.price[s];
  const debtRatio = S.bonds / Math.max(1e-9, 4 * S.gdpNomPrev);
  if (gov.austerity && !S.burnIn) {
    if (debtRatio > gov.debtCeiling) S.austerityMult *= 1 - gov.austerityRate;
    else if (debtRatio < gov.debtCeiling - 0.1) S.austerityMult = Math.min(1, S.austerityMult * 1.0025);
  }
  const gCyc = S.burnIn ? 1 : clamp(1 + gov.countercyclical * (S.uEMA - mac.uStar), 0.9, 1.5);
  // Neutral fiscal stance: real purchases grow with potential output ('potential', incl. AI gains)
  // or with the pre-AI productivity trend only ('trend', an implicit tightening as AI arrives).
  if (S.burnIn || gov.gRule !== 'potential') S.Gtrend = (S.Gtrend || S.G0real) * (1 + mac.prodGrowth) ** 0.25;
  else S.Gtrend = S.Gref * potentialIndex(S);
  const Greal = S.Gtrend * S.calib.gScale * S.austerityMult * gCyc;
  const avgWageNow = avgWage(S);
  const retrainSpend = S.burnIn ? 0 : gov.retraining * S.lastRetrainees * gov.retrainCost * avgWageNow;
  const Gnom = Greal * S.PG;

  // 5d. business investment (accelerator + utilisation + real rate) and AI data-centre capex
  S.PIprev = S.PI;
  S.PI = mac.importI * S.Pf;
  for (let s = 0; s < NS; s++) S.PI += (1 - mac.importI) * S.invBasket[s] * S.price[s];
  const Iplan = new Float64Array(NS);
  let IrealTot = 0;
  for (let s = 0; s < NS; s++) {
    if (s === AI_IDX) continue;
    // Desired capital: expected sales (in capital-goods prices) x capital-output ratio, lower when
    // real rates are high. Growth expectations are half anchored to trend, half extrapolated.
    const gUse = 0.5 * (mac.prodGrowth / 4) + 0.5 * S.gExp[s];
    const Kstar = S.capOut[s] * (S.Dema[s] / S.PI) * (1 + 2 * gUse) / fm.utilNormal
      * clamp(1 - fm.invRate * (rReal - mac.rNeutral), 0.7, 1.3);
    const rate = dq + gUse + fm.invUtil * clamp(Kstar / S.K[s] - 1, -0.3, 0.3);
    Iplan[s] = S.K[s] * clamp(rate, 0.4 * dq, dq + 0.012); // some replacement investment continues
    IrealTot += Iplan[s];
  }
  const InvNom = IrealTot * S.PI;
  const Kreq = ai.capitalIntensity * S.aiRevEMA * (1 + S.aiRevGrowth);
  const aiCapex = daiq * S.KAI + 0.25 * Math.max(0, Kreq - S.KAI);

  // 5e. exports: world demand x price competitiveness x substitution by foreign AI.
  // Foreign rivals get the same technology: with worldSync = 1 their prices move exactly like ours,
  // so only the non-synchronised part of our price change affects competitiveness.
  const Xnom = new Float64Array(NS);
  for (let s = 0; s < NS; s++) {
    if (s === AI_IDX) { Xnom[s] = S.Xreal0[s] * S.world * S.pAIc; continue; }
    const displaced = Math.max(0.1, 1 - ai.exportDisplacement * sec.exportAIExposure[s] * dCog);
    const rel = Math.pow(S.price[s] / S.Pf, 1 - mk.worldSync);
    Xnom[s] = S.price[s] * S.Xreal0[s] * S.world * Math.pow(rel, -mk.exportElasticity) * displaced;
  }

  // Foreigners recycle the domestic claims they accumulate (dividends, deficits) into purchases
  // of our exports; with negative claims the flow reverses (an exchange-rate adjustment in reduced form).
  const recycle = mac.rowRecycle * S.rowDep;
  for (let s = 0; s < NS; s++) if (s !== AI_IDX) Xnom[s] = Math.max(0, Xnom[s] + recycle * S.expBasket[s]);

  // 5f. nominal demand by producing sector
  const invDom = (1 - mac.importI) * InvNom + (1 - capexImp) * aiCapex;
  const N = new Float64Array(NS), D = new Float64Array(NS);
  for (let s = 0; s < NS; s++) {
    if (s === AI_IDX) continue;
    N[s] = domShare * Cnet * bs[s] + S.invBasket[s] * invDom + S.govBasket[s] * Gnom + Xnom[s];
    if (s === 3) N[s] += retrainSpend;
    D[s] = N[s] / S.price[s];
  }
  const cAI = bAI * Cnet;
  let interPlan = 0;
  for (let s = 0; s < NS; s++) if (s !== AI_IDX) interPlan += S.aiUnit[s] * D[s];
  D[AI_IDX] = ((1 - fShare) * (interPlan + cAI) + Xnom[AI_IDX]) / S.pAI;

  // ---- 6. Production and the labour market -----------------------------------
  const LD = new Float64Array(NS);
  for (let s = 0; s < NS; s++) LD[s] = (S.ell[s] / S.hours[s]) * D[s];
  const lm = clearLabourMarket(S, LD);
  const rho = new Float64Array(NS).fill(1);
  for (let s = 0; s < NS; s++) {
    if (s === AI_IDX) continue;
    const labourCap = (lm.emp[s] * S.hours[s] / S.ell[s]) * 1.05;
    S.Y[s] = Math.min(D[s], labourCap);
    rho[s] = D[s] > 0 ? S.Y[s] / D[s] : 1;
  }
  let aiPurch = 0;
  for (let s = 0; s < NS; s++) if (s !== AI_IDX) aiPurch += S.aiUnit[s] * S.Y[s];
  const aiTaxRev = gov.aiTax * aiPurch;
  S.Y[AI_IDX] = ((1 - fShare) * (aiPurch + cAI) + Xnom[AI_IDX]) / S.pAI;
  const R = new Float64Array(NS);
  let sales = 0;
  for (let s = 0; s < NS; s++) { R[s] = S.price[s] * S.Y[s]; sales += R[s]; }

  // realisation factors: rationed sectors deliver only part of what was ordered
  let kappaC = mac.importC + bAI;
  for (let s = 0; s < NS; s++) if (s !== AI_IDX) kappaC += domShare * bs[s] * rho[s];
  let invReal = 0, govReal = 0, expReal = 0;
  for (let s = 0; s < NS; s++) {
    if (s === AI_IDX) continue;
    invReal += S.invBasket[s] * rho[s];
    govReal += S.govBasket[s] * rho[s];
    expReal += Xnom[s] * rho[s];
  }
  const Ispent = mac.importI * InvNom + (1 - mac.importI) * InvNom * invReal;
  const capexSpent = capexImp * aiCapex + (1 - capexImp) * aiCapex * invReal;
  const Gspent = Gnom * govReal + retrainSpend * rho[3];
  const Xreceived = expReal + Xnom[AI_IDX];

  // ---- 7. Money flows -----------------------------------------------------------
  const F = { taxLab: 0, taxCap: 0, taxCorp: 0, vat: 0, ui: 0, welfare: 0, ubi: 0, socDiv: 0, jgWages: 0 };
  let gov$ = 0, row$ = 0, bank$ = 0, fDep = S.fDep;

  // 7a. wages, private sector
  let wageBill = 0, jgBill = 0;
  const privAvgW = avgWage(S);
  const jgWage = gov.jgWage * privAvgW;
  const hIncNow = new Float64Array(NW);
  for (let k = 0; k < NW; k++) {
    const e = S.hEmp[k];
    if (e >= 0 && e < NS) {
      const w = S.wage[e] * S.hours[e] * S.hSkill[k];
      wageBill += w; S.hLastWage[k] = w; hIncNow[k] += w * (1 - laborTax);
    } else if (e === JG) {
      jgBill += jgWage; hIncNow[k] += jgWage * (1 - laborTax);
    }
  }
  F.taxLab = laborTax * (wageBill + jgBill);
  F.jgWages = jgBill;
  fDep -= wageBill;
  gov$ += F.taxLab - jgBill;

  // 7b. goods-market settlements
  const Cpaid = Cg * kappaC;
  F.vat = Cpaid - Cpaid / (1 + gov.vat);
  const CnetPaid = Cnet * kappaC;
  const cImports = mac.importC * Cnet + fShare * cAI;
  const cDomestic = CnetPaid - cImports;
  gov$ += F.vat;
  row$ += cImports;
  fDep += cDomestic;                                    // households -> firms
  gov$ -= Gspent; fDep += Gspent;                       // government -> firms
  row$ -= Xreceived; fDep += Xreceived;                 // foreigners -> exporters
  const invImports = mac.importI * InvNom + capexImp * aiCapex;
  fDep -= invImports; row$ += invImports;               // domestic part of capex nets out within firms
  const aiForeign = fShare * aiPurch;
  fDep -= aiForeign + aiTaxRev; row$ += aiForeign; gov$ += aiTaxRev;

  // 7c. firm profits, taxes and dividends
  const OS = sales - wageBill - aiPurch - aiTaxRev;
  let Kreal = 0; for (let s = 0; s < NS; s++) Kreal += S.K[s];
  const deprec = dq * Kreal * S.PI + daiq * S.KAI;
  const fInt = rf * S.fLoans - rd * S.fDep;
  fDep -= fInt; bank$ += fInt;
  const NP = OS - deprec - fInt;
  F.taxCorp = gov.corpTax * Math.max(0, NP);
  fDep -= F.taxCorp; gov$ += F.taxCorp;
  const afterTax = NP - F.taxCorp;
  S.profitEMA = 0.8 * S.profitEMA + 0.2 * afterTax;
  S.divEMA = 0.7 * S.divEMA + 0.3 * fm.payout * Math.max(0, afterTax);
  // Surplus cash beyond the working-capital buffer and target leverage is paid out
  // (buybacks / special dividends), so firms do not hoard.
  let Kval = 0; for (let s = 0; s < NS; s++) Kval += S.K[s] * S.PI;
  const loanTarget = S.levTarget * (Kval + S.KAI);
  const cashTarget = fm.depositBuffer * wageBill;
  const surplus = fDep - S.divEMA - cashTarget - Math.max(0, S.fLoans - loanTarget);
  const div = S.divEMA + (surplus > 0 ? 0.5 * surplus : 0);
  fDep -= div;
  const pubSh = publicShare(S);
  const divRow = fEquity * div, divPub = pubSh * div;
  const divW = hh.workerEquityShare * div, divK = div - divRow - divPub - divW;
  row$ += divRow; gov$ += divPub;

  // 7d. banks
  let hDebtTot = 0, hDepTot = 0, kDepTot = 0;
  for (let k = 0; k < NW; k++) { hDebtTot += S.hDebt[k]; hDepTot += S.hDep[k]; }
  for (let j = 0; j < NK; j++) kDepTot += S.kDep[j];
  let kDebtTot = 0; for (let j = 0; j < NK; j++) kDebtTot += S.kDebt[j];
  const bondInt = rb * S.bonds;
  gov$ -= bondInt; bank$ += bondInt;
  const rowInt = rd * S.rowDep;
  row$ += rowInt; bank$ -= rowInt;
  // household interest handled per agent below; bank side aggregated here
  bank$ += rh * (hDebtTot + kDebtTot) - rd * (hDepTot + kDepTot);

  // 7e. transfers
  const years0 = Math.max(0, years);
  S.ubiOn = S.ubiOn || (!S.burnIn && gov.ubi > 0 && years0 >= gov.ubiStartYear && (gov.ubiTriggerU <= 0 || S.u >= gov.ubiTriggerU));
  if (S.ubiOn) S.ubiPhase = Math.min(1, (S.ubiPhase || 0) + 1 / 8);
  const ubi = S.ubiOn ? gov.ubi * S.base.avgWage0 * S.cpi * S.ubiPhase : 0;
  const socDiv = divPub / (NW + NK);
  const welfareAmt = gov.welfareFloor * privAvgW;

  // 7f. households: income, spending, debt service, defaults
  let defaults = 0, distressed = 0, repaid = 0;
  const kappa = kappaC;
  for (let k = 0; k < NW; k++) {
    const e = S.hEmp[k];
    let inc = hIncNow[k];
    if (e === -1) {
      if (S.hUdur[k] < gov.uiDuration) { const b = gov.uiReplacement * S.hLastWage[k]; inc += b; F.ui += b; }
      else if (S.hDep[k] < 2 * privAvgW) { inc += welfareAmt; F.welfare += welfareAmt; }
    }
    inc += ubi + socDiv;
    const eqInc = divW * S.hEq[k];
    const depInt = rd * S.hDep[k];
    const capTax = gov.capitalTax * (eqInc + depInt);
    F.taxCap += capTax;
    inc += eqInc + depInt - capTax;
    const debtInt = rh * S.hDebt[k];
    inc -= debtInt;
    let dep = S.hDep[k] + inc - S.hCons[k] * kappa;
    // principal repayment
    if (S.hDebt[k] > 0 && dep > 0) {
      const pay = Math.min(hh.repayRate * S.hDebt[k], dep, S.hDebt[k]);
      dep -= pay; S.hDebt[k] -= pay; repaid += pay;
    }
    // default: out of work, out of cash, still indebted
    if (S.hDebt[k] > 0 && (e === -1 || e === JG) && dep < 0.25 * S.hYp[k]) {
      distressed++;
      if (rng.next() < hh.defaultRate) {
        const wo = 0.5 * S.hDebt[k];
        S.hDebt[k] -= wo; bank$ -= wo; defaults += wo;
      }
    }
    if (dep < 0) { S.hDebt[k] -= dep; dep = 0; }             // overdraft becomes debt
    S.hDep[k] = dep;
    S.hInc[k] = inc;
    S.hYp[k] += hh.smoothing * (inc - S.hYp[k]);
    if (e === -1 || e === JG) S.hUdur[k] += 1;
  }
  F.ubi = ubi * (NW + NK);
  F.socDiv = divPub;
  gov$ -= F.ui + F.welfare + F.ubi + F.socDiv;

  // 7g. capital owners
  // bank$ so far = this quarter's bank profit (interest margins net of loan losses)
  const bankDiv = Math.max(0, bk.payout * bank$);
  for (let j = 0; j < NK; j++) {
    const w = S.kW[j];
    const gross = w * (divK + bankDiv) + rd * S.kDep[j];
    const tax = gov.capitalTax * gross;
    F.taxCap += tax;
    const inc = gross - tax + ubi + socDiv - rh * S.kDebt[j];
    let dep = S.kDep[j] + inc - S.kCons[j] * kappa;
    if (S.kDebt[j] > 0 && dep > 0) { const pay = Math.min(dep, S.kDebt[j]); dep -= pay; S.kDebt[j] -= pay; }
    if (dep < 0) { S.kDebt[j] -= dep; dep = 0; }
    S.kDep[j] = dep; S.kInc[j] = inc;
    S.kYp[j] += hh.smoothing * (inc - S.kYp[j]);
  }
  gov$ += F.taxCap;
  bank$ -= bankDiv;
  S.bankEq += bank$;

  // 7h. firm financing: keep a cash buffer, borrow when short, repay down to target leverage
  if (fDep < cashTarget) { const b = cashTarget - fDep; S.fLoans += b; fDep += b; }
  else if (S.fLoans > loanTarget) { const r = Math.min(S.fLoans - loanTarget, fDep - cashTarget); S.fLoans -= r; fDep -= r; }
  S.fDep = fDep;

  // 7i. government and rest of world
  S.bonds -= gov$;
  S.rowDep += row$;

  // ---- 8. Real stocks and expectations ------------------------------------------
  const iRealiz = IrealTot > 0 ? Ispent / InvNom : 0;
  for (let s = 0; s < NS; s++) {
    if (s === AI_IDX) continue;
    S.K[s] = S.K[s] * (1 - dq) + Iplan[s] * iRealiz;
    S.util[s] = (R[s] / S.PI) * S.capOut[s] / S.K[s];
    const prevEma = S.Dema[s] / S.PIprev;
    S.Dema[s] += fm.expWeight * (N[s] - S.Dema[s]);
    const g = (S.Dema[s] / S.PI) / prevEma - 1;
    S.gExp[s] = clamp(S.gExp[s] + fm.expWeight * (g - S.gExp[s]), -0.01, 0.015);
  }
  S.KAI = S.KAI * (1 - daiq) + capexSpent;
  const aiRev = R[AI_IDX];
  const gAI = aiRev / S.aiRevEMA - 1;
  S.aiRevGrowth += 0.2 * (clamp(gAI, -0.1, 0.15) - S.aiRevGrowth);
  S.aiRevEMA = aiRev;
  S.D.set(D);

  // ---- 9. Wages, prices, unemployment ------------------------------------------
  const u = lm.unemployed / NW, uJG = lm.jg / NW;
  const slack = u + 0.5 * uJG;
  for (let s = 0; s < NS; s++) {
    const uS = lm.lfBySector[s] > 0 ? lm.unempBySector[s] / lm.lfBySector[s] : u;
    const vac = LD[s] > 0 ? lm.vacancies[s] / LD[s] : 0;
    const gProd = mac.prodGrowth + ai.augmentation * Math.max(0, S.alpha[s] - (S.alphaPrev ? S.alphaPrev[s] : S.alpha[s])) * 4;
    let gw = S.piExp + lab.prodShare * gProd + lab.phillips * (mac.uStar - (0.5 * slack + 0.5 * uS)) + 0.5 * vac;
    gw = Math.max(lab.wageFloor, gw);
    S.wage[s] *= (1 + gw) ** 0.25;
  }
  S.alphaPrev = Float64Array.from(S.alpha);

  // chained CPI over the consumer basket (domestic sectors, consumer AI, imports)
  const wImp = mac.importC, wAI = bAI;
  let cpiRatio = wImp * ((1 + mac.foreignInflation) ** 0.25) + wAI * (S.pAIc / pAIcPrev);
  for (let s = 0; s < NS; s++) if (s !== AI_IDX) cpiRatio += domShare * bs[s] * (S.price[s] / S.pricePrev[s]);
  S.cpi *= cpiRatio;
  S.cpiHist.push(S.cpi);
  if (S.cpiHist.length > 5) S.cpiHist.shift();
  S.piYoY = S.cpi / S.cpiHist[0] - 1;

  S.u = u;
  S.uEMA = 0.8 * S.uEMA + 0.2 * u;
  S.uHist.push(u); if (S.uHist.length > 4) S.uHist.shift();
  S.defaultRateQ = 0.8 * S.defaultRateQ + 0.2 * (defaults / Math.max(1e-9, hDebtTot));
  S.lastRetrainees = gov.retraining > 0 ? lm.retrainees : 0;

  // equity valuation: capitalised after-tax profits
  S.equityValue = 4 * Math.max(0, S.profitEMA) / Math.max(0.03, rReal + 0.045);

  // ---- 10. National accounts -------------------------------------------------------
  const gdpNom = sales - aiPurch + jgBill;
  const aiNetReal = (R[AI_IDX] - aiPurch) / S.pAIc; // final AI output minus imported AI inputs
  const jgReal = jgBill / Math.max(1e-9, S.PG);
  const prev = S.qPrev;
  if (prev) {
    let qNow = 0, qOld = 0;
    for (let s = 0; s < NS; s++) {
      if (s === AI_IDX) continue;
      qNow += S.pricePrev[s] * S.Y[s];
      qOld += S.pricePrev[s] * prev.Y[s];
    }
    qNow += pAIcPrev * aiNetReal + prev.PG * jgReal;
    qOld += pAIcPrev * prev.aiNet + prev.PG * prev.jg;
    S.realGdp *= qNow / qOld;
  }
  S.qPrev = { Y: Float64Array.from(S.Y), aiNet: aiNetReal, jg: jgReal, PG: S.PG };
  S.gdpNomPrev = gdpNom;
  S.realGdpHist.push(S.realGdp); if (S.realGdpHist.length > 5) S.realGdpHist.shift();

  // Burn-in calibration to a balanced-growth path (frozen at t = 0):
  //  - the level of public purchases puts the no-shock economy at u*;
  //  - capital owners' spending out of wealth is set so the deficit that sustains full
  //    employment also keeps public debt at its initial ratio (sectoral balances add up).
  if (S.burnIn) {
    S.calib.gScale = clamp(S.calib.gScale * Math.exp(0.4 * (u - mac.uStar)), 0.5, 2);
    const deficit = -gov$ / gdpNom;
    const target = (mac.prodGrowth + mac.piTarget) * mac.govDebt0; // deficit that keeps debt/GDP flat
    const debtGap = S.bonds / (4 * gdpNom) - mac.govDebt0;
    S.calib.wealthK = clamp(S.calib.wealthK * Math.exp(0.3 * (deficit - target) + 0.01 * debtGap), 0.1, 8);
  }

  S.last = {
    lm, F, gdpNom, wageBill, jgBill, OS, NP, div, divRow, aiPurch, aiForeign, aiTaxRev, aiCapex, InvNom, Gnom, Gspent,
    Cpaid, cImports, Xreceived, invImports, newLoans, repaid, defaults, distressed,
    rd, rb, rf, rh, rReal, tight, bs, bAI, rho, LD, D, R, sales, deprec, retrainSpend, debtRatio, displaced,
    govBalance: gov$, ubi, fShare, fEquity, ramp,
  };
}

// Potential output relative to t = 0: how many units of the t = 0 output basket (non-AI sectors)
// the labour force could produce, given automation and productivity growth. It is a harmonic
// index, so slow-productivity sectors (Baumol) hold it back. New human tasks count as added
// value, so they do not lower potential. AI's own sector is excluded: its unit price collapses.
export function potentialIndex(S) {
  let labourPerBasket = 0;
  for (let s = 0; s < NS; s++) if (s !== AI_IDX) labourPerBasket += S.potW[s] * S.ellCore[s] / S.ellCoreRef[s];
  return 1 / labourPerBasket;
}

function publicShare(S) {
  if (S.burnIn) return 0;
  const max = 1 - S.p.households.workerEquityShare - S.p.firms.foreignEquityShare;
  return Math.min(max, S.p.gov.publicEquityShare) * Math.min(1, S.t / 20);
}

function avgWage(S) {
  let e = 0, w = 0;
  const shares = S.p.sectors.empShare;
  for (let s = 0; s < NS; s++) { w += shares[s] * S.wage[s]; e += shares[s]; }
  return w / e;
}
