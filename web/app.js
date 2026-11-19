'use strict';
/* Own-your-data marketing dashboard. Static: reads window.DATA (export.py), draws with ECharts. */

// ---------- data ----------
const RAW = window.DATA;
const decode = ({ cols, dicts, rows }) =>
  rows.map(r => Object.fromEntries(cols.map((c, j) => [c, dicts[c] ? dicts[c][r[j]] : r[j]])));
const T = {}, IDX = {};
for (const k of ['ads', 'creatives', 'sessions', 'leads', 'orders', 'gsc', 'sos', 'costs', 'ai', 'lh', 'geo', 'creators', 'content', 'quotes', 'partners', 'ugc', 'emails', 'flows', 'exp', 'cohorts', 'retention']) T[k] = decode(RAW[k]);
for (const k of ['ads', 'creatives', 'sessions', 'leads', 'orders', 'gsc', 'costs']) {
  IDX[k] = new Map();
  for (const r of T[k]) (IDX[k].get(r.d) || IDX[k].set(r.d, []).get(r.d)).push(r);
}
const TG = RAW.targets, [MIN, MAX] = RAW.range;

// ---------- dates ----------
const dt = s => new Date(s + 'T00:00:00Z');
const iso = d => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = dt(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const nDays = (a, b) => Math.round((dt(b) - dt(a)) / 864e5) + 1;
const fmtD = s => dt(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const fmtR = r => r ? `${fmtD(r[0])} – ${fmtD(r[1])}` : '';
function bucket(s) {
  if (S.grain === 'day') return s;
  if (S.grain === 'month') return s.slice(0, 7);
  const d = dt(s); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return iso(d);
}
function buckets([a, b]) { const out = []; for (let s = a; s <= b; s = addDays(s, 1)) { const k = bucket(s); if (out[out.length - 1] !== k) out.push(k); } return out; }

// ---------- state ----------
const S = { preset: '30', from: addDays(MAX, -29), to: MAX, grain: 'day', compare: 'prev',
  channel: 'all', type: 'all', product: 'all', campaign: 'all', seq: 'all', renewals: true };
const R = () => [S.from, S.to];
function prevRange() {
  if (S.compare === 'off') return null;
  const r = S.compare === 'year' ? [addDays(S.from, -364), addDays(S.to, -364)]
    : [addDays(S.from, -nDays(S.from, S.to)), addDays(S.from, -1)];
  return r[0] < MIN ? null : r;  // no data that far back
}

// ---------- helpers ----------
function rows(t, [a, b], f) {
  const out = [];
  for (let s = a; s <= b; s = addDays(s, 1)) for (const x of IDX[t].get(s) || []) if (!f || f(x)) out.push(x);
  return out;
}
const sum = (a, f) => a.reduce((s, x) => s + (typeof f === 'string' ? x[f] : f(x)), 0);
const div = (a, b) => b ? a / b : null;
const groupBy = (a, f) => a.reduce((m, x) => { const k = f(x); (m[k] = m[k] || []).push(x); return m; }, {});
const chMatch = x => S.channel === 'all' || x.ch === (S.channel === 'unattributed' ? '' : S.channel);
const ordF = x => chMatch(x) && (S.type === 'all' || (S.type === 'renewal') === !!x.ren) && (S.product === 'all' || x.prod === S.product);
const PAID = ['google_ads', 'meta'];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const eur = (v, d = 0) => v == null || !isFinite(v) ? '–' : (v < 0 ? '−€' : '€') + Math.abs(v).toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d });
const eurK = v => Math.abs(v) >= 1000 ? '€' + (v / 1000).toFixed(Math.abs(v) >= 1e5 ? 0 : 1) + 'k' : '€' + Math.round(v);
const num = v => v == null || !isFinite(v) ? '–' : Math.round(v).toLocaleString('en-GB');
const pct = (v, d = 1) => v == null || !isFinite(v) ? '–' : (v * 100).toFixed(d) + '%';
const xx = v => v == null || !isFinite(v) ? '–' : v.toFixed(2) + '×';

// ---------- colours (fixed per entity, never by rank) ----------
const css = getComputedStyle(document.documentElement), V = n => css.getPropertyValue(n).trim();
const PAL = [1, 2, 3, 4, 5, 6, 7, 8].map(i => V('--s' + i));
const CH = { google_ads: ['Google Ads', PAL[0]], meta: ['Meta Ads', PAL[1]], organic_search: ['Organic search', PAL[2]],
  email: ['Email', PAL[3]], creators: ['Creators', PAL[4]], direct: ['Direct', PAL[5]], referral: ['Referral', PAL[6]],
  ai_search: ['AI search', PAL[7]], '': ['Unattributed', V('--unk')] };
const CH_ORDER = Object.keys(CH);
const CAMPS = [...new Set(T.ads.map(a => a.platform + '|' + a.campaign))].map(k => k.split('|'));
const LEADGEN = new Set(T.ads.filter(a => a.funnel === 'lead').map(a => a.campaign));
const BRAND = c => /brand/i.test(c);
const campColor = c => PAL[CAMPS.findIndex(x => x[1] === c) % 8];

// ---------- metrics ----------
function cost(r, ch = S.channel) {
  const ads = sum(rows('ads', r, x => ch === 'all' || x.platform === ch), 'cost');
  const cr = ch === 'all' || ch === 'creators' ? sum(rows('costs', r, x => x.cat === 'creators'), 'amount') : 0;
  const tools = sum(rows('costs', r, x => (ch === 'all' && x.cat === 'agency_tools') || ((ch === 'all' || ch === 'email') && x.cat === 'email')), 'amount');
  return { ads, cr, tools, total: ads + cr + tools };
}
function coverage(r) {
  const o = rows('orders', r, x => !x.ren);
  return div(sum(o.filter(x => x.ch !== ''), 'n'), sum(o, 'n')) || 1;
}
function M(r) {
  if (!r) return null;
  const o = rows('orders', r, ordF), nw = o.filter(x => !x.ren), c = cost(r);
  const L = rows('leads', r, chMatch), paidL = rows('leads', r, x => PAID.includes(x.ch) && LEADGEN.has(x.camp));
  const lgCost = sum(rows('ads', r, x => x.funnel === 'lead'), 'cost');
  const rev = sum(o, 'rev'), n = sum(o, 'n'), newRev = sum(nw, 'rev'), newN = sum(nw, 'n');
  const unkN = sum(nw.filter(x => x.ch === ''), 'n');
  return { rev, n, newRev, newN, renRev: rev - newRev, cost: c, contrib: rev - c.total, contribNew: newRev - c.total,
    mer: div(rev, c.total), merNew: div(newRev, c.total), ncac: div(c.total, newN), aov: div(rev, n), perDay: rev / nDays(...r),
    leads: sum(L, 'n'), paidLeads: sum(paidL, 'n'), cpl: div(lgCost, sum(paidL, 'n')),
    qual: div(sum(L.filter(x => x.q), 'n'), sum(L, 'n')), attributed: div(newN - unkN, newN), unkRev: sum(nw.filter(x => x.ch === ''), 'rev'),
    leadsKnown: div(sum(L.filter(x => x.ch !== ''), 'n'), sum(L, 'n')) };
}
/** One definition of 'matched revenue' everywhere: what this period's leads from the source bought (lead-dated)
 *  + new purchases in the period with no lead before (sale-dated). */
function camp(pl, cp, r, lag = 0) {
  if (lag) r = [addDays(r[0], -lag), addDays(r[1], -lag)];  // matured cohorts: leads had time to buy
  const a = rows('ads', r, x => x.platform === pl && (!cp || x.campaign === cp));
  const L = rows('leads', r, x => x.ch === pl && (!cp || x.camp === cp));
  const dir = rows('orders', r, x => !x.ren && !x.via && x.ch === pl && (!cp || x.camp === cp));
  const s = { imp: sum(a, 'imp'), clicks: sum(a, 'clicks'), cost: sum(a, 'cost'), pconv: sum(a, 'pconv'), prev: sum(a, 'prev'),
    leads: sum(L, 'n'), q: sum(L.filter(x => x.q), 'n'), conv: sum(L, 'conv'), leadRev: sum(L, 'rev'),
    qConv: sum(L.filter(x => x.q), 'conv'), dirN: sum(dir, 'n'), dirRev: sum(dir, 'rev') };
  s.rev = s.leadRev + s.dirRev; s.sales = s.conv + s.dirN;
  s.floor = div(s.rev, s.cost); s.ceiling = div(s.prev, s.cost);
  return s;
}

// per-viewer memory (completed actions). Browser storage can be blocked: never fail on it.
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { } },
};
const ICON = {  // Lucide (ISC licence)
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/></svg>',
};
const L_ = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
Object.assign(ICON, {  // Lucide (ISC) for channels without a brand logo
  mail: L_('<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>'),
  rss: L_('<path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/>'),
  briefcase: L_('<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>'),
  school: L_('<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>'),
  phone: L_('<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>'),
  users: L_('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
  mic: L_('<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>'),
  lock: L_('<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'),
  ext: L_('<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3"/>'),
  play: L_('<polygon points="6 3 20 12 6 21 6 3"/>'),
  heart: L_('<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>'),
  chat: L_('<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>'),
  euro: L_('<path d="M4 10h12"/><path d="M4 14h9"/><path d="M19 6a7.7 7.7 0 0 0-5.2-2A7.9 7.9 0 0 0 6 12c0 4.4 3.5 8 7.8 8 2 0 3.8-.8 5.2-2"/>'),
  scale: L_('<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>'),
  tagi: L_('<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r="1"/>'),
  userplus: L_('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/>'),
  target: L_('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>'),
  route: L_('<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>'),
  search: L_('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>'),
  store: L_('<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M2 7h20"/>'),
});
// creator platforms: brand-like colour + logo (svgl) or Lucide icon
const PLAT = { instagram: ['Instagram', PAL[4], 'instagram-icon'], tiktok: ['TikTok', '#17120F', 'tiktok-icon-light'], youtube: ['YouTube', PAL[7], 'youtube'],
  facebook: ['Facebook', PAL[0], 'facebook-icon'], newsletter: ['Newsletter', PAL[3], null, 'mail'], blog: ['Blog', PAL[2], null, 'rss'], partner: ['Partnerships', PAL[6], null, 'briefcase'] };
const KIND_ICON = { 'Newsletter swap': 'mail', 'Brand collab': 'briefcase', 'School network': 'school', 'App cross-promo': 'phone', Community: 'users', Podcast: 'mic', Retail: 'store' };
const platKey = c => c.type === 'partner' ? 'partner' : c.platform;
function pIcon(k, h = 16) {  // k = platform key or partnership kind
  const P = PLAT[k], ic = KIND_ICON[k] || P?.[3];
  if (P?.[2]) return `<img class="pi" src="vendor/logos/${P[2]}.svg" alt="${P[0]}" title="${P[0]}" style="height:${h}px;width:${h}px">`;
  return ic ? `<span class="pi pi-ic" title="${esc(P?.[0] || k)}" style="width:${h}px;height:${h}px">${ICON[ic]}</span>` : '';
}
const LOGO = { google_ads: 'google', meta: 'meta', 'ChatGPT': 'openai', 'Perplexity': 'perplexity', 'Gemini': 'gemini', 'Claude': 'claude-ai-icon', 'Google AI Overviews': 'google', ga4: 'google-analytics' };
const logo = (k, h = 18) => LOGO[k] ? `<img class="logo-i" src="vendor/logos/${LOGO[k]}.svg" alt="" style="height:${h}px">` : '';
function icCard(i) {
  const done = store.get('done:' + i.id);
  return `<div class="ic-card ${done ? 'done' : ''}" style="border-left-color:${i.color};background:color-mix(in srgb, ${i.color} 7%, #fff)">
    <div class="hd"><span class="tag">${i.tag}</span><span class="impact">${i.impactLbl}</span></div>
    <h4>${i.title}</h4><dl><dt>Why</dt><dd>${i.why}</dd><dt>Action</dt><dd>${i.action}</dd></dl>
    <div class="ft"><span class="owner">${i.owner}</span>
      <label class="tick ${done ? 'on' : ''}"><input type="checkbox" data-done="${esc(i.id)}" ${done ? 'checked' : ''}><span>${done ? 'Completed · ' + fmtD(done) : 'To do'}</span></label></div></div>`;
}

// ---------- components ----------
let uid = 0, queue = [];
const charts = [];
function chart(opt, h = 260, onClick) { const id = 'c' + (++uid); queue.push([id, opt, onClick]); return `<div class="chart" id="${id}" style="height:${h}px"></div>`; }
function flush() {
  charts.splice(0).forEach(c => c.dispose());
  for (const [id, opt, cb] of queue.splice(0)) {
    const el = document.getElementById(id); if (!el) continue;
    const c = echarts.init(el, null, { renderer: 'svg' }); c.setOption(opt); if (cb) c.on('click', cb); charts.push(c);
  }
  document.querySelectorAll('.tbl').forEach(paginate);
}
addEventListener('resize', () => charts.forEach(c => c.resize()));

function deltaHtml(cur, prev, better = 'up') {
  if (cur == null || prev == null || !prev) return '';
  const ch = (cur - prev) / Math.abs(prev), cls = Math.abs(ch) < .005 ? 'flat' : (ch > 0) === (better === 'up') ? 'up' : 'down';
  return `<span class="delta ${cls}">${ch > 0 ? '▲' : ch < 0 ? '▼' : ''} ${Math.abs(ch * 100).toFixed(1)}%</span>`;
}
function statusHtml(cur, target, better, fmt) {
  if (target == null || cur == null) return '';
  const ok = better === 'up' ? cur >= target : cur <= target;
  return `<span class="status ${ok ? 'ok' : 'no'}"><span class="ic">${ok ? '✓' : '!'}</span>${ok ? 'On target' : 'Off target'} · ${fmt(target)}</span>`;
}
function spark(vals, color = PAL[0]) {
  return chart({ grid: { left: 0, right: 0, top: 2, bottom: 2 }, xAxis: { type: 'category', show: false, data: vals.map((_, i) => i) },
    yAxis: { type: 'value', show: false, min: 'dataMin' }, tooltip: { show: false },
    series: [{ type: 'line', data: vals, showSymbol: false, smooth: .3, lineStyle: { width: 2, color }, areaStyle: { color, opacity: .08 } }] }, 34);
}
function kpi({ lbl, val, cur, prev, better = 'up', fmt = num, target, meta = '', sp, ic }) {  // label → value + change → target
  return `<div class="card kpi">${ic ? `<span class="kic">${ICON[ic]}</span>` : ''}<div class="lbl">${lbl}</div><div class="val"><span>${val ?? fmt(cur)}</span>${deltaHtml(cur, prev, better)}</div>
    <div class="row">${statusHtml(cur, target, better, fmt)}</div>
    ${meta ? `<div class="meta">${meta}</div>` : ''}${sp ? `<div class="spark">${spark(sp)}</div>` : ''}</div>`;
}
const PER = 10;  // rows per table page
/** Show one page of a long table, after the search filter. Sorting reorders rows, then this re-slices them. */
function paginate(el) {
  const rows = [...el.querySelector('tbody').rows], q = (el.dataset.q || '').toLowerCase();
  const hit = rows.filter(r => !q || r.textContent.toLowerCase().includes(q)), n = Math.max(1, Math.ceil(hit.length / PER));
  const p = Math.min(+el.dataset.p || 0, n - 1); el.dataset.p = p;
  rows.forEach(r => r.hidden = true); hit.slice(p * PER, p * PER + PER).forEach(r => r.hidden = false);
  el.querySelector('.tcount').textContent = hit.length ? `${p * PER + 1}–${Math.min(hit.length, p * PER + PER)} of ${hit.length}${q ? ' matching' : ''}` : 'No rows match';
  const nums = [...Array(n).keys()].filter(i => i < 1 || i >= n - 1 || Math.abs(i - p) <= 1);
  const btn = (i, l, dis) => `<button data-p="${i}" ${dis ? 'disabled' : ''} class="${i === p && l == null ? 'on' : ''}">${l ?? i + 1}</button>`;
  el.querySelector('.tpg').innerHTML = n < 2 ? '' : btn(p - 1, '← Previous', p === 0) +
    `<span>${nums.map((i, k) => (k && i - nums[k - 1] > 1 ? '<i>…</i>' : '') + btn(i)).join('')}</span>` + btn(p + 1, 'Next →', p === n - 1);
}
document.addEventListener('input', e => { const t = e.target.closest('[data-tsearch]'); if (!t) return; const el = t.closest('.tbl'); el.dataset.q = t.value; el.dataset.p = 0; paginate(el); });
document.addEventListener('click', e => { const b = e.target.closest('.tpg button'); if (!b) return; const el = b.closest('.tbl'); el.dataset.p = b.dataset.p; paginate(el); });
function table(cols, data, foot) {
  const td = (c, r) => {
    const v = r[c.k], cls = c.cls ? c.cls(r) || '' : '';
    const txt = c.f ? c.f(v, r) : esc(v ?? '–'), sv = typeof v === 'number' ? v : '';
    if (c.bar && typeof v === 'number') return `<td class="bar-cell ${cls}" data-v="${sv}"><i style="width:${Math.min(100, v / c.bar * 100)}%"></i><span>${txt}</span></td>`;
    return `<td class="${cls} ${c.al || ''}" data-v="${sv}">${txt}</td>`;
  };
  const pg = data.length > 15;  // short tables stay whole
  return `${pg ? `<div class="tbl" data-p="0"><div class="tbar"><span class="tcount"></span><label class="tsearch">${ICON.search}<input type="search" placeholder="Search" aria-label="Search this table" data-tsearch></label></div>` : ''}<div class="tw"><table><thead><tr>${cols.map((c, i) => `<th data-i="${i}" class="${c.al || ''}">${c.l}</th>`).join('')}</tr></thead>
    <tbody>${data.map(r => `<tr>${cols.map(c => td(c, r)).join('')}</tr>`).join('')}</tbody>
    ${foot ? `<tfoot><tr>${cols.map(c => `<td><b>${c.f && foot[c.k] != null ? c.f(foot[c.k], foot) : esc(foot[c.k] ?? '')}</b></td>`).join('')}</tr></tfoot>` : ''}</table></div>${pg ? '<nav class="tpg"></nav></div>' : ''}`;
}
document.addEventListener('click', e => {  // sortable tables
  const th = e.target.closest('th[data-i]'); if (!th) return;
  const tb = th.closest('table').tBodies[0], i = +th.dataset.i, dir = th.dataset.dir === 'd' ? 'a' : 'd'; th.dataset.dir = dir;
  [...tb.rows].sort((a, b) => {
    const x = a.cells[i].dataset.v, y = b.cells[i].dataset.v;
    const c = x !== '' && y !== '' ? (+x) - (+y) : a.cells[i].textContent.localeCompare(b.cells[i].textContent);
    return dir === 'd' ? -c : c;
  }).forEach(r => tb.appendChild(r));
  const el = th.closest('.tbl'); if (el) { el.dataset.p = 0; paginate(el); }
});
const sw = c => `<span class="sw" style="background:${c}"></span>`;
const chName = ch => `${sw(CH[ch][1])}${CH[ch][0]}`;
const card = (title, body, note = '', right = '') => `<div class="card"><h3>${title}${right}</h3>${body}${note ? `<div class="note">${note}</div>` : ''}</div>`;
function openDrawer(html) { const d = document.getElementById('drawer'); d.innerHTML = `<button class="x" onclick="this.parentNode.classList.remove('open')">✕</button>${html}`; d.classList.add('open'); }

// ECharts base: recessive axes, one y-axis only, legend always for 2+ series
const yFmt = { eur: eurK, num: v => v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v, pct: v => (v * 100).toFixed(0) + '%', pct1: v => (v * 100).toFixed(1) + '%', x: v => v.toFixed(1) + '×' };
function xy({ x, series, y = 'num', h = 260, stack, onClick, legend = series.length > 1, tip, ymin }) {
  return chart({
    textStyle: { fontFamily: 'Inter Tight' }, animationDuration: 300,
    grid: { left: 6, right: 14, top: 18, bottom: legend ? 44 : 10, containLabel: true },
    tooltip: { trigger: 'axis', backgroundColor: '#fff', borderColor: '#E4E4E4', textStyle: { color: '#17120F', fontSize: 12 },
      axisPointer: { type: 'line', lineStyle: { color: '#c3c2b7' } }, valueFormatter: tip || ({ eur: v => eur(v), num, pct: v => pct(v), x: xx })[y] },
    legend: legend ? { bottom: 0, icon: 'roundRect', itemWidth: 10, itemHeight: 10, textStyle: { color: '#4a4a4a' } } : { show: false },
    xAxis: { type: 'category', data: x, axisLine: { lineStyle: { color: '#c3c2b7' } }, axisTick: { show: false }, axisLabel: { color: '#6B6B6B', hideOverlap: true } },
    yAxis: { type: 'value', min: ymin, splitNumber: h < 170 ? 2 : 5, splitLine: { lineStyle: { color: '#ecebe6' } }, axisLabel: { color: '#6B6B6B', formatter: yFmt[y] } },
    series: series.map(s => s.type === 'line'
      ? { showSymbol: false, smooth: .25, symbolSize: 8, lineStyle: { width: 2 }, ...s, itemStyle: { color: s.color } }
      : { type: 'bar', stack, barMaxWidth: 26, ...s, itemStyle: { color: s.color, borderRadius: stack ? 0 : [4, 4, 0, 0], borderColor: V('--card'), borderWidth: stack ? 1 : 0 } }),
  }, h, onClick);
}
const byBucket = (arr, val, r) => { const m = {}; for (const x of arr) { const k = bucket(x.d); m[k] = (m[k] || 0) + val(x); } return buckets(r).map(k => m[k] || 0); };

// ---------- navigation ----------
const MENU = [
  ['Brief', 'brief'],
  ['Acquisition', [['Overview', 'acq/overview'], ['Google Ads', 'acq/google'], ['Meta Ads', 'acq/meta'], ['SEO & GEO', 'acq/seo']]],
  ['Creators', [['Overview', 'cr/overview'], ['Paid influencers', 'cr/paid'], ['Affiliates', 'cr/affiliates'], ['UGC', 'cr/ugc'], ['Ambassadors', 'cr/ambassadors'], ['Partnerships', 'cr/partners'], ['Content calendar', 'cr/calendar']]],
  ['Analyses', [['Channel funnel', 'an/funnel'], ['Landing pages', 'an/pages'], ['Email', 'an/email'], ['Lead cohorts', 'an/cohorts'], ['Products', 'an/products']]],
  ['Trust', [['Data health', 'tr/health'], ['Experiments', 'tr/experiments'], ['Definitions', 'tr/definitions']]],
];
const LOCKED = new Set(['cr/ugc', 'cr/ambassadors', 'an/pages', 'an/cohorts', 'an/products']);  // demo: not part of the public version
const route = () => (location.hash.slice(2) || 'brief');
function renderMenu() {
  const cur = route();
  document.getElementById('menu').innerHTML = MENU.map(([name, sub, soon], i) => {
    if (typeof sub === 'string') return `<div class="mi ${cur === sub ? 'active' : ''}"><button onclick="location.hash='#/${sub}'">${name}</button></div>`;
    const act = sub.some(s => s[1] === cur);
    return `<div class="mi ${act ? 'active' : ''}" data-m="${i}"><button>${name}<span class="caret">▾</span></button><div class="dd">${sub.map(([n, r]) =>
      LOCKED.has(r) ? `<a class="soon" title="Locked in the demo">${n}<i class="lk">${ICON.lock}</i></a>` : r ? `<a href="#/${r}" class="${r === cur ? 'on' : ''}">${n}</a>` : `<a class="soon">${n}<i>${soon}</i></a>`).join('')}</div></div>`;
  }).join('');
}
document.addEventListener('click', e => {
  const mi = e.target.closest('.mi[data-m]');
  document.querySelectorAll('.mi.open').forEach(m => m !== mi && m.classList.remove('open'));
  if (mi && e.target.closest('button')) {
    mi.classList.toggle('open');
    const dd = mi.querySelector('.dd'), rc = mi.getBoundingClientRect();  // fixed: the scrollable menu bar must not clip it
    Object.assign(dd.style, { position: 'fixed', top: rc.bottom + 8 + 'px', left: Math.max(12, Math.min(rc.left, innerWidth - 240)) + 'px' });
  }
  if (e.target.closest('.dd a')) mi && mi.classList.remove('open');
});

// ---------- filter bar ----------
const PRESETS = [['7', '7 days'], ['30', '30 days'], ['90', '90 days'], ['365', '12 months'], ['custom', 'Custom']];
function applyPreset(p) {
  S.preset = p; if (p === 'custom') return;
  S.to = MAX; S.from = addDays(MAX, -(+p - 1));
  S.grain = p === '365' ? 'month' : p === '90' ? 'week' : 'day';
}
function renderFilters(show) {
  const seg = (k, opts) => `<div class="seg">${opts.map(([v, l]) => `<button class="${S[k] === v ? 'on' : ''}" data-k="${k}" data-v="${v}">${l}</button>`).join('')}</div>`;
  const sel = (k, opts) => `<select data-k="${k}">${opts.map(([v, l]) => `<option value="${v}" ${S[k] === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  const f = (l, h) => `<div class="f"><label>${l}</label>${h}</div>`;
  let h = f('Period', seg('preset', PRESETS)) + (S.preset !== 'custom' ? '' :  // dates only when they can be edited
    f('From', `<input type="date" data-k="from" value="${S.from}" min="${MIN}" max="${MAX}">`) +
    f('To', `<input type="date" data-k="to" value="${S.to}" min="${MIN}" max="${MAX}">`)) +
    f('Group charts by', seg('grain', [['day', 'Day'], ['week', 'Week'], ['month', 'Month']])) +
    f('Compare', seg('compare', [['off', 'Off'], ['prev', 'Previous period'], ['year', 'Last year']]));
  if (show.includes('channel')) h += f('Channel', sel('channel', [['all', 'All channels'], ...CH_ORDER.map(c => [c || 'unattributed', CH[c][0]])]));
  if (show.includes('type')) h += f('Type', seg('type', [['all', 'All'], ['new', 'New'], ['renewal', 'Renewals']]));
  if (show.includes('product')) h += f('Product', sel('product', [['all', 'All products'], ...[...new Set(T.orders.map(o => o.prod))].sort().map(p => [p, p])]));
  h += `<button class="clear" data-clear>Clear filters</button>`;
  const el = document.getElementById('filters'); el.innerHTML = h;
}
document.getElementById('filters').addEventListener('change', e => {
  const k = e.target.dataset.k; if (!k) return;
  if (k === 'preset') applyPreset(e.target.value); else { S[k] = e.target.value; if (k === 'from' || k === 'to') S.preset = 'custom'; }
  if (S.from > S.to) [S.from, S.to] = [S.to, S.from];
  render();
});
document.getElementById('filters').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.clear !== undefined) { Object.assign(S, { channel: 'all', type: 'all', product: 'all', compare: 'prev', grain: 'day' }); applyPreset('30'); }
  else if (b.dataset.k === 'preset') applyPreset(b.dataset.v);
  else if (b.dataset.k) S[b.dataset.k] = b.dataset.v;
  render();
});

// SEO quick wins: page-1/2 non-brand queries, valued at THEIR page's revenue per organic click
function seoWins(r) {
  const g = rows('gsc', r), org = rows('orders', r, x => !x.ren && x.ch === 'organic_search');
  const rpc = {};
  for (const [pg, a] of Object.entries(groupBy(g, x => x.page))) rpc[pg] = div(sum(org.filter(o => o.page === pg), 'rev'), sum(a, 'clicks')) || 0;
  return Object.entries(groupBy(g.filter(x => !x.b), x => x.q)).map(([q, a]) => {
    const imp = sum(a, 'imp'), clicks = sum(a, 'clicks'), ctr = div(clicks, imp), pos = div(sum(a, x => x.pos * x.imp), imp);
    const extra = Math.max(0, imp * (.10 - ctr)), page = a[0].page;
    return { q, page, imp, clicks, ctr, pos, extra, rpc: rpc[page], eur: extra * rpc[page] };
  }).filter(x => x.pos >= 4 && x.pos <= 15).sort((a, b) => b.eur - a.eur);
}
// ---------- insight engine (Kaushik: Insight → Action → Business impact) ----------
function insights(r) {
  const out = [], cov = coverage(r);
  const all = CAMPS.map(([pl, c]) => ({ pl, c, ...camp(pl, c, r, 14) })).filter(s => s.cost > 0);
  for (const pl of PAID) {
    const s = camp(pl, null, r, 14), est = div(s.floor, cov), tg = TG['roas_' + pl];
    if (est == null || est >= tg) continue;
    const mine = all.filter(x => x.pl === pl).sort((a, b) => a.floor - b.floor), worst = mine[0];
    const best = all.filter(x => !BRAND(x.c)).sort((a, b) => b.floor - a.floor)[0];  // brand search can't absorb budget
    if (!worst) continue;
    const shift = .3 * worst.cost, move = best && best.c !== worst.c && best.floor / cov >= Math.max(tg, TG['roas_' + best.pl]);  // only move money to a campaign that beats the target
    const impact = move ? shift * (best.floor - worst.floor) / cov : shift * (1 - worst.floor / cov);
    out.push({ id: 'roas-' + pl, tag: CH[pl][0], color: CH[pl][1], impact,
      title: `${CH[pl][0]} returns ${xx(est)} per €1 spent. Target is ${xx(tg)}.`,
      why: `${esc(worst.c)} spent ${eur(worst.cost)} at ${xx(worst.floor)} matched ROAS, the weakest campaign on ${CH[pl][0]}. Measured on leads at least 14 days old, so lead-gen campaigns get time to convert.`,
      action: move ? `Move 30% of its budget (${eur(shift)}) to ${esc(best.c)} (${xx(best.floor / cov)} estimate, above target). Re-check in 2 weeks.`
        : `No campaign beats ${xx(tg)} right now. Cut 30% of its budget (${eur(shift)}), keep the money, and test a new offer or audience first.`,
      impactLbl: move ? `≈ +${eur(impact)} revenue` : `≈ +${eur(impact)} contribution`, owner: 'Paid media lead · weekly' });
  }
  // creative fatigue (Meta): CTR now vs the creative's own first 14 days
  const metaSpend = sum(rows('creatives', r), 'cost');
  const byCr = groupBy(T.creatives, x => x.creative);
  for (const [cr, all_] of Object.entries(byCr)) {
    const first = all_.slice(0, 14), last = all_.filter(x => x.d <= r[1]).slice(-14);
    const inR = rows('creatives', r, x => x.creative === cr), sp = sum(inR, 'cost');
    if (!last.length || sp < metaSpend * .08) continue;
    const c0 = div(sum(first, 'clicks'), sum(first, 'imp')), c1 = div(sum(last, 'clicks'), sum(last, 'imp')), ratio = c1 / c0;
    if (ratio > .7) continue;
    const impact = sp * (1 - ratio) * .5;
    out.push({ id: 'fatigue-' + cr, tag: 'Meta creative', color: CH.meta[1], impact,
      title: `"${esc(cr)}" is wearing out: CTR ${pct(c1, 2)}, down ${pct(1 - ratio, 0)} from its first two weeks.`,
      why: `It still takes ${pct(sp / metaSpend, 0)} of Meta spend (${eur(sp)}) in this period.`,
      action: `Brief 2 new UGC hooks on the same angle and move its budget to them when they launch.`,
      impactLbl: `≈ ${eur(impact)} spend at risk`, owner: 'Creative lead · weekly' });
  }
  // attribution coverage
  const m = M(r);
  if (m.attributed * 100 < TG.attributed_pct) {
    const byPage = groupBy(rows('leads', r), x => x.page);
    const leak = Object.entries(byPage).map(([p, a]) => [p, div(sum(a.filter(x => x.ch === ''), 'n'), sum(a, 'n')), sum(a, 'n')])
      .filter(x => x[2] > 50).sort((a, b) => b[1] - a[1])[0];
    out.push({ id: 'attribution', tag: 'Data health', color: '#8a877f', impact: m.unkRev * .15,
      title: `${pct(1 - m.attributed, 0)} of new orders have no source. Target: under ${100 - TG.attributed_pct}%.`,
      why: `${eur(m.unkRev)} of revenue can't be credited to any channel. Biggest leak: the form on ${esc(leak[0])} loses the source on ${pct(leak[1], 0)} of leads.`,
      action: `Add hidden UTM fields to that form, tag every newsletter and creator link, and check order attribution at checkout.`,
      impactLbl: `${eur(m.unkRev)} untracked`, owner: 'Marketing ops · monthly' });
  }
  // SEO quick win
  const q = seoWins(r)[0];
  if (q && q.eur > 0) out.push({ id: 'seo-' + q.q, tag: 'SEO', color: CH.organic_search[1], impact: q.eur,
    title: `"${esc(q.q)}" ranks ${q.pos.toFixed(1)} with ${num(q.imp)} impressions.`,
    why: `At position 3 (≈10% CTR, industry average) it would bring about ${num(q.extra)} more clicks. ${esc(q.page)} earns ${eur(q.rpc, 2)} per organic click.`,
    action: `Refresh ${q.page === '/' ? 'the homepage' : esc(q.page)}: match the query in the title, add an FAQ block, link to it from 3 related pages.`,
    impactLbl: `≈ +${eur(q.eur)} revenue`, owner: 'SEO / content · monthly' });
  // paid CPL
  if (m.cpl > TG.cpl) {
    const lc = all.filter(x => x.leads > 0 && LEADGEN.has(x.c)).map(x => ({ ...x, cpl: x.cost / x.leads })).sort((a, b) => b.cpl - a.cpl)[0];
    out.push({ id: 'cpl', tag: 'Leads', color: PAL[6], impact: (m.cpl - TG.cpl) * m.paidLeads,
      title: `Lead-gen cost per lead is ${eur(m.cpl, 2)}. Target is ${eur(TG.cpl, 2)}.`,
      why: `${esc(lc.c)} is the most expensive at ${eur(lc.cpl, 2)} per lead, ${pct(div(lc.q, lc.leads), 0)} of them qualified.`,
      action: `Test a shorter form and a qualifying question on its landing page before raising bids.`,
      impactLbl: `${eur((m.cpl - TG.cpl) * m.paidLeads)} over target`, owner: 'Paid media lead · weekly' });
  }
  return out.sort((a, b) => b.impact - a.impact).slice(0, 4).sort((a, b) => !!store.get('done:' + a.id) - !!store.get('done:' + b.id));
}

// ---------- pages ----------
const PAGES = {};
PAGES.brief = { filters: ['channel'], render() {
  const r = R(), p = prevRange(), m = M(r), pm = M(p), B = buckets(r), wk = B.length > 60;
  const sp = f => { const save = S.grain; if (wk) S.grain = 'week'; const v = buckets(r).map(b => { const a = S.grain === 'month' ? b + '-01' : b, e = S.grain === 'day' ? b : S.grain === 'month' ? b + '-31' : addDays(b, 6); return f(M([a < r[0] ? r[0] : a, e > r[1] ? r[1] : e])); }); S.grain = save; return v; };
  const ins = insights(r);
  // ROAS range chart (Google playbook: platform = ceiling, matched = floor, estimate in between)
  const cov = coverage(r), rows_ = PAID.map(pl => ({ pl, ...camp(pl, null, r) }));
  const roasChart = chart({
    textStyle: { fontFamily: 'Inter Tight' }, grid: { left: 8, right: 24, top: 8, bottom: 44, containLabel: true },
    tooltip: { trigger: 'item', backgroundColor: '#fff', borderColor: '#E4E4E4', textStyle: { color: '#17120F', fontSize: 12 } },
    legend: { bottom: 0, icon: 'circle', itemWidth: 9, itemHeight: 9, textStyle: { color: '#4a4a4a' }, data: ['Matched (floor)', 'Estimate', 'Platform-reported (ceiling)', 'Target'] },
    yAxis: { type: 'category', data: rows_.map(x => CH[x.pl][0]), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: '#17120F', fontWeight: 500 } },
    xAxis: { type: 'value', splitLine: { lineStyle: { color: '#ecebe6' } }, axisLabel: { color: '#6B6B6B', formatter: v => v + '×' } },
    series: [
      { type: 'bar', stack: 'r', data: rows_.map(x => x.floor), itemStyle: { color: 'transparent' }, silent: true, barWidth: 14 },
      { type: 'bar', stack: 'r', data: rows_.map((x, i) => ({ value: x.ceiling - x.floor, itemStyle: { color: CH[x.pl][1], opacity: .22, borderRadius: 7 } })), silent: true },
      { name: 'Matched (floor)', type: 'scatter', symbolSize: 12, itemStyle: { color: '#4a4a4a' }, data: rows_.map((x, i) => [x.floor, i]), tooltip: { valueFormatter: xx, formatter: q => `Matched to real sales: <b>${xx(q.value[0])}</b>` } },
      { name: 'Estimate', type: 'scatter', symbol: 'diamond', symbolSize: 18, itemStyle: { color: V('--accent'), borderColor: V('--card'), borderWidth: 2 }, data: rows_.map((x, i) => [x.floor / cov, i]), tooltip: { formatter: q => `Estimate (unattributed orders split like known ones): <b>${xx(q.value[0])}</b>` } },
      { name: 'Platform-reported (ceiling)', type: 'scatter', symbolSize: 12, itemStyle: { color: '#fff', borderColor: '#4a4a4a', borderWidth: 2 }, data: rows_.map((x, i) => [x.ceiling, i]), tooltip: { formatter: q => `What the platform claims: <b>${xx(q.value[0])}</b>` } },
      { name: 'Target', type: 'scatter', symbol: 'rect', symbolSize: [3, 26], itemStyle: { color: V('--bad') }, data: rows_.map((x, i) => [TG['roas_' + x.pl], i]), tooltip: { formatter: q => `Target: <b>${xx(q.value[0])}</b>` } },
    ] }, 190);
  const hl = (b, s) => `<div class="h"><div><b>${b}</b><br><span>${s}</span></div></div>`;
  const pg = rows_.reduce((s, x) => s + x.pconv, 0), crm = rows_.reduce((s, x) => s + x.leads + x.dirN, 0);
  const title = { 7: 'Weekly brief', 30: 'Monthly brief', 90: 'Quarterly brief', 365: 'Yearly brief' }[S.preset] || 'Brief · custom period';
  const cadence = { 7: 'read every Monday, 10 minutes', 30: 'first Monday of the month, 20 minutes', 90: 'quarterly review, 45 minutes', 365: 'yearly planning' }[S.preset] || 'ad-hoc review';
  return `<div class="page-h"><div><h1>${title}</h1><p>${fmtR(r)}${p ? ` · compared with ${fmtR(p)}` : ' · no comparison'}${S.channel !== 'all' ? ` · channel: ${CH[S.channel === 'unattributed' ? '' : S.channel][0]}` : ''}</p></div>
    <span class="owner">Owner: marketing manager · ${cadence}</span></div>
  <div class="ns">
    <div class="hero"><span class="ns-icon">${ICON.star}</span><div class="hl">North star · contribution after marketing</div><div class="big">${eur(m.contrib)}</div>
      <div class="row" style="display:flex;gap:8px">${deltaHtml(m.contrib, pm?.contrib)}</div>
      <div class="hs">Revenue ${eur(m.rev)} − marketing ${eur(m.cost.total)} (ads ${eur(m.cost.ads)} · creators ${eur(m.cost.cr)} · tools ${eur(m.cost.tools)}). Before product costs.</div></div>
    ${card('ROAS per platform: ceiling, estimate, floor', roasChart, 'Platform numbers are the upper bound, orders matched to the platform are the lower bound (Google Modern Measurement Playbook). Decide on the orange estimate.')}
  </div>
  <div class="grid g6" style="margin-top:14px">
    ${kpi({ ic: 'euro', lbl: 'Revenue', cur: m.rev, prev: pm?.rev, fmt: eur, sp: sp(x => x.rev) })}
    ${kpi({ ic: 'scale', lbl: 'Blended MER', cur: m.mer, prev: pm?.mer, fmt: xx, target: TG.mer, meta: 'Revenue ÷ all marketing cost', sp: sp(x => x.mer) })}
    ${kpi({ ic: 'tagi', lbl: 'Cost per new customer', cur: m.ncac, prev: pm?.ncac, better: 'down', fmt: v => eur(v, 2), target: TG.ncac, sp: sp(x => x.ncac) })}
    ${kpi({ ic: 'userplus', lbl: 'New customers', cur: m.newN, prev: pm?.newN, sp: sp(x => x.newN) })}
    ${kpi({ ic: 'target', lbl: 'Lead-gen cost per lead', cur: m.cpl, prev: pm?.cpl, better: 'down', fmt: v => eur(v, 2), target: TG.cpl, meta: `${num(m.paidLeads)} leads from lead-gen campaigns`, sp: sp(x => x.cpl) })}
    ${kpi({ ic: 'route', lbl: 'Orders with a source', cur: m.attributed, prev: pm?.attributed, fmt: v => pct(v, 0), target: TG.attributed_pct / 100, sp: sp(x => x.attributed) })}
  </div>
  <div class="sec">What to do ${{ 7: 'this week', 30: 'this month', 90: 'this quarter', 365: 'this year' }[S.preset] || 'next'}</div>
  <div class="ins">${ins.length ? ins.map(icCard).join('') : card('All key numbers are on target', '<p class="sub">No action needed this week. Keep the tests running.</p>')}</div>
  <div class="sec">Data health</div>
  <div class="health">
    ${hl(pct(m.attributed, 0), 'new orders with a known source')}
    ${hl(pct(m.leadsKnown, 0), 'CRM leads with a known source')}
    ${hl(`${num(pg)} vs ${num(crm)}`, 'paid conversions: platforms report vs CRM + shop record')}
    ${hl(fmtD(MAX), 'data up to (sandbox, refreshed daily when live)')}
    <a class="h" href="#/tr/health" style="text-decoration:none;flex:0 0 auto"><div><b>→</b><br><span>Data health page</span></div></a>
  </div>`;
} };

PAGES['acq/overview'] = { filters: ['channel', 'type', 'product'], render() {
  const r = R(), p = prevRange(), m = M(r), pm = M(p), B = buckets(r);
  const o = rows('orders', r, ordF);
  const newB = byBucket(o.filter(x => !x.ren), x => x.rev, r), renB = byBucket(o.filter(x => x.ren), x => x.rev, r);
  const nB = byBucket(o, x => x.n, r), aovB = byBucket(o, x => x.rev, r).map((v, i) => div(v, nB[i]));
  const onBar = e => {
    const b = B[e.dataIndex], inB = o.filter(x => bucket(x.d) === b);
    const g = Object.values(groupBy(inB, x => x.prod + '|' + x.ch + '|' + x.camp + '|' + x.ren)).map(a => ({ prod: a[0].prod, ch: a[0].ch, camp: a[0].camp, ren: a[0].ren, n: sum(a, 'n'), rev: sum(a, 'rev') })).sort((a, b) => b.rev - a.rev);
    openDrawer(`<h3 style="font-size:20px">Sales on ${b}</h3><p class="sub">${num(sum(inB, 'n'))} sales · ${eur(sum(inB, 'rev'), 2)}</p>` +
      table([{ k: 'prod', l: 'Product' }, { k: 'ch', l: 'Source', f: v => chName(v) }, { k: 'camp', l: 'Campaign', f: v => esc(v || '–') }, { k: 'ren', l: 'Type', f: v => v ? 'Renewal' : 'New' }, { k: 'n', l: 'Sales', f: num }, { k: 'rev', l: 'Revenue', f: v => eur(v, 2) }], g));
  };
  // lead gen
  const lc = CAMPS.filter(([pl, c]) => T.ads.find(a => a.campaign === c).funnel === 'lead');
  const ls = lc.map(([pl, c]) => camp(pl, c, r)), lp = p ? lc.map(([pl, c]) => camp(pl, c, p)) : null;
  const agg = a => a && a.reduce((s, x) => ({ cost: s.cost + x.cost, leads: s.leads + x.leads, q: s.q + x.q, conv: s.conv + x.conv, leadRev: s.leadRev + x.leadRev }), { cost: 0, leads: 0, q: 0, conv: 0, leadRev: 0 });
  const LG = agg(ls), LP = agg(lp);
  const adsR = rows('ads', r), L = rows('leads', r);
  const cplB = byBucket(adsR.filter(x => x.funnel === 'lead'), x => x.cost, r).map((v, i, a) => v), leadB = byBucket(L.filter(x => lc.some(c => c[1] === x.camp)), x => x.n, r);
  const qB = byBucket(L, x => x.q ? x.n : 0, r), allB = byBucket(L, x => x.n, r);
  // by funnel table
  const sess = rows('sessions', r), ordN = rows('orders', r, x => !x.ren);
  const line = (key, f, spend, name, tgt) => {
    const se = sum(sess.filter(f.s), 's'), le = L.filter(f.l), ld = sum(le, 'n'), od = ordN.filter(f.o), rev = sum(od, 'rev'), n = sum(od, 'n');
    return { name, key, spend, s: f.s === null ? null : se, leads: ld, v2l: div(ld, se), cpl: spend ? div(spend, ld) : null, q: div(sum(le.filter(x => x.q), 'n'), ld),
      chk: sum(sess.filter(f.s), 'chk'), n, rev, cac: spend ? div(spend, n) : null, roas: spend ? div(rev, spend) : null, tgt };
  };
  const fun = [
    ...CAMPS.map(([pl, c]) => line(c, { s: x => x.ch === pl && x.camp === c, l: x => x.ch === pl && x.camp === c, o: x => x.ch === pl && x.camp === c }, sum(adsR.filter(x => x.campaign === c), 'cost'), `${sw(CH[pl][1])}${esc(c)} <span class="tag">${CH[pl][0]}</span>`, TG['roas_' + pl])),
    ...CH_ORDER.filter(c => !PAID.includes(c)).map(ch => line(ch, { s: x => x.ch === ch, l: x => x.ch === ch, o: x => x.ch === ch }, ch === 'creators' ? sum(rows('costs', r, x => x.cat === 'creators'), 'amount') : 0, chName(ch))),
  ];
  const maxRev = Math.max(...fun.map(x => x.rev));
  // cohorts
  const seqs = [...new Set(T.leads.map(x => x.seq))].sort();
  const LC = L.filter(x => chMatch(x) && (S.seq === 'all' || x.seq === S.seq));
  const coN = byBucket(LC, x => x.n, r), coC = byBucket(LC, x => x.conv, r), coRev = byBucket(LC, x => x.rev, r);
  // products
  const po = o.filter(x => S.renewals || !x.ren), prods = Object.entries(groupBy(po, x => x.prod)).map(([k, a]) => ({ prod: k, n: sum(a, 'n'), rev: sum(a, 'rev'), ren: div(sum(a.filter(x => x.ren), 'rev'), sum(a, 'rev')) })).sort((a, b) => b.rev - a.rev);
  const totP = sum(prods, 'rev');
  const cmp = p ? `${S.compare === 'year' ? 'Last year' : 'Previous period'}: ` : '';
  return `<div class="page-h"><div><h1>Acquisition overview</h1><p>${fmtR(r)}${p ? ` · vs ${fmtR(p)}` : ''}</p></div><span class="owner">Owner: marketing manager · weekly</span></div>
  <div class="grid g5">
    ${kpi({ lbl: 'Total sales', cur: m.n, prev: pm?.n })}
    ${kpi({ lbl: 'Total revenue', cur: m.rev, prev: pm?.rev, fmt: eur, meta: `New ${eur(m.newRev)} · Renewals ${eur(m.renRev)}` })}
    ${kpi({ lbl: 'Average ticket', cur: m.aov, prev: pm?.aov, fmt: v => eur(v, 2) })}
    ${kpi({ lbl: 'Average revenue / day', cur: m.perDay, prev: pm?.perDay, fmt: eur })}
    ${kpi({ lbl: 'Renewal revenue', cur: m.renRev, prev: pm?.renRev, fmt: eur, meta: `${pct(div(m.renRev, m.rev), 0)} of revenue` })}
  </div>
  <div class="sec">Contribution after marketing</div>
  <div class="grid g3">
    ${kpi({ lbl: 'All purchases', cur: m.contrib, prev: pm?.contrib, fmt: eur, meta: `Revenue ${eur(m.rev)} − marketing ${eur(m.cost.total)}${pm ? `<br>${cmp}${eur(pm.contrib)}` : ''}` })}
    ${kpi({ lbl: 'New purchases only', cur: m.contribNew, prev: pm?.contribNew, fmt: eur, meta: `New revenue ${eur(m.newRev)} − marketing ${eur(m.cost.total)}${pm ? `<br>${cmp}${eur(pm.contribNew)}` : ''}` })}
    ${kpi({ lbl: 'Marketing cost', cur: m.cost.total, prev: pm?.cost.total, better: 'down', fmt: eur, meta: `Ads ${eur(m.cost.ads)} · Creators ${eur(m.cost.cr)} · Tools ${eur(m.cost.tools)}<br>MER ${xx(m.mer)} all · ${xx(m.merNew)} new` })}
  </div>
  <div class="grid g3" style="margin-top:14px">
    <div class="span2">${card('Revenue: new vs renewals', xy({ x: B, stack: 'rev', y: 'eur', h: 300, onClick: onBar, series: [{ name: 'New sales', data: newB, color: PAL[0] }, { name: 'Renewals', data: renB, color: PAL[6] }] }), 'Click a bar to see the sales behind it.')}</div>
    <div class="grid">${card('Average ticket', xy({ x: B, y: 'eur', h: 128, series: [{ name: 'Average ticket', type: 'line', data: aovB, color: PAL[2] }], tip: v => eur(v, 2) }))}
      ${card('Number of sales', xy({ x: B, h: 128, series: [{ name: 'Sales', type: 'line', data: nB, color: PAL[1] }] }))}</div>
  </div>
  <div class="sec">Lead generation (campaigns built to collect leads)</div>
  <div class="grid g6">
    ${kpi({ lbl: 'Lead-gen spend', cur: LG.cost, prev: LP?.cost, better: 'down', fmt: eur })}
    ${kpi({ lbl: 'Leads (CRM)', cur: LG.leads, prev: LP?.leads })}
    ${kpi({ lbl: 'Cost per lead', cur: div(LG.cost, LG.leads), prev: LP && div(LP.cost, LP.leads), better: 'down', fmt: v => eur(v, 2), target: TG.cpl })}
    ${kpi({ lbl: 'Qualified leads', cur: div(LG.q, LG.leads), prev: LP && div(LP.q, LP.leads), fmt: v => pct(v, 0), target: TG.qualified_pct / 100 })}
    ${kpi({ lbl: 'Revenue from these leads', cur: LG.leadRev, prev: LP?.leadRev, fmt: eur, meta: `${num(LG.conv)} bought so far` })}
    ${kpi({ lbl: 'Lead-gen ROAS', cur: div(LG.leadRev, LG.cost), prev: LP && div(LP.leadRev, LP.cost), fmt: xx, meta: 'Grows while recent leads still convert' })}
  </div>
  <div class="grid g3" style="margin-top:14px">
    ${card('Paid clicks by campaign', xy({ x: B, stack: 'c', h: 240, series: CAMPS.map(([pl, c]) => ({ name: c, data: byBucket(adsR.filter(x => x.campaign === c), x => x.clicks, r), color: campColor(c) })) }))}
    ${card('Cost per lead (lead-gen campaigns)', xy({ x: B, y: 'eur', h: 240, series: [{ name: 'Cost per lead', type: 'line', data: cplB.map((v, i) => div(v, leadB[i])), color: PAL[7], markLine: { silent: true, symbol: 'none', lineStyle: { color: V('--bad'), type: 'dashed' }, label: { formatter: `target ${eur(TG.cpl)}`, position: 'insideEndTop', color: '#b42424' }, data: [{ yAxis: TG.cpl }] } }], tip: v => eur(v, 2) }))}
    ${card('Share of qualified leads (all leads)', xy({ x: B, y: 'pct', h: 240, series: [{ name: 'Qualified share', type: 'line', data: qB.map((v, i) => div(v, allB[i])), color: PAL[6] }] }), 'Qualified = answered the form as the target customer. Watch it next to cost per lead: cheap leads that never qualify are not cheap.')}
  </div>
  <div class="sec">By funnel</div>
  ${card('Spend → sessions → leads → sales, per campaign and channel', table([
    { k: 'name', l: 'Funnel', f: v => v }, { k: 'spend', l: 'Spend', f: v => v ? eur(v) : '–' }, { k: 's', l: 'Sessions', f: num }, { k: 'leads', l: 'Leads', f: num },
    { k: 'v2l', l: 'Visit → lead', f: v => pct(v) }, { k: 'cpl', l: 'CPL', f: v => eur(v, 2), cls: x => x.cpl == null || !LEADGEN.has(x.key) ? '' : x.cpl <= TG.cpl ? 'good' : 'bad' },
    { k: 'q', l: 'Qualified', f: v => pct(v, 0) }, { k: 'chk', l: 'Checkouts', f: num }, { k: 'n', l: 'Sales', f: num },
    { k: 'rev', l: 'Revenue', f: v => eur(v), bar: maxRev }, { k: 'cac', l: 'CAC', f: v => eur(v, 2) },
    { k: 'roas', l: 'ROAS (matched)', f: xx, cls: x => x.roas == null || !x.tgt ? '' : x.roas >= x.tgt ? 'good' : 'bad' }], fun),
    'Sales are new orders, dated by purchase. A lead that buys later keeps the source of the lead (matched by email). Green / red = against target (CPL only on lead-gen campaigns). Unattributed = no source on the lead or the order.')}
  <div class="sec">Leads and the revenue they brought</div>
  ${card('Lead cohorts by sign-up date', `<div class="grid g4" style="margin-top:12px">
      ${kpi({ lbl: 'Leads (CRM)', cur: sum(LC, 'n') })}${kpi({ lbl: 'Bought', cur: sum(LC, 'conv') })}
      ${kpi({ lbl: 'Lead → sale', cur: div(sum(LC, 'conv'), sum(LC, 'n')), fmt: v => pct(v) })}${kpi({ lbl: 'Revenue brought', cur: sum(LC, 'rev'), fmt: v => eur(v, 2) })}</div>
    <div class="grid g2" style="margin-top:14px"><div><div class="mini">Leads per sign-up ${S.grain}</div>${xy({ x: B, h: 220, series: [{ name: 'Leads', data: coN, color: PAL[0] }] })}</div>
      <div><div class="mini">Revenue those leads brought</div>${xy({ x: B, y: 'eur', h: 220, series: [{ name: 'Revenue brought (€)', type: 'line', data: coRev, color: PAL[2] }] })}</div></div>`,
    'Each lead is counted on the day it signed up, with every purchase it made afterwards (real orders, matched by email). Recent cohorts look weaker because they have not had time to buy.',
    `<select data-local="seq" style="height:34px;border:1px solid var(--border);border-radius:9px;padding:0 8px">${[['all', 'All email sequences'], ...seqs.map(s => [s, s])].map(([v, l]) => `<option value="${v}" ${S.seq === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}
  <div class="sec">Top products</div>
  ${card('Ranked by revenue', table([{ k: 'prod', l: 'Product' }, { k: 'n', l: 'Sales', f: num }, { k: 'rev', l: 'Revenue', f: v => eur(v, 2), bar: prods[0]?.rev || 1 },
    { k: 'share', l: 'Share', f: (v, x) => pct(x.rev / totP, 0) }, { k: 'ren', l: 'From renewals', f: v => pct(v, 0) }], prods),
    '', `<div class="toggle"><button class="${S.renewals ? 'on' : ''}" data-local="renewals" data-v="1">Renewals included</button><button class="${!S.renewals ? 'on' : ''}" data-local="renewals" data-v="0">New only</button></div>`)}`;
} };

function platformPage(pl) {
  const r = R(), p = prevRange(), B = buckets(r);
  const camps = CAMPS.filter(c => c[0] === pl).map(c => c[1]);
  if (!camps.includes(S.campaign)) S.campaign = 'all';
  const shown = S.campaign === 'all' ? camps : [S.campaign];
  const t = camp(pl, S.campaign === 'all' ? null : S.campaign, r), tp = p && camp(pl, S.campaign === 'all' ? null : S.campaign, p), cov = coverage(r);
  const adsR = rows('ads', r, x => x.platform === pl);
  const name = CH[pl][0], slugSrc = pl === 'meta' ? 'facebook / instagram' : 'google', clickId = pl === 'meta' ? 'fbclid' : 'gclid';
  const cards = shown.map(c => {
    const s = camp(pl, c, r), a = adsR.filter(x => x.campaign === c), page = a[0]?.page || '', fun = a[0]?.funnel;
    const L = rows('leads', r, x => x.ch === pl && x.camp === c), D = rows('orders', r, x => !x.ren && x.ch === pl && x.camp === c);
    const slug = c.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    return `<div class="card" style="margin-top:14px"><h3><span>${sw(campColor(c))}${esc(c)}</span><span><span class="tag">${fun === 'lead' ? 'Lead generation' : 'Direct sales'}</span> <span class="tag">${esc(page)}</span></span></h3>
      <div class="chips"><div><em>Leads</em><span class="chip">utm_source = ${slugSrc}</span><span class="chip">utm_campaign = ${slug}</span><span class="chip">one per email</span></div>
        <div><em>Direct sales</em><span class="chip">order attribution: utm_campaign = ${slug}</span><span class="chip">OR ${clickId} on the order</span></div>
        <div><em>Never</em><span class="chip never">renewals</span><span class="chip never">other platforms' click IDs</span><span class="chip never">orders with no source</span></div></div>
      <div style="display:flex;gap:16px 28px;align-items:center;flex-wrap:wrap">
        <div class="hero" style="flex:1 1 560px"><div><div class="hv">${eur(s.cost, 2)}</div><div class="hl">Spend</div></div>
          <div><div class="hv">${eur(s.rev, 2)}</div><div class="hl">Revenue (lead-dated + direct)</div></div>
          <div><div class="hv accent">${xx(div(s.floor, cov))}</div><div class="hl">ROAS estimate</div><div class="hs">floor ${xx(s.floor)} · platform ${xx(s.ceiling)}</div></div></div>
        <div class="chain"><div class="st"><b>${num(s.imp)}</b><span>Impressions</span></div><div class="ar">→<i>${pct(div(s.clicks, s.imp), 2)}</i></div>
          <div class="st"><b>${num(s.clicks)}</b><span>Clicks</span></div><div class="ar">→<i>${pct(div(s.leads, s.clicks))}</i></div>
          <div class="st"><b>${num(s.leads)}</b><span>Leads (CRM)</span></div><div class="ar">→<i>${pct(div(s.conv, s.leads))}</i></div>
          <div class="st"><b>${num(s.sales)}</b><span>Sales</span><div class="owner">${num(s.conv)} from leads · ${num(s.dirN)} direct</div></div></div>
      </div>
      <div class="grid g6" style="margin-top:14px">
        ${kpi({ lbl: 'Cost per lead', cur: div(s.cost, s.leads), fmt: v => eur(v, 2), better: 'down', target: fun === 'lead' ? TG.cpl : null })}
        ${kpi({ lbl: 'Cost per sale', cur: div(s.cost, s.sales), fmt: v => eur(v, 2), better: 'down' })}
        ${kpi({ lbl: 'Average ticket', cur: div(s.rev, s.sales), fmt: v => eur(v, 2) })}
        ${kpi({ lbl: 'Leads that bought later', val: `${eur(s.leadRev)} <small style="font-size:14px;color:var(--muted)">(${num(s.conv)})</small>`, meta: 'Dated by lead sign-up' })}
        ${kpi({ lbl: 'Direct sales, no lead', val: `${eur(s.dirRev)} <small style="font-size:14px;color:var(--muted)">(${num(s.dirN)})</small>`, meta: 'Dated by purchase' })}
        ${kpi({ lbl: 'Qualified leads', cur: div(s.q, s.leads), fmt: v => pct(v, 0), meta: `buy ${pct(div(s.qConv, s.q))} vs ${pct(div(s.conv - s.qConv, s.leads - s.q))} for the rest` })}
      </div>
      <div class="grid g2" style="margin-top:10px">
        <div><div class="mini">Spend per ${S.grain}</div>${xy({ x: B, y: 'eur', h: 200, series: [{ name: 'Spend (€)', data: byBucket(a, x => x.cost, r), color: '#17120F' }] })}</div>
        <div><div class="mini">Leads and direct sales per ${S.grain}</div>${xy({ x: B, h: 200, series: [{ name: 'Leads (CRM)', type: 'line', data: byBucket(L, x => x.n, r), color: PAL[0] }, { name: 'Sales (direct)', type: 'line', data: byBucket(D.filter(x => !x.via), x => x.n, r), color: PAL[2] }] })}</div>
      </div></div>`;
  }).join('');
  const lpRows = shown.map(c => { const a = adsR.filter(x => x.campaign === c), s = camp(pl, c, r); return { page: a[0]?.page, c, cost: s.cost, imp: s.imp, clicks: s.clicks, pconv: s.pconv, leads: s.leads, sales: s.sales }; });
  let extra = '';
  if (pl === 'meta') {
    const cr = rows('creatives', r), crO = rows('orders', r, x => !x.ren && x.ch === 'meta' && x.cr);
    const crL = Object.entries(groupBy(cr, x => x.creative)).map(([k, a]) => {
      const all_ = T.creatives.filter(x => x.creative === k), first = all_.slice(0, 14), last = all_.filter(x => x.d <= r[1]).slice(-14);
      const ratio = div(div(sum(last, 'clicks'), sum(last, 'imp')), div(sum(first, 'clicks'), sum(first, 'imp')));
      const o = crO.filter(x => x.cr === k), rev = sum(o, 'rev'), spend = sum(a, 'cost');
      return { cr: k, fmt: a[0].format, camp: a[0].campaign, spend, imp: sum(a, 'imp'), ctr: div(sum(a, 'clicks'), sum(a, 'imp')), hook: div(sum(a, 'v3s'), sum(a, 'imp')),
        n: sum(o, 'n'), rev, roas: div(rev, spend), days: nDays(all_[0].d, r[1]), ratio };
    }).sort((a, b) => b.spend - a.spend);
    const top = crL.slice(0, 5).map(x => x.cr), g0 = S.grain; S.grain = S.grain === 'day' ? 'week' : S.grain;
    const WB = buckets(r), ctrSeries = top.map((c, i) => { const a = cr.filter(x => x.creative === c), cl = byBucket(a, x => x.clicks, r), im = byBucket(a, x => x.imp, r); return { name: c, type: 'line', data: cl.map((v, j) => im[j] ? v / im[j] : null), color: PAL[i], showSymbol: true }; });
    S.grain = g0;
    extra = `<div class="sec">Creatives</div><div class="grid">${card('Sales & ROAS per creative', table([
      { k: 'cr', l: 'Creative', f: v => esc(v) }, { k: 'fmt', l: 'Format' }, { k: 'spend', l: 'Spend', f: v => eur(v), bar: crL[0]?.spend || 1 }, { k: 'imp', l: 'Impr.', f: num },
      { k: 'ctr', l: 'CTR', f: v => pct(v, 2) }, { k: 'hook', l: 'Hook rate', f: v => pct(v, 0) }, { k: 'n', l: 'Sales', f: num }, { k: 'rev', l: 'Revenue', f: v => eur(v) },
      { k: 'roas', l: 'ROAS', f: xx, cls: x => x.roas >= TG.roas_meta ? 'good' : 'bad' }, { k: 'days', l: 'Days live', f: num },
      { k: 'ratio', l: 'Fatigue', f: v => v == null ? '–' : v < .7 ? `<span class="status no"><span class="ic">!</span>Refresh</span>` : v < .85 ? 'Watch' : `<span class="status ok"><span class="ic">✓</span>Fresh</span>` }], crL),
      'Hook rate = 3-second video views ÷ impressions. Fatigue compares the last 14 days of CTR with the creative\'s own first 14 days (below 70% = refresh). Sales = orders tagged with the ad (utm_content), sale-dated, floor.')}
      ${card('Weekly CTR by creative (top 5 by spend)', xy({ x: WB, y: 'pct1', h: 280, tip: v => pct(v, 2), series: ctrSeries }), 'A falling line = the audience has seen it too often. Refresh before CTR drops 30% below the creative\'s start.')}</div>`;
  }
  const campSel = `<select data-local="campaign" style="height:36px;border:1px solid var(--border);border-radius:9px;padding:0 10px;min-width:220px">${[['all', 'All campaigns'], ...camps.map(c => [c, c])].map(([v, l]) => `<option value="${esc(v)}" ${S.campaign === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  return `<div class="page-h"><div><h1 class="with-logo">${logo(pl, 26)}${name}</h1><p>${fmtR(r)}${p ? ` · vs ${fmtR(p)}` : ''}</p></div>${campSel}</div>
  <div class="grid g6">
    ${kpi({ lbl: 'Spend', cur: t.cost, prev: tp?.cost, fmt: eur, better: 'down' })}
    ${kpi({ lbl: 'CPA (platform-reported)', cur: div(t.cost, t.pconv), prev: tp && div(tp.cost, tp.pconv), fmt: v => eur(v, 2), better: 'down', meta: 'The platform\'s own conversions' })}
    ${kpi({ lbl: 'CTR', cur: div(t.clicks, t.imp), prev: tp && div(tp.clicks, tp.imp), fmt: v => pct(v, 2) })}
    ${kpi({ lbl: 'Conversion rate (platform)', cur: div(t.pconv, t.clicks), prev: tp && div(tp.pconv, tp.clicks), fmt: v => pct(v, 2) })}
    ${kpi({ lbl: 'ROAS estimate', cur: div(t.floor, cov), prev: tp && div(tp.floor, cov), fmt: xx, target: TG['roas_' + pl], meta: `Floor ${xx(t.floor)} · platform says ${xx(t.ceiling)}` })}
    ${kpi({ lbl: 'Platform vs CRM', val: `${num(t.pconv)} / ${num(t.leads + t.dirN)}`, meta: 'Conversions the platform reports / leads + direct sales we can see' })}
  </div>
  <div class="grid g2" style="margin-top:14px">
    ${card('Spend by campaign', xy({ x: B, y: 'eur', stack: 's', h: 240, series: camps.map(c => ({ name: c, data: byBucket(adsR.filter(x => x.campaign === c), x => x.cost, r), color: campColor(c) })) }))}
    ${card('Revenue by campaign (sale-dated, matched)', xy({ x: B, y: 'eur', stack: 'r', h: 240, series: camps.map(c => ({ name: c, data: byBucket(rows('orders', r, x => !x.ren && x.ch === pl && x.camp === c), x => x.rev, r), color: campColor(c) })) }))}
  </div>
  <div class="sec">Campaigns</div>${cards}${extra}
  <div class="sec">Funnel & landing pages</div>
  <div class="grid g3">${card('Funnel (platform-reported)', chart({ textStyle: { fontFamily: 'Inter Tight' }, tooltip: { trigger: 'item', valueFormatter: num },
      series: [{ type: 'funnel', left: 10, right: 10, top: 10, bottom: 10, minSize: '4%', gap: 3, label: { color: '#17120F', formatter: q => `${q.name}  ${num(q.value)}` },
        data: [{ name: 'Impressions', value: t.imp, itemStyle: { color: PAL[0] } }, { name: 'Clicks', value: t.clicks, itemStyle: { color: PAL[6] } }, { name: 'Conversions', value: t.pconv, itemStyle: { color: PAL[1] } }] }] }, 240),
      `"Conversions" here is ${name}'s own count, not checked against real sales. The cards above use the CRM and the shop.`)}
    <div class="span2">${card('Landing pages used', table([{ k: 'page', l: 'Landing page' }, { k: 'c', l: 'Campaign', f: v => esc(v) }, { k: 'cost', l: 'Spend', f: v => eur(v) }, { k: 'imp', l: 'Impr.', f: num },
      { k: 'clicks', l: 'Clicks', f: num }, { k: 'pconv', l: 'Platform conv.', f: num }, { k: 'leads', l: 'CRM leads', f: num }, { k: 'sales', l: 'Sales', f: num }], lpRows))}</div></div>`;
}
PAGES['acq/google'] = { filters: [], render: () => platformPage('google_ads') };
PAGES['acq/meta'] = { filters: [], render: () => platformPage('meta') };

PAGES['acq/seo'] = { filters: [], render() {
  const r = R(), p = prevRange(), B = buckets(r);
  const g = rows('gsc', r), gp = p ? rows('gsc', p) : null;
  const st = a => a && { clicks: sum(a, 'clicks'), imp: sum(a, 'imp'), ctr: div(sum(a, 'clicks'), sum(a, 'imp')), pos: div(sum(a, x => x.pos * x.imp), sum(a, 'imp')), br: div(sum(a.filter(x => x.b), 'clicks'), sum(a, 'clicks')) };
  const s = st(g), sp = st(gp);
  const orgO = rows('orders', r, x => !x.ren && x.ch === 'organic_search'), orgRev = sum(orgO, 'rev'), rpc = div(orgRev, s.clicks);
  const orgP = p ? sum(rows('orders', p, x => !x.ren && x.ch === 'organic_search'), 'rev') : null;
  const wins = seoWins(r);
  const sess = rows('sessions', r, x => x.ch === 'organic_search'), Lo = rows('leads', r, x => x.ch === 'organic_search');
  const pages = Object.entries(groupBy(g, x => x.page)).map(([pg, a]) => {
    const x = st(a), o = orgO.filter(y => y.page === pg);
    return { page: pg, ...x, s: sum(sess.filter(y => y.page === pg), 's'), leads: sum(Lo.filter(y => y.page === pg), 'n'), n: sum(o, 'n'), rev: sum(o, 'rev') };
  }).sort((a, b) => b.clicks - a.clicks);
  const months = [...new Set(T.sos.map(x => x.m))].sort().slice(-12), brands = [...new Set(T.sos.map(x => x.brand))];
  const share = b => months.map(m => { const a = T.sos.filter(x => x.m === m); return div(sum(a.filter(x => x.brand === b), 'searches'), sum(a, 'searches')); });
  const ours = share('Acme Courses'), US = 'Acme Courses';

  // ---- AI search (GEO): weekly prompt tracking on 5 answer engines ----
  const weeks = [...new Set(T.ai.map(x => x.wk))].sort(), last4 = weeks.slice(-4), prev4 = weeks.slice(-8, -4);
  const aiIn = ws => T.ai.filter(x => ws.includes(x.wk));
  const vis = (a, eng) => { const e = eng ? a.filter(x => x.eng === eng) : a, us = e.filter(x => x.brand === US);
    return { mention: div(sum(us, 'm'), us.length), cite: div(sum(us, 'c'), us.length), sov: div(sum(us, 'm'), sum(e, 'm')) }; };
  const A4 = aiIn(last4), P4 = aiIn(prev4), v = vis(A4), vp = vis(P4);
  const engines = [...new Set(T.ai.map(x => x.eng))];
  const engRows = engines.map(e => { const a = vis(A4, e), b = vis(P4, e);
    const comp = brands.filter(b2 => b2 !== US).map(b2 => [b2, div(sum(A4.filter(x => x.eng === e && x.brand === b2), 'm'), A4.filter(x => x.eng === e && x.brand === b2).length)]).sort((x, y) => y[1] - x[1])[0];
    return { eng: e, ...a, d: a.sov - b.sov, comp: comp[0], compM: comp[1] }; }).sort((a, b) => b.sov - a.sov);
  const sovW = b => weeks.map((w, i) => { if (i < 3) return null; const a = T.ai.filter(x => weeks.slice(i - 3, i + 1).includes(x.wk)); return div(sum(a.filter(x => x.brand === b), 'm'), sum(a, 'm')); });  // 4-week rolling
  const aiS = rows('sessions', r, x => x.ch === 'ai_search'), aiL = rows('leads', r, x => x.ch === 'ai_search'), aiO = rows('orders', r, x => !x.ren && x.ch === 'ai_search');
  const aiSp = p ? sum(rows('sessions', p, x => x.ch === 'ai_search'), 's') : null, aiRp = p ? sum(rows('orders', p, x => !x.ren && x.ch === 'ai_search'), 'rev') : null;
  // prompts where a competitor is mentioned more than us
  const prompts = Object.entries(groupBy(A4, x => x.prompt)).map(([pr, a]) => {
    const rate = b => div(sum(a.filter(x => x.brand === b), 'm'), a.filter(x => x.brand === b).length);
    const top = brands.filter(b => b !== US).map(b => [b, rate(b)]).sort((x, y) => y[1] - x[1])[0];
    return { prompt: pr, page: a[0].page, us: rate(US), cite: div(sum(a.filter(x => x.brand === US), 'c'), a.filter(x => x.brand === US).length), comp: top[0], compM: top[1], gap: top[1] - rate(US) };
  }).sort((a, b) => b.gap - a.gap);
  // GEO checks (audit-seo skill) -> actions, linked to the prompts each page should win
  const sevW = { critical: 3, high: 2, medium: 1 }, sevL = { critical: '<span class="sev s3">Critical</span>', high: '<span class="sev s2">High</span>', medium: '<span class="sev s1">Medium</span>' };
  const geo = [...T.geo].sort((a, b) => (a.status === 'pass') - (b.status === 'pass') || sevW[b.severity] - sevW[a.severity]);
  const passN = geo.filter(x => x.status === 'pass').length;
  const covers = (chk, pg) => chk.page === pg || chk.page === '/' || (chk.page === '/blog/*' && pg.startsWith('/blog')) || chk.page === '/about';
  const used = new Set();
  const geoActs = geo.filter(x => x.status === 'fail').slice(0, 4).map(x => {
    const lost = prompts.filter(pr => pr.gap > 0 && covers(x, pr.page) && !used.has(pr.prompt)).slice(0, 1); lost.forEach(l => used.add(l.prompt));
    return { id: 'geo-' + x.id, tag: `GEO · ${x.id}`, color: PAL[6], impact: sevW[x.severity],
      title: `${x.check}: ${x.found}.`,
      why: lost.length ? `AI engines mention ${esc(lost[0].comp)} on "${esc(lost[0].prompt)}" ${pct(lost[0].compM, 0)} of the time, us ${pct(lost[0].us, 0)}.` : 'Answer engines read this signal on every page they cite.',
      action: x.fix, impactLbl: sevL[x.severity], owner: `SEO / content · ${esc(x.page)}` };
  });
  // website health (PageSpeed Insights / Lighthouse), latest month, chosen page
  const lhPages = [...new Set(T.lh.map(x => x.page))]; if (!lhPages.includes(S.lhPage)) S.lhPage = lhPages[0];
  const lhM = [...new Set(T.lh.map(x => x.m))].sort(), latest = lhM[lhM.length - 1];
  const L = dev => T.lh.find(x => x.m === latest && x.page === S.lhPage && x.dev === dev);
  const mob = L('mobile'), desk = L('desktop'), cats = [['perf', 'Performance'], ['a11y', 'Accessibility'], ['bp', 'Best practices'], ['seo', 'SEO'], ['agentic', 'Agentic browsing']];
  const radar = chart({ textStyle: { fontFamily: 'Inter Tight' }, tooltip: { trigger: 'item', backgroundColor: '#fff', borderColor: '#E4E4E4', textStyle: { color: '#17120F', fontSize: 12 } },
    legend: { bottom: 0, icon: 'roundRect', itemWidth: 10, itemHeight: 10, textStyle: { color: '#4a4a4a' } },
    radar: { indicator: cats.map(([, n]) => ({ name: n, max: 100 })), radius: '64%', center: ['50%', '46%'], splitNumber: 4,
      axisName: { color: '#4a4a4a', fontWeight: 500 }, splitLine: { lineStyle: { color: '#ecebe6' } }, splitArea: { areaStyle: { color: ['#fff', '#faf9f7'] } }, axisLine: { lineStyle: { color: '#e1e0d9' } } },
    series: [{ type: 'radar', symbolSize: 7, data: [
      { name: 'Mobile', value: cats.map(([k]) => mob[k]), lineStyle: { width: 2, color: PAL[1] }, itemStyle: { color: PAL[1] }, areaStyle: { color: PAL[1], opacity: .12 } },
      { name: 'Desktop', value: cats.map(([k]) => desk[k]), lineStyle: { width: 2, color: PAL[0] }, itemStyle: { color: PAL[0] }, areaStyle: { color: PAL[0], opacity: .1 } }] }] }, 300);
  const cwvTile = (lbl, val, unit, good, poor, fmtV) => { const st_ = val <= good ? ['ok', 'Good'] : val <= poor ? ['warn', 'Needs work'] : ['no', 'Poor'];
    return `<div class="card kpi"><div class="lbl">${lbl} · mobile p75</div><div class="val">${fmtV(val)}${unit}</div><div class="row"><span class="status ${st_[0]}"><span class="ic">${st_[0] === 'ok' ? '✓' : '!'}</span>${st_[1]}</span></div><div class="meta">Good ≤ ${fmtV(good)}${unit} · poor > ${fmtV(poor)}${unit}</div></div>`; };
  const perfTrend = xy({ x: lhM, h: 220, series: [{ name: 'Mobile', type: 'line', showSymbol: true, data: lhM.map(m => T.lh.find(x => x.m === m && x.page === S.lhPage && x.dev === 'mobile').perf), color: PAL[1] },
    { name: 'Desktop', type: 'line', showSymbol: true, data: lhM.map(m => T.lh.find(x => x.m === m && x.page === S.lhPage && x.dev === 'desktop').perf), color: PAL[0], markLine: { silent: true, symbol: 'none', lineStyle: { color: V('--good'), type: 'dashed' }, label: { formatter: 'good ≥ 90', position: 'insideEndTop', color: '#006300' }, data: [{ yAxis: 90 }] } }] });
  const pageSel = `<select data-local="lhPage" style="height:34px;border:1px solid var(--border);border-radius:9px;padding:0 10px">${lhPages.map(x => `<option ${x === S.lhPage ? 'selected' : ''}>${x}</option>`).join('')}</select>`;

  return `<div class="page-h"><div><h1 class="with-logo">${logo('google_ads', 26)}SEO & GEO</h1><p>${fmtR(r)}${p ? ` · vs ${fmtR(p)}` : ''} · Search Console, AI answer engines, PageSpeed Insights</p></div><span class="owner">Owner: SEO / content · monthly</span></div>
  <div class="sec" style="margin-top:4px">Google search</div>
  <div class="grid g6">
    ${kpi({ lbl: 'Organic clicks', cur: s.clicks, prev: sp?.clicks })}
    ${kpi({ lbl: 'Impressions', cur: s.imp, prev: sp?.imp })}
    ${kpi({ lbl: 'CTR', cur: s.ctr, prev: sp?.ctr, fmt: v => pct(v, 2) })}
    ${kpi({ lbl: 'Average position', cur: s.pos, prev: sp?.pos, better: 'down', fmt: v => v.toFixed(1) })}
    ${kpi({ lbl: 'Organic revenue', cur: orgRev, prev: orgP, fmt: eur, meta: `${eur(rpc, 2)} per organic click` })}
    ${kpi({ lbl: 'Share of search', cur: ours[ours.length - 1], prev: ours[0], fmt: v => pct(v, 1), meta: 'Our brand searches ÷ category brand searches, latest month vs 12 months ago' })}
  </div>
  <div class="grid g2" style="margin-top:14px">
    ${card('Clicks: brand vs non-brand searches', xy({ x: B, stack: 'b', h: 260, series: [{ name: 'Non-brand', data: byBucket(g.filter(x => !x.b), x => x.clicks, r), color: PAL[2] }, { name: 'Brand', data: byBucket(g.filter(x => x.b), x => x.clicks, r), color: PAL[0] }] }),
      `Brand searches = ${pct(s.br, 0)} of clicks. Non-brand clicks are new demand; brand clicks show that the other channels work.`)}
    ${card('Share of search, last 12 months', xy({ x: months, y: 'pct', h: 260, tip: v => pct(v, 1), series: brands.map((b, i) => ({ name: b, type: 'line', data: share(b), color: PAL[i], lineStyle: { width: b === US ? 3 : 2 } })) }),
      'The slow brand metric short-term numbers miss (Binet & Field). Share of search tends to lead market share. Source: Google Trends / keyword volumes, monthly.')}
  </div>

  <div class="sec">AI search (GEO) · ${logo('ChatGPT', 16)}${logo('Google AI Overviews', 16)}${logo('Perplexity', 16)}${logo('Gemini', 16)}${logo('Claude', 16)}</div>
  <div class="grid g6">
    ${kpi({ lbl: 'AI share of voice', cur: v.sov, prev: vp.sov, fmt: v => pct(v, 0), meta: 'Our mentions ÷ all brand mentions, last 4 weeks' })}
    ${kpi({ lbl: 'Mention rate', cur: v.mention, prev: vp.mention, fmt: v => pct(v, 0), meta: `${T.ai.filter(x => x.wk === weeks[weeks.length - 1] && x.brand === US).length} prompt × engine checks a week` })}
    ${kpi({ lbl: 'Citation rate', cur: v.cite, prev: vp.cite, fmt: v => pct(v, 0), meta: 'Answers that link to our site' })}
    ${kpi({ lbl: 'AI referral sessions', cur: sum(aiS, 's'), prev: aiSp, meta: 'chatgpt.com, perplexity.ai, gemini… (GA4)' })}
    ${kpi({ lbl: 'Leads from AI search', cur: sum(aiL, 'n'), meta: `${pct(div(sum(aiL, 'n'), sum(aiS, 's')))} of AI visits` })}
    ${kpi({ lbl: 'Revenue from AI search', cur: sum(aiO, 'rev'), prev: aiRp, fmt: eur, meta: `${pct(div(sum(aiO, 'n'), sum(aiS, 's')), 2)} buy · vs ${pct(div(sum(orgO, 'n'), s.clicks), 2)} organic` })}
  </div>
  <div class="grid g2" style="margin-top:14px">
    ${card('Share of voice by engine (last 4 weeks)', table([{ k: 'eng', l: 'Engine', f: v => `${logo(v)}${esc(v)}` }, { k: 'mention', l: 'Mentioned', f: v => pct(v, 0) }, { k: 'cite', l: 'Cited', f: v => pct(v, 0) },
      { k: 'sov', l: 'SoV', f: v => pct(v, 0), bar: .6 }, { k: 'd', l: 'Δ 4 wk', f: v => `<span class="delta ${v >= 0 ? 'up' : 'down'}">${v >= 0 ? '▲' : '▼'} ${Math.abs(v * 100).toFixed(1)} pt</span>` },
      { k: 'comp', l: 'Leader', al: 'l', f: (v, x) => `${esc(v)} ${pct(x.compM, 0)}` }], engRows),
      `${T.ai.filter(x => x.wk === weeks[weeks.length - 1] && x.brand === US).length / engines.length} tracked prompts asked every week on each engine. Mentioned = our brand appears in the answer; cited = the answer links to our site.`)}
    ${card('AI share of voice (4-week rolling)', xy({ x: weeks, y: 'pct', h: 280, tip: v => pct(v, 1), series: brands.map((b, i) => ({ name: b, type: 'line', data: sovW(b), color: PAL[i], lineStyle: { width: b === US ? 3 : 2 } })) }),
      'Answer engines pick a few brands per answer. Moving from 3rd to 1st mention is the GEO equivalent of moving to position 1.')}
  </div>
  <div class="grid g2" style="margin-top:14px">
    ${card('Prompts where a competitor wins', table([{ k: 'prompt', l: 'Prompt', f: v => esc(v) }, { k: 'us', l: 'Us', f: v => pct(v, 0) }, { k: 'comp', l: 'Leader', al: 'l', f: (v, x) => `${esc(v)} ${pct(x.compM, 0)}` },
      { k: 'gap', l: 'Gap', f: v => `<b style="color:${v > 0 ? '#b42424' : '#006300'}">${v > 0 ? '−' : '+'}${Math.abs(v * 100).toFixed(0)} pt</b>` }, { k: 'page', l: 'Page to improve', al: 'l' }], prompts.slice(0, 7)))}
    <div class="card"><h3>GEO readiness <span class="tag">audit-seo skill · layer 2</span></h3>
      <div style="display:flex;align-items:baseline;gap:10px;margin-top:8px"><span class="score">${passN}/${geo.length}</span><span class="sub">checks passed (${pct(passN / geo.length, 0)})</span></div>
      ${table([{ k: 'id', l: '#' }, { k: 'check', l: 'Check', al: 'l', f: v => esc(v) }, { k: 'status', l: 'Status', f: v => v === 'pass' ? '<span class="status ok"><span class="ic">✓</span>Pass</span>' : '<span class="status no"><span class="ic">!</span>Fix</span>' },
        { k: 'severity', l: 'If failing', al: 'l', f: v => sevL[v] }, { k: 'page', l: 'Page', al: 'l' }], geo)}
      <div class="note">G1–G12 = the GEO layer of the /audit-seo skill. "+1" (AI crawlers allowed in robots.txt) added here: if it fails, nothing else matters.</div></div>
  </div>
  <div class="sec">GEO actions</div>
  <div class="ins">${geoActs.map(icCard).join('')}</div>

  <div class="sec">Website health · PageSpeed Insights</div>
  <div class="grid g3">
    ${card(`Lighthouse scores, ${latest}`, radar, 'Lighthouse lab scores (0–100). Agentic browsing = how well AI agents can read and use the page (audit-seo G1). Live: PageSpeed Insights API, monthly.', pageSel)}
    <div class="span2"><div class="card"><h3>Core Web Vitals (real users, mobile)</h3>
      <div class="cwv">${cwvTile('LCP', mob.lcp, ' s', 2.5, 4.0, v => v.toFixed(1))}${cwvTile('INP', mob.inp, ' ms', 200, 500, v => Math.round(v))}${cwvTile('CLS', mob.cls, '', .1, .25, v => v.toFixed(2))}</div>
      <div class="mini" style="margin-top:14px">Performance score, last 12 months</div>${perfTrend}
      <div class="note">Google's thresholds for the 75th percentile of real visits. LCP = main content shows, INP = page reacts to taps, CLS = layout stays still.</div></div></div>
  </div>

  <div class="sec">Quick wins</div>
  ${card('Non-brand queries on page 1–2 (position 4–15), by revenue potential', table([{ k: 'q', l: 'Query', f: v => esc(v) }, { k: 'page', l: 'Page' }, { k: 'pos', l: 'Position', f: v => v.toFixed(1) },
    { k: 'imp', l: 'Impressions', f: num }, { k: 'ctr', l: 'CTR', f: v => pct(v, 2) }, { k: 'extra', l: 'Extra clicks at #3', f: num }, { k: 'rpc', l: '€ / click (page)', f: v => eur(v, 2) }, { k: 'eur', l: 'Potential revenue', f: v => eur(v), bar: wins[0]?.eur || 1 }], wins),
    'Extra clicks = impressions × (10% − current CTR); 10% ≈ average CTR at position 3. Revenue = extra clicks × that page\'s own revenue per organic click (blog pages convert far less than the homepage).')}
  <div class="sec">Pages</div>
  ${card('Organic landing pages', table([{ k: 'page', l: 'Page' }, { k: 'clicks', l: 'Clicks', f: num, bar: pages[0]?.clicks || 1 }, { k: 'imp', l: 'Impressions', f: num }, { k: 'ctr', l: 'CTR', f: v => pct(v, 2) },
    { k: 'pos', l: 'Position', f: v => v.toFixed(1) }, { k: 's', l: 'Sessions (GA4)', f: num }, { k: 'leads', l: 'Leads', f: num }, { k: 'n', l: 'Sales', f: num }, { k: 'rev', l: 'Revenue', f: v => eur(v) }], pages))}`;
} };


// ================= CREATORS =================
const CR = Object.fromEntries(T.creators.map(c => [c.id, c]));
const TYPE = { paid: ['Paid influencers', PAL[0], 'cr/paid'], affiliate: ['Affiliates', PAL[1], 'cr/affiliates'], ugc: ['UGC', PAL[2], 'cr/ugc'],
  ambassador: ['Ambassadors', PAL[3], 'cr/ambassadors'], partner: ['Partnerships', PAL[4], 'cr/partners'] };
const typeTag = t => `<span class="tag" style="background:color-mix(in srgb, ${TYPE[t][1]} 14%, #fff);color:#17120F">${TYPE[t][0]}</span>`;
const AV_TINT = ['#FFE3D6', '#DCE9FA', '#D8F2E6', '#FBEFD0', '#F9DDE8', '#E6E1FA'];
function avatar(h, plat, img) {
  const ini = h.replace(/^@/, '').split(/[._]/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
  const tint = AV_TINT[[...h].reduce((a, c) => a + c.charCodeAt(0), 0) % AV_TINT.length];
  return `<span class="av" style="background:${tint}">${img ? `<img src="${img}" alt="">` : ini}${plat ? `<i>${pIcon(plat, 12)}</i>` : ''}</span>`;
}
const handle = id => { const c = CR[id]; return `<span class="hdl">${c ? avatar(c.handle, c.platform, c.type === 'paid' ? `img/avatars/${c.id}.svg` : null) : ''}<b>${esc(c?.handle || id)}</b></span>`; };
const monthOf = d => d.slice(0, 7);

/** One pass over the period: what each creator cost and brought (same matched-revenue rule as the ad platforms). */
function crAll(r) {
  const out = Object.fromEntries(T.creators.map(c => [c.id, { id: c.id, c, sessions: 0, leads: 0, conv: 0, leadRev: 0, dirN: 0, dirRev: 0, cpOnly: 0, cpOnlyRev: 0, renRev: 0, cost: 0 }]));
  for (const x of rows('sessions', r, x => x.ch === 'creators')) if (out[x.camp]) out[x.camp].sessions += x.s;
  for (const x of rows('leads', r, x => x.ch === 'creators')) if (out[x.camp]) { const o = out[x.camp]; o.leads += x.n; o.conv += x.conv; o.leadRev += x.rev; }
  for (const x of rows('orders', r, x => x.ch === 'creators')) {
    const o = out[x.camp]; if (!o) continue;
    if (x.ren) { o.renRev += x.rev; continue; }
    if (!x.via) { o.dirN += x.n; o.dirRev += x.rev; }
    if (x.cp === 2) { o.cpOnly += x.n; o.cpOnlyRev += x.rev; }
  }
  for (const x of rows('costs', r, x => x.cat === 'creators')) if (out[x.cid]) out[x.cid].cost += x.amount;
  for (const o of Object.values(out)) { o.rev = o.leadRev + o.dirRev; o.sales = o.conv + o.dirN; o.roas = div(o.rev, o.cost); o.contrib = o.rev - o.cost; o.cac = div(o.cost, o.sales); }
  return out;
}
const sumStats = a => a.reduce((s, o) => { for (const k of ['sessions', 'leads', 'conv', 'leadRev', 'dirN', 'dirRev', 'cpOnly', 'cpOnlyRev', 'renRev', 'cost', 'rev', 'sales']) s[k] = (s[k] || 0) + o[k]; return s; }, {});
const contentIn = (r, f) => T.content.filter(x => x.d >= r[0] && x.d <= r[1] && (!f || f(x)));
const crCols = (extra = []) => [{ k: 'id', l: 'Creator', al: 'l', f: v => `${handle(v)}<div class="owner sub2">${esc(PLAT[CR[v].platform]?.[0] || CR[v].platform)}${CR[v].followers ? ' · ' + num(CR[v].followers) + (CR[v].type === 'partner' ? ' reach' : ' followers') : ''}</div>` }, ...extra];

function creatorInsights(r, A) {
  const out = [], all = crAll([MIN, MAX]);
  const paid = Object.values(all).filter(o => o.c.type === 'paid' && o.cost > 0);
  const posts = id => T.content.filter(x => x.cid === id && x.status === 'posted').length;
  const bad = paid.filter(o => posts(o.id) >= 2 && o.roas < 1).sort((a, b) => a.contrib - b.contrib)[0];
  if (bad) out.push({ id: 'cr-stop-' + bad.id, tag: 'Paid influencer', color: TYPE.paid[1], impact: -bad.contrib,
    title: `Stop rebooking ${esc(bad.c.handle)}: ${posts(bad.id)} posts returned ${xx(bad.roas)}.`,
    why: `${eur(bad.cost)} paid in fees and boosts, ${eur(bad.rev)} matched revenue so far (${num(bad.sales)} sales, ${num(bad.cpOnly)} found only by coupon).`,
    action: `Offer affiliate-only terms (20% commission, no fee) or end the collaboration.`, impactLbl: `${eur(-bad.contrib)} lost so far`, owner: 'Influencer manager · monthly' });
  const best = paid.filter(o => posts(o.id) >= 1 && o.roas >= 1.5).sort((a, b) => b.contrib - a.contrib)[0];
  if (best) out.push({ id: 'cr-rebook-' + best.id, tag: 'Paid influencer', color: TYPE.paid[1], impact: best.contrib,
    title: `Rebook ${esc(best.c.handle)}: ${xx(best.roas)} on ${posts(best.id)} post${posts(best.id) > 1 ? 's' : ''}.`,
    why: `${eur(best.rev)} matched revenue for ${eur(best.cost)}. Followers: ${num(best.c.followers)}.`,
    action: `Propose an ambassador deal: 2 posts a month, small retainer + 10% commission, so the best creator stays.`, impactLbl: `+${eur(best.contrib)} so far`, owner: 'Influencer manager · monthly' });
  for (const o of Object.values(A).filter(o => o.c.type === 'ambassador')) {
    const agreed = o.c.pm * Math.max(1, Math.round(nDays(...r) / 30));
    const done = contentIn(r, x => x.cid === o.id && x.status === 'posted').length;
    if (done / agreed < .7) out.push({ id: 'cr-amb-' + o.id + r[0].slice(0, 7), tag: 'Ambassador', color: TYPE.ambassador[1], impact: o.c.retainer * (1 - done / agreed),
      title: `${esc(o.c.handle)} posted ${done} of ${agreed} agreed posts.`,
      why: `Retainer ${eur(o.c.retainer)}/month. ROAS in this period ${xx(o.roas)}.`,
      action: `Call this week. If it happens again, move to commission-only.`, impactLbl: `${eur(o.c.retainer * (1 - done / agreed))} retainer unearned`, owner: 'Influencer manager · monthly' });
  }
  const owed = sum(T.costs.filter(x => x.cat === 'creators' && CR[x.cid]?.type === 'affiliate' && monthOf(x.d) === monthOf(MAX)), 'amount');
  const lastM = monthOf(addDays(MAX.slice(0, 8) + '01', -1));
  const nextPay = dt(MAX.slice(0, 8) + '10'); nextPay.setUTCMonth(nextPay.getUTCMonth() + 1);
  if (owed) out.push({ id: 'cr-payout-' + monthOf(MAX), tag: 'Affiliates', color: TYPE.affiliate[1], impact: owed * .5,
    title: `${eur(owed)} commission builds up this month for ${new Set(T.costs.filter(x => CR[x.cid]?.type === 'affiliate' && monthOf(x.d) === monthOf(MAX)).map(x => x.cid)).size} affiliates.`,
    why: `Last month (${lastM}) was paid on the 10th. Late payouts are the #1 reason affiliates stop promoting.`,
    action: `Approve the payout file on ${fmtD(iso(nextPay))}. Check refunds first.`, impactLbl: `${eur(owed)} due`, owner: 'Finance + marketing ops · monthly' });
  const T_ = sumStats(Object.values(A));
  if (T_.cpOnly) out.push({ id: 'cr-coupon', tag: 'Tracking', color: '#8a877f', impact: T_.cpOnlyRev * .3,
    title: `${num(T_.cpOnly)} creator sales (${eur(T_.cpOnlyRev)}) had no link click, only a coupon.`,
    why: `That is ${pct(div(T_.cpOnlyRev, T_.dirRev), 0)} of creator direct sales. Link-only tracking would miss them and make creators look worse than they are.`,
    action: `Keep one coupon per creator, on every deal. Put the code in the first line of every brief.`, impactLbl: `${eur(T_.cpOnlyRev)} recovered`, owner: 'Marketing ops' });
  const idle = T.ugc.filter(u => u.status === 'delivered' && !u.creative && nDays(u.d, MAX) > 3)[0];
  if (idle) out.push({ id: 'cr-ugc-' + idle.asset, tag: 'UGC', color: TYPE.ugc[1], impact: idle.cost * 3,
    title: `"${esc(idle.asset)}" was delivered ${nDays(idle.d, MAX) - 1} days ago and is not live.`,
    why: `${eur(idle.cost)} paid. UGC loses value as the trend it rides gets old.`,
    action: `Launch it in Prospecting · Free lesson with 2 hooks; give it 7 days and €150 before judging.`, impactLbl: `${eur(idle.cost)} sitting idle`, owner: 'Creative lead · weekly' });
  return out.sort((a, b) => b.impact - a.impact).slice(0, 4).sort((a, b) => !!store.get('done:' + a.id) - !!store.get('done:' + b.id));
}

function platformBlock(r, A) {
  const keys = Object.keys(PLAT), mine = Object.values(A).filter(o => o.c.type !== 'ugc');  // UGC sells through Meta ads
  const plays = id => sum(contentIn(r, x => x.cid === id && x.status === 'posted'), 'plays');
  const rowsP = keys.map(k => { const g = mine.filter(o => platKey(o.c) === k), t = sumStats(g);
    const withPlays = g.filter(o => plays(o.id) > 0);  // affiliates have revenue but no plays: keep them out of € per 1k plays
    return { k, n: g.filter(o => o.cost || o.rev).length, plays: sum(g, o => plays(o.id)), rpk: div(sum(withPlays, 'rev'), sum(withPlays, o => plays(o.id)) / 1000), ...t, roas: div(t.rev, t.cost), contrib: (t.rev || 0) - (t.cost || 0) }; })
    .filter(x => x.n).sort((a, b) => b.rev - a.rev);
  const ig = rowsP.find(x => x.k === 'instagram'), fb = rowsP.find(x => x.k === 'facebook');
  const meta = (ig || fb) && { rev: (ig?.rev || 0) + (fb?.rev || 0), cost: (ig?.cost || 0) + (fb?.cost || 0), sales: (ig?.sales || 0) + (fb?.sales || 0) };
  const ordC = rows('orders', r, x => !x.ren && x.ch === 'creators' && CR[x.camp] && CR[x.camp].type !== 'ugc'), B = buckets(r);
  const rich = Object.fromEntries(keys.filter(k => PLAT[k][2]).map(k => [k, { height: 16, width: 16, backgroundColor: { image: `vendor/logos/${PLAT[k][2]}.svg` } }]));
  const bars = chart({ textStyle: { fontFamily: 'Inter Tight' }, grid: { left: 6, right: 40, top: 6, bottom: 6, containLabel: true },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: '#fff', borderColor: '#E4E4E4', textStyle: { color: '#17120F', fontSize: 12 },
      formatter: q => { const x = rowsP[q[0].dataIndex]; return `<b>${PLAT[x.k][0]}</b><br>Revenue ${eur(x.rev)}<br>Cost ${eur(x.cost)}<br>ROAS ${xx(x.roas)}<br>${num(x.sales)} sales · ${x.n} creators`; } },
    yAxis: { type: 'category', inverse: true, data: rowsP.map(x => x.k), axisTick: { show: false }, axisLine: { show: false },
      axisLabel: { formatter: k => `${PLAT[k][2] ? `{${k}|} ` : ''}{t|${PLAT[k][0]}}`, rich: { ...rich, t: { color: '#17120F', fontWeight: 500, padding: [0, 0, 0, 4] } } } },
    xAxis: { type: 'value', splitLine: { lineStyle: { color: '#ecebe6' } }, axisLabel: { color: '#6B6B6B', formatter: eurK } },
    series: [{ type: 'bar', barMaxWidth: 20, data: rowsP.map(x => ({ value: x.rev, itemStyle: { color: PLAT[x.k][1], borderRadius: [0, 4, 4, 0] } })),
      label: { show: true, position: 'right', color: '#4a4a4a', fontWeight: 500, formatter: q => eurK(q.value) } }] }, Math.max(200, rowsP.length * 42));
  const trend = xy({ x: B, y: 'eur', stack: 'pl', h: 260, series: rowsP.map(x => ({ name: PLAT[x.k][0], data: byBucket(ordC.filter(o => platKey(CR[o.camp]) === x.k), o => o.rev, r), color: PLAT[x.k][1] })) });
  return `<div class="grid g2">
    ${card('Revenue by platform', bars, meta ? `Meta (Instagram + Facebook) together: <b>${eur(meta.rev)}</b> revenue, ${xx(div(meta.rev, meta.cost))} ROAS. UGC is left out: it sells through Meta ads (see UGC).` : '')}
    ${card('Revenue by platform over time (sale-dated)', trend)}
  </div>
  <div style="margin-top:14px">${card('Platform scorecard', table([{ k: 'k', l: 'Platform', al: 'l', f: k => `<span class="hdl">${pIcon(k)}<b>${PLAT[k][0]}</b></span>` }, { k: 'n', l: 'Creators', f: num },
    { k: 'plays', l: 'Plays', f: v => v ? num(v) : '–' }, { k: 'sessions', l: 'Visits', f: num }, { k: 'leads', l: 'Leads', f: num }, { k: 'sales', l: 'Sales', f: num },
    { k: 'rev', l: 'Revenue', f: v => eur(v), bar: rowsP[0]?.rev || 1 }, { k: 'cost', l: 'Cost', f: v => eur(v) }, { k: 'roas', l: 'ROAS', f: xx, cls: x => x.roas == null ? '' : x.roas >= 1 ? 'good' : 'bad' },
    { k: 'contrib', l: 'Contribution', f: v => `<span style="color:${v >= 0 ? '#006300' : '#b42424'};font-weight:500">${eur(v)}</span>` }, { k: 'rpk', l: '€ / 1k plays', f: v => v == null ? '–' : eur(v, 2) }], rowsP),
    'Platform = where the creator publishes. Revenue = matched (lead-dated + direct, incl. coupon-only). € / 1k plays = revenue of creators who post content ÷ their plays, so platforms compare on the same reach.')}</div>`;
}

PAGES['cr/overview'] = { filters: [], render() {
  const r = R(), p = prevRange(), B = buckets(r), A = crAll(r), AP = p ? crAll(p) : null;
  const T_ = sumStats(Object.values(A)), TP = AP && sumStats(Object.values(AP));
  const byType = Object.keys(TYPE).map(t => ({ t, ...sumStats(Object.values(A).filter(o => o.c.type === t)) }));
  const cont = contentIn(r), planned = T.content.filter(x => x.status === 'planned');
  const due = sum(cont.filter(x => x.status === 'posted' && !x.paid), 'cost');
  const board = Object.values(A).filter(o => o.cost || o.rev).sort((a, b) => b.contrib - a.contrib);
  const ordC = rows('orders', r, x => !x.ren && x.ch === 'creators');
  const revType = t => byBucket(ordC.filter(x => CR[x.camp]?.type === t), x => x.rev, r);
  const maxC = Math.max(...board.map(o => Math.abs(o.contrib)), 1);
  return `<div class="page-h"><div><h1>Creators</h1><p>${fmtR(r)}${p ? ` · vs ${fmtR(p)}` : ''} · paid influencers, affiliates, UGC, ambassadors, partnerships</p></div><span class="owner">Owner: influencer manager · source: creator sheet + shop + CRM</span></div>
  <div class="grid g6">
    ${kpi({ lbl: 'Creator cost', cur: T_.cost, prev: TP?.cost, better: 'down', fmt: eur, meta: 'Fees, boosts, commissions, retainers, UGC' })}
    ${kpi({ lbl: 'Matched revenue', cur: T_.rev, prev: TP?.rev, fmt: eur, meta: 'Lead-dated + direct, incl. coupon-only' })}
    ${kpi({ lbl: 'Creator ROAS', cur: div(T_.rev, T_.cost), prev: TP && div(TP.rev, TP.cost), fmt: xx })}
    ${kpi({ lbl: 'Contribution', cur: T_.rev - T_.cost, prev: TP && TP.rev - TP.cost, fmt: eur })}
    ${kpi({ lbl: 'Sales found only by coupon', cur: T_.cpOnly, prev: TP?.cpOnly, meta: `${eur(T_.cpOnlyRev)} a link-only setup would miss` })}
    ${kpi({ lbl: 'Content', val: `${num(cont.filter(x => x.status === 'posted').length)} <small style="font-size:14px;color:var(--muted)">posted</small>`, meta: `${num(planned.length)} planned · ${eur(due)} still to pay` })}
  </div>
  <div class="sec">What to do next</div>
  <div class="ins">${creatorInsights(r, A).map(icCard).join('')}</div>
  <div class="grid g2" style="margin-top:14px">
    ${card('Revenue vs cost by creator type', chart({ textStyle: { fontFamily: 'Inter Tight' }, grid: { left: 6, right: 14, top: 18, bottom: 44, containLabel: true },
      tooltip: { trigger: 'axis', valueFormatter: v => eur(v), backgroundColor: '#fff', borderColor: '#E4E4E4', textStyle: { color: '#17120F', fontSize: 12 } },
      legend: { bottom: 0, icon: 'roundRect', itemWidth: 10, itemHeight: 10, textStyle: { color: '#4a4a4a' } },
      xAxis: { type: 'category', data: byType.map(x => TYPE[x.t][0]), axisTick: { show: false }, axisLine: { lineStyle: { color: '#c3c2b7' } }, axisLabel: { color: '#4a4a4a', fontWeight: 500 } },
      yAxis: { type: 'value', splitLine: { lineStyle: { color: '#ecebe6' } }, axisLabel: { color: '#6B6B6B', formatter: eurK } },
      series: [{ name: 'Matched revenue', type: 'bar', barMaxWidth: 34, data: byType.map(x => ({ value: x.rev, itemStyle: { color: TYPE[x.t][1], borderRadius: [4, 4, 0, 0] } })) },
        { name: 'Cost', type: 'bar', barMaxWidth: 34, data: byType.map(x => x.cost), itemStyle: { color: '#17120F', borderRadius: [4, 4, 0, 0] } }] }, 280),
      'UGC revenue shows on the UGC page: it runs as Meta ads, so its sales sit under Meta.')}
    ${card('Creator revenue over time, by type (sale-dated)', xy({ x: B, y: 'eur', stack: 't', h: 280, series: Object.keys(TYPE).filter(t => t !== 'ugc').map(t => ({ name: TYPE[t][0], data: revType(t), color: TYPE[t][1] })) }))}
  </div>
  <div class="sec">Which platform brings the most revenue</div>
  ${platformBlock(r, A)}
  <div class="sec">Leaderboard</div>
  ${card('Every creator, ranked by contribution (revenue − what we paid)', table(crCols([{ k: 'type', l: 'Type', al: 'l', f: (v, o) => typeTag(o.c.type) },
    { k: 'cost', l: 'Cost', f: v => eur(v) }, { k: 'sessions', l: 'Visits', f: num }, { k: 'leads', l: 'Leads', f: num }, { k: 'sales', l: 'Sales', f: num },
    { k: 'cpOnly', l: 'Coupon-only', f: num }, { k: 'rev', l: 'Revenue', f: v => eur(v) }, { k: 'roas', l: 'ROAS', f: xx, cls: o => o.roas == null ? '' : o.roas >= 1 ? 'good' : 'bad' },
    { k: 'contrib', l: 'Contribution', f: v => `<span style="color:${v >= 0 ? '#006300' : '#b42424'};font-weight:500">${eur(v)}</span>`, bar: maxC }]), board),
    'Revenue = what the creator\'s leads bought (dated by sign-up) + direct sales through their link or coupon. A coupon with no link click still counts (coupon-only).')}`;
} };

function postWindow(x) {  // what a post brought: the creator's traffic and sales in the 14 days from the post
  const r = [x.d, addDays(x.d, 13) > MAX ? MAX : addDays(x.d, 13)];
  const L = rows('leads', r, y => y.ch === 'creators' && y.camp === x.cid), O = rows('orders', r, y => !y.ren && y.ch === 'creators' && y.camp === x.cid && !y.via);
  const rev = sum(L, 'rev') + sum(O, 'rev');
  return { leads: sum(L, 'n'), sales: sum(L, 'conv') + sum(O, 'n'), rev };
}
const CAPTIONS = [
  'Our evening routine now ends with 10 minutes of English songs. She asks for it before I do 🎶',
  'Honest review after 3 weeks: he counts to 20 in English and corrects MY accent 😅 Code in bio.',
  'POV: your 5-year-old orders ice cream in English on holiday. Worth every minute.',
  'We tried the free lesson on a rainy Sunday. Two hours later she was still singing the colours song.',
  'No screens at dinner, but this is the one app I say yes to. Short lessons, real progress.',
  'Bilingual by 7? We\'re not there yet, but the first 100 words came faster than I thought.',
  'Teacher here: this is the order I would teach English sounds in. The app does exactly that.',
  'Car ride challenge: name 10 animals in English. He won. Link + 10% code below 👇',
];
const disp = h => h.replace(/^@/, '').split(/[._]/).map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
const VERIFIED = '<svg class="vf" viewBox="0 0 24 24"><path fill="#FA5D29" d="M12 1.5l2.6 2 3.2-.3.9 3.1 2.8 1.6-1 3.1 1 3.1-2.8 1.6-.9 3.1-3.2-.3-2.6 2-2.6-2-3.2.3-.9-3.1-2.8-1.6 1-3.1-1-3.1 2.8-1.6.9-3.1 3.2.3z"/><path d="m8 12.2 2.6 2.6L16 9.4" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
/** The 5 posts that drove the most revenue in the period (leads as tie-break), as social-post cards. */
function top5(posts) {
  const best = [...posts].sort((a, b) => b.rev - a.rev || b.leads - a.leads).slice(0, 5);
  if (!best.length) return '<div class="card"><p class="sub">No paid posts went live in this period.</p></div>';
  const st = (ic, v, l) => `<span title="${l}">${ICON[ic]}${v}</span>`;
  return `<div class="posts5">${best.map((x, i) => { const c = CR[x.cid];
    const age = (dt(MAX) - dt(x.d)) / 864e5 + 1, live = age < 14;  // results window still open
    return `<article class="pcard">
      <header><img class="av" src="img/avatars/${c.id}.svg" alt=""><div class="who"><b><span>${esc(disp(c.handle))}</span>${c.followers > 20000 ? VERIFIED : ''}</b><span>${esc(c.handle)}</span></div>
        <a class="pl" href="${esc(x.url)}" target="_blank" rel="noopener" title="Open the post">${pIcon(c.platform, 20)}</a></header>
      <p>${esc(CAPTIONS[(best[0].id + i) % CAPTIONS.length])}</p>
      <div class="eng">${st('play', num(x.plays), 'Plays')}${st('heart', num(x.likes), 'Likes')}${st('chat', num(x.comments), 'Comments')}<span class="rk">#${i + 1}</span></div>
      <div class="res"><div><b>${num(x.leads)}</b>Leads</div><div><b>${num(x.sales)}</b>Sales</div><div><b>${eur(x.rev)}</b>Revenue</div>
        <div><b class="${live ? '' : x.roas >= 1 ? 'up' : 'dn'}">${xx(x.roas)}</b>ROAS</div></div>
      <footer>${fmtD(x.d).slice(0, -5)} · ${live ? `<span class="accent">Day ${age} of 14, results so far</span> · ` : ''}${eur(x.cost)} fee${x.boost ? ` + ${eur(x.boost)} boost` : ''} · ${x.format}</footer></article>`; }).join('')}</div>`;
}
PAGES['cr/paid'] = { filters: [], render() {
  const r = R(), A = crAll(r), mine = Object.values(A).filter(o => o.c.type === 'paid'), T_ = sumStats(mine);
  const posts = contentIn(r, x => x.type === 'paid' && x.status === 'posted').map(x => ({ ...x, ...postWindow(x) }))
    .map(x => ({ ...x, ocpm: div(x.cost, x.plays / 1000), pcpm: x.boost ? div(x.boost, x.boost_imp / 1000) : null, roas: div(x.rev, x.cost + x.boost) })).sort((a, b) => b.d.localeCompare(a.d));
  const planned = T.content.filter(x => x.type === 'paid' && x.status === 'planned');
  const plays = sum(posts, 'plays'), fees = sum(posts, 'cost'), boost = sum(posts, 'boost'), bImp = sum(posts, 'boost_imp');
  const paidAmt = sum(posts.filter(x => x.paid), 'cost'), due = fees - paidAmt;
  const allPosted = T.content.filter(x => x.type === 'paid' && x.status === 'posted' && x.plays);
  const cpms = allPosted.map(x => x.cost / (x.plays / 1000)).sort((a, b) => a - b), medCpm = cpms[Math.floor(cpms.length / 2)];
  const allRev = allPosted.map(postWindow), revPerK = div(sum(allRev, 'rev'), sum(allPosted, 'plays') / 1000);
  const quotes = T.quotes.map(q => ({ ...q, cpm: q.fee / (q.avg_views / 1000), expRoas: div(q.avg_views / 1000 * revPerK, q.fee) }));
  const statusChip = v => ({ pending: '<span class="sev s1">Pending</span>', accepted: '<span class="status ok"><span class="ic">✓</span>Accepted</span>', declined: '<span class="status no"><span class="ic">✕</span>Declined</span>' })[v];
  return `<div class="page-h"><div><h1>Paid influencers</h1><p>${fmtR(r)} · flat fee per post, optional boost as partnership ad</p></div><span class="owner">Owner: influencer manager · per post</span></div>
  <div class="hero" style="margin-bottom:14px">
    <div><div class="hv">${num(posts.length)}</div><div class="hl">Posts published</div><div class="hs">${num(planned.length)} planned</div></div>
    <div><div class="hv">${eur(fees)}</div><div class="hl">Content cost</div><div class="hs">paid ${eur(paidAmt)} · <span class="accent">to pay ${eur(due)}</span></div></div>
    <div><div class="hv">${num(plays)}</div><div class="hl">Organic plays</div></div>
    <div><div class="hv">${eur(div(fees, plays / 1000), 2)}</div><div class="hl">Blended organic CPM</div></div>
    <div><div class="hv">${eur(boost)}</div><div class="hl">Boost spend</div><div class="hs">${num(bImp)} impressions · CPM ${eur(div(boost, bImp / 1000), 2)}</div></div>
    <div><div class="hv accent">${xx(div(T_.rev, T_.cost))}</div><div class="hl">ROAS (matched)</div><div class="hs">${eur(T_.rev)} revenue · ${num(T_.sales)} sales</div></div>
  </div>
  <div class="sec">Top 5 posts ${{ 7: 'of the week', 30: 'of the month', 90: 'of the quarter', 365: 'of the year' }[S.preset] || 'in the period'}</div>
  ${top5(posts)}
  ${card('Posts', table([{ k: 'cid', l: 'Creator', al: 'l', f: v => handle(v) }, { k: 'd', l: 'Published', f: v => fmtD(v) }, { k: 'url', l: 'Link', f: v => `<a href="${esc(v)}" target="_blank" rel="noopener">view</a>` },
    { k: 'inv', l: 'Invoice', f: v => v ? '<span class="status ok"><span class="ic">✓</span>Received</span>' : '<span class="sev s1">Missing</span>' },
    { k: 'cost', l: 'Fee', f: v => eur(v) }, { k: 'paid', l: 'Paid', f: v => v ? '<span class="status ok"><span class="ic">✓</span>Paid</span>' : '<span class="status no"><span class="ic">!</span>To pay</span>' },
    { k: 'cid', l: 'Payment', f: v => esc(CR[v].payment) }, { k: 'likes', l: 'Likes', f: num }, { k: 'comments', l: 'Comm.', f: num }, { k: 'plays', l: 'Plays', f: num },
    { k: 'ocpm', l: 'Organic CPM', f: v => eur(v, 2), cls: x => x.ocpm <= medCpm ? 'good' : 'bad' }, { k: 'boost', l: 'Boost', f: v => v ? eur(v) : '–' }, { k: 'pcpm', l: 'Paid CPM', f: v => v == null ? '–' : eur(v, 2) },
    { k: 'leads', l: 'Leads', f: num }, { k: 'sales', l: 'Sales', f: num }, { k: 'rev', l: 'Revenue', f: v => eur(v) }, { k: 'roas', l: 'ROAS', f: xx, cls: x => addDays(x.d, 13) > MAX ? '' : x.roas >= 1 ? 'good' : 'bad' }], posts),
    `Results per post = the creator's leads and link/coupon sales in the 14 days after it went live (ROAS stays grey until the 14 days are over). Organic CPM = fee ÷ (plays / 1,000); green = cheaper than our median ${eur(medCpm, 2)}.`)}
  <div style="margin-top:14px">${card(`Quotations (${quotes.length})`, table([{ k: 'handle', l: 'Creator', al: 'l', f: (v, q) => `<span class="hdl">${avatar(v, q.platform)}<b>${esc(v)}</b></span><div class="owner sub2">${PLAT[q.platform][0]} · ${num(q.followers)} followers</div>` },
      { k: 'handle', l: 'Profile', al: 'l', f: v => `<a class="prof" href="https://example.com/${esc(v)}" target="_blank" rel="noopener" title="Open the creator's profile">${ICON.ext}Profile</a>` },
      { k: 'deliverables', l: 'Offer', al: 'l', f: v => esc(v) }, { k: 'fee', l: 'Quote', f: v => eur(v) }, { k: 'avg_views', l: 'Avg views', f: num },
      { k: 'cpm', l: 'Quoted CPM', f: v => eur(v, 2), cls: q => q.cpm <= medCpm ? 'good' : 'bad' }, { k: 'expRoas', l: 'Expected ROAS', f: xx, cls: q => q.expRoas >= 1 ? 'good' : 'bad' },
      { k: 'status', l: 'Status', al: 'l', f: statusChip }], quotes),
      `Expected ROAS = avg views × our revenue per 1,000 plays (${eur(revPerK, 2)}, from past posts) ÷ quote. Counter-offer anything above the ${eur(medCpm, 2)} median CPM. Profile links are placeholders in the sandbox.`)}</div>
  </div>`;
} };

PAGES['cr/affiliates'] = { filters: [], render() {
  const r = R(), p = prevRange(), B = buckets(r), A = crAll(r), AP = p ? crAll(p) : null;
  const mine = Object.values(A).filter(o => o.c.type === 'affiliate'), T_ = sumStats(mine), TP = AP && sumStats(Object.values(AP).filter(o => o.c.type === 'affiliate'));
  const curM = monthOf(MAX);
  const comm = T.costs.filter(x => CR[x.cid]?.type === 'affiliate');
  const owedNow = sum(comm.filter(x => monthOf(x.d) === curM), 'amount');
  const rowsA = mine.map(o => ({ ...o, comm: o.cost, profit: o.rev - o.cost, epc: div(o.cost, o.sessions), cvr: div(o.sales, o.sessions), owed: sum(comm.filter(x => x.cid === o.id && monthOf(x.d) === curM), 'amount') })).sort((a, b) => b.profit - a.profit);
  const top = rowsA.slice(0, 5).map(o => o.id), ordA = rows('orders', r, x => !x.ren && x.ch === 'creators' && CR[x.camp]?.type === 'affiliate');
  const payM = Object.entries(groupBy(comm, x => monthOf(x.d))).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 8).map(([m, a]) => ({ m, n: new Set(a.map(x => x.cid)).size, amt: sum(a, 'amount') }));
  const payDay = m => { const d = dt(m + '-10'); d.setUTCMonth(d.getUTCMonth() + 1); return iso(d); };
  return `<div class="page-h"><div><h1>Affiliates</h1><p>${fmtR(r)} · 20% commission on new sales, credited by link or coupon</p></div><span class="owner">Owner: partnerships · payout on the 10th</span></div>
  <div class="grid g6">
    ${kpi({ lbl: 'Active affiliates', cur: mine.filter(o => o.sessions > 0).length })}
    ${kpi({ lbl: 'Clicks (visits)', cur: T_.sessions, prev: TP?.sessions })}
    ${kpi({ lbl: 'Sales', cur: T_.sales, prev: TP?.sales, meta: `${pct(div(T_.sales, T_.sessions), 2)} of visits buy` })}
    ${kpi({ lbl: 'Revenue', cur: T_.rev, prev: TP?.rev, fmt: eur })}
    ${kpi({ lbl: 'Commission (20%)', cur: T_.cost, prev: TP?.cost, better: 'down', fmt: eur, meta: `${eur(owedNow)} owed for ${curM}` })}
    ${kpi({ lbl: 'Profit after commission', cur: T_.rev - T_.cost, prev: TP && TP.rev - TP.cost, fmt: eur })}
  </div>
  <div class="grid g3" style="margin-top:14px">
    <div class="span2">${card('Revenue by affiliate (top 5 + others)', xy({ x: B, y: 'eur', stack: 'a', h: 400, series: [...top.map((id, i) => ({ name: CR[id].handle, data: byBucket(ordA.filter(x => x.camp === id), x => x.rev, r), color: PAL[i] })),
      { name: 'Others', data: byBucket(ordA.filter(x => !top.includes(x.camp)), x => x.rev, r), color: V('--unk') }] }))}</div>
    ${card('Payouts', table([{ k: 'm', l: 'Month', al: 'l' }, { k: 'n', l: 'Affiliates', f: num }, { k: 'amt', l: 'Commission', f: v => eur(v, 2) },
      { k: 'm', l: 'Status', al: 'l', f: m => m === curM ? `<span class="sev s1">Due ${fmtD(payDay(m))}</span>` : '<span class="status ok"><span class="ic">✓</span>Paid</span>' }], payM),
      'Commission accrues on the order date; refunds within 14 days are reversed before payout.')}
  </div>
  <div class="sec">Affiliates</div>
  ${card('Every affiliate, ranked by profit after commission', table(crCols([{ k: 'since', l: 'Since', f: (v, o) => fmtD(o.c.since) }, { k: 'sessions', l: 'Clicks', f: num }, { k: 'sales', l: 'Sales', f: num },
    { k: 'cvr', l: 'Conv.', f: v => pct(v, 2) }, { k: 'cpOnly', l: 'Coupon-only', f: num }, { k: 'rev', l: 'Revenue', f: v => eur(v) }, { k: 'comm', l: 'Commission', f: v => eur(v) },
    { k: 'owed', l: 'Owed now', f: v => v ? eur(v, 2) : '–' }, { k: 'epc', l: 'EPC', f: v => eur(v, 2) }, { k: 'profit', l: 'Profit', f: v => eur(v), bar: rowsA[0]?.profit || 1 },
    { k: 'coupon', l: 'Coupon', al: 'l', f: (v, o) => `<code>${esc(o.c.coupon)}</code>` }]), rowsA),
    'EPC = what the affiliate earns per click (commission ÷ clicks): the number affiliates compare programmes on. Above €0.50 keeps good affiliates promoting.')}`;
} };

PAGES['cr/ugc'] = { filters: [], render() {
  const r = R(), cr = rows('creatives', r), crO = rows('orders', r, x => !x.ren && x.ch === 'meta' && x.cr);
  const assets = T.ugc.map(u => {
    const a = cr.filter(x => x.creative === u.creative), o = crO.filter(x => x.cr === u.creative), spend = sum(a, 'cost'), rev = sum(o, 'rev');
    const all_ = T.creatives.filter(x => x.creative === u.creative), first = all_.slice(0, 14), last = all_.filter(x => x.d <= r[1]).slice(-14);
    const ratio = u.creative ? div(div(sum(last, 'clicks'), sum(last, 'imp')), div(sum(first, 'clicks'), sum(first, 'imp'))) : null;
    const live = u.creative ? (all_.length ? nDays(all_[0].d, MAX) : 0) : 0;
    return { ...u, spend, imp: sum(a, 'imp'), ctr: div(sum(a, 'clicks'), sum(a, 'imp')), hook: div(sum(a, 'v3s'), sum(a, 'imp')), n: sum(o, 'n'), rev, roas: div(rev, spend), live, ratio,
      net: rev - spend - (u.d >= r[0] && u.d <= r[1] ? u.cost : 0) };
  });
  const st = x => x.status === 'planned' ? `<span class="sev s1">Due ${fmtD(x.d)}</span>` : !x.creative ? '<span class="status no"><span class="ic">!</span>Not live</span>'
    : x.ratio < .7 ? '<span class="status no"><span class="ic">!</span>Fatigued</span>' : '<span class="status ok"><span class="ic">✓</span>Running</span>';
  const live = assets.filter(x => x.creative);
  return `<div class="page-h"><div><h1>UGC</h1><p>${fmtR(r)} · creators paid per asset; the content runs as our Meta ads</p></div><span class="owner">Owner: creative lead · weekly</span></div>
  <div class="grid g6">
    ${kpi({ lbl: 'Assets delivered', cur: T.ugc.filter(x => x.status === 'delivered').length, meta: `${T.ugc.filter(x => x.status === 'planned').length} in production` })}
    ${kpi({ lbl: 'Paid to creators', cur: sum(T.ugc.filter(x => x.status === 'delivered'), 'cost'), fmt: eur, meta: `${eur(div(sum(T.ugc, 'cost'), T.ugc.length))} per asset` })}
    ${kpi({ lbl: 'Ad spend on UGC', cur: sum(live, 'spend'), fmt: eur })}
    ${kpi({ lbl: 'Revenue from UGC ads', cur: sum(live, 'rev'), fmt: eur })}
    ${kpi({ lbl: 'UGC ROAS', cur: div(sum(live, 'rev'), sum(live, 'spend')), fmt: xx, target: TG.roas_meta, meta: 'Floor: sales tagged with the ad' })}
    ${kpi({ lbl: 'Avg hook rate', cur: div(sum(live, x => x.hook * x.imp), sum(live, 'imp')), fmt: v => pct(v, 0), meta: '3-second views ÷ impressions' })}
  </div>
  <div class="grid g2" style="margin-top:14px">
    ${card('ROAS per asset', chart({ textStyle: { fontFamily: 'Inter Tight' }, grid: { left: 6, right: 20, top: 10, bottom: 10, containLabel: true }, tooltip: { trigger: 'axis', valueFormatter: xx },
      yAxis: { type: 'category', data: live.map(x => x.asset), axisTick: { show: false }, axisLine: { show: false }, axisLabel: { color: '#17120F' } }, xAxis: { type: 'value', splitLine: { lineStyle: { color: '#ecebe6' } }, axisLabel: { color: '#6B6B6B', formatter: v => v + '×' } },
      series: [{ type: 'bar', barMaxWidth: 18, data: live.map(x => ({ value: x.roas, itemStyle: { color: x.roas >= TG.roas_meta ? PAL[2] : PAL[7], borderRadius: [0, 4, 4, 0] } })),
        markLine: { silent: true, symbol: 'none', lineStyle: { color: V('--bad'), type: 'dashed' }, label: { formatter: `target ${xx(TG.roas_meta)}`, color: '#b42424' }, data: [{ xAxis: TG.roas_meta }] } }] }, 220))}
    ${card('Hook rate per asset', chart({ textStyle: { fontFamily: 'Inter Tight' }, grid: { left: 6, right: 20, top: 10, bottom: 10, containLabel: true }, tooltip: { trigger: 'axis', valueFormatter: v => pct(v, 0) },
      yAxis: { type: 'category', data: live.map(x => x.asset), axisTick: { show: false }, axisLine: { show: false }, axisLabel: { color: '#17120F' } }, xAxis: { type: 'value', splitLine: { lineStyle: { color: '#ecebe6' } }, axisLabel: { color: '#6B6B6B', formatter: v => (v * 100) + '%' } },
      series: [{ type: 'bar', barMaxWidth: 18, data: live.map(x => x.hook), itemStyle: { color: PAL[0], borderRadius: [0, 4, 4, 0] } }] }, 220), 'Hook rate above 25% = the first 3 seconds work. Below 15%: re-cut the opening, keep the body.')}
  </div>
  <div class="sec">Assets</div>
  ${card('Every UGC asset, from delivery to results', table([{ k: 'asset', l: 'Asset', al: 'l', f: v => `<b>${esc(v)}</b>` }, { k: 'cid', l: 'Creator', al: 'l', f: v => handle(v) }, { k: 'd', l: 'Delivered', f: v => fmtD(v) },
    { k: 'cost', l: 'Cost', f: v => eur(v) }, { k: 'spend', l: 'Ad spend', f: v => v ? eur(v) : '–' }, { k: 'imp', l: 'Impr.', f: num }, { k: 'ctr', l: 'CTR', f: v => pct(v, 2) }, { k: 'hook', l: 'Hook rate', f: v => pct(v, 0) },
    { k: 'n', l: 'Sales', f: num }, { k: 'rev', l: 'Revenue', f: v => eur(v) }, { k: 'roas', l: 'ROAS', f: xx, cls: x => x.roas == null ? '' : x.roas >= TG.roas_meta ? 'good' : 'bad' }, { k: 'live', l: 'Days live', f: num }, { k: 'status', l: 'Status', al: 'l', f: (v, x) => st(x) }], assets),
    'Results come from the Meta creative with the same name (see Meta Ads → Creatives). Fatigued = CTR in the last 14 days below 70% of its first 14 days.')}`;
} };

PAGES['cr/ambassadors'] = { filters: [], render() {
  const r = R(), A = crAll(r), months = Math.max(1, Math.round(nDays(...r) / 30.4));
  const amb = Object.values(A).filter(o => o.c.type === 'ambassador').map(o => {
    const done = contentIn(r, x => x.cid === o.id && x.status === 'posted').length, agreed = o.c.pm * months;
    return { ...o, done, agreed, rate: div(done, agreed), planned: T.content.filter(x => x.cid === o.id && x.status === 'planned').length };
  }).sort((a, b) => b.contrib - a.contrib);
  const T_ = sumStats(amb), mB = [...new Set(T.content.filter(x => x.type === 'ambassador' && x.d <= MAX).map(x => monthOf(x.d)))].sort().slice(-12);
  const bar = v => `<div style="display:flex;align-items:center;gap:8px;justify-content:flex-end"><div style="width:90px;height:8px;border-radius:4px;background:#efeeeb;overflow:hidden"><i style="display:block;height:100%;width:${Math.min(100, v * 100)}%;background:${v >= .9 ? 'var(--good)' : v >= .7 ? 'var(--warn)' : 'var(--bad)'}"></i></div>${pct(v, 0)}</div>`;
  return `<div class="page-h"><div><h1>Ambassadors</h1><p>${fmtR(r)} · long-term creators: monthly retainer + 10% commission, agreed posts per month</p></div><span class="owner">Owner: influencer manager · monthly check-in</span></div>
  <div class="grid g6">
    ${kpi({ lbl: 'Ambassadors', cur: amb.length })}
    ${kpi({ lbl: 'Posts delivered', val: `${num(sum(amb, 'done'))} / ${num(sum(amb, 'agreed'))}`, meta: `${pct(div(sum(amb, 'done'), sum(amb, 'agreed')), 0)} of what was agreed` })}
    ${kpi({ lbl: 'Cost', cur: T_.cost, fmt: eur, meta: 'Retainers + commission' })}
    ${kpi({ lbl: 'Matched revenue', cur: T_.rev, fmt: eur })}
    ${kpi({ lbl: 'ROAS', cur: div(T_.rev, T_.cost), fmt: xx })}
    ${kpi({ lbl: 'Renewals from their buyers', cur: T_.renRev, fmt: eur, meta: 'Customers who stay: the reason to keep ambassadors' })}
  </div>
  <div class="sec">Ambassadors</div>
  ${card('Delivery and results', table(crCols([{ k: 'since', l: 'Since', f: (v, o) => fmtD(o.c.since) }, { k: 'ret', l: 'Retainer', f: (v, o) => eur(o.c.retainer) + '/mo' }, { k: 'agreed', l: 'Agreed', f: num }, { k: 'done', l: 'Posted', f: num },
    { k: 'rate', l: 'Delivery', f: v => bar(v) }, { k: 'planned', l: 'Planned', f: num }, { k: 'leads', l: 'Leads', f: num }, { k: 'sales', l: 'Sales', f: num }, { k: 'rev', l: 'Revenue', f: v => eur(v) },
    { k: 'renRev', l: 'Renewals', f: v => eur(v) }, { k: 'cost', l: 'Cost', f: v => eur(v) }, { k: 'roas', l: 'ROAS', f: xx, cls: o => o.roas >= 1 ? 'good' : 'bad' }]), amb),
    'Delivery = posts published ÷ posts agreed in the contract for this period. Below 70% two months in a row → move to commission-only.')}
  <div style="margin-top:14px">${card('Posts per month, last 12 months', xy({ x: mB, stack: 'p', h: 260, series: amb.map((o, i) => ({ name: o.c.handle, data: mB.map(m => T.content.filter(x => x.cid === o.id && x.status === 'posted' && monthOf(x.d) === m).length), color: PAL[i] })) }),
    `Agreed in total: ${num(sum(amb, x => x.c.pm))} posts a month.`)}</div>`;
} };

PAGES['cr/partners'] = { filters: [], render() {
  const A = crAll([MIN, MAX]);
  const P = T.partners.map(x => ({ ...x, ...A[x.id], cost: x.cost })).map(x => ({ ...x, per1k: div(x.rev, x.reach / 1000) }));
  const cols = [['contacted', 'Contacted'], ['negotiating', 'Negotiating'], ['agreed', 'Agreed'], ['published', 'Published'], ['declined', 'Declined']];
  const pub = P.filter(x => x.status === 'published').sort((a, b) => b.d.localeCompare(a.d));
  const kan = `<div class="kanban">${cols.map(([k, l]) => { const items = P.filter(x => x.status === k);
    return `<div class="kcol"><div class="khd"><span>${l}</span><b>${items.length}</b></div>${items.map(x => `<div class="kcard ${k}"><span class="hdl">${pIcon(x.kind)}<b>${esc(x.partner)}</b></span>
      <div class="owner">${esc(x.kind)} · reach ${num(x.reach)}</div><div class="owner">${x.d ? (k === 'published' ? 'Published ' : 'Goes live ') + fmtD(x.d) : 'Contacted ' + fmtD(x.contacted)}</div>
      <div class="owner">We give: ${esc(x.gave)}${x.cost ? ' + ' + eur(x.cost) : ''}</div>${k === 'published' ? `<div class="kres">${eur(x.rev)} · ${num(x.sales)} sales</div>` : ''}</div>`).join('')}</div>`; }).join('')}</div>`;
  return `<div class="page-h"><div><h1>Partnerships</h1><p>All time · newsletter swaps, brand collabs, schools, communities</p></div><span class="owner">Owner: partnerships · weekly pipeline review</span></div>
  <div class="grid g5">
    ${kpi({ lbl: 'In pipeline', cur: P.filter(x => ['contacted', 'negotiating', 'agreed'].includes(x.status)).length, meta: `${P.filter(x => x.status === 'agreed').length} agreed, going live soon` })}
    ${kpi({ lbl: 'Published', cur: pub.length })}
    ${kpi({ lbl: 'Reach (published)', cur: sum(pub, 'reach') })}
    ${kpi({ lbl: 'Revenue', cur: sum(pub, 'rev'), fmt: eur, meta: `${eur(sum(pub, 'cost'))} cash cost` })}
    ${kpi({ lbl: 'Revenue per 1,000 reach', cur: div(sum(pub, 'rev'), sum(pub, 'reach') / 1000), fmt: v => eur(v, 2), meta: `vs ${eur(div(sum(Object.values(A).filter(o => o.c.type === 'paid'), 'rev'), sum(T.content.filter(x => x.type === 'paid'), 'plays') / 1000), 2)} per 1,000 plays for paid creators` })}
  </div>
  <div class="sec">Pipeline</div>${kan}
  <div class="sec">Results</div>
  ${card('Published partnerships', table([{ k: 'partner', l: 'Partner', al: 'l', f: (v, x) => `<span class="hdl">${pIcon(x.kind)}<b>${esc(v)}</b></span>` }, { k: 'kind', l: 'Type', al: 'l' }, { k: 'd', l: 'Date', f: v => fmtD(v) }, { k: 'gave', l: 'We gave', al: 'l', f: v => esc(v) },
    { k: 'reach', l: 'Reach', f: num }, { k: 'sessions', l: 'Visits', f: num }, { k: 'leads', l: 'Leads', f: num }, { k: 'sales', l: 'Sales', f: num }, { k: 'rev', l: 'Revenue', f: v => eur(v) },
    { k: 'cost', l: 'Cash cost', f: v => v ? eur(v) : '€0' }, { k: 'per1k', l: '€ / 1k reach', f: v => eur(v, 2) }], pub),
    'Swaps cost no cash, but they cost a slot in our own newsletter: count that as the price when you compare.')}`;
} };

PAGES['cr/calendar'] = { noFilters: true, filters: [], render() {
  if (!S.calM) S.calM = monthOf(MAX);
  if (!S.calView) S.calView = 'cal';
  const [y, m] = S.calM.split('-').map(Number), first = new Date(Date.UTC(y, m - 1, 1)), days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const shift = d => { const x = new Date(Date.UTC(y, m - 1 + d, 1)); return iso(x).slice(0, 7); };
  const items = T.content.filter(x => monthOf(x.d) === S.calM && (S.calType === undefined || S.calType === 'all' || x.type === S.calType)).sort((a, b) => a.d.localeCompare(b.d));
  const chip = x => `<div class="cchip ${x.status}" style="--c:${TYPE[x.type][1]}" title="${esc(CR[x.cid].handle)} · ${esc(x.format)}">${pIcon(CR[x.cid].platform, 12)}<span>${esc(CR[x.cid].handle.replace('@', ''))}</span>${x.cost ? `<b>${eur(x.cost)}</b>` : ''}${x.paid && x.cost ? '<i>✓</i>' : ''}</div>`;
  const lead = (first.getUTCDay() + 6) % 7, cells = [];
  for (let i = 0; i < lead; i++) cells.push('<div class="cday off"></div>');
  for (let d = 1; d <= days; d++) { const ds = `${S.calM}-${String(d).padStart(2, '0')}`, its = items.filter(x => x.d === ds);
    cells.push(`<div class="cday ${ds === MAX ? 'today' : ''}"><span class="dn">${d}</span>${its.slice(0, 3).map(chip).join('')}${its.length > 3 ? `<span class="more">+${its.length - 3} more</span>` : ''}</div>`); }
  const nav = `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
    <button class="nb" data-cal="-1">‹</button><b style="min-width:150px;text-align:center">${first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</b><button class="nb" data-cal="1">›</button>
    <button class="nb" data-cal="0" style="width:auto;padding:0 12px;font-size:13px;font-weight:600">Today</button>
    <select data-local="calType" style="height:34px;border:1px solid var(--border);border-radius:9px;padding:0 10px">${[['all', 'All creator types'], ...Object.entries(TYPE).map(([k, v]) => [k, v[0]])].map(([v, l]) => `<option value="${v}" ${(S.calType || 'all') === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <div class="toggle"><button class="${S.calView === 'cal' ? 'on' : ''}" data-calview="cal">Calendar</button><button class="${S.calView === 'list' ? 'on' : ''}" data-calview="list">List</button></div></div>`;
  const legend = `<div class="clegend">${Object.entries(TYPE).map(([k, v]) => `<span>${sw(v[1])}${v[0]}</span>`).join('')}<span><span class="cchip posted demo"></span>Posted</span><span><span class="cchip planned demo"></span>Planned</span><span>✓ = paid</span></div>`;
  const body = S.calView === 'list' ? table([{ k: 'd', l: 'Date', al: 'l', f: v => fmtD(v) }, { k: 'cid', l: 'Creator', al: 'l', f: v => handle(v) }, { k: 'type', l: 'Type', al: 'l', f: v => typeTag(v) }, { k: 'format', l: 'Format', al: 'l' },
      { k: 'status', l: 'Status', al: 'l', f: v => v === 'posted' ? '<span class="status ok"><span class="ic">✓</span>Posted</span>' : '<span class="sev s1">Planned</span>' }, { k: 'cost', l: 'Cost', f: v => v ? eur(v) : '–' },
      { k: 'paid', l: 'Paid', f: (v, x) => x.status === 'planned' || !x.cost ? '–' : v ? '<span class="status ok"><span class="ic">✓</span>Paid</span>' : '<span class="status no"><span class="ic">!</span>To pay</span>' }], items)
    : `<div class="cal"><div class="cwd">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => `<span>${d}</span>`).join('')}</div><div class="cgrid">${cells.join('')}</div></div>`;
  return `<div class="page-h"><div><h1>Content calendar</h1><p>${items.length} items · ${items.filter(x => x.status === 'posted').length} posted · ${items.filter(x => x.status === 'planned').length} planned · ${eur(sum(items, 'cost'))} cost</p></div>${nav}</div>
  <div class="card">${body}${legend}</div>`;
} };
document.addEventListener('click', e => {
  const b = e.target.closest('[data-cal],[data-calview]'); if (!b) return;
  if (b.dataset.calview) S.calView = b.dataset.calview;
  else { const n = +b.dataset.cal; if (!n) S.calM = monthOf(MAX); else { const [y, m] = S.calM.split('-').map(Number); S.calM = iso(new Date(Date.UTC(y, m - 1 + n, 1))).slice(0, 7); } }
  render();
});


// ================= ANALYSES =================
const pctStack = (cats, series, h = 230) => chart({ textStyle: { fontFamily: 'Inter Tight' }, grid: { left: 6, right: 14, top: 6, bottom: 44, containLabel: true },
  tooltip: { trigger: 'item', backgroundColor: '#fff', borderColor: '#E4E4E4', textStyle: { color: '#17120F', fontSize: 12 }, formatter: q => `<b>${q.seriesName}</b> · ${cats[q.dataIndex]}<br>${pct(q.value, 1)} · ${num(q.data.abs)}` },
  legend: { bottom: 0, icon: 'roundRect', itemWidth: 10, itemHeight: 10, textStyle: { color: '#4a4a4a' } },
  yAxis: { type: 'category', inverse: true, data: cats, axisTick: { show: false }, axisLine: { show: false }, axisLabel: { color: '#17120F', fontWeight: 500 } },
  xAxis: { type: 'value', max: 1, show: false },
  series: series.map(x => ({ name: x.name, type: 'bar', stack: 's', barWidth: 34, itemStyle: { color: x.color, borderColor: '#fff', borderWidth: 2 },
    label: { show: true, color: '#fff', fontWeight: 500, fontSize: 11, formatter: q => q.value >= .06 ? pct(q.value, 0) : '' }, data: x.data })) }, h);

PAGES['an/funnel'] = { filters: [], render() {
  const r = R(), p = prevRange(), sess = rows('sessions', r), L = rows('leads', r), O = rows('orders', r, x => !x.ren);
  const lp = p && rows('leads', p), op = p && rows('orders', p, x => !x.ren), sp = p && rows('sessions', p);
  const by = (a, f) => Object.fromEntries(CH_ORDER.map(c => [c, sum(a.filter(x => x.ch === c), f)]));
  const tS = by(sess, 's'), tL = by(L, 'n'), tO = by(O, 'n'), tR = by(O, 'rev');
  const TS = sum(sess, 's'), TL = sum(L, 'n'), TO = sum(O, 'n'), TR = sum(O, 'rev');
  const spend = c => c === 'creators' ? sum(rows('costs', r, x => x.cat === 'creators'), 'amount') : c === 'email' ? sum(rows('costs', r, x => x.cat === 'email'), 'amount') : PAID.includes(c) ? sum(rows('ads', r, x => x.platform === c), 'cost') : 0;
  const pconv = c => PAID.includes(c) ? sum(rows('ads', r, x => x.platform === c), 'pconv') : null;
  const det = CH_ORDER.map(c => ({ c, s: tS[c], leads: tL[c], v2l: div(tL[c], tS[c]), n: tO[c], rev: tR[c], spend: spend(c), pconv: pconv(c), rpv: div(tR[c], tS[c]), share: div(tR[c], TR) }))
    .map(x => ({ ...x, cac: x.spend ? div(x.spend, x.n) : null })).filter(x => x.s || x.leads || x.n);
  const ser = CH_ORDER.filter(c => tS[c] || tL[c] || tO[c]).map(c => ({ name: CH[c][0], color: CH[c][1], data: [{ value: div(tS[c], TS) || 0, abs: tS[c] }, { value: div(tL[c], TL) || 0, abs: tL[c] }, { value: div(tO[c], TO) || 0, abs: tO[c] }] }));
  return `<div class="page-h"><div><h1>Channel funnel</h1><p>${fmtR(r)}${p ? ` · vs ${fmtR(p)}` : ''} · traffic (GA4) → leads (CRM) → sales (shop), by channel</p></div><span class="owner">Owner: marketing manager · monthly</span></div>
  <div class="grid g6">
    ${kpi({ lbl: 'Traffic (GA4 sessions)', cur: TS, prev: sp && sum(sp, 's') })}
    ${kpi({ lbl: 'Leads (CRM)', cur: TL, prev: lp && sum(lp, 'n') })}
    ${kpi({ lbl: 'Visit → lead', cur: div(TL, TS), prev: p && div(sum(lp, 'n'), sum(sp, 's')), fmt: v => pct(v, 2) })}
    ${kpi({ lbl: 'New sales (shop)', cur: TO, prev: op && sum(op, 'n') })}
    ${kpi({ lbl: 'Visit → sale', cur: div(TO, TS), prev: p && div(sum(op, 'n'), sum(sp, 's')), fmt: v => pct(v, 2) })}
    ${kpi({ lbl: 'Revenue (new)', cur: TR, prev: op && sum(op, 'rev'), fmt: eur })}
  </div>
  <div style="margin-top:14px">${card('Traffic → leads → sales, share by channel', pctStack(['Traffic', 'Leads', 'Sales'], ser, 260),
    `Each bar = 100%. Grey = no source: ${pct(div(tL[''], TL), 0)} of leads and ${pct(div(tO[''], TO), 0)} of sales could not be traced to a channel (lost UTMs, consent refused). A channel whose share grows from traffic to sales converts better than average.`)}</div>
  <div class="sec">Channel detail</div>
  ${card('Spend, clicks and cost per sale by channel', table([{ k: 'c', l: 'Channel', al: 'l', f: c => chName(c) }, { k: 's', l: 'Traffic', f: num }, { k: 'leads', l: 'Leads', f: num }, { k: 'v2l', l: 'Visit → lead', f: v => pct(v, 1) },
    { k: 'n', l: 'Sales', f: num }, { k: 'rev', l: 'Revenue', f: v => eur(v), bar: Math.max(...det.map(x => x.rev)) }, { k: 'share', l: 'Share', f: v => pct(v, 0) }, { k: 'rpv', l: '€ / visit', f: v => eur(v, 2) },
    { k: 'spend', l: 'Spend', f: v => v ? eur(v) : '–' }, { k: 'pconv', l: 'Platform conv.', f: v => v == null ? '–' : num(v) }, { k: 'cac', l: 'Cost per sale', f: v => eur(v, 2) }], det),
    'Sales = new orders, dated by purchase; a lead that buys later keeps the lead\'s channel. Platform conversions are each platform\'s own count, not checked against sales: compare, never add.')}`;
} };

PAGES['an/pages'] = { filters: ['channel'], render() {
  const r = R(), sess = rows('sessions', r, chMatch), L = rows('leads', r, chMatch), O = rows('orders', r, x => !x.ren && chMatch(x) && x.page);
  const pages = Object.entries(groupBy(sess, x => x.page)).map(([pg, a]) => {
    const s_ = sum(a, 's'), l = L.filter(x => x.page === pg), o = O.filter(x => x.page === pg);
    return { page: pg, s: s_, leads: sum(l, 'n'), lr: div(sum(l, 'n'), s_), carts: sum(a, 'carts'), chk: sum(a, 'chk'), n: sum(o, 'n'), rev: sum(o, 'rev'), cvr: div(sum(o, 'n'), s_), rps: div(sum(o, 'rev'), s_) };
  }).sort((a, b) => b.s - a.s);
  if (!pages.length) return `<div class="page-h"><div><h1>Landing pages</h1><p>${fmtR(r)}</p></div></div>${card('No traffic for this channel', '<p class="sub">GA4 always knows where a visit came from, so "Unattributed" has no sessions. Unattributed leads and orders are listed on Data health → Where the source gets lost.</p>')}`;
  if (!pages.find(x => x.page === S.lp)) S.lp = pages[0].page;
  const P = pages.find(x => x.page === S.lp) || {};
  const ps = sess.filter(x => x.page === S.lp), po = O.filter(x => x.page === S.lp), TS = sum(ps, 's'), TO = sum(po, 'n');
  const chs = CH_ORDER.filter(c => ps.some(x => x.ch === c) || po.some(x => x.ch === c));
  const ser = chs.map(c => ({ name: CH[c][0], color: CH[c][1], data: [{ value: div(sum(ps.filter(x => x.ch === c), 's'), TS) || 0, abs: sum(ps.filter(x => x.ch === c), 's') }, { value: div(sum(po.filter(x => x.ch === c), 'n'), TO) || 0, abs: sum(po.filter(x => x.ch === c), 'n') }] }));
  const pconv = sum(rows('ads', r, x => x.page === S.lp), 'pconv');
  const top = pages.slice(0, 6).map(x => x.page), TT = sum(sess, 's'), TOO = sum(O, 'n');
  const pser = [...top.map((pg, i) => ({ name: pg, color: PAL[i], data: [{ value: div(sum(sess.filter(x => x.page === pg), 's'), TT), abs: sum(sess.filter(x => x.page === pg), 's') }, { value: div(sum(O.filter(x => x.page === pg), 'n'), TOO) || 0, abs: sum(O.filter(x => x.page === pg), 'n') }] })),
    { name: 'Other pages', color: V('--unk'), data: [{ value: div(sum(sess.filter(x => !top.includes(x.page)), 's'), TT), abs: 0 }, { value: div(sum(O.filter(x => !top.includes(x.page)), 'n'), TOO) || 0, abs: 0 }] }];
  const sel = `<select data-local="lp" style="height:36px;border:1px solid var(--border);border-radius:9px;padding:0 10px;min-width:260px">${pages.map(x => `<option value="${esc(x.page)}" ${x.page === S.lp ? 'selected' : ''}>${esc(x.page)} (${num(x.s)} sessions)</option>`).join('')}</select>`;
  return `<div class="page-h"><div><h1>Landing pages</h1><p>${fmtR(r)} · which page turns which traffic into leads and sales</p></div>${sel}</div>
  <div class="grid g6">
    ${kpi({ lbl: 'Sessions', cur: P.s })}${kpi({ lbl: 'Leads', cur: P.leads, meta: `${pct(P.lr, 1)} lead rate` })}
    ${kpi({ lbl: 'Sales', cur: P.n, meta: `${pct(P.cvr, 2)} of sessions buy` })}${kpi({ lbl: 'Revenue', cur: P.rev, fmt: eur })}
    ${kpi({ lbl: '€ per session', cur: P.rps, fmt: v => eur(v, 2) })}${kpi({ lbl: 'Platform conversions', cur: pconv, meta: 'Google + Meta own count for ads sent here' })}
  </div>
  <div class="grid g3" style="margin-top:14px">
    <div class="span2">${card(`${esc(S.lp)}: where its traffic and its sales come from`, pctStack(['Traffic', 'Sales'], ser, 200), 'Sales are credited by the order\'s own landing page (order attribution), not inherited from a lead.')}</div>
    ${card('Purchase funnel', chart({ textStyle: { fontFamily: 'Inter Tight' }, tooltip: { trigger: 'item', valueFormatter: num },
      series: [{ type: 'funnel', left: 10, right: 130, top: 6, bottom: 6, minSize: '6%', gap: 3, label: { color: '#17120F', formatter: q => `${q.name}  ${num(q.value)}` },
        data: [['Sessions', P.s, PAL[0]], ['Add to cart', P.carts, PAL[6]], ['Checkout', P.chk, PAL[1]], ['Orders', P.n, PAL[2]]].map(([n, v, c]) => ({ name: n, value: v, itemStyle: { color: c } })) }] }, 200))}
  </div>
  <div class="sec">All landing pages</div>
  <div class="grid g3"><div class="span2">${card('Pages', table([{ k: 'page', l: 'Landing page', al: 'l' }, { k: 's', l: 'Sessions', f: num, bar: pages[0]?.s || 1 }, { k: 'leads', l: 'Leads', f: num }, { k: 'lr', l: 'Lead rate', f: v => pct(v, 1) },
      { k: 'carts', l: 'Carts', f: num }, { k: 'chk', l: 'Checkouts', f: num }, { k: 'n', l: 'Sales', f: num }, { k: 'cvr', l: 'CVR', f: v => pct(v, 2) }, { k: 'rev', l: 'Revenue', f: v => eur(v) }, { k: 'rps', l: '€ / session', f: v => eur(v, 2) }], pages))}</div>
    ${card('Share of traffic vs share of sales', pctStack(['Traffic', 'Sales'], pser, 300), 'A page with a bigger share of sales than of traffic earns more than its visits.')}</div>`;
} };

function emStats(id, r, orders, leads) {
  const L = leads.filter(x => x.camp === id), O = orders.filter(x => x.camp === id && !x.via);
  return { leads: sum(L, 'n'), sales: sum(L, 'conv') + sum(O, 'n'), rev: sum(L, 'rev') + sum(O, 'rev') };
}
PAGES['an/email'] = { filters: [], render() {
  const r = R(), O = rows('orders', r, x => !x.ren && x.ch === 'email'), Lq = rows('leads', r, x => x.ch === 'email');
  const sends = T.emails.filter(x => x.d >= r[0] && x.d <= r[1]).map(e => ({ ...e, ...emStats(e.id, r, O, Lq) }))
    .map(e => ({ ...e, or: div(e.opens, e.sent), cto: div(e.clicks, e.opens), ctr: div(e.clicks, e.sent), rpr: div(e.rev, e.sent), roi: div(e.rev - e.cost, e.cost), ur: div(e.unsubs, e.sent) })).sort((a, b) => b.d.localeCompare(a.d));
  const fl = Object.entries(groupBy(T.flows.filter(x => x.d >= r[0] && x.d <= r[1]), x => x.flow)).map(([f, a]) => ({ flow: f, sent: sum(a, 'sent'), opens: sum(a, 'opens'), clicks: sum(a, 'clicks'), ...emStats(f, r, O, Lq) }))
    .map(x => ({ ...x, or: div(x.opens, x.sent), cto: div(x.clicks, x.opens), rpr: div(x.rev, x.sent) }));
  const tot = { sent: sum(sends, 'sent'), opens: sum(sends, 'opens'), clicks: sum(sends, 'clicks'), rev: sum(sends, 'rev'), cost: sum(sends, 'cost'), sales: sum(sends, 'sales'), unsubs: sum(sends, 'unsubs') };
  const med = k => { const v = sends.map(x => x[k]).filter(x => x != null).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
  const mOr = med('or'), mCto = med('cto'), mRpr = med('rpr');
  const hl_ = (k, m) => x => x[k] == null ? '' : x[k] >= m * 1.1 ? 'good' : x[k] <= m * .9 ? 'bad' : '';
  const quad = chart({ textStyle: { fontFamily: 'Inter Tight' }, grid: { left: 30, right: 20, top: 16, bottom: 44, containLabel: true },
    tooltip: { trigger: 'item', backgroundColor: '#fff', borderColor: '#E4E4E4', textStyle: { color: '#17120F', fontSize: 12 }, formatter: q => `<b>${esc(q.data.e.subject)}</b><br>${fmtD(q.data.e.d)} · ${q.data.e.type}<br>Open ${pct(q.data.e.or, 1)} · click-to-open ${pct(q.data.e.cto, 1)}<br>${eur(q.data.e.rev)} revenue` },
    legend: { bottom: 0, icon: 'circle', itemWidth: 9, itemHeight: 9, textStyle: { color: '#4a4a4a' } },
    xAxis: { type: 'value', name: 'Open rate (visibility)', nameLocation: 'middle', nameGap: 26, nameTextStyle: { color: '#4a4a4a' }, scale: true, axisLabel: { color: '#6B6B6B', formatter: v => (v * 100).toFixed(0) + '%' }, splitLine: { lineStyle: { color: '#ecebe6' } } },
    yAxis: { type: 'value', name: 'Click-to-open (efficiency)', nameLocation: 'middle', nameGap: 44, nameTextStyle: { color: '#4a4a4a' }, scale: true, axisLabel: { color: '#6B6B6B', formatter: v => (v * 100).toFixed(0) + '%' }, splitLine: { lineStyle: { color: '#ecebe6' } } },
    series: [['Newsletter', PAL[0]], ['Promo', PAL[1]]].map(([t, c], i) => ({ name: t, type: 'scatter', symbolSize: e => 8 + Math.sqrt(e[2] || 0) / 3,
      data: sends.filter(e => e.type === t).map(e => ({ value: [e.or, e.cto, e.rev], e })), itemStyle: { color: c, borderColor: '#fff', borderWidth: 1.5, opacity: .9 },
      markLine: i ? undefined : { silent: true, symbol: 'none', lineStyle: { color: '#b9b7b0', type: 'dashed' }, label: { show: false }, data: [{ xAxis: mOr }, { yAxis: mCto }] } })) }, 320);
  const best = [...sends].filter(x => x.type === 'Newsletter').sort((a, b) => b.or - a.or)[0], worst = [...sends].filter(x => x.type === 'Newsletter').sort((a, b) => a.or - b.or)[0];
  const ins = [];
  if (best && worst && best.id !== worst.id) ins.push({ id: 'em-subj-' + r[0].slice(0, 7), tag: 'Email · subject', color: PAL[3], impact: (best.or - worst.or) * worst.sent,
    title: `Best subject opened ${pct(best.or, 0)}, worst ${pct(worst.or, 0)}.`, why: `Best: "${esc(best.subject)}". Worst: "${esc(worst.subject)}".`,
    action: 'Write the next 4 subjects in the winning pattern (a number or a question, under 50 characters) and A/B test one each week.', impactLbl: `+${num((best.or - worst.or) * worst.sent)} opens / send`, owner: 'Email / CRM · weekly' });
  const lowClick = sends.filter(x => x.or >= mOr && x.cto < mCto * .85).sort((a, b) => b.sent - a.sent)[0];
  if (lowClick) ins.push({ id: 'em-cta-' + lowClick.id, tag: 'Email · content', color: PAL[3], impact: lowClick.sent * (mCto - lowClick.cto) * lowClick.or * 2,
    title: `"${esc(lowClick.subject)}" got opened but not clicked.`, why: `Open rate ${pct(lowClick.or, 0)} (above median), click-to-open ${pct(lowClick.cto, 1)} vs median ${pct(mCto, 1)}: the subject worked, the body or the button did not.`,
    action: 'One idea per email, one button above the fold, the same words in the button as in the subject.', impactLbl: `${num(lowClick.sent * (mCto - lowClick.cto) * lowClick.or)} clicks missed`, owner: 'Email / CRM · weekly' });
  const bestFlow = [...fl].sort((a, b) => (b.rpr || 0) - (a.rpr || 0))[0];
  if (bestFlow && bestFlow.rpr > div(tot.rev, tot.sent)) ins.push({ id: 'em-flow-' + bestFlow.flow, tag: 'Email · automation', color: PAL[3], impact: bestFlow.rev * .2,
    title: `"${esc(bestFlow.flow)}" earns ${eur(bestFlow.rpr * 1000, 0)} per 1,000 emails, ${xx(div(bestFlow.rpr, div(tot.rev, tot.sent)))} a newsletter.`, why: `Automated emails reach people at the moment they asked for something.`,
    action: `Add a second step to "${esc(bestFlow.flow)}" on day 3 with the offer and the coupon.`, impactLbl: `≈ +${eur(bestFlow.rev * .2)}`, owner: 'Email / CRM · monthly' });
  // calendar of sends
  if (!S.emM || (!S.emLock && (S.emM < monthOf(r[0]) || S.emM > monthOf(r[1])))) S.emM = monthOf(r[1]);
  const [y, m] = S.emM.split('-').map(Number), first = new Date(Date.UTC(y, m - 1, 1)), nd = new Date(Date.UTC(y, m, 0)).getUTCDate(), cells = [];
  for (let i = 0; i < (first.getUTCDay() + 6) % 7; i++) cells.push('<div class="cday off"></div>');
  for (let d = 1; d <= nd; d++) { const ds = `${S.emM}-${String(d).padStart(2, '0')}`, its = T.emails.filter(x => x.d === ds).map(e => sends.find(z => z.id === e.id) || { ...e, ...emStats(e.id, [ds, MAX], rows('orders', [ds, MAX], x => x.ch === 'email' && !x.ren), rows('leads', [ds, MAX], x => x.ch === 'email')), or: div(e.opens, e.sent) });
    cells.push(`<div class="cday ${ds === MAX ? 'today' : ''}"><span class="dn">${d}</span>${its.map(e => `<div class="cchip posted" style="--c:${e.type === 'Promo' ? PAL[1] : PAL[0]}" title="${esc(e.subject)}"><span>${esc(e.subject)}</span></div><div class="owner" style="font-size:11px">${pct(e.or, 0)} open · ${eur(e.rev)}</div>`).join('')}</div>`); }
  const calNav = `<span style="display:flex;gap:8px;align-items:center"><button class="nb" data-emcal="-1">‹</button><b style="min-width:120px;text-align:center;font-size:14px">${first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</b><button class="nb" data-emcal="1">›</button></span>`;
  return `<div class="page-h"><div><h1>Email</h1><p>${fmtR(r)} · every send with its own utm_campaign, so each email gets its leads and sales</p></div><span class="owner">Owner: email / CRM · weekly</span></div>
  <div class="grid g6">
    ${kpi({ lbl: 'Campaigns sent', cur: sends.length, meta: `${num(tot.sent)} emails` })}
    ${kpi({ lbl: 'Open rate', cur: div(tot.opens, tot.sent), fmt: v => pct(v, 1), meta: 'Visibility: did the subject work?' })}
    ${kpi({ lbl: 'Click-to-open', cur: div(tot.clicks, tot.opens), fmt: v => pct(v, 1), meta: 'Efficiency: did the email work?' })}
    ${kpi({ lbl: 'Sales', cur: tot.sales, meta: `${num(sum(sends, 'leads'))} leads` })}
    ${kpi({ lbl: 'Revenue', cur: tot.rev, fmt: eur, meta: `${eur(div(tot.rev, tot.sent) * 1000, 0)} per 1,000 emails` })}
    ${kpi({ lbl: 'ROI', cur: div(tot.rev - tot.cost, tot.cost), fmt: v => v == null ? '–' : num(v) + '×', meta: `Sending cost ${eur(tot.cost)} · unsubscribe ${pct(div(tot.unsubs, tot.sent), 2)}` })}
  </div>
  <div class="sec">What to change in the next emails</div><div class="ins">${ins.map(icCard).join('')}</div>
  <div class="grid g2" style="margin-top:14px">
    ${card('Visibility vs efficiency, every send', quad, 'Right = the subject got it opened. Up = the content got it clicked. Dashed lines = medians. Bubble size = revenue. Bottom-right: good subject, weak email.')}
    ${card('Email calendar', `<div class="cwd">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => `<span>${d}</span>`).join('')}</div><div class="cgrid em">${cells.join('')}</div>`, '', calNav)}
  </div>
  <div class="sec">Campaigns</div>
  ${card('Every send: visibility → efficiency → leads → revenue', table([{ k: 'd', l: 'Date', al: 'l', f: v => fmtD(v) }, { k: 'type', l: 'Type', al: 'l', f: v => `<span class="tag">${v}</span>` }, { k: 'subject', l: 'Subject', al: 'l', f: v => esc(v) },
    { k: 'sent', l: 'Sent', f: num }, { k: 'or', l: 'Open rate', f: v => pct(v, 1), cls: hl_('or', mOr) }, { k: 'cto', l: 'Click-to-open', f: v => pct(v, 1), cls: hl_('cto', mCto) }, { k: 'clicks', l: 'Clicks', f: num },
    { k: 'leads', l: 'Leads', f: num }, { k: 'sales', l: 'Sales', f: num }, { k: 'rev', l: 'Revenue', f: v => eur(v) }, { k: 'rpr', l: '€ / 1k sent', f: v => eur(v * 1000, 0), cls: hl_('rpr', mRpr) },
    { k: 'roi', l: 'ROI', f: v => v == null ? '–' : num(v) + '×' }, { k: 'ur', l: 'Unsub.', f: v => pct(v, 2) }], sends),
    'Green / red = 10% better / worse than the median send in this period. Revenue = leads from the email who bought later + direct purchases from its link. ROI = (revenue − sending cost) ÷ sending cost.')}
  <div style="margin-top:14px">${card('Automated flows', table([{ k: 'flow', l: 'Flow', al: 'l', f: v => `<b>${esc(v)}</b>` }, { k: 'sent', l: 'Sent', f: num }, { k: 'or', l: 'Open rate', f: v => pct(v, 1) }, { k: 'cto', l: 'Click-to-open', f: v => pct(v, 1) },
    { k: 'clicks', l: 'Clicks', f: num }, { k: 'sales', l: 'Sales', f: num }, { k: 'rev', l: 'Revenue', f: v => eur(v) }, { k: 'rpr', l: '€ / 1k sent', f: v => eur(v * 1000, 0) }], fl))}</div>`;
} };
document.addEventListener('click', e => { const b = e.target.closest('[data-emcal]'); if (!b) return; const [y, m] = S.emM.split('-').map(Number); S.emM = iso(new Date(Date.UTC(y, m - 1 + +b.dataset.emcal, 1))).slice(0, 7); S.emLock = true; render(); });

PAGES['an/cohorts'] = { filters: ['channel'], render() {
  const months = [...new Set(T.cohorts.map(x => x.cm))].sort(), endM = monthOf(MAX), cms = months.filter(m => m < endM).slice(-12), ages = [0, 1, 2, 3, 4, 5, 6];
  const leadsM = cm => sum(T.leads.filter(x => monthOf(x.d) === cm && chMatch(x)), 'n');
  const mAge = cm => (+endM.slice(0, 4) - +cm.slice(0, 4)) * 12 + (+endM.slice(5) - +cm.slice(5));
  const cum = (cm, a, f) => sum(T.cohorts.filter(x => x.cm === cm && x.age <= a && chMatch(x)), f);
  const data = [];
  cms.forEach((cm, i) => { const n = leadsM(cm); ages.forEach(a => { if (a <= mAge(cm)) data.push([a, i, div(cum(cm, a, 'buyers'), n)]); }); });
  const maxV = Math.max(...data.map(d => d[2]));
  const cells = data.map(d => ({ value: d, label: { color: d[2] > maxV * .62 ? '#fff' : '#17120F' } }));  // readable on dark cells
  const heat = chart({ textStyle: { fontFamily: 'Inter Tight' }, grid: { left: 6, right: 10, top: 10, bottom: 54, containLabel: true },
    tooltip: { backgroundColor: '#fff', borderColor: '#E4E4E4', textStyle: { color: '#17120F', fontSize: 12 }, formatter: q => `Leads of <b>${cms[q.value[1]]}</b>, after ${q.value[0]} month${q.value[0] === 1 ? '' : 's'}: <b>${pct(q.value[2], 1)}</b> bought` },
    xAxis: { type: 'category', data: ages.map(a => a === 0 ? 'Same month' : `+${a} mo`), axisTick: { show: false }, axisLine: { show: false }, axisLabel: { color: '#4a4a4a' } },
    yAxis: { type: 'category', data: cms, inverse: true, axisTick: { show: false }, axisLine: { show: false }, axisLabel: { color: '#17120F', fontWeight: 500 } },
    visualMap: { min: 0, max: maxV, calculable: false, orient: 'horizontal', left: 'center', bottom: 0, itemWidth: 12, itemHeight: 160, text: ['more bought', 'fewer'], textStyle: { color: '#4a4a4a' }, inRange: { color: ['#eaf2fc', '#9ec5f4', '#3987e5', '#184f95'] } },
    series: [{ type: 'heatmap', data: cells, label: { show: true, formatter: q => pct(q.value[2], 1), fontSize: 11 }, itemStyle: { borderColor: '#fff', borderWidth: 2, borderRadius: 4 } }] }, 460);
  const chRows = CH_ORDER.map(c => { const old = cms.filter(cm => mAge(cm) >= 6); const n = sum(T.leads.filter(x => old.includes(monthOf(x.d)) && x.ch === c), 'n');
    const at = (a, f) => sum(T.cohorts.filter(x => old.includes(x.cm) && x.ch === c && x.age <= a), f);
    const spend = PAID.includes(c) ? sum(T.ads.filter(x => old.includes(monthOf(x.d)) && x.platform === c && x.funnel === 'lead'), 'cost') : null;
    const lg = PAID.includes(c) ? sum(T.leads.filter(x => old.includes(monthOf(x.d)) && x.ch === c && LEADGEN.has(x.camp)), 'n') : null;
    return { c, n, m0: div(at(0, 'buyers'), n), m1: div(at(1, 'buyers'), n), m3: div(at(3, 'buyers'), n), m6: div(at(6, 'buyers'), n), rpl: div(at(6, 'rev'), n), cpl: div(spend, lg) }; }).filter(x => x.n > 50);
  return `<div class="page-h"><div><h1>Lead cohorts</h1><p>Leads grouped by sign-up month: what share bought, and how long it took</p></div><span class="owner">Owner: marketing manager · monthly</span></div>
  ${card('Share of leads who bought, by months since sign-up', heat, 'Read across a row: how a month\'s leads convert over time. Read down a column: whether newer leads convert faster than older ones. Matched by email in the shop; recent months have empty cells because they are not that old yet.')}
  <div class="sec">Payback by channel</div>
  ${card('Leads that are at least 6 months old', table([{ k: 'c', l: 'Channel', al: 'l', f: c => chName(c) }, { k: 'n', l: 'Leads', f: num }, { k: 'm0', l: 'Bought · same month', f: v => pct(v, 1) }, { k: 'm1', l: '+1 mo', f: v => pct(v, 1) },
    { k: 'm3', l: '+3 mo', f: v => pct(v, 1) }, { k: 'm6', l: '+6 mo', f: v => pct(v, 1) }, { k: 'rpl', l: 'Revenue per lead (6 mo)', f: v => eur(v, 2), bar: Math.max(...chRows.map(x => x.rpl || 0)) },
    { k: 'cpl', l: 'Lead-gen CPL', f: v => v == null ? '–' : eur(v, 2) }, { k: 'pb', l: 'Pays back?', f: (v, x) => x.cpl == null ? '–' : x.rpl >= x.cpl ? `<span class="status ok"><span class="ic">✓</span>${xx(x.rpl / x.cpl)}</span>` : `<span class="status no"><span class="ic">!</span>${xx(x.rpl / x.cpl)}</span>` }], chRows),
    'A lead pays back when the revenue it brings within 6 months is above what it cost. Judge lead-gen campaigns on this, not on the first week.')}`;
} };

PAGES['an/products'] = { filters: ['channel', 'type'], render() {
  const r = R(), p = prevRange(), B = buckets(r), o = rows('orders', r, ordF), op = p && rows('orders', p, ordF);
  const prods = [...new Set(T.orders.map(x => x.prod))].sort();
  const pr = prods.map(pd => { const a = o.filter(x => x.prod === pd), b = op && op.filter(x => x.prod === pd), n = sum(a, 'n'), rev = sum(a, 'rev');
    const chs = Object.entries(groupBy(a.filter(x => x.ch !== ''), x => x.ch)).map(([c, z]) => [c, sum(z, 'rev')]).sort((x, y) => y[1] - x[1]);
    return { prod: pd, n, rev, aov: div(rev, n), ren: div(sum(a.filter(x => x.ren), 'rev'), rev), d: b ? div(rev - sum(b, 'rev'), sum(b, 'rev')) : null, top: chs[0]?.[0], cp: div(sum(a.filter(x => x.cp), 'n'), n) }; }).sort((a, b) => b.rev - a.rev);
  const tot = sum(pr, 'rev');
  // monthly plan retention: share of customers still paying after k months (cohorts old enough)
  const endM = monthOf(MAX), mAge = cm => (+endM.slice(0, 4) - +cm.slice(0, 4)) * 12 + (+endM.slice(5) - +cm.slice(5));
  const K = [...Array(13).keys()], surv = K.map(k => { const c = T.retention.filter(x => mAge(x.cm) > k); return div(sum(c.filter(x => x.renewals >= k), 'n'), sum(c, 'n')); });
  return `<div class="page-h"><div><h1>Products</h1><p>${fmtR(r)}${p ? ` · vs ${fmtR(p)}` : ''} · what sells, at what price, and who stays</p></div><span class="owner">Owner: marketing manager + product · monthly</span></div>
  <div class="grid g5">
    ${kpi({ lbl: 'Revenue', cur: tot, prev: op && sum(op, 'rev'), fmt: eur })}
    ${kpi({ lbl: 'Sales', cur: sum(pr, 'n'), prev: op && sum(op, 'n') })}
    ${kpi({ lbl: 'Average ticket', cur: div(tot, sum(pr, 'n')), prev: op && div(sum(op, 'rev'), sum(op, 'n')), fmt: v => eur(v, 2) })}
    ${kpi({ lbl: 'From renewals', cur: div(sum(o.filter(x => x.ren), 'rev'), tot), fmt: v => pct(v, 0) })}
    ${kpi({ lbl: 'Monthly plan: still paying after 3 months', cur: surv[3], fmt: v => pct(v, 0), meta: `${pct(surv[6], 0)} after 6 · ${pct(surv[12], 0)} after 12` })}
  </div>
  <div class="grid g3" style="margin-top:14px">
    <div class="span2">${card('Revenue by product', xy({ x: B, y: 'eur', stack: 'p', h: 280, series: prods.map((pd, i) => ({ name: pd, data: byBucket(o.filter(x => x.prod === pd), x => x.rev, r), color: PAL[i] })) }))}</div>
    ${card('Monthly plan retention', xy({ x: K.map(k => k ? `+${k}` : 'Start'), y: 'pct', h: 280, series: [{ name: 'Still paying', type: 'line', showSymbol: true, data: surv, color: PAL[6], areaStyle: { color: PAL[6], opacity: .08 } }], tip: v => pct(v, 0) }),
      'Share of monthly-plan customers who renewed at least k times. Each month of retention adds €19.90 to what a customer is worth.')}
  </div>
  <div class="sec">Products</div>
  ${card('Ranked by revenue', table([{ k: 'prod', l: 'Product', al: 'l', f: v => `<b>${esc(v)}</b>` }, { k: 'n', l: 'Sales', f: num }, { k: 'rev', l: 'Revenue', f: v => eur(v), bar: pr[0]?.rev || 1 },
    { k: 'sh', l: 'Share', f: (v, x) => pct(x.rev / tot, 0) }, { k: 'd', l: 'vs before', f: v => v == null ? '–' : `<span class="delta ${v >= 0 ? 'up' : 'down'}">${v >= 0 ? '▲' : '▼'} ${Math.abs(v * 100).toFixed(1)}%</span>` },
    { k: 'aov', l: 'Average ticket', f: v => eur(v, 2) }, { k: 'ren', l: 'From renewals', f: v => pct(v, 0) }, { k: 'cp', l: 'With a coupon', f: v => pct(v, 0) }, { k: 'top', l: 'Top channel', al: 'l', f: v => v ? chName(v) : '–' }], pr))}`;
} };

// ================= TRUST =================
const okChip = (ok, t1 = 'Pass', t2 = 'Fix') => ok ? `<span class="status ok"><span class="ic">✓</span>${t1}</span>` : `<span class="status no"><span class="ic">!</span>${t2}</span>`;
PAGES['tr/health'] = { filters: [], render() {
  const r = R(), m = M(r), B = buckets(r);
  const g0 = S.grain; if (S.grain === 'day') S.grain = 'week'; const WB = buckets(r);
  const Ow = rows('orders', r, x => !x.ren), Lw = rows('leads', r);
  const covO = byBucket(Ow, x => x.ch !== '' ? x.n : 0, r).map((v, i, a) => v), allO = byBucket(Ow, x => x.n, r), covL = byBucket(Lw, x => x.ch !== '' ? x.n : 0, r), allL = byBucket(Lw, x => x.n, r);
  S.grain = g0;
  const cp = sum(Ow.filter(x => x.cp === 2), 'n'), paid = PAID.map(pl => camp(pl, null, r)), pg = sum(paid, 'pconv'), crm = sum(paid, x => x.leads + x.dirN), gap = div(pg - crm, crm);
  const pages = Object.entries(groupBy(Lw, x => x.page)).map(([pg_, a]) => { const o = Ow.filter(x => x.page === pg_);
    return { page: pg_, leads: sum(a, 'n'), lNo: div(sum(a.filter(x => x.ch === ''), 'n'), sum(a, 'n')), n: sum(o, 'n'), oNo: div(sum(o.filter(x => x.ch === ''), 'n'), sum(o, 'n')) }; }).sort((a, b) => b.lNo - a.lNo);
  const leaky = pages.filter(x => x.lNo > .15 && x.leads > 100);
  const checks = [
    ['Auto-tagging on every ad (gclid / fbclid)', true, 'Google Ads + Meta', ''],
    ['Hidden UTM fields on every lead form', !leaky.length, leaky.length ? leaky.map(x => x.page).join(', ') + ` lose the source on ${pct(Math.max(...leaky.map(x => x.lNo)), 0)}+ of leads` : 'All forms keep the source', 'Add hidden utm_source / medium / campaign fields and fill them from the first-touch cookie.'],
    ['One coupon per creator', T.creators.every(c => c.coupon), `${T.creators.filter(c => c.coupon).length} of ${T.creators.length} creators have a code`, ''],
    ['utm_campaign on every email', T.emails.every(e => e.id), `${T.emails.length} sends + 3 flows tagged`, ''],
    ['Google Consent Mode v2', true, 'Basic mode, banner before tags', ''],
    ['Server-side purchase (CAPI + enhanced conversions)', true, 'Sent by the shop, deduplicated by order ID', ''],
    ['Order attribution on checkout', m.attributed >= TG.attributed_pct / 100, `${pct(m.attributed, 0)} of new orders have a source (target ${TG.attributed_pct}%)`, 'Check the WooCommerce attribution field survives the payment redirect.'],
    ['Platform vs CRM gap under 25%', Math.abs(gap) < .25, `Platforms report ${num(pg)}, CRM + shop record ${num(crm)} (${gap >= 0 ? '+' : ''}${pct(gap, 0)})`, 'Align conversion actions to one lead event + one purchase event.'],
  ];
  const SOURCES = [['Google Ads', 'Spend, clicks, platform conversions', 'dlt · google_ads', T.ads.filter(x => x.platform === 'google_ads').length],
    ['Meta Ads', 'Spend, creatives, platform conversions', 'dlt · facebook_ads', T.ads.filter(x => x.platform === 'meta').length + T.creatives.length],
    ['GA4', 'Sessions, cart, checkout per page and channel', 'dlt · google_analytics', T.sessions.length], ['Search Console', 'Queries, clicks, positions', 'script · searchanalytics API', T.gsc.length],
    ['Shop orders', 'Sales, revenue, coupon, order attribution', 'dlt · rest_api (WooCommerce)', T.orders.length], ['CRM', 'Leads, source, qualified, sequence', 'dlt · rest_api (CRM)', T.leads.length],
    ['Creator sheet', 'Creators, deals, content, payments', 'dlt · google_sheets', T.creators.length + T.content.length], ['Email', 'Sends, opens, clicks', 'dlt · rest_api (ESP)', T.emails.length + T.flows.length],
    ['PageSpeed Insights', 'Lighthouse + Core Web Vitals', 'script · PSI API, monthly', T.lh.length], ['AI search', 'Prompt checks on 5 engines', 'script · weekly prompts', T.ai.length]];
  return `<div class="page-h"><div><h1>Data health</h1><p>${fmtR(r)} · can we trust the numbers on the other pages?</p></div><span class="owner">Owner: marketing ops · monthly</span></div>
  <div class="grid g6">
    ${kpi({ lbl: 'New orders with a source', cur: m.attributed, fmt: v => pct(v, 0), target: TG.attributed_pct / 100 })}
    ${kpi({ lbl: 'Leads with a source', cur: m.leadsKnown, fmt: v => pct(v, 0), target: .9 })}
    ${kpi({ lbl: 'Recovered by coupon', cur: cp, meta: 'Orders with no UTM, credited by a creator code' })}
    ${kpi({ lbl: 'Platform vs CRM', val: `${gap >= 0 ? '+' : ''}${pct(gap, 0)}`, meta: `${num(pg)} reported · ${num(crm)} recorded` })}
    ${kpi({ lbl: 'Tracking checks', val: `${checks.filter(c => c[1]).length}/${checks.length}`, meta: 'passed' })}
    ${kpi({ lbl: 'Data up to', val: fmtD(MAX), meta: 'Daily refresh when connected' })}
  </div>
  <div class="grid g2" style="margin-top:14px">
    ${card('Share with a known source, weekly', xy({ x: WB, y: 'pct', h: 260, ymin: .5, tip: v => pct(v, 1), series: [{ name: 'New orders', type: 'line', data: covO.map((v, i) => div(v, allO[i])), color: PAL[0], markLine: { silent: true, symbol: 'none', lineStyle: { color: V('--bad'), type: 'dashed' }, label: { formatter: `target ${TG.attributed_pct}%`, position: 'insideEndTop', color: '#b42424' }, data: [{ yAxis: TG.attributed_pct / 100 }] } },
      { name: 'Leads', type: 'line', data: covL.map((v, i) => div(v, allL[i])), color: PAL[2] }] }), 'Below target = channel numbers on every page are a floor; the Brief\'s ROAS estimate scales them up.')}
    ${card('Tracking checklist', table([{ k: 0, l: 'Check', al: 'l', f: v => `<b>${esc(v)}</b>` }, { k: 1, l: 'Status', al: 'l', f: v => okChip(v) }, { k: 2, l: 'Found', al: 'l', f: v => esc(v) }], checks),
      checks.filter(c => !c[1]).map(c => `<b>${esc(c[0])}:</b> ${esc(c[3])}`).join('<br>'))}
  </div>
  <div class="grid g2" style="margin-top:14px">
    ${card('Where the source gets lost', table([{ k: 'page', l: 'Landing page', al: 'l' }, { k: 'leads', l: 'Leads', f: num }, { k: 'lNo', l: 'Leads, no source', f: v => pct(v, 0), cls: x => x.lNo > .15 ? 'bad' : '' },
      { k: 'n', l: 'Orders', f: num }, { k: 'oNo', l: 'Orders, no source', f: v => pct(v, 0), cls: x => x.oNo > .3 ? 'bad' : '' }], pages))}
    ${card('Data sources', table([{ k: 0, l: 'Source', al: 'l', f: v => `<b>${esc(v)}</b>` }, { k: 1, l: 'Feeds', al: 'l', f: v => esc(v) }, { k: 2, l: 'Connector', al: 'l', f: v => `<code>${esc(v)}</code>` }, { k: 3, l: 'Rows', f: num }, { k: 4, l: 'Status', al: 'l', f: () => okChip(true, 'Synced') }], SOURCES),
      'All connectors write to one DuckDB file on your machine. Sandbox now; v0.2 switches each source to its live connector.')}
  </div>`;
} };

const erf = x => { const t = 1 / (1 + .3275911 * Math.abs(x)), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - .284496736) * t + .254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; };
function abTest(e) {  // two-proportion z-test + 95% CI of the relative lift
  if (!e.n_a) return { lift: e.rate_b / e.rate_a - 1, p: null };
  const pa = e.rate_a, pb = e.rate_b, pool = (pa * e.n_a + pb * e.n_b) / (e.n_a + e.n_b);
  const z = (pb - pa) / Math.sqrt(pool * (1 - pool) * (1 / e.n_a + 1 / e.n_b)), se = Math.sqrt(pa * (1 - pa) / e.n_a + pb * (1 - pb) / e.n_b);
  return { lift: pb / pa - 1, lo: (pb - pa - 1.96 * se) / pa, hi: (pb - pa + 1.96 * se) / pa, p: 2 * (1 - .5 * (1 + erf(Math.abs(z) / Math.SQRT2))) };
}
PAGES['tr/experiments'] = { noFilters: true, filters: [], render() {
  const E = T.exp.map(e => ({ ...e, ...abTest(e), running: e.decision === 'Running' })).sort((a, b) => b.s.localeCompare(a.s));
  const done = E.filter(e => !e.running), wins = done.filter(e => /ship/i.test(e.decision));
  const ab = E.filter(e => e.n_a);
  const fmtRate = (e, v) => /ROAS/.test(e.metric) ? xx(v) : pct(v, v < .02 ? 2 : 1);
  const forest = chart({ textStyle: { fontFamily: 'Inter Tight' }, grid: { left: 6, right: 30, top: 10, bottom: 30, containLabel: true },
    tooltip: { trigger: 'item', backgroundColor: '#fff', borderColor: '#E4E4E4', textStyle: { color: '#17120F', fontSize: 12 }, formatter: q => { const e = ab[q.dataIndex]; return `<b>${esc(e.name)}</b><br>Lift ${pct(e.lift, 1)} (95% CI ${pct(e.lo, 0)} to ${pct(e.hi, 0)})<br>p = ${e.p.toFixed(3)}`; } },
    yAxis: { type: 'category', inverse: true, data: ab.map(e => e.name), axisTick: { show: false }, axisLine: { show: false }, axisLabel: { color: '#17120F', width: 230, overflow: 'truncate' } },
    xAxis: { type: 'value', axisLabel: { color: '#6B6B6B', formatter: v => (v * 100).toFixed(0) + '%' }, splitLine: { lineStyle: { color: '#ecebe6' } } },
    series: [{ type: 'custom', encode: { x: [0, 1, 3], y: 2 }, data: ab.map((e, i) => [e.lo, e.hi, i, e.lift, e.p < .05 ? 1 : 0]), renderItem: (params, api) => {
      const a = api.coord([api.value(0), api.value(2)]), b = api.coord([api.value(1), api.value(2)]), c = api.coord([api.value(3), api.value(2)]), col = api.value(4) ? (api.value(3) > 0 ? '#0ca30c' : '#d03b3b') : '#6B6B6B';
      return { type: 'group', children: [{ type: 'line', shape: { x1: a[0], y1: a[1], x2: b[0], y2: b[1] }, style: { stroke: col, lineWidth: 3, lineCap: 'round' } },
        { type: 'circle', shape: { cx: c[0], cy: c[1], r: 7 }, style: { fill: col, stroke: '#fff', lineWidth: 2 } }] }; },
      markLine: { silent: true, symbol: 'none', lineStyle: { color: '#17120F', type: 'solid', width: 1 }, label: { show: false }, data: [{ xAxis: 0 }] } }] }, 60 + ab.length * 44);
  const decChip = d => /ship/i.test(d) ? `<span class="status ok"><span class="ic">✓</span>${esc(d)}</span>` : /reject/i.test(d) ? `<span class="status no"><span class="ic">✕</span>${esc(d)}</span>` : /running/i.test(d) ? `<span class="sev s2">${esc(d)}</span>` : `<span class="sev s1">${esc(d)}</span>`;
  const eCard = e => `<div class="card exp"><div class="hd" style="display:flex;justify-content:space-between;gap:10px;align-items:center"><span class="tag">${esc(e.area)}</span>${decChip(e.decision)}</div>
    <h4 style="margin:10px 0 4px;font-size:16px">${esc(e.name)}</h4><div class="sub">${esc(e.hypothesis)}</div>
    <div class="owner" style="margin-top:6px">${esc(e.metric)} · ${fmtD(e.s)} → ${fmtD(e.e)}${e.n_a ? ` · ${num(e.n_a + e.n_b)} in the test` : ''}</div>
    <div class="abbars">${[['Control', e.rate_a, e.n_a, '#6B6B6B'], ['Variant', e.rate_b, e.n_b, e.lift >= 0 ? PAL[2] : PAL[7]]].map(([l, v, n, c]) => `<div class="abrow"><span>${l}</span><div class="abtrack"><i style="width:${Math.min(100, v / Math.max(e.rate_a, e.rate_b) * 100)}%;background:${c}"></i></div><b>${fmtRate(e, v)}</b></div>`).join('')}</div>
    <div class="abft"><b style="color:${e.lift >= 0 ? '#006300' : '#b42424'}">${e.lift >= 0 ? '+' : ''}${pct(e.lift, 1)}</b>${e.p == null ? '<span class="owner">Geo holdout: incremental vs platform-reported ROAS</span>' : `<span class="owner">p = ${e.p.toFixed(3)} · ${e.p < .05 ? 'significant' : 'not significant yet'}</span>`}</div></div>`;
  return `<div class="page-h"><div><h1>Experiments</h1><p>Every test, its result and the decision taken. The loop that turns the dashboard into action.</p></div><span class="owner">Owner: marketing manager · weekly review</span></div>
  <div class="grid g4">
    ${kpi({ lbl: 'Tests completed', cur: done.length })}${kpi({ lbl: 'Win rate', cur: div(wins.length, done.length), fmt: v => pct(v, 0), meta: 'Typical: 1 in 3 tests wins' })}
    ${kpi({ lbl: 'Running now', cur: E.filter(e => e.running).length })}${kpi({ lbl: 'Average lift of winners', cur: div(sum(wins, 'lift'), wins.length), fmt: v => '+' + pct(v, 0) })}
  </div>
  <div style="margin-top:14px">${card('Lift with 95% confidence interval', forest, 'Green = significant win, red = significant loss, grey = can\'t tell yet (the bar crosses 0). Decide on the bar, not on the dot.')}</div>
  <div class="sec">Log</div><div class="grid g3">${E.map(eCard).join('')}</div>`;
} };

PAGES['tr/definitions'] = { noFilters: true, filters: [], render() {
  const D = [
    ['Contribution after marketing', 'North star: what is left after paying for all marketing', 'Revenue − ads − creators − email/tools', 'Shop + ads + creator sheet', 'Brief'],
    ['Blended MER', 'Revenue for every €1 of total marketing cost', 'Revenue ÷ all marketing cost', 'Shop + costs', 'Brief, Overview'],
    ['Cost per new customer (nCAC)', 'What one new customer cost', 'All marketing cost ÷ new customers', 'Shop + costs', 'Brief'],
    ['Lead (CRM)', 'A person who left an email; one per email', 'Count in the CRM', 'CRM', 'Everywhere'],
    ['Qualified lead', 'Lead that matches the target customer on the form', 'Leads with qualified = yes', 'CRM form answer', 'Overview, campaigns'],
    ['Lead-gen CPL', 'Cost of one lead from campaigns built for leads', 'Lead-gen spend ÷ their CRM leads', 'Ads + CRM', 'Brief, Overview'],
    ['Sale (new)', 'First purchase of a customer; renewals excluded', 'Shop orders, not renewals', 'Shop', 'Everywhere'],
    ['Lead-dated revenue', 'What leads from a source bought afterwards, on the sign-up day', 'Σ orders of leads, matched by email', 'CRM + shop', 'Campaigns, creators, email'],
    ['Sale-dated revenue', 'New purchases with no lead before, on the purchase day', 'Σ orders credited by UTM / click ID / coupon', 'Shop', 'Campaigns, creators, email'],
    ['Matched ROAS (floor)', 'Revenue we can prove ÷ spend', '(lead-dated + sale-dated) ÷ spend', 'CRM + shop + ads', 'Brief, ads pages'],
    ['ROAS estimate', 'Floor scaled up for orders with no source', 'Matched ROAS ÷ share of orders with a source', 'Derived', 'Brief, ads pages'],
    ['Platform ROAS (ceiling)', 'What Google / Meta claim', 'Platform conversion value ÷ spend', 'Ad platforms', 'Brief, ads pages'],
    ['Coupon-only sale', 'Order with no UTM but a creator\'s coupon', 'Credited to that creator', 'Shop', 'Creators, data health'],
    ['Hook rate', 'Share of people who watched 3 seconds', '3-second views ÷ impressions', 'Meta', 'Meta, UGC'],
    ['Creative fatigue', 'Audience saw it too often', 'CTR last 14 days < 70% of its first 14 days', 'Meta', 'Meta, UGC'],
    ['Share of search', 'Our share of category brand searches', 'Our brand searches ÷ all brand searches', 'Google Trends / volumes', 'SEO & GEO'],
    ['AI share of voice', 'Our share of brand mentions in AI answers', 'Our mentions ÷ all brand mentions', 'Weekly prompt checks', 'SEO & GEO'],
    ['Open rate · click-to-open', 'Visibility (subject) · efficiency (email)', 'Opens ÷ sent · clicks ÷ opens', 'ESP', 'Email'],
    ['EPC', 'What an affiliate earns per click', 'Commission ÷ clicks', 'Shop + creator sheet', 'Affiliates'],
    ['Organic CPM', 'Cost of 1,000 organic plays', 'Fee ÷ (plays ÷ 1,000)', 'Creator sheet', 'Paid influencers'],
  ];
  return `<div class="page-h"><div><h1>Definitions</h1><p>One meaning per number. If a meeting argues about a number, the answer is here.</p></div><span class="owner">Owner: marketing ops</span></div>
  ${card('Metrics', table([{ k: 0, l: 'Metric', al: 'l', f: v => `<b>${esc(v)}</b>` }, { k: 1, l: 'Meaning', al: 'l', f: v => esc(v) }, { k: 2, l: 'Formula', al: 'l', f: v => `<code>${esc(v)}</code>` }, { k: 3, l: 'Source of truth', al: 'l' }, { k: 4, l: 'Used on', al: 'l' }], D),
    'Rule: one source of truth per metric. Leads come from the CRM, sales from the shop, spend from the ad platforms, traffic from GA4. Never add a platform\'s conversions to the CRM\'s.')}`;
} };
// page-local controls (campaign picker, sequence picker, renewals toggle)
document.getElementById('page').addEventListener('change', e => {
  if (e.target.dataset.done) { store.set('done:' + e.target.dataset.done, e.target.checked ? iso(new Date()) : null); render(); return; }
  const k = e.target.dataset.local; if (k) { S[k] = e.target.value; render(); }
});
document.getElementById('page').addEventListener('click', e => { const b = e.target.closest('[data-local]'); if (b && b.tagName === 'BUTTON') { S[b.dataset.local] = b.dataset.v === '1'; render(); } });

// ---------- render ----------
let lastRoute;
function render() {
  const rt = PAGES[route()] && !LOCKED.has(route()) ? route() : 'brief';
  if (rt !== lastRoute) { S.campaign = 'all'; lastRoute = rt; }
  renderMenu(); renderFilters(PAGES[rt].filters);
  document.getElementById('filters').style.display = PAGES[rt].noFilters ? 'none' : '';
  document.getElementById('page').innerHTML = PAGES[rt].render();
  flush();
}
addEventListener('hashchange', () => { render(); scrollTo(0, 0); });
document.getElementById('login').addEventListener('click', () => {  // demo: no accounts, data stays in this file
  let t = document.querySelector('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = 'Demo version: login is turned off. All data here is sandbox data.'; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 2600);
});
render();
