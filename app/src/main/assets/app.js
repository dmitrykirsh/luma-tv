'use strict';
/* ================= утилиты ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const NATIVE = typeof Native !== 'undefined' ? Native : null;

// Only the main Luma origin can access this channel; embedded players cannot read credentials.
let aoSecretCache='', aoSecretSeq=0; const aoSecretPending=new Map();
function aoSecretCall(action,value='') { return new Promise(resolve=>{
  if(!window.LumaAnimeOnSecret) return resolve(null);
  const id=++aoSecretSeq, timer=setTimeout(()=>{aoSecretPending.delete(id);resolve(null)},5000);
  aoSecretPending.set(id,v=>{clearTimeout(timer);resolve(v)});
  window.LumaAnimeOnSecret.postMessage(JSON.stringify({id,action,value}));
}); }
if(window.LumaAnimeOnSecret) window.LumaAnimeOnSecret.onmessage=e=>{try{const m=JSON.parse(e.data),cb=aoSecretPending.get(m.id);if(cb){aoSecretPending.delete(m.id);cb(m.value)}}catch{}};
async function aoRefreshSecret(force=false){const value=await aoSecretCall('get');if(typeof value==='string'){const current=aoSecretCache;let c=0,n=0;try{c=JSON.parse(current).updatedAt||0}catch{}try{n=JSON.parse(value).updatedAt||0}catch{}if(force||n>=c)aoSecretCache=value;}return aoSecretCache;}
function aoAdoptSecret(value){let next,cur;try{next=JSON.parse(value);cur=JSON.parse(aoSecretCache||'{}')}catch{return;}if(!Number.isSafeInteger(next.updatedAt)||next.updatedAt<=Number(cur.updatedAt||0))return;aoSecretCache=value;aoSecretCall('adopt',value).then(ok=>aoRefreshSecret(ok!==true));}
setTimeout(()=>aoRefreshSecret().then(()=>{if(typeof syServe==='function')syServe();}),0);

const ICONS = {
  home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  film: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>',
  tv: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/>',
  cartoon: '<circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2.5 4 2.5S16 14 16 14M9 9.5h.01M15 9.5h.01"/>',
  anime: '<path d="M4.2 12.2V10a7.8 7.8 0 0 1 15.6 0v2.2M4.2 10.8c1.7-.1 3-1.4 3.8-3.6 1.1 2.1 3 3.2 5.3 3.4-1-1-1.5-2.1-1.6-3.5 1.2 2.4 3.8 3.7 8.1 3.7M5.3 10.6v3.5c0 3 2.6 5.5 6.7 7 4.1-1.5 6.7-4 6.7-7v-3.5M4.3 12.4c-1.2 1.8-1.1 4 .2 5.7M19.7 12.4c1.2 1.8 1.1 4-.2 5.7M8 12.6c.7-.7 1.8-.7 2.5 0M13.5 12.6c.7-.7 1.8-.7 2.5 0M9.2 13.4v.7M14.8 13.4v.7M10.5 17c1 .5 2 .5 3 0"/>',
  sport: '<circle cx="12" cy="12" r="9"/><path d="M12 7l-3 2 1 4h4l1-4-3-2zM4 10l5-1M6 19l4-6M18 19l-4-6M20 10l-5-1"/>',
  show: '<path d="M4 8h16v11H4zM8 4l4 4 4-4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  heart: '<path d="M12 20s-7-4.4-9-9.2C1.8 7.4 4 4 7.3 4c1.9 0 3.4 1 4.7 2.8C13.3 5 14.8 4 16.7 4 20 4 22.2 7.4 21 10.8 19 15.6 12 20 12 20z"/>',
  play: '<path d="M7 4.5v15l13-7.5z"/>',
  animePlayer: '<path d="M12 2.5l2.3 5 5.5.7-4.1 3.8.9 5.4-4.6-2.5-4.6 2.5.9-5.4-4.1-3.8 5.5-.7z"/><path d="M10.5 9v3.8l3-1.9z"/>',
  reservePlayer: '<rect x="3" y="6" width="15" height="12" rx="2"/><path d="M7 3h12a2 2 0 0 1 2 2v10M9 9v6l5-3z"/>',
  rutubePlayer: '<rect x="3" y="5" width="18" height="14" rx="4"/><path d="M10 9v6l5-3zM8 22h8"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  live: '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M8 3l4 3.5L16 3"/><circle cx="12" cy="13.5" r="2.2"/>',
  trailer: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9.5v5l4.5-2.5z"/>',
  sync: '<path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 0 1-13.7 5.6L4 15.5M4 20v-4.5h4.5"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l3 3M14 9l2 2"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.5-5.8M20 4v5h-5"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-2 7-2 9h16c0-2-2-2-2-9M10 20h4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  restart: '<path d="M4 12a8 8 0 1 1 2.5 5.8M4 20v-5h5"/>',
  magnet: '<path d="M6 3v8a6 6 0 0 0 12 0V3"/><path d="M9.5 3v8a2.5 2.5 0 0 0 5 0V3"/>',
  torrent: '<circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="19" cy="18" r="2"/><path d="M7 6h10M5 8v8M19 8v8M7 18h2M15 18h2M12 7v9m-3-3 3 3 3-3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>'
};
const ico = (n) => `<svg viewBox="0 0 24 24">${ICONS[n]}</svg>`;
const LOGO = '<svg viewBox="266 206 544 598" ><path fill="#FF3366" fill-rule="evenodd" d="M303.0 796.7 C288.7 793.4 277.6 782.9 273.6 769.0 C272.1 764.0 272.0 736.8 272.2 488.0 L272.5 212.5 L334.2 212.2 L396.0 212.0 L396.2 440.7 L396.5 669.5 L476.0 669.8 C519.7 669.9 555.8 670.4 556.2 670.8 C556.6 671.2 552.4 674.2 546.7 677.4 C541.1 680.7 521.6 692.0 503.5 702.5 C485.4 713.1 452.1 732.4 429.5 745.5 C406.9 758.5 379.1 774.7 367.5 781.5 C355.9 788.2 344.9 794.6 343.0 795.6 C338.6 798.0 311.8 798.7 303.0 796.7 Z M416.7 797.3 C415.4 796.0 416.1 795.1 420.2 792.8 C422.6 791.4 447.4 777.0 475.5 760.6 C503.6 744.2 542.0 721.8 561.0 710.7 C580.0 699.7 601.4 687.2 608.5 683.0 C627.1 672.0 628.1 671.5 629.1 673.2 C630.1 674.7 630.3 793.9 629.4 796.4 C628.8 797.8 618.5 798.0 523.1 798.0 C464.9 798.0 417.0 797.7 416.7 797.3 Z M438.5 627.9 C438.1 627.3 438.1 626.6 438.4 626.3 C438.7 626.0 438.5 625.1 438.0 624.5 C436.9 623.2 436.8 596.7 437.2 419.5 L437.5 320.5 L440.4 315.6 C446.4 305.4 453.5 299.4 463.0 296.6 C474.9 293.1 483.3 295.1 501.8 306.2 C509.3 310.6 526.1 320.5 539.0 328.0 C551.9 335.5 569.2 345.6 577.5 350.5 C585.8 355.4 606.9 367.7 624.5 378.0 C642.1 388.3 677.9 409.2 704.0 424.5 C730.1 439.8 755.8 454.7 761.0 457.8 C789.8 474.4 791.9 475.9 797.6 484.7 C807.4 499.8 805.2 520.1 792.3 532.7 C788.9 536.0 777.8 543.1 756.5 555.4 C739.4 565.3 719.6 576.8 712.5 581.0 C694.3 591.7 682.2 598.7 654.0 614.9 L629.5 629.0 L534.3 629.0 C468.0 629.0 438.9 628.7 438.5 627.9 Z"/><path fill="#FFB800" fill-rule="evenodd" d="M437.5 624.1 C437.2 623.5 436.9 599.6 436.9 570.8 L436.9 518.5 L440.2 515.6 C442.0 514.0 445.3 511.1 447.5 509.1 C449.7 507.1 459.8 498.1 470.0 489.0 C480.2 480.0 490.1 471.1 492.0 469.4 C499.4 462.8 523.7 441.1 534.0 432.0 C539.9 426.8 557.0 411.5 572.1 398.1 C587.1 384.7 599.6 374.2 599.8 374.8 C600.1 375.9 593.9 386.1 577.2 411.5 C572.5 418.6 565.7 429.0 562.2 434.5 C551.3 451.4 532.2 480.7 521.3 497.5 C515.5 506.3 508.8 516.6 506.3 520.5 C503.8 524.4 491.6 543.2 479.1 562.5 C466.6 581.8 452.4 603.7 447.6 611.2 C438.4 625.6 438.5 625.6 437.5 624.1 Z"/></svg>';

const TYPES = { 1: 'Фильм', 2: 'Мультфильм', 3: 'Сериал', 4: 'ТВ-шоу', 5: 'Мультсериал', 6: 'Аниме-фильм', 7: 'Аниме-сериал' };
const SECTIONS = {
  films: { title: 'Фильмы', cat: 'films' },
  series: { title: 'Сериалы', cat: 'series' },
  cartoons: { title: 'Мультфильмы', cat: 'cartoons,cartoon_series' },
  anime: { title: 'Аниме', cat: 'anime_series,anime_films' },
  tvshows: { title: 'ТВ-шоу', cat: 'tvshows' }
};
const SORTS = [['popular', 'Популярное'], ['new', 'Новинки'], ['kp', 'По Кинопоиску'], ['imdb', 'По IMDb']];
const TABS = [['home', 'Главная', 'home'], ['films', 'Фильмы', 'film'], ['series', 'Сериалы', 'tv'], ['cartoons', 'Мультфильмы', 'cartoon'], ['anime', 'Аниме', 'anime'], ['tvshows', 'ТВ-шоу', 'show'], ['tv', 'Каналы', 'live'], ['sport', 'Спорт', 'sport'], ['lists', 'Подборки', 'list'], ['mine', 'Моё', 'heart']];
const RAIL = 96;   // ширина свёрнутого левого меню, px сцены

/* ================= сцена: масштаб под экран ================= */
const stage = $('#stage');
let SC = 1;
function fit() {
  const W = document.documentElement.clientWidth || innerWidth, H = document.documentElement.clientHeight || innerHeight;   // innerWidth в Android WebView врёт (двойной размер)
  SC = Math.min(W / 1920, H / 1080);
  stage.style.transform = `translate(${(W - 1920 * SC) / 2}px,${(H - 1080 * SC) / 2}px) scale(${SC})`;
}
addEventListener('resize', fit); fit();

/* ================= хранилище ================= */
const LS = 'luma.tv';
let S = { favs: [], history: [], progress: {}, seen: {}, secrets: {}, extra: {} };
try { S = { ...S, ...JSON.parse(localStorage.getItem(LS) || '{}') }; } catch {}
let saveT = 0;
const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(LS, JSON.stringify(S)); } catch {} try { if (S.group && NATIVE && NATIVE.syncUpdate) NATIVE.syncUpdate(exportJson()); } catch {} feedPublish(); }, 300); };
const mergeFavorites = list => {const m=new Map();for(const x of list)if(x&&x.id!=null){const id=String(x.id),old=m.get(id);if(!old||Number(x.at||0)>Number(old.at||0))m.set(id,x);}return [...m.values()];};
const mergeSavedLists = list => {const m=new Map();for(const x of list)if(x&&x.url){const old=m.get(x.url);if(!old||Number(x.at||0)>Number(old.at||0))m.set(x.url,x);}return [...m.values()];};

function mergeBackup(b) {
  const d = b.data || {};
  S.favs = mergeFavorites([...(S.favs || []), ...(d.favs || [])]);
  const m = new Map();
  for (const x of [...(S.history || []), ...(d.history || [])]) { if(!x||x.id==null)continue;const id=String(x.id),o = m.get(id); if (!o || (x.ts || 0) > (o.ts || 0)) m.set(id, x); }
  S.history = [...m.values()].sort((a, b2) => (b2.ts || 0) - (a.ts || 0)).slice(0, 60);
  S.gone = S.gone || {};
  for (const [gk, gts] of Object.entries(d.gone || {})) if (gts > (S.gone[gk] || 0)) S.gone[gk] = gts;   // отметки об удалении: удалённое на одном устройстве не возвращается с другого
  { const cut = Date.now() - 90 * 864e5; for (const gk of Object.keys(S.gone)) if (S.gone[gk] < cut) delete S.gone[gk]; }
  S.favs = S.favs.filter((f) => !(S.gone['f:' + f.id] > (f.at || 0)));
  const seenAfter = (id, ts) => [S.progress || {}, d.progress || {}].some((pr) => Object.entries(pr).some(([k, p]) => k.startsWith(id + ':') && (p.ts || 0) > ts));   // был просмотр позже удаления: запись остаётся
  S.history = S.history.filter((h) => !(S.gone['h:' + h.id] > (h.ts || 0) && !seenAfter(h.id, S.gone['h:' + h.id])));
  S.seen = { ...(S.seen || {}) };
  for (const [k, arr] of Object.entries(d.seen || {})) S.seen[k] = [...new Set([...(S.seen[k] || []), ...arr])];
  S.progress = { ...(S.progress || {}) };
  for (const [k, p] of Object.entries(d.progress || {})) if (!S.progress[k] || (p.ts || 0) > (S.progress[k].ts || 0)) S.progress[k] = p;
  const incomingSecrets={ ...(b.secrets || {}) };
  if (incomingSecrets.animeon) { if(window.LumaAnimeOnSecret) aoAdoptSecret(incomingSecrets.animeon); delete incomingSecrets.animeon; }
  if (S.secrets?.animeon && window.LumaAnimeOnSecret) { aoAdoptSecret(S.secrets.animeon); delete S.secrets.animeon; }
  S.secrets = { ...(S.secrets || {}), ...incomingSecrets };
  const x = (S.extra = S.extra || {});
  // Новые данные ПК сохраняем при обмене, даже если экран ТВ пока их не использует.
  if (d.done && typeof d.done === 'object') { x.done = { ...(x.done || {}) }; for (const [id, arr] of Object.entries(d.done)) if (Array.isArray(arr)) x.done[id] = [...new Set([...(x.done[id] || []), ...arr])]; }
  if(d.sourceHistory && typeof d.sourceHistory==='object'){x.sourceHistory={...(x.sourceHistory||{})};for(const [k,v] of Object.entries(d.sourceHistory))if(v&&(!x.sourceHistory[k]||Number(v.ts||0)>Number(x.sourceHistory[k].ts||0)))x.sourceHistory[k]=v;}
  if (d.sportReminders && typeof d.sportReminders === 'object' && !Array.isArray(d.sportReminders)) { x.sportReminders = { ...(x.sportReminders || {}) }; for (const [id, item] of Object.entries(d.sportReminders)) if (item && typeof item === 'object' && !Array.isArray(item) && (!x.sportReminders[id] || Number(item.ts || 0) > Number(x.sportReminders[id].ts || 0))) x.sportReminders[id] = item; }
  if (d.sportFollows && typeof d.sportFollows === 'object' && !Array.isArray(d.sportFollows)) { x.sportFollows = { ...(x.sportFollows || {}) }; for (const [id, item] of Object.entries(d.sportFollows)) if (item && typeof item === 'object' && !Array.isArray(item) && (!x.sportFollows[id] || Number(item.ts || 0) > Number(x.sportFollows[id].ts || 0))) x.sportFollows[id] = item; }
  if (d.watchPrefs && typeof d.watchPrefs === 'object' && !Array.isArray(d.watchPrefs)) {
    x.watchPrefs = { ...(x.watchPrefs || {}) };
    for (const [id, pref] of Object.entries(d.watchPrefs)) if (pref && typeof pref === 'object' && !Array.isArray(pref) && (!x.watchPrefs[id] || Number(pref.ts || 0) > Number(x.watchPrefs[id].ts || 0))) x.watchPrefs[id] = pref;
  }
  if (d.playerVoicePrefs && typeof d.playerVoicePrefs === 'object' && !Array.isArray(d.playerVoicePrefs)) x.playerVoicePrefs = { ...(x.playerVoicePrefs || {}), ...d.playerVoicePrefs };
  if (Array.isArray(d.trackedPremieres)) x.trackedPremieres = d.trackedPremieres;
  if (d.lists) x.lists = mergeSavedLists([...(x.lists || []), ...d.lists]);
  if (x.lists) x.lists = x.lists.filter(l=>!(S.gone['l:'+l.url]>Number(l.at||0)));
  if (d.tvFav) x.tvFav = [...new Set([...(x.tvFav || []), ...d.tvFav])];
  if (d.tvStats) { x.tvStats = x.tvStats || {}; for (const [id, st] of Object.entries(d.tvStats)) { const o = x.tvStats[id]; if (!o || (st.last || 0) > (o.last || 0)) x.tvStats[id] = { ...st, n: Math.max(st.n || 0, o?.n || 0), t: Math.max(st.t || 0, o?.t || 0) }; } }
  if (d.tvEpgLinks && typeof d.tvEpgLinks === 'object' && !Array.isArray(d.tvEpgLinks)) { x.tvEpgLinks = x.tvEpgLinks || {}; for (const [id, link] of Object.entries(d.tvEpgLinks)) if (link && typeof link === 'object' && Number(link.ts || 0) > Number(x.tvEpgLinks[id]?.ts || 0)) x.tvEpgLinks[id] = link; }
  if (d.tvCustom) { const cur = x.tvCustom || []; x.tvCustom = [...cur, ...d.tvCustom.filter((e) => e && e.url && !cur.some((c) => c.url === e.url))]; }
  if (d.tvLast && !x.tvLast) x.tvLast = d.tvLast;
  S.imported = Date.now();
  save();
  return { favs: (d.favs || []).length, history: (d.history || []).length, keys: Object.keys(b.secrets || {}) };
}

/* ================= API ================= */
const cache = new Map();
// у сайта несколько зеркал API; на разных сетях (и разных ТВ) отдельные узлы бывают сломаны, поэтому пробуем по очереди
const HOSTS = ['api.liftw.ws', 'api.embandr.ws', 'api.niteface.ws', 'api.faphz.com', 'api.lateremb.ws'];
let hostI = 0;
async function api(p, ttl = 120000) {
  const c = cache.get(p);
  if (c && Date.now() - c.t < ttl) return c.v;
  let err;
  for (let round = 0; round < 2; round++) {
    for (let k = 0; k < HOSTS.length; k++) {
      const i = (hostI + k) % HOSTS.length;
      try {
        const r = await fetch('https://' + HOSTS[i] + p);
        if (!r.ok) { if (r.status < 500 && r.status !== 429) throw Object.assign(new Error('HTTP ' + r.status), { final: true }); throw new Error('HTTP ' + r.status); }
        const v = await r.json(); cache.set(p, { t: Date.now(), v }); hostI = i; return v;
      } catch (e) { err = e; if (e.final) throw e; }
    }
    await wait(500);
  }
  throw err;
}
async function catalog({ cat = 'films', page = 1, limit = 20, sort = 'popular', last = false, genre = '' } = {}) {
  const q = new URLSearchParams({ category: cat, page, limit, sort });
  if (last) q.set('last', 'true');
  if (genre) q.set('genre', genre);
  const r = await api('/list/categories?' + q);
  return Array.isArray(r) ? r : (r.items || []);
}
const info = async id => {
  if (!String(id).startsWith('ao:')) return api('/info/' + id, 600000);
  const c = await aoCall('info', String(id).slice(3));
  if (!c) throw new Error('AnimeOn недоступен');
  const firstVoice = c.voiceNames[0], firstLink = firstVoice && (c.voices[firstVoice][String(c.episodes[0] ?? 1)] || Object.values(c.voices[firstVoice])[0]);
  const episodes=[...new Set([...(c.episodes||[]),...(c.selfHosted?.episodes||[])].map(Number).filter(x=>Number.isInteger(x)&&x>0))].sort((a,b)=>a-b);
  const canonical=/\[(?:ТВ|TV)[-\s]*1\]/i.test(c.title||'')?c.franchise?.nodes?.find(x=>String(x.id)===String(c.franchise.currentId))?.name:'';
  return {id:'ao:'+c.slug,type:c.type,name:canonical||c.title,origin_name:c.titleOrig,poster:c.poster,year:c.year,kp_rating:c.kpRating,imdb_rating:c.imdbRating,episodes:episodes.length ? {1:episodes} : {},iframe_uri:firstLink || '',parts:[],people:{},info:{description:c.description,genre:c.genres,time:c.duration ? c.duration+' мин.' : '',name_eng:c.titleOrig},_ao:c};
};
const search = async (q) => (await api('/search?q=' + encodeURIComponent(q), 60000)).items || [];

/* ================= данные пользователя ================= */
const brief = (it) => ({ id: it.id, ...(it._ao ? {source:it._aoSource || 'animeon2',aoSlug:it._ao.slug,voice:it._aoSelectedVoice || ''} : {}), ...(it._rutube ? {source:'rutube',rutubeId:it._rutube.id,rutubeDuration:it._rutube.duration||0,voice:it._rutube.voice||''} : {}), ...(it._vk ? {source:'vk',vkId:it._vk.id} : {}), type: it.type, name: it.name, origin_name: it.origin_name, poster: it.poster, year: it.year, kp_rating: it.kp_rating ?? it.kp, imdb_rating: it.imdb_rating ?? it.imdb, quality: it.quality });
const goneMark = (k, id) => { S.gone = S.gone || {}; S.gone[k + ':' + id] = Date.now(); };
const isFav = (id) => S.favs.some((f) => String(f.id) === String(id));
function wasOpened(it) {
  if(!it)return false;const ids=[it.id,it.routeId].filter(x=>x!=null).map(String),slug=it.slug||it.aoSlug||ids.find(id=>id.startsWith('ao:'))?.slice(3)||'';
  return (S.history||[]).some(h=>{if(slug&&h.aoSlug)return h.aoSlug===slug;const other=[h.id,h.routeId].filter(x=>x!=null).map(String);return ids.some(id=>other.includes(id))||!!(slug&&(h.aoSlug===slug||other.includes('ao:'+slug)));});
}
function toggleFav(it) {
  if (isFav(it.id)) { S.favs = S.favs.filter((f) => String(f.id) !== String(it.id)); goneMark('f', it.id); toast('Убрано из избранного'); }
  else { S.favs.unshift({ ...brief(it), at: Date.now() }); toast('Добавлено в избранное'); }
  save(); return isFav(it.id);
}
function addHistory(it, season, episode) {
  S.history = S.history.filter((h) => String(h.id) !== String(it.id));
  S.history.unshift({ ...brief(it), season, episode, ts: Date.now() });
  S.history = S.history.slice(0, 60);
  if (season) { const k = it.id + ':' + season; (S.seen[k] = S.seen[k] || []); if (!S.seen[k].includes(String(episode))) S.seen[k].push(String(episode)); }
  save();
}
const progKey = (id, season, episode) => (season ? `${id}:${season}:${episode}` : String(id));
const sourceProgressKey = (source, videoId, id, season, episode) => `${source}~${videoId}~${progKey(id,season,episode)}`;
function sourceResumeInfo(source,videoId,id,season,episode){const k=sourceProgressKey(source,videoId,id,season,episode),p=S.progress[k];if(p&&p.t>=10&&p.d&&p.t<p.d-45)return p;if(S.extra?.sourceHistory?.[k])return null;const h=S.history.find(x=>String(x.id)===String(id)&&x.source===source&&(source==='vk'?x.vkId===videoId:x.rutubeId===videoId)&&String(x.season??'')===String(season??'')&&String(x.episode??'')===String(episode??''));const legacy=h?resumeInfo(id,season,episode):null;if(legacy)S.progress[k]={...legacy};return legacy;}
function rememberSource(source,videoId,it,season,episode){const map=((S.extra ||= {}).sourceHistory ||= {}),k=sourceProgressKey(source,videoId,it.id,season,episode);map[k]={...brief(it),season,episode,ts:Date.now()};const keys=Object.keys(map);if(keys.length>400)keys.sort((a,b)=>(map[a].ts||0)-(map[b].ts||0)).slice(0,keys.length-400).forEach(x=>delete map[x]);save();}
function historyProgressPct(h){const p=h.source==='vk'?sourceResumeInfo('vk',h.vkId,h.id,h.season,h.episode):h.source==='rutube'?sourceResumeInfo('rutube',h.rutubeId,h.id,h.season,h.episode):resumeInfo(h.id,h.season,h.episode);return p?Math.min(100,Math.round(p.t/p.d*100)):0;}
const fmtTime = (s) => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
function resumeInfo(id, season, episode) { const p = S.progress[progKey(id, season, episode)]; return p && p.t >= 10 && p.d && p.t < p.d - 45 ? p : null; }
const progressPct = (id, season, episode) => { const p = resumeInfo(id, season, episode); return p ? Math.min(100, Math.round((p.t / p.d) * 100)) : 0; };
const episodeDone = (id,season,episode) => {const entries=S.extra?.done?.[String(id)+':'+String(season)];return Array.isArray(entries)&&entries.some(x=>String(x)===String(episode));};
function storeProgress(key, t, d) {
  if (!key || !isFinite(t) || !isFinite(d) || d < 120) return;
  if (t > d - 45) {
    delete S.progress[key];
    const match = String(key).replace(/^(?:vk|rutube)~[^~]+~/,'').match(/^(.+):([^:]+):([^:]+)$/);
    if (match) {
      const done = ((S.extra ||= {}).done ||= {}), seasonKey = match[1] + ':' + match[2];
      const episodes = (done[seasonKey] ||= []), episode = String(match[3]);
      if (!episodes.includes(episode)) episodes.push(episode);
    }
  }
  else if (t >= 5) S.progress[key] = { t: Math.floor(t), d: Math.floor(d), ts: Date.now() };
  else return;
  const keys = Object.keys(S.progress);
  if (keys.length > 400) keys.sort((x, y) => (S.progress[x].ts || 0) - (S.progress[y].ts || 0)).slice(0, keys.length - 400).forEach((k) => delete S.progress[k]);
  save();
}

/* ================= карточки ================= */
const rate = (it) => { const kp = Number(it.kp_rating ?? it.kp) || 0, im = Number(it.imdb_rating ?? it.imdb) || 0; return kp > 0 ? kp : im; };
function cardHTML(it, key, opt = {}) {
  const r = rate(it);
  const pct = opt.pct || 0;
  const sub = opt.sub || [it.year, TYPES[it.type]].filter(Boolean).join(' · ');
  return `<div class="card f${/^(?:vk|rutube):/.test(String(it.id)) ? ' video-thumb' : ''}" tabindex="-1" data-k="${esc(key)}" data-id="${esc(it.id)}" data-poster="${esc(posterOf(it))}" data-alt="${esc(it.alt || '')}">
    <div class="poster">${posterOf(it) ? `<img decoding="async" src="${esc(posterOf(it))}" alt="">` : ''}<div class="ph">${esc(it.name)}</div>
    ${it.quality ? `<span class="q">${esc(it.quality)}</span>` : ''}${r ? `<span class="rt">${r.toFixed(1)}</span>` : ''}${pct ? `<i class="pb" style="width:${pct}%"></i>` : ''}</div>
    <div class="t">${esc(it.name)}</div>${opt.orig && it.origin_name && String(it.origin_name).trim().toLowerCase() !== String(it.name).trim().toLowerCase() ? `<div class="o">${esc(it.origin_name)}</div>` : ''}<div class="s">${esc(sub)}</div></div>`;
}

// Страны и жанры в карточках каталога: список от Lift их не содержит, поэтому добираем пачкой (до 50 фильмов за запрос)
const CARD_INFO = new Map(); let enrichT = 0;
async function apiPost(p, body) {
  let err;
  for (let k = 0; k < HOSTS.length; k++) {
    const i = (hostI + k) % HOSTS.length;
    try { const r = await fetch('https://' + HOSTS[i] + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
    catch (e) { err = e; }
  }
  throw err;
}
function enrichCards() {
  clearTimeout(enrichT);
  enrichT = setTimeout(async () => {
    const pending = () => $$('#grid .card[data-id]:not(.skel)').filter((c) => !c.dataset.e && !String(c.dataset.id).startsWith('ao:'));
    const fill = () => pending().forEach((c) => { const m = CARD_INFO.get(c.dataset.id); if (m != null) { c.dataset.e = '1'; const sl = $('.s', c); if (m && sl) sl.textContent = m; } });
    fill();
    const ids = [...new Set(pending().map((c) => c.dataset.id))].slice(0, 50);
    if (!ids.length) return;
    try {
      const r = await apiPost('/info/batch', { ids });
      for (const it of (r && r.items) || []) {
        const inf = it.info || {};
        CARD_INFO.set(String(it.id), [it.year || inf.year, (inf.country || []).slice(0, 2).join(', '), (inf.genre || []).slice(0, 2).join(', ')].filter(Boolean).join(' · '));
      }
    } catch {}
    for (const id of ids) if (!CARD_INFO.has(id)) CARD_INFO.set(id, '');
    fill();
    if (pending().length) enrichCards();
  }, 120);
}
const skel = (n) => Array.from({ length: n }, () => '<div class="card skel"><div class="poster"></div><div class="t"></div></div>').join('');
function section(id, title) { return `<section class="sec" id="${id}"><h2>${esc(title)}</h2><div class="track">${skel(8)}</div></section>`; }
function fillRail(id, items, opt = {}) {
  const sec = document.getElementById(id); if (!sec) return;
  if (!items.length) { sec.remove(); return; }
  sec.querySelector('.track').innerHTML = items.map((it, i) => cardHTML(it, id + ':' + it.id, opt.each ? opt.each(it) : {})).join('');
  hookImages(sec);
}
/* Постер из каталога иногда мёртв (у свежих фильмов картинку ещё не подготовили, сервер отвечает 404). Тогда берём постер со страницы фильма, а если и там нет, из TMDB. Найденный запоминаем. */
let posterFix = {}; try { posterFix = JSON.parse(localStorage.getItem('luma.tv.pfix') || '{}'); } catch {}
const posterOf = (it) => posterFix[it.id] || it.poster || '';
const pfTried = new Set();
const imgOk = (u) => (u ? new Promise((res) => { const im = new Image(); im.onload = () => res(true); im.onerror = () => res(false); im.src = u; setTimeout(() => res(false), 8000); }) : Promise.resolve(false));
async function findPoster(id, name, year, bad) {
  try { const d = await info(String(id).startsWith('ao:') ? String(id) : +id); if (d.poster && d.poster !== bad && (await imgOk(d.poster))) return d.poster; } catch {}
  try {
    const j = await tmdb('/search/multi', { query: name, include_adult: 'false' });
    const list = (j.results || []).filter((r) => (r.media_type === 'movie' || r.media_type === 'tv') && r.poster_path);
    const r = list.find((x) => String((x.release_date || x.first_air_date || '').slice(0, 4)) === String(year)) || list[0];
    if (r) return TMI(r.poster_path, 'w342');
  } catch {}
  return '';
}
async function fixPoster(img) {
  const card = img.closest('.card'), id = card && card.dataset.id;
  if (!id || pfTried.has(id)) { img.remove(); return; }
  pfTried.add(id);
  const name = ($('.t', card) || {}).textContent || '', year = ((($('.s', card) || {}).textContent || '').match(/\d{4}/) || [])[0];
  const url = card.dataset.alt ? TMI(card.dataset.alt, 'w342') : await findPoster(id, name, year, img.currentSrc || img.src);
  if (!url) { img.remove(); return; }
  posterFix[id] = url; try { localStorage.setItem('luma.tv.pfix', JSON.stringify(posterFix)); } catch {}
  $$(`.card[data-id="${id}"]`).forEach((c) => {
    c.dataset.poster = url;
    const box = $('.poster', c); if (!box) return;
    let im = $('img', box); if (!im) { im = document.createElement('img'); im.decoding = 'async'; im.alt = ''; box.insertBefore(im, box.firstChild); }
    im.onload = () => im.classList.add('ok'); im.onerror = () => im.remove(); im.src = url;
  });
  feedPublish();
}
function hookImages(root) {
  $$('.poster img', root).forEach((img) => {
    const done = () => img.classList.add('ok');
    if (img.complete && img.naturalWidth) done(); else { img.onload = done; img.onerror = () => fixPoster(img); }
  });
}

/* ================= маршрутизация ================= */
const view = $('#view');
let route = { name: 'home' };
const stack = [];
let renderToken = 0;
const alive = (t) => t === renderToken;

function topLevel(name, arg) { stack.length = 0; if(name==='tv'&&localStorage.getItem('luma.tv.view')!=='cards')show({name:'tvguide',root:true});else show({ name, ...arg }); }
function go(name, arg) {
  const savedRoute=route.name==='details' && typeof DX!=='undefined' && DX?.tab ? {...route,detailTab:DX.tab} : route.name==='search' ? {...route,query:$('#q')?.value||''} : route;
  stack.push({ route:savedRoute, scroll: view.scrollTop, focus: document.activeElement?.dataset?.k || null });
  show({ name, ...arg });
}
function back() {
  const p = stack.pop(); if (!p) return false;
  show(p.route, { scroll: p.scroll, focus: p.focus });
  return true;
}
async function show(r, restore) {
  const prev = route;
  route = r;
  if (window.onRouteLeave) window.onRouteLeave(prev, r);
  const t = ++renderToken;
  paintTop();
  view.scrollTop = 0;
  view.innerHTML = '';
  const fn = (window.RENDER && window.RENDER[r.name]) || { home: renderHome, mine: renderMine, search: renderSearch, settings: renderSettings, import: renderImport, details: renderDetails }[r.name] || renderSection;
  try { await fn(r, t); } catch (e) { if (alive(t)) { view.innerHTML = '<div class="empty"><b>Не удалось загрузить страницу</b><p>Проверьте подключение и попробуйте ещё раз.</p><button class="btn f" tabindex="-1" data-k="page:retry">Повторить</button></div>'; view.querySelector('[data-k="page:retry"]').onclick=()=>show(r); } }
  if (!alive(t)) return;
  if (!$('#modal').classList.contains('hidden')) return;
  if (restore) {
    view.scrollTop = restore.scroll || 0;
    const el = restore.focus && $$('.f', view).find((x) => x.dataset.k === restore.focus);
    if (el) { el.focus({ preventScroll: true }); ensureVisible(el, true); return; }
  }
  if (!(document.activeElement && document.activeElement !== view && view.contains(document.activeElement))) focusFirst();   // экран мог сам поставить фокус (например, на «Смотреть»)
}
function focusRail() { ($('#rail .ri.on') || $('#rail .ri'))?.focus({ preventScroll: true }); }
let lastContent = '';
function focusFirst() { const el = $('.f', view) || $('.f', $('#top')); el?.focus({ preventScroll: true }); }

let railBuilt = false;
function curTab() {
  if (route.name === 'tvworld' || route.name === 'tvguide') return 'tv';
  if (route.name === 'section') return route.sec;
  if (route.name === 'details' || route.name === 'import') { const f = stack[0]?.route; return f ? (f.name === 'section' ? f.sec : f.name) : 'home'; }
  return TABS.some((t) => t[0] === route.name) ? route.name : '';
}
function paintTop() {
  const cur = curTab();
  if (!railBuilt) {
    $('#rail').innerHTML = `<div class="rl">${LOGO}<b>Luma</b></div>` + TABS.map(([k, label, ic]) => `<button class="ri f" tabindex="-1" data-tab="${k}" data-k="rail:${k}">${ico(ic)}<span>${label}</span></button>`).join('');
    railBuilt = true;
  }
  $$('#rail .ri').forEach((b) => b.classList.toggle('on', b.dataset.tab === cur));
  const title = ['details','notifications'].includes(route.name) ? '' : route.name === 'search' ? 'Поиск' : route.name === 'settings' ? 'Настройки' : route.name === 'import' ? 'Перенос данных' : (TABS.find((t) => t[0] === cur)?.[1] || '');
  $('#top').innerHTML = `<h1 class="ttl">${esc(title)}</h1><div class="sp"></div>
    <button class="ib f" tabindex="-1" data-tab="search" data-k="top:search" aria-label="Поиск">${ico('search')}</button><button class="ib f notice-bell" tabindex="-1" data-tab="notifications" data-k="top:notifications" aria-label="Уведомления">${ico('bell')}<span class="notice-count" id="noticeCount" hidden></span></button><button class="ib f" tabindex="-1" data-tab="settings" data-k="top:settings" aria-label="Настройки">${ico('gear')}</button><div class="clock" id="clock"></div>`;
  if(window.updateNoticeBadge) window.updateNoticeBadge();
  tick();
}
function tick() { const t = new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' }); const c = $('#clock'); if (c) c.textContent = t; $$('.pclk').forEach((e) => { e.textContent = t; }); }   // часы в верхнем меню и поверх плеера
setInterval(tick, 20000);

/* ================= экраны ================= */

/* ================= TMDB на главной ================= */
const TM_GENRES = { 28: 'боевик', 12: 'приключения', 16: 'мультфильм', 35: 'комедия', 80: 'криминал', 99: 'документальный', 18: 'драма', 10751: 'семейный', 14: 'фэнтези', 36: 'история', 27: 'ужасы', 10402: 'музыка', 9648: 'детектив', 10749: 'мелодрама', 878: 'фантастика', 10770: 'телефильм', 53: 'триллер', 10752: 'военный', 37: 'вестерн', 10759: 'боевик и приключения', 10762: 'детский', 10765: 'фантастика и фэнтези', 10766: 'мыльная опера', 10768: 'война и политика' };
// Общий тестовый ключ TMDB лежит в секрете Worker на Cloudflare, а не в приложении. Он работает, пока пользователь не ввёл свой ключ.
const TM_SHARED = 'https://luma-tmdb-shared.dimakirsch.workers.dev';
const tmHas = () => true;
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
// ряды TMDB запоминаются на 6 часов: главная открывается сразу, а TMDB и поиск по каталогу не дёргаются заново
let tmRows = {}; try { tmRows = JSON.parse(localStorage.getItem('luma.tv.rows') || '{}'); } catch {}
async function tmRow(path, params, kind) {
  const ck = path + JSON.stringify(params || {}), hit = tmRows[ck];
  if (hit && Date.now() - hit.at < 6 * 3600e3) return hit.items;
  const items = await tmRowFetch(path, params, kind);
  if (items.length) { tmRows[ck] = { at: Date.now(), items }; try { localStorage.setItem('luma.tv.rows', JSON.stringify(tmRows)); } catch {} }
  return items;
}
async function tmRowFetch(path, params, kind) {
  const j = await tmdb(path, params || {});
  const res = (j.results || []).slice(0, 20);
  const out = await Promise.all(res.map(async (t) => { const it = await tmMatchCached(t, kind); return it ? { it: { ...it, alt: t.poster_path || '' }, bd: t.backdrop_path || '', overview: t.overview || '', genres: (t.genre_ids || []).map((g) => TM_GENRES[g]).filter(Boolean), kind } : null; }));
  return out.filter(Boolean);
}

/* ---------- баннер ---------- */
const HERO = { i: 0, items: [], timer: 0, sets: {}, tabs: [], picked: false, active: 'trend', rgb: '' };
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
  $('.hdots', box).innerHTML = HERO.items.length > 12 ? `<span class="hcount">${HERO.i + 1} / ${HERO.items.length}</span>` : HERO.items.map((_, k) => `<i class="${k === HERO.i ? 'on' : ''}"></i>`).join('');
}
function heroKick() {
  clearInterval(HERO.timer);
  HERO.timer = setInterval(() => { if (!$('#hero')) { clearInterval(HERO.timer); return; } if (playerOpen() || (window.tvPlayerOpen && window.tvPlayerOpen())) return; heroSlide(1); }, 9000);
}
function heroSlide(d) { if (!HERO.items.length) return; HERO.i = (HERO.i + d + HERO.items.length) % HERO.items.length; heroPaint(); heroKick(); }   // после ручной смены автосмена отсчитывает заново
function heroSwitch(k, byUser) {
  const items = HERO.sets[k]; if (!items || !items.length) return;
  HERO.active = k;
  heroBuild(items, { key: k });
  if (byUser) $(`.htab[data-htab="${k}"]`)?.focus({ preventScroll: true });
}
/* ---------- лента для лаунчера: история с прогрессом, избранное и подборка баннера уходят в файл, лаунчер читает его через ContentProvider ---------- */
const feedCard = (it) => ({ id: it.id, type: it.type, name: it.name, year: it.year, poster: posterOf(it), rating: +rate(it).toFixed(1) });
// разделы главной (тренды TMDB и ряды каталога): запоминаем, чтобы лаунчер показывал их и когда Luma закрыта
let feedSecs = {}; try { feedSecs = JSON.parse(localStorage.getItem('luma.tv.fsec') || '{}'); } catch {}
// бэкдропы для тех, у кого их нет (история, ряды каталога): {id: {b, o, g}} или 0, если не нашлось
let feedBd = {}; try { feedBd = JSON.parse(localStorage.getItem('luma.tv.fbd') || '{}'); } catch {}
function feedSet(id, items) {
  feedSecs[id] = items.slice(0, 20).map((x) => { const c = feedCard(x); if (x.backdrop) { c.backdrop = x.backdrop; c.overview = (x.overview || '').slice(0, 320); c.genres = x.genres || []; } return c; });
  try { localStorage.setItem('luma.tv.fsec', JSON.stringify(feedSecs)); } catch {}
  feedPublish();
}
const withBd = (c) => { const b = c.backdrop ? null : feedBd[c.id]; return b ? { ...c, backdrop: b.b ? TMI(b.b, 'w1280') : '', overview: b.o || '', genres: b.g || [] } : c; };
// последние включённые ТВ-каналы: логотипы запоминаем, когда канал известен (плейлисты грузятся только в разделе «ТВ»)
let feedTvC = {}; try { feedTvC = JSON.parse(localStorage.getItem('luma.tv.ftv') || '{}'); } catch {}
function feedTvInfo(id, ts) {
  let c = null; try { c = tvChan(id); } catch {}
  if (c) { const n = { name: c.name, logo: c.logo || '', group: c.group || '' }; if (JSON.stringify(feedTvC[id]) !== JSON.stringify(n)) { feedTvC[id] = n; feedTvDirty = true; } }
  const o = feedTvC[id] || {}, st = (tvStats()[id]) || {};
  return { id, name: o.name || st.name || id, logo: o.logo || '', group: o.group || '', ts: ts || st.last || 0 };
}
let feedTvDirty = false;
function feedTvList() {
  try {
    feedTvDirty = false;
    const st = tvStats();
    const recent = Object.entries(st).filter(([, x]) => x && x.last).sort((a, b) => b[1].last - a[1].last).slice(0, 14).map(([id, x]) => feedTvInfo(id, x.last));
    const fav = tvFavs().slice(0, 30).map((id) => feedTvInfo(id, 0));
    if (feedTvDirty) try { localStorage.setItem('luma.tv.ftv', JSON.stringify(feedTvC)); } catch {}
    return { recent, fav };
  } catch { return { recent: [], fav: [] }; }
}
let feedT = 0;
function feedPublish() {
  if (!NATIVE || !NATIVE.publish) return;
  clearTimeout(feedT);
  feedT = setTimeout(() => {
    try {
      const cont = (S.history || []).slice(0, 20).map((h) => withBd({ ...feedCard(h), season: h.season || 0, episode: h.episode || 0, pct: historyProgressPct(h), ts: h.ts || 0 }));
      const sections = {}; for (const [k, v] of Object.entries(feedSecs)) sections[k] = { items: v.map(withBd) };
      const tvl = feedTvList();
      NATIVE.publish(JSON.stringify({ v: 2, at: Date.now(), tv: tvl.recent, tvfav: tvl.fav, cont, favs: (S.favs || []).slice(0, 30).map(feedCard), hero: (sections.tm0 || {}).items || [], sections }));
    } catch {}
    feedEnrich();
  }, 400);
}
let feedBusy = false; const feedFail = new Set();
async function feedEnrich() {
  if (feedBusy || !tmHas()) return;
  feedBusy = true;
  try {
    const want = [...(S.history || []).slice(0, 8), ...Object.entries(feedSecs).filter(([k]) => k[0] === 'r').flatMap(([, v]) => v.slice(0, 8))];
    let n = 0;
    for (const it of want) {
      if (n >= 12) break;
      if (it.backdrop || feedBd[it.id] !== undefined || feedFail.has(it.id)) continue;
      n++;
      try {
        const j = await tmdb('/search/multi', { query: it.name, include_adult: 'false' });
        const list = (j.results || []).filter((r) => (r.media_type === 'movie' || r.media_type === 'tv') && r.backdrop_path);
        const r = list.find((x) => String((x.release_date || x.first_air_date || '').slice(0, 4)) === String(it.year)) || list[0];
        feedBd[it.id] = r ? { b: r.backdrop_path, o: (r.overview || '').slice(0, 320), g: (r.genre_ids || []).map((g) => TM_GENRES[g]).filter(Boolean).slice(0, 3) } : 0;
      } catch { feedFail.add(it.id); }
      await wait(250);
    }
    if (n) { try { localStorage.setItem('luma.tv.fbd', JSON.stringify(feedBd)); } catch {} setTimeout(feedPublish, 0); }
  } finally { feedBusy = false; }
}
window.lumaOpen = (id, play) => { try { if (!playerOpen()) go('details', { id: +id, autoplay: !!play }); } catch {} };   // luma://open?id=…&play=1

function heroBuild(items, opt = {}) {
  const box = $('#hero'); if (!box || !items.length) { box?.remove(); return; }
  if (!opt.key) {   // обычный вызов: это набор «В тренде»
    feedSet('tm0', items.map((h) => ({ ...h.it, backdrop: h.bd ? TMI(h.bd, 'w1280') : '', overview: h.overview || '', genres: h.genres || [] })));
    HERO.sets.trend = items; HERO.active = 'trend';
    if (HERO.sets.holi && !HERO.picked) { items = HERO.sets.holi; HERO.active = 'holi'; }
  }
  HERO.items = items; HERO.i = 0;
  box.classList.remove('skeleton');
  if (HERO.rgb) box.style.setProperty('--ha', HERO.rgb);
  box.innerHTML = `<div class="hshade"></div><div class="hin"><div class="htag"></div><h2 class="htitle"></h2><div class="hmeta"></div><p class="hdesc"></p>
    <div class="hbtns"><button class="btn primary f" tabindex="-1" data-hero="watch" data-k="hero:watch">${ico('play')}Смотреть</button><button class="btn f" tabindex="-1" data-hero="more" data-k="hero:more">Подробнее</button></div></div><div class="hdots"></div>
    ${HERO.tabs.length > 1 ? `<div class="htabs">${HERO.tabs.map((x) => `<button class="htab f ${x.k === HERO.active ? 'on' : ''}" tabindex="-1" data-htab="${x.k}" data-k="htab:${x.k}">${esc(x.label)}</button>`).join('')}</div>` : ''}`;
  heroPaint(true);
  heroKick();
}

async function renderHome(_, t) {
  const hist = S.history.map((h) => ({ ...h })).slice(0, 20), key = tmHas();
  const personal=optGet('luma.tv.personalHome','0')==='1'?(S.favs||[]).filter(it=>!wasOpened(it)).slice(0,20):[];
  const savedAo=optGet('luma.tv.personalHome','0')==='1'?(S.extra?.lists||[]).filter(l=>String(l.url||'').startsWith('animeon:')).slice(0,3):[];
  let html = '<section class="hero skeleton" id="hero"></section><div id="platformStrip"></div>';
  if (hist.length) html += section('rCont', 'Остановились на самом интересном').replace('</h2>','</h2><button class="home-activity f" tabindex="-1" data-activity="1" data-k="home:activity">Вся активность ›</button>');
  if (personal.length) html += section('rPersonal','Что посмотреть: ещё не открывали');
  if (savedAo.length) html += section('rAoSaved','Ещё не смотрели в сохранённых подборках');
  if (hist.some(h=>h.season&&(h.aoSlug||String(h.id).startsWith('ao:')))) html += section('rAoFollowup','Продолжения после просмотренного');
  if (optGet('luma.tv.personalHome','0')==='1') html += '<div id="homeUpcoming"></div>';
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
  window.renderPlatformStrip?.();
  if (hist.length) fillRail('rCont', hist, { each: (h) => ({ pct: historyProgressPct(h), sub: h.season ? (h.aoSlug||String(h.id).startsWith('ao:')?`${h.episode} серия`:`${h.season} сезон · ${h.episode} серия`) : 'Продолжить' }) });
  if (personal.length) fillRail('rPersonal',personal);
  if(savedAo.length)new Promise(resolve=>{const run=(i=0)=>{if(window.lumaAnimeSuggestions)return resolve(window.lumaAnimeSuggestions(savedAo));if(i<100)return setTimeout(()=>run(i+1),50);resolve([]);};run();}).then(items=>{if(alive(t))fillRail('rAoSaved',items,{each:()=>({sub:'Из ваших подборок AnimeOn'})});}).catch(()=>{if(alive(t))$('#rAoSaved')?.remove();});
  if($('#rAoFollowup'))new Promise(resolve=>{const run=(i=0)=>{if(window.lumaAnimeFollowups)return resolve(window.lumaAnimeFollowups(hist));if(i<100)return setTimeout(()=>run(i+1),50);resolve([]);};run();}).then(items=>{if(alive(t))fillRail('rAoFollowup',items,{each:()=>({sub:'Продолжение франшизы'})});}).catch(()=>{if(alive(t))$('#rAoFollowup')?.remove();});
  if(window.updateHomeUpcoming)window.updateHomeUpcoming();
  // «Новинки» в каталоге помечены как «недавно добавленные», среди них попадаются старые фильмы (Гарри Поттер 2001): оставляем свежие по году выхода
  const fresh = (d, back) => { const y = new Date().getFullYear(); let r = d.filter((x) => +x.year >= y - back); if (r.length < 6) r = d.filter((x) => +x.year >= y - back - 3); return (r.length >= 6 ? r : d).slice(0, 20); };
  const load = (id, o, back) => catalog({ limit: back ? 60 : 20, ...o }).then((d) => { if (back) d = fresh(d, back); if (alive(t)) fillRail(id, d); feedSet(id, d); return d; }).catch(() => { if (alive(t)) document.getElementById(id)?.remove(); return []; });
  const lift = [
    load('rNew', { cat: 'films', last: true }, 1), load('rSer', { cat: 'series', last: true }, 2), load('rTop', { cat: 'films', sort: 'kp' }),
    load('rCar', { cat: 'cartoons,cartoon_series' }),
    new Promise(resolve => { const run=(attempt=0)=>{ if(window.lumaAnimeHome) return resolve(window.lumaAnimeHome()); if(attempt<100) return setTimeout(()=>run(attempt+1),50); resolve([]); }; run(); }).then(items => { if(alive(t)) fillRail('rAni',items); feedSet('rAni',items); return items; }).catch(() => { if(alive(t)) document.getElementById('rAni')?.remove(); return []; }),
    load('rShow', { cat: 'tvshows' })
  ];
  // баннер: тренды TMDB; без ключа или при сбое — новинки каталога
  const heroP = (async () => {
    if (key) {
      try {
        const j = await tmdb('/trending/movie/week', {});
        const picks = (j.results || []).filter((x) => x.backdrop_path).slice(0, 9);
        const got = (await Promise.all(picks.map(async (x) => { const it = await tmMatchCached(x, 'movie'); return it ? { it: { ...it, alt: x.poster_path || '' }, bd: x.backdrop_path, overview: x.overview || '', genres: (x.genre_ids || []).map((g) => TM_GENRES[g]).filter(Boolean) } : null; }))).filter(Boolean).slice(0, 6);
        if (got.length >= 3) return got;
      } catch {}
    }
    const d = await lift[0];
    return (d || []).filter((x) => x.poster).slice(0, 6).map((it) => ({ it, bd: '', overview: '', genres: [], tag: 'Новинка' }));
  })();
  // праздничная вкладка главного баннера: если сейчас праздничное окно, в баннере появляются вкладки «Праздник / В тренде»
  HERO.sets = {}; HERO.tabs = []; HERO.picked = false; HERO.active = 'trend'; HERO.rgb = '';
  const startHoli = () => window.lumaHoliday.load(t, (set) => {
    HERO.sets.holi = set.items; HERO.tabs = [{ k: 'holi', label: set.name }, { k: 'trend', label: 'В тренде' }]; HERO.rgb = set.rgb;
    if (!HERO.sets.trend) return;   // баннер ещё не готов: вкладки появятся вместе с ним
    heroSwitch(HERO.picked ? HERO.active : 'holi', false);
  });
  if (window.lumaHoliday) startHoli(); else window.__holiPending = startHoli;   // скрипт праздников может загрузиться чуть позже главной
  heroP.then((items) => { if (alive(t)) { heroBuild(items); if (!$('.f:focus', view) && !document.activeElement?.closest?.('#rail')) focusFirst(); } });
  if (key) {
    const rows = [['tm0', '/trending/movie/week', {}, 'movie'], ['tm1', '/trending/tv/week', {}, 'tv'], ['tm2', '/movie/now_playing', { region: 'RU' }, 'movie'], ['tm3', '/movie/top_rated', {}, 'movie'], ['tm4', '/movie/upcoming', { region: 'RU' }, 'movie']];
    (async () => { for (const [id, p, q, k] of rows) { try { const r = await tmRow(p, q, k); if (alive(t)) fillRail(id, r.map((x) => x.it)); feedSet(id, r.map((x) => ({ ...x.it, backdrop: x.bd ? TMI(x.bd, 'w1280') : '', overview: x.overview, genres: x.genres }))); } catch { if (alive(t)) document.getElementById(id)?.remove(); } } })();
  }
  await Promise.race([heroP, wait(5000)]);
}

const mineRandom = { scope: 'favorites', kind: 'all', unseen: false };
const mineRandomKinds = [['all','Все категории'],['films','Фильмы'],['series','Сериалы'],['cartoons','Мультфильмы'],['anime','Аниме']];
function mineRandomAllowed(it, kind, unseen) {
  const types = { films:[1], series:[3,4], cartoons:[2,5], anime:[6,7] };
  return !!it && (kind === 'all' || (types[kind] || []).includes(Number(it.type))) && (!unseen || !wasOpened(it));
}
async function mineRandomPick(button) {
  if (button.dataset.busy) return;
  const token = renderToken, {scope, kind, unseen} = mineRandom;
  const allowed = it => mineRandomAllowed(it, kind, unseen);
  let choices = (S.favs || []).filter(allowed);
  button.dataset.busy='1'; button.setAttribute('aria-busy','true');
  try {
    if (scope === 'catalog') {
      choices=[];
      const shuffle = items => { const a=[...items]; for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; };
      for (const selected of shuffle(kind==='all'?['films','series','cartoons','anime']:[kind])) {
        if (!alive(token) || route.name!=='mine') return;
        if (selected==='anime') {
          for(let i=0;i<6&&!choices.length;i++){const item=await aoCall('random').catch(()=>null);if(!alive(token)||route.name!=='mine')return;if(item?.slug)choices=[aoCompactToTv(item)].filter(allowed);}
          if(!choices.length)for(const page of shuffle([1,2,3,4,5,6,7,8]).slice(0,3)){const result=await aoCall('catalog',{page,limit:30,sort:'popular'}).catch(()=>null);if(!alive(token)||route.name!=='mine')return;choices=(result?.items||[]).map(aoCompactToTv).filter(allowed);if(choices.length)break;}
        } else {
          for(const page of shuffle([1,2,3,4,5,6,7,8]).slice(0,3)){
            const items=await catalog({cat:SECTIONS[selected].cat,page,limit:30}).catch(()=>[]);
            choices=(Array.isArray(items)?items:[]).filter(allowed); if(choices.length)break;
          }
        }
        if(choices.length)break;
      }
    }
  } finally { delete button.dataset.busy; button.removeAttribute('aria-busy'); }
  if (!alive(token) || route.name!=='mine') return;
  if (!choices.length) { toast('Подходящих тайтлов не нашлось. Измените фильтры.'); return; }
  const chosen=choices[Math.floor(Math.random()*choices.length)];
  const id=chosen.aoSlug?'ao:'+chosen.aoSlug:chosen.routeId||chosen.id;
  if(/^ao:/.test(String(id)))go('details',{id:String(id)});
  else if(Number.isSafeInteger(Number(id))&&Number(id)>0)go('details',{id:Number(id)});
  else toast('Не удалось открыть этот тайтл');
}
async function renderMine(_, t) {
  let html = '';
  if (S.history.length) html += section('rHist', 'История');
  if (S.favs.length) html += section('rFav', 'Избранное');
  if (!html) html = '<div class="empty"><b>Здесь пока пусто</b>Добавляйте фильмы в избранное, а историю мы соберём сами.</div>';
  const kindName=mineRandomKinds.find(x=>x[0]===mineRandom.kind)?.[1]||'Все категории';
  view.innerHTML = `<div class="page tv-catalog-page">${tvCatalogHeader('Моя библиотека','История просмотра, избранное и случайный выбор.','ВАША БИБЛИОТЕКА')}<div class="chips filters tv-catalog-toolbar"><button class="chip fl f" tabindex="-1" data-mine-random="scope" data-k="mine:scope"><small>Источник</small>${mineRandom.scope==='favorites'?'Из избранного':'Из каталога'}<i>▾</i></button><button class="chip fl f" tabindex="-1" data-mine-random="kind" data-k="mine:kind"><small>Категория</small>${esc(kindName)}<i>▾</i></button><button class="chip fl f ${mineRandom.unseen?'on':''}" tabindex="-1" data-mine-random="unseen" data-k="mine:unseen" aria-pressed="${mineRandom.unseen}">${mineRandom.unseen?'✓ ':''}Только не открывавшиеся</button><button class="chip fl f" tabindex="-1" data-mine-random="pick" data-k="mine:pick">Случайный выбор <i>✦</i></button></div>${html}</div>`;
  if (S.history.length) fillRail('rHist', S.history, { each: (h) => ({ pct: historyProgressPct(h), sub: h.season ? (h.aoSlug||String(h.id).startsWith('ao:')?`${h.episode} серия`:`${h.season} сезон · ${h.episode} серия`) : '' }) });
  if (S.favs.length) fillRail('rFav', S.favs);
}

let secState = { sec: '', sort: 'popular', genre: '', page: 1, loading: false, done: false, gen: 0 };
const GENRES = ['Боевик','Комедия','Драма','Триллер','Фантастика','Ужасы','Детектив','Фэнтези','Мелодрама','Приключения','Криминал','Семейный','Биография','Военный','История','Документальный','Музыка','Мюзикл','Спорт','Вестерн','Детский','Мультфильм'];
const tvGenreSummary=s=>{const parts=String(s||'').split(',').filter(Boolean);return parts.slice(0,2).join(' + ')+(parts.length>2?' +'+(parts.length-2):'');};
const capw = (x) => (x ? x[0].toUpperCase() + x.slice(1) : x);
const SEC_TYPES = ['films', 'series', 'cartoons', 'anime', 'tvshows'];
async function tvCurated(kind,feed){
 const data=await tmdb(feed==='week'?'/trending/'+kind+'/week':'/'+kind+'/top_rated',{}),rows=(data.results||[]).slice(0,20),out=new Array(rows.length);let cursor=0;
 await Promise.all(Array.from({length:Math.min(4,rows.length)},async()=>{while(cursor<rows.length){const i=cursor++,t=rows[i];try{const names=[t.title,t.name,t.original_title,t.original_name].map(nrm).filter(Boolean),year=Number(String(t.release_date||t.first_air_date||'').slice(0,4));if(!year||!names.length){out[i]={};continue;}const found=new Map();for(const q of [...new Set([t.title||t.name,t.original_title||t.original_name].filter(Boolean))])for(const x of await search(q)){if(Number(x.type)!==(kind==='movie'?1:3)||!Number(x.year)||Math.abs(Number(x.year)-year)>1)continue;if([x.name,x.origin_name].map(nrm).some(n=>n&&names.includes(n)))found.set(String(x.id),x);}const candidates=[...found.values()].sort((a,b)=>Math.abs(Number(a.year)-year)-Math.abs(Number(b.year)-year));out[i]=candidates.length>1&&Math.abs(Number(candidates[0].year)-year)===Math.abs(Number(candidates[1].year)-year)?{}:{item:candidates[0]};}catch{out[i]={error:true};}}}));return {items:out.filter(x=>x?.item).map(x=>x.item),partial:out.some(x=>!x||x.error)};
}
function tvMountHighlights(host,sec,t){
 const kind=sec==='films'?'movie':'tv';host.innerHTML='<p class="sub section-highlight-source">Подборки TMDB · оценки на карточках из Luma</p>'+[['week','На этой неделе · TMDB'],['top','Высокий рейтинг · TMDB']].map(([id,title])=>`<section class="sec" data-highlight="${id}"><h2>${title}</h2><div class="track"><div class="spin"></div></div></section>`).join('');
 for(const feed of ['week','top']){const node=host.querySelector('[data-highlight="'+feed+'"]'),track=node.querySelector('.track');const load=async()=>{const retry=track.querySelector('[data-highlight-retry]');if(retry){retry.textContent='Загружаем…';retry.setAttribute('aria-disabled','true');}else track.innerHTML='<div class="spin"></div>';try{const result=await tvCurated(kind,feed);if(!alive(t)||!node.isConnected)return;const restore=retry&&document.activeElement===retry;track.innerHTML=result.items.length?result.items.map(x=>cardHTML(x,'highlight:'+feed+':'+x.id,{orig:true})).join(''):result.partial?'<div class="empty"><b>Не удалось проверить совпадения</b><button class="btn f" tabindex="-1" data-highlight-retry="1" data-k="highlight:retry:'+feed+'">Повторить</button></div>':'<p class="sub">Совпадений в каталоге Luma пока нет.</p>';hookImages(track);if(restore)(track.querySelector('.f')||view.querySelector('[data-flt="sort"]'))?.focus({preventScroll:true});node.querySelector('.highlight-note')?.remove();if(result.partial&&result.items.length){const p=document.createElement('p');p.className='sub highlight-note';p.textContent='Некоторые совпадения не удалось проверить.';node.append(p);}}catch{if(alive(t)&&node.isConnected){const restore=retry&&document.activeElement===retry;track.innerHTML='<div class="empty"><b>Подборка временно недоступна</b><button class="btn f" tabindex="-1" data-highlight-retry="1" data-k="highlight:retry:'+feed+'">Повторить</button></div>';if(restore)track.querySelector('.f')?.focus({preventScroll:true});}}};node.addEventListener('click',e=>{const b=e.target.closest('[data-highlight-retry]');if(b&&b.getAttribute('aria-disabled')!=='true')load();});load();}
}
function tvCatalogHeader(title, description, source='КАТАЛОГ LUMA') {
  return `<header class="tv-catalog-intro"><div><span class="tv-catalog-kicker">${esc(source)}</span><h1>${esc(title)}</h1><p>${esc(description)}</p></div></header>`;
}
async function renderSection(r, t) {
  const sec = r.sec || r.name;
  if(sec==='tvshows'&&r.source==='rutube')return renderRutubeShows(r,t);
  if(sec==='tvshows'&&r.source==='vk')return renderVkShows(r,t);
  if (sec === 'anime' && !r.genre) return renderAnimeHome(t);
  const sort = r.sort || (secState.sec === sec ? secState.sort : 'popular');
  const genre = capw(r.genre || '');
  secState = { sec, sort, genre, page: 1, loading: false, done: false, gen: secState.gen + 1 };
  const sortName = (SORTS.find((x) => x[0] === sort) || SORTS[0])[1];
  const descriptions={films:'Фильмы на любой вечер — от новинок до любимой классики.',series:'Сериалы, новые сезоны и истории, к которым хочется вернуться.',cartoons:'Мультфильмы и мультсериалы для любого настроения.',tvshows:'Программы, реалити и развлечения на любой вечер.',anime:'Аниме на любой вкус.'};
  view.innerHTML = `<div class="page tv-catalog-page">${tvCatalogHeader(SECTIONS[sec].title,descriptions[sec]||'Подборки и каталог для просмотра.')}<div class="chips filters tv-catalog-toolbar">
      <button class="chip fl f" tabindex="-1" data-flt="sort" data-k="flt:sort"><small>Сортировка</small>${esc(sortName)}<i>▾</i></button>
      <button class="chip fl f ${genre ? 'on' : ''}" tabindex="-1" data-flt="gen" data-k="flt:gen"><small>Жанры</small>${esc(genre ? tvGenreSummary(genre) : 'Все жанры')}<i>▾</i></button>
      ${genre ? `<button class="chip fl f" tabindex="-1" data-flt="type" data-k="flt:type"><small>Раздел</small>${esc(SECTIONS[sec].title)}<i>▾</i></button>` : ''}
      ${sec !== 'anime' ? '<button class="chip fl f" tabindex="-1" data-section-random="1" data-k="flt:random">Случайное <i>✦</i></button>' : ''}${sec==='tvshows'?'<button class="chip f" tabindex="-1" data-shows-rutube="1" data-k="shows:rutube">Шоу Rutube ›</button><button class="chip f" tabindex="-1" data-shows-vk="1" data-k="shows:vk">Шоу VK Видео ›</button>':''}</div>
    ${['films','series'].includes(sec)?`${!genre?'<div id="sectionHighlights"></div>':''}<h2 class="section-catalog-title">Каталог</h2>`:''}<div class="grid" id="grid">${skel(14)}</div></div>`;
  if($('#sectionHighlights'))tvMountHighlights($('#sectionHighlights'),sec,t);
  await loadMore(t, true);
  if (alive(t)) { const c = $('#sectionHighlights') ? $('[data-flt="sort"]') : $('#grid .card'); (c || $('#grid [data-catalog-retry]') || $('.chip.on'))?.focus({ preventScroll: true }); }
}
async function loadMore(t, first) {
  if (secState.loading || secState.done) return;
  secState.loading = true;
  if (!first) $('#grid [data-catalog-retry]')?.parentElement.remove();
  const gen = secState.gen;
  const strict = secState.sort === 'imdb' || secState.sort === 'kp';
  let added = 0, guard = 0;
  try {
    while (!secState.done && added < 14 && guard++ < 8) {
      const { sec, sort, genre, page } = secState;
      const q = new URLSearchParams({ category: SECTIONS[sec].cat, page, limit: 30 });
      if (sort === 'new') q.set('last', 'true'); else q.set('sort', sort);
      const wanted=genre.split(',').filter(Boolean),localOnly=['биография','история','спорт'].includes(String(wanted[0]||'').toLocaleLowerCase('ru-RU'));if (wanted.length&&!localOnly) q.set('genre', wanted[0]);
      if (sort === 'imdb') q.set('kpMin', 6);
      const rr = await api('/list/categories?' + q);
      let d = Array.isArray(rr) ? rr : (rr.items || []);
      if (!alive(t) || gen !== secState.gen) return;
      if (!d.length) { secState.done = true; break; }
      if(wanted.length>1||localOnly){const batch=await apiPost('/info/batch',{ids:d.map(x=>String(x.id))});if(!alive(t)||gen!==secState.gen)return;const byId=new Map((batch.items||[]).map(x=>[String(x.id),x]));if(d.some(x=>!Array.isArray(byId.get(String(x.id))?.info?.genre)))throw Error('genres unavailable');const norm=x=>String(x).trim().toLocaleLowerCase('ru-RU'),required=wanted.map(norm);d=d.filter(x=>{const g=byId.get(String(x.id)).info.genre.map(norm);return required.every(v=>g.includes(v));});}
      secState.page++;
      // сортировки по рейтингу: отсекаем фильмы без отзывов (у них «идеальные» 9.9 из одного голоса)
      if (strict) d = d.filter((it) => (it.views || 0) >= (sort === 'imdb' ? 30 : 5) && rate(it) > 0);
      if (!d.length) continue;
      if (!added && (first || !$('#grid .card:not(.skel)'))) $('#grid').innerHTML = '';
      $('#grid').insertAdjacentHTML('beforeend', d.map((it) => cardHTML(it, 'g:' + it.id, { orig: true })).join(''));
      hookImages($('#grid')); added += d.length;
    }
    if (!added && !$('#grid .card:not(.skel)') && alive(t) && gen === secState.gen) $('#grid').innerHTML = secState.done?'<div class="empty" style="grid-column:1/-1"><b>Тут пусто</b>Попробуйте другой жанр</div>':'<div class="empty" style="grid-column:1/-1"><b>На проверенных страницах совпадений нет</b><button class="btn f" tabindex="-1" data-catalog-retry="next" data-k="catalog:retry">Искать дальше</button></div>';
    enrichCards();
  } catch {
    if (alive(t) && gen === secState.gen) {
      if (first) $('#grid').innerHTML = '<div class="empty" style="grid-column:1/-1"><b>Не удалось загрузить каталог</b><span>Проверьте соединение и попробуйте снова</span><button class="btn f" tabindex="-1" data-catalog-retry="1" data-k="catalog:retry">Повторить</button></div>';
      else if (!$('#grid [data-catalog-retry]')) $('#grid').insertAdjacentHTML('beforeend', '<div class="empty" style="grid-column:1/-1"><b>Не удалось загрузить продолжение списка</b><button class="btn f" tabindex="-1" data-catalog-retry="next" data-k="catalog:retry">Повторить</button></div>');
    }
  }
  secState.loading = false;
}

let searchSeq = 0, searchT = 0;
async function renderSearch(r, t) {
  view.innerHTML = `<div class="page tv-search-page">${tvCatalogHeader('Поиск','Фильмы, сериалы, аниме и люди в одном месте.','ПОИСК В LUMA')}<div class="search tv-search-field"><input id="q" class="f" tabindex="-1" data-k="q" aria-label="Поиск фильмов, сериалов, аниме и людей" placeholder="Название или имя" autocomplete="off"></div><div id="sres"><div class="empty"><b>Что будем смотреть?</b>Нажмите OK на строке поиска, чтобы открыть клавиатуру.<br>Голосовой ввод — кнопка микрофона на пульте.</div></div></div>`;
  const q = $('#q');
  const run = async () => {
    const text = q.value.trim(); const my = ++searchSeq;
    if (text.length < 2) return false;
    $('#sres').innerHTML = '<div class="empty"><div class="spin"></div></div>';
    try {
      const [baseResult, animeResult] = await Promise.allSettled([search(text), aoCall('search',text)]);
      const base=baseResult.status==='fulfilled'?baseResult.value:[],anime=animeResult.status==='fulfilled'?animeResult.value:[];
      const items = anime.length ? [...base.filter(x=>![6,7].includes(x.type)), ...anime.map(aoCompactToTv)] : base;
      if (!alive(t) || my !== searchSeq) return false;
      let people = []; try { people = await peopleSearch(text); } catch {}
      if (!alive(t) || my !== searchSeq) return false;
      if(baseResult.status==='rejected'&&!anime.length&&!people.length)throw Error('search unavailable');
      const prow = people.length ? `<h3 class="ph3" style="padding:0 48px">Люди</h3><div class="track people">${people.map((x) => `<div class="person f" tabindex="-1" data-tmdbp="${x.id}" data-k="pe${x.id}"><div class="pha">${x.photo ? `<img loading="lazy" src="${esc(x.photo)}" alt="">` : `<span>${esc((x.name || '?')[0])}</span>`}</div><b>${esc(x.name)}</b>${x.dept ? `<small>${esc(x.dept)}</small>` : ''}</div>`).join('')}</div>` : '';
      $('#sres').innerHTML = prow + (items.length ? `<div class="grid">${items.map((it) => cardHTML(it, 's:' + it.id)).join('')}</div>` : (prow ? '' : '<div class="empty"><b>Ничего не нашли</b>Попробуйте другое название</div>'));
      hookImages($('#sres'));
      return items.length > 0 || !!$('#sres .person');
    } catch { if (alive(t) && my === searchSeq && $('#sres')) $('#sres').innerHTML = '<div class="empty"><b>Поиск не отвечает</b>Проверьте интернет</div>'; return false; }
  };
  q.oninput = () => { clearTimeout(searchT); ++searchSeq; if (q.value.trim().length >= 2) searchT = setTimeout(run, 450); else $('#sres').innerHTML = '<div class="empty"><b>Что будем смотреть?</b>Введите название фильма или сериала.</div>'; };
  // Enter на экранной клавиатуре: ищем сразу, убираем клавиатуру и переходим к результатам
  q.setAttribute('enterkeyhint', 'search');
  q.onkeydown = async (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault(); clearTimeout(searchT);
    const found = await run();
    q.blur();
    if (found) setTimeout(() => ($('#sres .card') || $('#sres .person'))?.focus({ preventScroll: true }), 150);
  };
  if(typeof r.query==='string'&&r.query.trim().length>=2){q.value=r.query;await run();if(!alive(t))return;}
  q.focus({ preventScroll: true });
}

function seasonsOf(d) {
  const e = d.episodes; if (!e || typeof e !== 'object') return [];
  return Object.keys(e).sort((a, b) => a - b).map((k) => ({ season: k, episodes: [...e[k]].sort((a, b) => a - b) }));   // источник иногда отдаёт серии вперемешку (у «Очень странных дел» 5-й сезон: 8,7,6,…,1,9)
}
let det = null;
async function renderDetails(r, t) {
  view.innerHTML = '<div class="empty"><div class="spin"></div></div>';
  const d = await info(r.id);
  if (!alive(t)) return;
  const inf = d.info || {};
  const seasons = seasonsOf(d), serial = seasons.length > 0;
  const last = S.history.find((h) => h.id === d.id);
  let s0 = seasons[0]?.season, e0 = seasons[0]?.episodes[0];
  if (serial && last?.season && seasons.find((x) => x.season == last.season)) { s0 = last.season; e0 = last.episode; }
  const rsm = resumeInfo(d.id, serial ? s0 : null, serial ? e0 : null);
  const kp = Number(d.kp_rating) || 0, im = Number(d.imdb_rating) || 0;
  det = { d, seasons, serial, s0, e0 };
  const watch = rsm || (serial && last) ? 'Продолжить' + (serial ? ` · С${s0} Э${e0}` : '') : 'Смотреть';
  view.innerHTML = `<div class="page"><div class="dbg" id="dbg"></div><div class="dshade"></div><div class="det"><div class="dp"><img src="${esc(posterOf(d))}" alt="" onerror="detPoster(this)"></div><div class="di">
    <div class="ty">${esc(TYPES[d.type] || '')}${inf.age ? ' · ' + esc(inf.age) + '+' : ''}</div>
    <h1>${esc(d.name)}</h1><div class="orig">${esc(d.origin_name || inf.name_eng || '')}</div>
    <div class="meta"><span>${d.year || ''}</span>${inf.time ? `<span>•</span><span>${esc(inf.time)}</span>` : ''}${serial ? `<span>•</span><span>${seasons.length} сез.</span>` : ''}
      ${(inf.country || []).slice(0, 2).map((c) => `<span class="c">${esc(c)}</span>`).join('')}${d.quality ? `<span class="c">${esc(d.quality)}</span>` : ''}${(inf.genre || []).slice(0, 3).map((g) => `<span class="c">${esc(g)}</span>`).join('')}</div>
    <div class="rates">${kp ? `<span class="g">${kp.toFixed(1)}<small>КИНОПОИСК</small></span>` : ''}${im ? `<span class="g">${im.toFixed(1)}<small>IMDB</small></span>` : ''}</div>
    <div class="desc">${esc(inf.description || 'Описание пока не добавили.')}</div>
    <div class="btns"><button class="btn primary f" tabindex="-1" data-act="watch" data-k="watch">${ico('play')}${esc(watch)}</button>
      ${rsm ? `<button class="btn f" tabindex="-1" data-act="start" data-k="start">${ico('restart')}С начала</button>` : ''}
      <button class="btn f ${isFav(d.id) ? 'on' : ''}" tabindex="-1" data-act="fav" data-k="fav">${ico('heart')}<span>${isFav(d.id) ? 'В избранном' : 'В избранное'}</span></button></div></div></div>
    ${serial ? `<div class="eps"><h2>Серии</h2><div class="seasons" id="dSeasons"></div><div class="epgrid" id="dEps"></div></div>` : ''}</div>`;
  if (serial) paintEps($('#dSeasons'), $('#dEps'), s0, 'd');
  $('[data-act=watch]').focus({ preventScroll: true });
  tmEnhance(d, t);
  if (r.autoplay) $('[data-act=watch]').click();
}

/* ================= TMDB: кадры, логотип, рекомендации ================= */
const TV_TYPES = [3, 4, 5, 7], MOVIE_TYPES = [1, 2, 6];
const TMI = (p, size) => 'https://image.tmdb.org/t/p/' + size + p;
const tmCache = new Map();
async function tmdb(path, params = {}, fresh = false) {
  const key = S.secrets && S.secrets.tmdb, shared = !key;   // своего ключа нет: идём через общий посредник
  const u = new URL((shared ? TM_SHARED : 'https://api.themoviedb.org') + (shared ? '/3' : '/3') + path);
  u.searchParams.set('language', 'ru-RU');
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const headers = { Accept: 'application/json' };
  if (key) { if (key.startsWith('eyJ')) headers.Authorization = 'Bearer ' + key; else u.searchParams.set('api_key', key); }
  const ck = u.toString(); if (!fresh && tmCache.has(ck)) return tmCache.get(ck);
  const r = await fetch(u, { headers });
  if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? (shared ? 'SHARED' : 'BAD_KEY') : 'HTTP ' + r.status);
  const v = await r.json(); tmCache.set(ck, v); return v;
}
const nrm = (x) => String(x || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ' ').trim();
const nameOk = (a, b) => { a = nrm(a); b = nrm(b); return !!a && !!b && (a === b || (a.length >= 5 && b.length >= 5 && (a.includes(b) || b.includes(a)))); };
// Avoid assigning artwork or trailers to a similarly named remake.
function tmdbSelectMatch(results, {names, year, kind, anime}) {
  const norm=x=>String(x||'').toLowerCase().replace(/ё/g,'е').normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  const inputs=[...new Set((names||[]).map(norm).filter(Boolean))];
  if(!inputs.length)return null;
  const requestedYear=Number(year)||0,scored=[];
  for(const r of Array.isArray(results)?results:[]){
    if(!Number.isSafeInteger(Number(r?.id))||Number(r.id)<=0)continue;
    if(anime&&(!Array.isArray(r.genre_ids)||!r.genre_ids.includes(16)))continue;
    const titles=[r.title,r.name,r.original_title,r.original_name].map(norm).filter(Boolean);
    const exact=inputs.some(x=>titles.includes(x));
    if(!exact)continue;
    const candidateYear=Number(String(r.release_date||r.first_air_date||'').slice(0,4))||0;
    const checkYear=requestedYear&&!(anime&&kind==='tv');
    if(checkYear&&(!candidateYear||Math.abs(candidateYear-requestedYear)>1))continue;
    const distance=requestedYear&&candidateYear?Math.abs(requestedYear-candidateYear):null;
    const score=(exact?1000:0)+(distance===null?0:Math.max(0,100-distance));
    scored.push({r,score});
  }
  scored.sort((a,b)=>b.score-a.score);
  if(!scored.length||scored.some(x=>x.score===scored[0].score&&Number(x.r.id)!==Number(scored[0].r.id)))return null;
  return scored[0].r;
}

const tmFindCache = new Map();
function tmFind(d) {
  const ck = d.id; if (tmFindCache.has(ck)) return tmFindCache.get(ck);
  const p = tmFindRaw(d); tmFindCache.set(ck, p); p.catch(() => tmFindCache.delete(ck)); return p;
}
async function tmFindRaw(d) {
  const kind = TV_TYPES.includes(Number(d.type)) ? 'tv' : 'movie';
  let found = null;const anime=[6,7].includes(Number(d.type));
  const clean=x=>anime?String(x||'').replace(/\s*\[(?:ТВ|TV)[-\s]*\d+[^\]]*\]/gi,'').replace(/\s+(?:season|сезон)\s*\d+(?:\s*(?:part|часть)\s*\d+)?\s*$/i,'').trim():String(x||'').trim();
  const aliases=[...(d._ao?.aliases||[]),...(d._ao?.franchise?.nodes||[]).filter(x=>String(x.id)===String(d._ao.franchise.currentId)).map(x=>x.name)];
  const names=[d.origin_name,d.name,...aliases].map(clean).filter(Boolean);
  for (const q of [...new Set(names)]) {
    const p = { query: q };
    if (d.year) p[kind === 'tv' ? 'first_air_date_year' : 'year'] = d.year;
    let j = await tmdb('/search/' + kind, p);
    const pick = results => tmdbSelectMatch(results,{names,year:d.year,kind,anime});
    found = pick(j.results);
    if (!found && d.year) { delete p.year; delete p.first_air_date_year; j = await tmdb('/search/' + kind, p); found = pick(j.results); }
    if (found) break;
  }
  if (!found) return null;
  const x = await tmdb('/' + kind + '/' + found.id, { append_to_response: 'images,recommendations,external_ids', include_image_language: anime ? 'ru,en,ja,null' : 'ru,en,null' });
  const bds = (x.images?.backdrops || []).slice().sort((a, b) => b.vote_average - a.vote_average).slice(0, 14).map((b) => b.file_path);
  const logos = x.images?.logos || [];
  const logo = (logos.find((l) => l.iso_639_1 === 'ru') || logos.find((l) => l.iso_639_1 === 'en') || logos[0])?.file_path || '';
  const safeOverview=!anime&&Number(d.year)&&Math.abs(Number(d.year)-Number(String(x.first_air_date||x.release_date||'').slice(0,4)))<=1&&names.some(n=>nrm(n)&&[x.name,x.original_name,x.title,x.original_title].some(v=>nrm(v)===nrm(n)))?String(x.overview||'').trim():'';
  return { overview:safeOverview, kind, tmdb: found.id, vote: Number(x.vote_average) || 0, imdb: x.imdb_id || (x.external_ids && x.external_ids.imdb_id) || '', backdrop: x.backdrop_path || bds[0] || '', shots: bds, logo, recs: (x.recommendations?.results || []).slice(0, 16) };
}
async function matchRec(t, kind) {
  const types = kind === 'tv' ? TV_TYPES : MOVIE_TYPES;
  const title = t.title || t.name, orig = t.original_title || t.original_name;
  const year = Number(String(t.release_date || t.first_air_date || '').slice(0, 4)) || 0;
  for (const q of [...new Set([title, orig].filter(Boolean))]) {
    const items = await search(q);
    const hit = items.find((it) => types.includes(it.type) && (!year || !it.year || Math.abs(it.year - year) <= 1) && (nameOk(it.name, title) || nameOk(it.name, orig) || nameOk(it.origin_name, orig) || nameOk(it.origin_name, title)));
    if (hit) return hit;
  }
  return null;
}
// Rotten Tomatoes и Metacritic через OMDb (ключ приезжает с резервной копией); ответы запоминаются на 3 дня
let omdbC = {}; try { omdbC = JSON.parse(localStorage.getItem('luma.tv.omdb') || '{}'); } catch {}
async function omdbRatings(imdb) {
  const key = S.secrets && S.secrets.omdb; if (!key || !imdb) return null;
  const c = omdbC[imdb]; if (c && Date.now() - c.at < 3 * 86400e3) return c;
  const r = await fetch('https://www.omdbapi.com/?i=' + encodeURIComponent(imdb) + '&apikey=' + encodeURIComponent(key));
  const j = await r.json(); if (j.Response === 'False') return null;
  const get = (n) => (j.Ratings || []).find((x) => x.Source === n)?.Value || '';
  const rt = parseInt(get('Rotten Tomatoes')) || 0, mc = parseInt(get('Metacritic')) || 0;
  omdbC[imdb] = { at: Date.now(), rt, mc };
  try { localStorage.setItem('luma.tv.omdb', JSON.stringify(omdbC)); } catch {}
  return omdbC[imdb];
}
async function tmEnhance(d, t) {
  let T; try { T = await tmFind(d); } catch { return; }
  if (!T || !alive(t) || route.name !== 'details') return;
  if (T.backdrop) { const u = TMI(T.backdrop, 'w1280'), im = new Image(); im.onload = () => { const b = $('#dbg'); if (b && alive(t)) { b.style.backgroundImage = `url("${u}")`; b.classList.add('on'); } }; im.src = u; }
  if (T.logo) {
    const h = $('.det h1');
    if (h) { const img = new Image(); img.className = 'logo-img'; img.alt = d.name; img.onload = () => { if (alive(t)) { h.textContent = ''; h.appendChild(img); h.classList.add('has-logo'); } }; img.src = TMI(T.logo, 'w500'); }
  }
  omdbRatings(T.imdb).then((o) => {
    const box = $('.det .rates'); if (!o || !box || !alive(t)) return;
    if (o.rt) box.insertAdjacentHTML('beforeend', `<span class="g">${o.rt}%<small>ROTTEN TOMATOES</small></span>`);
    if (o.mc) box.insertAdjacentHTML('beforeend', `<span class="g">${o.mc}<small>METACRITIC</small></span>`);
  }).catch(() => {});
  const page = $('.page'); if (!page) return;
  if (T.shots.length > 1) {
    page.insertAdjacentHTML('beforeend', `<section class="sec" id="rShots"><h2>Кадры</h2><div class="track">${T.shots.map((b, i) => `<div class="shot f" tabindex="-1" data-k="shot${i}" data-bg="${esc(TMI(b, 'w1280'))}"><img decoding="async" loading="lazy" src="${esc(TMI(b, 'w780'))}" alt=""></div>`).join('')}</div></section>`);
    $$('#rShots img').forEach((im) => { im.onerror = () => { if (!im.dataset.r) { im.dataset.r = 1; setTimeout(() => { im.src = im.src; }, 2500); } else im.closest('.shot')?.remove(); }; });
  }
  if (T.recs.length) {
    const out = [];
    let i = 0;
    await Promise.all(Array.from({ length: 4 }, async () => { while (i < T.recs.length) { const r = T.recs[i++]; const m = await matchRec(r, T.kind).catch(() => null); if (m && m.id !== d.id) out.push({ m, o: i }); } }));
    if (!alive(t) || route.name !== 'details') return;
    const list = out.sort((a, b) => a.o - b.o).map((x) => x.m);
    if (list.length) { page.insertAdjacentHTML('beforeend', section('rRec', 'Рекомендации')); fillRail('rRec', list); }
  }
}
function paintEps(seasonsBox, epsBox, curSeason, pref, playing) {
  const { d, seasons } = det;
  const cur = seasons.find((x) => x.season == curSeason) || seasons[0];
  const aoSingle=!!d._ao&&seasons.length===1;
  seasonsBox.classList.toggle('hidden',aoSingle);
  seasonsBox.innerHTML = aoSingle?'':seasons.map((s) => `<button class="chip f ${s.season == cur.season ? 'on' : ''}" tabindex="-1" data-pk-season="${s.season}" data-pref="${pref}" data-k="${pref}s${s.season}">Сезон ${s.season}</button>`).join('');
  const seen = S.seen[d.id + ':' + cur.season] || [];
  const last = !playing&&pref==='d'?(S.history||[]).find(h=>String(h.id)===String(d.id)||(d._ao?.slug&&h.aoSlug===d._ao.slug)):null;
  epsBox.innerHTML = cur.episodes.map((e) => {
    const completed=episodeDone(d.id,cur.season,e),opened=seen.some(x=>String(x)===String(e)),pct=completed?0:progressPct(d.id,cur.season,e),current=playing||last,isCur=!!current&&current.season==cur.season&&current.episode==e;
    const state=completed?'Просмотрена':isCur?'Текущая серия':pct?'Просмотрено '+pct+'%':'Серия '+e;
    if(pref==='d')return `<button class="ep ep-card f ${opened && !isCur&&!completed ? 'seen' : ''} ${completed?'done':''} ${isCur ? 'cur' : ''}" tabindex="-1" data-ep="${e}" data-season="${cur.season}" data-k="${pref}e${cur.season}_${e}" aria-label="Серия ${e} · ${esc(state)}"><span class="ep-cover"><span class="ep-number">${e}</span><span class="ep-play">▶</span>${completed?'<span class="ep-finished">✓ Просмотрена</span>':''}${pct ? `<i style="width:${pct}%"></i>` : ''}</span><small class="hidden">Серия ${e}</small><b>Серия ${e}</b></button>`;
    if(pref==='n'){const source=!d._ao&&NP.data?.seasons?.find(s=>String(s.season)===String(cur.season))?.episodes?.find(x=>String(x.episode)===String(e)),title=String(source?.title||'').trim();return `<button class="ep ep-list-row f ${completed?'done':''} ${isCur?'cur':''}" tabindex="-1" data-ep="${e}" data-season="${cur.season}" data-k="${pref}e${cur.season}_${e}" aria-label="Серия ${e} · ${esc(state)}"><span class="ep-list-art"><span class="ep-list-placeholder">${e}</span></span><span class="ep-list-copy"><b>${esc(title||'Серия '+e)}</b><small>${esc([title?'Серия '+e:'',isCur?'Сейчас смотрите':completed?'Просмотрена':pct?'Просмотрено '+pct+'%':''].filter(Boolean).join(' · '))}</small></span>${completed?'<span class="ep-list-check">✓</span>':''}${pct?`<i style="width:${pct}%"></i>`:''}</button>`;}
    return `<button class="ep f ${opened && !isCur&&!completed ? 'seen' : ''} ${completed?'done':''} ${isCur ? 'cur' : ''}" tabindex="-1" data-ep="${e}" data-season="${cur.season}" data-k="${pref}e${cur.season}_${e}" aria-label="Серия ${e} · ${esc(state)}">${e}${completed?'<span class="ep-check">✓</span>':''}${pct ? `<i style="width:${pct}%"></i>` : ''}</button>`;
  }).join('');
  if(pref==='n')for(const card of epsBox.querySelectorAll('.ep-list-row')){const urls=d._ao?.episodeStillAlternatives?.[card.dataset.ep]||[d._ao?.episodeStills?.[card.dataset.ep]].filter(Boolean);const all=[...new Set([...urls,d.poster].filter(Boolean))];if(!all.length)continue;let i=0;const img=new Image();img.loading='lazy';img.alt='';img.onerror=()=>{if(++i<all.length)img.src=all[i];else img.remove()};img.src=all[0];card.querySelector('.ep-list-art').prepend(img);}
  if(pref==='d' && String(d.id).startsWith('ao:'))for(const card of epsBox.querySelectorAll('.ep-card')){const urls=d._ao?.episodeStillAlternatives?.[card.dataset.ep]||[d._ao?.episodeStills?.[card.dataset.ep]].filter(Boolean);if(!urls.length)continue;let i=0;const img=new Image();img.loading='lazy';img.alt='';img.onerror=()=>{if(++i<urls.length)img.src=urls[i];else img.remove()};img.src=urls[0];card.querySelector('.ep-cover').prepend(img);}
  if((pref==='d'||pref==='n') && !d._ao && ![6,7].includes(Number(d.type))) (async()=>{try{const found=await tmFind(d);if(!found||found.kind!=='tv')return;const data=await tmdb('/tv/'+found.tmdb+'/season/'+Number(cur.season),{});if(!epsBox.isConnected||(pref==='d'?det?.d!==d:!NP.on||NP.d!==d||NP.menu!=='eps'||String(NP.npSeason||NP.season)!==String(cur.season)))return;for(const row of data.episodes||[]){const card=epsBox.querySelector('[data-ep="'+Number(row.episode_number)+'"][data-season="'+Number(cur.season)+'"]');if(!card)continue;if(row.name)card.querySelector('b').textContent=row.name;const date=/^\d{4}-\d{2}-\d{2}$/.test(row.air_date||'')?new Date(row.air_date+'T12:00:00').toLocaleDateString('ru-RU',{day:'numeric',month:'short',...(pref==='d'?{year:'numeric'}:{})}):'';const meta=['Серия '+row.episode_number,date].filter(Boolean).join(' · ');if(pref==='d'){const small=card.querySelector('small');small.textContent=meta;small.classList.toggle('hidden',!date&&(!row.name||String(row.name).trim().toLowerCase()===('серия '+row.episode_number).toLowerCase()));}else card.querySelector('small').textContent=[meta,card.classList.contains('cur')?'Сейчас':card.classList.contains('done')?'Просмотрена':''].filter(Boolean).join(' · ');if(row.still_path){const cover=card.querySelector(pref==='d'?'.ep-cover':'.ep-list-art'),img=cover.querySelector('img')||new Image();img.loading='lazy';img.alt='';img.src=TMI(row.still_path,'w500');let fallbackTried=false;img.onerror=()=>{if(d.poster&&!fallbackTried){fallbackTried=true;img.src=d.poster}else img.remove()};if(!img.parentElement)cover.prepend(img)}if(row.runtime&&pref==='d'){const el=document.createElement('span');el.className='ep-runtime';el.textContent=Number(row.runtime)+' мин.';card.querySelector('.ep-cover').append(el)}}}catch{}})();
}

function renderSettings() {
  const keys = Object.keys(S.secrets || {});
  view.innerHTML = `<div class="page"><div class="set">
    <button class="row f" tabindex="-1" data-act="import" data-k="imp"><div><b>Перенос с телефона</b><small>Загрузите резервную копию Luma (.luma): избранное, история, прогресс и ключи${S.imported ? ' · последний перенос ' + new Date(S.imported).toLocaleDateString('ru') : ''}</small></div>›</button>
    <div class="row f" tabindex="-1" data-k="keys"><div><b>Ключи сервисов</b><small>${keys.length ? 'Подключено: ' + keys.map((k) => k.toUpperCase()).join(', ') : 'Пока нет. Ключи приедут вместе с резервной копией'}</small></div></div>
    <button class="row f" tabindex="-1" data-act="clearhist" data-k="clr"><div><b>Очистить историю просмотров</b><small>Избранное останется на месте</small></div></button>
    <div class="row f" tabindex="-1" data-k="ver"><div><b>Luma TV ${esc(NATIVE ? NATIVE.version() : 'dev')}</b><small>Включи свою историю</small></div></div></div></div>`;
}

let impWaiting = false;
function renderImport() {
  let url = '', err = '';
  try { const r = JSON.parse(NATIVE ? NATIVE.startImport() : '{"error":"NO_NATIVE"}'); url = r.url || ''; err = r.error || ''; } catch { err = 'ERR'; }
  impWaiting = !!url;
  let qr = '';
  if (url) { const q = qrcode(0, 'M'); q.addData(url); q.make(); qr = q.createSvgTag({ cellSize: 6, margin: 0, scalable: true }); }
  view.innerHTML = `<div class="page tv-import-page">${tvCatalogHeader('Восстановить данные','Перенесите резервную копию Luma с телефона.','НАСТРОЙКИ LUMA')}<div class="imp"><ol>
    <li>В Luma для Windows: Настройки → Резервная копия → сохраните файл .luma (лучше с паролем).</li>
    <li>Перекиньте файл на телефон — через мессенджер, облако или кабель.</li>
    <li>Наведите камеру телефона на QR-код справа и откройте страницу (телефон и ТВ в одной Wi-Fi сети).</li>
    <li>Выберите файл, введите пароль и нажмите «Отправить на ТВ».</li></ol>
    <div>${url ? `<div class="qr">${qr}<div class="url">${esc(url.replace('http://', ''))}</div></div><div class="st" id="impSt">Ждём файл с телефона…</div>` : `<div class="st bad">${err === 'NO_NET' ? 'ТВ не подключён к домашней сети' : 'Не удалось запустить приём'}</div>`}</div></div></div>`;
  $('.page').insertAdjacentHTML('beforeend', '<div style="padding:0 64px"><button class="btn f" tabindex="-1" data-act="impback" data-k="impback">Назад</button></div>');
  $('[data-act=impback]').focus({ preventScroll: true });
}
function stopImport() { if (impWaiting) { try { NATIVE?.stopImport(); } catch {} impWaiting = false; } }
window.lumaImported = (text) => {
  let r; try { r = mergeBackup(JSON.parse(text)); } catch { window.lumaImportError('BAD_FILE'); return; }
  stopImport();
  toast(`Готово: ${r.favs} в избранном, ${r.history} в истории${r.keys.length ? ', ключей: ' + r.keys.length : ''}`);
  topLevel('home');
};
window.lumaImportError = (code) => { const s = $('#impSt'); if (s) { s.className = 'st bad'; s.textContent = code === 'BAD_PASSWORD' ? 'Пароль не подошёл — попробуйте ещё раз на телефоне' : 'Это не похоже на копию Luma'; } };

/* ================= фон ================= */
function setBg() {}   // размытого фона больше нет: картинки показывает баннер на главной и страница фильма

/* ================= плеер ================= */
let playing = null, adActive = false;
const plFrame = $('#plFrame');
const playerOpen = () => !$('#player').classList.contains('hidden');
window.sendReservePauseInfo = async () => {
  if(!playing||!playerOpen())return;
  const current=playing,d=current.d,info=d.info||{},episode=current.episode?(d._ao?'Серия '+current.episode:'Сезон '+current.season+' · серия '+current.episode):'';
  const send=(ep={})=>{if(playing!==current||!playerOpen())return;plFrame.contentWindow?.postMessage({lumaTitle:d.name,lumaEpisode:episode,lumaAutoSkip:{op:optGet('luma.tv.autoSkipOpening','0')==='1',ed:optGet('luma.tv.autoSkipEnding','0')==='1'},lumaPauseInfo:{enabled:optGet('luma.tv.pauseDetails','1')!=='0',logo:d._pauseLogo||'',meta:[d.year,ep.runtime?ep.runtime+' мин':info.time,episode,ep.name].filter(Boolean).join(' · '),description:String(ep.description||info.description||d.description||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,420)}},'*');};
  send();try{const [art,ep]=await Promise.all([tmFind(d).catch(()=>null),npEpisodeDetails(d,current.season,current.episode)]);if(playing!==current)return;if(art?.logo&&!d._pauseLogo)d._pauseLogo=TMI(art.logo,'w500');send(ep||{});}catch{}
};
function playItem(d, seasons, season, episode, opts = {}) {
  window.pauseDetailBackground?.();
  const key = progKey(d.id, season, episode);
  const resume = opts.fromStart ? null : resumeInfo(d.id, season, episode);
  playing = { d, seasons, season, episode, key, resumeT: resume ? resume.t : 0, restoreState:opts.restoreState || null, startedAt: Date.now() };
  adActive = false;
  addHistory(d, season, episode);
  let url = d.iframe_uri || '';
  try { const u = new URL(url); if (season) { u.searchParams.set('season', season); u.searchParams.set('episode', episode); } if (resume) u.searchParams.set('t', String(Math.floor(resume.t))); url = u.toString(); } catch {}
  $('#player').classList.remove('hidden'); $('#plPick').classList.add('hidden'); $('#plLoad').classList.remove('done');
  if (resume) toast('Продолжаем с ' + fmtTime(resume.t));
  let needsKodik=false;try{needsKodik=d._aoSource==='reserve'&&/(^|\.)kodikplayer\.com$/i.test(new URL(url).hostname);}catch{}
  plFrame.onload = () => { if(!needsKodik)setTimeout(() => $('#plLoad').classList.add('done'), 400); window.sendReservePauseInfo(); plFrame.focus(); if (resume) setTimeout(() => plFrame.contentWindow?.postMessage({ lumaSeek: resume.t }, '*'), 600); };
  plFrame.src = url;
  const initialPlaying=playing;setTimeout(() => {if(playing!==initialPlaying)return;if(needsKodik){closePlayer();toast('Не удалось загрузить резервный поток. Попробуйте ещё раз.');}else $('#plLoad').classList.add('done');}, needsKodik?20000:6000);
}
function closePlayer() {
  try { if (window.syncAfterPlay) syncAfterPlay(); } catch {}
  $('#player').classList.add('hidden'); $('#plPick').classList.add('hidden');
  plFrame.src = 'about:blank'; playing = null;
  if (route.name === 'details') { const k = document.activeElement?.dataset?.k; show(route, { scroll: view.scrollTop, focus: k || 'watch' }); }
  else focusFirst();
}
function nextEpisode(dir) {
  const { d, seasons, season, episode } = playing;
  const s = seasons.find((x) => x.season == season); const idx = s.episodes.findIndex((e) => e == episode), si = seasons.indexOf(s);
  let ni = idx + dir, ns = si;
  if (ni < 0) { ns = si - 1; ni = ns >= 0 ? seasons[ns].episodes.length - 1 : 0; } else if (ni >= s.episodes.length) { ns = si + 1; ni = 0; }
  if (ns < 0 || ns >= seasons.length) return false;
  playItem(d, seasons, seasons[ns].season, seasons[ns].episodes[ni]);
  return true;
}
function openPick() {
  if (!playing || !playing.season) return;
  det = { d: playing.d, seasons: playing.seasons };
  const box = $('#plPick');
  box.innerHTML = `<div class="dlg"><h3>${esc(playing.d.name)}</h3><p class="sub">Выберите серию</p><div class="seasons" id="pSeasons"></div><div class="epgrid" id="pEps"></div></div>`;
  paintEps($('#pSeasons'), $('#pEps'), playing.season, 'p', playing);
  box.classList.remove('hidden');
  plFrame.blur(); window.focus();
  ($('#pEps .ep.cur') || $('#pEps .ep'))?.focus({ preventScroll: true });
}
function closePick() { $('#plPick').classList.add('hidden'); plFrame.focus(); }

// плеер сам переключил серию (кнопка «Смотреть сейчас» на карточке «Далее» или автопереход): догоняем историю и прогресс
function onEpisodeChanged(m) {
  if (!playing || !playing.season) return;
  const season = String(m.season), episode = String(m.episode);
  if (String(playing.season) === season && String(playing.episode) === episode) return;
  storeProgress(playing.key, 1e9, 1e9);
  const s = playing.seasons.find((x) => String(x.season) === season); if (!s) return;
  const ep = s.episodes.find((e) => String(e) === episode) ?? episode;
  playing = { ...playing, season: s.season, episode: ep, key: progKey(playing.d.id, s.season, ep), resumeT: 0, startedAt: Date.now() };
  addHistory(playing.d, playing.season, playing.episode);
}
addEventListener('message', (e) => {
  const m = e.data; if (!m || typeof m !== 'object' || e.source !== plFrame.contentWindow || !playing) return;
  if (m.luma) {
    if(m.k==='kodikManifest' && playing.d?._aoSource==='reserve'){window.playKodikDirect?.(m,playing);return;}
    // пока плеер не перемотан на сохранённое место, начало ролика не должно затирать прогресс
    if (m.k === 'time' && playing.d?._aoSource==='reserve' && !playing.qualityInit) { playing.qualityInit=true; plFrame.contentWindow?.postMessage({lumaCmd:'quality-list',auto:true},'*'); }
    if (m.k === 'time' && playing.d?._aoSource==='reserve' && playing.d?._ao?.shikimori && !playing.skipRequested && Number(m.d)>=60 && Number(m.d)<=10000) { const current=playing; current.skipRequested=true; fetchAnimeSkips(current.d._ao.shikimori,current.episode,Number(m.d)).then(segments=>{if(playing===current&&segments?.length)plFrame.contentWindow?.postMessage({lumaSkips:segments},'*');}); }
    if (m.k === 'time' && !adActive) { if (!(playing.resumeT && Number(m.t) < playing.resumeT - 20 && Date.now() - playing.startedAt < 30000)) storeProgress(playing.key, Number(m.t), Number(m.d)); }
    else if (m.k === 'menu') openPick();
    else if (m.k === 'reserveMenu' && playing.d?._aoSource==='reserve') openReserveControls();
    else if (m.k === 'reserveQuality' && playing.d?._aoSource==='reserve') { if(m.auto){const pref=Number(npPrefs().quality)||0, values=(m.values||[]).map(Number).filter(x=>x>0).sort((a,b)=>a-b);if(pref&&values.length){const target=values.filter(x=>x<=pref).pop()||values[0];plFrame.contentWindow?.postMessage({lumaCmd:'quality-set',value:target},'*');}}else showReserveQuality(m); }
    else if (m.k === 'back') lumaBack();
    else if (m.k === 'ended') { storeProgress(playing.key, 1e9, 1e9); if (playing.season && !nextEpisode(1)) closePlayer(); }
  } else if (m.event === 'adStart') adActive = true;
  else if (m.event === 'adStop') adActive = false;
  else if (m.event === 'changeEpisode') onEpisodeChanged(m);
  else if (m.event === 'ended') { storeProgress(playing.key, Number(m.duration) || 1e9, Number(m.duration) || 1e9); if (playing.season) nextEpisode(1); }
});
window.lumaMedia = (k) => { if (window.npMedia && window.npMedia(k)) return; if (window.tvMedia && window.tvMedia(k)) return; if (playing) { if (k === 'next' && playing.season) nextEpisode(1); else if (k === 'prev' && playing.season) nextEpisode(-1); else plFrame.contentWindow?.postMessage({ lumaCmd: k }, '*'); } };
window.lumaPause = () => { if (window.tvPause) window.tvPause(); if (playing) plFrame.contentWindow?.postMessage({ lumaCmd: 'pause' }, '*'); };

/* ================= общее ================= */
let toastT = 0;
function toast(msg) { const t = $('#toast'); t.classList.remove('q'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2600); }
// тихий тост фоновой синхронизации: маленький, в углу и никогда во время просмотра
function toastSync(msg) {
  if ((typeof NP !== 'undefined' && NP.on) || (typeof TVD !== 'undefined' && TVD.cur)) return;
  const t = $('#toast'); t.textContent = msg; t.classList.add('q'); t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => { t.classList.remove('on'); setTimeout(() => t.classList.remove('q'), 350); }, 2600);
}
function dlg(html) { const m = $('#modal'); if (route.name === 'settings' && m.classList.contains('hidden')) m.dataset.returnSettings = document.activeElement?.dataset?.k || ''; m.innerHTML = `<div class="dlg">${html}</div>`; m.classList.remove('hidden'); $('.f', m)?.focus({ preventScroll: true }); }
function closeDlg() { window.__in?.ins?.forEach(i=>{if(i.type==='password')i.value='';}); window.__in=null; const modal=$('#modal'),character=modal.dataset.returnCharacter,returnSport=modal.dataset.returnSport,returnGenre=modal.dataset.returnGenre,returnSettings=modal.dataset.returnSettings,refreshSport=!!modal.querySelector('[data-sport-follow-dirty]');delete modal.dataset.returnCharacter;delete modal.dataset.returnSport;delete modal.dataset.returnGenre;delete modal.dataset.returnSettings;modal.classList.add('hidden'); if(refreshSport&&route?.name==='sport'&&!route.panel&&typeof sportMode!=='undefined'&&sportMode==='followed'){show({name:'sport'},{focus:'sport:followed'});return;} if (playerOpen()) plFrame.focus(); else if(returnSettings && route.name==='settings') $$('.f',view).find(x=>x.dataset.k===returnSettings)?.focus({preventScroll:true}); else if(returnGenre) $$('.f',view).find(x=>x.dataset.k===returnGenre)?.focus({preventScroll:true}); else if(returnSport) $$('.f',view).find(x=>x.dataset.k===returnSport)?.focus({preventScroll:true}); else if(character!==undefined) ($(`[data-character="${character}"]`)||$('[data-dtab="characters"]'))?.focus({preventScroll:true}); }

window.lumaBack = () => {
  if (window.npBack && window.npBack()) return true;
  if (window.lightboxBack && window.lightboxBack()) return true;
  if (window.trailerBack && window.trailerBack()) return true;
  if (window.tvBack && window.tvBack()) return true;
  if (!$('#modal').classList.contains('hidden')) { closeDlg(); return true; }
  if (!$('#plPick').classList.contains('hidden')) { closePick(); return true; }
  if (playerOpen()) { closePlayer(); return true; }
  if (route.name === 'import' || route.name === 'plimport') stopImport();
  if (stack.length) return back();
  if (!document.activeElement?.closest?.('#rail')) { focusRail(); return true; }   // первое «Назад» — в левое меню (быстрый путь наверх)
  if (route.name !== 'home') { topLevel('home'); return true; }
  exitDlg(); return true;   // выход из приложения только после подтверждения (защита от случайных нажатий «Назад»)
};
function exitDlg() {
  dlg(`<div class="xlogo">${LOGO}</div><h3>Выйти из Luma?</h3><p class="sub">Приложение закроется, вы вернётесь на экран ТВ</p>
    <div class="xbtns"><button class="btn f" tabindex="-1" data-exit="stay" data-k="ex:n">Нет, остаться</button><button class="btn f" tabindex="-1" data-exit="yes" data-k="ex:y">Да, выйти</button></div>`);
  $('#modal .dlg')?.classList.add('exitdlg');
  $('[data-exit=stay]')?.focus({ preventScroll: true });   // по умолчанию «остаться»: случайное OK ничего не закроет, «Назад» в окне тоже оставляет приложение
}
document.addEventListener('click', (e) => {
  const el = e.target.closest('.f'); if (!el || !el.dataset.exit) return;
  closeDlg(); if (el.dataset.exit === 'yes') NATIVE?.exit();
});

/* ================= действия ================= */
document.addEventListener('click', async (e) => {
  const el = e.target.closest('.f'); if (!el) return;
  if (el.dataset.catalogRetry) { if (el.dataset.catalogRetry === 'next') { el.parentElement.remove(); await loadMore(renderToken, false); $('#grid [data-catalog-retry]')?.focus({preventScroll:true}); } else show(route); return; }
  if (el.dataset.tab) { stopImport(); const k = el.dataset.tab; if(k==='notifications'){go('notifications');return;} const top = ['home', 'mine', 'search', 'settings', 'tv', 'lists', 'sport'].includes(k); topLevel(top ? k : 'section', top ? {} : { sec: k }); return; }
  if (el.classList.contains('card') && el.dataset.id) {
    const id=el.dataset.id,entry=S.history.find(h=>String(h.id)===id);
    if(entry&&/^vk:-?\d+_\d+$/.test(id)){playVkTitle(entry,[],null,null,{id:id.slice(3)});return;}
    if(entry&&/^rutube:[a-f\d]{32}$/i.test(id)){playRutubeTitle(entry,[],null,null,{id:id.slice(7),duration:entry.rutubeDuration||0});return;}
    go('details', { id: /^ao:/.test(id) ? id : +id }); return;
  }
  if (el.dataset.tmdbp) { go('person', { tmdb: +el.dataset.tmdbp }); return; }
  if (el.dataset.htab) { HERO.picked = true; heroSwitch(el.dataset.htab, true); return; }
  if (el.dataset.hero) { const h = HERO.items[HERO.i]; if (h) go('details', { id: h.it.id, autoplay: el.dataset.hero === 'watch' }); return; }
  if (el.dataset.mineRandom && route.name === 'mine') {
    const action=el.dataset.mineRandom;
    const update=()=>show({name:'mine'},{scroll:0,focus:'mine:'+action});
    if(action==='scope')pickDlg('Источник',[['favorites','Из избранного'],['catalog','Из каталога']].map(([v,label])=>({v,label,on:mineRandom.scope===v})),o=>{mineRandom.scope=o.v;update();});
    else if(action==='kind')pickDlg('Категория',mineRandomKinds.map(([v,label])=>({v,label,on:mineRandom.kind===v})),o=>{mineRandom.kind=o.v;update();});
    else if(action==='unseen'){mineRandom.unseen=!mineRandom.unseen;update();}
    else if(action==='pick')void mineRandomPick(el);
    return;
  }
  if (el.dataset.sectionRandom && route.name === 'section') {
    if (el.dataset.busy) return;
    const state = { sec: secState.sec, genre: secState.genre, sort: secState.sort, gen: secState.gen };
    const excluded = new Set([...S.history, ...S.favs].map(x => String(x.id)));
    el.dataset.busy = '1'; el.setAttribute('aria-busy', 'true');
    let options = [];
    try {
      const page = 1 + Math.floor(Math.random() * 8);
      options = (await catalog({ cat: SECTIONS[state.sec].cat, page, limit: 30, sort: state.sort === 'new' ? 'popular' : state.sort, last: state.sort === 'new', genre: state.genre }))
        .filter(x => x.id != null && !excluded.has(String(x.id)) && (!(state.sort === 'imdb' || state.sort === 'kp') || ((x.views || 0) >= (state.sort === 'imdb' ? 30 : 5) && rate(x) > 0)));
    } catch {}
    delete el.dataset.busy; el.removeAttribute('aria-busy');
    if (route.name !== 'section' || secState.gen !== state.gen) return;
    if (!options.length) options = $$('#grid .card[data-id]').filter(x => !excluded.has(String(x.dataset.id))).map(x => ({id:x.dataset.id}));
    if (!options.length) { toast(secState.loading ? 'Каталог ещё загружается' : 'Не удалось найти новый тайтл в этом разделе'); return; }
    const id = String(options[Math.floor(Math.random() * options.length)].id);
    if (/^ao:/.test(id)) go('details', { id }); else if (Number.isSafeInteger(Number(id)) && Number(id)>0) go('details', { id: Number(id) });
    return;
  }
  if (el.dataset.flt && route.name === 'section') {
    const k = el.dataset.flt, cur = { sec: secState.sec, sort: secState.sort, genre: secState.genre };
    const go2 = (patch) => show({ name: 'section', ...cur, ...patch }, { scroll: 0, focus: 'flt:' + k });
    if (k === 'sort') pickDlg('Сортировка', SORTS.map(([v, l]) => ({ label: l, on: v === cur.sort, v })), (o) => go2({ sort: o.v }));
    else if (k === 'gen' && ['films','series'].includes(cur.sec)) tvChooseAnimeGenres('luma');
    else if (k === 'gen') pickDlg('Жанр', [{ label: 'Все жанры', on: !cur.genre, v: '' }, ...[...(cur.genre && !GENRES.includes(cur.genre) ? [cur.genre] : []), ...GENRES].map((g) => ({ label: g, on: g === cur.genre, v: g }))], (o) => go2({ genre: o.v }));
    else pickDlg('Раздел', SEC_TYPES.map((v) => ({ label: SECTIONS[v].title, on: v === cur.sec, v })), (o) => go2({ sec: o.v }));
    return;
  }
  if (el.dataset.sort && route.name === 'section') { show({ name: 'section', sec: secState.sec, sort: el.dataset.sort, genre: secState.genre }, { scroll: 0, focus: el.dataset.k }); return; }
  if (el.dataset.gen !== undefined && route.name === 'section') { show({ name: 'section', sec: secState.sec, sort: secState.sort, genre: el.dataset.gen }, { scroll: 0, focus: el.dataset.k }); return; }
  if (el.dataset.type && route.name === 'section') { show({ name: 'section', sec: el.dataset.type, sort: secState.sort, genre: secState.genre }, { scroll: 0, focus: el.dataset.k }); return; }
  if (el.dataset.pkSeason) {
    const p = el.dataset.pref === 'p';
    paintEps(p ? $('#pSeasons') : $('#dSeasons'), p ? $('#pEps') : $('#dEps'), el.dataset.pkSeason, el.dataset.pref, p ? playing : null);
    $(`[data-k="${el.dataset.pref}s${el.dataset.pkSeason}"]`)?.focus({ preventScroll: true });
    return;
  }
  if (el.dataset.ep) {
    const { d, seasons } = det;
    $('#plPick').classList.add('hidden');
    playItem(d, seasons, el.dataset.season, el.dataset.ep);
    return;
  }
  const act = el.dataset.act;
  if (act === 'aoPrimary') { const {d,seasons,serial,s0,e0}=det; delete d._rutube; delete d._vk; d._aoSource='animeon2'; tvAoWatchPrefSet(d,{mode:'animeon2'}); playItem(d,seasons,serial?s0:null,serial?e0:null); }
  else if (act === 'aoReserve') { const {d,seasons,serial,s0,e0}=det; openAnimeReserve(d,seasons,serial?s0:null,serial?e0:1); }
  else if (act === 'vk') { const {d,seasons,serial,s0,e0}=det; chooseVk(d,seasons,serial?s0:null,serial?e0:null); }
  else if (act === 'rutube') { const {d,seasons,serial,s0,e0}=det; chooseRutube(d,seasons,serial?s0:null,serial?e0:null); }
  else if (act === 'mainPlayer') { const {d,seasons,serial,s0,e0}=det; delete d._rutube; delete d._vk; playItem(d,seasons,serial?s0:null,serial?e0:null); }
  else if (act === 'watch') { const { d, seasons, serial, s0, e0 } = det; playItem(d, seasons, serial ? s0 : null, serial ? e0 : null); }
  else if (act === 'start') { const { d, seasons, serial, s0, e0 } = det; playItem(d, seasons, serial ? s0 : null, serial ? e0 : null, { fromStart: true }); }
  else if (act === 'fav') { const on = toggleFav(det.d); el.classList.toggle('on', on); el.querySelector('span').textContent = on ? 'В избранном' : 'В избранное'; }
  else if (act === 'import') go('import');
  else if (act === 'impback') { stopImport(); if (!back()) topLevel('settings'); }
  else if (act === 'clearhist') { S.history.forEach((h) => goneMark('h', h.id)); S.history = []; S.progress = {}; if(S.extra)S.extra.sourceHistory={}; save(); toast('История очищена'); }
});

/* ================= пульт: перемещение фокуса ================= */
const visible = (el) => el.offsetParent !== null || el.getClientRects().length > 0;
function move(dir) {
  const tvl = $('#tvList'), tvg = $('#tvProg');
  const npm = window.npActive && window.npActive() ? ($('#npNext') && !$('#npNext').classList.contains('hidden') ? $('#npNext') : $('#npMenu') && !$('#npMenu').classList.contains('hidden') ? $('#npMenu') : $('#np')) : null;
  const scope = npm ? npm : (tvg && !tvg.classList.contains('hidden')) ? tvg : !$('#modal').classList.contains('hidden') ? $('#modal') : !$('#plPick').classList.contains('hidden') ? $('#plPick') : (tvl && !tvl.classList.contains('hidden')) ? tvl : document.body;
  const cur = document.activeElement?.classList?.contains('f') ? document.activeElement : null;
  const list = $$('.f', scope).filter(visible);
  if (!cur) { list[0]?.focus({ preventScroll: true }); return; }
  if (cur.closest('#rail') && dir === 'right' && scope === document.body) {
    const el = lastContent && $$('.f', view).find((x) => x.dataset.k === lastContent);
    const target = el || $('.f', view);
    if (target) { target.focus({ preventScroll: true }); return; }
  }
  const a = cur.getBoundingClientRect();
  const acx = a.left + a.width / 2, acy = a.top + a.height / 2;
  let best = null, bs = Infinity;
  const inRail = !!cur.closest('#rail');
  for (const el of list) {
    if (el === cur) continue;
    if (scope === document.body) { const r = !!el.closest('#rail'); if (inRail ? !r : (r && dir !== 'left')) continue; }   // меню доступно только стрелкой влево
    const b = el.getBoundingClientRect(), bcx = b.left + b.width / 2, bcy = b.top + b.height / 2;
    let prim, perp, ok;
    if (dir === 'right') { ok = bcx > acx + 2; prim = Math.max(0, b.left - a.right); perp = Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom)); }
    else if (dir === 'left') { ok = bcx < acx - 2; prim = Math.max(0, a.left - b.right); perp = Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom)); }
    else if (dir === 'down') { ok = bcy > acy + 2; prim = Math.max(0, b.top - a.bottom); perp = Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right)); }
    else { ok = bcy < acy - 2; prim = Math.max(0, a.top - b.bottom); perp = Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right)); }
    if (!ok) continue;
    const off = dir === 'left' || dir === 'right' ? Math.abs(bcy - acy) : Math.abs(bcx - acx);
    const s = prim + perp * 4 + off * 0.3;
    if (s < bs) { bs = s; best = el; }
  }
  if (route.name === 'details' && scope === document.body) {
    // уровни: жанры → кнопки → вкладки → содержимое; вниз и вверх идут на соседний уровень, а не на ближайший по геометрии
    const tab = $('#dTabs .chip.on') || $('#dTabs .chip');
    if (dir === 'down') {
      if (cur.closest('.genres')) { const w = $('.btns [data-act=watch]') || $('.btns .f'); if (w) { w.focus({ preventScroll: true }); return; } }
      else if (cur.closest('.btns')) { if (tab) { tab.focus({ preventScroll: true }); return; } }
      else if (cur.closest('#dTabs')) { const f = $('#dPanel .f'); if (f) { f.focus({ preventScroll: true }); return; } }
    } else if (dir === 'up') {
      if (cur.closest('#dPanel') && best && !best.closest('#dPanel') && tab) { tab.focus({ preventScroll: true }); return; }
      if (cur.closest('#dPanel') && !best && tab) { tab.focus({ preventScroll: true }); return; }
      if (cur.closest('#dTabs')) { const w = $('.btns [data-act=watch]') || $('.btns .f'); if (w) { w.focus({ preventScroll: true }); return; } }
      if (cur.closest('.btns')) { const g = $('.genres .f'); if (g) { g.focus({ preventScroll: true }); return; } }
    }
  }
  // ◀ на кнопке «Смотреть» листает баннер назад (как ▶ на «Подробнее» вперёд); в левое меню можно перейти кнопкой «Назад» или ◀ из рядов ниже
  if (dir === 'left' && cur.dataset.hero === 'watch' && HERO.items.length > 1) { heroSlide(-1); return; }
  if (dir === 'up' && cur.closest('.hbtns') && $('.htab.on')) { $('.htab.on').focus({ preventScroll: true }); return; }
  if (dir === 'down' && cur.closest('.htabs')) { const w = $('#hero [data-hero=watch]'); if (w) { w.focus({ preventScroll: true }); return; } }
  if (dir === 'left' && !inRail && scope === document.body && (!best || best.closest('#rail'))) { focusRail(); return; }
  if (dir === 'right' && scope === document.body && cur.dataset.hero === 'more' && (!best || !best.closest('.hero'))) { heroSlide(1); return; }
  if (best) best.focus({ preventScroll: true });
}

document.addEventListener('keydown', (e) => {
  if (window.npActive && window.npActive()) {
    if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); lumaBack(); return; }
    if (window.npKey(e)) return;
  }
  if (window.lightboxOpen && window.lightboxOpen()) { if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); lumaBack(); return; } if (window.lightboxKey(e)) return; e.preventDefault(); return; }
  if (window.trailerOpen && window.trailerOpen()) { if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); lumaBack(); } return; }
  if (window.tvPlayerOpen && window.tvPlayerOpen()) {
    if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); lumaBack(); return; }
    if (window.tvKey(e)) return;
  }
  if (playerOpen() && $('#plPick').classList.contains('hidden') && $('#modal').classList.contains('hidden')) {
    // клавиши пульта должны попасть в плеер
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', ' '].includes(e.key)) { plFrame.focus(); }
    if (e.key === 'Escape' || e.key === 'Backspace') { lumaBack(); e.preventDefault(); }
    return;
  }
  const inInput = document.activeElement?.tagName === 'INPUT';
  const dir = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[e.key];
  if (dir) {
    if (inInput && (dir === 'left' || dir === 'right')) return;
    e.preventDefault(); move(dir); return;
  }
  if (e.key === 'Enter') {
    if (typeof LP !== 'undefined' && LP.el) { e.preventDefault(); return; }   // идёт удержание OK: повторы клавиши не должны нажимать кнопки открывшегося меню
    const el = document.activeElement;
    if (el?.classList?.contains('f') && el.tagName !== 'INPUT') { e.preventDefault(); if (window.lpDown && window.lpDown(el, e)) return; el.click(); }
    return;
  }
  if (e.key === 'Escape' || (e.key === 'Backspace' && !inInput)) { e.preventDefault(); if (!lumaBack()) NATIVE?.exit(); }
});

/* ================= прокрутка за фокусом и фон ================= */
// ближайший предок, который прокручивается по горизонтали (ряд карточек, вкладки, жанры, серии)
function hScroller(el) {
  for (let p = el.parentElement; p && p !== view && p !== document.body; p = p.parentElement) {
    if (p.scrollWidth > p.clientWidth + 4) { const ox = getComputedStyle(p).overflowX; if (ox === 'hidden' || ox === 'auto' || ox === 'scroll') return p; }
  }
  return null;
}
function ensureVisible(el, instant) {
  if (el.closest('#modal, #npMenu')) { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); return; }
  if (el.closest('#tvList, #tvProg')) { el.scrollIntoView({ block: 'nearest' }); return; }
  if (el.closest('.hero, #dTabs')) { view.scrollTo({ top: 0, behavior: instant ? 'auto' : 'smooth' }); return; }
  const sr = stage.getBoundingClientRect();
  const track = hScroller(el);
  const beh = instant ? 'auto' : 'smooth';
  if (track && el.closest('#view')) {
    const r = el.getBoundingClientRect(), x = (r.left - sr.left) / SC, w = r.width / SC;
    if (x + w > 1920 - 70) track.scrollTo({ left: track.scrollLeft + (x + w - (1920 - 70)), behavior: beh });
    else if (x < RAIL + 48) track.scrollTo({ left: track.scrollLeft - (RAIL + 48 - x) - 20, behavior: beh });
  }
  if (!el.closest('#view')) return;
  const sec = el.closest('.sec');
  if (sec) { const top = sec.offsetTop - 118; if (Math.abs(view.scrollTop - top) > 6) view.scrollTo({ top: Math.max(0, top), behavior: beh }); return; }
  const r = el.getBoundingClientRect(), y = (r.top - sr.top) / SC, h = r.height / SC;
  if (y < 140) view.scrollTo({ top: view.scrollTop + y - 160, behavior: beh });
  else if (y + h > 1040) view.scrollTo({ top: view.scrollTop + (y + h - 1010), behavior: beh });
}
document.addEventListener('focusin', (e) => {
  const el = e.target.closest?.('.f'); if (!el) return;
  ensureVisible(el);
  if (el.closest('#view') && el.dataset.k) lastContent = el.dataset.k;
  if (el.classList.contains('shot')) { const b = $('#dbg'); if (b) { const im = new Image(); im.onload = () => { b.style.backgroundImage = `url("${el.dataset.bg}")`; }; im.src = el.dataset.bg; } }
  if (el.classList.contains('card') && el.closest('#grid')) {
    const cards = $$('#grid .card'); if (cards.length - cards.indexOf(el) <= 10) loadMore(renderToken, false);
  }
});

/* ================= старт ================= */
const optGet = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } };
if (optGet('luma.tv.aurora', '1') === '0') document.body.classList.add('noaurora');
// часы в плеере: '0' выкл, '1' только с панелью управления, '2' всегда
function pclockApply(v) { document.body.classList.toggle('nopclk', v === '0'); document.body.classList.toggle('pclk-always', v === '2'); }
pclockApply(optGet('luma.tv.pclock', '1'));
document.getElementById('stage').insertAdjacentHTML('beforeend', '<div class="pclk pclk-a"></div>');
// заставка: логотип с анимацией и коротким звуком; приложение открывается, когда звук и анимация закончились и главная готова
let introStarted = false, homeReady = false, introDone = false, introAt = 0;
function introFinish() {
  if (introDone || !homeReady || Date.now() - introAt < 2850) return;
  introDone = true;
  const sp = $('#splash'); sp.classList.add('out'); setTimeout(() => sp.classList.add('off'), 520);
}
window.lumaStart = () => {
  if (introStarted) return; introStarted = true; introAt = Date.now();
  const sp = $('#splash');
  if (optGet('luma.tv.intro', '1') === '0') { introAt = 0; introFinish(); return; }
  sp.classList.add('go');
  try { const a = new Audio('intro.mp3'); a.volume = 0.9; a.play().catch(() => {}); } catch {}
  setTimeout(introFinish, 2900);
};
setTimeout(() => { if (!introStarted) window.lumaStart(); }, 4500);   // если оболочка не подала сигнал, стартуем сами
setTimeout(() => show({ name: 'home' }).then(() => {
  homeReady = true; if (introStarted) introFinish();
  try { const l = NATIVE && NATIVE.takeLink && NATIVE.takeLink(); if (l) { if (l.startsWith('t:')) window.lumaOpenTv(l.slice(2)); else { const [id, p] = l.slice(2).split(','); window.lumaOpen(id, p === '1'); } } } catch {}   // Luma запущена из лаунчера по ссылке
  feedPublish();
}), 0);
