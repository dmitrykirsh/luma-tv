import os
os.chdir(r'D:\lift\tv\app\src\main\assets')

t = open('tv.js', encoding='utf8').read()

# ---- каталог iptv-org: загрузка и разбор ----
old = "const tvChan = (id) => TVD.channels.find((c) => c.id === id);"
assert old in t
t = t.replace(old, r"""/* ---------- «Каналы мира»: общий каталог iptv-org (проект сообщества, каналы всех стран) ---------- */
const TVW = { all: null, at: 0, loading: null, byId: new Map(), cc: '', q: '' };
const TVW_URL = 'https://iptv-org.github.io/iptv/index.m3u';
const TVW_GROUPS = { General: 'Общие', Movies: 'Фильмы', Series: 'Сериалы', Entertainment: 'Развлекательные', Music: 'Музыка', Sports: 'Спорт', News: 'Новости', Kids: 'Детские', Documentary: 'Документальные', Religious: 'Религия', Culture: 'Культура', Outdoor: 'Природа и путешествия', Lifestyle: 'Стиль жизни', Undefined: 'Без категории', Education: 'Образование', Animation: 'Мультфильмы', Business: 'Бизнес', Comedy: 'Комедии', Cooking: 'Кулинария', Family: 'Семейные', Legislative: 'Парламент', Public: 'Общественные', Relax: 'Релакс', Science: 'Наука', Shop: 'Магазины', Travel: 'Путешествия', Weather: 'Погода', Auto: 'Авто', Classic: 'Классика', Interactive: 'Интерактивные', Local: 'Местные' };
async function tvWideLoad() {
  if (TVW.all && Date.now() - TVW.at < TV_TTL) return TVW.all;
  if (TVW.loading) return TVW.loading;
  TVW.loading = (async () => {
    const r = await fetch(tvPx(TVW_URL, '', '', true));
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const items = tvParseM3u(await r.text(), true)
      .filter((c) => !/\[(?:Not 24\/7|Geo-blocked)\]/i.test(c.name))   // каналы «не круглосуточно» и «только из своей страны» не показываем
      .map((c) => ({ ...c, name: c.name.replace(/\s*\(\d{3,4}p\)/gi, '').replace(/\s*\[[^\]]*\]/g, '').trim(), group: String(c.group || '').split(';').map((g) => TVW_GROUPS[g.trim()] || g.trim()).filter(Boolean)[0] || 'Без категории' }));
    const list = tvToChannels(items, 'x:').map((c) => ({ ...c, cc: ((c.tvg || '').match(/\.([a-z]{2,3})(?:@|$)/) || [])[1] || 'int' }));
    TVW.all = list; TVW.at = Date.now(); TVW.byId = new Map(list.map((c) => [c.id, c]));
    return list;
  })();
  try { return await TVW.loading; } finally { TVW.loading = null; }
}
const tvRegion = (() => { let dn = null; try { dn = new Intl.DisplayNames(['ru'], { type: 'region' }); } catch {} return (cc) => { const u = String(cc || '').toUpperCase(); if (!u || u === 'INT') return 'Международные'; try { return (dn && dn.of(u === 'UK' ? 'GB' : u)) || u; } catch { return u; } }; })();
const tvChan = (id) => TVD.channels.find((c) => c.id === id) || TVW.byId.get(id);""", 1)

# ---- кнопка входа на экране каналов ----
old = """data-k="flt:cat"><small>Категория</small>${esc(TVD.cat)}<i>▾</i></button><span class="fcount">"""
assert old in t
t = t.replace(old, """data-k="flt:cat"><small>Категория</small>${esc(TVD.cat)}<i>▾</i></button><button class="chip fl f" tabindex="-1" data-tvworld="1" data-k="tvworld"><small>Другие страны</small>Каналы мира<i>›</i></button><span class="fcount">""", 1)

# ---- экран «Каналы мира» ----
old = "/* ---------- плеер ---------- */"
assert old in t
t = t.replace(old, r"""/* ---------- экран «Каналы мира»: страны и поиск по всем странам ---------- */
async function renderTvWorld(r, t) {
  view.innerHTML = '<div class="empty"><div class="spin"></div></div>';
  let all;
  try { all = await tvWideLoad(); } catch { if (alive(t)) view.innerHTML = '<div class="empty"><b>Каталог не загрузился</b>Проверьте интернет и попробуйте ещё раз</div>'; return; }
  if (!alive(t)) return;
  const cc = r.cc || '';
  const base = cc ? all.filter((c) => c.cc === cc) : all;
  view.innerHTML = `<div class="page"><div class="search"><input id="wq" class="f" tabindex="-1" data-k="wq" placeholder="${cc ? 'Найти канал: ' + esc(tvRegion(cc)) : 'Найти канал среди всех стран (например: MTV)'}" autocomplete="off"></div>
    ${cc ? `<h3 class="ph3" style="padding:0 48px">${esc(tvRegion(cc))}<small> · ${base.length} каналов</small></h3>` : ''}
    <div id="wbody"></div></div>`;
  const body = $('#wbody');
  const countries = () => {
    const n = {}; all.forEach((c) => { n[c.cc] = (n[c.cc] || 0) + 1; });
    const rows = Object.entries(n).map(([k, v]) => [k, v, tvRegion(k)]).sort((a, b) => b[1] - a[1]);
    body.innerHTML = `<h3 class="ph3" style="padding:0 48px">Страны</h3><div class="grid wgrid">${rows.map(([k, v, name]) => `<button class="wc f" tabindex="-1" data-wcc="${esc(k)}" data-k="wc:${esc(k)}"><b>${esc(name)}</b><small>${v} каналов</small></button>`).join('')}</div>
      <p class="whint">Каталог ведёт сообщество проекта iptv-org (github.com/iptv-org/iptv). Часть ссылок может не работать.</p>`;
  };
  const show = (list) => {
    TVD.list = list; TVD.shown = 0;
    body.innerHTML = list.length ? '<div class="grid tvgrid" id="tvGrid"></div>' : '<div class="empty"><b>Каналов не нашлось</b>Попробуйте другое название</div>';
    if (list.length) { tvMore(); tvHook(body); }
  };
  const run = () => {
    const q = ($('#wq').value || '').trim().toLowerCase();
    if (!q) { if (cc) show(base); else countries(); return; }
    show(base.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 300));
  };
  if (cc) show(base); else countries();
  const q = $('#wq');
  q.onkeydown = (e) => { if (e.key !== 'Enter') return; e.preventDefault(); run(); q.blur(); setTimeout(() => ($('#tvGrid .chc') || $('.wc'))?.focus({ preventScroll: true }), 150); };
  q.oninput = () => { if (!q.value.trim()) run(); };
  const first = $('#tvGrid .chc') || $('.wc') || q;
  first.focus({ preventScroll: true });
}
window.RENDER = window.RENDER || {};
window.RENDER.tvworld = renderTvWorld;

/* ---------- плеер ---------- */""", 1)

# ---- клики ----
old = "  if (el.dataset.ch) { TVD.list = route.name === 'tv' && TVD.list.length ? TVD.list : TVD.channels;"
assert old in t
t = t.replace(old, """  if (el.dataset.tvworld) { go('tvworld', {}); return; }
  if (el.dataset.wcc) { go('tvworld', { cc: el.dataset.wcc }); return; }
  if (el.dataset.ch) { TVD.list = (route.name === 'tv' || route.name === 'tvworld') && TVD.list.length ? TVD.list : TVD.channels;""", 1)
open('tv.js', 'w', encoding='utf8').write(t)

c = open('style.css', encoding='utf8').read()
if '.wgrid' not in c:
    c += """
/* каналы мира: выбор страны */
.wgrid{padding:0 48px 10px;grid-template-columns:repeat(4,1fr);gap:18px}
.wc{display:flex;flex-direction:column;gap:4px;padding:20px 24px;border-radius:20px;background:var(--surface);border:2px solid transparent;color:var(--text);text-align:left;font:inherit}
.wc b{font:600 28px var(--body)}.wc small{color:var(--muted);font-size:22px}
.wc:focus{outline:none;border-color:var(--primary);background:var(--surface-2);box-shadow:0 0 0 4px rgba(255,51,102,.35),0 14px 40px rgba(255,51,102,.25);transform:scale(1.03)}
.whint{padding:10px 48px 40px;color:var(--muted);font-size:22px}
.ph3 small{color:var(--muted);font-weight:400}
"""
    open('style.css', 'w', encoding='utf8').write(c)
print('ok')
