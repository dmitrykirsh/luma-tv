import os
os.chdir(r'D:\lift\tv\app\src\main')

# ---------- index.html: разметка заставки и фона ----------
h = open(r'assets\index.html', encoding='utf8').read()
a = h.index('<div id="splash">')
b = h.index('</div>', h.index('<b>Luma</b>', a)) + len('</div>')
old = h[a:b]
svg = old[old.index('<svg'):old.index('</svg>') + 6]
new = ('<div id="splash"><div class="sp-beam"></div><div class="sp-bloom"></div><div class="sp-ring"></div>'
       '<div class="sp-lock"><div class="sp-mark">' + svg + '</div><div class="sp-word"><b>Luma</b></div><i class="sp-shine"></i></div>'
       '<i class="sp-star s1"></i><i class="sp-star s2"></i><i class="sp-star s3"></i></div>')
h = h[:a] + new + h[b:]
h = h.replace('<div id="stage">\n', '<div id="stage">\n  <div id="aurora"><i></i><i></i></div>\n', 1)
open(r'assets\index.html', 'w', encoding='utf8').write(h)

# ---------- style.css ----------
c = open(r'assets\style.css', encoding='utf8').read()
i0 = c.index('#splash{'); i1 = c.index('#splash.off')
i1 = c.index('\n', i1) + 1
css = r"""/* заставка: только transform/opacity, поэтому вся анимация считается на видеокарте и почти не грузит приставку */
#splash{position:absolute;inset:0;z-index:100;background:var(--bg);overflow:hidden;display:flex;align-items:center;justify-content:center}
#splash.out{opacity:0;transform:scale(1.05);transition:opacity .5s ease-in,transform .5s ease-in}
#splash.off{display:none}   /* без плавного исчезновения: полупрозрачный логотип не просвечивает поверх главной */
#splash .sp-lock{position:relative;display:flex;align-items:center;gap:24px;overflow:hidden;padding:30px 60px}
#splash .sp-mark{width:130px;height:130px;opacity:0;transform:scale(.7);filter:drop-shadow(0 0 30px rgba(255,51,102,.55))}
#splash svg{width:100%;height:100%;display:block}
#splash .sp-word{overflow:hidden;clip-path:inset(0 100% 0 0);opacity:0}
#splash .sp-word b{display:block;font:700 92px var(--display);transform:translateX(-36px)}
#splash .sp-shine{position:absolute;top:-20%;bottom:-20%;left:0;width:140px;background:linear-gradient(100deg,transparent,rgba(255,255,255,.55),transparent);transform:translateX(-300px) skewX(-18deg);opacity:0;mix-blend-mode:overlay}
#splash .sp-beam{position:absolute;left:50%;top:-10%;width:1100px;height:120%;margin-left:-550px;background:linear-gradient(180deg,rgba(255,226,170,.16),rgba(255,160,90,.05) 55%,transparent 85%);clip-path:polygon(46% 0,54% 0,100% 100%,0 100%);opacity:0;transform-origin:50% 0}
#splash .sp-bloom{position:absolute;left:50%;top:50%;width:1200px;height:1200px;margin:-600px 0 0 -600px;background:radial-gradient(circle,rgba(255,51,102,.32),rgba(255,184,0,.08) 38%,transparent 62%);opacity:0;transform:scale(.4)}
#splash .sp-ring{position:absolute;left:50%;top:50%;width:260px;height:260px;margin:-130px 0 0 -250px;border-radius:50%;border:3px solid rgba(255,120,150,.7);opacity:0;transform:scale(.3)}
#splash .sp-star{position:absolute;width:26px;height:26px;opacity:0;transform:scale(0) rotate(0);background:radial-gradient(circle,#fff 0,rgba(255,255,255,.9) 12%,transparent 60%);clip-path:polygon(50% 0,60% 40%,100% 50%,60% 60%,50% 100%,40% 60%,0 50%,40% 40%)}
#splash .s1{left:calc(50% - 250px);top:calc(50% - 88px)}
#splash .s2{left:calc(50% + 240px);top:calc(50% - 40px);width:20px;height:20px}
#splash .s3{left:calc(50% + 60px);top:calc(50% + 70px);width:16px;height:16px}
#splash.go .sp-beam{animation:spBeam 1.5s linear both}
#splash.go .sp-mark{animation:spMark .9s cubic-bezier(.16,1,.3,1) .5s both}
#splash.go .sp-bloom{animation:spBloom 2s ease-out .52s both}
#splash.go .sp-ring{animation:spRing 1.2s ease-out .52s both}
#splash.go .sp-word{animation:spWord .75s cubic-bezier(.2,.8,.2,1) .8s both}
#splash.go .sp-word b{animation:spWordIn .75s cubic-bezier(.2,.8,.2,1) .8s both}
#splash.go .sp-shine{animation:spShine .9s ease-in-out 1.35s both}
#splash.go .sp-star{animation:spStar .8s ease-out both}
#splash.go .s1{animation-delay:1.45s} #splash.go .s2{animation-delay:1.62s} #splash.go .s3{animation-delay:1.8s}
@keyframes spBeam{0%{opacity:0}8%{opacity:.8}14%{opacity:.35}22%{opacity:.9}30%{opacity:.5}45%{opacity:.85}100%{opacity:0;transform:scaleY(1.05)}}
@keyframes spMark{from{opacity:0;transform:scale(.7)}to{opacity:1;transform:scale(1)}}
@keyframes spBloom{0%{opacity:0;transform:scale(.4)}25%{opacity:1}100%{opacity:.55;transform:scale(1)}}
@keyframes spRing{0%{opacity:.9;transform:scale(.3)}100%{opacity:0;transform:scale(3.4)}}
@keyframes spWord{from{opacity:1;clip-path:inset(0 100% 0 0)}to{opacity:1;clip-path:inset(0 0 0 0)}}
@keyframes spWordIn{from{transform:translateX(-36px)}to{transform:translateX(0)}}
@keyframes spShine{0%{opacity:1;transform:translateX(-300px) skewX(-18deg)}100%{opacity:1;transform:translateX(780px) skewX(-18deg)}}
@keyframes spStar{0%{opacity:0;transform:scale(0) rotate(0)}35%{opacity:1;transform:scale(1.2) rotate(40deg)}100%{opacity:0;transform:scale(.4) rotate(90deg)}}

/* фоновое переливание: два больших слоя с градиентом медленно плывут (только transform, без размытия и фильтров) */
#aurora{position:absolute;inset:0;z-index:0;overflow:hidden;pointer-events:none;contain:strict}
#aurora i{position:absolute;width:1500px;height:1500px;border-radius:50%;will-change:transform;backface-visibility:hidden}
#aurora i:nth-child(1){left:-500px;top:-600px;background:radial-gradient(circle,rgba(255,51,102,.16),rgba(255,51,102,.04) 45%,transparent 68%);animation:auroraA 38s ease-in-out infinite alternate}
#aurora i:nth-child(2){right:-600px;bottom:-700px;background:radial-gradient(circle,rgba(255,150,40,.12),rgba(120,60,255,.05) 48%,transparent 68%);animation:auroraB 46s ease-in-out infinite alternate}
@keyframes auroraA{0%{transform:translate3d(0,0,0)}50%{transform:translate3d(620px,260px,0) scale(1.08)}100%{transform:translate3d(260px,520px,0)}}
@keyframes auroraB{0%{transform:translate3d(0,0,0)}50%{transform:translate3d(-640px,-300px,0) scale(1.1)}100%{transform:translate3d(-220px,-560px,0)}}
body.noaurora #aurora, body.np #aurora{display:none}
"""
c = c[:i0] + css + c[i1:]
open(r'assets\style.css', 'w', encoding='utf8').write(c)

# ---------- app.js: запуск заставки ----------
j = open(r'assets\app.js', encoding='utf8').read()
old = "setTimeout(() => show({ name: 'home' }).then(() => setTimeout(() => $('#splash').classList.add('off'), 300)), 0);"
assert old in j
j = j.replace(old, r"""const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } };
if (lsGet('luma.tv.aurora', '1') === '0') document.body.classList.add('noaurora');
// заставка: логотип с анимацией и коротким звуком; приложение открывается, когда звук и анимация закончились и главная готова
let introStarted = false, homeReady = false, introDone = false, introAt = 0;
function introFinish() {
  if (introDone || !homeReady || Date.now() - introAt < 2850) return;
  introDone = true;
  const sp = $('#splash'); sp.classList.add('out'); setTimeout(() => sp.classList.add('off'), 520);
}
window.lumaStart = () => {
  if (introStarted) return; introStarted = true; introAt = Date.now();
  const sp = $('#splash');
  if (lsGet('luma.tv.intro', '1') === '0') { introAt = 0; introFinish(); return; }
  sp.classList.add('go');
  try { const a = new Audio('intro.mp3'); a.volume = 0.9; a.play().catch(() => {}); } catch {}
  setTimeout(introFinish, 2900);
};
setTimeout(() => { if (!introStarted) window.lumaStart(); }, 4500);   // если оболочка не подала сигнал, стартуем сами
setTimeout(() => show({ name: 'home' }).then(() => { homeReady = true; if (introStarted) introFinish(); }), 0);""", 1)
open(r'assets\app.js', 'w', encoding='utf8').write(j)

# ---------- settings.js: раздел «Оформление» ----------
s = open(r'assets\settings.js', encoding='utf8').read()
s = s.replace("['data', 'Данные', 'trash', 'История и кэш'],", "['look', 'Оформление', 'film', 'Заставка и фон'], ['data', 'Данные', 'trash', 'История и кэш'],", 1)
old = "  } else if (stCur === 'data') {"
assert old in s
s = s.replace(old, r"""  } else if (stCur === 'look') {
    const on = (k) => lsGet(k, '1') !== '0';
    p.innerHTML = card('film', 'Оформление', 'Заставка при запуске и анимированный фон. Всё считается на видеокарте и почти не нагружает приставку.') +
      `<button class="srow f" tabindex="-1" data-sact="opt:intro" data-k="o:intro"><span class="sri">${ico('film')}</span><span><b>Заставка со звуком</b><small>Короткая анимация логотипа и звук при запуске</small></span><i>${on('luma.tv.intro') ? 'Вкл' : 'Выкл'}</i></button>
       <button class="srow f" tabindex="-1" data-sact="opt:aurora" data-k="o:aurora"><span class="sri">${ico('star')}</span><span><b>Анимированный фон</b><small>Медленное тёмное переливание за каталогом</small></span><i>${on('luma.tv.aurora') ? 'Вкл' : 'Выкл'}</i></button>`;
""" + old, 1)
old = "  if (a === 'sync') go('sync');"
assert old in s
s = s.replace(old, r"""  if (a && a.startsWith('opt:')) {
    const k = 'luma.tv.' + a.slice(4), v = lsGet(k, '1') === '0' ? '1' : '0';
    try { localStorage.setItem(k, v); } catch {}
    if (a === 'opt:aurora') document.body.classList.toggle('noaurora', v === '0');
    paintPane(); $(`[data-sact="${a}"]`)?.focus({ preventScroll: true });
    return;
  }
""" + old, 1)
open(r'assets\settings.js', 'w', encoding='utf8').write(s)

# ---------- MainActivity.kt: сигнал о том, что окно показано ----------
m = open(r'java\ws\luma\tv\MainActivity.kt', encoding='utf8').read()
old = "view.postDelayed({ view.visibility = android.view.View.VISIBLE }, 350)"
assert old in m
m = m.replace(old, "view.postDelayed({ view.visibility = android.view.View.VISIBLE; js(\"window.lumaStart && window.lumaStart()\") }, 350)", 1)
open(r'java\ws\luma\tv\MainActivity.kt', 'w', encoding='utf8').write(m)
print('ok')
