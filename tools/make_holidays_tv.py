"""Собирает tv/assets/holidays.js из ПК-версии: даты и списки праздников общие, отличается только загрузка набора слайдов."""
import os
pc = open(r'D:\lift\app\renderer\holidays.js', encoding='utf8').read()
a = pc.index("  const lb = ")
b = pc.index("  const enabled = ")
shared = pc[a:b]

head = """'use strict';
/* Праздничные подборки для главного баннера (Luma TV). Даты и списки общие с ПК-версией (tools/make_holidays_tv.py).
   Для проверки: localStorage['luma.holi.date'] = '2026-10-30'. */
(function () {
"""
tail = r"""  const enabled = () => { try { return localStorage.getItem('luma.tv.holi') !== '0'; } catch { return true; } };
  const tint = (rgb) => { if (rgb) document.body.style.setProperty('--au1', rgb); else document.body.style.removeProperty('--au1'); };

  // названия из всех источников, чередуя их, чтобы набор не состоял из одного списка
  async function gather(h) {
    const parts = [];
    for (const s of h.lists || []) {
      try { const L = await getList(s.lb); if (L && L.films) parts.push({ url: s.lb, films: L.films }); } catch {}
    }
    if (h.films) parts.push({ films: h.films.map(([title, year, kind]) => ({ title, year, kind: kind || 'movie', key: 'holi:' + title + ':' + year })) });
    const seen = new Set(), out = [];
    for (let i = 0; out.length < 100; i++) {
      let any = false;
      for (const p of parts) { const f = p.films[i]; if (!f) continue; any = true; const k = f.key || f.title; if (!seen.has(k)) { seen.add(k); out.push(f); } }
      if (!any) break;
    }
    return out;
  }

  const CACHE = 12 * 3600e3, WANT = 24;
  // набор слайдов для главного баннера: фильмы из каталога с кадрами TMDB (если есть ключ). Баннер появляется, когда набралось 5 фильмов,
  // и дальше пополняется (массив общий). Готовый набор запоминается на 12 часов
  async function load(t, cb) {
    tint('');
    if (!enabled()) return;
    const cur = pick(today());
    if (!cur) return;
    const { h, diff } = cur, ck = 'luma.tv.holi.set.' + cur.key;
    tint(h.rgb);
    const tag = `${h.name} · ${when(diff).toLowerCase()}`;
    const meta = (items) => ({ key: cur.key, id: h.id, name: h.name, rgb: h.rgb, diff, items });
    try { const c = JSON.parse(localStorage.getItem(ck) || 'null'); if (c && Date.now() - c.t < CACHE && c.items.length >= 5) { if (alive(t)) cb(meta(c.items)); return; } } catch {}
    const films = await gather(h);
    const out = []; let called = false;
    const enrich = async (x) => {   // кадр, описание и жанры из TMDB
      if (!tmHas()) return;
      const kind = L_TV.includes(x.it.type) ? 'tv' : 'movie';
      try {
        const p = { query: x.it.origin_name || x.it.name }; if (x.it.year) p[kind === 'tv' ? 'first_air_date_year' : 'year'] = x.it.year;
        const r = ((await tmdb('/search/' + kind, p)).results || []).find((q) => q.backdrop_path) || null;
        if (r) { x.bd = r.backdrop_path; x.overview = r.overview || ''; x.genres = (r.genre_ids || []).map((g) => TM_GENRES[g]).filter(Boolean); }
      } catch {}
    };
    for (let i = 0; i < films.length && out.length < WANT && alive(t); i += 8) {
      const got = await Promise.all(films.slice(i, i + 8).map(matchFilm));
      const add = [];
      for (const it of got) if (it && it.poster && !out.some((y) => y.it.id === it.id) && out.length + add.length < WANT) add.push({ it, bd: '', overview: '', genres: [], tag });
      await Promise.all(add.map(enrich));
      if (!alive(t)) return;
      out.push(...add);
      if (!called && out.length >= 5) { called = true; cb(meta(out)); }
    }
    if (!alive(t)) return;
    if (!called && out.length >= 5) { called = true; cb(meta(out)); }
    if (out.length >= 5) { try { localStorage.setItem(ck, JSON.stringify({ t: Date.now(), items: out })); } catch {} }
  }

  window.lumaHoliday = { load, pick, HOLIDAYS, when };
  if (window.__holiPending) { const f = window.__holiPending; window.__holiPending = null; f(); }
})();
"""
open(r'D:\lift\tv\app\src\main\assets\holidays.js', 'w', encoding='utf8').write(head + shared + tail)
print('holidays.js ok')
