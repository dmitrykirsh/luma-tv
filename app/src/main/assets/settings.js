'use strict';
/* ================= Настройки: разделы слева, содержимое справа; ключи и плейлисты вводятся прямо на ТВ ================= */
window.RENDER = window.RENDER || {};

/* ---------- небольшое хранилище для крупных данных (плейлисты из файла) ---------- */
const IDB = {
  db: null,
  open() { return this.db || (this.db = new Promise((res, rej) => { const r = indexedDB.open('luma-tv', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); })); },
  async get(k) { const db = await this.open(); return new Promise((res) => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(undefined); }); },
  async put(k, v) { const db = await this.open(); return new Promise((res) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = () => res(true); tx.onerror = () => res(false); }); },
  async del(k) { const db = await this.open(); return new Promise((res) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').delete(k); tx.oncomplete = () => res(true); tx.onerror = () => res(false); }); }
};

/* ---------- окна: ввод и подтверждение ---------- */
function inputDlg({ title, sub, help, fields, ok = 'Сохранить', onOk }) {
  const m = $('#modal');
  m.innerHTML = `<div class="dlg top"><h3>${esc(title)}</h3>${sub ? `<p class="sub">${esc(sub)}</p>` : ''}${help ? `<div class="help">${help}</div>` : ''}
    <div class="fields">${fields.map((f) => `<label>${esc(f.label)}</label><input class="din f" tabindex="-1" data-id="${f.id}" data-k="in:${f.id}" type="text" value="${esc(f.value || '')}" placeholder="${esc(f.placeholder || '')}" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="next">`).join('')}</div>
    <div class="derr" id="dErr"></div>
    <div class="dbtns"><button class="btn primary f" tabindex="-1" data-dok="1" data-k="din:ok">${esc(ok)}</button><button class="btn f" tabindex="-1" data-dno="1" data-k="din:no">Отмена</button></div></div>`;
  m.classList.remove('hidden');
  const ins = $$('.din', m);
  ins.forEach((inp, i) => { inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); (ins[i + 1] || $('[data-dok]', m)).focus({ preventScroll: true }); } }; });
  window.__in = { fields, onOk, ins };
  ins[0]?.focus({ preventScroll: true });
}
function confirmDlg(text, yes, onYes) {
  dlg(`<h3>${esc(text)}</h3><div class="cmenu"><button class="btn primary f" tabindex="-1" data-cfy="1" data-k="cf:y">${esc(yes)}</button><button class="btn f" tabindex="-1" data-cfn="1" data-k="cf:n">Отмена</button></div>`);
  window.__cf = onYes; $('[data-cfn]')?.focus({ preventScroll: true });   // по умолчанию «Отмена»: случайное нажатие ничего не удалит
}
document.addEventListener('click', async (e) => {
  const el = e.target.closest('.f'); if (!el) return;
  if (el.dataset.cfy) { closeDlg(); const f = window.__cf; window.__cf = null; f && f(); return; }
  if (el.dataset.cfn) { closeDlg(); return; }
  if (el.dataset.dno) { closeDlg(); return; }
  if (el.dataset.dok && window.__in) {
    const { fields, onOk, ins } = window.__in; const vals = {}; fields.forEach((f, i) => { vals[f.id] = ins[i].value.trim(); });
    const err = $('#dErr'); err.textContent = ''; el.disabled = true; el.style.opacity = .6;
    let msg = null; try { msg = await onOk(vals); } catch { msg = 'Не получилось. Проверьте интернет и попробуйте ещё раз.'; }
    el.disabled = false; el.style.opacity = 1;
    if (msg) err.textContent = msg; else { window.__in = null; closeDlg(); }
  }
});

/* ---------- ключи сервисов ---------- */
const UA_SET = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36';
const KEYS = {
  tmdb: { name: 'TMDB', use: 'Кадры, логотипы, рекомендации, актёры и тренды на главной', re: /^[\w.-]{20,}$/, help: 'Бесплатный ключ: <b>themoviedb.org</b> → Настройки → API → «Ключ API (v3)» (или длинный токен, начинающийся с eyJ).',
    async check(k) { const bearer = k.startsWith('eyJ'); const r = await fetch('https://api.themoviedb.org/3/configuration' + (bearer ? '' : '?api_key=' + encodeURIComponent(k)), bearer ? { headers: { Authorization: 'Bearer ' + k } } : {}); return r.status === 401 ? 'BAD' : r.ok ? '' : 'NET'; } },
  omdb: { name: 'OMDb', use: 'Рейтинги Rotten Tomatoes и Metacritic', re: /^[A-Za-z0-9]{6,14}$/, help: 'Бесплатный ключ: <b>omdbapi.com</b> → API Key (до 1000 запросов в день). Ключ придёт на почту.',
    async check(k) { const r = await fetch('https://www.omdbapi.com/?i=tt0111161&apikey=' + encodeURIComponent(k)); const j = await r.json().catch(() => ({})); return j.Response === 'False' ? (/limit/i.test(j.Error || '') ? 'LIMIT' : 'BAD') : ''; } },
  trakt: { name: 'Trakt', use: 'Подборки Trakt', re: /^[A-Za-z0-9_-]{30,100}$/, help: 'Бесплатно: <b>trakt.tv</b> → Settings → Your API Apps → New Application (Redirect URI: http://localhost) → скопируйте <b>Client ID</b>.',
    async check(k) { const r = await fetch(tvPx('https://api.trakt.tv/lists/popular?limit=1', 'Luma-TV', '', true, { 'trakt-api-version': '2', 'trakt-api-key': k })); return r.status === 401 || r.status === 403 ? 'BAD' : r.ok ? '' : 'NET'; } },
  mdblist: { name: 'MDBList', use: 'Подборки MDBList', re: /^[A-Za-z0-9_-]{16,80}$/, help: 'Бесплатно: <b>mdblist.com</b> → Preferences → API Key.',
    async check(k) { const r = await fetch(tvPx('https://api.mdblist.com/lists/top?limit=1&apikey=' + encodeURIComponent(k), 'Luma-TV', '', true)); return r.status === 401 || r.status === 403 ? 'BAD' : r.ok ? '' : 'NET'; } }
};
const KEY_ERR = { BAD: 'Ключ не подошёл: проверьте, что скопировали его целиком.', NET: 'Сервис не ответил. Проверьте интернет.', LIMIT: 'Достигнут дневной лимит ключа, но сам ключ рабочий.' };
function keyDlg(name) {
  const K = KEYS[name];
  inputDlg({
    title: 'Ключ ' + K.name, sub: K.use, help: K.help, ok: 'Проверить и сохранить',
    fields: [{ id: 'key', label: 'Ключ', placeholder: 'Вставьте или введите ключ' }],
    async onOk({ key }) {
      if (!K.re.test(key)) return 'Это не похоже на ключ ' + K.name + '. Проверьте длину и символы.';
      const bad = await K.check(key);
      if (bad && bad !== 'LIMIT') return KEY_ERR[bad];
      S.secrets = S.secrets || {}; S.secrets[name] = key; save();
      tmFindCache.clear(); try { localStorage.removeItem('luma.tv.rows'); } catch {} tmRows = {};
      toast('Ключ ' + K.name + ' сохранён'); refreshHere('keys');
      return null;
    }
  });
}

/* ---------- плейлисты каналов ---------- */
function addPlaylistDlg() {
  inputDlg({
    title: 'Плейлист каналов по ссылке', sub: 'Ссылка на M3U или M3U8', ok: 'Добавить',
    fields: [{ id: 'name', label: 'Название (необязательно)', placeholder: 'Например, Мой список' }, { id: 'url', label: 'Ссылка', placeholder: 'https://…' }],
    async onOk({ name, url }) {
      if (!/^https?:\/\/\S+$/i.test(url)) return 'Нужна ссылка вида https://…';
      if (customLists().some((x) => x.url === url)) return 'Такой плейлист уже добавлен.';
      let chs; try { chs = await tvFetchList(url, false); } catch { return 'Не получилось прочитать плейлист по этой ссылке.'; }
      if (!chs.length) return 'В плейлисте не нашлось каналов.';
      customLists().push({ id: Math.random().toString(16).slice(2, 10), name: name || new URL(url).hostname, url, enabled: true });
      save(); plChanged(); toast(`Плейлист добавлен: ${chs.length} каналов`); refreshHere('plus');
      return null;
    }
  });
}
function pickPlaylistFile() {
  if (!NATIVE || !NATIVE.pickFile) { toast('Выбор файла недоступен в этой сборке'); return; }
  toast('Откроется выбор файла…'); NATIVE.pickFile();
}
window.lumaFilePicked = async (json) => {
  let r; try { r = JSON.parse(json); } catch { return; }
  if (r.error) { toast(r.error === 'NO_APP' ? 'На этом ТВ нет приложения для выбора файлов. Добавьте плейлист по ссылке.' : r.error === 'TOO_BIG' ? 'Файл слишком большой (больше 12 МБ).' : 'Файл не выбран'); return; }
  const chs = tvToChannels(tvParseM3u(r.text, false), '');
  if (!chs.length) { toast('В файле не нашлось каналов (нужен M3U/M3U8)'); return; }
  const id = Math.random().toString(16).slice(2, 10);
  await IDB.put('pl:' + id, r.text);
  customLists().push({ id, name: (r.name || 'Файл').replace(/\.[^.]+$/, ''), file: true, count: chs.length, enabled: true });
  save(); plChanged(); toast(`Плейлист добавлен: ${chs.length} каналов`);
  if (route.name === 'settings') refreshHere('pfile');
};

/* ---------- экран ---------- */
const ST_SECTIONS = [['sync', 'Синхронизация', 'sync', 'ПК и телефон'], ['keys', 'Сервисы и ключи', 'key', 'TMDB, OMDb, Trakt, MDBList'], ['channels', 'Каналы', 'live', 'Плейлисты'], ['look', 'Оформление', 'film', 'Заставка и фон'], ['data', 'Данные', 'trash', 'История и кэш'], ['upd', 'Обновления', 'refresh', 'Версия приложения'], ['about', 'О приложении', 'info', 'Luma TV']];
let stCur = 'sync';
function renderSettings3(r, t) {
  stCur = r.sec || stCur || 'sync';
  view.innerHTML = `<div class="page"><div class="st"><nav class="st-nav">${ST_SECTIONS.map(([k, l, ic, sub]) => `<button class="st-it f ${k === stCur ? 'on' : ''}" tabindex="-1" data-st="${k}" data-k="st:${k}"><span class="sti">${ico(ic)}</span><span><b>${l}</b><small>${sub}</small></span></button>`).join('')}</nav><div class="st-pane" id="stPane"></div></div></div>`;
  paintPane();
  ($(`[data-st=${stCur}]`) || $('.st-it'))?.focus({ preventScroll: true });
}
window.RENDER.settings = renderSettings3;

function lastSyncText() { return S.synced ? new Date(S.synced).toLocaleString('ru', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : (S.imported ? new Date(S.imported).toLocaleString('ru', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : 'ещё не было'); }
function paintPane() {
  const p = $('#stPane'); if (!p) return;
  $$('.st-it').forEach((b) => b.classList.toggle('on', b.dataset.st === stCur));
  const card = (ic, title, text) => `<div class="sc hero"><div class="sci">${ico(ic)}</div><div><b>${title}</b><p>${text}</p></div></div>`;
  if (stCur === 'sync') {
    p.innerHTML = card('sync', 'Компьютер и телефон', 'Luma на ПК и ТВ в одной сети обменяются избранным, историей, прогрессом, подборками, каналами и ключами. Без облака и аккаунтов.') +
      `<button class="srow f" tabindex="-1" data-sact="sync" data-k="s:sync"><span class="sri">${ico('tv')}</span><span><b>Найти компьютер в сети</b><small>Или откройте на ПК Настройки → Телевизор и найдите этот ТВ</small></span><i>›</i></button>
       <button class="srow f" tabindex="-1" data-sact="phone" data-k="s:phone"><span class="sri">${ico('search')}</span><span><b>Принять файл с телефона</b><small>Показать QR-код для резервной копии (.luma)</small></span><i>›</i></button>
       <div class="smeta">Последняя синхронизация: ${esc(lastSyncText())}</div>`;
  } else if (stCur === 'keys') {
    p.innerHTML = card('key', 'Сервисы и ключи', 'Ключи нужны для кадров, рейтингов и подборок. Они бесплатные, а вводить их можно прямо здесь или получить синхронизацией с ПК.') +
      Object.entries(KEYS).map(([k, K]) => { const on = !!(S.secrets && S.secrets[k]); return `<button class="srow f" tabindex="-1" data-key="${k}" data-k="key:${k}"><span class="sri bd ${on ? 'ok' : ''}">${on ? '✓' : '—'}</span><span><b>${K.name}</b><small>${esc(K.use)}${k === 'tmdb' && !on ? ' Сейчас работает общий тестовый ключ: он может перестать работать, лучше введите свой.' : ''}</small></span><i>${on ? 'Изменить' : 'Ввести'}</i></button>`; }).join('');
  } else if (stCur === 'channels') {
    const pls = customLists();
    p.innerHTML = card('live', 'Плейлисты каналов', 'Встроенные: IPTVru (основной и стабильные). Свои можно добавить ссылкой или файлом M3U.') +
      pls.map((e) => `<button class="srow f" tabindex="-1" data-plrow="${esc(e.id)}" data-k="plrow:${esc(e.id)}"><span class="sri">${ico('list')}</span><span><b>${esc(e.name)}</b><small>${e.file ? 'Файл' : esc(e.url)}${e.enabled === false ? ' · выключен' : ''}</small></span><i>⋯</i></button>`).join('') +
      `<button class="srow f" tabindex="-1" data-sact="pllink" data-k="plus"><span class="sri">＋</span><span><b>Добавить по ссылке</b><small>Адрес M3U/M3U8, ввод на ТВ или с телефона</small></span><i>›</i></button>
       <button class="srow f" tabindex="-1" data-sact="plfile" data-k="pfile"><span class="sri">${ico('film')}</span><span><b>Добавить из файла</b><small>Файл .m3u или .m3u8 из памяти ТВ или флешки</small></span><i>›</i></button>
       <button class="srow f" tabindex="-1" data-sact="plphone" data-k="pphone"><span class="sri">${ico('search')}</span><span><b>Отправить ссылку с телефона</b><small>Откроется QR-код</small></span><i>›</i></button>`;
  } else if (stCur === 'look') {
    const on = (k) => optGet(k, '1') !== '0';
    p.innerHTML = card('film', 'Оформление', 'Заставка при запуске и анимированный фон.') +
      `<button class="srow f" tabindex="-1" data-sact="opt:intro" data-k="o:intro"><span class="sri">${ico('film')}</span><span><b>Заставка со звуком</b><small>Короткая анимация логотипа и звук при запуске</small></span><i>${on('luma.tv.intro') ? 'Вкл' : 'Выкл'}</i></button>
       <button class="srow f" tabindex="-1" data-sact="opt:holi" data-k="o:holi"><span class="sri">${ico('film')}</span><span><b>Праздничные подборки</b><small>Баннер с фильмами к Новому году, Хэллоуину, 9 мая и другим датам</small></span><i>${on('luma.tv.holi') ? 'Вкл' : 'Выкл'}</i></button>
       <button class="srow f" tabindex="-1" data-sact="opt:pclock" data-k="o:pclock"><span class="sri">${ico('refresh')}</span><span><b>Часы в плеере</b><small>Время в правом верхнем углу: только с панелью управления или всё время</small></span><i>${({ '0': 'Выкл', '1': 'С панелью', '2': 'Всегда' })[optGet('luma.tv.pclock', '1')] || 'С панелью'}</i></button>
       <button class="srow f" tabindex="-1" data-sact="opt:aurora" data-k="o:aurora"><span class="sri">${ico('star')}</span><span><b>Анимированный фон</b><small>Медленное тёмное переливание за каталогом</small></span><i>${on('luma.tv.aurora') ? 'Вкл' : 'Выкл'}</i></button>`;
  } else if (stCur === 'data') {
    p.innerHTML = card('trash', 'Данные на этом ТВ', 'История и прогресс хранятся только на ТВ. Избранное и подборки можно синхронизировать с ПК.') +
      `<button class="srow f" tabindex="-1" data-sact="clearhist" data-k="d:hist"><span class="sri">${ico('trash')}</span><span><b>Очистить историю просмотров</b><small>${S.history.length} записей и место просмотра в фильмах; избранное останется</small></span><i>›</i></button>
       <button class="srow f" tabindex="-1" data-sact="clearcache" data-k="d:cache"><span class="sri">${ico('refresh')}</span><span><b>Очистить кэш</b><small>Каналы, телепрограмма, оценки и ряды TMDB загрузятся заново</small></span><i>›</i></button>`;
  } else if (stCur === 'upd') {
    p.innerHTML = card('refresh', 'Обновления', 'Новые версии берутся из релизов на GitHub и ставятся только по вашей кнопке.') + updRow();
  } else {
    p.innerHTML = card('info', 'Luma TV ' + (NATIVE ? NATIVE.version() : 'dev'), 'Включи свою историю. Каталог, подборки, телеканалы с программой и плеер под пульт.') +
      `<div class="sc"><p>Рейтинги принадлежат их сервисам (Кинопоиск, IMDb, TMDB, Letterboxd, Rotten Tomatoes, Metacritic). Приложение использует TMDB API, но не одобрено и не сертифицировано TMDB.</p></div>`;
  }
}
let stT = 0;
document.addEventListener('focusin', (e) => { const el = e.target.closest?.('.f'); if (el && el.dataset.st && route.name === 'settings' && el.dataset.st !== stCur) { clearTimeout(stT); stT = setTimeout(() => { stCur = el.dataset.st; paintPane(); }, 200); } });
document.addEventListener('click', (e) => {
  const el = e.target.closest('.f'); if (!el || route.name !== 'settings') return;
  if (el.dataset.st) { stCur = el.dataset.st; paintPane(); $('#stPane .f')?.focus({ preventScroll: true }); return; }
  if (el.dataset.key) { keyDlg(el.dataset.key); return; }
  const a = el.dataset.sact;
  if (a === 'opt:pclock') {   // три состояния по кругу: с панелью, всегда, выкл
    const cur = optGet('luma.tv.pclock', '1'), v = cur === '1' ? '2' : cur === '2' ? '0' : '1';
    try { localStorage.setItem('luma.tv.pclock', v); } catch {}
    pclockApply(v); paintPane(); $('[data-sact="opt:pclock"]')?.focus({ preventScroll: true });
    return;
  }
  if (a && a.startsWith('opt:')) {
    const k = 'luma.tv.' + a.slice(4), v = optGet(k, '1') === '0' ? '1' : '0';
    try { localStorage.setItem(k, v); } catch {}
    if (a === 'opt:aurora') document.body.classList.toggle('noaurora', v === '0');
    paintPane(); $(`[data-sact="${a}"]`)?.focus({ preventScroll: true });
    return;
  }
  if (a === 'sync') go('sync');
  else if (a === 'phone') go('import');
  else if (a === 'pllink') addPlaylistDlg();
  else if (a === 'plfile') pickPlaylistFile();
  else if (a === 'plphone') go('plimport');
  else if (a === 'clearhist') confirmDlg('Очистить историю и место просмотра?', 'Очистить', () => { S.history.forEach((h) => goneMark('h', h.id)); S.history = []; S.progress = {}; save(); toast('История очищена'); refreshHere('d:hist'); });
  else if (a === 'clearcache') { for (const k of ['luma.tv.ch2', 'luma.tv.epg', 'luma.tv.rows', 'luma.tv.m', 'luma.tv.lm', 'luma.tv.lb', 'luma.tv.omdb']) { try { localStorage.removeItem(k); } catch {} } tmFindCache.clear(); tmRows = {}; TVD.channels = []; toast('Кэш очищен'); }
});
