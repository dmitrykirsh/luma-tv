'use strict';
/* ================= Страница фильма (как на десктопе): оценки с логотипами, вкладки, актёры, трейлеры ================= */
window.RENDER = window.RENDER || {};
const rateCls = (n) => (n >= 7 ? 'hi' : n >= 5.5 ? 'mid' : 'lo');
const dList = (a) => (Array.isArray(a) && a.length ? a.join(', ') : '');
const dFact = (k, v) => (v ? `<div class="fact"><small>${esc(k)}</small><b>${esc(v)}</b></div>` : '');
const SEC_BY_TYPE_TV = { 1: 'films', 2: 'cartoons', 3: 'series', 4: 'tvshows', 5: 'cartoons', 6: 'anime', 7: 'anime' };
const rateChip = (key, cls, val, title) => `<span class="rate ${cls}" title="${esc(title)}">${window.brandIcon ? window.brandIcon(key) : ''}<b>${val}</b></span>`;

/* ---------- Letterboxd (страница фильма по TMDB id; читаем рейтинг из разметки) ---------- */
let lbCache = {}; try { lbCache = JSON.parse(localStorage.getItem('luma.tv.lb') || '{}'); } catch {}
async function lbRating(tmdb) {
  if (!tmdb) return null;
  const c = lbCache[tmdb]; if (c && Date.now() - c.at < 6 * 3600e3) return c.v;
  try {
    const r = await fetch(tvPx('https://letterboxd.com/tmdb/' + tmdb + '/', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36', '', true));
    const text = await r.text();
    const v = text.match(/"ratingValue":\s*([\d.]+)/), n = text.match(/"ratingCount":\s*(\d+)/);
    const out = v ? { value: Number(v[1]), count: n ? Number(n[1]) : 0 } : null;
    lbCache[tmdb] = { at: Date.now(), v: out }; try { localStorage.setItem('luma.tv.lb', JSON.stringify(lbCache)); } catch {}
    return out;
  } catch { return null; }
}

/* ---------- трейлеры: TMDB (YouTube) + поиск Rutube с той же строгой проверкой, что на десктопе ---------- */
const trNrm = (x) => String(x || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ' ').trim();
const trYears = (x) => [...String(x || '').matchAll(/\b(19\d\d|20\d\d)\b/g)].map((m) => Number(m[1]));
const TR_WORDS = /трейлер|trailer|тизер|teaser|official|официальн|ролик/i;
function trScore(t, v) {
  const title = trNrm(v.title);
  const names = [t.name, t.origin].map(trNrm).filter((n) => n.length >= 3);
  if (!names.some((n) => title.includes(n))) return 0;
  if (v.duration != null && (v.duration < 15 || v.duration > 420)) return 0;
  const yr = Number(t.year) || 0; let s = 1;
  if (yr) { const ys = trYears(v.title); if (ys.length && !ys.includes(yr)) return 0; if (ys.includes(yr)) s += 3; else if (trYears(v.description).includes(yr)) s += 1; else return 0; }
  if (TR_WORDS.test(v.title)) s += 3;
  if (v.duration != null && v.duration <= 240) s += 1;
  return s;
}
// YouTube в некоторых сетях недоступен (встроенный плеер остаётся чёрным), поэтому сначала проверяем доступность
let ytOk = null;
function ytReachable() {
  if (ytOk) return ytOk;
  ytOk = new Promise((res) => { const tm = setTimeout(() => res(false), 4000); fetch('https://www.youtube.com/generate_204', { mode: 'no-cors' }).then(() => { clearTimeout(tm); res(true); }).catch(() => { clearTimeout(tm); res(false); }); });
  return ytOk;
}
async function findTrailers(t) {
  const out = [];
  const rutube = (async () => {
    const nm = t.name || '', or = t.origin || '', y = t.year || '';
    const qs = [`${nm} ${y} трейлер`, or && trNrm(or) !== trNrm(nm) ? `${or} ${y} trailer` : '', `${nm} ${y} официальный трейлер`].filter(Boolean);
    const seen = new Map();
    await Promise.all(qs.map(async (q) => {
      try {
        const r = await fetch(tvPx('https://rutube.ru/api/search/video/?query=' + encodeURIComponent(q), '', '', true)); const j = await r.json();
        for (const v of j.results || []) { if (seen.has(v.id)) continue; const sc = trScore(t, { title: v.title, description: v.description, duration: v.duration }); if (sc) seen.set(v.id, { sc, item: { src: 'Rutube', id: v.id, title: v.title, thumb: v.thumbnail_url, url: 'https://rutube.ru/play/embed/' + v.id + '?autoStart=1' } }); }
      } catch {}
    }));
    return [...seen.values()].sort((a, b) => b.sc - a.sc).slice(0, 6).map((x) => x.item);
  })();
  const yt = (async () => {
    const viaApp = !!(NATIVE && NATIVE.openYoutube);   // трейлер откроется в приложении YouTube, поэтому доступность youtube.com из WebView не важна
    if (!t.tmdb || !tmHas() || (!viaApp && !(await ytReachable()))) return [];
    try {
      const j = await tmdb(`/${t.kind === 'tv' ? 'tv' : 'movie'}/${t.tmdb}/videos`, { include_video_language: 'ru,en,null' });
      const vids = (j.results || []).filter((v) => v.site === 'YouTube' && /^(Trailer|Teaser)$/.test(v.type)).sort((a, b) => (b.official - a.official) || (a.iso_639_1 === 'ru' ? -1 : 0) - (b.iso_639_1 === 'ru' ? -1 : 0) || String(b.published_at).localeCompare(String(a.published_at)));
      return vids.slice(0, 4).map((v) => ({ src: 'YouTube', id: v.key, title: v.name, thumb: `https://i.ytimg.com/vi/${v.key}/hqdefault.jpg`, url: `https://www.youtube-nocookie.com/embed/${v.key}?autoplay=1&rel=0` }));
    } catch { return []; }
  })();
  const [a, b] = await Promise.all([rutube, yt]);
  return [...a, ...b];
}
function openTrailer(t) {
  if (t.src === 'YouTube' && NATIVE && NATIVE.openYoutube) { NATIVE.openYoutube(t.id); return; }
  if (t.src === 'Rutube' && NATIVE && NATIVE.npStart && typeof playTrailerNative === 'function') return playTrailerNative(t);
  openTrailerWeb(t);
}
function openTrailerWeb(t) {
  let box = $('#trl');
  if (!box) { $('#stage').insertAdjacentHTML('beforeend', '<div id="trl" class="hidden"><iframe id="trlFrame" allow="autoplay; fullscreen; encrypted-media" allowfullscreen></iframe></div>'); box = $('#trl'); }
  box.classList.remove('hidden'); const f = $('#trlFrame');
  f.onload = () => f.focus();
  f.src = t.url;
}
function closeTrailer() { const b = $('#trl'); if (!b || b.classList.contains('hidden')) return false; b.classList.add('hidden'); $('#trlFrame').src = 'about:blank'; return true; }
window.trailerOpen = () => !!$('#trl') && !$('#trl').classList.contains('hidden');
window.trailerBack = closeTrailer;

/* ---------- просмотр кадров на весь экран ---------- */
const LBX = { list: [], i: 0 };
function openLightbox(list, i) {
  LBX.list = list; LBX.i = i;
  let box = $('#lbx'); if (!box) { $('#stage').insertAdjacentHTML('beforeend', '<div id="lbx" class="hidden"><img id="lbxImg" alt=""><div id="lbxN"></div></div>'); box = $('#lbx'); }
  box.classList.remove('hidden'); lbxShow(0);
}
function lbxShow(d) { LBX.i = (LBX.i + d + LBX.list.length) % LBX.list.length; $('#lbxImg').src = LBX.list[LBX.i]; $('#lbxN').textContent = (LBX.i + 1) + ' / ' + LBX.list.length; }
window.lightboxOpen = () => !!$('#lbx') && !$('#lbx').classList.contains('hidden');
window.lightboxKey = (e) => { if (e.key === 'ArrowRight') lbxShow(1); else if (e.key === 'ArrowLeft') lbxShow(-1); else return false; e.preventDefault(); return true; };
window.lightboxBack = () => { const b = $('#lbx'); if (!b || b.classList.contains('hidden')) return false; b.classList.add('hidden'); return true; };

/* ---------- страница ---------- */
let DX = null;   // состояние открытой страницы
const preImg = (u) => new Promise((res) => { if (!u) return res(''); const i = new Image(); i.onload = () => res(u); i.onerror = () => res(''); i.src = u; });
// данные TMDB, кадр, логотип и оценки грузятся заранее: страница показывается уже в готовом виде, но не дольше таймаута
async function detailsPrefetch(d) {
  if (!tmHas()) return null;
  const T = await tmFind(d).catch(() => null);
  if (!T) return null;
  await Promise.all([
    preImg(T.backdrop ? TMI(T.backdrop, 'w1280') : ''), preImg(T.logo ? TMI(T.logo, 'w500') : ''),
    T.kind === 'movie' ? lbRating(T.tmdb).catch(() => null) : null, omdbRatings(T.imdb).catch(() => null)
  ]);
  return T;
}
async function renderDetails2(r, t) {
  view.innerHTML = '<div class="empty"><div class="spin"></div></div>';
  const d = await info(r.id);
  if (!alive(t)) return;
  await Promise.race([detailsPrefetch(d), wait(3500)]);
  if (!alive(t)) return;
  const inf = d.info || {}, seasons = seasonsOf(d), serial = seasons.length > 0;
  const last = S.history.find((h) => h.id === d.id);
  let s0 = seasons[0]?.season, e0 = seasons[0]?.episodes[0];
  if (serial && last?.season && seasons.find((x) => x.season == last.season)) { s0 = last.season; e0 = last.episode; }
  const rsm = resumeInfo(d.id, serial ? s0 : null, serial ? e0 : null);
  const kp = Number(d.kp_rating) || 0, im = Number(d.imdb_rating) || 0;
  det = { d, seasons, serial, s0, e0 };
  DX = { d, inf, T: null, trailers: null, shots: [], recs: null, tab: '', token: t };
  const watch = rsm || (serial && last) ? 'Продолжить' + (serial ? ` · С${s0} Э${e0}` : '') + (rsm ? ' · ' + fmtTime(rsm.t) : '') : 'Смотреть';
  const people = d.people || {};
  const tabs = [['about', 'О фильме']];
  if (serial) tabs.push(['eps', 'Серии']);
  tabs.push(['trailers', 'Трейлеры']);
  if ((people.actors || []).length || (people.directors || []).length) tabs.push(['cast', 'Актёры']);
  tabs.push(['more', 'Похожее']);
  view.innerHTML = `<div class="page"><div class="dbg" id="dbg"></div><div class="dshade"></div><div class="det"><div class="dp"><img src="${esc(posterOf(d))}" alt="" onerror="detPoster(this)"></div><div class="di">
    <div class="ty">${esc(TYPES[d.type] || '')}${inf.age ? ' · ' + esc(inf.age) + '+' : ''}</div>
    <h1 id="dTitle">${esc(d.name)}</h1><div class="orig">${esc(d.origin_name || inf.name_eng || '')}</div>
    <div class="meta"><span>${d.year || ''}</span>${inf.time ? `<span>•</span><span>${esc(inf.time)}</span>` : ''}${serial ? `<span>•</span><span>${seasons.length} сез.</span>` : ''}
      ${(inf.country || []).slice(0, 2).map((c) => `<span class="c">${esc(c)}</span>`).join('')}${d.quality ? `<span class="c">${esc(d.quality)}</span>` : ''}</div>
    <div class="genres">${(inf.genre || []).map((g) => `<button class="chip genre f" tabindex="-1" data-genre="${esc(g)}" data-k="g:${esc(g)}">${esc(g)}</button>`).join('')}</div>
    <div class="rates" id="dRates">${kp ? rateChip('kp', rateCls(kp), kp.toFixed(1), 'Кинопоиск') : ''}${im ? rateChip('imdb', rateCls(im), im.toFixed(1), 'IMDb') : ''}</div>
    <div class="btns"><button class="btn primary f" tabindex="-1" data-act="watch" data-k="watch">${ico('play')}${esc(watch)}</button>
      ${rsm ? `<button class="btn f" tabindex="-1" data-act="start" data-k="start">${ico('restart')}С начала</button>` : ''}
      <button class="btn f" tabindex="-1" data-act="trailer" data-k="trailer">${ico('trailer')}Трейлер</button>
      <button class="btn f ${isFav(d.id) ? 'on' : ''}" tabindex="-1" data-act="fav" data-k="fav">${ico('heart')}<span>${isFav(d.id) ? 'В избранном' : 'В избранное'}</span></button></div></div></div>
    <div class="dtabs" id="dTabs">${tabs.map(([k, l]) => `<button class="chip f" tabindex="-1" data-dtab="${k}" data-k="tab:${k}">${l}</button>`).join('')}</div>
    <div id="dPanel" class="dpanel"></div></div>`;
  $('[data-act=watch]').focus({ preventScroll: true });
  selectTab(serial && last?.season ? 'eps' : 'about');
  if (r.autoplay) $('[data-act=watch]').click();
  detailsEnhance(d, t);
}

function selectTab(k) {
  if (!DX || DX.tab === k) return;
  DX.tab = k;
  $$('#dTabs .chip').forEach((b) => b.classList.toggle('on', b.dataset.dtab === k));
  const p = $('#dPanel'); if (!p) return;
  (PANELS[k] || PANELS.about)(p);
}

const PANELS = {
  about(p) {
    const { d, inf } = DX;
    const facts = [dFact('Премьера', inf.premier_rus || inf.premier), dFact('Режиссёр', dList(inf.director)), dFact('Сценарий', dList(inf.screenwriter)), dFact('Продюсеры', dList(inf.producer).slice(0, 120)), dFact('Оператор', dList(inf.operator)), dFact('Композитор', dList(inf.composer)), dFact('Бюджет', inf.budget), dFact('Рейтинг MPAA', inf.rate_mpaa)].join('');
    p.innerHTML = `<div class="blk f" tabindex="-1" data-k="abt"><p class="desc2">${esc(inf.description || 'Описание пока не добавили.')}</p></div>
      ${facts ? `<div class="facts f" tabindex="-1" data-k="facts">${facts}</div>` : ''}
      ${(inf.trivia || []).length ? `<h3 class="ph3">Интересные факты</h3>${inf.trivia.slice(0, 6).map((x, i) => `<div class="blk triv f" tabindex="-1" data-k="tv${i}">${esc(x)}</div>`).join('')}` : ''}`;
  },
  eps(p) {
    p.innerHTML = '<div class="eps2"><div class="seasons" id="dSeasons"></div><div class="epgrid" id="dEps"></div></div>';
    paintEps($('#dSeasons'), $('#dEps'), det.s0, 'd');
  },
  async trailers(p) {
    p.innerHTML = '<div class="empty" style="padding:40px"><div class="spin"></div></div>';
    const { d, inf, T } = DX, tok = DX.token;
    if (!DX.trailers) DX.trailers = findTrailers({ name: d.name, origin: d.origin_name || inf.name_eng, year: d.year, tmdb: T?.tmdb, kind: T?.kind });
    const list = await DX.trailers;
    if (!DX || DX.token !== tok || DX.tab !== 'trailers') return;
    DX.trList = list;
    p.innerHTML = list.length ? `<div class="trailers">${list.map((x, i) => `<div class="tr f" tabindex="-1" data-trailer="${i}" data-k="tr${i}"><div class="th"><img loading="lazy" src="${esc(x.thumb)}" alt=""><i>▶</i></div><b>${esc(x.title)}</b><small>${esc(x.src)}</small></div>`).join('')}</div>` : '<div class="empty" style="padding:50px 0;text-align:left"><b>Трейлеров пока нет</b></div>';
  },
  cast(p) {
    const people = DX.d.people || {};
    const row = (title, arr, role) => arr?.length ? `<h3 class="ph3">${title}</h3><div class="track people">${arr.map((x) => `<div class="person f" tabindex="-1" data-pid="${x.id}" data-k="pp${x.id}"><div class="pha">${x.avatar_url ? `<img loading="lazy" src="${esc(x.avatar_url)}" alt="">` : `<span>${esc((x.name || '?')[0])}</span>`}</div><b>${esc(x.name)}</b>${role && x.characters?.[0] ? `<small>${esc(x.characters[0])}</small>` : ''}</div>`).join('')}</div>` : '';
    p.innerHTML = row('Режиссёры', people.directors) + row('В ролях', people.actors, true);
  },
  async more(p) {
    const { d, inf } = DX, tok = DX.token;
    p.innerHTML = '<div id="partsWrap"></div><div id="simWrap"><div class="empty" style="padding:40px"><div class="spin"></div></div></div>';
    const parts = (d.parts || []).filter((id) => id !== d.id);
    if (parts.length) {
      Promise.all(parts.map((id) => info(id).catch(() => null))).then((arr) => {
        const w = $('#partsWrap'); const list = arr.filter(Boolean); if (!w || !DX || DX.token !== tok || !list.length) return;
        w.innerHTML = `<h3 class="ph3">Другие части</h3><div class="track">${list.map((x) => cardHTML(x, 'pt:' + x.id)).join('')}</div>`; hookImages(w);
      });
    }
    // рекомендации TMDB, если их достаточно; иначе подбираем по жанрам, рейтингу и году
    const recs = await (DX.recsP || Promise.resolve(null));
    if (!DX || DX.token !== tok || DX.tab !== 'more') return;
    const w = $('#simWrap'); if (!w) return;
    if (recs && recs.length >= 6) { w.innerHTML = `<h3 class="ph3">Рекомендуют зрители</h3><div class="track">${recs.map((x) => cardHTML(x, 'rc:' + x.id)).join('')}</div>`; hookImages(w); return; }
    const cats = { 1: 'films', 2: 'cartoons', 3: 'series', 4: 'tvshows', 5: 'cartoon_series', 6: 'anime_films', 7: 'anime_series' }[d.type] || 'films';
    const gens = (inf.genre || []).slice(0, 3).map((g) => g[0].toUpperCase() + g.slice(1));
    let pool = [];
    try {
      const lists = await Promise.all((gens.length ? gens : ['']).map((g) => catalog({ cat: cats, limit: 60, sort: 'kp', genre: g }).catch(() => [])));
      const byId = new Map();
      for (const l of lists) for (const x of l) { const o = byId.get(x.id); if (o) o.hits++; else byId.set(x.id, { x, hits: 1 }); }
      const kp0 = Number(d.kp_rating) || Number(d.imdb_rating) || 7, y0 = Number(d.year) || 2000;
      pool = [...byId.values()].map(({ x, hits }) => { const kp = Number(x.kp_rating) || Number(x.imdb_rating) || 0; return { x, score: hits * 3 - Math.abs(kp - kp0) * 1.5 - Math.abs((x.year || y0) - y0) / 8 - (kp ? 0 : 3) }; }).sort((a, b) => b.score - a.score).map((q) => q.x);
    } catch {}
    const sim = pool.filter((x) => x.id !== d.id && !parts.includes(x.id)).slice(0, 18);
    if (!DX || DX.token !== tok || DX.tab !== 'more') return;
    w.innerHTML = sim.length ? `<h3 class="ph3">Вам может понравиться</h3><div class="track">${sim.map((x) => cardHTML(x, 'sm:' + x.id)).join('')}</div>` : '';
    hookImages(w);
  }
};

/* дополнительные данные: кадры, логотип, оценки, рекомендации */
async function detailsEnhance(d, t) {
  if (!tmHas()) { DX.recsP = Promise.resolve(null); return; }
  let T; try { T = await tmFind(d); } catch { T = null; }
  if (!DX || DX.token !== t || !alive(t)) return;
  if (!T) { DX.recsP = Promise.resolve(null); return; }
  DX.T = T; DX.shots = T.shots || [];
  if (T.backdrop) { const u = TMI(T.backdrop, 'w1280'), im = new Image(); im.onload = () => { const b = $('#dbg'); if (b && alive(t)) { b.style.backgroundImage = `url("${u}")`; b.classList.add('on'); } }; im.src = u; }
  if (T.logo) { const h = $('#dTitle'); if (h) { const img = new Image(); img.className = 'logo-img'; img.alt = d.name; img.onload = () => { if (alive(t)) { h.textContent = ''; h.appendChild(img); h.classList.add('has-logo'); } }; img.src = TMI(T.logo, 'w500'); } }
  // вкладка «Кадры» появляется, когда есть что показать
  if (DX.shots.length > 1 && !$('[data-dtab=shots]')) {
    $('#dTabs [data-dtab=more]')?.insertAdjacentHTML('beforebegin', '<button class="chip f" tabindex="-1" data-dtab="shots" data-k="tab:shots">Кадры</button>');
    PANELS.shots = (p) => { p.innerHTML = `<div class="track shots2">${DX.shots.map((b, i) => `<div class="shot f" tabindex="-1" data-shotbig="${i}" data-k="sh${i}"><img loading="lazy" src="${esc(TMI(b, 'w780'))}" alt=""></div>`).join('')}</div>`; $$('.shots2 img').forEach((im) => { im.onerror = () => { if (!im.dataset.r) { im.dataset.r = 1; setTimeout(() => { im.src = im.src; }, 2500); } else im.closest('.shot')?.remove(); }; }); };
  }
  DX.recsP = (async () => { const out = []; let i = 0; const rc = T.recs || []; await Promise.all(Array.from({ length: 4 }, async () => { while (i < rc.length) { const x = rc[i++]; const m = await tmMatchCached(x, T.kind).catch(() => null); if (m && m.id !== d.id) out.push({ m, o: i }); } })); return out.sort((a, b) => a.o - b.o).map((x) => x.m); })();
  // оценки: TMDB, Letterboxd, Rotten Tomatoes, Metacritic
  const box = () => ($('#dRates') && alive(t) ? $('#dRates') : null);
  if (T.vote) box()?.insertAdjacentHTML('beforeend', rateChip('tmdb', rateCls(T.vote), T.vote.toFixed(1), 'TMDB'));
  if (T.kind === 'movie') lbRating(T.tmdb).then((o) => { if (o && box()) box().insertAdjacentHTML('beforeend', rateChip('lb', rateCls(o.value * 2), o.value.toFixed(1), 'Letterboxd')); });
  omdbRatings(T.imdb).then((o) => {
    if (!o || !box()) return;
    if (o.rt) box().insertAdjacentHTML('beforeend', rateChip('rt', o.rt >= 60 ? 'hi' : 'lo', o.rt + '%', 'Rotten Tomatoes'));
    if (o.mc) box().insertAdjacentHTML('beforeend', rateChip('mc', o.mc >= 61 ? 'hi' : o.mc >= 40 ? 'mid' : 'lo', o.mc, 'Metacritic'));
  }).catch(() => {});
  if (DX.tab === 'trailers') { DX.tab = ''; selectTab('trailers'); }   // трейлеры точнее с TMDB-id
}

/* ---------- клики и фокус ---------- */
document.addEventListener('click', (e) => {
  const el = e.target.closest('.f'); if (!el || route.name !== 'details') return;
  if (el.dataset.dtab) { selectTab(el.dataset.dtab); return; }
  if (el.dataset.genre) { topLevel('section', { sec: SEC_BY_TYPE_TV[DX.d.type] || 'films', genre: el.dataset.genre }); return; }
  if (el.dataset.pid) { go('person', { lift: el.dataset.pid }); return; }
  if (el.dataset.trailer) { const x = DX.trList?.[+el.dataset.trailer]; if (x) openTrailer(x); return; }
  if (el.dataset.shotbig) { openLightbox(DX.shots.map((b) => TMI(b, 'w1280')), +el.dataset.shotbig); return; }
  if (el.dataset.act === 'trailer') {
    if (!DX.trailers) DX.trailers = findTrailers({ name: DX.d.name, origin: DX.d.origin_name || DX.inf.name_eng, year: DX.d.year, tmdb: DX.T?.tmdb, kind: DX.T?.kind });
    el.style.opacity = .6;
    DX.trailers.then((l) => { el.style.opacity = 1; if (l.length) openTrailer(l[0]); else toast('Трейлера пока нет'); });
  }
});
let tabT = 0;
document.addEventListener('focusin', (e) => {
  const el = e.target.closest?.('.f'); if (!el || route.name !== 'details') return;
  // вкладка открывается только по OK: раньше она переключалась сама, пока курсор просто проезжал по вкладкам (и грузила трейлеры из сети)
  if (el.dataset.dtab) clearTimeout(tabT);
});
window.RENDER.details = renderDetails2;

// постер на странице фильма не загрузился: запасной (страница фильма, затем TMDB)
window.detPoster = async (img) => {
  img.onerror = null; if (!DX || !DX.d) return;
  const d = DX.d, url = await findPoster(d.id, d.name, d.year, img.src);
  if (url && DX && DX.d === d) { posterFix[d.id] = url; try { localStorage.setItem('luma.tv.pfix', JSON.stringify(posterFix)); } catch {} img.src = url; feedPublish(); }
};
