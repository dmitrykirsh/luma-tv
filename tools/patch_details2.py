import os
os.chdir(r'D:\lift\tv\app\src\main\assets')
s = open('app.js', encoding='utf8').read()
def rep(old, new, cnt=1):
    global s
    assert old in s, old[:70]
    s = s.replace(old, new, cnt)

# ---- tmFind: результаты запоминаются на время работы (повторные переходы мгновенные) ----
rep("async function tmFind(d) {", "const tmFindCache = new Map();\nfunction tmFind(d) {\n  const ck = d.id; if (tmFindCache.has(ck)) return tmFindCache.get(ck);\n  const p = tmFindRaw(d); tmFindCache.set(ck, p); p.catch(() => tmFindCache.delete(ck)); return p;\n}\nasync function tmFindRaw(d) {")

# ---- навигация по уровням на странице фильма ----
rep("  if (dir === 'left' && !inRail && scope === document.body && (!best || best.closest('#rail'))) { focusRail(); return; }",
    """  if (route.name === 'details' && scope === document.body) {
    // уровни: жанры → кнопки → вкладки → содержимое; вниз и вверх идут на соседний уровень, а не на ближайший по геометрии
    const tab = $('#dTabs .chip.on') || $('#dTabs .chip');
    if (dir === 'down') {
      if (cur.closest('.genres')) { const w = $('.btns [data-act=watch]') || $('.btns .f'); if (w) { w.focus({ preventScroll: true }); return; } }
      else if (cur.closest('.btns')) { if (tab) { tab.focus({ preventScroll: true }); return; } }
      else if (cur.closest('#dTabs')) { const f = $('#dPanel .f'); if (f) { f.focus({ preventScroll: true }); return; } }
    } else if (dir === 'up') {
      if (cur.closest('#dPanel') && best && !best.closest('#dPanel') && tab) { tab.focus({ preventScroll: true }); return; }
      if (cur.closest('#dPanel') && !best && tab) { tab.focus({ preventScroll: true }); return; }
      if (cur.closest('#dTabs')) { const w = $('.btns [data-act=watch]') || $('.btns .f'); if (w) { w.focus({ preventScroll: true }); return; } }
      if (cur.closest('.btns')) { const g = $('.genres .f'); if (g) { g.focus({ preventScroll: true }); return; } }
    }
  }
  if (dir === 'left' && !inRail && scope === document.body && (!best || best.closest('#rail'))) { focusRail(); return; }""")
open('app.js', 'w', encoding='utf8').write(s)

d = open('details.js', encoding='utf8').read()
def drep(old, new, cnt=1):
    global d
    assert old in d, old[:70]
    d = d.replace(old, new, cnt)

# ---- страница открывается после загрузки TMDB (с таймаутом); без них — как есть ----
drep("async function renderDetails2(r, t) {\n  view.innerHTML = '<div class=\"empty\"><div class=\"spin\"></div></div>';\n  const d = await info(r.id);\n  if (!alive(t)) return;",
"""const preImg = (u) => new Promise((res) => { if (!u) return res(''); const i = new Image(); i.onload = () => res(u); i.onerror = () => res(''); i.src = u; });
// данные TMDB, кадр, логотип и оценки грузятся заранее: страница показывается уже в готовом виде, но не дольше таймаута
async function detailsPrefetch(d) {
  if (!tmHas()) return null;
  const T = await tmFind(d).catch(() => null);
  if (!T) return null;
  await Promise.all([
    preImg(T.backdrop ? TMI(T.backdrop, 'w1280') : ''), preImg(T.logo ? TMI(T.logo, 'w500') : ''),
    T.kind === 'movie' ? lbRating(T.tmdb).catch(() => null) : null, omdbRatings(T.imdb).catch(() => null)
  ]);
  return T;
}
async function renderDetails2(r, t) {
  view.innerHTML = '<div class="empty"><div class="spin"></div></div>';
  const d = await info(r.id);
  if (!alive(t)) return;
  await Promise.race([detailsPrefetch(d), wait(3500)]);
  if (!alive(t)) return;""")
d = d.replace("tm.token", "tm.token")
open('details.js', 'w', encoding='utf8').write(d)

c = open('style.css', encoding='utf8').read()
c = c.replace(".dbg{position:absolute;left:-48px;right:-0px;top:-104px;height:880px;background-size:cover;background-position:center top;opacity:0;transition:opacity .7s;z-index:-2}", ".dbg{position:absolute;left:-48px;right:-0px;top:-104px;height:880px;background-size:cover;background-position:center top;opacity:0;transition:opacity .2s;z-index:-2}")
open('style.css', 'w', encoding='utf8').write(c)
print('ok')
