// Parameters exposed in the dashboard, grouped by the question they answer.
// kind: 'range' (default), 'toggle', 'select'. fmt: how the value is displayed.

const pct = (v) => `${Math.round(v * 100)}%`;
const pct1 = (v) => `${(v * 100).toFixed(1)}%`;
const yrs = (v) => `yr ${(+v).toFixed(v % 1 ? 1 : 0)}`;
const num = (d) => (v) => (+v).toFixed(d);
const qtr = (v) => `${v} qtr${v == 1 ? '' : 's'}`;
const x = (v) => `×${(+v).toFixed(2)}`;

export const GROUPS = [
  {
    id: 'tech', title: 'AI technology', open: true,
    note: 'How capable AI gets, how fast, and how cheaply.',
    items: [
      { path: 'ai.cogMid', label: 'Cognitive AI midpoint', min: 1, max: 20, step: 0.5, fmt: yrs, help: 'Year in which white-collar AI capability reaches half its ceiling.' },
      { path: 'ai.cogMax', label: 'Cognitive AI ceiling', min: 0, max: 1, step: 0.05, fmt: pct, help: 'Share of the automatable frontier that cognitive AI eventually reaches.' },
      { path: 'ai.physMid', label: 'Robotics midpoint', min: 2, max: 30, step: 0.5, fmt: yrs, help: 'Year in which physical AI (robots, autonomy) reaches half its ceiling.' },
      { path: 'ai.physMax', label: 'Robotics ceiling', min: 0, max: 1, step: 0.05, fmt: pct },
      { path: 'ai.costDecline', label: 'AI cost decline', min: 0, max: 0.5, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%/yr`, help: 'How fast the cost of an AI-performed task falls each year.' },
      { path: 'ai.adoptSpeed', label: 'Firm adoption speed', min: 0.01, max: 0.2, step: 0.01, fmt: num(2), help: 'Share of the gap to profitable automation that firms close each quarter.' },
      { path: 'ai.reinstatement', label: 'New human tasks', min: 0, max: 0.95, step: 0.05, fmt: num(2), help: 'New tasks for people created per task automated (Acemoglu–Restrepo reinstatement).' },
      { path: 'ai.augmentation', label: 'Augmentation of remaining work', min: 0, max: 1, step: 0.05, fmt: num(2), help: 'Productivity boost AI gives to tasks people still do.' },
    ],
  },
  {
    id: 'market', title: 'Markets & ownership',
    note: 'Who captures the savings: consumers, shareholders, or foreign platforms.',
    items: [
      { path: 'market.passThrough', label: 'Savings passed to prices', min: 0, max: 1, step: 0.05, fmt: pct, help: '0% = firms keep every AI saving as margin; 100% = competition passes it all to consumers.' },
      { path: 'market.sigmaC', label: 'Substitutability of sectors', min: 0.2, max: 2, step: 0.1, fmt: num(1), help: 'Below 1, spending shifts toward sectors that stay expensive (in-person services).' },
      { path: 'ai.foreignShare', label: 'AI bought from abroad', min: 0, max: 0.95, step: 0.05, fmt: pct, help: 'Share of AI spending that goes to foreign providers — income that leaks out.' },
      { path: 'firms.foreignEquityShare', label: 'Foreign-owned equity', min: 0, max: 0.6, step: 0.05, fmt: pct },
      { path: 'households.workerEquityShare', label: 'Equity held by workers', min: 0, max: 0.6, step: 0.05, fmt: pct, help: 'Pension/retirement ownership that routes profits back to working households.' },
      { path: 'market.worldSync', label: 'Rest of world adopts AI too', min: 0, max: 1, step: 0.05, fmt: pct, help: '100% = foreign rivals get identical cost cuts, so there is no competitive edge from AI.' },
    ],
  },
  {
    id: 'labour', title: 'Labour market & households',
    note: 'How quickly displaced workers move, and how cautious households get.',
    items: [
      { path: 'labor.mobility', label: 'Willingness to switch sector', min: 0.02, max: 1, step: 0.02, fmt: pct },
      { path: 'labor.retrainDelay', label: 'Search before retraining', min: 1, max: 12, step: 1, fmt: qtr },
      { path: 'labor.crossPenalty', label: 'Pay after switching sector', min: 0.5, max: 1, step: 0.05, fmt: pct, help: 'Relative productivity and pay of a worker in a new sector.' },
      { path: 'labor.phillips', label: 'Wage response to slack', min: 0, max: 2, step: 0.1, fmt: num(1) },
      { path: 'labor.wageFloor', label: 'Fastest nominal wage cut', min: -0.1, max: 0, step: 0.005, fmt: (v) => `${(v * 100).toFixed(1)}%/yr` },
      { path: 'households.mpcK', label: 'Capital owners\' propensity to spend', min: 0.2, max: 0.9, step: 0.05, fmt: pct, help: 'Share of extra income owners spend. Low values are the "demand leak".' },
      { path: 'households.confChange', label: 'Precautionary saving response', min: 0, max: 3, step: 0.1, fmt: num(1), help: 'How sharply households cut spending when unemployment rises.' },
      { path: 'households.creditMult', label: 'Borrowing limit', min: 0, max: 8, step: 0.5, fmt: (v) => `${v}× qtr income` },
    ],
  },
  {
    id: 'fiscal', title: 'Fiscal policy', open: true,
    note: 'Government spending, safety net and new instruments.',
    items: [
      { path: 'gov.gRule', label: 'Public spending rule', kind: 'select', options: [['potential', 'Grows with potential output'], ['trend', 'Stuck on pre-AI trend']], help: 'Whether real public purchases keep pace with AI-driven gains in potential output.' },
      { path: 'gov.countercyclical', label: 'Extra spending in slumps', min: 0, max: 4, step: 0.25, fmt: num(2), help: 'Additional real spending per unit of excess unemployment.' },
      { path: 'gov.austerity', label: 'Debt brake (austerity)', kind: 'toggle' },
      { path: 'gov.debtCeiling', label: 'Debt brake threshold', min: 0.6, max: 2.5, step: 0.1, fmt: pct },
      { path: 'gov.uiReplacement', label: 'Unemployment benefit', min: 0, max: 0.9, step: 0.05, fmt: pct, help: 'Share of the previous wage paid while unemployed.' },
      { path: 'gov.uiDuration', label: 'Benefit duration', min: 0, max: 12, step: 1, fmt: qtr },
      { path: 'gov.ubi', label: 'Universal basic income', min: 0, max: 0.6, step: 0.02, fmt: (v) => `${Math.round(v * 100)}% of avg wage`, help: 'Paid to every household, indexed to prices.' },
      { path: 'gov.ubiStartYear', label: 'UBI starts', min: 0, max: 20, step: 1, fmt: yrs },
      { path: 'gov.aiTax', label: 'Tax on AI purchases', min: 0, max: 1, step: 0.05, fmt: pct },
      { path: 'gov.capitalTax', label: 'Tax on capital income', min: 0, max: 0.6, step: 0.02, fmt: pct },
      { path: 'gov.publicEquityShare', label: 'Social wealth fund', min: 0, max: 0.6, step: 0.05, fmt: pct, help: 'Public share of corporate equity; its dividends go equally to all households.' },
      { path: 'gov.jobGuarantee', label: 'Job guarantee', kind: 'toggle' },
      { path: 'gov.jgWage', label: 'Job guarantee wage', min: 0.3, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}% of avg wage` },
      { path: 'gov.retraining', label: 'Retraining programme', min: 0, max: 1, step: 0.1, fmt: pct },
      { path: 'gov.hoursReduction', label: 'Shorter working week', min: 0, max: 1, step: 0.1, fmt: pct, help: 'Share of automated labour absorbed through fewer hours instead of layoffs.' },
    ],
  },
  {
    id: 'money', title: 'Central bank & run settings',
    items: [
      { path: 'cb.elb', label: 'Lowest policy rate', min: -0.02, max: 0.01, step: 0.0025, fmt: pct1 },
      { path: 'cb.phiU', label: 'Rate response to unemployment', min: 0, max: 3, step: 0.1, fmt: num(1) },
      { path: 'meta.years', label: 'Horizon', min: 10, max: 40, step: 1, fmt: (v) => `${v} years` },
      { path: 'meta.nWorkers', label: 'Simulated workers', min: 500, max: 4000, step: 250, fmt: (v) => `${v}`, help: 'More agents = smoother results, slower runs.' },
      { path: 'meta.seed', label: 'Random seed', min: 1, max: 99, step: 1, fmt: (v) => `${v}` },
    ],
  },
];

export { pct, x };
