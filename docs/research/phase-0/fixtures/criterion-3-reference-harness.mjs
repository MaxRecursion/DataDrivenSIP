// SIP Date Planner — spike C3 convention harness. Node 22 ESM, zero deps, UTC day numbers only.
// Usage: node harness.mjs [--quick]   (reads ./119775.json, writes ./119775.fund.json)
import fs from 'node:fs';
import zlib from 'node:zlib';

const HERE = new URL('.', import.meta.url);
const QUICK = process.argv.includes('--quick');
const DAY = 86400000;
const dayOf = (y, m, d) => Date.UTC(y, m - 1, d) / DAY;
const iso = (day) => new Date(day * DAY).toISOString().slice(0, 10);
const monthOf = (day) => { const t = new Date(day * DAY); return t.getUTCFullYear() * 12 + t.getUTCMonth(); };
const tgt = (mi, d) => dayOf(Math.floor(mi / 12), (mi % 12) + 1, d);
const firstOf = (mi) => tgt(mi, 1);
const DATES = Array.from({ length: 28 }, (_, i) => i + 1);
const r3 = (x) => Math.round(x * 1000) / 1000;
const AMT = 10000;

// ---------- data ----------
function parse(raw, cutoffIso) {
  const cut = cutoffIso ? dayOf(+cutoffIso.slice(0, 4), +cutoffIso.slice(5, 7), +cutoffIso.slice(8, 10)) : Infinity;
  const rows = [];
  let dropped = 0;
  for (const r of raw.data) {
    const [dd, mm, yy] = r.date.split('-').map(Number);
    const nav = parseFloat(r.nav);
    if (!Number.isFinite(nav) || nav === 0) continue;
    const day = dayOf(yy, mm, dd);
    if (day > cut) { dropped++; continue; }
    rows.push({ day, nav });
  }
  rows.sort((a, b) => a.day - b.day);
  return { H: hist(rows), dropped };
}
function hist(rows) {
  return { rows, map: new Map(rows.map((r) => [r.day, r.nav])), first: rows[0].day, last: rows[rows.length - 1].day };
}
function navOnOrAfter(H, day, look = 7) {
  for (let k = 0; k <= look; k++) { const v = H.map.get(day + k); if (v !== undefined) return { day: day + k, nav: v }; }
  return null;
}
function navOnOrBefore(H, day) {
  let lo = 0, hi = H.rows.length - 1, ans = null;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (H.rows[mid].day <= day) { ans = H.rows[mid]; lo = mid + 1; } else hi = mid - 1; }
  return ans;
}

// ---------- XIRR (spec 5.2) ----------
function xirr(ts, cfs) {
  const t0 = Math.min(...ts);
  const ys = ts.map((t) => (t - t0) / 365);
  const npv = (r) => { let s = 0; for (let i = 0; i < cfs.length; i++) s += cfs[i] / (1 + r) ** ys[i]; return s; };
  let lo = -0.99, hi = 3.0;
  for (let i = 0; i < 100; i++) { const mid = (lo + hi) / 2; if (npv(mid) > 0) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

// ---------- one SIP ----------
// months: month indices; term: {day, nav}; o: {look, cfDate:'nav'|'target'}
function sip(H, d, months, term, o) {
  let units = 0; const ts = [], cfs = [];
  for (const mi of months) {
    const t = tgt(mi, d);
    const r = navOnOrAfter(H, t, o.look);
    if (!r) continue;
    units += AMT / r.nav;
    ts.push(o.cfDate === 'target' ? t : r.day); cfs.push(-AMT);
  }
  const n = cfs.length;
  if (!n) return { d, xirr: NaN, corpus: NaN, n: 0 };
  const corpus = units * term.nav;
  ts.push(term.day); cfs.push(corpus);
  return { d, xirr: xirr(ts, cfs), corpus, n };
}

// ---------- full history (spec 5.3) ----------
function monthsFor(H, d, o, commonCache) {
  const out = [];
  const m0 = monthOf(H.first), m1 = monthOf(H.last);
  if (o.monthSet === 'common' || o.monthSet === 'commonTIR') {
    if (!commonCache.v) {
      commonCache.v = [];
      for (let mi = m0; mi <= m1; mi++)
        if (DATES.every((dd) => navOnOrAfter(H, tgt(mi, dd), o.look) && (o.monthSet === 'common' || tgt(mi, dd) >= H.first))) commonCache.v.push(mi);
    }
    return commonCache.v;
  }
  for (let mi = m0; mi <= m1; mi++) {
    const t = tgt(mi, d);
    if (o.monthSet === 'tir' && t < H.first) continue;
    if (navOnOrAfter(H, t, o.look)) out.push(mi);
  }
  return out;
}
function fullHistory(H, o) {
  const cc = {};
  const term = o.term === 'today' ? { day: o.today, nav: H.map.get(H.last) } : { day: H.last, nav: H.map.get(H.last) };
  return DATES.map((d) => sip(H, d, monthsFor(H, d, o, cc), term, o));
}

// ---------- ranks / stats ----------
function avgRanks(vals) { // 1 = highest; exact-equality ties get the average rank
  const idx = vals.map((_, i) => i).sort((a, b) => vals[b] - vals[a] || a - b);
  const rk = new Array(vals.length);
  for (let i = 0; i < idx.length;) {
    let j = i; while (j + 1 < idx.length && vals[idx[j + 1]] === vals[idx[i]]) j++;
    for (let k = i; k <= j; k++) rk[idx[k]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return rk;
}
function pearson(a, b) {
  const n = a.length, ma = a.reduce((s, x) => s + x, 0) / n, mb = b.reduce((s, x) => s + x, 0) / n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
  return saa === 0 || sbb === 0 ? NaN : sab / Math.sqrt(saa * sbb);
}
const argmax = (a) => a.reduce((b, v, i) => (v > a[b] ? i : b), 0);
const argmin = (a) => a.reduce((b, v, i) => (v < a[b] ? i : b), 0);
const PCT = { p27: (r) => (28 - r) / 27 * 100, p28a: (r) => (29 - r) / 28 * 100, p28b: (r) => (28 - r) / 28 * 100 };

// ---------- rolling 3y windows (spec 5.4) ----------
function windowStarts(H, rule) {
  const out = [];
  for (let M = monthOf(H.first) - 1; M <= monthOf(H.last); M++) {
    const s = firstOf(M), e = firstOf(M + 36);
    const ok = rule === 'A' ? s >= H.first && e <= H.last : M >= monthOf(H.first) && e <= H.last; // 'C'
    if (ok) out.push(M);
  }
  return out;
}
function windowTerm(H, M, d, wTerm, look) {
  const e = firstOf(M + 36);
  switch (wTerm) {
    case 'onOrAfterEnd': return navOnOrAfter(H, e, look);
    case 'onOrBeforeEnd': return navOnOrBefore(H, e);
    case 'beforeEnd': return navOnOrBefore(H, e - 1);
    case 'lastInst': return navOnOrAfter(H, tgt(M + 35, d), look);
    case 'onOrAfterD36': return navOnOrAfter(H, tgt(M + 36, d), look) || navOnOrBefore(H, tgt(M + 36, d));
    case 'navTo': return { day: H.last, nav: H.map.get(H.last) };
    default: throw new Error(wTerm);
  }
}
// returns ranks per window so all percentile variants can be derived without re-simulating
function rollingRanks(H, o) {
  const starts = windowStarts(H, o.wStart);
  const ranks = [];
  let ties = 0, termMissing = 0, orderViolations = 0;
  for (const M of starts) {
    const months = Array.from({ length: 36 }, (_, k) => M + k);
    const xs = [];
    let skip = false;
    for (const d of DATES) {
      const term = windowTerm(H, M, d, o.wTerm, o.look);
      if (!term) { skip = true; termMissing++; break; }
      const lastInst = navOnOrAfter(H, tgt(M + 35, d), o.look);
      if (lastInst && lastInst.day > term.day) orderViolations++;
      xs.push(sip(H, d, months, term, o).xirr);
    }
    if (skip) continue;
    if (new Set(xs).size < 28) ties++;
    ranks.push({ M, rk: avgRanks(xs) });
  }
  return { starts: ranks.map((r) => r.M), ranks: ranks.map((r) => r.rk), ties, termMissing, orderViolations };
}
function rollingStats(RR, pctKey = 'p27') {
  const W = RR.ranks.length, f = PCT[pctKey];
  const meanPct = new Array(28).fill(0), topQ = new Array(28).fill(0), topQpct = new Array(28).fill(0), wins = new Array(28).fill(0);
  for (const rk of RR.ranks) rk.forEach((r, i) => { const p = f(r); meanPct[i] += p; if (r <= 7) topQ[i]++; if (p >= 75) topQpct[i]++; if (r === 1) wins[i]++; });
  return { W, meanPct: meanPct.map((s) => (W ? s / W : NaN)), topQ: topQ.map((c) => (W ? c / W : NaN)), topQpct: topQpct.map((c) => (W ? c / W : NaN)), wins };
}

// ---------- split-half (spec 5.4) ----------
function splitHalf(H, o) {
  const N = H.rows.length;
  let A, B;
  if (o.split === 'rowFloor' || o.split === 'rowCeil') {
    const h = o.split === 'rowFloor' ? Math.floor(N / 2) : Math.ceil(N / 2);
    A = hist(H.rows.slice(0, h)); B = hist(H.rows.slice(h));
  } else if (o.split === 'dayMid') {
    const mid = Math.floor((H.first + H.last) / 2);
    A = hist(H.rows.filter((r) => r.day < mid)); B = hist(H.rows.filter((r) => r.day >= mid));
  } else if (o.split === 'monthMid') {
    const b = firstOf(monthOf(Math.floor((H.first + H.last) / 2)));
    A = hist(H.rows.filter((r) => r.day < b)); B = hist(H.rows.filter((r) => r.day >= b));
  } else throw new Error(o.split);
  const xa = fullHistory(A, { ...o, monthSet: 'tir', term: 'navTo' }), xb = fullHistory(B, { ...o, monthSet: 'tir', term: 'navTo' });
  const va = xa.map((r) => r.xirr), vb = xb.map((r) => r.xirr);
  return { rho: pearson(avgRanks(va), avgRanks(vb)), cut: [iso(A.last), iso(B.first)], nA: [...new Set(xa.map((r) => r.n))], nB: [...new Set(xb.map((r) => r.n))], tiesA: new Set(va).size < 28, tiesB: new Set(vb).size < 28 };
}

function verdictOf(spreadPp, stability) {
  const s = Number.isFinite(stability) ? stability : -Infinity; // null stability can never be "> 0.60"
  if (spreadPp > 0.25 && s > 0.60) return 'meaningful';
  if (spreadPp > 0.25 || s > 0.60) return 'marginal';
  return 'noise';
}

// ---------- BEST convention, end to end ----------
const BEST = { look: 7, cfDate: 'nav', monthSet: 'tir', term: 'navTo', wStart: 'A', wTerm: 'onOrAfterEnd', pct: 'p27', split: 'rowFloor' };
function analyse(H, meta, o = BEST) {
  const full = fullHistory(H, o);
  const xs = full.map((r) => r.xirr * 100), cs = full.map((r) => r.corpus);
  const RR = rollingRanks(H, o); const RS = rollingStats(RR, o.pct);
  const SH = splitHalf(H, o);
  const spreadPp = Math.max(...xs) - Math.min(...xs), spreadRupees = Math.max(...cs) - Math.min(...cs);
  const stability = SH.rho;
  const json = {
    code: meta.scheme_code, name: meta.scheme_name, house: meta.fund_house, category: meta.scheme_category,
    navFrom: iso(H.first), navTo: iso(H.last), instalments: Math.min(...full.map((r) => r.n)),
    dates: full.map((r, i) => ({ d: r.d, xirr: r3(xs[i]), corpus: Math.round(cs[i]), meanPct: Number.isFinite(RS.meanPct[i]) ? r3(RS.meanPct[i]) : null, topQ: Number.isFinite(RS.topQ[i]) ? r3(RS.topQ[i]) : null })),
    spreadPp: r3(spreadPp), spreadRupees: Math.round(spreadRupees),
    stability: Number.isFinite(stability) ? r3(stability) : null,
    metricsAgree: argmax(xs) === argmax(cs),
    verdict: verdictOf(r3(spreadPp), Number.isFinite(stability) ? r3(stability) : NaN),
  };
  const safe = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const safeWinner = RS.W ? safe.slice().sort((a, b) => RS.meanPct[b - 1] - RS.meanPct[a - 1] || RS.topQ[b - 1] - RS.topQ[a - 1] || xs[b - 1] - xs[a - 1] || a - b)[0] : safe.slice().sort((a, b) => xs[b - 1] - xs[a - 1] || a - b)[0];
  return { full, xs, cs, RR, RS, SH, json, safeWinner, spreadPp, spreadRupees };
}

// ================= main =================
const raw = JSON.parse(fs.readFileSync(new URL('119775.json', HERE), 'utf8'));
const { H, dropped } = parse(raw, '2026-09-11');
console.log(`fixture rows=${H.rows.length} navFrom=${iso(H.first)} navTo=${iso(H.last)} droppedAfterCutoff=${dropped}`);
let maxGap = 0; for (let i = 1; i < H.rows.length; i++) maxGap = Math.max(maxGap, H.rows[i].day - H.rows[i - 1].day);
console.log('max calendar gap between NAV rows (days):', maxGap);

let t0 = performance.now();
const A = analyse(H, raw.meta);
const elapsed = performance.now() - t0;
const J = A.json;

console.log('\n=== BEST convention: 28-row table ===');
console.log(' d   xirr%     corpus    n  meanPct  topQ   wins');
A.full.forEach((r, i) => console.log(String(r.d).padStart(2), A.xs[i].toFixed(3).padStart(8), String(Math.round(A.cs[i])).padStart(10), String(r.n).padStart(4), A.RS.meanPct[i].toFixed(1).padStart(7), A.RS.topQ[i].toFixed(3).padStart(6), String(A.RS.wins[i]).padStart(4)));
const b = argmax(A.xs), w = argmin(A.xs);
console.log(`best d${b + 1} ${A.xs[b].toFixed(4)} worst d${w + 1} ${A.xs[w].toFixed(4)} spreadPp ${A.spreadPp.toFixed(5)} spreadRupees ${A.spreadRupees.toFixed(2)} maxCorpus d${argmax(A.cs) + 1} minCorpus d${argmin(A.cs) + 1}`);
console.log(`stability ${A.SH.rho.toFixed(4)} cut ${A.SH.cut.join('|')} nA ${A.SH.nA} nB ${A.SH.nB} metricsAgree ${J.metricsAgree} verdict ${J.verdict}`);
console.log(`windows W=${A.RS.W} first ${iso(firstOf(A.RR.starts[0]))} last ${iso(firstOf(A.RR.starts.at(-1)))} tiedWindows ${A.RR.ties} termMissing ${A.RR.termMissing} instAfterTerm ${A.RR.orderViolations}`);
console.log(`safe window 3..12 winner by meanPct: d${A.safeWinner}; topQ(rank<=7) == topQ(pct>=75)? ${A.RS.topQ.every((v, i) => v === A.RS.topQpct[i])}`);
const yrs = (H.last - H.first) / 365;
console.log(`copy: spread ${A.spreadRupees.toFixed(0)} on ${(J.instalments * AMT / 1e5).toFixed(1)} L; % of max corpus ${(100 * A.spreadRupees / Math.max(...A.cs)).toFixed(3)}; % of best-xirr corpus ${(100 * A.spreadRupees / A.cs[b]).toFixed(3)}; % of d1 corpus ${(100 * A.spreadRupees / A.cs[0]).toFixed(3)}; years/365 ${yrs.toFixed(3)} years/365.25 ${((H.last - H.first) / 365.25).toFixed(3)}`);
console.log(`analyse() wall time ${elapsed.toFixed(0)} ms`);

const T = { instalments: 164, navFrom: '2013-01-03', navTo: '2026-09-11', bestD: 26, bestX: 20.39, worstD: 9, worstX: 20.28, spreadPp: 0.114, d1x: 20.304, d1c: 7530112, d1mp: 44.2, d1tq: 0.21, spreadRupees: 123187, stability: 0.54, metricsAgree: false, verdict: 'noise' };
console.log('\n=== match table (BEST) ===');
const mt = [
  ['instalments', T.instalments, J.instalments, J.instalments === T.instalments],
  ['navFrom', T.navFrom, J.navFrom, J.navFrom === T.navFrom], ['navTo', T.navTo, J.navTo, J.navTo === T.navTo],
  ['best date', `${T.bestD} @~${T.bestX}`, `${b + 1} @${A.xs[b].toFixed(3)}`, b + 1 === 26 && A.xs[b].toFixed(2) === '20.39'],
  ['worst date', `${T.worstD} @~${T.worstX}`, `${w + 1} @${A.xs[w].toFixed(3)}`, w + 1 === 9 && A.xs[w].toFixed(2) === '20.28'],
  ['spreadPp', T.spreadPp, J.spreadPp, J.spreadPp === T.spreadPp], ['d1 xirr', T.d1x, J.dates[0].xirr, J.dates[0].xirr === T.d1x],
  ['d1 corpus', T.d1c, J.dates[0].corpus, J.dates[0].corpus === T.d1c], ['d1 meanPct', T.d1mp, r3(A.RS.meanPct[0]), A.RS.meanPct[0].toFixed(1) === '44.2'],
  ['d1 topQ', T.d1tq, J.dates[0].topQ, A.RS.topQ[0].toFixed(2) === '0.21'], ['spreadRupees', T.spreadRupees, J.spreadRupees, J.spreadRupees === T.spreadRupees],
  ['stability', T.stability, J.stability, A.SH.rho.toFixed(2) === '0.54'], ['metricsAgree', T.metricsAgree, J.metricsAgree, J.metricsAgree === T.metricsAgree],
  ['verdict', T.verdict, J.verdict, J.verdict === T.verdict],
];
for (const [k, t, v, ok] of mt) console.log(k.padEnd(14), String(t).padEnd(14), String(v).padEnd(16), ok ? 'MATCH' : 'differs');

// fund JSON + sizes
const out = JSON.stringify(J);
fs.writeFileSync(new URL('119775.fund.json', HERE), out);
const gz = zlib.gzipSync(Buffer.from(out), { level: 9 });
console.log(`\n119775.fund.json raw ${Buffer.byteLength(out)} B, gzip-9 ${gz.length} B`);
const J1 = { ...J, dates: J.dates.map((x) => ({ ...x, meanPct: Math.round(x.meanPct * 10) / 10, topQ: Math.round(x.topQ * 100) / 100 })) };
const s1 = JSON.stringify(J1);
console.log(`variant (meanPct 1dp, topQ 2dp) raw ${Buffer.byteLength(s1)} B gzip ${zlib.gzipSync(Buffer.from(s1), { level: 9 }).length} B`);
const J2 = { ...J, dates: J.dates.map((x, i) => ({ ...x, n: A.full[i].n })) };
const s2 = JSON.stringify(J2);
console.log(`variant (+ per-date n) raw ${Buffer.byteLength(s2)} B gzip ${zlib.gzipSync(Buffer.from(s2), { level: 9 }).length} B`);
console.log(`pretty-printed (2 spaces) raw ${Buffer.byteLength(JSON.stringify(J, null, 2))} B`);

if (!QUICK) {
  // ---------- sensitivity: full history ----------
  console.log('\n=== sensitivity: full history (monthSet/cfDate/look/term) ===');
  for (const monthSet of ['tir', 'perDate', 'common', 'commonTIR'])
    for (const cfDate of ['nav', 'target'])
      for (const look of [7, 6])
        for (const term of ['navTo', 'today']) {
          const R = fullHistory(H, { monthSet, cfDate, look, term, today: dayOf(2026, 9, 15) });
          const x = R.map((r) => r.xirr * 100), c = R.map((r) => r.corpus);
          const bb = argmax(x), ww = argmin(x);
          console.log(`${monthSet}/${cfDate}/${look}/${term}`.padEnd(26), `best d${bb + 1} ${x[bb].toFixed(3)} worst d${ww + 1} ${x[ww].toFixed(3)} sp ${(x[bb] - x[ww]).toFixed(4)} d1 ${x[0].toFixed(3)} ${Math.round(c[0])} spR ${Math.round(Math.max(...c) - Math.min(...c))} maxC d${argmax(c) + 1} agree ${argmax(c) === bb} n ${[...new Set(R.map((r) => r.n))].join('/')}`);
        }
  // ---------- sensitivity: rolling ----------
  console.log('\n=== sensitivity: rolling (wStart/wTerm/cfDate) x percentile ===');
  for (const wStart of ['A', 'C'])
    for (const wTerm of ['onOrAfterEnd', 'onOrBeforeEnd', 'beforeEnd', 'lastInst', 'onOrAfterD36', 'navTo'])
      for (const cfDate of ['nav', 'target']) {
        const RR = rollingRanks(H, { look: 7, cfDate, wStart, wTerm });
        const parts = Object.keys(PCT).map((pk) => { const s = rollingStats(RR, pk); const sw = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12].sort((a, c) => s.meanPct[c - 1] - s.meanPct[a - 1])[0]; return `${pk} mp1 ${s.meanPct[0].toFixed(2)} tq1 ${s.topQ[0].toFixed(3)}/${s.topQpct[0].toFixed(3)} safe d${sw}`; });
        console.log(`${wStart}/${wTerm}/${cfDate}`.padEnd(26), `W ${RR.ranks.length} instAfterTerm ${RR.orderViolations} |`, parts.join(' | '));
      }
  // ---------- sensitivity: split ----------
  console.log('\n=== sensitivity: split-half ===');
  for (const split of ['rowFloor', 'rowCeil', 'dayMid', 'monthMid'])
    for (const cfDate of ['nav', 'target']) {
      const s = splitHalf(H, { look: 7, cfDate, split });
      console.log(`${split}/${cfDate}`.padEnd(18), `rho ${s.rho.toFixed(4)} cut ${s.cut.join('|')} nA ${s.nA} nB ${s.nB} verdict ${verdictOf(r3(A.spreadPp), r3(s.rho))}`);
    }
}

// ---------- short history ----------
console.log('\n=== short history (truncate to last K months: rows with date >= navTo shifted back K calendar months, same day-of-month) ===');
for (const K of [40, 38, 37, 36, 35]) {
  const [y, m, d] = iso(H.last).split('-').map(Number);
  const mi = y * 12 + (m - 1) - K;
  const from = dayOf(Math.floor(mi / 12), (mi % 12) + 1, d);
  const Hs = hist(H.rows.filter((r) => r.day >= from));
  try {
    const S = analyse(Hs, raw.meta);
    const js = S.json;
    const bb = argmax(S.xs), ww = argmin(S.xs);
    console.log(`K=${K} rows ${Hs.rows.length} ${js.navFrom}..${js.navTo} inst ${js.instalments} W=${S.RS.W}${S.RS.W ? ` (${iso(firstOf(S.RR.starts[0]))}..${iso(firstOf(S.RR.starts.at(-1)))})` : ''} tiedWindows ${S.RR.ties} best d${bb + 1} ${S.xs[bb].toFixed(3)} worst d${ww + 1} ${S.xs[ww].toFixed(3)} spreadPp ${js.spreadPp} spreadRupees ${js.spreadRupees} stability ${js.stability} (halves n ${S.SH.nA}|${S.SH.nB}, ties ${S.SH.tiesA}/${S.SH.tiesB}) agree ${js.metricsAgree} verdict ${js.verdict} safeWinner d${S.safeWinner} meanPct null? ${js.dates.some((x) => x.meanPct === null)} distinct meanPct values ${new Set(js.dates.map((x) => x.meanPct)).size} topQ values ${[...new Set(js.dates.map((x) => x.topQ))].sort().join(',')}`);
    if (K === 40) {
      console.log(' d  xirr   meanPct topQ wins');
      S.full.forEach((r, i) => console.log(String(r.d).padStart(2), S.xs[i].toFixed(3), S.RS.meanPct[i].toFixed(1), S.RS.topQ[i].toFixed(3), S.RS.wins[i]));
    }
  } catch (e) { console.log(`K=${K} CRASH ${e.message}`); }
}
