'use strict';
/* ================= Страница человека: биография и фильмография из TMDB, сопоставленная с каталогом ================= */
window.RENDER = window.RENDER || {};
const ROLE_RU = { actor: 'Актёр', director: 'Режиссёр', crew: 'Съёмочная группа', acting: 'Актёр', directing: 'Режиссёр', writing: 'Сценарист', production: 'Продюсер' };
const plural = (n, a, b, c) => { const m = n % 100, d = n % 10; return m > 10 && m < 20 ? c : d === 1 ? a : d > 1 && d < 5 ? b : c; };
function ageText(b, d) {
  if (!b) return '';
  const born = new Date(b), end = d ? new Date(d) : new Date();
  let y = end.getFullYear() - born.getFullYear();
  if (end < new Date(end.getFullYear(), born.getMonth(), born.getDate())) y--;
  return `${born.toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' })}${d ? '' : ' · ' + y + ' ' + plural(y, 'год', 'года', 'лет')}`;
}
const PN_NOISE = (x) => (x.genre_ids || []).some((g) => [10767, 10763, 10764].includes(g)) || /self|himself|herself|archive|uncredited/i.test(x.character || '');
const pnUniq = (arr) => { const m = new Map(); for (const x of arr) { const k = x.media_type + ':' + x.id; if (!m.has(k)) m.set(k, x); } return [...m.values()]; };
const pnByPop = (arr) => arr.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));

async function personGet({ lift, tmdb: tid }) {
  let meta = null, tmdbId = Number(tid) || 0;
  if (lift) {
    const p = await api('/person/' + encodeURIComponent(lift), 3600000);
    if (!p || !p.id) throw new Error('NOT_FOUND');
    meta = { name: p.name, photo: p.photo_url || p.profile_url || '', photoTmdb: '', bio: p.biography || '', birthday: p.birthday || '', deathday: p.deathday || '', place: p.place_of_birth || '', roles: p.roles || [], counts: p.filmography && p.filmography.status === 'ready' ? { actor: p.filmography.actor || 0, director: p.filmography.director || 0 } : null };
    tmdbId = Number(p.external_ids && p.external_ids.tmdb) || 0;
  }
  let credits = null;
  if (tmHas() && tmdbId) {
    const d = await tmdb('/person/' + tmdbId, { append_to_response: 'combined_credits' });
    if (!meta) meta = { name: d.name, photo: '', photoTmdb: d.profile_path || '', bio: d.biography || '', birthday: d.birthday || '', deathday: d.deathday || '', place: d.place_of_birth || '', roles: [d.known_for_department], counts: null };
    else if (!meta.photo && d.profile_path) meta.photoTmdb = d.profile_path;
    const cc = d.combined_credits || {};
    credits = {
      actor: pnByPop(pnUniq((cc.cast || []).filter((x) => !PN_NOISE(x)))).slice(0, 160),
      director: pnByPop(pnUniq((cc.crew || []).filter((x) => x.job === 'Director'))).slice(0, 80)
    };
  }
  if (!meta) throw new Error('NOT_FOUND');
  return { person: meta, credits };
}

async function renderPerson(r, t) {
  view.innerHTML = '<div class="empty"><div class="spin"></div></div>';
  let res;
  try { res = await personGet({ lift: r.lift, tmdb: r.tmdb }); } catch { if (alive(t)) view.innerHTML = '<div class="empty"><b>Не получилось открыть страницу</b>Проверьте интернет и попробуйте ещё раз</div>'; return; }
  if (!alive(t)) return;
  const p = res.person, credits = res.credits;
  const photo = p.photo || (p.photoTmdb ? TMI(p.photoTmdb, 'w342') : '');
  const roles = [...new Set((p.roles || []).map((x) => ROLE_RU[String(x).toLowerCase()]).filter(Boolean))];
  const modes = [];
  if (credits) { if (credits.actor.length) modes.push(['actor', 'Фильмография']); if (credits.director.length) modes.push(['director', 'Режиссёр']); }
  const bio = (p.bio || '').replace(/^[^\wА-Яа-яЁё]+/, '');
  view.innerHTML = `<div class="page"><div class="phead"><div class="pphoto">${photo ? `<img src="${esc(photo)}" alt="">` : `<span>${esc((p.name || '?')[0])}</span>`}</div>
    <div class="pinfo"><div class="ty">${esc(roles.join(' · ') || 'Персона')}</div><h1 class="pname">${esc(p.name)}</h1>
    <div class="meta">${p.birthday ? `<span>${esc(ageText(p.birthday, p.deathday))}</span>` : ''}${p.place ? `<span>•</span><span>${esc(p.place)}</span>` : ''}</div>
    ${bio ? `<div class="blk f pbio" tabindex="-1" data-k="bio" data-act="bio">${esc(bio)}</div>` : ''}</div></div><div id="pBody"></div></div>`;
  const body = $('#pBody');
  if (!credits) {
    const cnt = p.counts ? `<p style="margin-top:8px;color:var(--muted)">В базе: ${p.counts.actor} ${plural(p.counts.actor, 'роль', 'роли', 'ролей')} и ${p.counts.director} ${plural(p.counts.director, 'режиссёрская работа', 'режиссёрские работы', 'режиссёрских работ')}.</p>` : '';
    body.innerHTML = `<div class="empty" style="text-align:left;padding:30px 48px"><b>Фильмы с участием ${esc(p.name)}</b>${tmHas() ? 'Список не нашёлся в TMDB.' : 'Список подтягивается из TMDB: ключ приезжает с резервной копией (Настройки → Перенос с телефона).'}${cnt}</div>`;
    focusFirst(); return;
  }
  const found = { actor: [], director: [] }, checked = { actor: 0, director: 0 }, started = {};
  let mode = modes[0]?.[0] || 'actor', kind = 'all';
  body.innerHTML = `<div class="chips pfilters">${modes.length > 1 ? modes.map(([k, l]) => `<button class="chip f ${k === mode ? 'on' : ''}" tabindex="-1" data-pmode="${k}" data-k="pm:${k}">${l} (${credits[k].length})</button>`).join('') : ''}
    ${[['all', 'Всё'], ['film', 'Фильмы'], ['tv', 'Сериалы']].map(([k, l]) => `<button class="chip f ${k === kind ? 'on' : ''}" tabindex="-1" data-pkind="${k}" data-k="pk:${k}">${l}</button>`).join('')}</div>
    <p class="lprog" id="pProg"></p><div class="grid" id="pGrid"></div>`;
  const grid = $('#pGrid'), prog = $('#pProg');
  const isTv = (x) => [3, 4, 5, 7].includes(x.type);
  const paint = () => {
    const list = found[mode].filter((x) => kind === 'all' || (kind === 'tv') === isTv(x));
    grid.innerHTML = list.map((it) => cardHTML(it, 'p:' + it.id)).join('') || (checked[mode] >= credits[mode].length ? '<div class="empty" style="grid-column:1/-1"><b>В Luma пока ничего нет</b>Загляните позже</div>' : '<div class="empty" style="grid-column:1/-1"><div class="spin"></div></div>');
    hookImages(grid);
    const total = credits[mode].length;
    prog.textContent = checked[mode] < total ? `Ищем в Luma… проверено ${checked[mode]} из ${total}, нашли ${found[mode].length}` : `В Luma есть ${found[mode].length} из ${total}`;
  };
  async function run(m) {
    if (started[m]) return; started[m] = true;
    const list = credits[m];
    for (let i = 0; i < list.length; i += 8) {
      const part = list.slice(i, i + 8);
      const got = await Promise.all(part.map((x) => tmMatchCached(x, x.media_type === 'tv' ? 'tv' : 'movie')));
      if (!alive(t)) return;
      found[m].push(...got.filter(Boolean));
      checked[m] = Math.min(list.length, i + 8);
      if (mode === m) { const had = grid.children.length; paint(); if (!had && found[m].length) focusFirstIn(grid); }
    }
    checked[m] = list.length; if (mode === m) paint();
  }
  window.__pn = { setMode: (m) => { mode = m; $$('[data-pmode]').forEach((b) => b.classList.toggle('on', b.dataset.pmode === m)); paint(); run(m); }, setKind: (k) => { kind = k; $$('[data-pkind]').forEach((b) => b.classList.toggle('on', b.dataset.pkind === k)); paint(); } };
  paint(); run(mode);
  focusFirst();
}
const focusFirstIn = (box) => { if (!document.activeElement || document.activeElement === document.body || document.activeElement.closest?.('#pBody')) $('.f', box)?.focus({ preventScroll: true }); };

document.addEventListener('click', (e) => {
  const el = e.target.closest('.f'); if (!el || route.name !== 'person') return;
  if (el.dataset.pmode) window.__pn.setMode(el.dataset.pmode);
  else if (el.dataset.pkind) window.__pn.setKind(el.dataset.pkind);
  else if (el.dataset.act === 'bio') el.classList.toggle('open');
});
window.RENDER.person = renderPerson;

/* поиск людей (TMDB) для экрана поиска */
async function peopleSearch(q) {
  if (!tmHas()) return [];
  const j = await tmdb('/search/person', { query: q });
  return (j.results || []).filter((x) => x.profile_path || x.known_for?.length).slice(0, 12).map((x) => ({ id: x.id, name: x.name, photo: x.profile_path ? TMI(x.profile_path, 'w185') : '', dept: ROLE_RU[String(x.known_for_department || '').toLowerCase()] || '' }));
}
