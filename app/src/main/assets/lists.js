'use strict';
/* ================= Подборки: Letterboxd, MDBList, Trakt ================= */
window.RENDER = window.RENDER || {};
const LS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const LS_UA_APP = 'Luma-Desktop/2.0 (+https://liftw.ws)';
const LB_HOST = 'https://letterboxd.com';
const LIST_RE = /letterboxd\.com\/([A-Za-z0-9_-]+)\/list\/([A-Za-z0-9_-]+)/i;
const L_TV = [3, 4, 5, 7], L_MOVIE = [1, 2, 6, 4];
const LS_ERR = {
  BLOCKED: 'Letterboxd не отдал страницу (у них защита от автоматических запросов). Попробуйте позже.', NOT_FOUND: 'Такого списка нет.',
  NO_KEY: 'Не задан ключ сервиса. Ключи приезжают с резервной копией (Настройки → Перенос с телефона).', BAD_KEY: 'Ключ сервиса не подошёл.', RATE: 'Слишком много запросов, подождите минуту.', NETWORK: 'Не удалось связаться с сервисом.', HTTP: 'Сервис вернул ошибку.'
};
const lsErr = (code) => Object.assign(new Error(code), { code });
const lsDecode = (x) => String(x || '').replace(/&#0?39;|&#x27;|&rsquo;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const lsCache = new Map();
const lsGet = (k, ttl) => { const h = lsCache.get(k); return h && Date.now() - h.t < ttl ? h.v : undefined; };
const lsPut = (k, v) => { lsCache.set(k, { t: Date.now(), v }); return v; };
const lsSecret = (n) => (S.secrets && S.secrets[n]) || '';
const savedLists = () => (tvX().lists = tvX().lists || []);
const isListSaved = (url) => savedLists().some((l) => l.url === url);

/* ---------- перевод запроса на английский ---------- */
const CYR = /[А-Яа-яЁё]/;
const DICT = {
  'ужасы': 'horror', 'ужастики': 'horror', 'хоррор': 'horror', 'хорроры': 'horror', 'хэллоуин': 'halloween', 'хеллоуин': 'halloween', 'хэлоуин': 'halloween', 'нуар': 'film noir', 'космос': 'space',
  'романтика': 'romance', 'мелодрамы': 'romance', 'комедии': 'comedy', 'комедия': 'comedy', 'боевики': 'action', 'боевик': 'action', 'триллеры': 'thriller', 'триллер': 'thriller',
  'детективы': 'mystery', 'детектив': 'mystery', 'фантастика': 'science fiction', 'фэнтези': 'fantasy', 'мультфильмы': 'animation', 'аниме': 'anime', 'вестерны': 'western', 'вестерн': 'western',
  'новый год': 'christmas', 'новогодние фильмы': 'christmas movies', 'рождество': 'christmas', 'вампиры': 'vampires', 'зомби': 'zombies', 'маньяки': 'serial killers', 'любовь': 'love',
  'война': 'war', 'военные': 'war movies', 'драмы': 'drama', 'драма': 'drama', 'классика': 'classics', 'лучшие фильмы': 'best movies', 'документальные': 'documentary', 'семейные': 'family movies'
};
const trCache = new Map();
async function toEnglish(q) {
  q = String(q || '').trim();
  if (!q || !CYR.test(q)) return q;
  const key = q.toLowerCase();
  if (DICT[key]) return DICT[key];
  if (trCache.has(key)) return trCache.get(key);
  let out = q;
  try {
    const r = await fetch(tvPx('https://api.mymemory.translated.net/get?langpair=ru|en&q=' + encodeURIComponent(q), '', '', true)); const j = await r.json();
    const t = String((j.responseData && j.responseData.translatedText) || '').trim();
    if (t && !CYR.test(t) && !/MYMEMORY WARNING|QUERY LENGTH LIMIT/i.test(t)) out = t.replace(/[.!?]+$/, '').toLowerCase();
  } catch {}
  trCache.set(key, out); return out;
}

/* ---------- Letterboxd ---------- */
async function lbFetch(url) {
  const r = await fetch(tvPx(url, LS_UA, '', true, { 'Accept-Language': 'en-US,en;q=0.9' }));
  const text = await r.text();
  if (r.status === 403 || /Just a moment/i.test(text.slice(0, 3000))) throw lsErr('BLOCKED');
  if (r.status === 404) throw lsErr('NOT_FOUND');
  if (!r.ok) throw lsErr('HTTP');
  return text;
}
const lbFilms = (html) => [...html.matchAll(/data-item-name="([^"]*)"[^>]*?data-item-slug="([^"]+)"/g)].map((m) => { const full = lsDecode(m[1]); const y = full.match(/^(.*?)\s*\((\d{4})\)$/); return { title: y ? y[1] : full, year: y ? Number(y[2]) : 0, key: 'lb:' + m[2], kind: 'movie' }; });
async function lbList(url, quick) {
  const ck = 'lb:' + url + (quick ? ':q' : ''), hit = lsGet(ck, 3600e3); if (hit) return hit;
  const h = await lbFetch(url);
  const meta = (p) => lsDecode((h.match(new RegExp(`<meta property="${p}" content="([^"]*)"`)) || [])[1]);
  const desc = lsDecode((h.match(/<meta name="description" content="([^"]*)"/) || [])[1]);
  const count = Number((desc.match(/A list of ([\d,]+) films?/) || [])[1]?.replace(/,/g, '')) || 0;
  const all = lbFilms(h);
  const about = desc.replace(/^A list of [\d,]+ films? compiled on Letterboxd, including .*? About this list:\s*/i, '').replace(/^A list of [\d,]+ films? compiled on Letterboxd.*$/i, '');
  const pages = quick ? 1 : Math.min(10, Math.ceil((count || all.length) / 100));
  const rest = Array.from({ length: Math.max(0, pages - 1) }, (_, i) => i + 2), got = {}; let idx = 0;
  await Promise.all(Array.from({ length: 3 }, async () => { while (idx < rest.length) { const p = rest[idx++]; try { got[p] = lbFilms(await lbFetch(url + 'page/' + p + '/')); } catch { got[p] = []; } } }));
  for (const p of rest) all.push(...(got[p] || []));
  const m = url.match(LIST_RE);
  return lsPut(ck, { url, source: 'letterboxd', title: meta('og:title') || m[2], author: m[1], desc: about.slice(0, 400), count: count || all.length, films: all.slice(0, count || 1000), names: all.slice(0, 3).map((f) => f.title) });
}
async function lbPopular() {
  const hit = lsGet('lb:pop', 1800e3); if (hit) return hit;
  const text = await lbFetch(LB_HOST + '/lists/popular/');
  const lists = [];
  for (const m of text.matchAll(/<article class="list-summary[\s\S]*?<\/article>/g)) {
    const b = m[0], href = (b.match(/href="(\/[^\/"]+\/list\/[^\/"]+\/)"/) || [])[1]; if (!href) continue;
    const films = (b.match(/([\d,]+)\s*(?:&nbsp;|\s)*films?/) || [])[1];
    lists.push({ url: LB_HOST + href, source: 'letterboxd', title: lsDecode((b.match(/<h2[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/) || [])[1]), author: (href.match(/^\/([^\/]+)\//) || [])[1], count: films ? Number(films.replace(/,/g, '')) : 0, desc: '', names: [...b.matchAll(/data-item-name="([^"]*)"/g)].map((x) => lsDecode(x[1])).slice(0, 4) });
  }
  return lsPut('lb:pop', lists);
}

/* ---------- MDBList ---------- */
async function mdb(p, params = {}) {
  const key = lsSecret('mdblist'); if (!key) throw lsErr('NO_KEY');
  const u = new URL('https://api.mdblist.com' + p); for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v); u.searchParams.set('apikey', key);
  const r = await fetch(tvPx(u.toString(), LS_UA_APP, '', true));
  if (r.status === 401 || r.status === 403) throw lsErr('BAD_KEY'); if (r.status === 429) throw lsErr('RATE'); if (r.status === 404) throw lsErr('NOT_FOUND'); if (!r.ok) throw lsErr('HTTP');
  return r.json();
}
const mdSummary = (l) => ({ url: 'md:' + l.id, source: 'mdblist', title: l.name, author: l.user_name || '', count: l.items || 0, likes: l.likes || 0, desc: lsDecode(l.description).slice(0, 200), names: [] });
async function mdList(id) {
  const ck = 'md:' + id, hit = lsGet(ck, 1800e3); if (hit) return hit;
  const [metaRaw, items] = await Promise.all([mdb('/lists/' + id), mdb('/lists/' + id + '/items', { limit: 500 })]);
  const meta = Array.isArray(metaRaw) ? metaRaw[0] : metaRaw; if (!meta) throw lsErr('NOT_FOUND');
  const films = [];
  for (const [arr, kind] of [[items.movies, 'movie'], [items.shows, 'tv']]) for (const it of arr || []) { const tm = Number(it.ids?.tmdb || it.tmdb_id || 0) || 0; films.push({ title: it.title, year: Number(it.release_year) || 0, key: `md:${kind}:${tm || it.imdb_id || it.id}`, kind, tmdb: tm, rank: it.rank || 0 }); }
  films.sort((a, b) => (a.rank || 1e9) - (b.rank || 1e9));
  const s = mdSummary(meta);
  return lsPut(ck, { ...s, count: s.count || films.length, films, names: films.slice(0, 3).map((f) => f.title) });
}

/* ---------- Trakt ---------- */
async function trakt(p, params = {}) {
  const key = lsSecret('trakt'); if (!key) throw lsErr('NO_KEY');
  const u = new URL('https://api.trakt.tv' + p); for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const r = await fetch(tvPx(u.toString(), LS_UA_APP, '', true, { 'trakt-api-version': '2', 'trakt-api-key': key, 'Content-Type': 'application/json' }));
  if (r.status === 401 || r.status === 403) throw lsErr('BAD_KEY'); if (r.status === 429) throw lsErr('RATE'); if (r.status === 404) throw lsErr('NOT_FOUND'); if (!r.ok) throw lsErr('HTTP');
  return { json: await r.json(), pages: Number(r.headers.get('x-pagination-page-count') || 1) };
}
const trSummary = (l) => ({ url: 'tr:' + l.ids.trakt, source: 'trakt', title: l.name, author: l.user?.username || l.user?.ids?.slug || '', count: l.item_count || 0, likes: l.likes || 0, desc: lsDecode(l.description).slice(0, 200), names: [] });
async function trList(id, quick) {
  const ck = 'tr:' + id + (quick ? ':q' : ''), hit = lsGet(ck, 1800e3); if (hit) return hit;
  const meta = (await trakt('/lists/' + id)).json, films = [];
  for (let page = 1, pages = 1; page <= Math.min(pages, quick ? 1 : 6); page++) {
    const r = await trakt('/lists/' + id + '/items/movies,shows', { page, limit: 100 }); pages = r.pages;
    for (const x of r.json) { const t = x.movie || x.show; if (!t) continue; const kind = x.type === 'show' ? 'tv' : 'movie'; films.push({ title: t.title, year: t.year || 0, key: `tr:${kind}:${t.ids?.tmdb || t.ids?.trakt}`, kind, tmdb: Number(t.ids?.tmdb) || 0 }); }
  }
  const s = trSummary(meta);
  return lsPut(ck, { ...s, count: s.count || films.length, films, names: films.slice(0, 3).map((f) => f.title) });
}
async function getList(ref, quick) {
  ref = String(ref || '');
  if (ref.startsWith('md:')) return mdList(ref.slice(3));
  if (ref.startsWith('tr:')) return trList(ref.slice(3), quick);
  const m = ref.match(LIST_RE); if (!m) throw lsErr('FORMAT');
  return lbList(`${LB_HOST}/${m[1]}/list/${m[2]}/`, quick);
}

/* ---------- сопоставление записей подборки с каталогом ---------- */
const lsMatches = (() => { try { return JSON.parse(localStorage.getItem('luma.tv.lm') || '{}'); } catch { return {}; } })();
let lsSaveT = 0;
const lsPersist = () => { clearTimeout(lsSaveT); lsSaveT = setTimeout(() => { try { if (Object.keys(lsMatches).length > 6000) { for (const k of Object.keys(lsMatches).slice(0, 2000)) delete lsMatches[k]; } localStorage.setItem('luma.tv.lm', JSON.stringify(lsMatches)); } catch {} }, 1500); };
async function matchFilm(f) {
  const ck = f.key; if (ck && lsMatches[ck] !== undefined) return lsMatches[ck] || null;
  const kind = f.kind === 'tv' ? 'tv' : 'movie', types = kind === 'tv' ? L_TV : L_MOVIE;
  const near = (x) => !f.year || !x.year || Math.abs(x.year - f.year) <= 1;
  const pick = (items, names) => items.find((x) => types.includes(x.type) && near(x) && names.some((n) => nameOk(x.origin_name, n) || nameOk(x.name, n)));
  await tmSlot();
  try {
    let hit = pick(await search(f.title), [f.title]);
    if (!hit && tmHas()) {
      let t = null;
      try {
        if (f.tmdb) t = await tmdb(`/${kind}/${f.tmdb}`, {});
        else { const p = { query: f.title }; if (f.year) p[kind === 'tv' ? 'first_air_date_year' : 'year'] = f.year; t = ((await tmdb('/search/' + kind, p)).results || [])[0] || null; }
      } catch {}
      const ru = t && (t.title || t.name), orig = t && (t.original_title || t.original_name), names = [ru, orig, f.title].filter(Boolean);
      for (const q of [...new Set([ru, orig].filter(Boolean))]) { hit = pick(await search(q), names); if (hit) break; }
    }
    lsMatches[ck] = hit ? brief(hit) : 0; lsPersist();
    return hit ? lsMatches[ck] : null;
  } catch { return null; } finally { tmFree(); }
}

/* ---------- оформление карточек: постеры из списка и название по-русски ---------- */
const lsLoadJ = (k) => { try { return JSON.parse(localStorage.getItem(k) || '{}'); } catch { return {}; } };
const lsPrev = lsLoadJ('luma.tv.lprev'), lsTr = lsLoadJ('luma.tv.ltr');
let lsStoreT = 0;
const lsStore = () => { clearTimeout(lsStoreT); lsStoreT = setTimeout(() => {
  for (const [m, cap] of [[lsPrev, 300], [lsTr, 1500]]) { const ks = Object.keys(m); if (ks.length > cap) for (const k of ks.slice(0, ks.length - cap)) delete m[k]; }
  try { localStorage.setItem('luma.tv.lprev', JSON.stringify(lsPrev)); localStorage.setItem('luma.tv.ltr', JSON.stringify(lsTr)); } catch {}
}, 800); };
async function lsPreview(ref) {
  const c = lsPrev[ref]; if (c && Date.now() - c.t < 7 * 864e5) return c.p;
  const L = await getList(ref, true), films = (L.films || []).slice(0, 14), posters = [];
  for (let i = 0; i < films.length && posters.length < 4; i += 4) {
    const got = await Promise.all(films.slice(i, i + 4).map(matchFilm));
    for (const x of got) if (x && x.poster && posters.length < 4) posters.push(x.poster);
  }
  if (posters.length) { lsPrev[ref] = { t: Date.now(), p: posters }; lsStore(); }
  return posters;
}
async function lsRu(s) {
  s = String(s || '').trim(); if (!s || CYR.test(s)) return s;
  if (lsTr[s]) return lsTr[s];
  try {
    const r = await fetch(tvPx('https://api.mymemory.translated.net/get?langpair=en|ru&q=' + encodeURIComponent(s.slice(0, 450)), '', '', true)); const j = await r.json();
    const mt = (j.matches || []).find((m) => m['created-by'] === 'MT!');   // из памяти переводов иногда приходит чужая фраза, берём машинный перевод
    const t = String((mt && mt.translation) || (j.responseData && j.responseData.translatedText) || '').trim();
    if (t && CYR.test(t) && !/MYMEMORY WARNING|QUERY LENGTH LIMIT|INVALID/i.test(t)) { lsTr[s] = t; lsStore(); return t; }
  } catch {}
  return s;
}
const lsEnh = { q: [], busy: 0 };
function lsEnhance(root) {
  $$('.lc[data-list]:not([data-enh])', root).forEach((c) => { c.dataset.enh = '1'; lsEnh.q.push(c); });
  lsPump();
}
function lsPump() {
  if (route.name !== 'lists') { lsEnh.q.length = 0; return; }   // ушли с экрана подборок: очередь больше не нужна
  while (lsEnh.busy < 2 && lsEnh.q.length) {
    const c = lsEnh.q.shift(); if (!document.contains(c)) continue;
    lsEnh.busy++;
    lsEnhCard(c).catch(() => {}).finally(() => { lsEnh.busy--; lsPump(); });
  }
}
// размытый фон: 4 постера рисуются на крошечном холсте, а браузер растягивает его на всю карточку (так дешевле, чем размытие через фильтр)
async function lsMosaic(c, posters) {
  const imgs = await Promise.all(posters.map((u) => new Promise((res) => { const im = new Image(); const t = setTimeout(() => res(null), 6000); im.onload = () => { clearTimeout(t); res(im); }; im.onerror = () => { clearTimeout(t); res(null); }; im.src = u; })));
  if (!document.contains(c)) return;
  const cv = document.createElement('canvas'); cv.width = 20; cv.height = 16; cv.className = 'lbg';
  const g = cv.getContext('2d');
  imgs.forEach((im, i) => {
    if (!im || !im.naturalWidth) return;
    const cw = 10, ch = 8, x = (i % 2) * cw, y = Math.floor(i / 2) * ch, k = Math.max(cw / im.naturalWidth, ch / im.naturalHeight);
    const w = im.naturalWidth * k, h = im.naturalHeight * k;
    g.save(); g.beginPath(); g.rect(x, y, cw, ch); g.clip(); g.drawImage(im, x + (cw - w) / 2, y + (ch - h) / 2, w, h); g.restore();
  });
  c.insertAdjacentElement('afterbegin', cv);
}
async function lsEnhCard(c) {
  const b = $('b', c), title = b ? b.textContent : '';
  const [posters, ru] = await Promise.all([lsPreview(c.dataset.list).catch(() => []), lsRu(title).catch(() => title)]);
  if (!document.contains(c)) return;
  if (posters.length) {
    c.classList.add('has-art');
    lsMosaic(c, posters);
    c.insertAdjacentHTML('beforeend', `<div class="lposters">${posters.map((u) => `<img src="${esc(u)}" alt="" decoding="async">`).join('')}</div>`);
  }
  if (b && ru && ru !== title) { b.textContent = ru; b.insertAdjacentHTML('afterend', `<i class="lorig">${esc(title)}</i>`); }
}
// карточка, на которую встал фокус, оформляется в первую очередь
document.addEventListener('focusin', (e) => {
  const c = e.target.closest?.('.lc[data-list]'); if (!c || !c.dataset.enh) return;
  const i = lsEnh.q.indexOf(c); if (i > 0) { lsEnh.q.splice(i, 1); lsEnh.q.unshift(c); }
});
new MutationObserver(() => { if (route.name === 'lists') lsEnhance(view); }).observe(document.getElementById('view') || document.body, { childList: true, subtree: true });

/* ---------- экраны ---------- */
const LS_SRC = { letterboxd: 'Letterboxd', mdblist: 'MDBList', trakt: 'Trakt' };
const srcOfList = (l) => l.source || (String(l.url).startsWith('md:') ? 'mdblist' : String(l.url).startsWith('tr:') ? 'trakt' : 'letterboxd');
function listCard(l, key) {
  return `<div class="lc f" tabindex="-1" data-list="${esc(l.url)}" data-k="${esc(key)}"><span class="src ${srcOfList(l)}">${LS_SRC[srcOfList(l)] || ''}</span><b>${esc(l.title)}</b>
    <small>${esc([l.author, l.count ? l.count + ' ' + plural(l.count, 'фильм', 'фильма', 'фильмов') : ''].filter(Boolean).join(' · '))}</small>${(l.names || []).length ? `<em>${esc(l.names.slice(0, 3).join(' · '))}</em>` : l.desc ? `<em>${esc(l.desc.slice(0, 90))}</em>` : ''}</div>`;
}
const lsRow = (id, title, lists, pre) => lists.length ? `<section class="sec" id="${id}"><h2>${esc(title)}</h2><div class="track">${lists.map((l, i) => listCard(l, pre + i)).join('')}</div></section>` : '';

async function renderLists(r, t) {
  const saved = savedLists();
  view.innerHTML = `<div class="page"><div class="search"><input id="lq" class="f" tabindex="-1" data-k="lq" placeholder="Найти подборку (например: ужасы, Хэллоуин, лучшие фильмы)" autocomplete="off" enterkeyhint="search"></div>
    <div id="lres"></div><div id="ltop"><div class="empty" style="padding:50px"><div class="spin"></div></div></div></div>`;
  const q = $('#lq');
  let seq = 0;
  const run = async () => {
    const text = q.value.trim(), my = ++seq;
    if (text.length < 2) { $('#lres').innerHTML = ''; $('#ltop').style.display = ''; return false; }
    $('#ltop').style.display = 'none'; $('#lres').innerHTML = '<div class="empty" style="padding:50px"><div class="spin"></div></div>';
    const query = await toEnglish(text);
    const jobs = {};
    if (lsSecret('mdblist')) jobs.mdblist = async () => (await mdb('/lists/search', { query, limit: 40 })).filter((l) => !l.private).map(mdSummary);
    if (lsSecret('trakt')) jobs.trakt = async () => (await trakt('/search/list', { query, limit: 40 })).json.map((x) => x.list).filter((l) => l && l.privacy !== 'private' && l.ids?.trakt).map(trSummary);
    const out = {}, errs = {};
    await Promise.all(Object.entries(jobs).map(async ([k, fn]) => { try { out[k] = await fn(); } catch (e) { errs[k] = e.code || 'NETWORK'; } }));
    if (my !== seq || !alive(t)) return false;
    const a = out.mdblist || [], b = out.trakt || [], lists = [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) { if (a[i]) lists.push(a[i]); if (b[i]) lists.push(b[i]); }
    $('#lres').innerHTML = lists.length ? `<h3 class="ph3" style="padding:0 48px">${query.toLowerCase() !== text.toLowerCase() ? `Ищем «${esc(query)}»` : 'Найдено'}</h3><div class="grid lgrid">${lists.map((l, i) => listCard(l, 'sr' + i)).join('')}</div>` : `<div class="empty"><b>Ничего не нашли</b>${Object.values(errs).length ? esc(LS_ERR[Object.values(errs)[0]] || '') : (Object.keys(jobs).length ? 'Попробуйте другой запрос' : esc(LS_ERR.NO_KEY))}</div>`;
    return lists.length > 0;
  };
  q.onkeydown = async (e) => { if (e.key !== 'Enter') return; e.preventDefault(); const ok = await run(); q.blur(); if (ok) setTimeout(() => $('#lres .lc')?.focus({ preventScroll: true }), 150); };
  q.oninput = () => { if (!q.value.trim()) run(); };
  // сохранённые и топы источников
  const jobs = { letterboxd: lbPopular };
  if (lsSecret('mdblist')) jobs.mdblist = async () => (await mdb('/lists/top', { limit: 30 })).filter((l) => !l.private).map(mdSummary);
  if (lsSecret('trakt')) jobs.trakt = async () => (await trakt('/lists/popular', { limit: 30 })).json.map((x) => x.list).filter((l) => l?.ids?.trakt).map(trSummary);
  const res = {};
  await Promise.all(Object.entries(jobs).map(async ([k, fn]) => { try { res[k] = await fn(); } catch { res[k] = []; } }));
  if (!alive(t)) return;
  const html = lsRow('lsSaved', 'Сохранённые', saved, 'sv') + lsRow('lsMd', 'MDBList · популярные', res.mdblist || [], 'md') + lsRow('lsTr', 'Trakt · популярные', res.trakt || [], 'tr') + lsRow('lsLb', 'Letterboxd · популярные', res.letterboxd || [], 'lb');
  $('#ltop').innerHTML = html || '<div class="empty"><b>Подборки не загрузились</b>Проверьте интернет</div>';
  focusFirst();
}

async function renderList(r, t) {
  view.innerHTML = '<div class="empty"><div class="spin"></div></div>';
  let L;
  try { L = await getList(r.ref); } catch (e) { if (alive(t)) view.innerHTML = `<div class="empty"><b>Не получилось открыть подборку</b>${esc(LS_ERR[e.code] || 'Проверьте интернет и попробуйте ещё раз')}</div>`; return; }
  if (!alive(t)) return;
  const found = [], total = L.films.length;
  view.innerHTML = `<div class="page"><div class="lhead"><div class="ty">${esc(LS_SRC[srcOfList(L)] || '')}</div><h1 class="pname">${esc(L.title)}</h1>
    <div class="meta"><span>${esc(L.author || '')}</span><span>•</span><span>${L.count || total} ${plural(L.count || total, 'фильм', 'фильма', 'фильмов')}</span></div>
    ${L.desc ? `<p class="ldesc">${esc(L.desc)}</p>` : ''}
    <div class="btns"><button class="btn f ${isListSaved(L.url) ? 'on' : ''}" tabindex="-1" data-lsave="${esc(L.url)}" data-k="lsave">${ico('heart')}<span>${isListSaved(L.url) ? 'В сохранённых' : 'Сохранить'}</span></button></div></div>
    <p class="lprog" id="lprog"></p><div class="grid" id="lgrid"></div></div>`;
  window.__ls = { L };
  const grid = $('#lgrid'), prog = $('#lprog');
  const paint = (done) => { prog.textContent = done >= total ? `В Luma есть ${found.length} из ${total}` : `Ищем в Luma… проверено ${done} из ${total}, нашли ${found.length}`; };
  paint(0); focusFirst();
  let done = 0;
  for (let i = 0; i < total; i += 8) {
    const part = L.films.slice(i, i + 8);
    const got = await Promise.all(part.map(matchFilm));
    if (!alive(t)) return;
    const add = got.filter(Boolean).filter((x) => !found.some((y) => y.id === x.id));
    found.push(...add); done = Math.min(total, i + 8);
    if (add.length) { grid.insertAdjacentHTML('beforeend', add.map((it) => cardHTML(it, 'l:' + it.id)).join('')); hookImages(grid); if (found.length === add.length && (document.activeElement === document.body || document.activeElement.dataset?.k === 'lsave')) {} }
    paint(done);
  }
  paint(total);
  if (!found.length) grid.outerHTML = '<div class="empty"><b>В Luma пока ничего нет</b>Загляните позже</div>';
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('.f'); if (!el) return;
  if (el.dataset.list && route.name !== 'list') { go('list', { ref: el.dataset.list }); return; }
  if (el.dataset.lsave && route.name === 'list') {
    const L = window.__ls.L, a = savedLists(), i = a.findIndex((x) => x.url === L.url);
    if (i >= 0) a.splice(i, 1); else a.unshift({ url: L.url, source: srcOfList(L), title: L.title, author: L.author, count: L.count, desc: (L.desc || '').slice(0, 160), names: L.names || [] });
    save(); const on = i < 0; el.classList.toggle('on', on); el.querySelector('span').textContent = on ? 'В сохранённых' : 'Сохранить'; toast(on ? 'Подборка сохранена' : 'Подборка убрана');
  }
});
window.RENDER.lists = renderLists; window.RENDER.list = renderList;
