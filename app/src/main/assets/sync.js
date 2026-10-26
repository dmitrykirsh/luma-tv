'use strict';
/* ================= Синхронизация между устройствами: ТВ ↔ компьютер ↔ телефон =================
   Первый раз устройства подключаются друг к другу по коду (и заодно получают общий ключ группы). Дальше все устройства группы
   сами находят друг друга в сети и обмениваются данными без кодов: при запуске, при возвращении в приложение, после просмотра,
   каждые несколько минут и по кнопке «Синхронизировать сейчас». */
window.RENDER = window.RENDER || {};
const SY = { code: '', found: [], scanning: false, busy: '', auto: false, again: false, last: 0, status: '' };
const syRnd = (n, abc) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => abc[b % abc.length]).join('');
const SY_HEX = '0123456789abcdef', SY_B62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
if (!S.did) { S.did = syRnd(12, SY_HEX); save(); }
function ensureGroup() { if (!S.group) { S.group = { id: syRnd(8, SY_HEX), key: syRnd(28, SY_B62) }; save(); } return S.group; }

/* данные ТВ в формате резервной копии Luma (тот же, что у Windows-версии) */
function exportJson() {
  const x = tvX();
  return JSON.stringify({
    app: 'Luma', format: 1, exportedAt: new Date().toISOString(), version: NATIVE ? NATIVE.version() : '',
    data: { favs: S.favs, history: S.history, seen: S.seen, gone: S.gone || {}, progress: S.progress, lists: x.lists || [], tvFav: x.tvFav || [], tvStats: x.tvStats || {}, tvCustom: (x.tvCustom || []).filter((e) => e.url), tvLast: x.tvLast || '' },
    secrets: syncSecrets(), sync: S.group ? { gid: S.group.id, gkey: S.group.key } : undefined
  });
}
/** Ключи сервисов + вход Google (вход едет только между устройствами по сети, в файл на Диске он не попадает). */
function syncSecrets(withGoogle = true) {
  const sec = { ...(S.secrets || {}) }; delete sec.google;
  if (withGoogle) { try { const g = NATIVE.driveSecret(); if (g) sec.google = g; } catch {} }
  return sec;
}
/** Вход Google пришёл от другого устройства: принимаем, если сами ещё не вошли. */
function adoptGoogle(obj) {
  const g = obj && obj.secrets && obj.secrets.google;
  if (obj && obj.secrets) delete obj.secrets.google;
  if (!g) return;
  try { if (NATIVE.driveAdopt(g)) { renderDriveBox(); setTimeout(() => driveSyncNow(), 1500); } } catch {}
}
const syState = () => JSON.stringify([S.history.length, S.favs.length, Object.keys(S.progress).length, Math.max(0, ...S.history.map((h) => h.ts || 0)), Math.max(0, ...Object.values(S.progress).map((p) => p.ts || 0))]);
/** Наш сервер приёма включён всегда, чтобы другие устройства могли нас найти и обменяться данными. */
function syServe() { if (!NATIVE || !NATIVE.syncServe) return; try { NATIVE.syncServe(S.group ? S.group.id : '', S.group ? S.group.key : '', S.did, exportJson()); } catch {} }
function adoptGroup(sy) {
  if (!sy || !sy.gid || !sy.gkey) return;
  if (!S.group || sy.gid < S.group.id) { S.group = { id: sy.gid, key: sy.gkey }; save(); syServe(); }   // при двух группах побеждает меньший номер
}
function applyIncoming(plain, from, quiet) {
  let obj; try { obj = JSON.parse(plain); } catch { syStatus('Получены повреждённые данные', 'bad'); return false; }
  const before = syState();
  adoptGroup(obj.sync); adoptGoogle(obj);
  const r = mergeBackup(obj); S.synced = Date.now(); save();
  try { NATIVE.syncUpdate(exportJson()); } catch {}
  const changed = syState() !== before;
  if (!quiet) syStatus(`Готово: данные получены от ${from || 'устройства'}. Избранное ${S.favs.length}, история ${S.history.length}${r.keys.length ? ', ключей ' + r.keys.length : ''}.`, 'ok');
  return changed;
}
function syStatus(txt, cls) { SY.status = txt; const e = $('#syStatus'); if (e) { e.textContent = txt; e.className = 'sy-st ' + (cls || ''); } }
function refreshUi() {
  try {
    if (playerOpen() || (window.npActive && window.npActive())) return;
    if (route && (route.name === 'home' || route.name === 'mine')) show(route, { scroll: view.scrollTop, focus: document.activeElement?.dataset?.k });
  } catch {}
}

/* ---------- автоматический обмен ---------- */
function autoSync(manual) {
  if (!NATIVE || !NATIVE.syncAuto) return;
  if (!S.group) { if (manual) toast('Сначала подключите устройство: «Подключить новое устройство»'); return; }
  if (SY.auto) return;
  if (!manual && Date.now() - SY.last < 25000) return;
  SY.auto = true; SY.last = Date.now();
  if (manual) syStatus('Ищем устройства в сети…', 'wait');
  syServe();
  NATIVE.syncAuto(S.group.key, exportJson());
}
window.lumaSyncAuto = (json) => {
  SY.auto = false; let r = []; try { r = JSON.parse(json); } catch {}
  let ok = 0, changed = false; const names = [];
  for (const p of r) if (p.ok) { ok++; names.push(p.name); if (applyIncoming(p.data, p.name, true)) changed = true; }
  const t = new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
  if (ok) syStatus(`Синхронизировано: ${names.join(', ')} · ${t}`, 'ok');
  else syStatus(r.length ? 'Устройства найдены, но обменяться не удалось' : 'Других устройств группы в сети нет', r.length ? 'bad' : '');
  if (changed) { refreshUi(); if (ok > 1 && !SY.again) { SY.again = true; setTimeout(() => { SY.again = false; SY.last = 0; autoSync(false); }, 600); } }
};
window.lumaSyncIn = (plain) => { try { if (applyIncoming(plain, 'устройства', true)) { syStatus('Получены данные от другого устройства', 'ok'); refreshUi(); } } catch {} };
window.syncAfterPlay = () => { setTimeout(() => autoSync(false), 2500); setTimeout(() => driveAutoSync(), 3000); };
setTimeout(() => { syServe(); autoSync(false); }, 3500);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') autoSync(false); });
setInterval(() => { if (document.visibilityState === 'visible') autoSync(false); }, 5 * 60 * 1000);

/* ---------- экран «Синхронизация по Wi-Fi» (Google-вход живёт в настройках, раздел «Google-аккаунт») ---------- */
function renderSync(r, t) {
  SY.code = String(1000 + Math.floor(Math.random() * 9000)); SY.found = []; SY.scanning = false; SY.busy = '';
  syServe(); try { NATIVE.syncCode(SY.code); } catch {}
  const has = !!S.group;
  view.innerHTML = `<div class="page"><div class="sy">
    <div class="sy-code"><small>Код этого устройства</small><b class="big" id="syCode">${SY.code.split('').join(' ')}</b><p>Введите этот код на другом устройстве (компьютер: Luma → Настройки → Синхронизация устройств). Подключить нужно один раз: дальше устройства будут синхронизироваться сами.</p>
      <div class="sy-st" id="syStatus">${esc(SY.status || (has ? 'Устройства группы обмениваются сами: при запуске, после просмотра и по кнопке' : 'Группа устройств ещё не создана'))}</div></div>
    <div class="sy-pc"><h3>Синхронизация по Wi-Fi</h3><p>Последняя: ${esc(S.synced ? new Date(S.synced).toLocaleString('ru', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : 'ещё не было')}${has ? ' · группа ' + esc(S.group.id) : ''}</p>
      <button class="btn primary f" tabindex="-1" data-sy="now" data-k="sy:now">Синхронизировать сейчас</button>
      <button class="btn f" tabindex="-1" data-sy="scan" data-k="sy:scan">Подключить новое устройство</button><div id="syList" class="sy-list"></div></div></div></div>`;
  $('[data-sy=now]')?.focus({ preventScroll: true });
}
window.RENDER.sync = renderSync;
window.onRouteLeave = (prev, next) => { if (prev && prev.name === 'sync' && next.name !== 'sync') { try { NATIVE.syncCode(''); } catch {} } };

/* ---------- Google Drive: основной способ, работает из любой сети ---------- */
const DR = { connecting: false, busy: false, wipe: false, url: '', code: '', msg: '' };
const driveUrl = (code) => 'https://www.google.com/device?user_code=' + encodeURIComponent(code || '');
function qrSvg(text) { try { const q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 5, margin: 2, scalable: true }); } catch { return ''; } }
function driveRowsHtml() {
  let st = { connected: false, last: 0 };
  try { st = JSON.parse(NATIVE.driveState()); } catch {}
  const row = (ic, t, sub, act, val = '›') => `<button class="srow f" tabindex="-1" data-sy="${act}" data-k="g:${act}"><span class="sri">${ico(ic)}</span><span><b>${t}</b><small>${sub}</small></span><i>${val}</i></button>`;
  const note = '<div class="smeta">Всё хранится в вашем Google Диске. Синхронизируются: история просмотра, избранное, прогресс серий, подборки, каналы и ключи сервисов. Раз в 5 минут, при запуске, после просмотра и по кнопке.</div>';
  if (DR.connecting) {
    return `<div class="sc hero gq"><div class="sy-qr">${DR.code ? qrSvg(driveUrl(DR.code)) : '<div class="spin"></div>'}</div><div><b>Войдите с телефона</b><p>Наведите камеру на QR-код, на странице Google введите код и подтвердите вход.</p>${DR.code ? `<p class="gcode">Код: <b>${esc(DR.code)}</b></p>` : ''}</div></div>` + row('back', 'Отменить', 'Прервать вход', 'drive-cancel');
  }
  if (!st.connected) {
    return row('sync', 'Войти через Google', 'Покажем QR-код для телефона', 'drive-connect') + (DR.msg ? `<div class="smeta bad">${esc(DR.msg)}</div>` : '') +
      '<div class="smeta">Проще всего войти в Luma на телефоне или компьютере: вход сам передастся на ТВ, когда они окажутся в одной Wi-Fi сети.</div>' + note;
  }
  const when = st.last ? new Date(st.last).toLocaleString('ru', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : 'ещё не было';
  const av = `<span class="av"><i>${esc((st.name || 'G').trim().charAt(0).toUpperCase())}</i>${st.photo ? `<img src="${esc(st.photo)}" onerror="this.remove()">` : ''}</span>`;
  return `<div class="srow who">${av}<span><b>${esc(st.name || 'Google-аккаунт')}</b><small>${esc(st.email || '')}</small></span><i class="ok">Подключено</i></div>` +
    row('refresh', 'Синхронизировать сейчас', esc(DR.msg || 'Последняя: ' + when), 'drive-now') +
    row('key', 'Отключить', 'Остановить синхронизацию на этом ТВ', 'drive-off') +
    row('trash', DR.wipe ? 'Нажмите ещё раз: удалить с Диска и отключить' : 'Удалить данные с Диска', 'Файл синхронизации будет удалён из вашего Google Диска', 'drive-wipe') + note;
}
/** Подпись раздела в левом списке настроек. */
function driveNavSub() { try { const st = JSON.parse(NATIVE.driveState()); return st.connected ? (st.name || 'Подключено') : 'Не подключено'; } catch { return 'Не подключено'; } }
function renderDriveBox() {
  if (route.name !== 'settings') return;
  const nav = $('[data-st=sync] small'); if (nav) nav.textContent = driveNavSub();
  if (stCur !== 'sync') return;
  const act = document.activeElement?.dataset?.sy;
  paintPane();
  ($(`[data-sy="${act}"]`) || $('#stPane .f'))?.focus({ preventScroll: true });
}
function driveConnect() { DR.connecting = true; DR.url = ''; DR.code = ''; DR.msg = ''; renderDriveBox(); try { NATIVE.driveConnect(); } catch {} }
window.lumaDriveCode = (json) => { let d = {}; try { d = JSON.parse(json); } catch {} DR.url = d.url; DR.code = d.code; renderDriveBox(); };
window.lumaDriveConnected = (json) => {
  DR.connecting = false; let r = {}; try { r = JSON.parse(json); } catch {}
  if (r.error) { DR.msg = { NO_CREDS: 'Не настроены ключи Google в этой сборке.', DEVICE: 'Не получилось начать вход, попробуйте ещё раз.', NETWORK: 'Нет связи с Google.' }[r.error] || 'Вход не удался.'; renderDriveBox(); return; }
  toast('Google-аккаунт подключён'); driveSyncNow();
};
function driveSyncNow() {
  if (DR.busy) return; DR.busy = true;
  DR.msg = 'Синхронизируем…'; renderDriveBox();
  try { NATIVE.driveFetchRemote(); } catch { DR.busy = false; }
}
window.lumaDriveRemote = (json) => {
  let r = {}; try { r = JSON.parse(json); } catch {}
  if (r.error) { driveFinish(r.error); return; }
  if (r.data) { try { const o = JSON.parse(r.data); if (o.secrets) delete o.secrets.google; mergeBackup(o); } catch {} }
  try { const o = JSON.parse(exportJson()); o.secrets = syncSecrets(false); delete o.sync; NATIVE.driveUpload(JSON.stringify(o)); } catch { driveFinish('NETWORK'); }
};
/** Телефон или ПК предлагает вход Google: спрашиваем подтверждение на экране (чтобы чужое устройство в сети не подсунуло аккаунт). */
window.lumaDriveOffer = (json) => {
  let o = {}; try { o = JSON.parse(json); } catch {}
  confirmDlg('Войти в Google-аккаунт, который открыт на «' + (o.from || 'другом устройстве') + '»?', 'Войти', () => {
    try { if (NATIVE.driveAdopt(o.secret)) { DR.msg = ''; renderDriveBox(); toast('Google-аккаунт подключён'); setTimeout(() => driveSyncNow(), 800); } } catch {}
  });
};
window.lumaDriveUploaded = (json) => { let r = {}; try { r = JSON.parse(json); } catch {} driveFinish(r.error); };
function driveFinish(err) {
  DR.busy = false;
  DR.msg = err ? ({ NO_AUTH: 'Сессия истекла, войдите заново.', NETWORK: 'Нет связи с Google.' }[err] || 'Не получилось синхронизировать.') : 'Готово · ' + new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
  renderDriveBox();
  if (!err) { refreshUi(); toast('Синхронизация завершена'); }
}
let driveLastAuto = 0;
function driveAutoSync() {
  if (DR.connecting || DR.busy) return;
  let st = {}; try { st = JSON.parse(NATIVE.driveState()); } catch {}
  if (!st.connected) return;
  if (Date.now() - driveLastAuto < 25000) return;
  driveLastAuto = Date.now();
  driveSyncNow();
}
setTimeout(() => driveAutoSync(), 5000);
setInterval(() => { if (document.visibilityState === 'visible') driveAutoSync(); }, 5 * 60 * 1000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') driveAutoSync(); });

function scanNow() {
  if (SY.scanning) return; SY.scanning = true; $('#syList').innerHTML = '<div class="empty" style="padding:30px"><div class="spin"></div></div>';
  NATIVE.syncScan();
}
window.lumaSyncFound = (json) => {
  SY.scanning = false; let list = []; try { list = JSON.parse(json); } catch {}
  SY.found = list; const box = $('#syList'); if (!box) return;
  box.innerHTML = list.length ? list.map((p, i) => `<button class="srow f" tabindex="-1" data-sypc="${i}" data-k="sypc:${i}"><span class="sri">${ico('tv')}</span><span><b>${esc(p.name || 'Устройство')}</b><small>${esc(p.ip)}</small></span></button>`).join('')
    : '<div class="empty" style="padding:30px;text-align:left"><b>Устройства не нашлись</b>Запустите Luma на компьютере или телефоне (они должны быть в той же сети).</div>';
  if (list.length) $('#syList .f')?.focus({ preventScroll: true });
};
function sendTo(i) {
  const p = SY.found[i]; if (!p || SY.busy) return;
  const go = (code) => {
    ensureGroup(); syServe();
    SY.busy = p.ip;
    syStatus(p.app === 'luma-tv' ? `Подключаемся к «${p.name}»…` : `Ждём подтверждения на устройстве «${p.name}»: введите там код ${SY.code}`, 'wait');
    NATIVE.syncSend(p.ip, p.port, code, exportJson());
  };
  // компьютер сам спросит наш код; телефон или другой ТВ код не спрашивают, поэтому его вводим здесь (он показан на экране того устройства)
  if (p.app !== 'luma-tv') { go(SY.code); return; }
  inputDlg({ title: `Код устройства «${p.name}»`, sub: 'Введите 4 цифры с экрана этого устройства (раздел «Синхронизация»).', fields: [{ id: 'code', label: 'Код', placeholder: '0000' }], ok: 'Подключить',
    async onOk({ code }) { if (!/^\d{4}$/.test(code)) return 'Нужно 4 цифры.'; go(code); return null; } });
}
window.lumaSyncDone = (json) => {
  SY.busy = ''; let r = {}; try { r = JSON.parse(json); } catch {}
  if (r.ok) { applyIncoming(r.data, r.name); toast('Устройство подключено'); setTimeout(() => autoSync(true), 800); }
  else syStatus({ BAD_CODE: 'Код не подошёл. Введите код с экрана этого устройства.', TIMEOUT: 'Устройство не ответило вовремя.', NETWORK: 'Не получилось связаться с устройством.' }[r.error] || 'Не получилось подключиться.', 'bad');
};
document.addEventListener('click', (e) => {
  const el = e.target.closest('.f'); if (!el) return;
  const dr = /^drive-/.test(el.dataset.sy || '');
  if (route.name !== 'sync' && !(dr && route.name === 'settings')) return;
  if (el.dataset.sy === 'now') autoSync(true);
  else if (el.dataset.sy === 'scan') scanNow();
  else if (el.dataset.sypc !== undefined) sendTo(+el.dataset.sypc);
  else if (el.dataset.sy === 'drive-connect') driveConnect();
  else if (el.dataset.sy === 'drive-cancel') { try { NATIVE.driveConnectCancel(); } catch {} DR.connecting = false; renderDriveBox(); }
  else if (el.dataset.sy === 'drive-now') driveSyncNow();
  else if (el.dataset.sy === 'drive-off') { try { NATIVE.driveDisconnect(); } catch {} DR.msg = ''; DR.wipe = false; renderDriveBox(); }
  else if (el.dataset.sy === 'drive-wipe') { if (!DR.wipe) { DR.wipe = true; renderDriveBox(); } else { DR.wipe = false; DR.msg = 'Удаляем файл с Диска…'; renderDriveBox(); try { NATIVE.driveDeleteRemote(); } catch {} } }
});

window.lumaDriveDeleted = (json) => {
  let r = {}; try { r = JSON.parse(json); } catch {}
  DR.msg = r.error ? 'Не получилось удалить файл с Диска. Проверьте сеть.' : '';
  renderDriveBox(); if (!r.error) toast('Файл удалён с Google Диска, вход отключён');
};
