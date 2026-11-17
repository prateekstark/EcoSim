// Labour market: churn, layoffs, hiring with matching frictions, sector switching and job guarantee.
// hEmp[i]: -1 unemployed, 0..NS-1 employed in that sector, NS (=JG) in a job-guarantee job.

import { NS } from './params.js';
import { JG } from './init.js';

export function clearLabourMarket(S, LD) {
  const { p, rng, NW, hEmp, hUdur, hSector, hSkill } = S;
  const L = p.labor, gov = p.gov;
  const retr = gov.retraining;
  const delay = Math.max(1, Math.round(L.retrainDelay * (1 - 0.5 * retr)));
  const mobility = Math.min(1, L.mobility * (1 + 1.5 * retr));
  const penalty = 1 - (1 - L.crossPenalty) * (1 - 0.6 * retr);

  // 1. Ordinary churn: quits, firm deaths, relocations.
  for (let i = 0; i < NW; i++) {
    const e = hEmp[i];
    if (e >= 0 && e < NS && rng.next() < L.separation) { hEmp[i] = -1; hUdur[i] = 0; }
  }

  const staff = Array.from({ length: NS }, () => []);
  const poolOwn = Array.from({ length: NS }, () => []);
  const poolMobile = [];
  for (let i = 0; i < NW; i++) {
    const e = hEmp[i];
    if (e >= 0 && e < NS) staff[e].push(i);
    else if (e === -1) {
      poolOwn[hSector[i]].push(i);
      if (hUdur[i] >= delay) poolMobile.push(i);
    } else if (e === JG) poolMobile.push(i);
  }

  // 2. Layoffs where labour demand fell (partial adjustment = labour hoarding).
  let fires = 0;
  for (let s = 0; s < NS; s++) {
    const excess = staff[s].length - LD[s];
    if (excess <= 0) continue;
    const n = Math.min(staff[s].length, Math.round(excess * L.adjustSpeed));
    const list = staff[s];
    for (let k = 0; k < n; k++) {
      const j = k + rng.int(list.length - k);
      const i = list[j]; list[j] = list[k]; list[k] = i;
      hEmp[i] = -1; hUdur[i] = 0;
    }
    staff[s] = list.slice(n);
    fires += n;
  }

  // 3. Hiring: own-sector unemployed first, then mobile workers from other sectors / JG.
  let hires = 0, crossHires = 0;
  const vacancies = new Float64Array(NS);
  const order = [...Array(NS).keys()].sort((a, b) => (LD[b] - staff[b].length) - (LD[a] - staff[a].length));
  rng.shuffle(poolMobile);
  let mobileCursor = 0;
  for (const s of order) {
    let need = Math.round(LD[s] - staff[s].length);
    if (need <= 0) continue;
    const own = poolOwn[s].filter((i) => hEmp[i] === -1);
    const maxOwn = Math.floor(L.matchEff * own.length + rng.next());
    const takeOwn = Math.min(need, maxOwn);
    for (let k = 0; k < takeOwn; k++) {
      const j = k + rng.int(own.length - k);
      const i = own[j]; own[j] = own[k]; own[k] = i;
      hEmp[i] = s; hUdur[i] = 0;
    }
    need -= takeOwn; hires += takeOwn;
    if (need <= 0) continue;
    // Cross-sector: each mobile candidate is willing/able with probability `mobility`.
    const budget = Math.floor(L.matchEff * (poolMobile.length - mobileCursor) + rng.next());
    let taken = 0;
    while (need > 0 && taken < budget && mobileCursor < poolMobile.length) {
      const i = poolMobile[mobileCursor++];
      if (hEmp[i] !== -1 && hEmp[i] !== JG) continue;
      if (hSector[i] !== s && rng.next() > mobility) continue;
      if (hSector[i] !== s) { hSkill[i] *= penalty; hSector[i] = s; crossHires++; }
      hEmp[i] = s; hUdur[i] = 0;
      need--; taken++; hires++;
    }
    vacancies[s] = Math.max(0, need);
  }

  // 4. Job guarantee: long enough unemployed take a public job (80% take-up per quarter).
  let jgEntries = 0;
  if (gov.jobGuarantee && !S.burnIn) {
    for (let i = 0; i < NW; i++) {
      if (hEmp[i] === -1 && hUdur[i] >= gov.jgDelay && rng.next() < 0.8) { hEmp[i] = JG; jgEntries++; }
    }
  }

  const emp = new Float64Array(NS);
  let unemployed = 0, jg = 0, longTerm = 0, retrainees = 0;
  const unempBySector = new Float64Array(NS), lfBySector = new Float64Array(NS);
  for (let i = 0; i < NW; i++) {
    const e = hEmp[i];
    lfBySector[hSector[i]]++;
    if (e >= 0 && e < NS) emp[e]++;
    else if (e === JG) jg++;
    else {
      unemployed++;
      unempBySector[hSector[i]]++;
      if (hUdur[i] >= 4) longTerm++;
      if (hUdur[i] >= delay) retrainees++;
    }
  }
  return { emp, unemployed, jg, longTerm, retrainees, fires, hires, crossHires, jgEntries, vacancies, unempBySector, lfBySector };
}
