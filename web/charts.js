// Small dependency-free SVG charts: line/fan charts with hover, stacked areas.
// Colours come from CSS custom properties so both themes resolve from the same tokens.

const NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}

export function niceTicks(lo, hi, count = 5) {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
  if (hi - lo < 1e-12) { const d = Math.abs(hi) * 0.1 || 1; lo -= d; hi += d; }
  const raw = (hi - lo) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || 10 * mag;
  const start = Math.floor(lo / step) * step, end = Math.ceil(hi / step) * step;
  const ticks = [];
  for (let v = start; v <= end + step * 1e-6; v += step) ticks.push(Math.round(v / step) * step);
  return ticks;
}

function legend(host, series) {
  const lg = document.createElement('div');
  lg.className = 'legend';
  for (const s of series) {
    const item = document.createElement('span');
    item.className = 'legend-item';
    const sw = document.createElement('i');
    sw.className = s.dash ? 'sw sw-dash' : 'sw';
    sw.style.setProperty('--c', s.color);
    item.append(sw, document.createTextNode(s.name));
    lg.appendChild(item);
  }
  host.appendChild(lg);
}

/**
 * Line chart with optional percentile bands.
 * opts: { x: number[], series: [{name, values, color, dash, width}], bands: [{lo, hi, color, opacity}],
 *         fmt: v => string, xfmt: v => string, height, yMin, yMax, xTicks }
 */
export function lineChart(host, opts) {
  host.innerHTML = '';
  host.classList.add('chart');
  const { x, series = [], bands = [], fmt = (v) => v.toFixed(1), xfmt = (v) => `${Math.round(v)}` } = opts;
  if (series.length >= 2 && opts.legend !== false) legend(host, series);
  const W = Math.max(260, host.clientWidth || 480), H = opts.height || 210;
  const m = { l: 48, r: 14, t: 10, b: 24 };
  let lo = Infinity, hi = -Infinity;
  const scan = (arr) => { for (const v of arr) if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; } };
  series.forEach((s) => scan(s.values));
  bands.forEach((b) => { scan(b.lo); scan(b.hi); });
  if (opts.yMin !== undefined) lo = Math.min(lo, opts.yMin);
  if (opts.yMax !== undefined) hi = Math.max(hi, opts.yMax);
  const ticks = niceTicks(lo, hi, 4);
  const y0 = ticks[0], y1 = ticks[ticks.length - 1];
  const x0 = x[0], x1 = x[x.length - 1];
  const sx = (v) => m.l + ((v - x0) / (x1 - x0 || 1)) * (W - m.l - m.r);
  const sy = (v) => m.t + (1 - (v - y0) / (y1 - y0 || 1)) * (H - m.t - m.b);

  const wrap = document.createElement('div');
  wrap.className = 'plot';
  host.appendChild(wrap);
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', height: H, role: 'img' }, wrap);
  if (opts.title) el('title', {}, svg).textContent = opts.title;

  for (const t of ticks) {
    el('line', { x1: m.l, x2: W - m.r, y1: sy(t), y2: sy(t), class: Math.abs(t) < 1e-12 && y0 < 0 ? 'zero' : 'grid' }, svg);
    const lab = el('text', { x: m.l - 6, y: sy(t) + 3.5, 'text-anchor': 'end', class: 'tick' }, svg);
    lab.textContent = fmt(t);
  }
  const xt = opts.xTicks || niceTicks(x0, x1, 5).filter((v) => v >= x0 && v <= x1);
  for (const t of xt) {
    const lab = el('text', { x: sx(t), y: H - 6, 'text-anchor': 'middle', class: 'tick' }, svg);
    lab.textContent = xfmt(t);
  }

  for (const b of bands) {
    let d = '';
    for (let i = 0; i < x.length; i++) d += `${i ? 'L' : 'M'}${sx(x[i]).toFixed(1)},${sy(b.hi[i]).toFixed(1)}`;
    for (let i = x.length - 1; i >= 0; i--) d += `L${sx(x[i]).toFixed(1)},${sy(b.lo[i]).toFixed(1)}`;
    el('path', { d: d + 'Z', style: `fill:${b.color};fill-opacity:${b.opacity ?? 0.18};stroke:none` }, svg);
  }
  for (const s of series) {
    let d = '';
    s.values.forEach((v, i) => { if (Number.isFinite(v)) d += `${d ? 'L' : 'M'}${sx(x[i]).toFixed(1)},${sy(v).toFixed(1)}`; });
    el('path', {
      d, class: 'line',
      style: `stroke:${s.color};stroke-width:${s.width || 2};${s.dash ? 'stroke-dasharray:5 4;' : ''}${s.opacity ? `stroke-opacity:${s.opacity};` : ''}`,
    }, svg);
  }
  const main = series.find((s) => !s.dash && !s.faint);
  if (main) {
    const i = main.values.length - 1;
    el('circle', { cx: sx(x[i]), cy: sy(main.values[i]), r: 3.5, class: 'endpoint', style: `fill:${main.color}` }, svg);
  }

  // hover layer
  const cross = el('line', { y1: m.t, y2: H - m.b, class: 'cross', visibility: 'hidden' }, svg);
  const dots = series.filter((s) => !s.faint).map((s) => el('circle', { r: 4, class: 'hdot', style: `fill:${s.color}`, visibility: 'hidden' }, svg));
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.hidden = true;
  wrap.appendChild(tip);
  const hit = el('rect', { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, class: 'hit' }, svg);
  const shown = series.filter((s) => !s.faint);
  const move = (ev) => {
    const r = svg.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * W;
    const xv = x0 + ((px - m.l) / (W - m.l - m.r)) * (x1 - x0);
    let i = 0, best = Infinity;
    for (let k = 0; k < x.length; k++) { const d = Math.abs(x[k] - xv); if (d < best) { best = d; i = k; } }
    const cx = sx(x[i]);
    cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
    shown.forEach((s, k) => {
      const v = s.values[i];
      dots[k].setAttribute('cx', cx); dots[k].setAttribute('cy', sy(v));
      dots[k].setAttribute('visibility', Number.isFinite(v) ? 'visible' : 'hidden');
    });
    tip.innerHTML = `<b>${opts.tipTitle ? opts.tipTitle(x[i]) : 'Year ' + xfmt(x[i])}</b>` + shown.map((s) =>
      `<div><i class="sw${s.dash ? ' sw-dash' : ''}" style="--c:${s.color}"></i><span>${s.name}</span><em>${fmt(s.values[i])}</em></div>`).join('')
      + (bands.length && opts.bandLabel ? `<div class="tip-band">${opts.bandLabel(i)}</div>` : '');
    tip.hidden = false;
    const left = (cx / W) * r.width;
    tip.style.left = `${Math.min(Math.max(left + 12, 0), r.width - tip.offsetWidth - 4)}px`;
    if (left + 12 + tip.offsetWidth > r.width) tip.style.left = `${Math.max(0, left - tip.offsetWidth - 12)}px`;
  };
  hit.addEventListener('pointermove', move);
  hit.addEventListener('pointerdown', move);
  hit.addEventListener('pointerleave', () => {
    tip.hidden = true; cross.setAttribute('visibility', 'hidden');
    dots.forEach((d) => d.setAttribute('visibility', 'hidden'));
  });
}

/** Stacked area of shares (e.g. employment by sector). series values should sum to <= 1 at each x. */
export function stackedArea(host, opts) {
  host.innerHTML = '';
  host.classList.add('chart');
  const { x, series, fmt = (v) => `${(v * 100).toFixed(1)}%`, xfmt = (v) => `${Math.round(v)}` } = opts;
  legend(host, series);
  const W = Math.max(260, host.clientWidth || 480), H = opts.height || 210;
  const m = { l: 48, r: 14, t: 10, b: 24 };
  const tops = x.map((_, i) => series.reduce((a, s) => a + s.values[i], 0));
  const y1 = opts.yMax ?? Math.max(...tops);
  const ticks = niceTicks(0, y1, 4);
  const yTop = ticks[ticks.length - 1];
  const x0 = x[0], x1 = x[x.length - 1];
  const sx = (v) => m.l + ((v - x0) / (x1 - x0 || 1)) * (W - m.l - m.r);
  const sy = (v) => m.t + (1 - v / yTop) * (H - m.t - m.b);
  const wrap = document.createElement('div');
  wrap.className = 'plot';
  host.appendChild(wrap);
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', height: H, role: 'img' }, wrap);
  for (const t of ticks) {
    el('line', { x1: m.l, x2: W - m.r, y1: sy(t), y2: sy(t), class: 'grid' }, svg);
    el('text', { x: m.l - 6, y: sy(t) + 3.5, 'text-anchor': 'end', class: 'tick' }, svg).textContent = fmt(t);
  }
  for (const t of niceTicks(x0, x1, 5).filter((v) => v >= x0 && v <= x1)) {
    el('text', { x: sx(t), y: H - 6, 'text-anchor': 'middle', class: 'tick' }, svg).textContent = xfmt(t);
  }
  const base = new Array(x.length).fill(0);
  for (const s of series) {
    const top = base.map((b, i) => b + s.values[i]);
    let d = '';
    for (let i = 0; i < x.length; i++) d += `${i ? 'L' : 'M'}${sx(x[i]).toFixed(1)},${sy(top[i]).toFixed(1)}`;
    for (let i = x.length - 1; i >= 0; i--) d += `L${sx(x[i]).toFixed(1)},${sy(base[i]).toFixed(1)}`;
    el('path', { d: d + 'Z', class: 'area', style: `fill:${s.color}` }, svg);
    for (let i = 0; i < x.length; i++) base[i] = top[i];
  }
  const cross = el('line', { y1: m.t, y2: H - m.b, class: 'cross', visibility: 'hidden' }, svg);
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.hidden = true;
  wrap.appendChild(tip);
  const hit = el('rect', { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, class: 'hit' }, svg);
  const move = (ev) => {
    const r = svg.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * W;
    const xv = x0 + ((px - m.l) / (W - m.l - m.r)) * (x1 - x0);
    let i = 0, best = Infinity;
    for (let k = 0; k < x.length; k++) { const d = Math.abs(x[k] - xv); if (d < best) { best = d; i = k; } }
    const cx = sx(x[i]);
    cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
    tip.innerHTML = `<b>Year ${xfmt(x[i])}</b>` + series.slice().reverse().map((s) =>
      `<div><i class="sw" style="--c:${s.color}"></i><span>${s.name}</span><em>${fmt(s.values[i])}</em></div>`).join('');
    tip.hidden = false;
    const left = (cx / W) * r.width;
    tip.style.left = `${left + 12 + tip.offsetWidth > r.width ? Math.max(0, left - tip.offsetWidth - 12) : left + 12}px`;
  };
  hit.addEventListener('pointermove', move);
  hit.addEventListener('pointerdown', move);
  hit.addEventListener('pointerleave', () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); });
}
