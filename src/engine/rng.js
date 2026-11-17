// Seeded pseudo-random numbers so every run is reproducible.

export function makeRng(seed = 1) {
  let a = (seed >>> 0) || 0x9e3779b9;
  const next = () => {
    // mulberry32
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let spare = null;
  const normal = () => {
    if (spare !== null) { const s = spare; spare = null; return s; }
    let u = 0, v = 0;
    while (u === 0) u = next();
    v = next();
    const r = Math.sqrt(-2 * Math.log(u));
    spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  };
  return {
    next,
    normal,
    uniform: (lo, hi) => lo + (hi - lo) * next(),
    int: (n) => Math.floor(next() * n),
    lognormal: (sigma) => Math.exp(sigma * normal() - 0.5 * sigma * sigma),
    pareto: (alpha) => Math.pow(1 - next(), -1 / alpha),
    triangular: (lo, mode, hi) => {
      const u = next(), c = (mode - lo) / (hi - lo || 1);
      return u < c ? lo + Math.sqrt(u * (hi - lo) * (mode - lo))
                   : hi - Math.sqrt((1 - u) * (hi - lo) * (hi - mode));
    },
    shuffle: (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
      }
      return arr;
    },
  };
}
