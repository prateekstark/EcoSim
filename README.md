# EcoSim — who buys the output?

A macroeconomic simulator for one question: **if AI replaces the workers who are also everyone's customers, does demand collapse?**

EcoSim is a *stock-flow consistent, agent-based* model. Thousands of individual households earn, spend, borrow and default. Five production sectors adopt AI when it is cheaper than the wages it replaces, and firms, banks, a government, a central bank and the rest of the world close the circuit. Every monetary flow is booked on both sides, so money never appears or disappears. The balance-sheet identity is checked every quarter (error ≈ 10⁻¹⁴).

It runs scenarios, compares them against a no-AI counterfactual, and runs Monte Carlo over the genuinely uncertain assumptions to give **probabilities of outcomes**: boom, steady transition, K-shaped growth, stagnation, deflationary slump, demand collapse.

No dependencies. Node ≥ 18 for the CLI and tests; any modern browser for the dashboard.

## Quick start

```bash
npm start                                   # dashboard at http://localhost:8080/web/
npm test                                    # accounting, stability, determinism, directional checks
node cli/ecosim.js compare                  # every preset side by side
node cli/ecosim.js run rapidPassive         # one scenario, summary + path
node cli/ecosim.js mc rapid --runs 300      # Monte Carlo: outcome odds + what drives them
node cli/ecosim.js tornado rapid --metric uPeak
npm run bundle                              # dist/ecosim.html — single self-contained file
```

Build your own scenario from parts and override any parameter:

```bash
node cli/ecosim.js run --economy emerging --ai winnerTakeAll --policy ubiAiTax \
  --set market.passThrough=0.2 --set ai.reinstatement=0.5 --years 30 --csv out.csv
```

`node cli/ecosim.js list` shows every economy, AI trajectory, policy and preset.

## What the presets show (25 years, default calibration)

| Scenario | Outcome | GDP/yr | Peak unemp. | Final unemp. | Median real income | Labour share | Poverty | Public debt |
|---|---|---|---|---|---|---|---|---|
| No-AI baseline | Steady | 1.5% | 5.8% | 4.5% | +45% | 0.0 pp | 2.2% | 109% |
| Gradual diffusion | Boom | 2.5% | 5.8% | 3.5% | +90% | −5.2 pp | 1.0% | 117% |
| Rapid displacement | K-shaped | 3.9% | 9.3% | 5.4% | +115% | −21.5 pp | 1.6% | 129% |
| Rapid + passive budget | **Collapse** | 1.8% | 41.8% | 40.0% | +13% | −22.6 pp | 28.1% | 232% |
| Rapid + austerity | **Collapse** | −0.2% | 63.9% | 63.4% | −48% | −23.6 pp | 49.2% | 324% |
| Competitive boom | Boom | 3.7% | 5.5% | 1.8% | +211% | −6.3 pp | 0.1% | 226% |
| Winner-take-all platforms | K-shaped | 3.7% | 13.8% | 5.5% | +98% | −22.3 pp | 2.0% | 157% |
| Rapid + UBI/AI tax | K-shaped | 3.9% | 6.3% | 5.3% | +137% | −22.0 pp | 0.0% | 136% |
| Rapid + job guarantee | K-shaped | 3.7% | 4.6% | 1.7% | +106% | −21.0 pp | 0.1% | 230% |
| Rapid + full policy mix | K-shaped | 4.0% | 5.8% | 4.5% | +156% | −21.9 pp | 0.0% | 146% |
| India-like, rapid global AI | K-shaped | 5.5% | 14.7% | 13.3% | +187% | −18.3 pp | 11.6% | 79% |
| India-like, imported AI | Deflationary slump | 5.4% | 15.4% | 15.2% | +171% | −19.5 pp | 13.3% | 77% |

Monte Carlo on *Rapid displacement* (150 draws): 99% K-shaped, 73% with at least one recession. Peak unemployment ranges 6.8–12.1% (90% band) and the labour share falls 16–23 points. The biggest driver of peak unemployment is the rate of **new-task creation** (rank correlation −0.67), followed by how easily spending substitutes between sectors (+0.33) and price pass-through (−0.27).

### What that says about the premise

The demand-leak mechanism is real, and the model reproduces it. When firms keep AI savings as margins, income shifts from workers (who spend ~90%) to owners and AI vendors (who spend far less, and partly abroad), and demand falls short. **Whether that becomes a recession depends mostly on how demand-side institutions respond**, not on the technology alone:

- **Passive fiscal policy is the recession trigger.** With identical technology, keeping public spending on the pre-AI trend turns K-shaped growth into mass unemployment (9% → 42%). Adding a debt brake makes it worse. At the zero lower bound, monetary policy cannot fill the gap alone.
- **Reallocation absorbs a lot, but not the income shift.** Displaced workers move into in-person services (Baumol), and cheaper goods raise real wages for those in work. Unemployment recovers in most accommodative scenarios, but the labour share still falls ~20 points and capital owners' consumption grows several times faster than workers'.
- **Policies do different jobs.** UBI eliminates poverty but not unemployment; a job guarantee removes unemployment at a large debt cost; wealth funds and the mix reduce inequality. None restores the labour share by itself.
- **AI-importing, services-exporting economies are more exposed:** lost IT/BPO exports, rents paid to foreign providers, and thin safety nets.

These are properties of a stylised, calibrated model, not forecasts. The point is to see *which assumptions* the answer hinges on, which is what the Monte Carlo and tornado tools are for.

## What is modelled

| Block | Content |
|---|---|
| **Technology** | Logistic capability curves for cognitive AI and robotics. A task is automated only when AI's cost (falling each year, plus any AI tax) is below the wage. Adoption closes the gap gradually. Reinstatement (new human tasks) and augmentation of remaining work. |
| **Sectors** | Knowledge work, routine office, manufacturing & logistics, in-person services, AI & digital. Markup pricing with *partial pass-through* of AI savings; cyclical markups; sticky prices. |
| **Households** | Individual worker agents with sector attachment, skill, deposits, debt, pension equity and perceived income. A Pareto-distributed class of capital owners. Consumption from income, wealth and equity; precautionary saving when unemployment rises; interest-sensitive spending; durable/housing borrowing; defaults. |
| **Labour market** | Churn, layoffs with labour hoarding, matching frictions, a search period before looking across sectors, mobility limits, pay penalty after switching; wage Phillips curve with downward rigidity. |
| **Firms & banks** | Partial-adjustment investment to desired capital (anchored expectations, replacement floor), AI data-centre capex, target leverage, payout of surplus cash. Banks price default risk into spreads and tighten credit. |
| **Government** | Taxes on labour, capital, profits, consumption and AI. Unemployment insurance, welfare, UBI, social wealth fund dividends, job guarantee, retraining, shorter hours. Spending rule (potential vs pre-AI trend), counter-cyclical spending, debt brake. |
| **Central bank** | Taylor rule on inflation and unemployment with a lower bound. |
| **Rest of world** | Exports with price competitiveness (dampened by `worldSync`, since rivals adopt AI too), displacement of exported services by foreign AI, imports, foreign AI vendors and shareholders, recycling of foreign claims. |

Details and equations: [docs/MODEL.md](docs/MODEL.md).

## Layout

```
src/engine/      the model (pure ES modules, runs in Node and the browser)
  params.js        parameters, sector calibration, economy structures
  scenarios.js     AI trajectories, policy packages, presets
  init.js          calibrated initial balance sheets and agents
  step.js          one quarter: technology, prices, policy, demand, production, all money flows
  labor.js         layoffs, hiring, sector switching, job guarantee
  metrics.js       indicators, recession detection, outcome classification
  model.js         burn-in, runs from a shared initial state
  montecarlo.js    Monte Carlo, rank correlations, tornado sensitivity
cli/ecosim.js    command-line runner (run / compare / mc / tornado, CSV & JSON export)
cli/bundle.js    builds dist/ecosim.html
web/             dashboard (no build step; simulations run in a Web Worker)
test/            node:test suite
```

## Extending it

- **A new policy or AI story:** add an entry to `POLICIES` or `AI_SCENARIOS` in `src/engine/scenarios.js` (a partial parameter object), and optionally a preset in `PRESETS`.
- **A new economy:** add to `ECONOMIES` in `params.js`. `init.js` warns if the sector baskets imply negative household demand.
- **A new parameter:** add it to `DEFAULTS`, use it in `step.js`, expose it in `web/controls.js`, and add it to `UNCERTAIN` in `montecarlo.js` if it should be sampled. Only sample parameters that are neutral at the steady state; all Monte Carlo draws share one burned-in initial economy.
- After any change, run `npm test`: the stock-flow identity, baseline stability and directional checks catch most mistakes.
