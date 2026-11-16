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
  if(t.anime&&(!/(?:аниме|anime|анимац|animation|animated)/i.test(String(v.title||''))||/(?:live[ -]?action|игров(?:ой|ая|ого)|художественн(?:ый|ого) фильм)/i.test(String(v.title||'')+' '+String(v.description||''))))return 0;
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
        for (const v of j.results || []) { if (seen.has(v.id)) continue; const sc = trScore(t, { title: v.title, description: v.description, duration: v.duration }); if (sc) seen.set(v.id, { sc, item: { src: 'Rutube', id: v.id, title: v.title, thumb: v.thumbnail_url, backgroundEligible:TR_WORDS.test(v.title||'')&&sportFree(v)&&!v.is_livestream, url: 'https://rutube.ru/play/embed/' + v.id + '?autoStart=1' } }); }
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
  window.pauseDetailBackground?.();
  let box = $('#trl');
  if (!box) { $('#stage').insertAdjacentHTML('beforeend', '<div id="trl" class="hidden"><iframe id="trlFrame" allow="autoplay; fullscreen; encrypted-media" allowfullscreen></iframe></div>'); box = $('#trl'); }
  box.classList.remove('hidden'); box.dataset.youtubeEmbed = t.src === 'YouTube' ? '1' : ''; const f = $('#trlFrame');
  box.querySelector('#ytExternal')?.remove();
  if (box.dataset.youtubeEmbed) { const button=document.createElement('button'); button.id='ytExternal'; button.className='btn f'; button.tabIndex=-1; button.textContent='Открыть в YouTube'; button.onclick=()=>{closeTrailer(); NATIVE?.openYoutube(t.id);}; box.append(button); button.focus({preventScroll:true}); }
  f.onload = () => { if (!box.dataset.youtubeEmbed) f.focus(); };
  f.src = t.url;
}
function closeTrailer() { const b = $('#trl'); if (!b || b.classList.contains('hidden')) return false; b.classList.add('hidden'); $('#trlFrame').src = 'about:blank'; if (b.dataset.youtubeEmbed) { b.dataset.youtubeEmbed = ''; NATIVE?.clearYoutubeEmbed?.(); } window.resumeDetailBackground?.(); return true; }
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
async function cinemetaArt(imdb,kind) {
  if(!/^tt\d{5,12}$/.test(String(imdb||''))||!['tv','movie'].includes(kind))return null;
  try {const url='https://v3-cinemeta.strem.io/meta/'+(kind==='tv'?'series':'movie')+'/'+imdb+'.json',r=await fetch(tvPx(url,'Luma/2.16','',true),{signal:AbortSignal.timeout(6000)});if(!r.ok)return null;const m=(await r.json()).meta;if(m?.id!==imdb)return null;const safe=x=>{try{let u=new URL(x);return u.protocol==='https:'&&u.hostname==='images.metahub.space'?u.href:''}catch{return ''}};return {logo:safe(m.logo),background:safe(m.background)};}catch{return null;}
}
// данные TMDB, кадр, логотип и оценки грузятся заранее: страница показывается уже в готовом виде, но не дольше таймаута
async function detailsPrefetch(d) {
  if (!tmHas()) return null;
  const T = await tmFind(d).catch(() => null);
  if (!T) return null;
  if(T.imdb&&(!T.logo||!T.backdrop)){const art=await (T._cinemetaPromise ||= cinemetaArt(T.imdb,T.kind));T.cinemetaLogo=art?.logo||'';T.cinemetaBackdrop=art?.background||'';}
  if(T.logo)d._pauseLogo=TMI(T.logo,'w500');
  else if(T.cinemetaLogo)d._pauseLogo=T.cinemetaLogo;
  await Promise.all([
    preImg(T.backdrop ? TMI(T.backdrop, 'w1280') : T.cinemetaBackdrop||''), preImg(d._pauseLogo||''),
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
  if(d._ao) { const pref=tvAoWatchPref(d); if(last?.source==='reserve' || (!last && pref.mode==='reserve')) d._aoSource='reserve'; d._aoSelectedVoice=last?.voice||pref.voice||''; }
  if(last?.source==='rutube'&&/^[a-f0-9]{32}$/i.test(last.rutubeId||''))d._rutube={id:last.rutubeId,duration:last.rutubeDuration||0,voice:last.voice||'',season:last.season,episode:last.episode};
  if(last?.source==='vk'&&/^-?\d+_\d+$/.test(last.vkId||''))d._vk={id:last.vkId,season:last.season,episode:last.episode};
  let s0 = seasons[0]?.season, e0 = seasons[0]?.episodes[0];
  if (serial && last?.season && seasons.find((x) => x.season == last.season)) { s0 = last.season; e0 = last.episode; }
  const rsm = d._vk?sourceResumeInfo('vk',d._vk.id,d.id,serial?s0:null,serial?e0:null):d._rutube?sourceResumeInfo('rutube',d._rutube.id,d.id,serial?s0:null,serial?e0:null):resumeInfo(d.id,serial?s0:null,serial?e0:null);
  const kp = Number(d.kp_rating) || 0, im = Number(d.imdb_rating) || 0, sh = Number(d._ao?.rating) || 0;
  det = { d, seasons, serial, s0, e0 };
  DX = { d, inf, T: null, trailers: null, shots: [], recs: null, tab: '', token: t };
  const watch = rsm || (serial && last) ? 'Продолжить' + (d._vk?' · VK Видео':d._rutube?' · Rutube':d._aoSource==='reserve' ? ' · резерв' : '') + (serial ? (d._ao&&seasons.length===1?` · серия ${e0}`:` · С${s0} Э${e0}`) : '') + (rsm ? ' · ' + fmtTime(rsm.t) : '') : 'Смотреть';
  const people = d.people || {};
  const tabs = [['about', [6,7].includes(Number(d.type)) ? 'Об аниме' : Number(d.type)===4 ? 'О шоу' : [3,5].includes(Number(d.type)) || serial ? 'О сериале' : 'О фильме']];
  if (serial) tabs.push(['eps', 'Серии']);
  if (d._ao?.franchise?.nodes?.length > 1) tabs.push(['franchise', 'Порядок франшизы']);
  if (d._ao?.animeId) tabs.push(['aoComments','Отзывы AnimeOn']);
  if (d._ao?.shikimori) tabs.push(['characters','Персонажи']);
  tabs.push(['trailers', 'Трейлеры']);
  if ((people.actors || []).length || (people.directors || []).length) tabs.push(['cast', 'Актёры']);
  tabs.push(['more', 'Похожее']);
  view.innerHTML = `<div class="page"><div class="dbg" id="dbg"></div><div class="dshade"></div><div class="det"><div class="dp"><img src="${esc(posterOf(d))}" alt="" onerror="detPoster(this)"></div><div class="di">
    <div class="ty">${esc(TYPES[d.type] || '')}${inf.age ? ' · ' + esc(inf.age) + '+' : ''}</div>
    <h1 id="dTitle">${esc(d.name)}</h1>${d._ao && /\[(?:ТВ|TV)[^\]]+\]/i.test(d.name||'')?`<div class="anime-edition">${esc(d.name)}</div>`:''}<div class="orig">${esc(d.origin_name || inf.name_eng || '')}</div>
    <div class="meta"><span>${d.year || ''}</span>${inf.time ? `<span>•</span><span>${esc(inf.time)}</span>` : ''}${serial && !(d._ao&&seasons.length===1) ? `<span>•</span><span>${seasons.length} сез.</span>` : ''}
      ${(inf.country || []).slice(0, 2).map((c) => `<span class="c">${esc(c)}</span>`).join('')}${d.quality ? `<span class="c">${esc(d.quality)}</span>` : ''}</div>
    ${d._ao?.nextEpisodeAt && Date.parse(d._ao.nextEpisodeAt)>Date.now() ? '<div class="ao-air" id="aoAir"><b>Следующая серия</b><span></span></div>' : ''}
    ${serial&&!d._ao&&![6,7].includes(Number(d.type))?'<div id="dSeriesAir"></div>':''}
    <div class="genres">${(inf.genre || []).map((g) => `<button class="chip genre f" tabindex="-1" data-genre="${esc(g)}" data-k="g:${esc(g)}">${esc(g)}</button>`).join('')}</div>
    <div class="rates" id="dRates">${kp ? rateChip('kp', rateCls(kp), kp.toFixed(1), 'Кинопоиск') : ''}${im ? rateChip('imdb', rateCls(im), im.toFixed(1), 'IMDb') : ''}${sh ? rateChip('shikimori', rateCls(sh), sh.toFixed(1), 'Shikimori') : ''}</div>
    <div class="btns"><button class="btn primary mini f" tabindex="-1" data-act="watch" data-k="watch">${ico('play')}<span class="lbl">${esc(watch)}</span></button>
      ${rsm ? `<button class="btn mini f" tabindex="-1" data-act="start" data-k="start">${ico('restart')}<span class="lbl">С начала</span></button>` : ''}
      ${d._ao && (d._aoSource==='reserve'||d._rutube||d._vk) && d._ao.selfHosted?.available ? '<button class="btn mini f" tabindex="-1" data-act="aoPrimary" data-k="ao-primary" aria-label="AnimeOn 2.0">' + ico('animePlayer') + '<span class="lbl">AnimeOn 2.0</span></button>' : ''}
      ${!d._ao && (d._rutube||d._vk) ? '<button class="btn mini f" tabindex="-1" data-act="mainPlayer" data-k="main-player" aria-label="Основной плеер">' + ico('play') + '<span class="lbl">Основной плеер</span></button>' : ''}
      ${d._ao && d._ao.voiceNames?.length ? '<button class="btn mini f" tabindex="-1" data-act="aoReserve" data-k="reserve" aria-label="Резервный плеер">' + ico('reservePlayer') + '<span class="lbl">Резерв</span></button>' : ''}
      <button class="btn mini f" tabindex="-1" data-act="vk" data-k="vk" aria-label="VK Видео"><img class="rutube-logo" src="platforms/vk-video.svg" alt=""><span class="lbl">VK Видео</span></button>
      <button class="btn mini f" tabindex="-1" data-act="rutube" data-k="rutube" aria-label="Rutube"><img class="rutube-logo" src="platforms/rutube-icon.svg" alt=""><span class="lbl">Rutube</span></button>
      <button class="btn mini f" tabindex="-1" data-act="trailer" data-k="trailer">${ico('trailer')}<span class="lbl">Трейлер</span></button>
      <button class="btn mini f" tabindex="-1" data-act="torrents" data-k="torrents">${ico('torrent')}<span class="lbl">Торренты</span></button>
      <button class="btn mini f ${isFav(d.id) ? 'on' : ''}" tabindex="-1" data-act="fav" data-k="fav">${ico('heart')}<span class="lbl">${isFav(d.id) ? 'В избранном' : 'В избранное'}</span></button></div></div></div>
    <div class="dtabs" id="dTabs">${tabs.map(([k, l]) => `<button class="chip f" tabindex="-1" data-dtab="${k}" data-k="tab:${k}" aria-pressed="false">${l}</button>`).join('')}</div>
    <div id="dPanel" class="dpanel"></div></div>`;
  $('[data-act=watch]').focus({ preventScroll: true });
  if($('#aoAir')) { const target=Date.parse(d._ao.nextEpisodeAt), tick=()=>{const el=$('#aoAir span');if(!alive(t)||!el){clearInterval(timer);return;}const n=Math.max(0,Math.ceil((target-Date.now())/1000));if(!n){el.textContent='Время выхода наступило';clearInterval(timer);return;}const days=Math.floor(n/86400),hours=Math.floor(n/3600)%24,mins=Math.floor(n/60)%60,secs=n%60;el.textContent=days+' д · '+String(hours).padStart(2,'0')+' ч · '+String(mins).padStart(2,'0')+' мин · '+String(secs).padStart(2,'0')+' сек';};const timer=setInterval(tick,1000);tick();}
  if($('#dSeriesAir')&&typeof tvSeriesSchedule==='function'){
    tvSeriesSchedule(d).then(next=>{if(!alive(t)||!DX||DX.token!==t||!next||next.none)return;const day=premiereDay(next.date),slot=$('#dSeriesAir');if(!slot||day===null||day<premiereToday())return;
      slot.innerHTML=`<div class="series-air-tv"><div><b>Следующая серия</b><span>${esc(next.season)} сезон · ${esc(next.episode)} серия · ${esc(new Date(day).toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'}))}</span><small>Дата эфира по TMDB · озвучка может появиться позже</small></div><strong></strong></div>`;
      const update=()=>{const el=$('#dSeriesAir strong');if(!alive(t)||!el){clearInterval(timer);return;}const days=Math.max(0,Math.round((day-premiereToday())/86400000));el.textContent=days?'Через '+days+' '+plural(days,'день','дня','дней'):'Сегодня';};const timer=setInterval(update,60000);update();
    }).catch(()=>{});
  }
  const enhancement=detailsEnhance(d, t);
  if(r.detailTab==='more'&&!d._ao){await enhancement;if(!alive(t)||!DX||DX.token!==t)return;}
  const tabLoad=selectTab(tabs.some(([key])=>key===r.detailTab) ? r.detailTab : serial && last?.season ? 'eps' : 'about');
  if (r.autoplay) $('[data-act=watch]').click();
  if(window.startDetailBackground)window.startDetailBackground(d,t);
  if(r.detailTab && tabLoad?.then)await tabLoad;
}

function selectTab(k) {
  if (!DX || DX.tab === k) return;
  DX.tab = k;
  $$('#dTabs .chip').forEach((b) => {const on=b.dataset.dtab===k;b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on));});
  const p = $('#dPanel'); if (!p) return;
  return (PANELS[k] || PANELS.about)(p);
}

const PANELS = {
  async characters(p) {
    const token=DX.token,id=String(DX.d._ao?.shikimori||'');p.innerHTML='<div class="empty"><div class="spin"></div></div>';
    try {
      if(!/^\d{1,9}$/.test(id))throw Error('id');
      const r=await fetch(tvPx('https://shikimori.io/api/animes/'+id+'/roles','Luma/1.0','',true),{signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('http');const data=await r.json();if(!Array.isArray(data))throw Error('data');
      if(!DX||DX.token!==token||DX.tab!=='characters')return;
      DX.characters=data.filter(x=>x.character?.id).map(x=>({id:x.character.id,name:x.character.russian||x.character.name,image:x.character.image?.preview?'https://shikimori.io'+x.character.image.preview:'',role:(x.roles||[]).includes('Main')?'Главный персонаж':'Персонаж'}));
      p.innerHTML=DX.characters.length?'<div class="tv-detail-section"><span class="person-kicker">SHIKIMORI</span><h2>Персонажи</h2><small>'+DX.characters.length+' '+plural(DX.characters.length,'персонаж','персонажа','персонажей')+'</small></div><div class="tv-character-grid">'+DX.characters.map((x,i)=>`<button class="tv-character f" tabindex="-1" data-character="${i}" data-k="character:${i}"><span class="tv-character-art">${x.image?`<img loading="lazy" src="${esc(tvPx(x.image))}" alt="">`:''}</span><b>${esc(x.name||'Персонаж')}</b><small>${esc(x.role)}</small></button>`).join('')+'</div>':'<div class="empty">Персонажей пока нет</div>';
    }catch{if(DX&&DX.token===token&&DX.tab==='characters')p.innerHTML='<div class="empty">Не удалось загрузить персонажей Shikimori. Попробуйте позже.</div>';}
  },
  async aoComments(p, page=1) {
    const token=DX.token, id=DX.d._ao.animeId; p.innerHTML='<div class="empty"><div class="spin"></div></div>';
    const result=await aoCall('comments',id,page);if(!DX||DX.token!==token||DX.tab!=='aoComments')return;
    if(result.error){p.innerHTML='<div class="empty">Отзывы сейчас недоступны</div>';return;}
    const rows=(result.comments||[]).map((x,i)=>`<div class="blk f" tabindex="-1" data-k="comment:${i}"><b>${esc(x.author)}</b><p class="desc2 ao-comment">${esc(x.body)}</p><span class="sub">${x.likes?'♥ '+Number(x.likes):''}</span></div>`).join('');
    const navigation=(page>1?`<button class="btn f" tabindex="-1" data-aocommentpage="${page-1}" data-k="comments:prev">‹ Предыдущие</button>`:'')+(result.hasMore?`<button class="btn f" tabindex="-1" data-aocommentpage="${page+1}" data-k="comments:next">Следующие отзывы ›</button>`:'');
    p.innerHTML='<div class="tv-detail-section"><span class="person-kicker">ANIMEON</span><h2>Отзывы зрителей</h2><small>Могут содержать спойлеры</small></div>'+(rows?'<div class="tv-comments-grid">'+rows+'</div>':'<div class="empty">Отзывов пока нет</div>')+(navigation?`<div class="ao-comment-nav">${navigation}</div>`:'');
  },
  franchise(p) {
    const f=DX.d._ao?.franchise;
    const nodes=(f?.nodes||[]).filter(x=>x.id!=null).slice().sort((a,b)=>(Number(a.date)||Infinity)-(Number(b.date)||Infinity)||(Number(a.year)||Infinity)-(Number(b.year)||Infinity));
    if(!nodes.length){p.innerHTML='<div class="empty">Связанные части не найдены</div>';return;}
    const byId=new Map(nodes.map(x=>[String(x.id),x])), edges=new Map(nodes.map(x=>[String(x.id),new Set()]));
    for(const link of f.links||[]){let from=String(link.sourceId),to=String(link.targetId);if(link.relation==='prequel')[from,to]=[to,from];else if(link.relation!=='sequel')continue;if(byId.has(from)&&byId.has(to))edges.get(from).add(to);}
    const connected=new Set([String(f.currentId)]);let changed=true;
    while(changed){changed=false;for(const [from,targets] of edges)for(const to of targets)if(connected.has(from)||connected.has(to)){if(!connected.has(from)||!connected.has(to))changed=true;connected.add(from);connected.add(to);}}
    const remaining=nodes.filter(x=>connected.has(String(x.id))), primary=[];
    while(remaining.length){const ids=new Set(remaining.map(x=>String(x.id)));const next=remaining.find(x=>![...ids].some(id=>edges.get(id)?.has(String(x.id))))||remaining[0];primary.push(next);remaining.splice(remaining.indexOf(next),1);}
    const side=nodes.filter(x=>!connected.has(String(x.id))),done=S.extra?.done||{};
    const progress=x=>{if(!x.slug)return {total:0,count:0,started:false,finished:false};const id='ao:'+x.slug,total=Math.max(0,Math.floor(Number(x.eps)||0));const linked=(S.history||[]).filter(h=>h.aoSlug===x.slug||String(h.id)===id);const entries=[done[id+':1'],...linked.filter(h=>h.id!=null&&h.season).map(h=>done[h.id+':'+h.season])];const count=new Set(entries.flatMap(a=>Array.isArray(a)?a:[]).map(Number).filter(n=>Number.isInteger(n)&&n>0&&(!total||n<=total))).size;return {total,count,started:linked.length>0,finished:total>0&&count>=total};};
    const label=x=>{const v=progress(x);return v.finished?'Все доступные серии просмотрены · '+v.count+' из '+v.total:v.count?(v.total?'Досмотрено серий: '+v.count+' из '+v.total:'Досмотрено серий: '+v.count):v.started?'Начато':'';};
    const trackable=nodes.filter(x=>x.inBase&&x.slug&&Number(x.eps)>0),finished=trackable.filter(x=>progress(x).finished).length;
    const cards=items=>items.map(x=>x.inBase&&x.slug?cardHTML({id:'ao:'+x.slug,type:/^(movie|music)$/i.test(x.kind)?6:7,name:x.name,poster:x.poster,year:x.year},'franchise:'+x.id,{sub:[String(x.id)===String(f.currentId)?'Вы здесь':'',label(x)].filter(Boolean).join(' · ')}):`<div class="card franchise-unavailable"><div class="poster">${x.poster?`<img loading="lazy" src="${esc(x.poster)}" alt="">`:''}<div class="ph">Нет на AnimeOn</div></div><div class="t">${esc(x.name||'Без названия')}</div><div class="s">${x.year?esc(x.year)+' · ':''}Нет на AnimeOn</div></div>`).join('');
    p.innerHTML=`<h3 class="ph3">Франшиза</h3><p class="sub">${nodes.length} ${plural(nodes.length,'тайтл','тайтла','тайтлов')} · AnimeOn${trackable.length?' · все доступные серии просмотрены: '+finished+' из '+trackable.length+' частей':''}</p>`+(primary.length?'<h3 class="ph3">Связанные продолжения</h3><div class="track">'+cards(primary)+'</div>':'')+(side.length?'<h3 class="ph3">Другие части франшизы</h3><div class="track">'+cards(side)+'</div>':'')+'<p class="sub">Порядок продолжений основан на связях AnimeOn. Прогресс учитывает досмотренные доступные серии; другие части могут быть ответвлениями.</p>';hookImages(p);
  },
  about(p) {
    const { d, inf } = DX;
    const facts = [dFact('Премьера', inf.premier_rus || inf.premier), dFact('Режиссёр', dList(inf.director)), dFact('Сценарий', dList(inf.screenwriter)), dFact('Продюсеры', dList(inf.producer).slice(0, 120)), dFact('Оператор', dList(inf.operator)), dFact('Композитор', dList(inf.composer)), dFact('Бюджет', inf.budget), dFact('Рейтинг MPAA', inf.rate_mpaa)].join('');
    p.innerHTML = `<div class="blk f" tabindex="-1" data-k="abt"><p class="desc2">${esc(inf.description || DX.T?.overview || 'Описание пока не добавили.')}</p></div>
      ${facts ? `<div class="facts f" tabindex="-1" data-k="facts">${facts}</div>` : ''}
      ${(d._ao?.highlights || []).length ? `<h3 class="ph3">Особенности</h3><div class="ao-highlights">${d._ao.highlights.map(x=>`<div class="ao-highlight"><i></i><span>${esc(x)}</span></div>`).join('')}</div>` : ''}
      ${(d._ao?.faq || []).length ? `<h3 class="ph3">Частые вопросы</h3><div class="ao-faq">${d._ao.faq.map((x,i)=>`<div class="ao-faq-item"><button class="ao-faq-question f" tabindex="-1" data-aofaq="${i}" data-k="aofaq:${i}" aria-expanded="false"><span>${esc(x.question)}</span><i>⌄</i></button><div class="ao-faq-answer hidden">${esc(x.answer)}</div></div>`).join('')}</div>` : ''}
      ${(inf.trivia || []).length ? `<h3 class="ph3">Интересные факты</h3>${inf.trivia.slice(0, 6).map((x, i) => `<div class="blk triv f" tabindex="-1" data-k="tv${i}">${esc(x)}</div>`).join('')}` : ''}`;
  },
  eps(p) {
    p.innerHTML = '<div class="tv-detail-section"><span class="person-kicker">ДЛЯ ПРОСМОТРА</span><h2>Серии</h2></div><div class="eps2"><div class="seasons" id="dSeasons"></div><div class="epgrid" id="dEps"></div></div>';
    paintEps($('#dSeasons'), $('#dEps'), det.s0, 'd');
  },
  async trailers(p) {
    p.innerHTML = '<div class="empty" style="padding:40px"><div class="spin"></div></div>';
    const { d, inf, T } = DX, tok = DX.token;
    if (!DX.trailers) DX.trailers = findTrailers({ name: d.name, origin: d.origin_name || inf.name_eng, year: d.year, anime:!!d._ao||[6,7].includes(Number(d.type)), tmdb: T?.tmdb, kind: T?.kind });
    const list = await DX.trailers;
    if (!DX || DX.token !== tok || DX.tab !== 'trailers') return;
    DX.trList = list;
    p.innerHTML = list.length ? `<div class="trailers">${list.map((x, i) => `<div class="tr f" tabindex="-1" data-trailer="${i}" data-k="tr${i}"><div class="th"><img loading="lazy" src="${esc(x.thumb)}" alt=""><i>▶</i></div><b>${esc(x.title)}</b><small>${esc(x.src)}</small></div>`).join('')}</div>` : '<div class="empty" style="padding:50px 0;text-align:left"><b>Трейлеров пока нет</b></div>';
  },
  cast(p) {
    const people = DX.d.people || {};
    const cast=[...(people.directors||[]).map(x=>({x,role:'Режиссёр'})),...(people.actors||[]).map(x=>({x,role:x.characters?.[0]||'Актёр'}))];
    p.innerHTML = `<div class="tv-detail-section"><span class="person-kicker">СОЗДАТЕЛИ</span><h2>Актёры и съёмочная группа</h2><small>${cast.length} ${plural(cast.length,'человек','человека','человек')}</small></div><div class="tv-cast-grid">${cast.map(({x,role})=>`<button class="tv-cast-card f" tabindex="-1" data-pid="${x.id}" data-k="pp${x.id}"><span class="tv-cast-art">${x.avatar_url?`<img loading="lazy" src="${esc(x.avatar_url)}" alt="">`:`<span>${esc((x.name||'?')[0])}</span>`}</span><span class="tv-cast-copy"><b>${esc(x.name)}</b><small>${esc(role)}</small></span></button>`).join('')}</div>`;
  },
  async more(p) {
    const { d, inf } = DX, tok = DX.token;
    if(d._ao){
      p.innerHTML='<div class="empty"><div class="spin"></div></div>';
      let result;try{result=await aoCall('catalog',{page:1,limit:24,sort:'popular',genre:(inf.genre||[])[0]||''});}catch{result={error:'NETWORK'};}
      if(!DX||DX.token!==tok||DX.tab!=='more')return;
      if(result?.error){p.innerHTML='<div class="empty"><b>Не удалось загрузить похожее аниме</b><button class="btn f" tabindex="-1" data-more-retry="1" data-k="more:retry">Повторить</button></div>';return;}
      const norm=x=>String(x||'').trim().toLocaleLowerCase('ru-RU'),genres=new Set((inf.genre||[]).map(norm)),parts=new Set([d._ao.slug,...(d._ao.franchise?.nodes||[]).map(x=>x.slug)].filter(Boolean));
      const items=(result?.items||[]).filter(x=>!parts.has(x.slug)).map((x,i)=>({x,i,overlap:(x.genres||[]).filter(g=>genres.has(norm(g))).length})).filter(x=>!genres.size||x.overlap>0).sort((a,b)=>b.overlap-a.overlap||a.i-b.i).map(({x})=>aoCompactToTv(x));
      p.innerHTML=items.length?`<h3 class="ph3">Похожие по жанрам · AnimeOn</h3><p class="sub">Сначала тайтлы с большим числом общих жанров.</p><div class="track">${items.map(x=>cardHTML(x,'sm:'+x.id,{orig:true})).join('')}</div>`:'<div class="empty">Похожих аниме пока не найдено</div>';
      hookImages(p);return;
    }
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
  if(T.imdb&&(!T.logo||!T.backdrop)){const art=await (T._cinemetaPromise ||= cinemetaArt(T.imdb,T.kind));if (!DX || DX.token !== t || !alive(t)) return;T.cinemetaLogo=art?.logo||'';T.cinemetaBackdrop=art?.background||'';}
  DX.T = T; DX.shots = T.shots || [];
  if(DX.tab==='about'&&!DX.inf.description&&T.overview){const panel=$('#dPanel .desc2');if(panel)panel.textContent=T.overview;}
  if (T.backdrop || T.cinemetaBackdrop) { const u = T.backdrop ? TMI(T.backdrop, 'w1280') : T.cinemetaBackdrop, im = new Image(); im.onload = () => { const b = $('#dbg'); if (b && alive(t)) { b.style.backgroundImage = `url("${u}")`; b.classList.add('on'); } }; im.src = u; }
  if (T.logo || T.cinemetaLogo) { d._pauseLogo=T.logo?TMI(T.logo,'w500'):T.cinemetaLogo;if(window.npActive?.()&&String(NP.d?.id)===String(d.id)){NP.d._pauseLogo=d._pauseLogo;npPaintPause(NP.st);}if(playerOpen()&&String(playing?.d?.id)===String(d.id)){playing.d._pauseLogo=d._pauseLogo;window.sendReservePauseInfo?.();} const h = $('#dTitle'); if (h) { const img = new Image(); img.className = 'logo-img'; img.alt = d.name; img.onload = () => { if (alive(t)) { h.textContent = ''; h.appendChild(img); h.classList.add('has-logo'); } }; img.src = d._pauseLogo; } }
  // вкладка «Кадры» появляется, когда есть что показать
  if (DX.shots.length > 1 && !$('[data-dtab=shots]')) {
    $('#dTabs [data-dtab=more]')?.insertAdjacentHTML('beforebegin', '<button class="chip f" tabindex="-1" data-dtab="shots" data-k="tab:shots" aria-pressed="false">Кадры</button>');
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
  if(el.dataset.moreRetry){$('[data-dtab="more"]')?.focus({preventScroll:true});DX.tab='';selectTab('more');return;}
  if (el.dataset.dtab) { selectTab(el.dataset.dtab); return; }
  if (el.dataset.character !== undefined && DX.tab==='characters') { openTvCharacter(Number(el.dataset.character)); return; }
  if (el.dataset.genre) { topLevel('section', { sec: SEC_BY_TYPE_TV[DX.d.type] || 'films', genre: el.dataset.genre }); return; }
  if (el.dataset.pid) { go('person', { lift: el.dataset.pid }); return; }
  if (el.dataset.trailer) { const x = DX.trList?.[+el.dataset.trailer]; if (x) openTrailer(x); return; }
  if (el.dataset.shotbig) { openLightbox(DX.shots.map((b) => TMI(b, 'w1280')), +el.dataset.shotbig); return; }
  if (el.dataset.act === 'torrents') { go('torrents', { id: DX.d.id }); return; }
  if (el.dataset.act === 'trailer') {
    if (!DX.trailers) DX.trailers = findTrailers({ name: DX.d.name, origin: DX.d.origin_name || DX.inf.name_eng, year: DX.d.year, anime:!!DX.d._ao||[6,7].includes(Number(DX.d.type)), tmdb: DX.T?.tmdb, kind: DX.T?.kind });
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

async function openTvCharacter(index) {
  const item=DX?.characters?.[index];if(!item)return;const key=String(item.id);
  dlg(`<div class="tv-character-detail" data-character-detail="${esc(key)}"><div class="tv-character-detail-art">${item.image?`<img src="${esc(tvPx(item.image.replace('/preview/','/original/')))}" alt="">`:''}</div><div class="tv-character-main"><div class="tv-character-header"><p class="tv-character-label">ПЕРСОНАЖ · SHIKIMORI</p><h2>${esc(item.name||'Персонаж')}</h2></div><div class="tv-character-desc f" tabindex="-1" data-k="character:description">Загружаем описание…</div><div class="tv-character-footer"><span>Описание может содержать спойлеры<br><i class="tv-character-scroll-hint" hidden>↑↓ Прокрутить описание</i></span><button class="btn f" tabindex="-1" data-character-close="1" data-k="character:close">Закрыть</button></div></div></div>`);
  $('#modal').dataset.returnCharacter=String(index);
  $('[data-character-close]')?.focus({preventScroll:true});
  try {const r=await fetch(tvPx('https://shikimori.io/api/characters/'+encodeURIComponent(key),'Luma/1.0','',true),{signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('http');const x=await r.json(),root=$('[data-character-detail="'+key+'"]');if(!root||$('#modal').classList.contains('hidden'))return;const parsed=new DOMParser().parseFromString(x.description_html||x.description||'','text/html');parsed.querySelectorAll('.b-spoiler_block,.b-spoiler').forEach(y=>y.remove());parsed.querySelectorAll('br').forEach(y=>y.replaceWith('\n'));const text=parsed.body.textContent.trim(),desc=$('.tv-character-desc',root);desc.textContent=text||'Описание пока недоступно.';$('.tv-character-scroll-hint',root).hidden=desc.scrollHeight<=desc.clientHeight+1;}catch{const root=$('[data-character-detail="'+key+'"]');if(root)$('.tv-character-desc',root).textContent='Описание сейчас недоступно.';}
}
document.addEventListener('click',e=>{if(!e.target.closest('[data-character-close]'))return;closeDlg();});
document.addEventListener('keydown',e=>{const el=e.target.closest?.('.tv-character-desc');if(!el||!['ArrowDown','ArrowUp'].includes(e.key)||el.scrollHeight<=el.clientHeight)return;const down=e.key==='ArrowDown';if((down&&el.scrollTop<el.scrollHeight-el.clientHeight-1)||(!down&&el.scrollTop>0)){el.scrollTop+=down?110:-110;e.preventDefault();e.stopImmediatePropagation();}},true);

// постер на странице фильма не загрузился: запасной (страница фильма, затем TMDB)
window.detPoster = async (img) => {
  img.onerror = null; if (!DX || !DX.d) return;
  const d = DX.d, url = await findPoster(d.id, d.name, d.year, img.src);
  if (url && DX && DX.d === d) { posterFix[d.id] = url; try { localStorage.setItem('luma.tv.pfix', JSON.stringify(posterFix)); } catch {} img.src = url; feedPublish(); }
};

document.addEventListener('click',e=>{const b=e.target.closest('[data-aocommentpage]');if(!b||!DX||DX.tab!=='aoComments')return;PANELS.aoComments($('#dPanel'),Number(b.dataset.aocommentpage)).then(()=>{const first=$('#dPanel .f');if(first){first.focus({preventScroll:true});first.scrollIntoView({block:'center'});}});});

document.addEventListener('click',e=>{const b=e.target.closest('[data-aofaq]');if(!b)return;const answer=b.parentElement.querySelector('.ao-faq-answer'),open=b.getAttribute('aria-expanded')==='true';b.setAttribute('aria-expanded',String(!open));answer.classList.toggle('hidden',open);});

