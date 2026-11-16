const sprites = new Map();
'use strict';
/* ================= Плеер для ТВ: поток берётся со страницы плеера сайта, играет нативный ExoPlayer,
   а кнопки, серии и меню (звук, субтитры, качество, скорость) рисует этот интерфейс ================= */
const NP_UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const NP = { on: false, d: null, seasons: [], season: null, episode: null, key: '', data: null, src: null, st: { p: 0, d: 0, pl: false, b: false, w: false }, mode: 'play', menu: '', osdT: 0, ctlT: 0, lastSave: 0, tr: null, secs: [], seek: { t: 0, step: 10 }, token: 0, audioNames: [], subApplied: '' };
const npActive = () => NP.on;
window.npActive = npActive;
let npSleepTimer=0,npSleepDeadline=0;
function npSetSleep(minutes){clearTimeout(npSleepTimer);npSleepDeadline=minutes?Date.now()+minutes*60000:0;if(minutes)npSleepTimer=setTimeout(()=>{npSleepDeadline=0;if(NP.on){NATIVE.npCmd('pause',0);const b=$('[data-np=sleep]');if(b)b.textContent='Сон';npOsd(5000);toast('Таймер сна: воспроизведение остановлено');}},minutes*60000);}
const npFmt = (s) => { s = Math.max(0, Math.floor(s || 0)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };

/* ---------- данные со страницы плеера ---------- */
const npCache = new Map();
function jsonAt(html, from, open, close) {   // вырезает JSON-значение (массив или объект) начиная с позиции from
  let depth = 0, inStr = false, esc = false;
  for (let i = from; i < html.length; i++) {
    const c = html[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true; else if (c === open) depth++; else if (c === close) { depth--; if (depth === 0) return html.slice(from, i + 1); }
  }
  return null;
}
// превью для перемотки: спрайты кадров (по умолчанию 10×10 кадров 160×90 раз в 5 секунд)
function parsePreview(raw) {
  if (!raw) return null;
  const src = (String(raw).match(/src:\s*"([^"]+)"/) || String(raw).match(/"src":\s*"([^"]+)"/) || [])[1];
  if (!src || !src.includes('${spriteNum}')) return null;
  const num = (k, d) => { const m = String(raw).match(new RegExp('["\\s{,]' + k + '"?\\s*:\\s*(\\d+)')); return m ? Number(m[1]) : d; };
  return { src, interval: num('interval', 5), w: num('width', 160), h: num('height', 90), size: num('spriteSize', 100), row: num('rowSize', 10), first: num('firstNum', 1) };
}
function npParse(html) {
  const tk = html.match(/var lok = 1, (\w+)= "(\w+)"/), tok = tk ? tk[2] : '';
  const fix = (u) => (u ? u + (tok ? '&' + tok : '') : '');   // страница дописывает этот ключ ко всем адресам потоков
  const out = { title: (html.match(/<title>([^<]*)<\/title>/) || [])[1] || '', seasons: null, movie: null };
  const seasonsMatch = /\bseasons\s*:\s*\[/.exec(html);
  if (seasonsMatch) {
    const raw = jsonAt(html, seasonsMatch.index + seasonsMatch[0].length - 1, '[', ']');
    if (raw) { try { out.seasons = JSON.parse(raw); } catch {} }
    if (out.seasons) for (const s of out.seasons) if (s.episodes) s.episodes.sort((x, y) => Number(x.episode) - Number(y.episode));   // серии иногда приходят вперемешку
    if (out.seasons) for (const s of out.seasons) for (const e of s.episodes || []) { e.hls = fix(e.hls); e.dasha = fix(e.dasha); e.dash = fix(e.dash); e.prev = e.preview && e.preview.src ? parsePreview(JSON.stringify(e.preview)) : null; }
  }
  if (!out.seasons) {
    const mi = html.lastIndexOf('makePlayer({'); const seg = mi >= 0 ? html.slice(mi) : html;
    const hls = (seg.match(/hls:\s*"([^"]+)"/) || [])[1];
    const dash = (seg.match(/\bdash:\s*"([^"]+)"/) || [])[1];
    const part = (re, o, c) => { const m = seg.match(re); if (!m) return null; const raw = jsonAt(seg, m.index + m[0].length - 1, o, c); try { return raw ? JSON.parse(raw) : null; } catch { return null; } };
    out.movie = { prev: parsePreview((html.match(/preview:\s*\{[\s\S]*?pad:\s*\d+\s*\}/) || [])[0]), hls: fix(hls), dash: fix(dash), dasha: fix((seg.match(/\bdasha:\s*"([^"]+)"/) || [])[1]), audio: part(/audio:\s*\{/, '{', '}') || { names: [], order: [] }, cc: part(/cc:\s*\[/, '[', ']') || [], sections: part(/sections:\s*\[/, '[', ']') || [], duration: Number((seg.match(/duration:\s*(\d+)/) || [])[1]) || 0 };
  }
  return out;
}
async function npEmbed(d) {
  const ck = d.id, hit = npCache.get(ck);
  if (hit && Date.now() - hit.t < 15 * 60e3) return hit.v;
  let last;
  const urls = [d.iframe_uri];
  try { const u = new URL(d.iframe_uri); for (const h of ['embed.liftw.ws', 'zenithjs.ws']) if (u.hostname !== h) { const x = new URL(d.iframe_uri); x.hostname = h; urls.push(x.href); } } catch {}
  for (const u of urls) {
    try {
      const r = await fetch(tvPx(u, NP_UA, 'https://liftw.ws/', true));
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const v = npParse(await r.text());
      if (v.seasons || (v.movie && (v.movie.hls || v.movie.dash || v.movie.dasha))) { npCache.set(ck, { t: Date.now(), v }); return v; }
      throw new Error('NO_STREAM');
    } catch (e) { last = e; }
  }
  throw last;
}
function npSource(data, season, episode) {
  if (data.seasons) {
    const s = data.seasons.find((x) => String(x.season) === String(season)); const e = s && s.episodes.find((x) => String(x.episode) === String(episode));
    if (!e) return null;
    return { prev: e.prev, hls: e.hls, dash: e.dash, dasha: e.dasha, audio: e.audio || { names: [], order: [] }, cc: e.cc || [], sections: e.sections || [], duration: e.duration || 0, title: e.title || '' };
  }
  return data.movie;
}

/* ---------- запуск и закрытие ---------- */
const npOrigPlayItem = typeof playItem === 'function' ? playItem : null;
async function playItemNative(d, seasons, season, episode, opts = {}) {
  npRememberPosition();
  if(d?._vk){if(String(d._vk.season??'')===String(season??'')&&String(d._vk.episode??'')===String(episode??''))return playVkTitle(d,seasons,season,episode,d._vk,opts);return chooseVk(d,seasons,season,episode);}
  if(d?._rutube){if(String(d._rutube.season??'')===String(season??'')&&String(d._rutube.episode??'')===String(episode??''))return playRutubeTitle(d,seasons,season,episode,d._rutube,opts);return chooseRutube(d,seasons,season,episode);}
  NP.rutube = false;
  if (d?._ao && d._aoSource==='reserve') return playAnimeReserve(d,seasons,season,episode,opts);
  if (d?._ao) return playAnimeOn(d,seasons,season,episode,opts);
  NP.kodik=null; NP.seek.held=false; NP.seek.since=0;
  const key = progKey(d.id, season, episode);
  const resume = opts.fromStart ? null : resumeInfo(d.id, season, episode);
  const token = ++NP.token;
  Object.assign(NP, { on: true, scrub: null, d, seasons, season, episode, key, tr: null, torr: false, secs: [], mode: 'play', menu: '', st: { p: 0, d: 0, pl: false, b: true, w: true }, lastSave: 0, subApplied: '', qualityApplied: false, aoAudioIndex:null, aoVoice:'' });
  addHistory(d, season, episode);
  npEnsureDom(); npShow();
  $('#np .np-load').classList.remove('hidden'); $('#np .np-load span').textContent = 'Загружаем…';
  $('#np .np-title b').textContent = d.name;
  $('#np .np-title span').textContent = season ? `Сезон ${season} · Серия ${episode}` : [d.year, TYPES[d.type]].filter(Boolean).join(' · ');
  closeNpMenu(true); npOsd(6000);
  let data;
  try { data = await npEmbed(d); } catch { if (token === NP.token) npFail('Не удалось получить поток'); return; }
  if (token !== NP.token) return;
  NP.data = data;
  const src = npSource(data, season, episode);
  if (!src || !(src.hls || src.dash || src.dasha)) { npFail('Для этой серии нет потока'); return; }
  NP.prev = src.prev || null; NP.scrub = null; if (NP.prev) { const P = NP.prev, cnt = Math.min(6, Math.ceil((NP.st.d || 0) / 1000 / P.interval / P.size) || 1); for (let i = 0; i < cnt; i++) { const u = P.src.replace('${spriteNum}', P.first + i); if (!sprites.has(u)) { new Image().src = u; sprites.set(u, 1); } } } NP.src = src; NP.secs = (src.sections || []).filter((x) => x.skip);
  NP.audioNames = (src.audio && src.audio.names) || [];
  const subs = (src.cc || []).map((c) => ({ url: c.url, name: c.name, lang: /eng|англ/i.test(c.name) ? 'en' : /рус|rus/i.test(c.name) ? 'ru' : '' }));
  if (resume) toast('Продолжаем с ' + fmtTime(resume.t));
  // 1080p есть только в DASH (VP9); HLS сайта отдаёт максимум 720p. DASH берём, если телевизор умеет VP9 аппаратно
  const urls = []; try { if (src.dash && NATIVE.npVp9 && NATIVE.npVp9()) urls.push(src.dash); if (src.dasha && NATIVE.npAv1 && NATIVE.npAv1()) urls.push(src.dasha); } catch {}
  if (src.hls) urls.push(src.hls);
  if (!urls.length) { npFail('Формат видео не поддерживается телевизором'); return; }
  NATIVE.npStart(JSON.stringify({subtitleShiftMs:npSubShift*1000, url: urls[0], urls, ua: NP_UA, referer: 'https://liftw.ws/', startMs: resume ? Math.floor(resume.t * 1000) : 0, subs }));
  renderNpButtons();
}
function npFail(msg) {
  if (NP.rutube || NP.d?._vk) { toast(msg); npClose(true); return; }
  if (NP.d?._ao) { toast(msg); npClose(true); return; }
  if (NP.torr) { toast(msg); npClose(true); return; }
  toast(msg + ' — открываем плеер сайта');
  const { d, seasons, season, episode } = NP;
  npClose(true);
  if (npOrigPlayItem) npOrigPlayItem(d, seasons, season, episode);
}
window.playItem = function (d, seasons, season, episode, opts) {
  if (NATIVE && NATIVE.npStart) return playItemNative(d, seasons, season, episode, opts);
  return npOrigPlayItem(d, seasons, season, episode, opts);
};

function npRememberPosition() {
  if (!NP.on || !NP.key || NP.finishedKey === NP.key) return;
  const p=Number(NP.st?.p)||0, d=Number(NP.st?.d)||0;
  if (d > 120000 && p >= 5000) storeProgress(NP.key, p / 1000, d / 1000);
}
function npPlaybackState() {
  let speed=1; try { speed=Number(JSON.parse(NATIVE.npTracks()).speed)||1; } catch {}
  return {startMs:Math.max(0,Number(NP.st?.p)||0),playing:!!NP.st?.w,speed};
}
function npClose(silent) {
  if (!NP.on) return;
  npSetSleep(0); npCancelNext(false); npResetExternalSub();
  NP.skipDoneKey=''; NP.skipDone=null;
  try { npRememberPosition(); } catch {}
  NP.on = false; NP.token++; clearTimeout(NP.osdT); clearTimeout(NP.ctlT);
  try { if (window.syncAfterPlay) syncAfterPlay(); } catch {}
  try { NATIVE.npStop(); } catch {}
  document.body.classList.remove('np');
  $('#np')?.classList.add('hidden'); closeNpMenu(true);
  if (silent) { window.resumeDetailBackground?.(); return; }
  if (route.name === 'details') show(route, { scroll: view.scrollTop, focus: 'watch' });
  else {
    const previous = NP.returnFocus && [...document.querySelectorAll('[data-k]')].find(el => el.dataset.k === NP.returnFocus && el.getClientRects().length);
    if (previous) previous.focus({preventScroll:true}); else focusFirst();
  }
  NP.returnFocus = '';
}

/* ---------- состояние от плеера ---------- */
window.npState = (s) => {
  if (!NP.on) return;
  NP.st = s;
  if (NP.sourceHistoryEnabled && !NP.sourceHistoryRecorded && s.pl && s.p > 500 && (NP.d?._vk?.id || NP.d?._rutube?.id)) { const source=NP.d._vk?'vk':'rutube',id=source==='vk'?NP.d._vk.id:NP.d._rutube.id; NP.sourceHistoryRecorded=true; addHistory(NP.d,NP.season,NP.episode); rememberSource(source,id,NP.d,NP.season,NP.episode); }
  npPaintPause(s);
  const p = s.p / 1000, d = s.d / 1000;
  if((NP.rutube||NP.kodik) && NP.d?._ao?.shikimori && NP.episode && d>=60 && d<=10000 && !NP.skipRequested){ NP.skipRequested=true; npFindAnimeSkips(NP.d._ao.shikimori,NP.episode,d,NP.token); }
  if (d && !NP.scrub) {
    $('#np .pos').style.width = Math.min(100, p / d * 100) + '%';
    $('#np .t0').textContent = npFmt(p); $('#np .t1').textContent = npFmt(d);
  }
  $('#np .np-load').classList.toggle('hidden', !(s.b && s.p < 1500) || false);
  $('#np .np-buf').classList.toggle('hidden', !(s.b && s.p >= 1500));
  const pb = $('[data-np=toggle]'); if (pb) pb.innerHTML = s.w ? NPI.pause : NPI.play;
  npSkipCheck(p);
  // место просмотра раз в 5 секунд; пока плеер не перемотан на сохранённое место, начало ролика прогресс не затирает
  if (Date.now() - NP.lastSave > 5000 && d > 120 && s.p > 3000) { NP.lastSave = Date.now(); storeProgress(NP.key, p, d); }
};
window.npEvent = (ev, msg) => {
  if (!NP.on) return;
  if (ev === 'ready') { $('#np .np-load').classList.add('hidden'); if (NP.aoAudioIndex != null) npApplyAoAudio(); npApplyPrefs(); }
  else if (ev === 'ended') { if (NP.key) { storeProgress(NP.key, 1e9, 1e9); NP.finishedKey=NP.key; } if (npHasNext()) npOfferNext(); else npClose(); }
  else if (ev === 'promo') { if (Date.now() - (NP.promoAt || 0) > 30000) { NP.promoAt = Date.now(); toast('В потоке реклама сайта: ждём чистое видео'); } }
  else if (ev === 'fallback') toast('Видео 1080p не запустилось, включаем обычный поток')
  else if (ev === 'error') npFail('Ошибка воспроизведения' + (msg ? ' (' + msg + ')' : ''));
  else if (ev === 'tracks') { if (NP.aoAudioIndex != null) npApplyAoAudio(); npApplyPrefs(); if (NP.menu) { const focused=document.activeElement?.closest?.('#npMenu') ? document.activeElement.dataset.k : null; renderNpMenu(false); if(focused)$$('#npMenu .f').find(x=>x.dataset.k===focused)?.focus({preventScroll:true}); } }
};
function npSkipCheck(p) {
  const btn = $('#np .np-skip'); if (!btn) return;
  const sec = NP.secs.find((x) => p >= x.start && p < x.end - 1);
  if (!sec) { btn.classList.add('hidden'); NP.skipSec = null; return; }
  if(NP.skipDoneKey!==NP.key){NP.skipDoneKey=NP.key;NP.skipDone=new Set();}
  const mark=sec.type+':'+sec.start,auto=sec.type==='op'?'luma.tv.autoSkipOpening':sec.type==='ed'?'luma.tv.autoSkipEnding':'';
  if(auto&&NP.st.pl&&optGet(auto,'0')==='1'&&!NP.skipDone.has(mark)){NP.skipDone.add(mark);NP.skipSec=sec;npDoSkip();return;}
  NP.skipSec = sec;
  const next = sec.type === 'titer';
  if (next && !npHasNext()) { btn.classList.add('hidden'); NP.skipSec = null; return; }
  $('span', btn).textContent = next ? 'Следующая серия' : sec.type==='ed' ? 'Пропустить эндинг' : 'Пропустить заставку';
  btn.classList.remove('hidden');
}
function npDoSkip() {
  const s = NP.skipSec; if (!s) return false;
  if(NP.skipDone)NP.skipDone.add(s.type+':'+s.start);
  if (s.type === 'titer') { if (!npNext(1)) return false; } else NATIVE.npCmd('seekTo', s.end * 1000);
  $('#np .np-skip').classList.add('hidden'); NP.skipSec = null; return true;
}

/* ---------- серии ---------- */
function npList() { const out = []; for (const s of NP.seasons) for (const e of s.episodes) out.push([s.season, e]); return out; }
function npHasNext() { if (NP.torr && NP.torr.files) return NP.torr.idx + 1 < NP.torr.files.length; if (!NP.season) return false; const l = npList(); const i = l.findIndex(([s, e]) => String(s) === String(NP.season) && String(e) === String(NP.episode)); return i >= 0 && i < l.length - 1; }
function npNext(dir) {
  npCancelNext(false);
  // торренты: серии — файлы раздачи в порядке номеров
  if (NP.torr && NP.torr.files) { const i = NP.torr.idx + dir; if (i < 0 || i >= NP.torr.files.length) return false; return window.npTorrPlayAt ? window.npTorrPlayAt(i) : false; }
  if (!NP.season) return false;
  const l = npList(); const i = l.findIndex(([s, e]) => String(s) === String(NP.season) && String(e) === String(NP.episode));
  if (i < 0) return false; const n = l[i + dir]; if (!n) return false;
  playItemNative(NP.d, NP.seasons, n[0], n[1]); return true;
}

let npNextTimer=0;
function npCancelNext(restore){clearInterval(npNextTimer);npNextTimer=0;$('#npNext')?.classList.add('hidden');if(restore&&NP.on){NP.mode='ctl';npOsd(60000);$('[data-np=toggle]')?.focus({preventScroll:true});}}
const npPreviousPause=window.lumaPause;window.lumaPause=()=>{if(npNextTimer)npCancelNext(true);npPreviousPause?.();};
function npOfferNext(){
  if(npNextTimer)return;
  const box=$('#npNext');if(!box)return;const token=NP.token,deadline=Date.now()+10000;
  let label='Следующая серия';if(NP.torr?.files){const next=NP.torr.files[NP.torr.idx+1];label=String(next?.name||next?.path||label).split(/[\\/]/).pop();}else{const list=npList(),i=list.findIndex(([s,e])=>String(s)===String(NP.season)&&String(e)===String(NP.episode)),n=list[i+1];if(n)label=NP.d?._ao?'Серия '+n[1]:'Сезон '+n[0]+' · серия '+n[1];}
  $('b',box).textContent=label;$('[data-nextchoice=now]',box).textContent=NP.rutube?'Выбрать видео':'Смотреть сейчас';closeNpMenu(true);box.classList.remove('hidden');NP.mode='next';clearTimeout(NP.ctlT);$('#np .np-osd')?.classList.add('hidden');
  const update=()=>{if(!NP.on||NP.token!==token){npCancelNext(false);return;}const left=Math.max(0,Math.ceil((deadline-Date.now())/1000));$('p',box).textContent=(NP.rutube||NP.d?._vk?'Выбор видео через ':'Запуск через ')+left+' с';if(!left){npCancelNext(false);if(!npNext(1))npClose();}};
  update();npNextTimer=setInterval(update,250);$('[data-nextchoice=now]')?.focus({preventScroll:true});
}
document.addEventListener('click',e=>{const el=e.target.closest('[data-nextchoice]');if(!el||!NP.on)return;if(el.dataset.nextchoice==='now'){npCancelNext(false);if(!npNext(1))npClose();}else npCancelNext(true);});

/* ---------- настройки по умолчанию: озвучка и субтитры запоминаются ---------- */
function tvAoWatchPref(d){const slug=d?._ao?.slug;if(!slug)return {};return tvX().watchPrefs?.['ao:'+slug]||{};}
function tvAoWatchPrefSet(d,patch){const slug=d?._ao?.slug;if(!slug)return;const prefs=tvX().watchPrefs=tvX().watchPrefs||{},key='ao:'+slug,old=prefs[key]||{},mode=patch.mode??old.mode??'auto',voice=patch.voice??old.voice??'';if(old.mode===mode&&old.voice===voice)return;prefs[key]={mode,voice,ts:Date.now()};save();}
const npPrefs = () => (tvX().player = tvX().player || {});
const npLanguageName = code => {const key=String(code||'').trim().toLowerCase();if(!key||key==='und')return '';return ({ru:'Русский',rus:'Русский',en:'Английский',eng:'Английский',ja:'Японский',jpn:'Японский',uk:'Украинский',ukr:'Украинский',hi:'Хинди',hin:'Хинди',fr:'Французский',fra:'Французский',de:'Немецкий',deu:'Немецкий',es:'Испанский',spa:'Испанский'})[key]||key.toUpperCase();};
function npSubtitleName(s) { const name=String(s.name||'').trim(),lang=npLanguageName(s.lang);return name || lang || 'Субтитры '+(Number(s.i)+1); }
function npSubtitlePreference(s,tracks) {
  const name=String(s.name||'').trim(),lang=String(s.lang||'').trim().toLowerCase();
  if(name)return name;
  if(lang&&lang!=='und'&&tracks.filter(x=>String(x.lang||'').trim().toLowerCase()===lang).length===1)return '@lang:'+lang;
  return '@unidentified';
}
function npFindSubtitlePreference(pref,tracks) {
  if(!pref||pref==='@unidentified')return null;
  if(pref.startsWith('@lang:')){const lang=pref.slice(6),matches=tracks.filter(x=>String(x.lang||'').trim().toLowerCase()===lang);return matches.length===1?matches[0]:null;}
  const normalize=x=>String(x||'').replace(/\s*-\s*\d+\s*$/,'').trim().toLowerCase();
  const exact=tracks.filter(x=>x.name===pref);if(exact.length===1)return exact[0];
  const matches=tracks.filter(x=>normalize(x.name)===normalize(pref));return matches.length===1?matches[0]:null;
}
function npAudioName(a) {
  const m = String(a.name || '').match(/(\d+)\s*$/); const idx = m ? Number(m[1]) : (/^\d+$/.test(String(a.name || '')) || a.name ? -1 : a.i);
  const nm = NP.audioNames[idx >= 0 ? idx : a.i];
  const lang = { ru: 'Русский', uk: 'Украинский', en: 'English' }[String(a.lang || '').slice(0, 2)] || '';
  return nm ? `${nm}` + (lang ? ` · ${lang}` : '') : (a.name || lang || 'Дорожка ' + (a.i + 1));
}
function npApplyPrefs() {
  let tr; try { tr = JSON.parse(NATIVE.npTracks()); } catch { return; }
  const pf = npPrefs();
  if (!NP.qualityApplied && Number(pf.quality) > 0 && (tr.video || []).length) {
    const levels = tr.video.filter(v => Number(v.h) > 0).sort((a,b) => a.h-b.h);
    if (levels.length) { const target = levels.filter(v => v.h <= Number(pf.quality)).pop() || levels[0]; NP.qualityApplied = true; NATIVE.npSelect('video', target.g, target.t); }
  }
  if (pf.audio && !NP.d?._ao) { const a = (tr.audio || []).find((x) => npAudioName(x) === pf.audio && !x.sel); if (a) NATIVE.npSelect('audio', a.g, a.t); }
  if (pf.sub && NP.subApplied !== NP.key && (tr.text || []).length) {
    const t = npFindSubtitlePreference(pf.sub,tr.text); NP.subApplied = NP.key;
    if (t) { if (!t.sel || tr.textOff) NATIVE.npSelect('text', t.g, t.t); }
  } else if (!pf.sub) NP.subApplied = NP.key;
}

/* ---------- интерфейс ---------- */
const NPI = {
  play: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z"/></svg>', pause: '<svg viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M11 5L4 12l7 7M20 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  fwd: '<svg viewBox="0 0 24 24"><path d="M13 5l7 7-7 7M4 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};
function npEnsureDom() {
  if ($('#np')) return;
  $('#stage').insertAdjacentHTML('beforeend', `<div id="np" class="hidden"><div class="np-pause hidden"><div class="np-pause-copy"></div></div><div class="np-load"><div class="spin"></div><span>Загружаем…</span></div><div class="np-buf hidden"><div class="spin"></div></div>
    <div class="np-next hidden" id="npNext"><small>ДАЛЕЕ</small><b></b><p></p><div class="np-next-actions"><button class="btn primary f" tabindex="-1" data-nextchoice="now" data-k="npnext:now">Смотреть сейчас</button><button class="btn f" tabindex="-1" data-nextchoice="cancel" data-k="npnext:cancel">Отмена</button></div></div>
    <div class="np-skip hidden"><button class="btn primary f" tabindex="-1" data-np="skip" data-k="npskip"><span></span></button></div>
    <div class="np-osd hidden"><div class="pclk"></div><div class="np-title"><b></b><span></span></div>
      <div class="np-bar"><i class="pos"></i><i class="mark"></i><div class="np-thumb hidden"><div class="img"></div><span></span></div><span class="t0">0:00</span><span class="t1">0:00</span></div><div class="np-btns" id="npBtns"></div><div class="np-hint">◀ ▶ перемотка · OK пауза · ▲ меню</div></div>
    <div class="np-sub"></div><div class="np-menu hidden" id="npMenu"></div></div>`);
}
async function npEpisodeDetails(d,season,episode){
 if(!d||!season||!episode||d._ao||[6,7].includes(Number(d.type)))return null;
 try{const found=await tmFind(d);if(!found||found.kind!=='tv')return null;const data=await tmdb('/tv/'+found.tmdb+'/season/'+Number(season),{}),ep=(data.episodes||[]).find(x=>Number(x.episode_number)===Number(episode));return ep?{name:String(ep.name||''),description:String(ep.overview||''),runtime:Number(ep.runtime)||0}:null;}catch{return null;}
}
function npLoadPauseDetails(){const d=NP.d;if(!d)return;const signature=[d.id,NP.season,NP.episode,NP.token].join(':');if(NP.pauseFetchKey===signature)return;NP.pauseFetchKey=signature;d._pauseEpisode=null;const token=NP.token,season=NP.season,episode=NP.episode;(async()=>{const [art,ep]=await Promise.all([tmFind(d).catch(()=>null),npEpisodeDetails(d,season,episode)]);if(!NP.on||NP.token!==token||NP.d!==d)return;if(art?.logo&&!d._pauseLogo)d._pauseLogo=TMI(art.logo,'w500');d._pauseEpisode=ep;npPaintPause(NP.st);})();}
function npPaintPause(s){
  const box=$('#np .np-pause');if(!box)return;
  const on=!!NP.d&&!s.w&&!s.b&&Number(s.d)>0&&optGet('luma.tv.pauseDetails','1')!=='0';box.classList.toggle('hidden',!on);if(!on)return;
  npLoadPauseDetails();const d=NP.d,info=d.info||{},epinfo=d._pauseEpisode||{},episode=NP.episode?(d._ao?'Серия '+NP.episode:'Сезон '+NP.season+' · серия '+NP.episode):'',desc=String(epinfo.description||info.description||d.description||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,420);
  const signature=[d.id,d.name,episode,epinfo.name,epinfo.runtime,d.year,info.time,desc,d._pauseLogo||''].join('|'),content=$('.np-pause-copy',box);
  if(content.dataset.signature!==signature){content.dataset.signature=signature;content.innerHTML=`<span class="np-pause-label">ПАУЗА</span><h2>${esc(d.name||'Видео')}</h2><p class="np-pause-meta">${esc([d.year,epinfo.runtime?epinfo.runtime+' мин':info.time,episode,epinfo.name].filter(Boolean).join(' · '))}</p>${desc?`<p class="np-pause-desc">${esc(desc)}</p>`:''}<p class="np-pause-left"></p>`;if(d._pauseLogo){const logo=new Image();logo.className='np-pause-logo';logo.alt=d.name||'';logo.onload=()=>{if(content.dataset.signature!==signature)return;const title=$('h2',content);if(title)title.replaceWith(logo);};logo.src=d._pauseLogo;}}
  const remaining=Math.max(0,(Number(s.d)-Number(s.p))/1000),left=$('.np-pause-left',box);if(left)left.textContent='Осталось '+npFmt(remaining);
}
/* ---------- субтитры: рисуем сами (как в плеере Luma для ПК), размер выбирается в меню «Субтитры» ---------- */
const NP_SUB_SIZES = [['s', 'Мелкие'], ['m', 'Обычные'], ['l', 'Крупные']];
function npApplySubSize() { const el = $('#np'); if (el) el.dataset.sub = npPrefs().subSize || 'm'; }
let npSubLast = null;
let npSubShift=0;
function npResetExternalSub(){npSubShift=0;npDrawCue('');}
function npDrawCue(t) {
  if (t === npSubLast) return; npSubLast = t;
  const el = $('#np .np-sub'); if (!el) return;
  const h = esc(t || '').replace(/\r?\n/g, '<br>');
  el.innerHTML = h ? `<span>${h}</span>` : ''; el.classList.toggle('on', !!h);
}
window.npCue = t => npDrawCue(t);
/* значения на кнопках: что сейчас выбрано (звук, субтитры, качество, скорость) */
function npPaintChips() {
  let tr = {}; try { tr = JSON.parse(NATIVE.npTracks()); } catch { return; }
  const set = (a, label, val) => { const b = $(`[data-np=${a}]`); if (b) b.innerHTML = esc(label) + (val ? ` <em>${esc(val)}</em>` : ''); };
  const aud = (tr.audio || []).find((x) => x.sel), txt = (tr.text || []).find((x) => x.sel);
  set('audio', 'Звук', NP.kodik ? NP.kodik.voice : aud ? npAudioName(aud) : '');
  set('subs', 'Субтитры', tr.textOff || !txt ? 'выкл' : npSubtitleName(txt).replace(/\s*-\s*\d+$/, ''));
  set('quality', 'Качество', NP.kodik ? NP.kodik.quality+'p' : tr.autoVideo ? 'авто' + (NP.st.vh ? ' · ' + NP.st.vh + 'p' : '') : (NP.st.vh ? NP.st.vh + 'p' : ''));
  set('speed', 'Скорость', Math.abs((tr.speed || 1) - 1) < 0.01 ? '' : (tr.speed || 1) + '×');
}
function renderNpButtons() {
  const ep = !!NP.season || !!(NP.torr && NP.torr.files && NP.torr.files.length > 1);
  $('#npBtns').innerHTML = `${ep ? `<button class="npb f" tabindex="-1" data-np="prev" data-k="npb:prev" title="Предыдущая серия">⏮</button>` : ''}
    <button class="npb f" tabindex="-1" data-np="back10" data-k="npb:b" title="−10 с">${NPI.back}</button>
    <button class="npb big f" tabindex="-1" data-np="toggle" data-k="npb:t">${NP.st.w ? NPI.pause : NPI.play}</button>
    <button class="npb f" tabindex="-1" data-np="fwd10" data-k="npb:f" title="+10 с">${NPI.fwd}</button>
    ${ep ? `<button class="npb f" tabindex="-1" data-np="next" data-k="npb:n" title="Следующая серия">⏭</button>` : ''}
    <span class="npsp"></span>
    ${ep ? '<button class="npb txt f" tabindex="-1" data-np="eps" data-k="npb:eps">Серии</button>' : ''}
    ${NP.rutube && NP.key ? '<button class="npb txt f" tabindex="-1" data-np="rtchoices" data-k="npb:rt">Варианты</button>' : ''}
    <button class="npb txt f" tabindex="-1" data-np="audio" data-k="npb:a">Звук</button>
    <button class="npb txt f" tabindex="-1" data-np="subs" data-k="npb:s">Субтитры</button>
    <button class="npb txt f" tabindex="-1" data-np="quality" data-k="npb:q">Качество</button>
    <button class="npb txt f" tabindex="-1" data-np="sleep" data-k="npb:sleep">Сон${npSleepDeadline?' · '+Math.max(1,Math.ceil((npSleepDeadline-Date.now())/60000))+' мин':''}</button>
    <button class="npb txt f" tabindex="-1" data-np="speed" data-k="npb:sp">Скорость</button>`;
}
function npShow(preserveSubShift=false) { if (!document.activeElement?.closest('#np')) NP.returnFocus=document.activeElement?.dataset?.k||''; NP.finishedKey=''; if(preserveSubShift)npDrawCue('');else npResetExternalSub(); NP.src=null; window.pauseDetailBackground?.(); $('#np').classList.remove('hidden'); $('#np .np-pause')?.classList.add('hidden'); document.body.classList.add('np'); npApplySubSize(); npSubLast = null; window.npCue(''); }
function npOsd(ms = 4000) { tick(); npPaintChips();
  const o = $('#np .np-osd'); if (!o) return;
  o.classList.remove('hidden'); clearTimeout(NP.osdT);
  NP.osdT = setTimeout(() => { if (NP.mode === 'play' && !NP.menu) o.classList.add('hidden'); }, ms);
}
function npEnterCtl() {
  NP.mode = 'ctl'; npOsd(60000);
  ($('[data-np=toggle]') || $('#npBtns .f'))?.focus({ preventScroll: true });
  clearTimeout(NP.ctlT); NP.ctlT = setTimeout(npLeaveCtl, 9000);
}
function npLeaveCtl() { NP.mode = 'play'; clearTimeout(NP.ctlT); document.activeElement?.blur?.(); npOsd(2500); }

/* меню справа */
const NP_SPEEDS = [0.75, 1, 1.1, 1.25, 1.5, 1.75, 2];
function openNpMenu(kind) {
  if(kind==='eps')NP.npSeason=NP.season;
  NP.menu = kind; NP.mode = 'menu'; clearTimeout(NP.ctlT); npOsd(60000);
  $('#npMenu').classList.remove('hidden'); renderNpMenu(true);
}
function closeNpMenu(silent) {
  NP.menu = ''; const m = $('#npMenu'); if (m) { m.classList.add('hidden'); m.innerHTML = ''; }
  if (!silent) { NP.mode = 'ctl'; ($(`[data-np=${NP.lastBtn}]`) || $('[data-np=toggle]'))?.focus({ preventScroll: true }); clearTimeout(NP.ctlT); NP.ctlT = setTimeout(npLeaveCtl, 9000); }
}
function renderNpMenu(focusCur) {
  const box = $('#npMenu'); if (!box || !NP.menu) return;
  box.classList.toggle('episode-menu',NP.menu==='eps'&&!NP.torr?.files?.length);
  let tr = {}; try { tr = JSON.parse(NATIVE.npTracks()); } catch {}
  let html = '', title = '';
  const row = (label, sel, attrs, sub) => `<button class="nm-r f ${sel ? 'on' : ''}" tabindex="-1" ${attrs} data-k="nm:${esc(attrs)}"><i>${sel ? '✓' : ''}</i><span>${esc(label)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}</button>`;
  if (NP.menu === 'audio' && NP.kodik) {
    title='Озвучка';const ep=String(NP.episode||1),a=NP.d._ao?.voiceNames||[],voices=a.filter(v=>NP.d._ao.voices[v]?.[ep]);
    html=voices.length?voices.map(v=>row(v,v===NP.kodik.voice,`data-kodikvoice="${esc(v)}"`)).join(''):'<div class="nm-e">Озвучек нет</div>';
  } else if (NP.menu === 'audio' && NP.d?._ao && !NP.rutube) {
    title='Озвучка'; const voices=NP.d._ao.selfHosted?.translations?.[String(NP.episode)]||[];
    html=voices.length?voices.map(v=>row(v,v===NP.aoVoice,`data-aovoice="${esc(v)}"`)).join(''):'<div class="nm-e">Озвучек нет</div>';
  } else if (NP.menu === 'audio') {
    title = 'Звук';
    const list = (tr.audio || []).slice().sort((a, b) => a.i - b.i);
    html = list.length ? list.map((a) => row(npAudioName(a), a.sel, `data-nsel="audio" data-g="${a.g}" data-t="${a.t}" data-pref="${esc(npAudioName(a))}"`, a.ch > 2 ? '5.1' : '')).join('') : '<div class="nm-e">Дорожек нет</div>';
  } else if (NP.menu === 'subs') {
    title = 'Субтитры';
    const list = tr.text || [];
    html = row('Выключены', tr.textOff || !list.some((x) => x.sel), 'data-nsel="text" data-g="-1" data-t="0" data-pref=""') + list.map((s) => {const base=npSubtitleName(s),same=list.filter(x=>npSubtitleName(x)===base).length>1,label=same?base+' · '+(s.i+1):base;return row(label,s.sel&&!tr.textOff,`data-nsel="text" data-g="${s.g}" data-t="${s.t}" data-pref="${esc(npSubtitlePreference(s,list))}"`);}).join('');
    if (!list.length) html += '<div class="nm-e">Для этого видео субтитров нет</div>';
    if(!tr.textOff && list.some(x=>x.sel))html+='<h4 class="nm-h">Синхронизация</h4>'+row('Раньше на 0,5 с',false,'data-nshift="-0.5"')+row('Сдвиг: '+(npSubShift>0?'+':'')+npSubShift.toFixed(1)+' с · сброс',false,'data-nshift="reset"')+row('Позже на 0,5 с',false,'data-nshift="0.5"');
    html += '<h4 class="nm-h">Размер</h4>' + NP_SUB_SIZES.map(([k, l]) => row(l, (npPrefs().subSize || 'm') === k, `data-nsize="${k}"`)).join('');
  } else if (NP.menu === 'quality' && NP.kodik) {
    title='Качество';html=NP.kodik.levels.map(x=>row(x.quality+'p',x.quality===NP.kodik.quality,`data-kodikquality="${x.quality}"`)).join('');
  } else if (NP.menu === 'quality') {
    title = 'Качество' + (NP.st.vh ? ' · сейчас ' + NP.st.vh + 'p' : '');
    const seenH = new Set(), list = (tr.video || []).slice().sort((a, b) => b.h - a.h || Number(b.sel) - Number(a.sel)).filter((v) => { if (seenH.has(v.h)) return false; seenH.add(v.h); v.sel = (tr.video || []).some((x) => x.h === v.h && x.sel); return true; });
    html = row('Авто', tr.autoVideo, 'data-nsel="video" data-g="-1" data-t="0" data-height="0"') + list.map((v) => row(v.h + 'p', v.sel && !tr.autoVideo, `data-nsel="video" data-g="${v.g}" data-t="${v.t}" data-height="${v.h}"`, v.br ? (v.br / 1e6).toFixed(1) + ' Мбит/с' : '')).join('');
  } else if (NP.menu === 'speed') {
    title = 'Скорость';
    html = NP_SPEEDS.map((x) => row(x === 1 ? 'Обычная' : x + '×', Math.abs((tr.speed || 1) - x) < 0.01, `data-nspeed="${x}"`)).join('');
  } else if (NP.menu === 'sleep') {
    title='Таймер сна';const remaining=npSleepDeadline?Math.max(1,Math.ceil((npSleepDeadline-Date.now())/60000)):0;
    html=[0,15,30,45,60].map(x=>row(x?x+' минут':'Выключен',x===0?!remaining:remaining===x,`data-nsleep="${x}"`)).join('');
  } else if (NP.menu === 'eps' && NP.torr?.files?.length) {
    title = 'Файлы раздачи';
    html = NP.torr.files.map((f,i)=>row(String(f.path||f.name||('Файл '+(i+1))).split(/[\\/]/).pop(),i===NP.torr.idx,`data-ntorrindex="${i}"`)).join('');
  } else if (NP.menu === 'eps') {
    title = 'Серии';
    box.innerHTML = `<h3>${esc(title)}</h3><div class="seasons" id="npSeasons"></div><div class="epgrid" id="npEps"></div>`;
    const savedDet = det; det = { d: NP.d, seasons: NP.seasons };
    paintEps($('#npSeasons'), $('#npEps'), NP.npSeason || NP.season, 'n', { season: NP.season, episode: NP.episode });
    det = savedDet;
    if (focusCur) ($('#npEps .ep.cur') || $('#npEps .ep'))?.focus({ preventScroll: true });
    return;
  }
  box.innerHTML = `<h3>${esc(title)}</h3><div class="nm-list">${html}</div>`;
  if (focusCur) ($('.nm-r.on', box) || $('.nm-r', box))?.focus({ preventScroll: true });
}
document.addEventListener('click', (e) => {
  const el = e.target.closest('.f'); if (!el || !NP.on) return;
  const a = el.dataset.np;
  if (a) {
    NP.lastBtn = a;
    if (a === 'toggle') NATIVE.npCmd('toggle', 0);
    else if (a === 'back10') NATIVE.npCmd('seekBy', -10000);
    else if (a === 'fwd10') NATIVE.npCmd('seekBy', 10000);
    else if (a === 'next') npNext(1);
    else if (a === 'prev') npNext(-1);
    else if (a === 'skip') npDoSkip();
    else if (a === 'rtchoices') chooseRutube(NP.d,NP.seasons,NP.season,NP.episode);
    else if (['eps', 'audio', 'subs', 'quality', 'sleep', 'speed'].includes(a)) openNpMenu(a);
    return;
  }
  if(el.dataset.kodikvoice && NP.kodik){const voice=el.dataset.kodikvoice,d=NP.d,seasons=NP.seasons,season=NP.season,episode=NP.episode,restoreState=npPlaybackState();tvAoWatchPrefSet(d,{mode:'reserve',voice});closeNpMenu(true);npClose(true);playAnimeReserve(d,seasons,season,episode,{voice,restoreState});return;}
  if(el.dataset.kodikquality && NP.kodik){const level=NP.kodik.levels.find(x=>x.quality===Number(el.dataset.kodikquality));if(!level)return;const pos=NP.st.p||0,wasPlaying=NP.st.w;let speed=1;try{speed=JSON.parse(NATIVE.npTracks()).speed||1}catch{}NP.kodik.quality=level.quality;npPrefs().quality=level.quality;save();closeNpMenu(true);NATIVE.npStart(JSON.stringify({subtitleShiftMs:npSubShift*1000,url:level.url,ua:NP_UA,referer:'https://kodikplayer.com/',startMs:pos,subs:[]}));if(!wasPlaying)NATIVE.npCmd('pause',0);if(speed!==1)NATIVE.npCmd('speed',speed);NP.mode='ctl';renderNpButtons();npOsd(5000);$('[data-np=quality]')?.focus({preventScroll:true});return;}
  if (el.dataset.aovoice && NP.d?._ao) { const voice=el.dataset.aovoice,restoreState=npPlaybackState(); npRememberPosition(); closeNpMenu(true); playAnimeOn(NP.d,NP.seasons,NP.season,NP.episode,{voice,restoreState}); return; }
  if (el.dataset.ntorrindex !== undefined && NP.torr?.files) { const index=Number(el.dataset.ntorrindex);if(Number.isInteger(index)&&index>=0&&index<NP.torr.files.length){closeNpMenu(true);window.npTorrPlayAt?.(index);}return; }
  if (el.dataset.nshift) { npSubShift=el.dataset.nshift==='reset'?0:Math.max(-30,Math.min(30,npSubShift+Number(el.dataset.nshift)));NATIVE.npCmd('subtitleShift',npSubShift*1000);const key=el.dataset.nshift;renderNpMenu(false);$(`[data-nshift="${key}"]`)?.focus({preventScroll:true});return; }
  if (el.dataset.nsize) { npPrefs().subSize = el.dataset.nsize; save(); npApplySubSize(); renderNpMenu(false); $(`.nm-r[data-nsize="${el.dataset.nsize}"]`)?.focus({ preventScroll: true }); return; }
  if (el.dataset.nsel) {
    NATIVE.npSelect(el.dataset.nsel, +el.dataset.g, +el.dataset.t);
    if (el.dataset.nsel === 'audio') npPrefs().audio = el.dataset.pref;
    if (el.dataset.nsel === 'text') npPrefs().sub = el.dataset.pref;
    if (el.dataset.nsel === 'video') { npPrefs().quality = Number(el.dataset.height) || 0; NP.qualityApplied = true; }
    save(); setTimeout(() => closeNpMenu(), 150); return;
  }
  if (el.dataset.nspeed) { NATIVE.npCmd('speed', +el.dataset.nspeed); setTimeout(() => closeNpMenu(), 150); return; }
  if (el.dataset.nsleep !== undefined) { npSetSleep(Number(el.dataset.nsleep)||0); renderNpButtons();setTimeout(() => closeNpMenu(),150);return; }
});
// переключение сезона и серии в меню «Серии» работает через общий обработчик с префиксом 'n'
document.addEventListener('click', (e) => {
  const el = e.target.closest('.f'); if (!el || !NP.on || NP.menu !== 'eps') return;
  if (el.dataset.pkSeason && el.dataset.pref === 'n') { e.stopImmediatePropagation(); NP.npSeason = el.dataset.pkSeason; renderNpMenu(false); $(`[data-k="ns${el.dataset.pkSeason}"]`)?.focus({ preventScroll: true }); }
  else if (el.dataset.ep && el.closest('#npEps')) { e.stopImmediatePropagation(); closeNpMenu(true); playItemNative(NP.d, NP.seasons, el.dataset.season, el.dataset.ep); }
}, true);

/* ---------- перемотка с превью кадров ---------- */
function showScrub() {
  const t = NP.scrub.t, d = NP.st.d / 1000;
  npOsd(4000);
  $('#np .mark').style.left = (d ? t / d * 100 : 0) + '%'; $('#np .mark').classList.add('on');
  $('#np .pos').style.width = (d ? t / d * 100 : 0) + '%';
  $('#np .t0').textContent = npFmt(t);
  const box = $('#np .np-thumb'); box.classList.remove('hidden');
  $('span', box).textContent = npFmt(t);
  const P = NP.prev, img = $('.img', box);
  if (!P) { img.style.display = 'none'; box.style.left = Math.max(60, Math.min(1700, 1760 * (d ? t / d : 0))) + 'px'; return; }
  img.style.display = '';
  const idx = Math.floor(t / P.interval), sprite = P.first + Math.floor(idx / P.size), within = idx % P.size;
  const url = P.src.replace('${spriteNum}', sprite), col = within % P.row, row = Math.floor(within / P.row);
  const Z = 320 / P.w;   // кадр любого размера показываем шириной 320
  img.style.width = P.w * Z + 'px'; img.style.height = P.h * Z + 'px';
  img.style.backgroundImage = `url("${url}")`;
  img.style.backgroundSize = P.w * P.row * Z + 'px auto';
  img.style.backgroundPosition = `-${col * P.w * Z}px -${row * P.h * Z}px`;
  const bw = $('#np .np-bar').clientWidth || 1760, half = (P.w * Z + 12) / 2;
  box.style.left = Math.max(half, Math.min(bw - half, bw * (d ? t / d : 0))) + 'px';
  if (!sprites.has(url)) { const i = new Image(); i.src = url; sprites.set(url, 1); }   // заранее загружаем этот и соседний спрайт
  const next = P.src.replace('${spriteNum}', sprite + 1); if (!sprites.has(next) && idx % P.size > P.size - 25) { const i = new Image(); i.src = next; sprites.set(next, 1); }
}
function commitScrub() {
  clearTimeout(NP.scrubT);
  if (!NP.scrub) return;
  const t = NP.scrub.t; NP.scrub = null;
  NATIVE.npCmd('seekTo', Math.floor(t * 1000));
  $('#np .np-thumb')?.classList.add('hidden'); $('#np .mark')?.classList.remove('on');
  npOsd(2500);
}

/* ---------- пульт ---------- */
window.npKey = (e) => {
  if (!NP.on) return false;
  const k = e.key;
  // меню и панель кнопок: перемещением фокуса занимается общий обработчик, мы лишь продлеваем показ
  if (NP.mode === 'menu' || NP.mode === 'next') { return false; }
  if (NP.mode === 'ctl') {
    clearTimeout(NP.ctlT); NP.ctlT = setTimeout(npLeaveCtl, 9000); npOsd(60000);
    if (k === 'ArrowDown') { npLeaveCtl(); e.preventDefault(); return true; }
    return false;
  }
  // режим просмотра: стрелки перематывают, OK — пауза, ▲ — кнопки
  if (k === 'ArrowLeft' || k === 'ArrowRight') {
    const dir = k === 'ArrowRight' ? 1 : -1, now = Date.now();
    if (NP.seek.held && NP.seek.dir === dir && now - NP.seek.t < 300) { e.preventDefault(); return true; }
    if (!NP.seek.held || NP.seek.dir !== dir) NP.seek.since = now;
    NP.seek.held = true; NP.seek.dir = dir; NP.seek.t = now;
    NP.seek.step = now - NP.seek.since >= 5000 ? 20 : 10;
    const dur = NP.st.d / 1000 || 1e9;
    if (!NP.scrub) NP.scrub = { t: NP.st.p / 1000 };
    NP.scrub.t = Math.max(0, Math.min(dur - 2, NP.scrub.t + dir * NP.seek.step));
    showScrub(); clearTimeout(NP.scrubT); NP.scrubT = setTimeout(commitScrub, 800);   // применится, когда перестанете нажимать
    e.preventDefault(); return true;
  }
  if (k === 'Enter' && NP.scrub) { commitScrub(); e.preventDefault(); return true; }
  if (k === 'Enter') { if (NP.skipSec && npDoSkip()) { e.preventDefault(); return true; } NATIVE.npCmd('toggle', 0); npOsd(3000); e.preventDefault(); return true; }
  if (k === 'ArrowUp' || k === 'ArrowDown') { npEnterCtl(); e.preventDefault(); return true; }
  return true;
};
document.addEventListener('keyup', e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { NP.seek.held = false; NP.seek.since = 0; } });
window.npBack = () => {
  if (!NP.on) return false;
  if (NP.mode === 'next') { npCancelNext(true); return true; }
  if (NP.menu) { closeNpMenu(); return true; }
  if (NP.mode === 'ctl') { npLeaveCtl(); return true; }
  npClose(); return true;
};
window.npMedia = (k) => {
  if (!NP.on) return false;
  if (k === 'playpause') NATIVE.npCmd('toggle', 0); else if (k === 'ff') NATIVE.npCmd('seekBy', 30000); else if (k === 'rw') NATIVE.npCmd('seekBy', -30000);
  else if (k === 'next') npNext(1); else if (k === 'prev') npNext(-1);
  npOsd(3000); return true;
};

/* ---------- трейлеры: прямой поток Rutube в нативном плеере, без их плеера и рекламы ---------- */
async function playTrailerNative(t) {
  NP.kodik=null; const token = ++NP.token;
  NP.rutube = true;
  Object.assign(NP, { on: true, d: { id: -1, name: t.title }, seasons: [], season: null, episode: null, key: '', tr: null, torr: false, secs: [], prev:null, scrub:null, qualityApplied:false, aoAudioIndex:null, mode: 'play', menu: '', st: { p: 0, d: 0, pl: false, b: true, w: true }, lastSave: 0, subApplied: '1', audioNames: [] });
  npEnsureDom(); npShow();
  $('#np .np-load').classList.remove('hidden'); $('#np .np-load span').textContent = t.sport ? 'Загружаем видео…' : 'Загружаем трейлер…';
  $('#np .np-title b').textContent = t.title; $('#np .np-title span').textContent = t.sport ? (t.live ? 'Прямой эфир · Rutube' : 'Спорт · Rutube') : 'Трейлер';
  closeNpMenu(true); renderNpButtons(); npOsd(5000);
  try {
    const r = await fetch(tvPx(`https://rutube.ru/api/play/options/${t.id}/?no_404=true&referer=${encodeURIComponent('https://rutube.ru')}`, NP_UA, 'https://rutube.ru/', true));
    const o = await r.json(); if(o.acl_access?.allowed===false)throw new Error('ACCESS'); const m3u8 = o.video_balancer?.m3u8 || o.live_streams?.hls?.find(x=>x.is_video!==false)?.url;
    if (token !== NP.token) return;
    const u=new URL(m3u8);if(u.protocol!=='https:'||!(u.hostname==='bl.rutube.ru'||u.hostname.endsWith('.rtbcdn.ru')))throw new Error('NO_STREAM');
    NATIVE.npStart(JSON.stringify({subtitleShiftMs:npSubShift*1000, url: m3u8, ua: NP_UA, referer: 'https://rutube.ru/', startMs: 0, subs: [] }));
  } catch { if (token !== NP.token) return; npClose(true); if(t.sport)toast('Не удалось открыть видео Rutube');else {toast('Трейлер не открылся, пробуем плеер Rutube');openTrailerWeb(t);} }
}

function npApplyAoAudio() {
  let tr;try{tr=JSON.parse(NATIVE.npTracks())}catch{return;}
  const audio=(tr.audio||[]).slice().sort((a,b)=>a.i-b.i), a=audio[NP.aoAudioIndex];
  if(!a)return; NP.aoAudioIndex=null; if(!a.sel) NATIVE.npSelect('audio',a.g,a.t);
}
let aoResolveRequestId=0,aoPlayRequestId=0;
const aoResolvePending=new Map();
window.lumaAoResolveResult=(id,result)=>{const pending=aoResolvePending.get(Number(id));if(!pending)return;aoResolvePending.delete(Number(id));clearTimeout(pending.timer);pending.resolve(result&&typeof result==='object'?result:{error:'NETWORK'});};
function aoResolveAsync(payload){return new Promise(resolve=>{const id=++aoResolveRequestId,timer=setTimeout(()=>{aoResolvePending.delete(id);resolve({error:'NETWORK'});},30000);aoResolvePending.set(id,{resolve,timer});try{NATIVE.aoResolveAsync(JSON.stringify(payload),id);}catch{clearTimeout(timer);aoResolvePending.delete(id);resolve({error:'NETWORK'});}});}
let aoLoginRequestId=0;
const aoLoginPending=new Map();
window.lumaAoLoginResult=(id,result)=>{const pending=aoLoginPending.get(Number(id));if(!pending)return;aoLoginPending.delete(Number(id));clearTimeout(pending.timer);pending.resolve(result&&typeof result==='object'?result:{error:'NETWORK'});};
function aoLoginSavedAsync(){return new Promise(resolve=>{const id=++aoLoginRequestId,timer=setTimeout(()=>{aoLoginPending.delete(id);resolve({error:'NETWORK'});},30000);aoLoginPending.set(id,{resolve,timer});try{NATIVE.aoLoginSavedAsync(id);}catch{clearTimeout(timer);aoLoginPending.delete(id);resolve({error:'NETWORK'});}});}
async function playAnimeOn(d,seasons,season,episode,opts={}) {
  NP.kodik=null; NP.rutube = false;
  NP.seek.held=false; NP.seek.since=0;
  const ep=Number(episode||1), available=d._ao.selfHosted?.translations?.[String(ep)]||[];
  const prefs=tvX().aoVoices=tvX().aoVoices||{}, synced=tvAoWatchPref(d).voice, remembered=synced||prefs[d.id];
  const preferred=opts.voice || (available.includes(remembered)?remembered:available.find(v=>v!=='jap')||available[0]);let voice=preferred;
  if(!voice){openAnimeReserve(d,seasons,season,episode,'В AnimeOn 2.0 эта серия пока недоступна');return;}
  const request=++aoPlayRequestId,token=NP.token,initialRoute=route;
  const stale=()=>request!==aoPlayRequestId||token!==NP.token||route!==initialRoute;
  const status=JSON.parse(NATIVE.aoStatus()); if(!status.connected){toast('Подключаем AnimeOn…');const login=await aoLoginSavedAsync();if(stale())return;if(!login.ok){openAnimeReserve(d,seasons,season,episode,login.error==='NETWORK'?'Не удалось подключиться к AnimeOn':'Подключите AnimeOn для плеера 2.0');return;}}
  toast('Загружаем AnimeOn 2.0…'); await wait(30);
  if(stale())return;
  let result;const candidates=opts.voice?[voice]:[...new Set([voice,...available.filter(v=>v!=='jap'),...available])].slice(0,4);
  for(const candidate of candidates){result=await aoResolveAsync({animeId:d._ao.animeId,episode:ep,translation:candidate});if(stale())return;if(result.url){voice=candidate;break;}if(['AUTH_REQUIRED','DEVICE_REGISTRATION_FAILED','NETWORK'].includes(result.error))break;}
  if(!result?.url){if(opts.voice&&NP.on){toast('Эта озвучка сейчас недоступна');return;}openAnimeReserve(d,seasons,season,episode,result?.error==='AUTH_REQUIRED'?'Войдите в AnimeOn заново':'Не удалось открыть серию AnimeOn 2.0');return;}
  const key=progKey(d.id,season,episode), resume=opts.fromStart?null:resumeInfo(d.id,season,episode);
  const officialSkips=(Array.isArray(result.skips)?result.skips:[]).filter(x=>['op','ed'].includes(x.type)&&Number.isFinite(x.start)&&Number.isFinite(x.end)&&x.start>=0&&x.end>x.start&&x.end-x.start<=300&&(!result.duration||x.end<=result.duration+1));
  const preserveSubShift=NP.on;
  ++NP.token; Object.assign(NP,{on:true,scrub:null,d,seasons,season,episode,key,tr:null,torr:false,secs:officialSkips,mode:'play',menu:'',st:{p:0,d:0,pl:false,b:true,w:true},lastSave:0,subApplied:'',qualityApplied:false,aoVoice:voice,aoAudioIndex:Number(result.audioIndex)||0});
  prefs[d.id]=voice;if(opts.voice||!synced)tvAoWatchPrefSet(d,{voice});d._aoSelectedVoice=voice;addHistory(d,season,episode);save();npEnsureDom();npShow(preserveSubShift);
  $('#np .np-load').classList.remove('hidden');$('#np .np-load span').textContent='Загружаем…';$('#np .np-title b').textContent=d.name;$('#np .np-title span').textContent='Серия '+ep+' · AnimeOn 2.0';closeNpMenu(true);npOsd(6000);
  NATIVE.npStart(JSON.stringify({subtitleShiftMs:npSubShift*1000,url:result.url,ua:NP_UA,referer:'https://animeon.cc/',startMs:opts.restoreState?.startMs ?? opts.startMs ?? (resume?Math.floor(resume.t*1000):0),playing:opts.restoreState?.playing ?? true,speed:opts.restoreState?.speed ?? 1,subs:[]}));renderNpButtons();
}

window.lumaKodikManifest=url=>{const current=playing;if(!current||current.d?._aoSource!=='reserve'||!playerOpen())return;window.playKodikDirect?.({url,frameUrl:plFrame.src},current);};
window.playKodikDirect=async(m,current)=>{
  if(current.kodikResolving||!playerOpen())return;
  let u,a,b;try{u=new URL(m.url);a=new URL(m.frameUrl);b=new URL(plFrame.src);if(u.protocol!=='https:'||!/(^|\.)solodcdn\.com$/i.test(u.hostname)||!/^\/(?:useruploads|animetvseries)\/.+\/(?:240|360|480|720|1080|1440|2160)\.mp4:hls:manifest(?:-v[0-9]+-a[0-9]+)?\.m3u8$/i.test(u.pathname)||a.hostname!==b.hostname||a.pathname!==b.pathname)return;}catch{return;}
  current.kodikResolving=true;
  const candidates=[240,360,480,720,1080,1440,2160];
  const levels=(await Promise.all(candidates.map(async quality=>{const url=m.url.replace(/\/(?:240|360|480|720|1080|1440|2160)\.mp4:hls:/i,'/'+quality+'.mp4:hls:'),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);try{const r=await fetch(tvPx(url,NP_UA,'https://kodikplayer.com/',true),{signal:controller.signal});if(!r.ok)return null;const text=await r.text();return text.startsWith('#EXTM3U')?{quality,url}:null;}catch{return null;}finally{clearTimeout(timer);}}))).filter(Boolean);
  if(playing!==current||!playerOpen())return;current.kodikResolving=false;if(!levels.length)return;
  const pref=Number(npPrefs().quality)||0,captured=Number(u.pathname.match(/\/(\d+)\.mp4:hls:/i)?.[1])||0;
  const target=pref?(levels.filter(x=>x.quality<=pref).pop()||levels[0]):(levels.find(x=>x.quality===captured)||levels[0]);
  const {d,seasons,season,episode,key}=current,resume=resumeInfo(d.id,season,episode),restore=current.restoreState,pos=restore?restore.startMs/1000:(resume?.t||current.resumeT||0),voice=d._aoSelectedVoice||'';
  $('#player').classList.add('hidden');$('#plPick').classList.add('hidden');plFrame.src='about:blank';playing=null;adActive=false;
  NP.rutube=false;NP.seek.held=false;NP.seek.since=0;++NP.token;
  Object.assign(NP,{on:true,d,seasons,season,episode,key,tr:null,torr:false,secs:[],skipRequested:false,prev:null,scrub:null,qualityApplied:true,aoAudioIndex:null,kodik:{levels,quality:target.quality,voice},mode:'play',menu:'',st:{p:0,d:0,pl:false,b:true,w:true},lastSave:0,subApplied:'',audioNames:[]});
  npEnsureDom();npShow();$('#np .np-load').classList.remove('hidden');$('#np .np-load span').textContent='Загружаем…';$('#np .np-title b').textContent=d.name;$('#np .np-title span').textContent='Серия '+episode+' · Резерв';closeNpMenu(true);renderNpButtons();npOsd(5000);
  NATIVE.npStart(JSON.stringify({subtitleShiftMs:npSubShift*1000,url:target.url,ua:NP_UA,referer:'https://kodikplayer.com/',startMs:Math.floor(pos*1000),playing:restore?.playing ?? true,speed:restore?.speed ?? 1,subs:[]}));
  if(d._ao?.shikimori)NP.kodikSkipRequested=false;
};

function openAnimeReserve(d,seasons,season,episode,message='Резервный плеер') {
  const ep=String(episode||1), choices=(d._ao?.voiceNames||[]).filter(v=>d._ao.voices[v]?.[ep]);
  if(!choices.length){toast(message+' · резерв для этой серии отсутствует');return;}
  window.aoReserveContext={d,seasons,season,episode};
  dlg('<h3>'+esc(message)+'</h3><p class="sub">Выберите озвучку для серии '+esc(ep)+'</p><div class="cmenu">'+choices.map(v=>'<button class="btn f" tabindex="-1" data-aoreservevoice="'+esc(v)+'" data-k="ao-reserve:'+esc(v)+'">'+esc(v)+'</button>').join('')+'</div>');
}
function playAnimeReserve(d,seasons,season,episode,opts={}) {
  const ep=String(episode||1), voices=d._ao.voices||{}, pref=opts.voice||d._aoSelectedVoice, voice=voices[pref]?.[ep]?pref:(d._ao.voiceNames||[]).find(v=>voices[v]?.[ep]);
  if(!voice){toast('В резервном плеере нет этой серии');return;}
  const url=voices[voice][ep];try {if(new URL(url).protocol!=='https:')throw Error('url');}catch{toast('Неверный адрес резервного плеера');return;}
  const item={...d,iframe_uri:url,_aoSource:'reserve',_aoSelectedVoice:voice};if(opts.voice||!tvAoWatchPref(d).voice)tvAoWatchPrefSet(d,{voice});
  delete item._rutube; delete item._vk;
  if(NP.on)npClose(true);toast('Резервный плеер · '+voice);return npOrigPlayItem(item,seasons,season,episode,opts);
}
document.addEventListener('click',e=>{const el=e.target.closest('[data-aoreservevoice]');if(!el || !window.aoReserveContext)return;const ctx=window.aoReserveContext;window.aoReserveContext=null;const voice=el.dataset.aoreservevoice;closeDlg();tvAoWatchPrefSet(ctx.d,{mode:'reserve',voice});playAnimeReserve(ctx.d,ctx.seasons,ctx.season,ctx.episode,{voice});});

function openReserveControls() {
  if(!playing?.d?._ao || playing.d._aoSource!=='reserve')return;plFrame.blur();window.focus();
  dlg('<h3>Резервный плеер</h3><p class="sub">Серия '+esc(playing.episode||1)+' · '+esc(playing.d._aoSelectedVoice||'')+'</p><div class="cmenu"><button class="btn f" tabindex="-1" data-reservecontrol="episodes" data-k="reserve:episodes">Серии</button><button class="btn f" tabindex="-1" data-reservecontrol="voices" data-k="reserve:voices">Озвучка</button><button class="btn f" tabindex="-1" data-reservecontrol="quality" data-k="reserve:quality">Качество</button><button class="btn f" tabindex="-1" data-reservecontrol="close" data-k="reserve:close">Продолжить просмотр</button></div>');
}
document.addEventListener('click',e=>{const el=e.target.closest('[data-reservecontrol]');if(!el||!playing)return;const action=el.dataset.reservecontrol, current=playing;closeDlg();if(action==='episodes')openPick();else if(action==='voices')openAnimeReserve(current.d,current.seasons,current.season,current.episode,'Выберите озвучку');else if(action==='quality') { plFrame.focus();plFrame.contentWindow?.postMessage({lumaCmd:'quality-list'},'*'); } else plFrame.focus();});

function showReserveQuality(data){const options=[...new Set((data.values||[]).map(Number).filter(x=>x>0))].sort((a,b)=>b-a);plFrame.blur();window.focus();if(!options.length){toast('Качество не удалось определить');plFrame.focus();return;}dlg('<h3>Качество</h3><div class="cmenu">'+options.map(n=>'<button class="btn f" tabindex="-1" data-reservequality="'+n+'" data-k="reserve:q:'+n+'">'+n+'p'+(n===data.current?' ✓':'')+'</button>').join('')+'</div>');}
document.addEventListener('click',e=>{const el=e.target.closest('[data-reservequality]');if(!el)return;const value=Number(el.dataset.reservequality);closeDlg();plFrame.contentWindow?.postMessage({lumaCmd:'quality-set',value},'*');npPrefs().quality=value;save();plFrame.focus();});
