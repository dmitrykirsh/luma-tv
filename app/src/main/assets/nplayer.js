const sprites = new Map();
'use strict';
/* ================= Плеер для ТВ: поток берётся со страницы плеера сайта, играет нативный ExoPlayer,
   а кнопки, серии и меню (звук, субтитры, качество, скорость) рисует этот интерфейс ================= */
const NP_UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const NP = { on: false, d: null, seasons: [], season: null, episode: null, key: '', data: null, src: null, st: { p: 0, d: 0, pl: false, b: false, w: false }, mode: 'play', menu: '', osdT: 0, ctlT: 0, lastSave: 0, tr: null, secs: [], seek: { t: 0, step: 10 }, token: 0, audioNames: [], subApplied: '' };
const npActive = () => NP.on;
window.npActive = npActive;
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
  const sIdx = html.indexOf('seasons:[');
  if (sIdx >= 0) {
    const raw = jsonAt(html, sIdx + 'seasons:'.length, '[', ']');
    if (raw) { try { out.seasons = JSON.parse(raw); } catch {} }
    if (out.seasons) for (const s of out.seasons) if (s.episodes) s.episodes.sort((x, y) => Number(x.episode) - Number(y.episode));   // серии иногда приходят вперемешку
    if (out.seasons) for (const s of out.seasons) for (const e of s.episodes || []) { e.hls = fix(e.hls); e.dasha = fix(e.dasha); e.dash = fix(e.dash); e.prev = e.preview && e.preview.src ? parsePreview(JSON.stringify(e.preview)) : null; }
  }
  if (!out.seasons) {
    const mi = html.lastIndexOf('makePlayer({'); const seg = mi >= 0 ? html.slice(mi) : html;
    const hls = (seg.match(/hls:\s*"([^"]+)"/) || [])[1];
    const dash = (seg.match(/\bdash:\s*"([^"]+)"/) || [])[1];
    const part = (re, o, c) => { const m = seg.match(re); if (!m) return null; const raw = jsonAt(seg, m.index + m[0].length - 1, o, c); try { return raw ? JSON.parse(raw) : null; } catch { return null; } };
    out.movie = { prev: parsePreview((html.match(/preview:\s*\{[\s\S]*?pad:\s*\d+\s*\}/) || [])[0]), hls: fix(hls), dash: fix(dash), dasha: fix((seg.match(/dasha:\s*"([^"]+)"/) || [])[1]), audio: part(/audio:\s*\{/, '{', '}') || { names: [], order: [] }, cc: part(/cc:\s*\[/, '[', ']') || [], sections: part(/sections:\s*\[/, '[', ']') || [], duration: Number((seg.match(/duration:\s*(\d+)/) || [])[1]) || 0 };
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
      if (v.seasons || (v.movie && v.movie.hls)) { npCache.set(ck, { t: Date.now(), v }); return v; }
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
  const key = progKey(d.id, season, episode);
  const resume = opts.fromStart ? null : resumeInfo(d.id, season, episode);
  const token = ++NP.token;
  Object.assign(NP, { on: true, scrub: null, d, seasons, season, episode, key, tr: null, secs: [], mode: 'play', menu: '', st: { p: 0, d: 0, pl: false, b: true, w: true }, lastSave: 0, subApplied: '' });
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
  if (!src || !src.hls) { npFail('Для этой серии нет потока'); return; }
  NP.prev = src.prev || null; NP.scrub = null; if (NP.prev) { const P = NP.prev, cnt = Math.min(6, Math.ceil((NP.st.d || 0) / 1000 / P.interval / P.size) || 1); for (let i = 0; i < cnt; i++) { const u = P.src.replace('${spriteNum}', P.first + i); if (!sprites.has(u)) { new Image().src = u; sprites.set(u, 1); } } } NP.src = src; NP.secs = (src.sections || []).filter((x) => x.skip);
  NP.audioNames = (src.audio && src.audio.names) || [];
  const subs = (src.cc || []).map((c) => ({ url: c.url, name: c.name, lang: /eng|англ/i.test(c.name) ? 'en' : /рус|rus/i.test(c.name) ? 'ru' : '' }));
  if (resume) toast('Продолжаем с ' + fmtTime(resume.t));
  // 1080p есть только в DASH (VP9); HLS сайта отдаёт максимум 720p. DASH берём, если телевизор умеет VP9 аппаратно
  const urls = []; try { if (src.dash && NATIVE.npVp9 && NATIVE.npVp9()) urls.push(src.dash); if (src.dasha && NATIVE.npAv1 && NATIVE.npAv1()) urls.push(src.dasha); } catch {}
  urls.push(src.hls);
  NATIVE.npStart(JSON.stringify({ url: urls[0], urls, ua: NP_UA, referer: 'https://liftw.ws/', startMs: resume ? Math.floor(resume.t * 1000) : 0, subs }));
  renderNpButtons();
}
function npFail(msg) {
  toast(msg + ' — открываем плеер сайта');
  const { d, seasons, season, episode } = NP;
  npClose(true);
  if (npOrigPlayItem) npOrigPlayItem(d, seasons, season, episode);
}
window.playItem = function (d, seasons, season, episode, opts) {
  if (NATIVE && NATIVE.npStart) return playItemNative(d, seasons, season, episode, opts);
  return npOrigPlayItem(d, seasons, season, episode, opts);
};

function npClose(silent) {
  if (!NP.on) return;
  try { if (NP.st.d > 120) storeProgress(NP.key, NP.st.p / 1000, NP.st.d / 1000); } catch {}
  NP.on = false; NP.token++; clearTimeout(NP.osdT); clearTimeout(NP.ctlT);
  try { if (window.syncAfterPlay) syncAfterPlay(); } catch {}
  try { NATIVE.npStop(); } catch {}
  document.body.classList.remove('np');
  $('#np')?.classList.add('hidden'); closeNpMenu(true);
  if (silent) return;
  if (route.name === 'details') show(route, { scroll: view.scrollTop, focus: 'watch' }); else focusFirst();
}

/* ---------- состояние от плеера ---------- */
window.npState = (s) => {
  if (!NP.on) return;
  NP.st = s;
  const p = s.p / 1000, d = s.d / 1000;
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
  if (ev === 'ready') { $('#np .np-load').classList.add('hidden'); npApplyPrefs(); }
  else if (ev === 'ended') { storeProgress(NP.key, 1e9, 1e9); if (!npNext(1)) npClose(); }
  else if (ev === 'fallback') toast('Видео 1080p не запустилось, включаем обычный поток')
  else if (ev === 'error') npFail('Ошибка воспроизведения' + (msg ? ' (' + msg + ')' : ''));
  else if (ev === 'tracks') { if (NP.menu) renderNpMenu(); }
};
function npSkipCheck(p) {
  const btn = $('#np .np-skip'); if (!btn) return;
  const sec = NP.secs.find((x) => p >= x.start && p < x.end - 1);
  if (!sec) { btn.classList.add('hidden'); NP.skipSec = null; return; }
  NP.skipSec = sec;
  const next = sec.type === 'titer';
  if (next && !npHasNext()) { btn.classList.add('hidden'); NP.skipSec = null; return; }
  $('span', btn).textContent = next ? 'Следующая серия' : 'Пропустить заставку';
  btn.classList.remove('hidden');
}
function npDoSkip() {
  const s = NP.skipSec; if (!s) return false;
  if (s.type === 'titer') { if (!npNext(1)) return false; } else NATIVE.npCmd('seekTo', s.end * 1000);
  $('#np .np-skip').classList.add('hidden'); NP.skipSec = null; return true;
}

/* ---------- серии ---------- */
function npList() { const out = []; for (const s of NP.seasons) for (const e of s.episodes) out.push([s.season, e]); return out; }
function npHasNext() { if (!NP.season) return false; const l = npList(); const i = l.findIndex(([s, e]) => String(s) === String(NP.season) && String(e) === String(NP.episode)); return i >= 0 && i < l.length - 1; }
function npNext(dir) {
  if (!NP.season) return false;
  const l = npList(); const i = l.findIndex(([s, e]) => String(s) === String(NP.season) && String(e) === String(NP.episode));
  const n = l[i + dir]; if (!n) return false;
  playItemNative(NP.d, NP.seasons, n[0], n[1]); return true;
}

/* ---------- настройки по умолчанию: озвучка и субтитры запоминаются ---------- */
const npPrefs = () => (tvX().player = tvX().player || {});
function npAudioName(a) {
  const m = String(a.name || '').match(/(\d+)\s*$/); const idx = m ? Number(m[1]) : (/^\d+$/.test(String(a.name || '')) || a.name ? -1 : a.i);
  const nm = NP.audioNames[idx >= 0 ? idx : a.i];
  const lang = { ru: 'Русский', uk: 'Украинский', en: 'English' }[String(a.lang || '').slice(0, 2)] || '';
  return nm ? `${nm}` + (lang ? ` · ${lang}` : '') : (a.name || lang || 'Дорожка ' + (a.i + 1));
}
function npApplyPrefs() {
  let tr; try { tr = JSON.parse(NATIVE.npTracks()); } catch { return; }
  const pf = npPrefs();
  if (pf.audio) { const a = (tr.audio || []).find((x) => npAudioName(x) === pf.audio && !x.sel); if (a) NATIVE.npSelect('audio', a.g, a.t); }
  if (pf.sub && NP.subApplied !== NP.key) { const t = (tr.text || []).find((x) => x.name === pf.sub); if (t) NATIVE.npSelect('text', t.g, t.t); }
  NP.subApplied = NP.key;
}

/* ---------- интерфейс ---------- */
const NPI = {
  play: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z"/></svg>', pause: '<svg viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M11 5L4 12l7 7M20 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  fwd: '<svg viewBox="0 0 24 24"><path d="M13 5l7 7-7 7M4 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};
function npEnsureDom() {
  if ($('#np')) return;
  $('#stage').insertAdjacentHTML('beforeend', `<div id="np" class="hidden"><div class="np-load"><div class="spin"></div><span>Загружаем…</span></div><div class="np-buf hidden"><div class="spin"></div></div>
    <div class="np-skip hidden"><button class="btn primary f" tabindex="-1" data-np="skip" data-k="npskip"><span></span></button></div>
    <div class="np-osd hidden"><div class="pclk"></div><div class="np-title"><b></b><span></span></div>
      <div class="np-bar"><i class="pos"></i><i class="mark"></i><div class="np-thumb hidden"><div class="img"></div><span></span></div><span class="t0">0:00</span><span class="t1">0:00</span></div><div class="np-btns" id="npBtns"></div><div class="np-hint">◀ ▶ перемотка · OK пауза · ▲ меню</div></div>
    <div class="np-sub"></div><div class="np-menu hidden" id="npMenu"></div></div>`);
}
/* ---------- субтитры: рисуем сами (как в плеере Luma для ПК), размер выбирается в меню «Субтитры» ---------- */
const NP_SUB_SIZES = [['s', 'Мелкие'], ['m', 'Обычные'], ['l', 'Крупные']];
function npApplySubSize() { const el = $('#np'); if (el) el.dataset.sub = npPrefs().subSize || 'm'; }
let npSubLast = null;
window.npCue = (t) => {
  if (t === npSubLast) return; npSubLast = t;
  const el = $('#np .np-sub'); if (!el) return;
  const h = esc(t || '').replace(/\r?\n/g, '<br>');
  el.innerHTML = h ? `<span>${h}</span>` : ''; el.classList.toggle('on', !!h);
};
/* значения на кнопках: что сейчас выбрано (звук, субтитры, качество, скорость) */
function npPaintChips() {
  let tr = {}; try { tr = JSON.parse(NATIVE.npTracks()); } catch { return; }
  const set = (a, label, val) => { const b = $(`[data-np=${a}]`); if (b) b.innerHTML = esc(label) + (val ? ` <em>${esc(val)}</em>` : ''); };
  const aud = (tr.audio || []).find((x) => x.sel), txt = (tr.text || []).find((x) => x.sel);
  set('audio', 'Звук', aud ? npAudioName(aud) : '');
  set('subs', 'Субтитры', tr.textOff || !txt ? 'выкл' : String(txt.name || '').replace(/\s*-\s*\d+$/, ''));
  set('quality', 'Качество', tr.autoVideo ? 'авто' + (NP.st.vh ? ' · ' + NP.st.vh + 'p' : '') : (NP.st.vh ? NP.st.vh + 'p' : ''));
  set('speed', 'Скорость', Math.abs((tr.speed || 1) - 1) < 0.01 ? '' : (tr.speed || 1) + '×');
}
function renderNpButtons() {
  const ep = !!NP.season;
  $('#npBtns').innerHTML = `${ep ? `<button class="npb f" tabindex="-1" data-np="prev" data-k="npb:prev" title="Предыдущая серия">⏮</button>` : ''}
    <button class="npb f" tabindex="-1" data-np="back10" data-k="npb:b" title="−10 с">${NPI.back}</button>
    <button class="npb big f" tabindex="-1" data-np="toggle" data-k="npb:t">${NP.st.w ? NPI.pause : NPI.play}</button>
    <button class="npb f" tabindex="-1" data-np="fwd10" data-k="npb:f" title="+10 с">${NPI.fwd}</button>
    ${ep ? `<button class="npb f" tabindex="-1" data-np="next" data-k="npb:n" title="Следующая серия">⏭</button>` : ''}
    <span class="npsp"></span>
    ${ep ? '<button class="npb txt f" tabindex="-1" data-np="eps" data-k="npb:eps">Серии</button>' : ''}
    <button class="npb txt f" tabindex="-1" data-np="audio" data-k="npb:a">Звук</button>
    <button class="npb txt f" tabindex="-1" data-np="subs" data-k="npb:s">Субтитры</button>
    <button class="npb txt f" tabindex="-1" data-np="quality" data-k="npb:q">Качество</button>
    <button class="npb txt f" tabindex="-1" data-np="speed" data-k="npb:sp">Скорость</button>`;
}
function npShow() { $('#np').classList.remove('hidden'); document.body.classList.add('np'); npApplySubSize(); npSubLast = null; window.npCue(''); }
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
  NP.menu = kind; NP.mode = 'menu'; clearTimeout(NP.ctlT); npOsd(60000);
  $('#npMenu').classList.remove('hidden'); renderNpMenu(true);
}
function closeNpMenu(silent) {
  NP.menu = ''; const m = $('#npMenu'); if (m) { m.classList.add('hidden'); m.innerHTML = ''; }
  if (!silent) { NP.mode = 'ctl'; ($(`[data-np=${NP.lastBtn}]`) || $('[data-np=toggle]'))?.focus({ preventScroll: true }); clearTimeout(NP.ctlT); NP.ctlT = setTimeout(npLeaveCtl, 9000); }
}
function renderNpMenu(focusCur) {
  const box = $('#npMenu'); if (!box || !NP.menu) return;
  let tr = {}; try { tr = JSON.parse(NATIVE.npTracks()); } catch {}
  let html = '', title = '';
  const row = (label, sel, attrs, sub) => `<button class="nm-r f ${sel ? 'on' : ''}" tabindex="-1" ${attrs} data-k="nm:${esc(attrs)}"><i>${sel ? '✓' : ''}</i><span>${esc(label)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}</button>`;
  if (NP.menu === 'audio') {
    title = 'Звук';
    const list = (tr.audio || []).slice().sort((a, b) => a.i - b.i);
    html = list.length ? list.map((a) => row(npAudioName(a), a.sel, `data-nsel="audio" data-g="${a.g}" data-t="${a.t}" data-pref="${esc(npAudioName(a))}"`, a.ch > 2 ? '5.1' : '')).join('') : '<div class="nm-e">Дорожек нет</div>';
  } else if (NP.menu === 'subs') {
    title = 'Субтитры';
    const list = tr.text || [];
    html = row('Выключены', tr.textOff || !list.some((x) => x.sel), 'data-nsel="text" data-g="-1" data-t="0" data-pref=""') + list.map((s) => row(s.name || 'Субтитры ' + (s.i + 1), s.sel && !tr.textOff, `data-nsel="text" data-g="${s.g}" data-t="${s.t}" data-pref="${esc(s.name)}"`)).join('');
    if (!list.length) html += '<div class="nm-e">Для этого видео субтитров нет</div>';
    html += '<h4 class="nm-h">Размер</h4>' + NP_SUB_SIZES.map(([k, l]) => row(l, (npPrefs().subSize || 'm') === k, `data-nsize="${k}"`)).join('');
  } else if (NP.menu === 'quality') {
    title = 'Качество' + (NP.st.vh ? ' · сейчас ' + NP.st.vh + 'p' : '');
    const seenH = new Set(), list = (tr.video || []).slice().sort((a, b) => b.h - a.h || Number(b.sel) - Number(a.sel)).filter((v) => { if (seenH.has(v.h)) return false; seenH.add(v.h); v.sel = (tr.video || []).some((x) => x.h === v.h && x.sel); return true; });
    html = row('Авто', tr.autoVideo, 'data-nsel="video" data-g="-1" data-t="0"') + list.map((v) => row(v.h + 'p', v.sel && !tr.autoVideo, `data-nsel="video" data-g="${v.g}" data-t="${v.t}"`, v.br ? (v.br / 1e6).toFixed(1) + ' Мбит/с' : '')).join('');
  } else if (NP.menu === 'speed') {
    title = 'Скорость';
    html = NP_SPEEDS.map((x) => row(x === 1 ? 'Обычная' : x + '×', Math.abs((tr.speed || 1) - x) < 0.01, `data-nspeed="${x}"`)).join('');
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
    else if (['eps', 'audio', 'subs', 'quality', 'speed'].includes(a)) openNpMenu(a);
    return;
  }
  if (el.dataset.nsize) { npPrefs().subSize = el.dataset.nsize; save(); npApplySubSize(); renderNpMenu(false); $(`.nm-r[data-nsize="${el.dataset.nsize}"]`)?.focus({ preventScroll: true }); return; }
  if (el.dataset.nsel) {
    NATIVE.npSelect(el.dataset.nsel, +el.dataset.g, +el.dataset.t);
    if (el.dataset.nsel === 'audio') npPrefs().audio = el.dataset.pref;
    if (el.dataset.nsel === 'text') npPrefs().sub = el.dataset.pref;
    save(); setTimeout(() => closeNpMenu(), 150); return;
  }
  if (el.dataset.nspeed) { NATIVE.npCmd('speed', +el.dataset.nspeed); setTimeout(() => closeNpMenu(), 150); return; }
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
  if (NP.mode === 'menu') { return false; }
  if (NP.mode === 'ctl') {
    clearTimeout(NP.ctlT); NP.ctlT = setTimeout(npLeaveCtl, 9000); npOsd(60000);
    if (k === 'ArrowDown') { npLeaveCtl(); e.preventDefault(); return true; }
    return false;
  }
  // режим просмотра: стрелки перематывают, OK — пауза, ▲ — кнопки
  if (k === 'ArrowLeft' || k === 'ArrowRight') {
    const dir = k === 'ArrowRight' ? 1 : -1, now = Date.now();
    NP.seek.step = now - NP.seek.t < 500 ? Math.min(NP.seek.step * 1.5, 180) : 10; NP.seek.t = now;
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
window.npBack = () => {
  if (!NP.on) return false;
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
  const token = ++NP.token;
  Object.assign(NP, { on: true, d: { id: -1, name: t.title }, seasons: [], season: null, episode: null, key: '', tr: null, secs: [], mode: 'play', menu: '', st: { p: 0, d: 0, pl: false, b: true, w: true }, lastSave: 0, subApplied: '1', audioNames: [] });
  npEnsureDom(); npShow();
  $('#np .np-load').classList.remove('hidden'); $('#np .np-load span').textContent = 'Загружаем трейлер…';
  $('#np .np-title b').textContent = t.title; $('#np .np-title span').textContent = 'Трейлер';
  closeNpMenu(true); renderNpButtons(); npOsd(5000);
  try {
    const r = await fetch(tvPx(`https://rutube.ru/api/play/options/${t.id}/?no_404=true&referer=${encodeURIComponent('https://rutube.ru')}`, NP_UA, 'https://rutube.ru/', true));
    const o = await r.json(); const m3u8 = o.video_balancer && (o.video_balancer.m3u8 || o.video_balancer.default);
    if (token !== NP.token) return;
    if (!m3u8) throw new Error('NO_STREAM');
    NATIVE.npStart(JSON.stringify({ url: m3u8, ua: NP_UA, referer: 'https://rutube.ru/', startMs: 0, subs: [] }));
  } catch { if (token !== NP.token) return; npClose(true); toast('Трейлер не открылся, пробуем плеер Rutube'); openTrailerWeb(t); }
}
