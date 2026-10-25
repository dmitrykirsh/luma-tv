import re, os
os.chdir(r'D:\lift\tv\app\src\main\assets')

# ---------- HTML ----------
h = open('index.html', encoding='utf8').read()
if 'id="rail"' not in h:
    h = h.replace('<header id="top"></header>', '<nav id="rail"></nav>\n  <header id="top"></header>')
open('index.html', 'w', encoding='utf8').write(h)

# ---------- JS ----------
s = open('app.js', encoding='utf8').read()
s = s.replace("['tvshows', 'ТВ-шоу', 'show'], ['mine', 'Моё', 'heart']];",
              "['tvshows', 'ТВ-шоу', 'show'], ['mine', 'Моё', 'heart']];\nconst RAIL = 96;   // ширина свёрнутого левого меню, px сцены", 1)

a = s.index("function paintTop() {")
b = s.index("function tick()")
new = r'''let railBuilt = false;
function curTab() {
  if (route.name === 'section') return route.sec;
  if (route.name === 'details' || route.name === 'import') { const f = stack[0]?.route; return f ? (f.name === 'section' ? f.sec : f.name) : 'home'; }
  return TABS.some((t) => t[0] === route.name) ? route.name : '';
}
function paintTop() {
  const cur = curTab();
  if (!railBuilt) {
    $('#rail').innerHTML = `<div class="rl">${LOGO}<b>Luma</b></div>` + TABS.map(([k, label, ic]) => `<button class="ri f" tabindex="-1" data-tab="${k}" data-k="rail:${k}">${ico(ic)}<span>${label}</span></button>`).join('');
    railBuilt = true;
  }
  $$('#rail .ri').forEach((b) => b.classList.toggle('on', b.dataset.tab === cur));
  const title = route.name === 'details' ? '' : route.name === 'search' ? 'Поиск' : route.name === 'settings' ? 'Настройки' : route.name === 'import' ? 'Перенос данных' : (TABS.find((t) => t[0] === cur)?.[1] || '');
  $('#top').innerHTML = `<h1 class="ttl">${esc(title)}</h1><div class="sp"></div>
    <button class="ib f" tabindex="-1" data-tab="search" data-k="top:search" aria-label="Поиск">${ico('search')}</button><button class="ib f" tabindex="-1" data-tab="settings" data-k="top:settings" aria-label="Настройки">${ico('gear')}</button><div class="clock" id="clock"></div>`;
  tick();
}
'''
s = s[:a] + new + s[b:]

s = s.replace("""  if (stack.length) return back();
  if (route.name !== 'home') { topLevel('home'); return true; }
  return false;""", """  if (stack.length) return back();
  if (!document.activeElement?.closest?.('#rail')) { focusRail(); return true; }   // первое «Назад» — в левое меню (быстрый путь наверх)
  if (route.name !== 'home') { topLevel('home'); return true; }
  return false;""")

s = s.replace("function focusFirst() {", """function focusRail() { ($('#rail .ri.on') || $('#rail .ri'))?.focus({ preventScroll: true }); }
let lastContent = '';
function focusFirst() {""", 1)

s = s.replace("""  if (!cur) { list[0]?.focus({ preventScroll: true }); return; }
  const a = cur.getBoundingClientRect();""", """  if (!cur) { list[0]?.focus({ preventScroll: true }); return; }
  if (cur.closest('#rail') && dir === 'right' && scope === document.body) {
    const el = lastContent && $$('.f', view).find((x) => x.dataset.k === lastContent);
    const target = el || $('.f', view);
    if (target) { target.focus({ preventScroll: true }); return; }
  }
  const a = cur.getBoundingClientRect();""")

s = s.replace("""  if (best) best.focus({ preventScroll: true });
}""", """  if (best && dir === 'left' && best.closest('#rail') && !cur.closest('#rail')) { focusRail(); return; }
  if (best) best.focus({ preventScroll: true });
}""")

s = s.replace("""  ensureVisible(el);
  if (el.classList.contains('card') && el.dataset.poster)""", """  ensureVisible(el);
  if (el.closest('#view') && el.dataset.k) lastContent = el.dataset.k;
  if (el.classList.contains('card') && el.dataset.poster)""")

s = s.replace("  if (el.classList.contains('tab')) { view.scrollTo({ top: 0, behavior: 'smooth' }); }\n", "")
s = s.replace("else if (x < 64) track.scrollTo({ left: track.scrollLeft - (64 - x) - 20, behavior: beh });",
              "else if (x < RAIL + 48) track.scrollTo({ left: track.scrollLeft - (RAIL + 48 - x) - 20, behavior: beh });")
open('app.js', 'w', encoding='utf8').write(s)

# ---------- CSS ----------
c = open('style.css', encoding='utf8').read()
c = re.sub(r'(padding:[^;}]*?)64px', lambda m: m.group(1) + '48px', c)   # внутренние отступы страниц: слева теперь меню
a = c.index('/* верхняя панель */')
b = c.index('/* контент */')
top = '''/* верхняя панель: название раздела, поиск, настройки, часы */
#top{position:absolute;left:96px;right:0;top:0;height:104px;z-index:20;display:flex;align-items:center;padding:0 56px 0 48px;gap:8px;background:linear-gradient(rgba(11,12,16,.92),rgba(11,12,16,0))}
#top .ttl{font:700 40px var(--display);letter-spacing:.2px}
#top .sp{flex:1}
.ib svg{width:28px;height:28px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
.ib{width:56px;height:52px;border-radius:26px;display:grid;place-items:center;color:var(--muted)}
.clock{font:600 28px var(--body);margin-left:18px;color:var(--text);min-width:78px;text-align:right}
.f{outline:none}
.ib.f:focus{background:var(--grad);color:#fff;box-shadow:0 8px 28px rgba(255,51,102,.35)}

/* левое меню: свёрнуто в иконки, раскрывается, когда фокус на нём */
#rail{position:absolute;left:0;top:0;bottom:0;width:96px;z-index:30;display:flex;flex-direction:column;gap:6px;padding:26px 16px;overflow:hidden;background:linear-gradient(90deg,rgba(11,12,16,.97) 70%,rgba(11,12,16,.9));border-right:1px solid var(--line);transition:width .22s cubic-bezier(.22,1,.36,1)}
#rail:focus-within{width:340px;background:linear-gradient(90deg,rgba(11,12,16,.99) 75%,rgba(11,12,16,.6));border-right-color:transparent}
#rail .rl{display:flex;align-items:center;gap:16px;height:64px;margin-bottom:14px;padding-left:6px;white-space:nowrap}
#rail .rl svg{flex:none;width:48px;height:48px;filter:drop-shadow(0 0 14px rgba(255,51,102,.5))}
#rail .rl b{font:700 28px var(--display);opacity:0;transition:opacity .15s}
#rail:focus-within .rl b{opacity:1}
.ri{position:relative;flex:none;height:64px;border-radius:20px;display:flex;align-items:center;gap:22px;padding:0 18px;color:var(--muted);white-space:nowrap;text-align:left}
.ri svg{flex:none;width:32px;height:32px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
.ri span{font-size:26px;font-weight:600;opacity:0;transition:opacity .15s}
#rail:focus-within .ri span{opacity:1}
.ri.on{color:#fff}
.ri.on::before{content:"";position:absolute;left:-16px;top:16px;bottom:16px;width:5px;border-radius:0 5px 5px 0;background:var(--grad);box-shadow:0 0 14px var(--primary)}
.ri:focus{background:var(--grad);color:#fff;box-shadow:0 8px 26px rgba(255,51,102,.35)}

'''
c = c[:a] + top + c[b:]
c = c.replace("#view{position:absolute;inset:0;z-index:5;overflow:hidden;padding-top:104px}",
              "#view{position:absolute;left:96px;right:0;top:0;bottom:0;z-index:5;overflow:hidden;padding-top:104px}")
c = c.replace("width:228px", "width:220px").replace("height:342px", "height:330px")
c = c.replace("grid-template-columns:repeat(7,228px)", "grid-template-columns:repeat(7,220px)")
open('style.css', 'w', encoding='utf8').write(c)
print('ok')
