'use strict';
/* ================= Торренты: поиск раздач через публичный Jackett-прокси (jac.red, как в NUM) и воспроизведение
   локальным сервером TorrServe (127.0.0.1:8090). Luma только клиент: добавляет magnet, ждёт буфер и отдаёт
   поток нативному плееру. Сервер не вшит: приложение TorrServe ставится из настроек, как это делает NUM ================= */
window.RENDER = window.RENDER || {};

/* ---------- состояние сервера ---------- */
const TR = { st: null, stAt: 0, token: 0 };
async function trState(force) {
  if (!force && TR.st && Date.now() - TR.stAt < 5000) return TR.st;
  TR.stAt = Date.now();
  try { TR.st = JSON.parse(NATIVE.torrState()); } catch { TR.st = { installed: false, running: false }; }
  return TR.st;
}
async function trApi(path, method, body) {
  const r = NATIVE.torrApi(path, method || 'GET', body || '');
  let j; try { j = JSON.parse(r); } catch { j = { error: 'bad json' }; }
  if (j && j.error) throw new Error(j.error);
  return j;
}

/* ---------- поиск раздач (jac.red: Jackett API, ключ не нужен; сервер капризный к UA и частоте) ---------- */
const TR_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
let trSearchSeq = 0;
async function trSearchOne(q) {
  const u = 'https://jac.red/api/v2.0/indexers/all/results?apikey=&Query=' + encodeURIComponent(q);
  let last;
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(tvPx(u, TR_UA, '', true));
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      return (j.Results || []).filter((x) => x.MagnetUri || x.Link);
    } catch (e) { last = e; if (a < 2) await wait(6000); }
  }
  throw last;
}
async function trSearch(d, inf) {
  const y = d.year || (inf && inf.year) || '';
  const qs = [...new Set([`${d.name} ${y}`.trim(), `${d.origin_name || ''} ${y}`.trim(), d.name].filter((x) => x.trim().length > 1))];
  if (TRS.season) {
    qs.unshift(`${d.name} ${TRS.season} сезон`);
    if (d.origin_name) qs.unshift(`${d.origin_name} season ${TRS.season}`);
  }
  for (const q of qs) {
    const r = await trSearchOne(q);
    if (r.length) return r;
  }
  return [];
}

/* ---------- разбор названия раздачи: качество, звук, бейджи ---------- */
function trBadges(t) {
  const s = ' ' + t + ' ', out = [];
  const has = (re) => re.test(s);
  if (has(/\b(2160p|4k[\s,]|uhd)\b/i) || has(/3840x/)) out.push('4K');
  else if (has(/\b1080p\b/i) || has(/1920x/)) out.push('FHD');
  else if (has(/\b720p\b/i) || has(/1280x/)) out.push('HD');
  else if (has(/\b(480p|dvdr?ip)\b/i)) out.push('DVD');
  if (has(/\bhdr10\+\b/i)) out.push('HDR10+');
  else if (has(/\b(hdr10|hdr)\b/i)) out.push('HDR');
  if (has(/\b(dv|dolby[ -]?vision)\b/i)) out.push('DV');
  if (has(/\b(hevc|x265|h265)\b/i)) out.push('HEVC');
  else if (has(/\b(x264|h264|avc)\b/i)) out.push('AVC');
  if (has(/\bremux\b/i)) out.push('Remux');
  if (has(/\b(bdrip|bd-rip|blu[ -]?ray)\b/i)) out.push('BDRip');
  else if (has(/\bweb[ -]?(dl|rip)\b/i)) out.push('WEB-DL');
  else if (has(/\b(ts|tc)\b(?![\w])/) || has(/\bhdrip\b/i)) out.push('TS');
  const dub = [];
  if (has(/(дб|дубляж|dub(bed)?)\b/i)) dub.push('Дубляж');
  if (has(/\bпм\b/i)) dub.push('ПМ');
  if (has(/\bло\b/i)) dub.push('ЛО');
  if (has(/\b(ап|авторский перевод)\b/i)) dub.push('АП');
  if (has(/\b(любительский|многоголос|двухголос|vo)\b/i)) dub.push('Перевод');
  return { tech: out.slice(0, 5), dub: dub.slice(0, 4) };
}
const trRus = (t) => /rus|рус|дубляж|дуб(\b|\.)\b|пм\b|ло\b|ап\b|перевод|многоголос|двухголос|любитель/i.test(t);
/* раздача относится к сезону N? «сезон 2», «season 2», «S02», «2 сезон» */
function trSeasonMatch(t, n) {
  return new RegExp(`(сезон\\s*0?${n}(?!\\d)|season\\s*0?${n}(?!\\d)|[\\s.\\[\\(,]s0?${n}[\\.e\\s\\]\\),])`, 'i').test(' ' + t + ' ');
}
const trGb = (n) => { n = Number(n) || 0; return n >= 1e9 ? (n / 1e9).toFixed(1).replace(/\.0$/, '') + ' ГБ' : Math.round(n / 1e6) + ' МБ'; };
const trDate = (s) => { const d = new Date(s || 0); return isNaN(d) ? '' : d.toLocaleDateString('ru', { day: 'numeric', month: 'short', year: 'numeric' }); };
const trSeedCls = (n) => (n >= 50 ? 'hi' : n >= 10 ? 'mid' : 'lo');

/* ---------- экран «Торренты» ---------- */
const TRS = { d: null, inf: null, list: null, sort: 'seed', rusOnly: false, token: 0, adding: 0, season: null };
async function renderTorrents(r, t) {
  view.innerHTML = '<div class="empty"><div class="spin"></div></div>';
  const d = await info(r.id);
  if (!alive(t)) return;
  TRS.d = d; TRS.inf = d.info || {}; TRS.list = null; TRS.sort = 'seed'; TRS.rusOnly = false; TRS.token = t; TRS.season = null;
  TRS.seasons = (typeof seasonsOf === 'function') ? seasonsOf(d) : [];
  const st = await trState(true);
  if (!alive(t)) return;
  trPaint(st);
}
window.RENDER.torrents = renderTorrents;

function trPaint(st) {
  const d = TRS.d, inf = TRS.inf;
  const head = `<div class="trh"><div class="trp"><img src="${esc(posterOf(d))}" alt="" onerror="this.remove()"></div>
    <div class="trt"><div class="ty">${esc(TYPES[d.type] || '')}</div><h1>${esc(d.name)}</h1>
    <div class="meta"><span>${d.year || ''}</span>${d.kp_rating ? `<span class="c">★ ${Number(d.kp_rating).toFixed(1)}</span>` : ''}</div>
    ${inf.description ? `<div class="trdesc">${esc(inf.description)}</div>` : ''}</div></div>`;

  // заглушка: сервер не готов
  if (!st.installed || !st.running) {
    const needInstall = !st.installed;
    view.innerHTML = `<div class="page">${head}<div class="trempty f" tabindex="-1" data-k="tr:empty">
      <div class="tre-ic">${ico('magnet')}</div>
      <h2>${needInstall ? 'Торренты ещё не подключены' : 'Сервер торрентов выключен'}</h2>
      <p>${needInstall
        ? 'Для торрентов нужен TorrServe — небольшой локальный сервер. Он бесплатный, ставится один раз и работает в фоне.'
        : 'Приложение TorrServe установлено, но его сервер сейчас не отвечает. Запустите его — экран обновится сам.'}</p>
      <div class="trempty-btns">
        ${needInstall ? '' : `<button class="btn primary f" tabindex="-1" data-tr="open" data-k="tr:open">${ico('play')}Запустить TorrServe</button>`}
        <button class="btn ${needInstall ? 'primary' : ''} f" tabindex="-1" data-tr="setup" data-k="tr:setup">${ico('gear')}Настройки торрентов</button>
      </div></div></div>`;
    return;
  }

  // рабочий экран: сезоны (как в NUM) + поиск + результаты
  view.innerHTML = `<div class="page">${head}
    ${TRS.seasons.length > 1 ? `<div class="trseas">${`<button class="chip f ${!TRS.season ? 'on' : ''}" tabindex="-1" data-tr="seas" data-v="" data-k="tr:seas:all"><small>Сезон</small>Все</button>` + TRS.seasons.map((s) => `<button class="chip f ${String(TRS.season) === String(s.season) ? 'on' : ''}" tabindex="-1" data-tr="seas" data-v="${esc(String(s.season))}" data-k="tr:seas:${esc(String(s.season))}"><small>Сезон</small>${esc(String(s.season))}</button>`).join('')}</div>` : ''}
    <div class="trbar">
      <button class="chip fl f" tabindex="-1" data-tr="find" data-k="tr:find"><small>Поиск</small>${esc(d.name)} ${d.year || ''}<i>⌕</i></button>
      <button class="chip fl f" tabindex="-1" data-tr="sort" data-k="tr:sort"><small>Сортировка</small><span id="trSort">По сидам</span><i>▾</i></button>
      <button class="chip fl f ${TRS.rusOnly ? 'on' : ''}" tabindex="-1" data-tr="rus" data-k="tr:rus"><small>Звук</small>${TRS.rusOnly ? 'С русским' : 'Любой'}<i>▾</i></button>
    </div>
    <div id="trList"><div class="empty"><div class="spin"></div></div></div></div>`;
  trLoad();
}
async function trLoad() {
  const t = TRS.token, box = $('#trList'); if (!box) return;
  box.innerHTML = '<div class="empty"><div class="spin"></div></div>';
  let list;
  try { list = await trSearch(TRS.d, TRS.inf); }
  catch { if (TRS.token === t && $('#trList')) $('#trList').innerHTML = '<div class="empty"><b>Поиск раздач не ответил</b>Проверьте интернет и нажмите «Поиск» ещё раз</div>'; return; }
  if (TRS.token !== t) return;
  TRS.list = list;
  trPaintList();
}
function trPaintList() {
  const box = $('#trList'); if (!box || !TRS.list) return;
  let list = TRS.list.slice();
  if (TRS.rusOnly) { const f = list.filter((x) => trRus(x.Title)); if (f.length) list = f; }
  if (TRS.season) { const f = list.filter((x) => trSeasonMatch(x.Title, TRS.season)); if (f.length) list = f; }
  const cmp = { seed: (a, b) => (b.Seeders || 0) - (a.Seeders || 0), size: (a, b) => (b.Size || 0) - (a.Size || 0), date: (a, b) => new Date(b.PublishDate || 0) - new Date(a.PublishDate || 0) };
  list.sort(cmp[TRS.sort] || cmp.seed);
  const srt = { seed: 'По сидам', size: 'По размеру', date: 'По дате' }[TRS.sort];
  const sEl = $('#trSort'); if (sEl) sEl.textContent = srt;
  if (!list.length) { box.innerHTML = '<div class="empty"><b>Раздач не нашлось</b>Попробуйте поиск по оригинальному названию или свою ссылку</div>'; return; }
  box.innerHTML = `<div class="trcount">Раздач: ${list.length}</div>` + list.map((x, i) => {
    const b = trBadges(x.Title), seed = x.Seeders || 0, peers = x.Peers || 0;
    return `<button class="trrow f" tabindex="-1" data-trr="${i}" data-k="trr:${i}">
      <span class="trr-main"><b>${esc(x.Title)}</b>
        <span class="trr-badges">${b.tech.map((t2) => `<i class="trb">${esc(t2)}</i>`).join('')}${b.dub.map((t2) => `<i class="trb dub">${esc(t2)}</i>`).join('')}</span></span>
      <span class="trr-side"><i class="trseed ${trSeedCls(seed)}">▲ ${seed}</i><i class="trpeer">▼ ${peers}</i><i class="trsz">${trGb(x.Size)}</i><small>${esc(String(x.Tracker || '').split(',')[0].trim())}${x.PublishDate ? ' · ' + trDate(x.PublishDate) : ''}</small></span></button>`;
  }).join('');
}

/* ---------- добавление в TorrServe и буфер ---------- */
async function trAdd(x) {
  const t = ++TRS.adding;
  const modal = $('#modal');
  modal.innerHTML = `<div class="dlg"><h3>Добавляем раздачу</h3><p class="sub">${esc(x.Title.slice(0, 90))}</p>
    <div class="trwait"><div class="spin"></div><span id="trwMsg">Соединяемся с TorrServe…</span></div></div>`;
  modal.classList.remove('hidden');
  const close = () => { if (TRS.adding === t) { modal.classList.add('hidden'); } };
  const msg = (s) => { const m = $('#trwMsg'); if (m && TRS.adding === t) m.textContent = s; };
  try {
    const link = x.MagnetUri || x.Link;
    msg('Соединяемся с TorrServe…');
    // add качает метаданные раздачи: на популярных раздачах это секунды, на пустых — долго; таймаут большой
    const added = await trApi('/torrents', 'POST', JSON.stringify({ action: 'add', link, save_to_db: true, title: x.Title.slice(0, 120) }));
    if (TRS.adding !== t) return;
    const hash = added.hash || added.Hash;
    if (!hash) throw new Error('no hash');
    const info = { hash, name: added.name || added.title || x.Title, files: trFilesOf(added), magnet: link };
    // add нередко возвращается до готовности метаданных (stat=1): плеер по такой ссылке получает пустой ответ.
    // Ждём появления file_stats (на популярных раздачах — пара секунд), не дольше ~90 с
    for (let i = 0; !info.files.length && i < 45; i++) {
      msg('Загружаем сведения о раздаче… ' + (i ? i * 2 + ' с' : 'подключаемся к пирам'));
      await wait(2000);
      try { const got = await trApi('/torrents', 'POST', JSON.stringify({ action: 'get', hash })); info.files = trFilesOf(got); info.name = got.name || info.name; } catch {}
      if (TRS.adding !== t) return;
    }
    if (!info.files.length) throw new Error('не удалось получить сведения о раздаче');
    close();
    trPickFile(info);
  } catch (e) {
    close();
    toast('Не удалось добавить раздачу: ' + (e.message || 'ошибка'));
  }
}

/* файлы раздачи: TorrServer отдаёт их то в file_stats, то внутри data (строка JSON в строке JSON) */
function trFilesOf(entry) {
  let all = entry.file_stats || entry.FileStats || [];
  if (!all.length) {
    try {
      const d = JSON.parse(entry.data || '{}');
      const inner = d.TorrServer || d;
      all = JSON.parse(inner.Files || '[]');
    } catch {}
  }
  all = Array.isArray(all) ? all : [];
  let vids = all.filter((f) => /\.(mkv|mp4|avi|m4v|webm|ts|mov|wmv|mpg|mpeg)(\?|$)/i.test(f.path || ''));
  if (!vids.length) vids = all.slice(0, 1);
  return vids;
}

/* номер серии из имени файла: s01e02, 1 сезон 2 серия, [_012], " - 03", серия 7 и т.п. */
function trEpNum(path) {
  const p = String(path || '');
  const m = p.match(/s(\d{1,2})[ ._-]?e(\d{1,3})/i) || p.match(/[сc]езон\s*(\d{1,2}).*?(?:серия\s*)?(\d{1,3})/i);
  if (m) return { s: +m[1] || 0, e: +m[2] || 0 };
  const base = p.split('/').pop();
  const g = base.match(/[\[(\s_-](\d{1,3})[\])\s_.-]/) || base.match(/серия\s*(\d{1,3})/i) || base.match(/(\d{1,3})\s*(?:серия|эпизод|episode|ep\.?)/i);
  if (g) return { s: 0, e: +g[1] };
  return null;
}
function trOrderedFiles(files) {
  return files.slice().sort((a, b) => {
    const na = trEpNum(a.path), nb = trEpNum(b.path);
    if (na && nb) return na.s - nb.s || na.e - nb.e;
    if (na) return -1; if (nb) return 1;
    return String(a.path).localeCompare(String(b.path), 'ru', { numeric: true });
  });
}
/* ---------- выбор файла и запуск ---------- */
function trPickFile(info) {
  let files = info.files;
  if (!files.length) files = [{ id: 0, path: info.name, length: 0 }];
  if (files.length === 1) { trPlayFile(info, files[0]); return; }
  const ordered = trOrderedFiles(files);
  // несколько файлов: для сериалов пытаемся разложить по сезонам
  const eps = new Map();
  for (const f of ordered) {
    const n = trEpNum(f.path);
    if (n) { const k = 'S' + n.s; if (!eps.has(k)) eps.set(k, []); eps.get(k).push(f); }
  }
  const modal = $('#modal');
  let html = `<div class="dlg top"><h3>${esc((TRS.d && TRS.d.name) || info.name)}</h3><p class="sub">${files.length} файла · выберите, что смотреть</p>`;
  if (eps.size > 0) {
    for (const [k, arr] of eps) html += `<h4 class="nm-h">${k === 'S0' ? 'Без сезона' : 'Сезон ' + (+k.slice(1))}</h4>` +
      arr.map((f) => { const n = trEpNum(f.path); return `<button class="nm-r f" tabindex="-1" data-trf="${f.id}" data-k="trf:${f.id}"><i></i><span>${n && n.e ? 'Серия ' + n.e : esc((f.path || '').split('/').pop())}</span><small>${trGb(f.length)}</small></button>`; }).join('');
    const rest = ordered.filter((f) => !trEpNum(f.path));
    if (rest.length) html += '<h4 class="nm-h">Остальное</h4>' + rest.map((f) => `<button class="nm-r f" tabindex="-1" data-trf="${f.id}" data-k="trf:${f.id}"><i></i><span>${esc((f.path || '').split('/').pop())}</span><small>${trGb(f.length)}</small></button>`).join('');
  } else {
    html += `<div class="nm-list trfiles">${ordered.map((f) => `<button class="nm-r f" tabindex="-1" data-trf="${f.id}" data-k="trf:${f.id}"><i></i><span>${esc((f.path || '').split('/').pop())}</span><small>${trGb(f.length)}</small></button>`).join('')}</div>`;
  }
  html += `<div class="dbtns"><button class="btn f" tabindex="-1" data-trno="1" data-k="trf:no">Отмена</button></div></div>`;
  modal.innerHTML = html; modal.classList.remove('hidden');
  window.__trPick = { info };
  $('.nm-r', modal)?.focus({ preventScroll: true });
}
function trPlayFile(info, f) {
  closeDlg();
  if (!TRS.d) TRS.d = { id: -1, type: 1, name: info.name };
  const fname = (f.path || info.name).split('/').pop();
  const ext = (fname.match(/\.(\w{2,5})$/) || [, ''])[1].toLowerCase();
  // AVI/Xvid, WMV и прочие контейнеры вне ExoPlayer отдаём второму движку (libvlc)
  const vlc = ['avi', 'wmv', 'mpg', 'mpeg', 'mpe', 'flv', 'vob', 'rm', 'rmvb', 'asf', 'divx', 'ogm', 'wtv'].includes(ext);
  const url = 'http://127.0.0.1:8090/stream/' + encodeURIComponent(fname) +
    '?link=' + encodeURIComponent(info.magnet) + '&index=' + encodeURIComponent(f.id) + '&play';
  // контекст серий: кнопки ⏮ ⏭ и авто-переход по окончании файла
  const ordered = trOrderedFiles(info.files.length ? info.files : [f]);
  const idx = Math.max(0, ordered.findIndex((q) => String(q.id) === String(f.id)));
  window.npTorrCtx = { info, files: ordered, idx };
  window.npTorrPlayAt = (i) => {
    const c = window.npTorrCtx; if (!c) return false;
    const q = c.files[i]; if (!q) return false;
    trPlayFile(c.info, q); return true;
  };
  const n = trEpNum(f.path);
  // тот же нативный плеер, что для фильмов сайта; прогресс в историю Luma не пишем:
  // позиция торрента не совпадает с эпизодами сайта, а портить «Продолжить» нельзя
  const token = ++NP.token;
  Object.assign(NP, { on: true, d: TRS.d, seasons: [], season: null, episode: null, key: '', tr: null, torr: window.npTorrCtx, secs: [], mode: 'play', menu: '', st: { p: 0, d: 0, pl: false, b: true, w: true }, lastSave: 0, subApplied: '1', audioNames: [] });
  npEnsureDom(); npShow();
  $('#np .np-load').classList.remove('hidden'); $('#np .np-load span').textContent = 'Открываем торрент…';
  $('#np .np-title b').textContent = TRS.d.name;
  $('#np .np-title span').textContent = 'Торрент · ' + (n && n.e ? 'Серия ' + n.e : fname);
  closeNpMenu(true); renderNpButtons(); npOsd(5000);
  addHistory(TRS.d, null, null);
  try { NATIVE.npStart(JSON.stringify({ url, ua: NP_UA, startMs: 0, vlc })); } catch (e) { npClose(true); toast('Плеер не запустился'); }
}

/* ---------- клики экрана ---------- */
document.addEventListener('click', async (e) => {
  const el = e.target.closest('.f'); if (!el) return;
  if (el.dataset.trf !== undefined && window.__trPick) { const f = window.__trPick.info.files.find((q) => String(q.id) === String(el.dataset.trf)); if (f) trPlayFile(window.__trPick.info, f); return; }
  if (el.dataset.trno) { closeDlg(); return; }
  if (route.name !== 'torrents') return;
  const a = el.dataset.tr;
  if (a === 'seas') { TRS.season = el.dataset.v ? +el.dataset.v : null; trPaint({ installed: true, running: true }); return; }
  if (a === 'find') { trLoad(); return; }
  if (a === 'sort') { pickDlg('Сортировка', [['seed', 'По сидам'], ['size', 'По размеру'], ['date', 'По дате']].map(([v, l]) => ({ label: l, on: TRS.sort === v, v })), (o) => { TRS.sort = o.v; trPaintList(); }); return; }
  if (a === 'rus') {
    TRS.rusOnly = !TRS.rusOnly; trPaintList();
    const b = $('[data-tr=rus]');
    if (b) { b.innerHTML = `<small>Звук</small>${TRS.rusOnly ? 'С русским' : 'Любой'}<i>▾</i>`; b.classList.toggle('on', TRS.rusOnly); b.focus({ preventScroll: true }); }
    return;
  }
  if (a === 'open') { NATIVE.torrOpen(); toast('Запускаем TorrServe…'); setTimeout(async () => { const st = await trState(true); trPaint(st); }, 4000); return; }
  if (a === 'setup') { go('settings', { sec: 'torrents' }); return; }
  if (el.dataset.trr !== undefined && TRS.list) { const x = TRS.list[+el.dataset.trr]; if (x) trAdd(x); return; }
});

/* ---------- настройки: раздел «Торренты» ---------- */
window.lumaTorrState = (s) => {   // состояния установки из нативной части
  if (s.state === 'downloading') trSetupRow(`Скачиваем TorrServe… ${s.pct}%`);
  else if (s.state === 'needperm') trSetupRow('Разрешите установку из неизвестных источников для Luma, затем нажмите «Скачать и установить» ещё раз');
  else if (s.state === 'installing') trSetupRow('Откроется установщик TorrServe — подтвердите установку');
  else if (s.state === 'error') trSetupRow('Ошибка: ' + (s.msg || 'не скачалось'));
  if (s.state === 'installing' || s.state === 'needperm') setTimeout(async () => { await trState(true); if (route.name === 'settings' && stCur === 'torrents') paintPane(); }, 1200);
};
function trSetupRow(txt) { const b = $('#trSetupMsg'); if (b) b.textContent = txt; }
async function trSettingsPane(p) {
  const st = await trState(true);
  if (!p.isConnected) return;
  const ready = st.installed && st.running;
  const cardHtml = (ic, title, text) => `<div class="sc hero"><div class="sci">${ico(ic)}</div><div><b>${title}</b><p>${text}</p></div></div>`;
  p.innerHTML = cardHtml('magnet', 'Торренты', 'Фильмы и сериалы из торрент-раздач: ищем раздачи, а качает и играет локальный сервер TorrServe. Он бесплатный и ставится один раз.') +
    (ready
      ? `<div class="sc"><div class="srow f" tabindex="-1" data-k="tr:ok"><span class="sri bd ok">✓</span><span><b>TorrServe готов к работе</b><small>${esc(st.version || '')} · сервер отвечает</small></span><i></i></div>
         <button class="srow f" tabindex="-1" data-sact="trcheck" data-k="tr:check"><span class="sri">${ico('refresh')}</span><span><b>Проверить снова</b><small id="trSetupMsg"></small></span><i>›</i></button>
</div>`
      : `<div class="sc">
         <button class="srow f" tabindex="-1" data-sact="trinstall" data-k="tr:install"><span class="sri">${ico('refresh')}</span><span><b>${st.installed ? 'Запустить TorrServe' : 'Скачать и установить TorrServe'}</b><small id="trSetupMsg">${st.installed ? 'Сервер не отвечает: приложение установлено, но не запущено' : 'Сервер потребуется для поиска раздач в карточках фильмов'}</small></span><i>›</i></button>
         <button class="srow f" tabindex="-1" data-sact="trcheck" data-k="tr:check"><span class="sri">${ico('info')}</span><span><b>Проверить состояние</b><small>Обновить статус сервера</small></span><i>›</i></button></div>
         <div class="smeta">После установки откроется TorrServe: разрешите ему работу в фоне. Возвращайтесь в Luma — кнопка «Торренты» появится в карточках фильмов.</div>`);
}
document.addEventListener('click', async (e) => {
  const el = e.target.closest('.f'); if (!el || route.name !== 'settings' || stCur !== 'torrents') return;
  const a = el.dataset.sact;
  if (a === 'trinstall') { const st = await trState(true); if (st.installed) { NATIVE.torrOpen(); trSetupRow('Запускаем TorrServe…'); setTimeout(async () => { await trState(true); paintPane(); }, 4000); } else { NATIVE.torrInstall(); } return; }
  if (a === 'trcheck') { await trState(true); paintPane(); return; }
});
