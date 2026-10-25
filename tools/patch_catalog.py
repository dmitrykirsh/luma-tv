import os, re
os.chdir(r'D:\lift\tv\app\src\main\assets')
s = open('app.js', encoding='utf8').read()

# ---- карточка: оригинальное название и строка «год · страна · жанры» (для каталога) ----
old = '''    <div class="t">${esc(it.name)}</div><div class="s">${esc(sub)}</div></div>`;
}'''
assert old in s
s = s.replace(old, '''    <div class="t">${esc(it.name)}</div>${opt.orig && it.origin_name && String(it.origin_name).trim().toLowerCase() !== String(it.name).trim().toLowerCase() ? `<div class="o">${esc(it.origin_name)}</div>` : ''}<div class="s">${esc(sub)}</div></div>`;
}

// Страны и жанры в карточках каталога: список от Lift их не содержит, поэтому добираем пачкой (до 50 фильмов за запрос)
const CARD_INFO = new Map(); let enrichT = 0;
async function apiPost(p, body) {
  let err;
  for (let k = 0; k < HOSTS.length; k++) {
    const i = (hostI + k) % HOSTS.length;
    try { const r = await fetch('https://' + HOSTS[i] + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
    catch (e) { err = e; }
  }
  throw err;
}
function enrichCards() {
  clearTimeout(enrichT);
  enrichT = setTimeout(async () => {
    const pending = () => $$('#grid .card[data-id]:not(.skel)').filter((c) => !c.dataset.e);
    const fill = () => pending().forEach((c) => { const m = CARD_INFO.get(c.dataset.id); if (m != null) { c.dataset.e = '1'; const sl = $('.s', c); if (m && sl) sl.textContent = m; } });
    fill();
    const ids = [...new Set(pending().map((c) => c.dataset.id))].slice(0, 50);
    if (!ids.length) return;
    try {
      const r = await apiPost('/info/batch', { ids: ids.map(Number) });
      for (const it of (r && r.items) || []) {
        const inf = it.info || {};
        CARD_INFO.set(String(it.id), [it.year || inf.year, (inf.country || []).slice(0, 2).join(', '), (inf.genre || []).slice(0, 2).join(', ')].filter(Boolean).join(' · '));
      }
    } catch {}
    for (const id of ids) if (!CARD_INFO.has(id)) CARD_INFO.set(id, '');
    fill();
    if (pending().length) enrichCards();
  }, 120);
}''', 1)

# ---- каталог: сортировки, жанры, типы ----
a = s.index("let secState = {")
b = s.index("let searchSeq = 0")
new = r'''let secState = { sec: '', sort: 'popular', genre: '', page: 1, loading: false, done: false, gen: 0 };
const GENRES = ['Боевик', 'Комедия', 'Драма', 'Триллер', 'Фантастика', 'Ужасы', 'Детектив', 'Фэнтези', 'Мелодрама', 'Приключения', 'Криминал', 'Семейный'];
const capw = (x) => (x ? x[0].toUpperCase() + x.slice(1) : x);
const SEC_TYPES = ['films', 'series', 'cartoons', 'anime', 'tvshows'];
async function renderSection(r, t) {
  const sec = r.sec || r.name;
  const sort = r.sort || (secState.sec === sec ? secState.sort : 'popular');
  const genre = capw(r.genre || '');
  secState = { sec, sort, genre, page: 1, loading: false, done: false, gen: secState.gen + 1 };
  const gl = [...(genre && !GENRES.includes(genre) ? [genre] : []), ...GENRES];
  view.innerHTML = `<div class="page">${genre ? `<div class="subttl">${esc(genre)} · <span>${esc(SECTIONS[sec].title)}</span></div>` : ''}
    <div class="chips">${SORTS.map(([k, l]) => `<button class="chip f ${k === sort ? 'on' : ''}" tabindex="-1" data-sort="${k}" data-k="sort:${k}">${l}</button>`).join('')}</div>
    ${genre ? `<div class="chips types">${SEC_TYPES.map((k) => `<button class="chip f ${k === sec ? 'on' : ''}" tabindex="-1" data-type="${k}" data-k="type:${k}">${SECTIONS[k].title}</button>`).join('')}</div>` : ''}
    <div class="chips genrow"><button class="chip f ${genre ? '' : 'on'}" tabindex="-1" data-gen="" data-k="gen:all">Все жанры</button>${gl.map((g) => `<button class="chip f ${g === genre ? 'on' : ''}" tabindex="-1" data-gen="${esc(g)}" data-k="gen:${esc(g)}">${esc(g)}</button>`).join('')}</div>
    <div class="grid" id="grid">${skel(14)}</div></div>`;
  await loadMore(t, true);
  if (alive(t)) { const c = $('#grid .card'); (c || $('.chip.on'))?.focus({ preventScroll: true }); }
}
async function loadMore(t, first) {
  if (secState.loading || secState.done) return;
  secState.loading = true;
  const gen = secState.gen;
  const strict = secState.sort === 'imdb' || secState.sort === 'kp';
  let added = 0, guard = 0;
  try {
    while (!secState.done && added < 14 && guard++ < 8) {
      const { sec, sort, genre, page } = secState;
      const q = new URLSearchParams({ category: SECTIONS[sec].cat, page, limit: 30 });
      if (sort === 'new') q.set('last', 'true'); else q.set('sort', sort);
      if (genre) q.set('genre', genre);
      if (sort === 'imdb') q.set('kpMin', 6);
      const rr = await api('/list/categories?' + q);
      let d = Array.isArray(rr) ? rr : (rr.items || []);
      if (!alive(t) || gen !== secState.gen) return;
      secState.page++;
      if (!d.length) { secState.done = true; break; }
      // сортировки по рейтингу: отсекаем фильмы без отзывов (у них «идеальные» 9.9 из одного голоса)
      if (strict) d = d.filter((it) => (it.views || 0) >= (sort === 'imdb' ? 30 : 5) && rate(it) > 0);
      if (!d.length) continue;
      if (first && !added) $('#grid').innerHTML = '';
      $('#grid').insertAdjacentHTML('beforeend', d.map((it) => cardHTML(it, 'g:' + it.id, { orig: true })).join(''));
      hookImages($('#grid')); added += d.length;
    }
    if (first && !added && alive(t) && gen === secState.gen) $('#grid').innerHTML = '<div class="empty" style="grid-column:1/-1"><b>Тут пусто</b>Попробуйте другой жанр</div>';
    enrichCards();
  } catch { if (first && alive(t)) $('#grid').innerHTML = '<div class="empty" style="grid-column:1/-1"><b>Не загрузилось</b>Проверьте интернет</div>'; }
  secState.loading = false;
}

'''
s = s[:a] + new + s[b:]

# клики по фильтрам
old = "  if (el.dataset.sort) { show({ name: 'section', sec: secState.sec, sort: el.dataset.sort }); return; }"
assert old in s
s = s.replace(old, '''  if (el.dataset.sort && route.name === 'section') { show({ name: 'section', sec: secState.sec, sort: el.dataset.sort, genre: secState.genre }, { scroll: 0, focus: el.dataset.k }); return; }
  if (el.dataset.gen !== undefined && route.name === 'section') { show({ name: 'section', sec: secState.sec, sort: secState.sort, genre: el.dataset.gen }, { scroll: 0, focus: el.dataset.k }); return; }
  if (el.dataset.type && route.name === 'section') { show({ name: 'section', sec: el.dataset.type, sort: secState.sort, genre: secState.genre }, { scroll: 0, focus: el.dataset.k }); return; }''', 1)
# подгрузка по фокусу в хвосте списка
s = s.replace("if (cards.length - cards.indexOf(el) <= 10) loadMore(renderToken);", "if (cards.length - cards.indexOf(el) <= 10) loadMore(renderToken, false);")
open('app.js', 'w', encoding='utf8').write(s)

c = open('style.css', encoding='utf8').read()
c += '''
/* каталог: жанры, оригинальное название, страна и жанры */
.chips.genrow,.chips.types{overflow:hidden;flex-wrap:nowrap;padding-top:2px}
.chips.genrow .chip,.chips.types .chip{flex:none;height:44px;font-size:21px}
.subttl{padding:4px 48px 2px;font:600 30px var(--display)}
.subttl span{color:var(--muted);font:600 24px var(--body)}
.card .o{margin-top:2px;font-size:19px;font-style:italic;color:var(--text);opacity:.72;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#grid .card .s{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.3}
'''
open('style.css', 'w', encoding='utf8').write(c)
print('ok')
