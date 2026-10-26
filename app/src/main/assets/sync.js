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
    secrets: S.secrets || {}, sync: S.group ? { gid: S.group.id, gkey: S.group.key } : undefined
  });
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
  adoptGroup(obj.sync);
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
window.syncAfterPlay = () => setTimeout(() => autoSync(false), 2500);
setTimeout(() => { syServe(); autoSync(false); }, 3500);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') autoSync(false); });
setInterval(() => { if (document.visibilityState === 'visible') autoSync(false); }, 5 * 60 * 1000);

/* ---------- экран «Синхронизация» ---------- */
function renderSync(r, t) {
  SY.code = String(1000 + Math.floor(Math.random() * 9000)); SY.found = []; SY.scanning = false; SY.busy = '';
  syServe(); try { NATIVE.syncCode(SY.code); } catch {}
  const has = !!S.group;
  view.innerHTML = `<div class="page"><div class="sy">
    <div class="sy-code"><small>Код этого устройства</small><b id="syCode">${SY.code.split('').join(' ')}</b><p>Введите этот код на другом устройстве (компьютер: Luma → Настройки → Синхронизация устройств). Подключить нужно один раз: дальше устройства будут синхронизироваться сами.</p>
      <div class="sy-st" id="syStatus">${esc(SY.status || (has ? 'Устройства группы обмениваются сами: при запуске, после просмотра и по кнопке' : 'Группа устройств ещё не создана'))}</div></div>
    <div class="sy-pc"><h3>Синхронизация</h3><p>Последняя: ${esc(S.synced ? new Date(S.synced).toLocaleString('ru', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : 'ещё не было')}${has ? ' · группа ' + esc(S.group.id) : ''}</p>
      <button class="btn primary f" tabindex="-1" data-sy="now" data-k="sy:now">Синхронизировать сейчас</button>
      <button class="btn f" tabindex="-1" data-sy="scan" data-k="sy:scan">Подключить новое устройство</button><div id="syList" class="sy-list"></div></div></div></div>`;
  $('[data-sy=now]')?.focus({ preventScroll: true });
}
window.RENDER.sync = renderSync;
window.onRouteLeave = (prev, next) => { if (prev && prev.name === 'sync' && next.name !== 'sync') { try { NATIVE.syncCode(''); } catch {} } };

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
  const el = e.target.closest('.f'); if (!el || route.name !== 'sync') return;
  if (el.dataset.sy === 'now') autoSync(true);
  else if (el.dataset.sy === 'scan') scanNow();
  else if (el.dataset.sypc !== undefined) sendTo(+el.dataset.sypc);
});
