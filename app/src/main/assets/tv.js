'use strict';
/* ================= ТВ: каналы, телепрограмма, плеер ================= */
const TV_RAW = 'https://raw.githubusercontent.com/smolnp/IPTVru/gh-pages/';
const TV_LISTS = [['main', TV_RAW + 'IPTVru.m3u'], ['stable', TV_RAW + 'IPTVstable.m3u8']];
const TV_EPG_URL = 'https://iptvx.one/epg/epg_lite.xml.gz';
const TV_ADULT = /(xxx|эротик|для взрослых|взрослые|adult|18\+)/i;
const TV_TTL = 6 * 3600e3;

const tvB64 = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const tvPx = (u, ua = '', ref = '', raw = false, hdr = null) => 'https://liftw.ws/__p/' + tvB64(JSON.stringify({ u, ua, ref, ...(raw ? { raw: true } : {}), ...(hdr ? { hdr } : {}) }));
const tvNrm = (x) => String(x || '').toLowerCase().replace(/ё/g, 'е').replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').replace(/\b(hd|fhd|uhd|4k|sd|orig)\b/g, ' ').replace(/[^a-zа-я0-9]+/g, '');
const tvSlug = (x) => tvNrm(x) || String(x).length + ':' + String(x).slice(0, 12);

const TVD = { channels: [], list: [], cat: 'Все', cur: null, srcIdx: 0, hls: null, epg: { programmes: {}, alias: {}, at: 0 }, epgBusy: false, shown: 0, osdT: 0, stuckT: 0, timers: {}, loading: null };
const tvX = () => (S.extra = S.extra || {});
const tvFavs = () => (tvX().tvFav = tvX().tvFav || []);
const tvIsFav = (id) => tvFavs().includes(id);
function tvToggleFav(id) { const f = tvFavs(); const i = f.indexOf(id); if (i >= 0) f.splice(i, 1); else f.unshift(id); save(); return i < 0; }
const tvStats = () => (tvX().tvStats = tvX().tvStats || {});

/* ---------- плейлисты ---------- */
function tvParseM3u(text, dropAdult) {
  const out = []; let meta = null, opts = {}, grp = '';
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF')) {
      const m = line.match(/^#EXTINF:\s*-?[\d.]+\s*((?:[\w.-]+="[^"]*"\s*)*)(?:[\w.-]+=\S+\s*)*,(.*)$/);
      const attrs = {};
      if (m) for (const a of m[1].matchAll(/([\w.-]+)="([^"]*)"/g)) attrs[a[1].toLowerCase()] = a[2];
      meta = { attrs, name: ((m && m[2]) || line.split(',').pop() || '').trim() }; opts = {};
    } else if (/^#EXTVLCOPT:/i.test(line)) {
      const m = line.match(/^#EXTVLCOPT:http-(user-agent|referrer|referer|origin)\s*=\s*"?(.*?)"?$/i);
      if (m) opts[/user-agent/i.test(m[1]) ? 'ua' : /origin/i.test(m[1]) ? 'origin' : 'ref'] = m[2];
    } else if (/^#EXTGRP:/i.test(line)) grp = line.slice(8).trim();
    else if (line.startsWith('#')) continue;
    else if (meta && /^https?:\/\//i.test(line)) {
      let url = line, ua = opts.ua, ref = opts.ref;
      const bar = url.indexOf('|');
      if (bar > 0) { for (const kv of url.slice(bar + 1).split('&')) { const [k, ...v] = kv.split('='); const val = decodeURIComponent(v.join('=')); if (/^user-agent$/i.test(k)) ua = val; else if (/^referr?er$/i.test(k)) ref = val; } url = url.slice(0, bar); }
      const group = meta.attrs['group-title'] || grp || 'Без категории';
      if (!(dropAdult && (TV_ADULT.test(group) || TV_ADULT.test(meta.name)))) out.push({ name: meta.name || 'Без названия', group, logo: meta.attrs['tvg-logo'] || '', tvg: (meta.attrs['tvg-id'] || '').toLowerCase(), url, ua, ref });
      meta = null;
    }
  }
  return out;
}
function tvToChannels(items, prefix) {
  const by = new Map();
  for (const c of items) {
    const id = prefix + (c.tvg || tvSlug(c.name));
    let ch = by.get(id);
    if (!ch) { ch = { id, name: c.name, group: c.group, logo: c.logo, tvg: c.tvg, sources: [] }; by.set(id, ch); }
    if (!ch.logo && c.logo) ch.logo = c.logo;
    if (!ch.sources.some((s) => s.url === c.url)) ch.sources.push({ url: c.url, ua: c.ua || '', ref: c.ref || '' });
  }
  return [...by.values()];
}
async function tvFetchList(url, builtin) {
  const r = await fetch(tvPx(url, '', '', true));   // плейлист каналов отдаём как есть, без переписывания адресов
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return tvToChannels(tvParseM3u(await r.text(), builtin), '');
}
async function tvLoad(force) {
  if (TVD.loading) return TVD.loading;
  if (TVD.channels.length && !force) return;
  TVD.loading = (async () => {
    // быстрый старт: каналы из прошлого запуска
    if (!force) { try { const c = JSON.parse(localStorage.getItem('luma.tv.ch2') || 'null'); if (c && Date.now() - c.at < TV_TTL && c.list.length) { TVD.channels = c.list; tvAfterLoad(); return; } } catch {} }
    const res = await Promise.allSettled(TV_LISTS.map(([, u]) => tvFetchList(u, true)));
    const [main, stable] = res.map((x) => (x.status === 'fulfilled' ? x.value : []));
    const stableById = new Map(stable.map((c) => [c.id, c]));
    let list = main.map((c) => { const s = stableById.get(c.id); return s ? { ...c, stable: true, sources: [...s.sources, ...c.sources.filter((x) => !s.sources.some((y) => y.url === x.url))] } : c; });
    for (const s of stable) if (!list.some((c) => c.id === s.id)) list.push({ ...s, stable: true });
    for (const e of (tvX().tvCustom || []).filter((x) => x && (x.url || x.file) && x.enabled !== false)) {
      try {
        const chs = e.file ? tvToChannels(tvParseM3u(await IDB.get('pl:' + e.id) || '', false), '') : await tvFetchList(e.url, false);
        list.push(...chs.map((c) => ({ ...c, id: 'c' + e.id + ':' + c.id, list: e.name })));
      } catch {}
    }
    if (!list.length) throw new Error('NO_CHANNELS');
    TVD.channels = list;
    try { localStorage.setItem('luma.tv.ch2', JSON.stringify({ at: Date.now(), list })); } catch {}
    tvAfterLoad();
  })();
  try { await TVD.loading; } finally { TVD.loading = null; }
}
function tvAfterLoad() { try { const c = JSON.parse(localStorage.getItem('luma.tv.epg') || 'null'); if (c) TVD.epg = c; } catch {} if (Date.now() - (TVD.epg.at || 0) > TV_TTL) tvEpgRefresh(); }

/* ---------- телепрограмма (читается в фоне, в памяти остаются только нужные каналы) ---------- */
function tvEpgWorker() {
  self.onmessage = async (e) => {
    const { url, ids, names } = e.data;
    const nrm = (x) => String(x || '').toLowerCase().replace(/ё/g, 'е').replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').replace(/\b(hd|fhd|uhd|4k|sd|orig)\b/g, ' ').replace(/[^a-zа-я0-9]+/g, '');
    const dec = (x) => String(x || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&amp;/g, '&').trim();
    const ptime = (x) => {
      const m = String(x).match(/(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)\s*([+-])?(\d\d)?(\d\d)?/); if (!m) return 0;
      const off = m[7] ? (m[7] === '-' ? -1 : 1) * ((+m[8] || 0) * 60 + (+m[9] || 0)) : 0;
      return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) - off * 60000;
    };
    const wantedIds = new Set(ids), wantedNames = new Map(names), nameToEpg = new Map();
    const now = Date.now(), from = now - 4 * 3600e3, to = now + 48 * 3600e3;
    const programmes = {}; let total = 0;
    try {
      const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status);
      const rd = r.body.pipeThrough(new DecompressionStream('gzip')).pipeThrough(new TextDecoderStream()).getReader();
      let buf = '', phaseProg = false;
      for (;;) {
        const { value, done } = await rd.read(); if (done) break;
        buf += value; let pos = 0;
        for (;;) {
          const c = phaseProg ? -1 : buf.indexOf('<channel ', pos), p = buf.indexOf('<programme ', pos);
          let i, kind;
          if (c >= 0 && (p < 0 || c < p)) { i = c; kind = 'c'; } else if (p >= 0) { i = p; kind = 'p'; phaseProg = true; } else { pos = Math.max(pos, buf.length - 12); break; }
          const end = buf.indexOf(kind === 'c' ? '</channel>' : '</programme>', i);
          if (end < 0) { pos = i; break; }
          const block = buf.substring(i, end);
          if (kind === 'c') {
            const id = (block.match(/^<channel\s+id="([^"]*)"/) || [])[1];
            if (id) for (const n of block.matchAll(/<display-name[^>]*>([\s\S]*?)<\/display-name>/g)) { const k = nrm(dec(n[1])); if (k && wantedNames.has(k) && !nameToEpg.has(k)) { nameToEpg.set(k, id); wantedIds.add(id); } }
            pos = end + 10;
          } else {
            const m = block.match(/^<programme\s+([^>]*)>/);
            if (m) {
              const a = m[1], ch = (a.match(/channel="([^"]*)"/) || [])[1];
              if (ch && wantedIds.has(ch)) {
                const s = ptime((a.match(/start="([^"]*)"/) || [])[1]), e2 = ptime((a.match(/stop="([^"]*)"/) || [])[1]);
                if (s && e2 && e2 >= from && s <= to) { const title = dec((block.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1]); if (title) { (programmes[ch] = programmes[ch] || []).push([s, e2, title]); total++; } }
              }
            }
            pos = end + 12;
          }
        }
        buf = buf.slice(pos);
      }
      for (const id of Object.keys(programmes)) programmes[id].sort((x, y) => x[0] - y[0]);
      const alias = {};
      for (const [k, cids] of wantedNames) { const e3 = nameToEpg.get(k); if (e3 && programmes[e3]) for (const id of cids) alias[id] = e3; }
      postMessage({ ok: true, programmes, alias, total });
    } catch (err) { postMessage({ error: String(err && err.message || err) }); }
  };
}
function tvEpgRefresh() {
  if (TVD.epgBusy || !TVD.channels.length || typeof Worker === 'undefined') return;
  TVD.epgBusy = true;
  const ids = [], by = new Map();
  for (const c of TVD.channels) { if (c.tvg) ids.push(c.tvg); else { const k = tvNrm(c.name); if (k) { if (!by.has(k)) by.set(k, []); by.get(k).push(c.id); } } }
  let w;
  try { w = new Worker(URL.createObjectURL(new Blob(['(' + tvEpgWorker.toString() + ')()'], { type: 'text/javascript' }))); } catch { TVD.epgBusy = false; return; }
  const done = () => { TVD.epgBusy = false; try { w.terminate(); } catch {} };
  w.onmessage = (e) => {
    done();
    if (!e.data.ok) return;
    TVD.epg = { programmes: e.data.programmes, alias: e.data.alias, at: Date.now() };
    try { localStorage.setItem('luma.tv.epg', JSON.stringify(TVD.epg)); } catch {}
    if (route.name === 'tv') tvPaintNow();
  };
  w.onerror = done;
  w.postMessage({ url: tvPx(TV_EPG_URL, '', '', true), ids: [...new Set(ids)], names: [...by] });
}
function tvNowNext(ch) {
  const id = (ch.tvg && TVD.epg.programmes[ch.tvg]) ? ch.tvg : TVD.epg.alias[ch.id];
  const list = id && TVD.epg.programmes[id]; if (!list) return {};
  const now = Date.now();
  for (let i = 0; i < list.length; i++) if (list[i][0] <= now && now < list[i][1]) return { now: list[i][2], next: list[i + 1]?.[2], pct: Math.round(100 * (now - list[i][0]) / (list[i][1] - list[i][0])), end: list[i][1] };
  return {};
}

/* ---------- экран «Каналы» ---------- */
/* ---------- «Каналы мира»: общий каталог iptv-org (проект сообщества, каналы всех стран) ---------- */
const TVW = { all: null, at: 0, loading: null, byId: new Map(), cc: '', q: '' };
const TVW_URL = 'https://iptv-org.github.io/iptv/index.m3u';
const TVW_GROUPS = { General: 'Общие', Movies: 'Фильмы', Series: 'Сериалы', Entertainment: 'Развлекательные', Music: 'Музыка', Sports: 'Спорт', News: 'Новости', Kids: 'Детские', Documentary: 'Документальные', Religious: 'Религия', Culture: 'Культура', Outdoor: 'Природа и путешествия', Lifestyle: 'Стиль жизни', Undefined: 'Без категории', Education: 'Образование', Animation: 'Мультфильмы', Business: 'Бизнес', Comedy: 'Комедии', Cooking: 'Кулинария', Family: 'Семейные', Legislative: 'Парламент', Public: 'Общественные', Relax: 'Релакс', Science: 'Наука', Shop: 'Магазины', Travel: 'Путешествия', Weather: 'Погода', Auto: 'Авто', Classic: 'Классика', Interactive: 'Интерактивные', Local: 'Местные' };
async function tvWideLoad() {
  if (TVW.all && Date.now() - TVW.at < TV_TTL) return TVW.all;
  if (TVW.loading) return TVW.loading;
  TVW.loading = (async () => {
    const r = await fetch(tvPx(TVW_URL, '', '', true));
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const items = tvParseM3u(await r.text(), true)
      .filter((c) => !/\[(?:Not 24\/7|Geo-blocked)\]/i.test(c.name))   // каналы «не круглосуточно» и «только из своей страны» не показываем
      .map((c) => ({ ...c, name: c.name.replace(/\s*\(\d{3,4}p\)/gi, '').replace(/\s*\[[^\]]*\]/g, '').trim(), group: String(c.group || '').split(';').map((g) => TVW_GROUPS[g.trim()] || g.trim()).filter(Boolean)[0] || 'Без категории' }));
    const list = tvToChannels(items, 'x:').map((c) => ({ ...c, cc: ((c.tvg || '').match(/\.([a-z]{2,3})(?:@|$)/) || [])[1] || 'int' }));
    TVW.all = list; TVW.at = Date.now(); TVW.byId = new Map(list.map((c) => [c.id, c]));
    return list;
  })();
  try { return await TVW.loading; } finally { TVW.loading = null; }
}
const tvRegion = (() => { let dn = null; try { dn = new Intl.DisplayNames(['ru'], { type: 'region' }); } catch {} return (cc) => { const u = String(cc || '').toUpperCase(); if (!u || u === 'INT') return 'Международные'; try { return (dn && dn.of(u === 'UK' ? 'GB' : u)) || u; } catch { return u; } }; })();
const tvChan = (id) => TVD.channels.find((c) => c.id === id) || TVW.byId.get(id);
function tvChipsList() {
  const g = new Map();
  for (const c of TVD.channels) g.set(c.group, (g.get(c.group) || 0) + 1);
  const groups = [...g.entries()].sort((a, b) => b[1] - a[1]).map((x) => x[0]);
  return ['Все', '★ Избранные', ...groups];
}
function tvFiltered() {
  const cat = TVD.cat;
  return TVD.channels.filter((c) => cat === 'Все' || (cat === '★ Избранные' ? tvIsFav(c.id) : c.group === cat));
}
function tvCard(c, key) {
  const nn = tvNowNext(c);
  return `<div class="chc f" tabindex="-1" data-ch="${esc(c.id)}" data-k="${esc(key)}"><div class="lg"><span>${esc(c.name.slice(0, 2))}</span>${c.logo ? `<img decoding="async" loading="lazy" src="${esc(/^https?:/i.test(c.logo) ? tvPx(c.logo) : c.logo)}" alt="">` : ''}${tvIsFav(c.id) ? '<i class="st">★</i>' : ''}</div>
    <div class="n">${esc(c.name)}</div><div class="np">${nn.now ? esc(nn.now) : esc(c.group)}</div>${nn.pct != null ? `<i class="pg" style="width:${nn.pct}%"></i>` : ''}</div>`;
}
function tvHook(root) { $$('.chc .lg img', root).forEach((im) => { im.onload = () => im.classList.add('ok'); im.onerror = () => im.remove(); if (im.complete && im.naturalWidth) im.classList.add('ok'); }); }
function tvPaintNow() {
  if (route.name !== 'tv') return;
  $$('.chc').forEach((el) => { const c = tvChan(el.dataset.ch); if (!c) return; const nn = tvNowNext(c); const np = $('.np', el); if (np && nn.now) np.textContent = nn.now; let pg = $('.pg', el); if (nn.pct != null) { if (!pg) { pg = document.createElement('i'); pg.className = 'pg'; el.appendChild(pg); } pg.style.width = nn.pct + '%'; } });
}
async function renderTv(r, t) {
  view.innerHTML = '<div class="empty"><div class="spin"></div></div>';
  try { await tvLoad(); } catch { if (alive(t)) view.innerHTML = '<div class="empty"><b>Каналы не загрузились</b>Проверьте интернет и откройте раздел ещё раз</div>'; return; }
  if (!alive(t)) return;
  feedPublish();   // каналы загружены: лаунчер получит логотипы недавних и избранных
  const recent = Object.entries(tvStats()).filter(([id, s]) => s.last && tvChan(id)).sort((a, b) => b[1].last - a[1].last).slice(0, 14).map(([id]) => tvChan(id));
  const favs = tvFavs().map(tvChan).filter(Boolean);
  const rails = TVD.cat === 'Все'
    ? (favs.length ? `<section class="sec"><h2>Избранные</h2><div class="track">${favs.map((c) => tvCard(c, 'f:' + c.id)).join('')}</div></section>` : '') +
      (recent.length ? `<section class="sec"><h2>Недавно смотрели</h2><div class="track">${recent.map((c) => tvCard(c, 'r:' + c.id)).join('')}</div></section>` : '') : '';
  view.innerHTML = `<div class="page"><div class="chips filters"><button class="chip fl f ${TVD.cat === 'Все' ? '' : 'on'}" tabindex="-1" data-tvflt="1" data-k="flt:cat"><small>Категория</small>${esc(TVD.cat)}<i>▾</i></button><button class="chip fl f" tabindex="-1" data-tvworld="1" data-k="tvworld"><small>Другие страны</small>Каналы мира<i>›</i></button><span class="fcount">${TVD.channels.length} каналов</span></div>${rails}<div class="grid tvgrid" id="tvGrid"></div></div>`;
  TVD.list = tvFiltered(); TVD.shown = 0;
  if (!TVD.list.length) $('#tvGrid').outerHTML = '<div class="empty"><b>Здесь пока пусто</b>Добавьте каналы в избранное: на экране просмотра нажмите OK и выберите ★</div>';
  else tvMore();
  tvHook(view);
  const first = $('#tvGrid .chc') || $('.chc') || $('.chip.on');
  first?.focus({ preventScroll: true });
}
function tvMore() {
  const g = $('#tvGrid'); if (!g || TVD.shown >= TVD.list.length) return;
  const part = TVD.list.slice(TVD.shown, TVD.shown + 56); TVD.shown += part.length;
  g.insertAdjacentHTML('beforeend', part.map((c) => tvCard(c, 'g:' + c.id)).join(''));
  tvHook(g);
}

/* ---------- экран «Каналы мира»: страны и поиск по всем странам ---------- */
async function renderTvWorld(r, t) {
  view.innerHTML = '<div class="empty"><div class="spin"></div></div>';
  let all;
  try { all = await tvWideLoad(); } catch { if (alive(t)) view.innerHTML = '<div class="empty"><b>Каталог не загрузился</b>Проверьте интернет и попробуйте ещё раз</div>'; return; }
  if (!alive(t)) return;
  const cc = r.cc || '';
  const base = cc ? all.filter((c) => c.cc === cc) : all;
  view.innerHTML = `<div class="page"><div class="search"><input id="wq" class="f" tabindex="-1" data-k="wq" placeholder="${cc ? 'Найти канал: ' + esc(tvRegion(cc)) : 'Найти канал среди всех стран (например: MTV)'}" autocomplete="off"></div>
    ${cc ? `<h3 class="ph3" style="padding:0 48px">${esc(tvRegion(cc))}<small> · ${base.length} каналов</small></h3>` : ''}
    <div id="wbody"></div></div>`;
  const body = $('#wbody');
  const countries = () => {
    const n = {}; all.forEach((c) => { n[c.cc] = (n[c.cc] || 0) + 1; });
    const rows = Object.entries(n).map(([k, v]) => [k, v, tvRegion(k)]).sort((a, b) => b[1] - a[1]);
    body.innerHTML = `<h3 class="ph3" style="padding:0 48px">Страны</h3><div class="grid wgrid">${rows.map(([k, v, name]) => `<button class="wc f" tabindex="-1" data-wcc="${esc(k)}" data-k="wc:${esc(k)}"><b>${esc(name)}</b><small>${v} каналов</small></button>`).join('')}</div>
      <p class="whint">Каталог ведёт сообщество проекта iptv-org (github.com/iptv-org/iptv). Часть ссылок может не работать.</p>`;
  };
  const show = (list) => {
    TVD.list = list; TVD.shown = 0;
    body.innerHTML = list.length ? '<div class="grid tvgrid" id="tvGrid"></div>' : '<div class="empty"><b>Каналов не нашлось</b>Попробуйте другое название</div>';
    if (list.length) { tvMore(); tvHook(body); }
  };
  const run = () => {
    const q = ($('#wq').value || '').trim().toLowerCase();
    if (!q) { if (cc) show(base); else countries(); return; }
    show(base.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 300));
  };
  if (cc) show(base); else countries();
  const q = $('#wq');
  q.onkeydown = (e) => { if (e.key !== 'Enter') return; e.preventDefault(); run(); q.blur(); setTimeout(() => ($('#tvGrid .chc') || $('.wc'))?.focus({ preventScroll: true }), 150); };
  q.oninput = () => { if (!q.value.trim()) run(); };
  const first = $('#tvGrid .chc') || $('.wc') || q;
  first.focus({ preventScroll: true });
}
window.RENDER = window.RENDER || {};
window.RENDER.tvworld = renderTvWorld;

/* ---------- плеер ---------- */
const tvOpen = () => !$('#tvp').classList.contains('hidden');
function tvEnsureDom() {
  if ($('#tvp')) return;
  $('#stage').insertAdjacentHTML('beforeend', `<div id="tvp" class="hidden"><video id="tvv" playsinline></video><div id="tvst" class="hidden"><div class="spin"></div><span></span></div>
    <div id="tvOsd" class="hidden"><div class="pclk"></div><div class="o1"><b id="tvName"></b><span id="tvSrc"></span></div><div class="o2" id="tvNow"></div><div class="o3"><i id="tvBar"></i></div><div class="o4" id="tvNext"></div><div class="o5">▲ ▼ каналы · OK или ◀ список каналов · ▶ программа передач</div></div>
    <div id="tvList" class="hidden"></div><div id="tvProg" class="hidden"></div></div>`);
}
function tvStatus(msg, spin = true) { const s = $('#tvst'); if (!msg) { s.classList.add('hidden'); return; } s.classList.remove('hidden'); $('span', s).textContent = msg; $('.spin', s).style.display = spin ? '' : 'none'; }
function tvOsd(ms = 4500) {
  const c = TVD.cur; if (!c) return;
  tick();
  const nn = tvNowNext(c);
  $('#tvName').textContent = (tvIsFav(c.id) ? '★ ' : '') + c.name;
  $('#tvSrc').textContent = c.sources.length > 1 ? `источник ${TVD.srcIdx + 1} из ${c.sources.length}` : '';
  $('#tvNow').textContent = nn.now || c.group;
  $('#tvNext').textContent = nn.next ? 'Дальше: ' + nn.next : '';
  $('#tvBar').style.width = (nn.pct || 0) + '%';
  $('.o3').style.visibility = nn.pct != null ? 'visible' : 'hidden';
  $('#tvOsd').classList.remove('hidden'); clearTimeout(TVD.osdT); TVD.osdT = setTimeout(() => $('#tvOsd').classList.add('hidden'), ms);
}
function tvStop() {
  clearTimeout(TVD.stuckT);
  if (TVD.hls) { try { TVD.hls.destroy(); } catch {} TVD.hls = null; }
  const v = $('#tvv'); if (v) { try { v.pause(); } catch {} v.removeAttribute('src'); v.load(); }
}
function tvPlay(ch, srcIdx = 0, fresh = true) {
  tvEnsureDom();
  if (!ch) return;
  const first = !tvOpen();
  $('#tvp').classList.remove('hidden');
  if (first) { try { NATIVE?.keepOn?.(true); } catch {} }
  TVD.cur = ch; TVD.srcIdx = srcIdx % ch.sources.length;
  if (fresh) { tvX().tvLast = ch.id; const st = tvStats(); const s = (st[ch.id] = st[ch.id] || { n: 0, t: 0, last: 0, name: '' }); s.last = Date.now(); s.n++; s.name = ch.name; save(); }
  tvStop(); tvStatus('Подключаемся…'); tvOsd();
  const src = ch.sources[TVD.srcIdx], v = $('#tvv'), url = tvPx(src.url, src.ua, src.ref);
  let tries = 0;
  const fail = () => {
    if (TVD.cur !== ch) return;
    if (ch.sources.length > 1 && ++tries <= ch.sources.length - 1) { tvPlay(ch, TVD.srcIdx + 1, false); toast('Источник ' + (((TVD.srcIdx + 1) % ch.sources.length) + 1) + ' из ' + ch.sources.length); return; }
    tvStatus('Нет сигнала. ▲ ▼ — другой канал', false);
  };
  v.onplaying = () => { tvStatus(''); clearTimeout(TVD.stuckT); };
  v.onwaiting = () => { if (TVD.cur === ch) tvStatus('Буферизация…'); };
  v.onerror = fail;
  TVD.stuckT = setTimeout(() => { if (TVD.cur === ch && v.paused !== false && !v.currentTime) fail(); }, 20000);
  const isHls = /\.m3u8?(\?|#|$)/i.test(src.url) || !/\.(mp4|ts|mkv|avi|webm)(\?|#|$)/i.test(src.url);
  if (isHls && window.Hls && Hls.isSupported()) {
    const h = new Hls({ maxBufferLength: 20, backBufferLength: 10, liveSyncDurationCount: 3, manifestLoadingTimeOut: 15000, levelLoadingTimeOut: 15000, fragLoadingTimeOut: 25000, manifestLoadingMaxRetry: 1, levelLoadingMaxRetry: 2, fragLoadingMaxRetry: 3 });
    let net = 0, med = 0;
    h.on(Hls.Events.MANIFEST_PARSED, () => { v.play().catch(() => {}); });
    h.on(Hls.Events.ERROR, (_e, d) => {
      if (!d.fatal) return;
      if (d.type === Hls.ErrorTypes.NETWORK_ERROR && net++ < 1) { h.startLoad(); return; }
      if (d.type === Hls.ErrorTypes.MEDIA_ERROR && med++ < 2) { h.recoverMediaError(); return; }
      fail();
    });
    h.loadSource(url); h.attachMedia(v); TVD.hls = h;
  } else { v.src = url; v.play().catch(() => {}); }
  clearInterval(TVD.timers.count);
  TVD.timers.count = setInterval(() => { if (!v.paused && TVD.cur) { const s = tvStats()[TVD.cur.id]; if (s) { s.t += 15; s.last = Date.now(); save(); } } }, 15000);
}
function tvClose() {
  clearInterval(TVD.timers.count); tvStop(); tvStatus('');
  $('#tvp').classList.add('hidden'); $('#tvList').classList.add('hidden'); $('#tvOsd').classList.add('hidden');
  try { NATIVE?.keepOn?.(false); } catch {}
  TVD.cur = null;
  if (route.name === 'tv') { const k = lastContent; show(route, { scroll: view.scrollTop, focus: k }); }
}
function tvZap(dir) {
  const list = TVD.list.length ? TVD.list : TVD.channels;
  let i = list.findIndex((c) => c.id === TVD.cur.id);
  if (i < 0) i = 0;
  tvPlay(list[(i + dir + list.length) % list.length]);
}
function tvOpenList() {
  const box = $('#tvList'), list = TVD.list.length ? TVD.list : TVD.channels;
  const i = Math.max(0, list.findIndex((c) => c.id === TVD.cur.id));
  const from = Math.max(0, i - 150), part = list.slice(from, from + 320);
  box.innerHTML = `<div class="tl-h">${esc(TVD.cat)}<span> · ${list.length} каналов</span></div><div class="tl-b">${part.map((c) => `<div class="tl-r"><button class="tl-c f ${c.id === TVD.cur.id ? 'cur' : ''}" tabindex="-1" data-tvplay="${esc(c.id)}" data-k="tl:${esc(c.id)}"><span class="a">${esc(c.name)}</span><span class="b">${esc(tvNowNext(c).now || c.group)}</span></button><button class="tl-s f ${tvIsFav(c.id) ? 'on' : ''}" tabindex="-1" data-tvstar="${esc(c.id)}" data-k="ts:${esc(c.id)}" aria-label="Избранное">★</button><button class="tl-g f" tabindex="-1" data-tvprog="${esc(c.id)}" data-k="tg:${esc(c.id)}" aria-label="Программа">≡</button></div>`).join('')}</div>`;
  box.classList.remove('hidden');
  const cur = $('.tl-c.cur', box) || $('.tl-c', box);
  cur?.focus({ preventScroll: true }); cur?.scrollIntoView({ block: 'center' });
}
const tvHm = (ms) => new Date(ms).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
function tvOpenProg(ch) {
  const box = $('#tvProg');
  const id = (ch.tvg && TVD.epg.programmes[ch.tvg]) ? ch.tvg : TVD.epg.alias[ch.id];
  const list = (id && TVD.epg.programmes[id]) || [], now = Date.now();
  let day = '', rows = '';
  for (const [s0, e0, title] of list) {
    if (e0 < now - 2 * 3600e3) continue;
    const d = new Date(s0).toLocaleDateString('ru', { weekday: 'long', day: 'numeric', month: 'long' });
    if (d !== day) { day = d; rows += `<div class="tp-day">${esc(d)}</div>`; }
    const isNow = s0 <= now && now < e0;
    rows += `<div class="tp-r f ${isNow ? 'now' : e0 < now ? 'past' : ''}" tabindex="-1" data-k="pg:${s0}"><span class="tm">${tvHm(s0)} – ${tvHm(e0)}</span><span class="ti">${esc(title)}</span>${isNow ? `<i style="width:${Math.round(100 * (now - s0) / (e0 - s0))}%"></i>` : ''}</div>`;
  }
  const same = TVD.cur && TVD.cur.id === ch.id;
  box.innerHTML = `<div class="tp-h"><b>${esc(ch.name)}</b>${same && ch.sources.length > 1 ? `<button class="tp-s f" tabindex="-1" data-tvsrc="1" data-k="tp:src">Источник ${TVD.srcIdx + 1} из ${ch.sources.length} ›</button>` : ''}</div><div class="tp-sub">${list.length ? 'Телепрограмма' : ''}</div>
    <div class="tp-b">${rows || '<div class="empty" style="padding:60px 0;text-align:left">Для этого канала телепрограмма не найдена.</div>'}</div>`;
  box.classList.remove('hidden'); $('#tvList').classList.add('hidden');
  const target = $('.tp-r.now', box) || $('.tp-r', box) || $('.tp-s', box);
  target?.focus({ preventScroll: true }); target?.scrollIntoView({ block: 'center' });
}
function tvKey(e) {
  if (!$('#tvList').classList.contains('hidden') || !$('#tvProg').classList.contains('hidden')) return false;   // панели управляются общим перемещением фокуса
  const k = e.key;
  if (k === 'ArrowUp') tvZap(-1);
  else if (k === 'ArrowDown') tvZap(1);
  else if (k === 'ArrowLeft' || k === 'Enter') tvOpenList();
  else if (k === 'ArrowRight') tvOpenProg(TVD.cur);
  else return false;
  e.preventDefault(); return true;
}
function tvBack() {
  if (!$('#tvp') || !tvOpen()) return false;
  const p = $('#tvProg'), l = $('#tvList');
  if (!p.classList.contains('hidden')) { p.classList.add('hidden'); return true; }
  if (!l.classList.contains('hidden')) { l.classList.add('hidden'); return true; }
  tvClose(); return true;
}
window.tvPlayerOpen = () => !!$('#tvp') && tvOpen();
window.tvKey = tvKey; window.tvBack = tvBack;
window.tvMedia = (k) => { const v = $('#tvv'); if (!v || !tvOpen()) return false; if (k === 'playpause') { v.paused ? v.play() : v.pause(); } else if (k === 'next') tvZap(1); else if (k === 'prev') tvZap(-1); return true; };
window.tvPause = () => { try { $('#tvv')?.pause(); } catch {} };

/* клики по каналам, звёздам, категориям */
document.addEventListener('click', (e) => {
  const el = e.target.closest('.f'); if (!el) return;
  if (el.dataset.tvworld) { go('tvworld', {}); return; }
  if (el.dataset.wcc) { go('tvworld', { cc: el.dataset.wcc }); return; }
  if (el.dataset.ch) { TVD.list = (route.name === 'tv' || route.name === 'tvworld') && TVD.list.length ? TVD.list : TVD.channels; const c = tvChan(el.dataset.ch); if (c) tvPlay(c); }
  else if (el.dataset.tvflt) {
    const cnt = new Map(); for (const c of TVD.channels) cnt.set(c.group, (cnt.get(c.group) || 0) + 1);
    pickDlg('Категория каналов', tvChipsList().map((g) => ({ label: g, on: g === TVD.cat, v: g, sub: g === 'Все' ? String(TVD.channels.length) : g === '★ Избранные' ? String(tvFavs().length) : String(cnt.get(g) || '') })), (o) => { TVD.cat = o.v; show({ name: 'tv' }, { scroll: 0, focus: 'flt:cat' }); });
  }
  else if (el.dataset.tvplay) { const c = tvChan(el.dataset.tvplay); $('#tvList').classList.add('hidden'); if (c) tvPlay(c); }
  else if (el.dataset.tvprog) { const c = tvChan(el.dataset.tvprog); if (c) tvOpenProg(c); }
  else if (el.dataset.tvsrc) { tvPlay(TVD.cur, TVD.srcIdx + 1, false); tvOpenProg(TVD.cur); }
  else if (el.dataset.tvstar) { const on = tvToggleFav(el.dataset.tvstar); el.classList.toggle('on', on); toast(on ? 'Канал в избранном' : 'Убрано из избранного'); tvOsd(); }
});
document.addEventListener('focusin', (e) => {
  const el = e.target.closest?.('.chc'); if (!el || !el.closest('#tvGrid')) return;
  const cards = $$('#tvGrid .chc'); if (cards.length - cards.indexOf(el) <= 14) tvMore();
});
window.RENDER = window.RENDER || {};
window.RENDER.tv = renderTv;

// luma://tv?id=… из лаунчера: включить канал сразу
window.lumaOpenTv = async (id) => { try { await tvLoad(); const c = tvChan(id); if (c) { TVD.list = TVD.list.length ? TVD.list : TVD.channels; tvPlay(c); } } catch {} };
