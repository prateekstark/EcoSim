# EcoSim model reference

Quarterly, discrete time. Money is normalised so the average worker earns 1.0 per quarter at t = 0. Rates in parameters are annual unless noted. Sector index `s ∈ {COG, ROU, MFG, PER, AI}`.

## 1. Timing within a quarter

1. Exogenous drivers: foreign prices `Pf`, trend productivity `λ̄`, world demand, AI capability `C_cog(t)`, `C_phys(t)`, AI task cost ratio `r(t)`.
2. Technology: adoption `α_s`, new tasks `ν_s`, productivity `λ_s`, hours, labour coefficients.
3. Prices set from unit costs.
4. Central bank sets the policy rate from last quarter's inflation and unemployment; banks set spreads.
5. Planned demand: households (agent by agent), government, business investment, AI capex, exports.
6. Production: labour demand, labour market clearing, output (rationed if labour is short).
7. Money flows: wages, sales, imports, AI purchases, taxes, profits, dividends, interest, transfers, borrowing, repayment, defaults.
8. Stocks and expectations: capital, AI capital, demand expectations.
9. Wages (Phillips curve), CPI, unemployment, confidence.
10. National accounts (chained real GDP), stock-flow check.

## 2. Technology and adoption

Capability: `C_k(t) = Cmax_k / (1 + exp(−speed_k · (t − mid_k)))` for `k ∈ {cog, phys}`; sector exposure `cap_s = w_s C_cog + (1 − w_s) C_phys`.

AI cost of a worker-quarter of tasks: `c_s(t) = w_s,0 · r(t) · Pf(t)` with `r(t) = max(r_floor, r_0 e^{−δ_AI t})`.
Relative cost including the AI tax: `ρ_s = c_s (1 + τ_AI) / w_s(t)`. Falling wages slow automation.

Target automation: `α*_s = max(α_s,0, αmax_s · cap_s · clamp((1 − ρ_s)/(1 − ρ_full), 0, 1))`
Adoption: `Δα_s = κ⁺ (α* − α)` if rising, `κ⁻ (α* − α)` if falling.
New human tasks: `Δν_s = θ_reinst · max(0, Δα_s)`, capped at `0.9 α_s`.
Productivity of remaining tasks: `λ_s = λ̄(t) · (1 + aug · (α_s − α_s,0))`.

Labour per unit of output (FTE): `ℓ_s = (h_s,0 / λ_s) · (1 − α_s + ν_s)`.
AI purchases per unit of output: `a_s = α_s (h_s,0/λ_s) c_s`.
Hours policy: `hours_s = max(0.6, 1 − φ_h · displaced_s)`; headcount per unit `ℓ_s / hours_s`.

The AI sector sells at the world price `p_AI = (r/r_0) Pf`; its labour per unit falls with `p_AI` and rises with its own automation.

## 3. Prices

Unit labour cost `ULC_s = w_s ℓ_s`; AI cost `AIC_s = a_s (1 + τ_AI)`; human cost of the automated tasks `H_s = α_s (h_s,0/λ_s) w_s`.

`p*_s = (1 + μ_s (1 + μ_cyc (u_s − ū))) · [ULC_s + AIC_s + (1 − φ) · max(0, H_s − AIC_s)]`

`φ` is **pass-through**. With φ = 1 all AI savings reach consumers; with φ = 0 the price stays where it would be with humans and the saving is margin. Prices adjust geometrically: `p ← p (p*/p)^θ_p`.

Consumer-facing AI price `p_AIc = Pf (p_AI/Pf)^h`, where `h` (`aiHedonic`) is the share of AI's quality-adjusted price collapse that reaches the CPI and real GDP.

## 4. Money, credit and the central bank

Policy rate (Taylor rule with smoothing and lower bound):
`i* = r_n + π + φ_π (π − π*) + φ_u (u* − u)`, `i ← max(elb, s·i + (1 − s)·i*)`.

Deposit rate `i − 0.5%`, bond rate `i + 0.5%`, firm loans `i + 2%`, household loans `i + 3.5% + 3 × (annual default rate − 1%)`. Credit tightening multiplier `max(0.2, 1 − 8 × (default − 1%))`.

## 5. Households

**Workers** (agent `k`): perceived income `yp_k` adapts to actual disposable income at rate 0.25/quarter.

`C*_k = conf · rateF · (mpc_W · yp_k + mpc_WD · deposits_k)`, floored at a real subsistence level and capped by cash on hand.

- Confidence: `conf = clamp(1 − c_L max(0, ū_EMA − u*) − c_Δ max(0, Δu_yoy) + ε, 0.85, 1.05)`
- Rate effect: `rateF = clamp(1 − η (r_real − r_n), 0.85, 1.15)`
- Durable/housing loans: an employed worker takes a loan of `L · yp` with probability `p_b · conf · rateF² · tight` if debt stays below `creditMult · yp · tight`; `p_b` is calibrated so debt/income is stationary at its initial ratio.

Disposable income = net wage (or UI / means-tested welfare) + UBI + social dividend + pension dividends + deposit interest − capital-income tax − loan interest. Principal is repaid at 4%/quarter when cash allows. Unemployed debtors with little cash default on half their debt with probability 8%/quarter. Negative cash becomes an overdraft loan.

**Capital owners** (Pareto weights `ω_j`): receive dividends, bank dividends and interest.
`C*_j = √conf · rateF · (mpc_K yp_j + m_K mpc_KW deposits_j + e · equityWealth_j)`, where `m_K` is a burn-in calibration constant (§9).

## 6. Demand

Consumption allocation. Net of VAT, a share `m_C` goes to imports and a share `b_AI(t) = b_AI,0 (1 + boost · ΔC_cog)` to consumer AI (partly foreign). The rest is split across sectors with CES budget shares
`b_s ∝ b_s,0 (p_s / p̄)^{1−σ}`. With σ < 1, spending shifts toward sectors whose relative price rises (in-person services): the Baumol channel.

Government purchases: `G_real = G_ref · Π(t) · austerity · (1 + g_cyc (ū − u*))`, where `Π(t)` is either
- **potential** (default): a harmonic index of labour productivity from automation and trend growth, `Π = 1 / Σ_s ω_s ℓ^core_s(t)/ℓ^core_s(0)`; new tasks are treated as added value; or
- **trend**: `(1 + g)^t`, the pre-AI productivity trend only (the "passive budget").

Business investment (sector `s`, real, in capital-goods prices):
`K*_s = v_s · (D^e_s / P_I) · (1 + 2 g^e_s) / ū · clamp(1 − β_r (r_real − r_n), 0.7, 1.3)`,
`I_s = K_s · clamp(δ + g^e_s + γ (K*_s/K_s − 1), 0.4δ, δ + 1.2%)`,
with expected growth `g^e` half anchored to trend and half extrapolated from smoothed nominal demand.

AI capex: `δ_AI K_AI + 0.25 max(0, κ · E[AI revenue] − K_AI)`, part imported.

Exports: `X_s = p_s · X_s,0 · world(t) · (p_s/Pf)^{−ε(1 − sync)} · (1 − d · exposure_s · ΔC_cog)` plus recycling of foreigners' net claims (3%/quarter of `rowDep`).

## 7. Production and the labour market

Labour demand `LD_s = (ℓ_s / hours_s) · D_s`. The labour market (`labor.js`) runs in this order:

1. 3% quarterly churn into unemployment.
2. Layoffs of 60% of any excess staff.
3. Hiring from same-sector unemployed, capped at 60% of that pool per quarter.
4. Hiring from mobile workers: unemployed ≥ `retrainDelay` quarters or in job-guarantee jobs, willing with probability `mobility`. Switching sector multiplies the worker's skill (and pay) by `crossPenalty`. Retraining shortens the delay, raises mobility and softens the penalty.
5. Job guarantee take-up by the long-term unemployed.

Output `Y_s = min(D_s, 1.05 · E_s hours_s / ℓ_s)`. Rationed demand is not spent; buyers keep the money.

Wages: `g_w,s = π^e + θ g_prod,s + β (u* − (½ slack + ½ u_s)) + ½ vacancy_s`, floored at `wageFloor`, where `π^e = 0.8 π* + 0.2 π`. Slack counts job-guarantee workers at half weight.

## 8. Accounts and identities

Sectors hold: worker deposits and debt, owner deposits and debt, firm deposits and loans, government bonds, bank equity, and foreign deposits `rowDep`. Every flow debits one of these and credits another, so each quarter

`Σ loans + bonds = Σ deposits + rowDep + bank equity`

holds to floating-point precision. The recorder reports the error as a share of GDP.

Firms pay regular dividends (`payout` × smoothed after-tax profit), plus half of any cash above a working-capital buffer once loans are at target leverage. Dividends are split among foreign owners, the social wealth fund, workers' pensions and capital owners.

Nominal GDP = sales − AI intermediate purchases + job-guarantee wages. Real GDP is a chained Laspeyres volume index using previous-quarter prices, with the final AI output net of imported AI deflated by `p_AIc`.

## 9. Calibration and burn-in

`init.js` builds the t = 0 economy from sector employment shares, relative wages and markups. Each sector's revenue then follows from the pricing rule. Final demand shares (G, I, X) and baskets determine household demand by sector residually. Capital stocks are set so investment equals depreciation plus trend growth. Balance sheets start from the debt ratios, with capital owners' deposits as the residual.

The model then runs **120 quarters of burn-in** with today's structure and policy and frozen AI. Two constants are tuned and then frozen at t = 0:

- the level of public purchases (`calib.gScale`), so unemployment settles at `u*`;
- capital owners' spending out of wealth (`calib.wealthK`), so the deficit that sustains full employment keeps public debt/GDP stable (sectoral balances add up).

The scenario's AI trajectory, market structure (foreign AI and equity shares, which phase in with diffusion) and policy package switch on at t = 0. The no-AI counterfactual shares the same policy.

Monte Carlo draws only parameters that are neutral at the steady state (AI trajectory, pass-through, substitutability, mobility, behavioural responses to shocks), so all draws start from one burned-in economy.

## 10. Outcome classification

Checked in order on the full run:

| Outcome | Rule |
|---|---|
| Demand collapse | peak unemployment > 18% or real GDP ≥ 10% below its previous peak |
| Deflationary slump | CPI inflation < −0.5% on average in the second half and final unemployment > u* + 3pp |
| Stagnation | GDP growth < 1%/yr and final unemployment > u* + 2.5pp |
| Jobless / K-shaped | final unemployment > u* + 2.5pp, or labour share −8pp, or median income growth < half of GDP growth |
| Broad-based boom | GDP growth > trend + 0.8pp and median income growth > 70% of GDP growth |
| Steady transition | otherwise |

A recession is two or more consecutive quarterly declines adding up to at least 1%.

## 11. Known limitations

- A stylised calibration, not an estimated model; use it for mechanisms and relative comparisons.
- No exchange rate, housing market, migration or endogenous politics. The foreign sector recycles its claims mechanically.
- New goods enter only through reinstatement and consumer-AI demand.
- Capital owners are a separate class; in reality many high earners are both workers and owners.
- Firms are aggregated by sector: no bankruptcies or market-share dynamics; concentration enters through pass-through only.
