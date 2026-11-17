// Scenario building blocks. A run = economy structure + AI trajectory + policy package (+ overrides).

import { DEFAULTS, ECONOMIES, deepClone, deepMerge } from './params.js';

export const AI_SCENARIOS = {
  none: {
    label: 'No AI (counterfactual)',
    description: 'AI capability frozen at today\'s level. The yardstick every other run is compared with.',
    params: { ai: { cogMax: 0, physMax: 0, costDecline: 0, reinstatement: 0 } },
  },
  gradual: {
    label: 'Gradual diffusion',
    description: 'Capability grows steadily, adoption takes a decade, decent new-task creation and competitive pricing.',
    params: {
      ai: { cogMax: 0.7, cogMid: 9, cogSpeed: 0.45, physMax: 0.5, physMid: 18, physSpeed: 0.3,
            costDecline: 0.12, adoptSpeed: 0.03, reinstatement: 0.45 },
      market: { passThrough: 0.7 },
    },
  },
  rapid: {
    label: 'Rapid displacement',
    description: 'Fast capability gains, cheap AI, weak new-task creation, most savings kept as margin.',
    params: {
      ai: { cogMax: 0.95, cogMid: 4, cogSpeed: 0.9, physMax: 0.8, physMid: 10, physSpeed: 0.5,
            costDecline: 0.30, adoptSpeed: 0.07, reinstatement: 0.15, augmentation: 0.2 },
      market: { passThrough: 0.3 },
    },
  },
  boom: {
    label: 'Productivity boom',
    description: 'Same fast technology as "rapid", but competition passes savings to prices and AI spawns many new human tasks.',
    params: {
      ai: { cogMax: 0.95, cogMid: 4, cogSpeed: 0.9, physMax: 0.8, physMid: 10, physSpeed: 0.5,
            costDecline: 0.30, adoptSpeed: 0.07, reinstatement: 0.6, augmentation: 0.5 },
      market: { passThrough: 0.9, sigmaC: 1.2 },
    },
  },
  winnerTakeAll: {
    label: 'Winner-take-all AI',
    description: 'Fast AI supplied by a few (often foreign) platforms that capture the rents. Little pass-through.',
    params: {
      ai: { cogMax: 0.95, cogMid: 5, cogSpeed: 0.8, physMax: 0.7, physMid: 12, physSpeed: 0.45,
            costDecline: 0.25, adoptSpeed: 0.06, reinstatement: 0.15, foreignShare: 0.7, capexImport: 0.7 },
      market: { passThrough: 0.15 },
      firms: { foreignEquityShare: 0.25 },
    },
  },
  cognitiveOnly: {
    label: 'Cognitive AI only (robotics stalls)',
    description: 'White-collar work is automated fast; physical work barely changes. Tests the Baumol reallocation story.',
    params: {
      ai: { cogMax: 0.95, cogMid: 4, cogSpeed: 0.9, physMax: 0.1, physMid: 25, physSpeed: 0.3,
            costDecline: 0.28, adoptSpeed: 0.07, reinstatement: 0.3 },
      market: { passThrough: 0.5 },
    },
  },
};

export const POLICIES = {
  none: {
    label: 'Status quo',
    description: 'Existing automatic stabilisers and an inflation-targeting central bank. Nothing new.',
    params: {},
  },
  passive: {
    label: 'Passive budget',
    description: 'Real public spending keeps growing on the pre-AI trend, ignoring AI-driven gains in potential output (an implicit fiscal tightening).',
    params: { gov: { gRule: 'trend' } },
  },
  austerity: {
    label: 'Austerity (debt brake)',
    description: 'Spending on the pre-AI trend, and cut further whenever debt passes 100% of GDP.',
    params: { gov: { gRule: 'trend', austerity: true, debtCeiling: 1.0, austerityRate: 0.015 } },
  },
  stabilisers: {
    label: 'Stronger stabilisers',
    description: 'Longer, more generous unemployment insurance and counter-cyclical spending.',
    params: { gov: { uiReplacement: 0.6, uiDuration: 6, welfareFloor: 0.25, countercyclical: 1.5 } },
  },
  ubiAiTax: {
    label: 'UBI funded by an AI tax',
    description: '25% tax on AI purchases plus a universal basic income worth 20% of the average wage.',
    params: { gov: { ubi: 0.20, ubiStartYear: 2, aiTax: 0.25, capitalTax: 0.30 } },
  },
  jobGuarantee: {
    label: 'Job guarantee + retraining',
    description: 'Public employment at 60% of the average wage for anyone out of work 2 quarters, plus retraining.',
    params: { gov: { jobGuarantee: true, jgWage: 0.6, jgDelay: 2, retraining: 0.7 } },
  },
  wealthFund: {
    label: 'Social wealth fund',
    description: 'The public gradually owns 30% of corporate equity; its dividends are paid out equally to all households.',
    params: { gov: { publicEquityShare: 0.30 } },
  },
  shorterWeek: {
    label: 'Shorter working week',
    description: 'Half of the labour saved by automation is shared out as shorter hours instead of layoffs.',
    params: { gov: { hoursReduction: 0.5 } },
  },
  fullMix: {
    label: 'Full policy mix',
    description: 'AI tax + modest UBI + retraining + stronger stabilisers + social wealth fund.',
    params: {
      gov: { aiTax: 0.20, ubi: 0.12, ubiStartYear: 2, retraining: 0.6, uiReplacement: 0.55, uiDuration: 4,
             countercyclical: 1.0, publicEquityShare: 0.2, capitalTax: 0.28 },
    },
  },
};

// Named combinations shown as one-click presets.
export const PRESETS = [
  { id: 'baseline', label: 'No-AI baseline', economy: 'advanced', ai: 'none', policy: 'none' },
  { id: 'gradual', label: 'Gradual diffusion', economy: 'advanced', ai: 'gradual', policy: 'none' },
  { id: 'rapid', label: 'Rapid displacement, no policy', economy: 'advanced', ai: 'rapid', policy: 'none' },
  { id: 'rapidPassive', label: 'Rapid + passive budget', economy: 'advanced', ai: 'rapid', policy: 'passive' },
  { id: 'rapidAusterity', label: 'Rapid displacement + austerity', economy: 'advanced', ai: 'rapid', policy: 'austerity' },
  { id: 'boom', label: 'Competitive productivity boom', economy: 'advanced', ai: 'boom', policy: 'none' },
  { id: 'winner', label: 'Winner-take-all platforms', economy: 'advanced', ai: 'winnerTakeAll', policy: 'none' },
  { id: 'rapidUbi', label: 'Rapid + UBI/AI tax', economy: 'advanced', ai: 'rapid', policy: 'ubiAiTax' },
  { id: 'rapidJg', label: 'Rapid + job guarantee', economy: 'advanced', ai: 'rapid', policy: 'jobGuarantee' },
  { id: 'rapidMix', label: 'Rapid + full policy mix', economy: 'advanced', ai: 'rapid', policy: 'fullMix' },
  { id: 'indiaRapid', label: 'India-like: rapid global AI', economy: 'emerging', ai: 'rapid', policy: 'none' },
  { id: 'indiaWinner', label: 'India-like: imported winner-take-all AI', economy: 'emerging', ai: 'winnerTakeAll', policy: 'none' },
];

export function buildParams({ economy = 'advanced', ai = 'gradual', policy = 'none', overrides = null, meta = null } = {}) {
  const p = deepClone(DEFAULTS);
  if (!ECONOMIES[economy]) throw new Error(`Unknown economy "${economy}"`);
  if (!AI_SCENARIOS[ai]) throw new Error(`Unknown AI scenario "${ai}"`);
  if (!POLICIES[policy]) throw new Error(`Unknown policy "${policy}"`);
  const today = deepMerge(deepClone(DEFAULTS), ECONOMIES[economy].params);
  deepMerge(p, ECONOMIES[economy].params, AI_SCENARIOS[ai].params, POLICIES[policy].params, overrides || {});
  // Today's structure: used during burn-in; scenario values phase in as AI diffuses (policy from t = 0).
  p.baseline = {
    gov: today.gov,
    foreignShare: today.ai.foreignShare,
    capexImport: today.ai.capexImport,
    foreignEquityShare: today.firms.foreignEquityShare,
  };
  p.meta.name = `${ECONOMIES[economy].label.split(' (')[0]} · ${AI_SCENARIOS[ai].label} · ${POLICIES[policy].label}`;
  p.meta.economy = economy;
  p.meta.ai = ai;
  p.meta.policy = policy;
  if (meta) Object.assign(p.meta, meta);
  return p;
}

export function presetParams(id, extra = {}) {
  const pr = PRESETS.find((x) => x.id === id);
  if (!pr) throw new Error(`Unknown preset "${id}"`);
  const p = buildParams({ economy: pr.economy, ai: pr.ai, policy: pr.policy, ...extra });
  p.meta.name = pr.label;
  p.meta.preset = id;
  return p;
}
