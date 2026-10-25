'use strict';
/* ================= Синхронизация ТВ ↔ компьютер ================= */
window.RENDER = window.RENDER || {};
const SY = { code: '', found: [], scanning: false, busy: '', status: '', ok: false, started: false };

/* данные ТВ в формате резервной копии Luma (тот же, что у Windows-версии) */
function exportJson() {
  const x = tvX();
  return JSON.stringify({
    app: 'Luma', format: 1, exportedAt: new Date().toISOString(), version: NATIVE ? NATIVE.version() : '',
    data: { favs: S.favs, history: S.history, seen: S.seen, progress: S.progress, lists: x.lists || [], tvFav: x.tvFav || [], tvStats: x.tvStats || {}, tvCustom: (x.tvCustom || []).filter((e) => e.url), tvLast: x.tvLast || '' },
    secrets: S.secrets || {}
  });
}

function renderSync(r, t) {
  SY.code = String(1000 + Math.floor(Math.random() * 9000)); SY.found = []; SY.scanning = false; SY.busy = ''; SY.status = ''; SY.ok = false;
  let info = {}; try { info = JSON.parse(NATIVE.syncStart(SY.code, exportJson())); } catch {}
  SY.started = !info.error;
  view.innerHTML = `<div class="page"><div class="sy">
    <div class="sy-code"><small>Код сопряжения</small><b id="syCode">${SY.code.split('').join(' ')}</b><p>Введите этот код на компьютере: Luma → Настройки → Телевизор. Код нужен, чтобы данные не попали на чужое устройство.</p>
      <div class="sy-st" id="syStatus">${SY.started ? 'ТВ виден компьютерам в сети' : 'Не удалось запустить приём. Проверьте подключение к сети.'}</div></div>
    <div class="sy-pc"><h3>Компьютеры в сети</h3><p>Нажмите «Найти», если Luma запущена на ПК, или найдите этот ТВ на ПК.</p>
      <button class="btn primary f" tabindex="-1" data-sy="scan" data-k="sy:scan">Найти компьютер</button><div id="syList" class="sy-list"></div></div></div></div>`;
  $('[data-sy=scan]')?.focus({ preventScroll: true });
}
window.RENDER.sync = renderSync;
window.onRouteLeave = (prev, next) => { if (prev && prev.name === 'sync' && next.name !== 'sync') { try { NATIVE.syncStop(); } catch {} SY.started = false; } };

function syStatus(txt, cls) { const e = $('#syStatus'); if (e) { e.textContent = txt; e.className = 'sy-st ' + (cls || ''); } }
function scanNow() {
  if (SY.scanning) return; SY.scanning = true; $('#syList').innerHTML = '<div class="empty" style="padding:30px"><div class="spin"></div></div>';
  NATIVE.syncScan();
}
window.lumaSyncFound = (json) => {
  SY.scanning = false; let list = []; try { list = JSON.parse(json); } catch {}
  SY.found = list; const box = $('#syList'); if (!box) return;
  box.innerHTML = list.length ? list.map((p, i) => `<button class="srow f" tabindex="-1" data-sypc="${i}" data-k="sypc:${i}"><span class="sri">${ico('tv')}</span><span><b>${esc(p.name || 'Компьютер')}</b><small>${esc(p.ip)} · Luma для Windows</small></span><i>Синхронизировать</i></button>`).join('')
    : '<div class="empty" style="padding:30px;text-align:left"><b>Компьютеры не нашлись</b>Запустите Luma на ПК (он должен быть в той же сети) или откройте на ПК Настройки → Телевизор и найдите этот ТВ.</div>';
  if (list.length) $('#syList .f')?.focus({ preventScroll: true });
};
function sendTo(i) {
  const p = SY.found[i]; if (!p || SY.busy) return;
  SY.busy = p.ip; syStatus(`Ждём подтверждения на компьютере «${p.name}»: введите там код ${SY.code}`, 'wait');
  NATIVE.syncSend(p.ip, p.port, SY.code, exportJson());
}
window.lumaSyncDone = (json) => {
  SY.busy = ''; let r = {}; try { r = JSON.parse(json); } catch {}
  if (r.ok) { applyIncoming(r.data, r.name); }
  else syStatus({ BAD_CODE: 'Код не подошёл. Введите на компьютере код с экрана ТВ.', TIMEOUT: 'Компьютер не ответил вовремя.', NETWORK: 'Не получилось связаться с компьютером.' }[r.error] || 'Не получилось синхронизировать.', 'bad');
};
// данные пришли с компьютера (он нас нашёл сам)
window.lumaSyncIn = (plain) => { try { applyIncoming(plain, 'компьютера'); } catch {} };
function applyIncoming(plain, from) {
  let obj; try { obj = JSON.parse(plain); } catch { syStatus('Получены повреждённые данные', 'bad'); return; }
  const r = mergeBackup(obj); S.synced = Date.now(); save();
  syStatus(`Готово: данные получены от ${from || 'компьютера'}. Избранное ${S.favs.length}, история ${S.history.length}${r.keys.length ? ', ключей ' + r.keys.length : ''}.`, 'ok');
  toast('Синхронизация завершена');
  try { NATIVE.syncUpdate(exportJson()); } catch {}
  plChanged && plChanged();
}
document.addEventListener('click', (e) => {
  const el = e.target.closest('.f'); if (!el || route.name !== 'sync') return;
  if (el.dataset.sy === 'scan') scanNow();
  else if (el.dataset.sypc !== undefined) sendTo(+el.dataset.sypc);
});
