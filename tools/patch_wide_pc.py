import os
os.chdir(r'D:\lift\app')

# ================= основной процесс: tv.js =================
p = 'tv.js'
s = open(p, encoding='utf8').read()
old = "const EPG_URL = 'https://iptvx.one/epg/epg_lite.xml.gz';"
assert old in s
s = s.replace(old, old + """
// «По странам»: общий каталог iptv-org (проект сообщества, каналы всех стран; ссылки проверяются автоматически)
const WIDE = { name: 'Каналы мира', url: 'https://iptv-org.github.io/iptv/index.m3u' };
const WIDE_GROUPS = { General: 'Общие', Movies: 'Фильмы', Series: 'Сериалы', Entertainment: 'Развлекательные', Music: 'Музыка', Sports: 'Спорт', News: 'Новости', Kids: 'Детские', Documentary: 'Документальные', Religious: 'Религия', Culture: 'Культура', Outdoor: 'Природа и путешествия', Lifestyle: 'Стиль жизни', Undefined: 'Без категории', Education: 'Образование', Animation: 'Мультфильмы', Business: 'Бизнес', Comedy: 'Комедии', Cooking: 'Кулинария', Family: 'Семейные', Legislative: 'Парламент', Public: 'Общественные', Relax: 'Релакс', Science: 'Наука', Shop: 'Магазины', Travel: 'Путешествия', Weather: 'Погода', Auto: 'Авто', Classic: 'Классика', Interactive: 'Интерактивные', Local: 'Местные' };""", 1)

old = "    else if (scope === 'world') list = await get({ ...BUILTIN.world, id: 'world', builtin: true }, 'w:');"
assert old in s
s = s.replace(old, old + r"""
    else if (scope === 'wide') {
      try {
        const items = (await loadList({ ...WIDE, id: 'wide', builtin: true }, force))
          .filter((c) => !/\[(?:Not 24\/7|Geo-blocked)\]/i.test(c.name))   // каналы с пометками «не круглосуточно» и «только из своей страны» не показываем
          .map((c) => ({ ...c, name: c.name.replace(/\s*\(\d{3,4}p\)/gi, '').replace(/\s*\[[^\]]*\]/g, '').trim(), group: String(c.group || '').split(';').map((g) => WIDE_GROUPS[g.trim()] || g.trim()).filter(Boolean)[0] || 'Без категории' }));
        list = toChannels(items, 'x:').map((c) => ({ ...c, cc: ((c.tvg || '').match(/\.([a-z]{2,3})(?:@|$)/) || [])[1] || '' }));
      } catch (e) { errors.push({ list: WIDE.name, error: e.code || 'NETWORK' }); }
    }""", 1)

old = "      if (scope !== 'world') for (const c of r.channels) known.set(c.id, { name: c.name, tvg: c.tvg });"
assert old in s
s = s.replace(old, "      if (scope !== 'world' && scope !== 'wide') for (const c of r.channels) known.set(c.id, { name: c.name, tvg: c.tvg });", 1)
old = "stable: !!c.stable, list: c.list || '', sources: c.sources }))"
assert old in s
s = s.replace(old, "stable: !!c.stable, list: c.list || '', cc: c.cc || '', sources: c.sources }))", 1)
open(p, 'w', encoding='utf8').write(s)

# ================= окно: renderer/tv.js =================
p = 'renderer/tv.js'
t = open(p, encoding='utf8').read()
old = "const TV_SCOPES = [['stable', 'Стабильные'], ['all', 'Все каналы'], ['world', 'Мир'], ['mine', 'Мои плейлисты']];"
assert old in t
t = t.replace(old, "const TV_SCOPES = [['stable', 'Стабильные'], ['all', 'Все каналы'], ['world', 'Мир'], ['wide', 'По странам'], ['mine', 'Мои плейлисты']];", 1)

old = """function tvFiltered() {
  const q = TVS.q.trim().toLowerCase();
  return TVS.channels.filter("""
assert old in t
t = t.replace(old, """// «По странам»: общий каталог, выбранная страна сужает его. Без страны и без запроса показываем выбор страны
const tvWide = () => TVS.scope === 'wide';
const tvBase = () => (tvWide() && TVS.country ? TVS.channels.filter((c) => c.cc === TVS.country) : TVS.channels);
const tvLanding = () => tvWide() && !TVS.country && !TVS.q.trim() && TVS.cat === 'Все';
const tvRegion = (() => { let dn = null; try { dn = new Intl.DisplayNames(['ru'], { type: 'region' }); } catch {} return (cc) => { const u = String(cc || '').toUpperCase(); if (!u || u === 'INT') return 'Международные'; try { return (dn && dn.of(u === 'UK' ? 'GB' : u)) || u; } catch { return u; } }; })();
function tvCountriesHTML() {
  const n = {}; TVS.channels.forEach((c) => { n[c.cc || 'int'] = (n[c.cc || 'int'] || 0) + 1; });
  const rows = Object.entries(n).map(([cc, k]) => [cc, k, tvRegion(cc)]).sort((a, b) => b[1] - a[1]);
  return `<div class="tv-landing"><h3>Выберите страну</h3><p class="hint">Или введите название канала в поиск выше, и он найдётся среди каналов всех стран. Список ведёт сообщество проекта iptv-org (<a data-ext="https://github.com/iptv-org/iptv">github.com/iptv-org/iptv</a>), часть ссылок может не работать.</p>
    <div class="tv-countries">${rows.map(([cc, k, name]) => `<button class="tv-country" data-cc="${esc(cc === 'int' ? 'INT' : cc.toUpperCase())}"><b>${esc(name)}</b><small>${k} ${plural(k, 'канал', 'канала', 'каналов')}</small></button>`).join('')}</div></div>`;
}
function tvFiltered() {
  const q = TVS.q.trim().toLowerCase();
  return tvBase().filter(""", 1)

old = """function tvCats() {
  const n = {}; TVS.channels.forEach((c) => { n[c.group] = (n[c.group] || 0) + 1; });
  const favs = TVS.channels.filter((c) => tvFav(c.id)).length;
  return [['Все', TVS.channels.length],"""
assert old in t
t = t.replace(old, """function tvCats() {
  if (tvLanding()) return [];
  const base = tvBase(), n = {}; base.forEach((c) => { n[c.group] = (n[c.group] || 0) + 1; });
  const favs = base.filter((c) => tvFav(c.id)).length;
  return [['Все', base.length],""", 1)

old = """      <input class="tv-search" id="tvQ" placeholder="Найти канал" value="${esc(TVS.q)}" spellcheck="false">"""
assert old in t
t = t.replace(old, """      <input class="tv-search" id="tvQ" placeholder="${tvWide() && !TVS.country ? 'Найти канал среди всех стран' : 'Найти канал'}" value="${esc(TVS.q)}" spellcheck="false">
      ${tvWide() && TVS.country ? `<button class="pill on" id="tvCountry" title="Сбросить страну">${esc(tvRegion(TVS.country))} ✕</button>` : ''}""", 1)

old = """  const tvBodyHTML = (list) => {
    const showHome = TVS.cat === 'Все' && !TVS.q.trim();"""
assert old in t
t = t.replace(old, """  const tvBodyHTML = (list) => {
    if (tvLanding()) return tvCountriesHTML();
    const showHome = TVS.cat === 'Все' && !TVS.q.trim() && !tvWide();""", 1)

old = "    if (e.target.closest('#tvAddFirst')) { openTvPlaylists(true); return; }"
assert old in t
t = t.replace(old, old + """
    const ext = e.target.closest('[data-ext]'); if (ext) { window.lift.openExternal(ext.dataset.ext); return; }
    const cc = e.target.closest('[data-cc]'); if (cc) { TVS.country = cc.dataset.cc.toUpperCase(); state.tvPrefs.country = TVS.country; persist('tvPrefs'); TVS.cat = 'Все'; TVS.q = ''; go({ name: 'tv', scope: 'wide' }, { replace: true }); return; }""", 1)

old = "  $('#tvManage').onclick = () => openTvPlaylists();"
assert old in t
t = t.replace(old, old + "\n  const cb = $('#tvCountry'); if (cb) cb.onclick = () => { TVS.country = ''; state.tvPrefs.country = ''; persist('tvPrefs'); TVS.cat = 'Все'; TVS.q = ''; go({ name: 'tv', scope: 'wide' }, { replace: true }); };", 1)

old = "  TVS.scope = route.scope || state.tvPrefs.scope || 'stable';"
assert old in t
t = t.replace(old, old + "\n  TVS.country = state.tvPrefs.country || '';", 1)
old = "const TVS = {\n  scope: 'stable', cat: 'Все', q: '',"
assert old in t
t = t.replace(old, "const TVS = {\n  scope: 'stable', country: '', cat: 'Все', q: '',", 1)
open(p, 'w', encoding='utf8').write(t)

c = open('renderer/style.css', encoding='utf8').read()
c += """
/* телевизор: выбор страны */
.tv-landing{padding:8px 32px 40px}
.tv-landing h3{font-size:20px;margin-bottom:6px}
.tv-landing .hint{max-width:760px;margin-bottom:18px}
.tv-landing .hint a{color:var(--primary);cursor:pointer}
.tv-countries{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px}
.tv-country{display:flex;flex-direction:column;gap:3px;padding:14px 16px;border-radius:14px;border:1px solid var(--line);background:var(--panel);color:var(--text);text-align:left;cursor:pointer;transition:background .15s var(--ease),border-color .15s var(--ease)}
.tv-country b{font-size:15px}.tv-country small{color:var(--muted);font-size:12.5px}
.tv-country:hover{background:rgba(255,255,255,.07);border-color:rgba(255,51,102,.4)}
"""
open('renderer/style.css', 'w', encoding='utf8').write(c)
print('ok')
