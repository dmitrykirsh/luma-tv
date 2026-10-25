'use strict';
/* ================= Долгое нажатие OK (меню карточки), свои плейлисты каналов, настройки ================= */
window.RENDER = window.RENDER || {};

/* ---------- долгое нажатие OK на карточке фильма или канала ---------- */
const LP = { el: null, t: 0, fired: false };
window.lpDown = (el, e) => {
  if (!el.matches('.card[data-id], .chc')) return false;
  if (e.repeat || LP.el === el) return true;   // при удержании Android присылает повторы как обычные keydown (repeat=false): таймер взводим один раз, пока клавишу не отпустили
  clearTimeout(LP.t); LP.el = el; LP.fired = false;
  LP.t = setTimeout(() => { LP.fired = true; cardMenu(el); }, 650);
  return true;
};
document.addEventListener('keyup', (e) => {
  if (e.key !== 'Enter' || !LP.el) return;
  clearTimeout(LP.t); const el = LP.el, fired = LP.fired; LP.el = null;
  if (!fired && document.contains(el)) el.click();
});

function refreshHere(focusKey) { show(route, { scroll: view.scrollTop, focus: focusKey }); }

async function cardMenu(el) {
  const key = el.dataset.k;
  if (el.classList.contains('chc')) {
    const c = tvChan(el.dataset.ch); if (!c) return;
    const fav = tvIsFav(c.id), recent = !!tvStats()[c.id]?.last;
    dlg(`<h3>${esc(c.name)}</h3><p class="sub">${esc(c.group)}</p><div class="cmenu">
      <button class="btn f" tabindex="-1" data-cm="chfav" data-k="cm:fav">${fav ? 'Убрать из избранного' : 'В избранное'}</button>
      ${recent ? '<button class="btn f" tabindex="-1" data-cm="chrecent" data-k="cm:rec">Убрать из недавних</button>' : ''}</div>`);
    window.__cm = { id: c.id, key }; return;
  }
  const id = +el.dataset.id;
  const name = $('.t', el)?.textContent || '';
  const fav = isFav(id), hist = S.history.some((h) => h.id === id);
  const inCont = !!el.closest('#rCont');   // строка «Продолжить просмотр»: удаление из неё первым пунктом
  const bHist = hist ? `<button class="btn f" tabindex="-1" data-cm="hist" data-k="cm:hist">${inCont ? 'Убрать из «Продолжить просмотр»' : 'Убрать из истории просмотров'}</button>` : '';
  const bFav = `<button class="btn f" tabindex="-1" data-cm="fav" data-k="cm:fav">${fav ? 'Убрать из избранного' : 'В избранное'}</button>`;
  dlg(`<h3>${esc(name)}</h3><p class="sub">Что сделать?</p><div class="cmenu">${inCont ? bHist + bFav : bFav + bHist}</div>`);
  window.__cm = { id, key };
}

document.addEventListener('click', async (e) => {
  const el = e.target.closest('.f'); if (!el) return;
  if (el.dataset.cm) {
    const { id, key } = window.__cm || {}; const cm = el.dataset.cm;
    closeDlg();
    if (cm === 'fav') {
      if (isFav(id)) { S.favs = S.favs.filter((f) => f.id !== id); toast('Убрано из избранного'); }
      else { let it = S.history.find((h) => h.id === id) || S.favs.find((f) => f.id === id); if (!it) { try { it = brief(await info(id)); } catch {} } if (it) { S.favs.unshift(brief(it)); toast('Добавлено в избранное'); } }
      save();
    } else if (cm === 'hist') {
      S.history = S.history.filter((h) => h.id !== id);
      for (const k of Object.keys(S.progress)) if (k === String(id) || k.startsWith(id + ':')) delete S.progress[k];
      save(); toast('Убрано из истории');
    } else if (cm === 'chfav') { const on = tvToggleFav(id); toast(on ? 'Канал в избранном' : 'Убрано из избранного'); }
    else if (cm === 'chrecent') { const st = tvStats(); if (st[id]) delete st[id]; save(); toast('Убрано из недавних'); }
    refreshHere(key);
    return;
  }
  if (el.dataset.plrow) { plRowMenu(el.dataset.plrow); return; }
  if (el.dataset.plop) { plOp(el.dataset.plop, el.dataset.plid); return; }
  if (el.dataset.act === 'addpl') { go('plimport'); return; }
  if (el.dataset.act === 'plback') { stopImport(); if (!back()) topLevel('settings'); return; }
});

/* ---------- свои плейлисты каналов: ссылка приходит с телефона ---------- */
const customLists = () => (tvX().tvCustom = tvX().tvCustom || []);
function plRowMenu(id) {
  const e = customLists().find((x) => x.id === id); if (!e) return;
  dlg(`<h3>${esc(e.name)}</h3><p class="sub">${esc(e.url)}</p><div class="cmenu">
    <button class="btn f" tabindex="-1" data-plop="toggle" data-plid="${esc(id)}" data-k="pl:t">${e.enabled === false ? 'Включить' : 'Выключить'}</button>
    <button class="btn f" tabindex="-1" data-plop="del" data-plid="${esc(id)}" data-k="pl:d">Удалить</button></div>`);
}
function plChanged() { try { localStorage.removeItem('luma.tv.ch2'); localStorage.removeItem('luma.tv.epg'); } catch {} TVD.channels = []; TVD.epg = { programmes: {}, alias: {}, at: 0 }; }
function plOp(op, id) {
  closeDlg();
  const a = customLists(), i = a.findIndex((x) => x.id === id); if (i < 0) return;
  if (op === 'toggle') { a[i].enabled = a[i].enabled === false; toast(a[i].enabled ? 'Плейлист включён' : 'Плейлист выключен'); }
  else { a.splice(i, 1); toast('Плейлист удалён'); }
  save(); plChanged(); refreshHere('plrow:' + id);
}
let plWaiting = false;
function renderPlImport() {
  let url = '', err = '';
  try { const r = JSON.parse(NATIVE ? NATIVE.startImport() : '{"error":"NO_NATIVE"}'); url = r.url ? r.url + '&m=pl' : ''; err = r.error || ''; } catch { err = 'ERR'; }
  plWaiting = !!url; impWaiting = !!url;
  let qr = '';
  if (url) { const q = qrcode(0, 'M'); q.addData(url); q.make(); qr = q.createSvgTag({ cellSize: 6, margin: 0, scalable: true }); }
  view.innerHTML = `<div class="page"><div class="imp"><ol>
    <li>Скопируйте на телефоне ссылку на плейлист каналов (M3U или M3U8).</li>
    <li>Наведите камеру телефона на QR-код справа и откройте страницу (телефон и ТВ в одной Wi-Fi сети).</li>
    <li>Вставьте ссылку и нажмите «Добавить на ТВ»: каналы появятся в разделе «Каналы».</li></ol>
    <div>${url ? `<div class="qr">${qr}<div class="url">${esc(url.replace('http://', ''))}</div></div><div class="st" id="impSt">Ждём ссылку с телефона…</div>` : `<div class="st bad">${err === 'NO_NET' ? 'ТВ не подключён к домашней сети' : 'Не удалось запустить приём'}</div>`}</div></div>
    <div style="padding:0 48px"><button class="btn f" tabindex="-1" data-act="plback" data-k="plback">Назад</button></div></div>`;
  $('[data-act=plback]').focus({ preventScroll: true });
}
window.lumaPlaylist = async (json) => {
  let p; try { p = JSON.parse(json); } catch { return; }
  const st = $('#impSt'); if (st) { st.className = 'st'; st.textContent = 'Проверяем плейлист…'; }
  try {
    const chs = await tvFetchList(p.url, false);
    if (!chs.length) throw new Error('EMPTY');
    const a = customLists();
    if (!a.some((x) => x.url === p.url)) a.push({ id: Math.random().toString(16).slice(2, 10), name: p.name || new URL(p.url).hostname, url: p.url, enabled: true });
    save(); plChanged(); stopImport();
    toast(`Плейлист добавлен: ${chs.length} каналов`);
    topLevel('settings');
  } catch { if (st) { st.className = 'st bad'; st.textContent = 'Не получилось прочитать плейлист по этой ссылке. Проверьте её и отправьте ещё раз.'; } }
};
window.RENDER.plimport = renderPlImport;

/* ---------- настройки ---------- */
function renderSettings2() {
  const names = { tmdb: 'TMDB', omdb: 'OMDb', trakt: 'Trakt', mdblist: 'MDBList' };
  const keys = Object.keys(names).map((k) => `${names[k]} ${S.secrets && S.secrets[k] ? '✓' : '—'}`).join('   ');
  const pls = customLists();
  view.innerHTML = `<div class="page"><div class="set">
    <button class="row f" tabindex="-1" data-act="import" data-k="imp"><div><b>Перенос с телефона</b><small>Резервная копия Luma (.luma): избранное, история, прогресс, подборки, каналы и ключи${S.imported ? ' · последний перенос ' + new Date(S.imported).toLocaleDateString('ru') : ''}</small></div>›</button>
    <div class="row f" tabindex="-1" data-k="keys"><div><b>Ключи сервисов</b><small>${esc(keys)}${S.secrets && Object.keys(S.secrets).length ? '' : ' · приедут вместе с резервной копией'}</small></div></div>
    <div class="row f" tabindex="-1" data-k="plb"><div><b>Плейлисты каналов</b><small>Встроенные: IPTVru (основной и стабильные)${pls.length ? ' · свои: ' + pls.length : ''}</small></div></div>
    ${pls.map((e) => `<button class="row sub f" tabindex="-1" data-plrow="${esc(e.id)}" data-k="plrow:${esc(e.id)}"><div><b>${esc(e.name)}</b><small>${esc(e.url)}${e.enabled === false ? ' · выключен' : ''}</small></div>⋯</button>`).join('')}
    <button class="row f" tabindex="-1" data-act="addpl" data-k="addpl"><div><b>Добавить плейлист каналов</b><small>Ссылку на M3U отправляете с телефона</small></div>›</button>
    ${updRow()}
    <button class="row f" tabindex="-1" data-act="clearhist" data-k="clr"><div><b>Очистить историю просмотров</b><small>Избранное останется на месте</small></div></button>
    <div class="row f" tabindex="-1" data-k="ver"><div><b>Luma TV ${esc(NATIVE ? NATIVE.version() : 'dev')}</b><small>Включи свою историю</small></div></div></div></div>`;
}
window.RENDER.settings = renderSettings2;

/* ---------- окно выбора из списка (фильтры, категории): сетка крупных кнопок вместо длинного ряда ---------- */
function pickDlg(title, items, cb) {
  window.__pk = { items, cb };
  const cols = items.length > 24 ? 4 : items.length > 8 ? 3 : 2;
  dlg(`<h3>${esc(title)}</h3><div class="pgrid c${cols}">${items.map((it, i) => `<button class="pk f ${it.on ? 'on' : ''}" tabindex="-1" data-pk="${i}" data-k="pk:${i}"><i>${it.on ? '✓' : ''}</i><span>${esc(it.label)}</span>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</button>`).join('')}</div>`);
  const cur = $('#modal .pk.on') || $('#modal .pk'); cur?.focus({ preventScroll: true }); cur?.scrollIntoView({ block: 'center' });
}
document.addEventListener('click', (e) => {
  const el = e.target.closest('.f'); if (!el || el.dataset.pk === undefined) return;
  const it = window.__pk.items[+el.dataset.pk]; closeDlg(); window.__pk.cb(it);
});
