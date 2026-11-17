// Parameter schema, defaults and economy-structure presets.
// Rates are annual unless the name says otherwise; the model runs in quarters.

export const SECTORS = ['COG', 'ROU', 'MFG', 'PER', 'AI'];
export const SECTOR_LABELS = {
  COG: 'Knowledge work (finance, IT, legal, media, R&D)',
  ROU: 'Routine office & customer service',
  MFG: 'Manufacturing, logistics & transport',
  PER: 'In-person & physical (care, health, retail, construction, farms)',
  AI: 'AI & digital (platforms, compute, telecom)',
};
export const NS = SECTORS.length;
export const AI_IDX = 4;

export const DEFAULTS = {
  meta: {
    name: 'Custom',
    years: 25,
    seed: 42,
    nWorkers: 2000,
    burnInQuarters: 120,
  },

  // Structural calibration of the five sectors (advanced economy by default).
  sectors: {
    empShare:   [0.23, 0.16, 0.19, 0.40, 0.02],
    relWage:    [1.45, 0.85, 1.00, 0.80, 2.00],
    markup:     [0.55, 0.45, 0.60, 0.40, 0.90],
    alphaMax:   [0.65, 0.80, 0.50, 0.25, 0.40], // max share of tasks AI can ever take
    cogWeight:  [0.95, 0.90, 0.35, 0.30, 1.00], // exposure from cognitive vs physical AI
    alpha0:     [0.02, 0.03, 0.02, 0.01, 0.04], // AI task share at t=0
    capOutput:  [6, 4, 12, 8, 6],               // capital / quarterly output
    govBasket:  [0.20, 0.05, 0.10, 0.65, 0.00],
    invBasket:  [0.30, 0.00, 0.40, 0.30, 0.00],
    expBasket:  [0.35, 0.05, 0.45, 0.10, 0.05],
    exportAIExposure: [0.5, 0.8, 0.1, 0.0, 0.0], // share of export demand substitutable by foreign AI
  },

  macro: {
    gShare: 0.17,            // government purchases / GDP at t=0
    iShare: 0.17,            // business investment / GDP
    xShare: 0.12,            // exports / GDP
    importC: 0.12,           // import share of consumer spending
    importI: 0.25,           // import share of investment spending
    prodGrowth: 0.015,       // baseline (non-AI) labour productivity growth
    worldGrowth: 0.015,      // real growth of export markets
    piTarget: 0.02,
    foreignInflation: 0.02,
    uStar: 0.05,             // unemployment consistent with stable wages
    rNeutral: 0.01,          // neutral real policy rate
    depreciation: 0.05,
    govDebt0: 0.9,           // x annual GDP
    firmDebt0: 0.6,          // x annual GDP
    hhDebt0: 0.5,            // x annual worker disposable income
    rowRecycle: 0.03,        // quarterly share of foreigners' net domestic claims spent on our exports
  },

  ai: {
    cogMax: 0.95, cogMid: 6, cogSpeed: 0.7,     // logistic capability curve for cognitive AI (years)
    physMax: 0.80, physMid: 14, physSpeed: 0.45, // robotics / physical AI
    costRatio0: 0.9,        // AI cost of a task / human cost of that task at t=0
    costDecline: 0.20,      // annual rate at which AI task cost falls
    costFloor: 0.05,
    fullAdoptRatio: 0.35,   // at this relative cost every feasible task gets automated
    adoptSpeed: 0.05,       // share of the adoption gap closed per quarter (organisational friction)
    deAdoptSpeed: 0.02,
    reinstatement: 0.30,    // new human tasks created per automated task
    augmentation: 0.25,     // productivity boost to remaining human tasks at full adoption
    foreignShare: 0.30,     // share of AI spending paid to foreign providers
    capexImport: 0.40,      // import share of AI data-centre capex
    capitalIntensity: 3.0,  // AI capital per quarterly AI output
    aiDepreciation: 0.20,
    consumerBoost: 1.0,     // growth of consumer AI budget share at full capability
    exportDisplacement: 0.5,
  },

  market: {
    passThrough: 0.6,       // share of AI cost savings passed on as lower prices
    priceStickiness: 0.35,  // share of the gap to target price closed per quarter
    markupCyc: 0.15,        // markup sensitivity to capacity utilisation
    sigmaC: 0.8,            // elasticity of substitution between consumption sectors
    exportElasticity: 1.2,
    worldSync: 0.8,         // how closely foreign wage/price levels track the same AI shock
    aiHedonic: 0.3,         // share of AI's quality-adjusted price collapse that shows up in CPI and real GDP
  },

  labor: {
    separation: 0.03,       // quarterly job-to-unemployment churn
    matchEff: 0.6,          // max share of a hiring pool matched per quarter
    adjustSpeed: 0.6,       // share of labour-demand gap closed per quarter
    retrainDelay: 3,        // quarters before a displaced worker searches in other sectors
    mobility: 0.25,         // probability a mobile worker is willing/able to switch sector
    crossPenalty: 0.85,     // relative productivity (and pay) after switching sector
    skillSigma: 0.35,
    phillips: 0.8,          // wage growth response to the unemployment gap
    prodShare: 0.9,         // share of trend productivity growth passed into wages
    wageFloor: -0.02,       // max annual nominal wage cut
    expAnchor: 0.8,         // weight of the inflation target in expectations
  },

  households: {
    mpcW: 0.92,             // workers: MPC out of (smoothed) disposable income
    mpcWealthW: 0.02,       // quarterly spending out of net liquid wealth
    mpcK: 0.45,             // capital owners: MPC out of income
    mpcWealthK: 0.012,
    equityWealthEffect: 0.002,
    smoothing: 0.25,        // speed at which perceived income adjusts
    confLevel: 0.3,         // spending cut per unit of excess unemployment (precautionary saving)
    confChange: 0.6,        // extra spending cut per unit rise in unemployment over the past year
    rateSensitivity: 1.5,   // consumption response to real interest rates
    creditMult: 4.0,        // borrowing limit / quarterly income
    loanSize: 2.0,          // size of a new durable/housing loan, x quarterly income
    repayRate: 0.04,        // quarterly principal repayment
    defaultRate: 0.08,      // quarterly default prob. for distressed debtors
    subsistence: 0.35,      // minimum real consumption / avg wage at t=0
    capitalistShare: 0.10,  // share of households living mainly on capital income
    paretoAlpha: 1.6,
    workerEquityShare: 0.25,// share of domestic equity held by workers (pensions)
  },

  firms: {
    payout: 0.5,            // regular dividends / after-tax profit (surplus cash is also paid out)
    invUtil: 0.03,          // share of the gap to desired capital closed per quarter
    invRate: 2.0,           // % cut in desired capital per 1pp of real rate above neutral
    expWeight: 0.15,        // weight of the latest quarter in demand expectations
    utilNormal: 0.85,
    depositBuffer: 0.4,     // firm cash / quarterly wage bill
    foreignEquityShare: 0.10,
  },

  banks: {
    depositSpread: 0.005,
    firmSpread: 0.02,
    hhSpread: 0.035,
    bondPremium: 0.005,
    payout: 0.7,
    defaultSpreadSens: 3,
    creditTightening: 8,
  },

  gov: {
    laborTax: 0.22,
    capitalTax: 0.20,
    corpTax: 0.21,
    vat: 0.0,
    uiReplacement: 0.45,
    uiDuration: 2,          // quarters
    welfareFloor: 0.15,     // share of avg wage for means-tested assistance
    ubi: 0.0,               // share of initial avg wage (real, per household)
    ubiStartYear: 0,
    ubiTriggerU: 0,         // if > 0, UBI only switches on once unemployment exceeds this
    aiTax: 0.0,             // tax on AI purchases, revenue to general budget
    publicEquityShare: 0.0, // social wealth fund: public share of corporate equity
    jobGuarantee: false,
    jgWage: 0.6,
    jgDelay: 2,
    retraining: 0.0,        // 0..1 programme intensity
    retrainCost: 0.4,       // per participant, x avg quarterly wage
    hoursReduction: 0.0,    // share of automation absorbed through shorter hours
    countercyclical: 0.0,   // extra real G per pp of unemployment gap
    gRule: 'potential',     // real purchases grow with potential output ('potential') or pre-AI trend ('trend')
    austerity: false,
    debtCeiling: 1.2,
    austerityRate: 0.01,
  },

  cb: {
    taylor: true,
    phiPi: 0.5,
    phiU: 1.0,
    smoothing: 0.7,
    elb: 0.0,
  },

  shocks: {
    demandSigma: 0.0,
    demandRho: 0.7,
  },
};

// Economy structures: they override the calibration, not the AI story or policy.
export const ECONOMIES = {
  advanced: {
    label: 'Advanced economy (US-like)',
    description: 'Large knowledge-work sector, domestic AI champions, moderate safety net.',
    params: {},
  },
  emerging: {
    label: 'Services-exporting emerging economy (India-like)',
    description: 'Huge informal/in-person workforce, IT & BPO exports, AI mostly imported, thin safety net.',
    params: {
      sectors: {
        empShare:  [0.07, 0.08, 0.14, 0.70, 0.01],
        relWage:   [2.40, 1.40, 1.00, 0.60, 3.50],
        markup:    [0.50, 0.40, 0.55, 0.35, 0.90],
        alphaMax:  [0.65, 0.80, 0.45, 0.15, 0.40],
        alpha0:    [0.01, 0.02, 0.01, 0.00, 0.03],
        govBasket: [0.15, 0.05, 0.10, 0.70, 0.00],
        invBasket: [0.15, 0.00, 0.40, 0.45, 0.00],
        expBasket: [0.40, 0.15, 0.35, 0.08, 0.02],
        exportAIExposure: [0.6, 0.9, 0.1, 0.0, 0.0],
      },
      macro: {
        gShare: 0.11, iShare: 0.28, xShare: 0.22, importC: 0.15, importI: 0.30,
        prodGrowth: 0.04, worldGrowth: 0.03, piTarget: 0.04, uStar: 0.07, rNeutral: 0.015,
        govDebt0: 0.8, firmDebt0: 0.5, hhDebt0: 0.2,
      },
      ai: { foreignShare: 0.75, capexImport: 0.75, exportDisplacement: 0.6 },
      households: { mpcW: 0.95, mpcK: 0.5, creditMult: 1.5, loanSize: 1.0, workerEquityShare: 0.05, subsistence: 0.45 },
      firms: { foreignEquityShare: 0.20 },
      gov: { laborTax: 0.08, capitalTax: 0.15, corpTax: 0.25, vat: 0.12, uiReplacement: 0.0, uiDuration: 0, welfareFloor: 0.10 },
    },
  },
};

export function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function deepClone(o) {
  return JSON.parse(JSON.stringify(o));
}

export function deepMerge(target, ...sources) {
  for (const src of sources) {
    if (!src) continue;
    for (const [k, v] of Object.entries(src)) {
      if (isPlainObject(v) && isPlainObject(target[k])) deepMerge(target[k], v);
      else target[k] = Array.isArray(v) ? v.slice() : v;
    }
  }
  return target;
}

// Read/write a parameter by dotted path, e.g. "ai.passThrough" or "sectors.alphaMax.0".
export function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
  o[keys[keys.length - 1]] = value;
  return obj;
}
