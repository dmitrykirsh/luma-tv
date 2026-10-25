'use strict';
/* ================= Обновление приложения: проверка релизов GitHub и установка APK ================= */
const UPD_REPO = 'dmitrykirsh/luma-tv';
const UPD = { state: 'idle', cur: '', version: '', notes: '', url: '', pct: 0, err: '', at: 0 };
const semParts = (v) => String(v || '').replace(/^v/i, '').split(/[.\-+]/).map((x) => parseInt(x, 10) || 0);
const semNewer = (a, b) => { const x = semParts(a), y = semParts(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };

async function updCheck(silent) {
  if (['checking', 'downloading', 'installing'].includes(UPD.state)) return;
  UPD.cur = NATIVE ? NATIVE.version() : 'dev'; UPD.state = 'checking'; updPaint();
  try {
    // для проверки без публикации: localStorage['luma.tv.feed'] = адрес JSON в формате GitHub API
    let feed = ''; try { feed = localStorage.getItem('luma.tv.feed') || ''; } catch {}
    const url = feed || `https://api.github.com/repos/${UPD_REPO}/releases/latest`;
    const r = await fetch(tvPx(url, 'Luma-TV', '', true, { Accept: 'application/vnd.github+json' }));
    if (r.status === 404) { UPD.state = 'none'; UPD.at = Date.now(); updPaint(); return; }
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    const apk = (j.assets || []).find((a) => /\.apk$/i.test(a.name));
    UPD.at = Date.now();
    if (apk && semNewer(j.tag_name, UPD.cur)) {
      UPD.state = 'available'; UPD.version = String(j.tag_name).replace(/^v/i, ''); UPD.notes = String(j.body || '').replace(/[#*`>]/g, '').trim().slice(0, 600); UPD.url = apk.browser_download_url;
      if (silent) toast('Доступно обновление Luma TV ' + UPD.version + ': Настройки → Обновления');
    } else UPD.state = 'none';
  } catch (e) { UPD.state = silent ? 'idle' : 'error'; UPD.err = 'Не получилось проверить обновления. Проверьте интернет.'; }
  updPaint();
}
function updInstall() {
  if (UPD.state !== 'available' && UPD.state !== 'needperm' && UPD.state !== 'error') return;
  if (!NATIVE || !NATIVE.installUpdate) { toast('Установка недоступна в этой сборке'); return; }
  UPD.state = 'downloading'; UPD.pct = 0; updPaint();
  NATIVE.installUpdate(UPD.url);
}
window.lumaUpdateState = (s) => {
  UPD.state = s.state; if (s.pct != null) UPD.pct = s.pct; if (s.msg) UPD.err = 'Не получилось скачать обновление: ' + s.msg;
  if (s.state === 'needperm') toast('Разрешите установку из этого приложения и нажмите «Обновить» ещё раз');
  updPaint();
};
function updText() {
  const s = UPD.state, cur = UPD.cur || (NATIVE ? NATIVE.version() : 'dev');
  if (s === 'checking') return ['Проверяем обновления…', ''];
  if (s === 'available') return [`Доступна версия ${UPD.version}`, UPD.notes || 'Нажмите OK, чтобы скачать и установить'];
  if (s === 'downloading') return [`Скачиваем версию ${UPD.version}… ${UPD.pct}%`, 'После скачивания откроется установщик Android'];
  if (s === 'needperm') return ['Нужно разрешение на установку', 'Включите «Установка из этого источника» для Luma TV и нажмите OK ещё раз'];
  if (s === 'installing') return ['Открываем установщик…', 'Подтвердите установку на экране'];
  if (s === 'error') return ['Не получилось', UPD.err || 'Попробуйте ещё раз'];
  if (s === 'none') return ['У вас последняя версия', `Luma TV ${cur} · проверено ${new Date(UPD.at).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}`];
  return ['Обновления', `Luma TV ${cur} · нажмите OK, чтобы проверить`];
}
function updRow() {
  const [h, sub] = updText();
  const act = UPD.state === 'available' || UPD.state === 'needperm' || UPD.state === 'error' && UPD.url ? 'updinstall' : 'updcheck';
  return `<button class="row f" tabindex="-1" data-act="${act}" data-k="upd" id="updRow"><div><b>${esc(h)}</b><small>${esc(sub)}</small></div>${UPD.state === 'downloading' ? '' : '›'}</button>`;
}
function updPaint() { const el = $('#updRow'); if (el) { const [h, sub] = updText(); $('b', el).textContent = h; $('small', el).textContent = sub; el.dataset.act = UPD.state === 'available' || UPD.state === 'needperm' || (UPD.state === 'error' && UPD.url) ? 'updinstall' : 'updcheck'; } }
document.addEventListener('click', (e) => {
  const el = e.target.closest('.f'); if (!el) return;
  if (el.dataset.act === 'updcheck') updCheck(false); else if (el.dataset.act === 'updinstall') updInstall();
});
// тихая проверка при запуске и раз в 6 часов
setTimeout(() => { updCheck(true); setInterval(() => updCheck(true), 6 * 3600e3); }, 15000);
