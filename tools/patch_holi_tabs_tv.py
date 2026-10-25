import os, re
os.chdir(r'D:\lift\tv\app\src\main\assets')

a = open('app.js', encoding='utf8').read()

# ---- убираем отдельный баннер ----
a = a.replace('<div id="holiWrap"></div><section class="hero skeleton" id="hero"></section>', '<section class="hero skeleton" id="hero"></section>', 1)
a = a.replace("  window.lumaHoliday && window.lumaHoliday.render($('#holiWrap'), t);   // праздничный баннер, если сейчас праздничное окно\n", """  // праздничная вкладка главного баннера: если сейчас праздничное окно, в баннере появляются вкладки «Праздник / В тренде»
  HERO.sets = {}; HERO.tabs = []; HERO.picked = false; HERO.active = 'trend'; HERO.rgb = '';
  if (window.lumaHoliday) window.lumaHoliday.load(t, (set) => {
    HERO.sets.holi = set.items; HERO.tabs = [{ k: 'holi', label: set.name }, { k: 'trend', label: 'В тренде' }]; HERO.rgb = set.rgb;
    if (!HERO.sets.trend) return;   // баннер ещё не готов: вкладки появятся вместе с ним
    heroSwitch(HERO.picked ? HERO.active : 'holi', false);
  });
""", 1)

# ---- баннер: наборы слайдов и вкладки ----
old = a[a.index("function heroBuild(items) {"):a.index("async function renderHome")]
new = """function heroSwitch(k, byUser) {
  const items = HERO.sets[k]; if (!items || !items.length) return;
  HERO.active = k;
  heroBuild(items, { key: k });
  if (byUser) $(`.htab[data-htab="${k}"]`)?.focus({ preventScroll: true });
}
function heroBuild(items, opt = {}) {
  const box = $('#hero'); if (!box || !items.length) { box?.remove(); return; }
  if (!opt.key) {   // обычный вызов: это набор «В тренде»
    HERO.sets.trend = items; HERO.active = 'trend';
    if (HERO.sets.holi && !HERO.picked) { items = HERO.sets.holi; HERO.active = 'holi'; }
  }
  HERO.items = items; HERO.i = 0;
  box.classList.remove('skeleton');
  if (HERO.rgb) box.style.setProperty('--ha', HERO.rgb);
  box.innerHTML = `<div class="hshade"></div><div class="hin"><div class="htag"></div><h2 class="htitle"></h2><div class="hmeta"></div><p class="hdesc"></p>
    <div class="hbtns"><button class="btn primary f" tabindex="-1" data-hero="watch" data-k="hero:watch">${ico('play')}Смотреть</button><button class="btn f" tabindex="-1" data-hero="more" data-k="hero:more">Подробнее</button></div></div><div class="hdots"></div>
    ${HERO.tabs.length > 1 ? `<div class="htabs">${HERO.tabs.map((x) => `<button class="htab f ${x.k === HERO.active ? 'on' : ''}" tabindex="-1" data-htab="${x.k}" data-k="htab:${x.k}">${esc(x.label)}</button>`).join('')}</div>` : ''}`;
  heroPaint(true);
  clearInterval(HERO.timer);
  HERO.timer = setInterval(() => { if (!$('#hero')) { clearInterval(HERO.timer); return; } if (playerOpen() || (window.tvPlayerOpen && window.tvPlayerOpen())) return; heroSlide(1); }, 9000);
}

"""
a = a.replace(old, new, 1)
a = a.replace("const HERO = { i: 0, items: [], timer: 0 };", "const HERO = { i: 0, items: [], timer: 0, sets: {}, tabs: [], picked: false, active: 'trend', rgb: '' };", 1)
# при большом числе слайдов вместо полосок показываем счётчик
old = "  $('.hdots', box).innerHTML = HERO.items.map((_, k) => `<i class=\"${k === HERO.i ? 'on' : ''}\"></i>`).join('');"
assert old in a
a = a.replace(old, "  $('.hdots', box).innerHTML = HERO.items.length > 12 ? `<span class=\"hcount\">${HERO.i + 1} / ${HERO.items.length}</span>` : HERO.items.map((_, k) => `<i class=\"${k === HERO.i ? 'on' : ''}\"></i>`).join('');", 1)

# ---- клики по вкладкам ----
old = "  if (el.dataset.hero) {"
assert old in a
a = a.replace(old, "  if (el.dataset.htab) { HERO.picked = true; heroSwitch(el.dataset.htab, true); return; }\n" + old, 1)

# ---- навигация пультом: ▲ с кнопок баннера на вкладки, ▼ с вкладок на кнопки ----
old = "  if (dir === 'left' && !inRail && scope === document.body && (!best || best.closest('#rail'))) { focusRail(); return; }"
assert old in a
a = a.replace(old, """  if (dir === 'up' && cur.closest('.hbtns') && $('.htab.on')) { $('.htab.on').focus({ preventScroll: true }); return; }
  if (dir === 'down' && cur.closest('.htabs')) { const w = $('#hero [data-hero=watch]'); if (w) { w.focus({ preventScroll: true }); return; } }
""" + old, 1)
open('app.js', 'w', encoding='utf8').write(a)

# ---- стили ----
c = open('style.css', encoding='utf8').read()
i0 = c.index("/* праздничный баннер на главной */")
c = c[:i0].rstrip() + """

/* вкладки главного баннера: праздничная и «В тренде» */
.htabs{position:absolute;right:40px;top:30px;display:flex;gap:12px;z-index:4}
.htab{padding:10px 26px;border-radius:30px;border:1px solid rgba(255,255,255,.2);background:rgba(11,12,16,.6);color:var(--text);font:600 24px var(--body)}
.htab.on{background:rgb(var(--ha,255,51,102));border-color:transparent;color:#fff}
.htab:focus{outline:none;box-shadow:0 0 0 4px #fff,0 0 28px rgba(var(--ha,255,51,102),.6)}
.hcount{font:600 22px var(--body);color:rgba(255,255,255,.7);letter-spacing:2px}
"""
open('style.css', 'w', encoding='utf8').write(c)
print('ok')
