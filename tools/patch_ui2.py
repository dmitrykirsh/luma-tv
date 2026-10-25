import os, re
os.chdir(r'D:\lift\tv\app\src\main\assets')

s = open('app.js', encoding='utf8').read()

def rep(old, new, cnt=1):
    global s
    assert old in s, 'нет фрагмента: ' + old[:70]
    s = s.replace(old, new, cnt)

def cut(start, end, new):
    global s
    a = s.index(start); b = s.index(end)
    s = s[:a] + new + s[b:]

# ---------- фон убран ----------
cut("let bgI = 0, bgUrl = '', bgT = 0;", "/* ================= плеер ================= */", "function setBg() {}   // размытого фона больше нет: картинки показывает баннер на главной и страница фильма\n\n")
rep("  $('#bg').classList.remove('det');\n", "")

# ---------- главная: баннер, ряды TMDB ----------
new_home = r'''
/* ================= TMDB на главной ================= */
const TM_GENRES = { 28: 'боевик', 12: 'приключения', 16: 'мультфильм', 35: 'комедия', 80: 'криминал', 99: 'документальный', 18: 'драма', 10751: 'семейный', 14: 'фэнтези', 36: 'история', 27: 'ужасы', 10402: 'музыка', 9648: 'детектив', 10749: 'мелодрама', 878: 'фантастика', 10770: 'телефильм', 53: 'триллер', 10752: 'военный', 37: 'вестерн', 10759: 'боевик и приключения', 10762: 'детский', 10765: 'фантастика и фэнтези', 10766: 'мыльная опера', 10768: 'война и политика' };
const tmHas = () => !!(S.secrets && S.secrets.tmdb);
let tmMatches = {}; try { tmMatches = JSON.parse(localStorage.getItem('luma.tv.m') || '{}'); } catch {}
let tmSaveT = 0, tmBusy = 0; const tmWait = [];
const tmSlot = () => new Promise((res) => { const go = () => { tmBusy++; res(); }; tmBusy < 4 ? go() : tmWait.push(go); });
const tmFree = () => { tmBusy--; const n = tmWait.shift(); if (n) n(); };
function tmPersist() { clearTimeout(tmSaveT); tmSaveT = setTimeout(() => { try { if (Object.keys(tmMatches).length > 2500) tmMatches = {}; localStorage.setItem('luma.tv.m', JSON.stringify(tmMatches)); } catch {} }, 1500); }
// сопоставление записи TMDB с каталогом; удачные и честные «нет в каталоге» запоминаются
async function tmMatchCached(t, kind) {
  const ck = kind + ':' + t.id;
  if (tmMatches[ck] !== undefined) return tmMatches[ck] || null;
  await tmSlot();
  try { const m = await matchRec(t, kind); tmMatches[ck] = m ? brief(m) : 0; tmPersist(); return m ? tmMatches[ck] : null; }
  catch { return null; } finally { tmFree(); }
}
async function tmRow(path, params, kind) {
  const j = await tmdb(path, params || {});
  const res = (j.results || []).slice(0, 20);
  const out = await Promise.all(res.map(async (t) => { const it = await tmMatchCached(t, kind); return it ? { it, bd: t.backdrop_path || '', overview: t.overview || '', genres: (t.genre_ids || []).map((g) => TM_GENRES[g]).filter(Boolean), kind } : null; }));
  return out.filter(Boolean);
}

/* ---------- баннер ---------- */
const HERO = { i: 0, items: [], timer: 0 };
function heroPaint(first) {
  const box = $('#hero'); if (!box) return;
  const h = HERO.items[HERO.i]; if (!h) return;
  const it = h.it, tag = h.tag || '★ В тренде';
  const img = h.bd ? TMI(h.bd, 'w1280') : '';
  const layer = document.createElement('div'); layer.className = 'hb' + (img ? '' : ' poster');
  const show = () => { $$('.hb', box).forEach((x) => x.classList.remove('on')); layer.classList.add('on'); setTimeout(() => $$('.hb', box).forEach((x) => { if (x !== layer && !x.classList.contains('on')) x.remove(); }), 900); };
  if (img) { layer.style.backgroundImage = `url("${img}")`; const pre = new Image(); pre.onload = () => requestAnimationFrame(show); pre.onerror = () => requestAnimationFrame(show); pre.src = img; }
  else { layer.innerHTML = it.poster ? `<img src="${esc(it.poster)}" alt="">` : ''; requestAnimationFrame(show); }
  $('.hshade', box).before(layer);
  $('.htag', box).textContent = tag;
  $('.htitle', box).textContent = it.name;
  $('.hmeta', box).innerHTML = [it.year ? `<span>${it.year}</span>` : '', ...(h.genres || []).slice(0, 3).map((g) => `<span class="c">${esc(g)}</span>`), rate(it) ? `<span class="c g">★ ${rate(it).toFixed(1)}</span>` : ''].join('');
  $('.hdesc', box).textContent = h.overview || '';
  $('.hdots', box).innerHTML = HERO.items.map((_, k) => `<i class="${k === HERO.i ? 'on' : ''}"></i>`).join('');
}
function heroSlide(d) { if (!HERO.items.length) return; HERO.i = (HERO.i + d + HERO.items.length) % HERO.items.length; heroPaint(); }
function heroBuild(items) {
  const box = $('#hero'); if (!box || !items.length) { box?.remove(); return; }
  HERO.items = items; HERO.i = 0;
  box.classList.remove('skeleton');
  box.innerHTML = `<div class="hshade"></div><div class="hin"><div class="htag"></div><h2 class="htitle"></h2><div class="hmeta"></div><p class="hdesc"></p>
    <div class="hbtns"><button class="btn primary f" tabindex="-1" data-hero="watch" data-k="hero:watch">${ico('play')}Смотреть</button><button class="btn f" tabindex="-1" data-hero="more" data-k="hero:more">Подробнее</button></div></div><div class="hdots"></div>`;
  heroPaint(true);
  clearInterval(HERO.timer);
  HERO.timer = setInterval(() => { if (!$('#hero')) { clearInterval(HERO.timer); return; } if (playerOpen() || (window.tvPlayerOpen && window.tvPlayerOpen())) return; heroSlide(1); }, 9000);
}

async function renderHome(_, t) {
  const hist = S.history.map((h) => ({ ...h })).slice(0, 20), key = tmHas();
  let html = '<section class="hero skeleton" id="hero"></section>';
  if (hist.length) html += section('rCont', 'Продолжить просмотр');
  if (key) html += section('tm0', 'В тренде на этой неделе');
  html += section('rNew', 'Новинки кино');
  if (key) html += section('tm1', 'Сериалы в тренде');
  html += section('rSer', 'Новые сериалы');
  if (key) html += section('tm2', 'Сейчас в кино');
  html += section('rTop', 'Лучшее по Кинопоиску');
  if (key) html += section('tm3', 'Лучшие фильмы всех времён');
  html += section('rCar', 'Мультфильмы') + section('rAni', 'Аниме') + section('rShow', 'ТВ-шоу');
  if (key) html += section('tm4', 'Скоро выйдут');
  view.innerHTML = `<div class="page">${html}</div>`;
  if (hist.length) fillRail('rCont', hist, { each: (h) => ({ pct: progressPct(h.id, h.season, h.episode), sub: h.season ? `${h.season} сезон · ${h.episode} серия` : '' }) });
  const load = (id, o) => catalog({ limit: 20, ...o }).then((d) => { if (alive(t)) fillRail(id, d); return d; }).catch(() => { if (alive(t)) document.getElementById(id)?.remove(); return []; });
  const lift = [
    load('rNew', { cat: 'films', last: true }), load('rSer', { cat: 'series', last: true }), load('rTop', { cat: 'films', sort: 'kp' }),
    load('rCar', { cat: 'cartoons,cartoon_series' }), load('rAni', { cat: 'anime_series,anime_films' }), load('rShow', { cat: 'tvshows' })
  ];
  // баннер: тренды TMDB; без ключа или при сбое — новинки каталога
  const heroP = (async () => {
    if (key) {
      try {
        const j = await tmdb('/trending/movie/week', {});
        const picks = (j.results || []).filter((x) => x.backdrop_path).slice(0, 9);
        const got = (await Promise.all(picks.map(async (x) => { const it = await tmMatchCached(x, 'movie'); return it ? { it, bd: x.backdrop_path, overview: x.overview || '', genres: (x.genre_ids || []).map((g) => TM_GENRES[g]).filter(Boolean) } : null; }))).filter(Boolean).slice(0, 6);
        if (got.length >= 3) return got;
      } catch {}
    }
    const d = await lift[0];
    return (d || []).filter((x) => x.poster).slice(0, 6).map((it) => ({ it, bd: '', overview: '', genres: [], tag: 'Новинка' }));
  })();
  heroP.then((items) => { if (alive(t)) { heroBuild(items); if (!$('.f:focus', view) && !document.activeElement?.closest?.('#rail')) focusFirst(); } });
  if (key) {
    const rows = [['tm0', '/trending/movie/week', {}, 'movie'], ['tm1', '/trending/tv/week', {}, 'tv'], ['tm2', '/movie/now_playing', { region: 'RU' }, 'movie'], ['tm3', '/movie/top_rated', {}, 'movie'], ['tm4', '/movie/upcoming', { region: 'RU' }, 'movie']];
    (async () => { for (const [id, p, q, k] of rows) { try { const r = await tmRow(p, q, k); if (alive(t)) fillRail(id, r.map((x) => x.it)); } catch { if (alive(t)) document.getElementById(id)?.remove(); } } })();
  }
  await Promise.race([heroP, wait(5000)]);
}

'''
cut("async function renderHome(_, t) {", "async function renderMine(_, t) {", new_home)

# ---------- страница фильма: резкий фон-кадр без размытия ----------
rep("  setBg(d.poster, true);\n", "")
rep('''  view.innerHTML = `<div class="page"><div class="det"><div class="dp">''', '''  view.innerHTML = `<div class="page"><div class="dbg" id="dbg"></div><div class="dshade"></div><div class="det"><div class="dp">''')
rep("  $('[data-act=watch]').focus({ preventScroll: true });\n  tmEnhance(d, t);", "  $('[data-act=watch]').focus({ preventScroll: true });\n  tmEnhance(d, t);\n  if (r.autoplay) $('[data-act=watch]').click();")
rep("  if (T.backdrop) { $('#bg').classList.add('det'); setBg(TMI(T.backdrop, 'w1280'), true); }",
    "  if (T.backdrop) { const u = TMI(T.backdrop, 'w1280'), im = new Image(); im.onload = () => { const b = $('#dbg'); if (b && alive(t)) { b.style.backgroundImage = `url(\"${u}\")`; b.classList.add('on'); } }; im.src = u; }")
rep("  if (el.classList.contains('shot')) setBg(el.dataset.bg);\n", "  if (el.classList.contains('shot')) { const b = $('#dbg'); if (b) { const im = new Image(); im.onload = () => { b.style.backgroundImage = `url(\"${el.dataset.bg}\")`; }; im.src = el.dataset.bg; } }\n")
rep("  if (el.classList.contains('card') && el.dataset.poster) setBg(el.dataset.poster);\n", "")

# ---------- матч рекомендаций: ошибки поиска не глотаем ----------
rep("    const items = await search(q).catch(() => []);\n", "    const items = await search(q);\n")

# ---------- клик по баннеру ----------
rep("  if (el.dataset.sort) {", "  if (el.dataset.hero) { const h = HERO.items[HERO.i]; if (h) go('details', { id: h.it.id, autoplay: el.dataset.hero === 'watch' }); return; }\n  if (el.dataset.sort) {")

# ---------- перемещение: меню открывается только стрелкой влево ----------
a = s.index("  const a = cur.getBoundingClientRect();")
b = s.index("  if (best && dir === 'left'")
seg = s[a:b]
seg = seg.replace("  for (const el of list) {\n    if (el === cur) continue;", "  const inRail = !!cur.closest('#rail');\n  for (const el of list) {\n    if (el === cur) continue;\n    if (scope === document.body) { const r = !!el.closest('#rail'); if (inRail ? !r : (r && dir !== 'left')) continue; }   // меню доступно только стрелкой влево")
s = s[:a] + seg + s[b:]
rep("  if (best && dir === 'left' && best.closest('#rail') && !cur.closest('#rail')) { focusRail(); return; }",
    "  if (dir === 'left' && !inRail && scope === document.body && (!best || best.closest('#rail'))) { focusRail(); return; }\n  if (dir === 'right' && scope === document.body && cur.dataset.hero === 'more' && (!best || !best.closest('.hero'))) { heroSlide(1); return; }")
# область: программа/список каналов
rep("const tvl = $('#tvList');\n  const scope =", "const tvl = $('#tvList'), tvg = $('#tvProg');\n  const scope = (tvg && !tvg.classList.contains('hidden')) ? tvg :")
# прокрутка списков каналов и программы за фокусом + баннер наверх
rep("function ensureVisible(el, instant) {\n", "function ensureVisible(el, instant) {\n  if (el.closest('#tvList, #tvProg')) { el.scrollIntoView({ block: 'nearest' }); return; }\n  if (el.closest('.hero')) { view.scrollTo({ top: 0, behavior: instant ? 'auto' : 'smooth' }); return; }\n")
open('app.js', 'w', encoding='utf8').write(s)

# ---------- HTML ----------
h = open('index.html', encoding='utf8').read()
h = h.replace('  <div id="bg"><canvas class="l"></canvas><canvas class="l"></canvas><div class="shade"></div></div>\n', '')
open('index.html', 'w', encoding='utf8').write(h)

# ---------- CSS ----------
c = open('style.css', encoding='utf8').read()
c = re.sub(r"/\* фон: размытый постер.*?\n#bg \.shade\{[^\n]*\n", "", c, flags=re.S)
c = c.replace("#bg .l.on{opacity:.7}\n", "")
c += '''
/* баннер на главной */
.hero{position:relative;margin:0 48px 22px;height:520px;border-radius:28px;overflow:hidden;background:var(--surface)}
.hero.skeleton{background:linear-gradient(100deg,#181A20 30%,#21242C 50%,#181A20 70%);background-size:200% 100%;animation:sk 1.4s linear infinite}
.hero .hb{position:absolute;inset:0;background-size:cover;background-position:center 20%;opacity:0;transition:opacity .7s}
.hero .hb.on{opacity:1}
.hero .hb.poster{background:radial-gradient(900px 500px at 80% 40%,#2a2d38,var(--surface))}
.hero .hb.poster img{position:absolute;right:90px;top:34px;height:452px;border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,.6)}
.hero .hshade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(11,12,16,.94) 0,rgba(11,12,16,.6) 40%,rgba(11,12,16,0) 75%),linear-gradient(transparent 55%,rgba(11,12,16,.75))}
.hero .hin{position:absolute;left:56px;bottom:56px;width:880px}
.htag{color:var(--primary);font:600 22px var(--body);letter-spacing:2px;text-transform:uppercase}
.htitle{font:700 56px/1.1 var(--display);margin:12px 0 14px}
.hmeta{display:flex;flex-wrap:wrap;gap:12px;align-items:center;font-size:24px}
.hmeta .c{padding:4px 15px;border-radius:15px;background:rgba(248,249,250,.14);font-size:21px}
.hmeta .g{color:var(--accent);font-weight:600}
.hdesc{margin-top:16px;font-size:24px;line-height:1.45;color:#d6d9e0;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.hero .hbtns{display:flex;gap:16px;margin-top:24px}
.hdots{position:absolute;left:56px;bottom:22px;display:flex;gap:10px}
.hdots i{width:44px;height:6px;border-radius:3px;background:rgba(255,255,255,.25)}
.hdots i.on{background:var(--accent)}

/* страница фильма: фон-кадр без размытия */
.page{isolation:isolate}
.dbg{position:absolute;left:-48px;right:-0px;top:-104px;height:880px;background-size:cover;background-position:center top;opacity:0;transition:opacity .7s;z-index:-2}
.dbg.on{opacity:1}
.dshade{position:absolute;left:-48px;right:0;top:-104px;height:880px;z-index:-1;background:linear-gradient(90deg,rgba(11,12,16,.9) 0,rgba(11,12,16,.55) 45%,rgba(11,12,16,.2)),linear-gradient(transparent 45%,var(--bg) 96%)}

/* программа передач в плеере каналов */
#tvProg{position:absolute;right:0;top:0;bottom:0;width:860px;background:linear-gradient(270deg,rgba(11,12,16,.97) 88%,rgba(11,12,16,0));padding:34px 56px 20px 90px;display:flex;flex-direction:column}
.tp-h{display:flex;align-items:center;gap:18px;margin-bottom:6px}
.tp-h b{flex:1;font:700 32px var(--display);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tp-s{flex:none;height:56px;padding:0 24px;border-radius:28px;background:var(--surface);font-size:22px;font-weight:600;color:var(--text)}
.tp-s:focus{background:var(--grad)}
.tp-sub{color:var(--muted);font-size:22px;margin-bottom:14px}
.tp-b{flex:1;overflow:hidden auto;display:flex;flex-direction:column;gap:8px;scrollbar-width:none}
.tp-b::-webkit-scrollbar{display:none}
.tp-r{position:relative;flex:none;display:flex;gap:22px;align-items:baseline;padding:14px 22px;border-radius:16px;background:var(--surface);text-align:left;overflow:hidden}
.tp-r .tm{flex:none;width:150px;font-size:23px;color:var(--muted);font-weight:600}
.tp-r .ti{flex:1;font-size:25px;font-weight:600;line-height:1.25}
.tp-r.now{box-shadow:inset 0 0 0 3px var(--accent)}
.tp-r.now .tm{color:var(--accent)}
.tp-r.past{opacity:.55}
.tp-r i{position:absolute;left:0;bottom:0;height:5px;background:var(--grad)}
.tp-r:focus{background:var(--surface-2);box-shadow:inset 0 0 0 4px var(--primary)}
.tp-day{flex:none;margin:12px 4px 2px;font:600 21px var(--body);color:var(--muted);text-transform:uppercase;letter-spacing:1.5px}
.tl-g{flex:none;width:78px;height:78px;border-radius:18px;background:var(--surface);font-size:30px;color:var(--muted)}
.tl-g:focus{background:var(--grad);color:#fff}
'''
open('style.css', 'w', encoding='utf8').write(c)

# ---------- tv.js: список с прокруткой и программа ----------
t = open('tv.js', encoding='utf8').read()
def trep(old, new):
    global t
    assert old in t, 'tv.js: ' + old[:60]
    t = t.replace(old, new, 1)

trep('<div class="o5">▲ ▼ каналы · ◀ ▶ источник · OK список и избранное</div></div>\n    <div id="tvList" class="hidden"></div></div>`);',
     '<div class="o5">▲ ▼ каналы · OK или ◀ список каналов · ▶ программа передач</div></div>\n    <div id="tvList" class="hidden"></div><div id="tvProg" class="hidden"></div></div>`);')
trep("$('#tvSrc').textContent = c.sources.length > 1 ? `источник ${TVD.srcIdx + 1}/${c.sources.length}` : '';", "$('#tvSrc').textContent = c.sources.length > 1 ? `источник ${TVD.srcIdx + 1} из ${c.sources.length}` : '';")
# список: все каналы окном ±150, + кнопка программы
a = t.index("function tvOpenList() {"); b = t.index("function tvKey(e) {")
newlist = r'''function tvOpenList() {
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
'''
t = t[:a] + newlist + t[b:]
a = t.index("function tvKey(e) {"); b = t.index("window.tvPlayerOpen")
newkey = r'''function tvKey(e) {
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
'''
t = t[:a] + newkey + t[b:]
trep("  else if (el.dataset.tvstar) {", "  else if (el.dataset.tvprog) { const c = tvChan(el.dataset.tvprog); if (c) tvOpenProg(c); }\n  else if (el.dataset.tvsrc) { tvPlay(TVD.cur, TVD.srcIdx + 1, false); tvOpenProg(TVD.cur); }\n  else if (el.dataset.tvstar) {")
open('tv.js', 'w', encoding='utf8').write(t)
print('ok')
