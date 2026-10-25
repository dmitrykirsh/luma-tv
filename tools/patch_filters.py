import os, re
os.chdir(r'D:\lift\tv\app\src\main\assets')

s = open('app.js', encoding='utf8').read()
def rep(old, new, cnt=1):
    global s
    assert old in s, old[:70]
    s = s.replace(old, new, cnt)

# ---- общая прокрутка: любой горизонтально прокручиваемый ряд следует за фокусом ----
rep("  const track = el.closest('.track, .epgrid, .seasons, .tvchips');", "  const track = hScroller(el);")
rep("function ensureVisible(el, instant) {", '''// ближайший предок, который прокручивается по горизонтали (ряд карточек, вкладки, жанры, серии)
function hScroller(el) {
  for (let p = el.parentElement; p && p !== view && p !== document.body; p = p.parentElement) {
    if (p.scrollWidth > p.clientWidth + 4) { const ox = getComputedStyle(p).overflowX; if (ox === 'hidden' || ox === 'auto' || ox === 'scroll') return p; }
  }
  return null;
}
function ensureVisible(el, instant) {
  if (el.closest('#modal')) { el.scrollIntoView({ block: 'nearest' }); return; }''')
# ---- каталог: фильтры одной строкой и окно выбора ----
a = s.index("  const gl = [...(genre && !GENRES.includes(genre)")
b = s.index("  await loadMore(t, true);\n  if (alive(t)) { const c = $('#grid .card');")
new = '''  const sortName = (SORTS.find((x) => x[0] === sort) || SORTS[0])[1];
  view.innerHTML = `<div class="page"><div class="chips filters">
      <button class="chip fl f" tabindex="-1" data-flt="sort" data-k="flt:sort"><small>Сортировка</small>${esc(sortName)}<i>▾</i></button>
      <button class="chip fl f ${genre ? 'on' : ''}" tabindex="-1" data-flt="gen" data-k="flt:gen"><small>Жанр</small>${esc(genre || 'Все жанры')}<i>▾</i></button>
      ${genre ? `<button class="chip fl f" tabindex="-1" data-flt="type" data-k="flt:type"><small>Раздел</small>${esc(SECTIONS[sec].title)}<i>▾</i></button>` : ''}</div>
    <div class="grid" id="grid">${skel(14)}</div></div>`;
'''
s = s[:a] + new + s[b:]
# заголовок «жанр · раздел» больше не нужен: он теперь на кнопках
s = s.replace("${genre ? `<div class=\"subttl\">${esc(genre)} · <span>${esc(SECTIONS[sec].title)}</span></div>` : ''}", "")
# убираем прежние строки (если остались)
s = re.sub(r"\n  view\.innerHTML = `<div class=\"page\">\$\{genre \? `<div class=\"subttl\">.*?</div>`;\n", "\n", s, flags=re.S) if "subttl" in s and "data-flt" not in s.split("subttl")[0][-10:] else s
# клики по кнопкам-фильтрам
rep("  if (el.dataset.sort && route.name === 'section') {", '''  if (el.dataset.flt && route.name === 'section') {
    const k = el.dataset.flt, cur = { sec: secState.sec, sort: secState.sort, genre: secState.genre };
    const go2 = (patch) => show({ name: 'section', ...cur, ...patch }, { scroll: 0, focus: 'flt:' + k });
    if (k === 'sort') pickDlg('Сортировка', SORTS.map(([v, l]) => ({ label: l, on: v === cur.sort, v })), (o) => go2({ sort: o.v }));
    else if (k === 'gen') pickDlg('Жанр', [{ label: 'Все жанры', on: !cur.genre, v: '' }, ...[...(cur.genre && !GENRES.includes(cur.genre) ? [cur.genre] : []), ...GENRES].map((g) => ({ label: g, on: g === cur.genre, v: g }))], (o) => go2({ genre: o.v }));
    else pickDlg('Раздел', SEC_TYPES.map((v) => ({ label: SECTIONS[v].title, on: v === cur.sec, v })), (o) => go2({ sec: o.v }));
    return;
  }
  if (el.dataset.sort && route.name === 'section') {''')
open('app.js', 'w', encoding='utf8').write(s)

# ---- окно выбора ----
a = open('actions.js', encoding='utf8').read()
a += '''
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
'''
open('actions.js', 'w', encoding='utf8').write(a)

# ---- каналы: одна кнопка «Категория» ----
t = open('tv.js', encoding='utf8').read()
old = "view.innerHTML = `<div class=\"page\"><div class=\"chips tvchips\">${tvChipsList().map((g) => `<button class=\"chip f ${g === TVD.cat ? 'on' : ''}\" tabindex=\"-1\" data-tvcat=\"${esc(g)}\" data-k=\"cat:${esc(g)}\">${esc(g)}</button>`).join('')}</div>${rails}"
assert old in t
t = t.replace(old, "view.innerHTML = `<div class=\"page\"><div class=\"chips filters\"><button class=\"chip fl f ${TVD.cat === 'Все' ? '' : 'on'}\" tabindex=\"-1\" data-tvflt=\"1\" data-k=\"flt:cat\"><small>Категория</small>${esc(TVD.cat)}<i>▾</i></button><span class=\"fcount\">${TVD.channels.length} каналов</span></div>${rails}")
old = "  else if (el.dataset.tvcat) { TVD.cat = el.dataset.tvcat; show({ name: 'tv' }); }"
assert old in t
t = t.replace(old, "  else if (el.dataset.tvflt) {\n    const cnt = new Map(); for (const c of TVD.channels) cnt.set(c.group, (cnt.get(c.group) || 0) + 1);\n    pickDlg('Категория каналов', tvChipsList().map((g) => ({ label: g, on: g === TVD.cat, v: g, sub: g === 'Все' ? String(TVD.channels.length) : g === '★ Избранные' ? String(tvFavs().length) : String(cnt.get(g) || '') })), (o) => { TVD.cat = o.v; show({ name: 'tv' }, { scroll: 0, focus: 'flt:cat' }); });\n  }")
open('tv.js', 'w', encoding='utf8').write(t)

c = open('style.css', encoding='utf8').read()
c += '''
/* фильтры: компактные кнопки и окно выбора */
.chips.filters{gap:14px;overflow:visible;flex-wrap:wrap;align-items:center}
.chip.fl{height:64px;padding:0 24px;gap:12px;font-size:25px;color:var(--text);background:var(--surface)}
.chip.fl small{font-size:19px;color:var(--muted);margin-right:4px;font-weight:600}
.chip.fl i{font-style:normal;color:var(--muted);margin-left:6px}
.chip.fl.on{background:var(--surface-2)}
.chip.fl:focus small,.chip.fl:focus i{color:rgba(255,255,255,.85)}
.fcount{margin-left:auto;font-size:22px;color:var(--muted)}
.pgrid{display:grid;gap:12px;max-height:720px;overflow:hidden auto;padding:6px 4px 10px;scrollbar-width:none}
.pgrid::-webkit-scrollbar{display:none}
.pgrid.c2{grid-template-columns:repeat(2,1fr)}.pgrid.c3{grid-template-columns:repeat(3,1fr)}.pgrid.c4{grid-template-columns:repeat(4,1fr)}
.pk{display:flex;align-items:center;gap:14px;min-height:76px;padding:12px 22px;border-radius:18px;background:var(--surface-2);font-size:25px;font-weight:600;text-align:left}
.pk i{flex:none;width:26px;font-style:normal;color:var(--accent)}
.pk span{flex:1;line-height:1.25}
.pk small{font-size:20px;color:var(--muted);font-weight:600}
.pk.on{box-shadow:inset 0 0 0 3px var(--accent)}
.pk:focus{background:var(--grad);color:#fff}
.pk:focus small,.pk:focus i{color:#fff}
.dlg .pgrid{margin-top:16px}
'''
open('style.css', 'w', encoding='utf8').write(c)
print('ok')
