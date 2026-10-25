import os, shutil
os.chdir(r'D:\lift\app')
shutil.copyfile(r'D:\lift\tv\app\src\main\assets\intro.mp3', r'renderer\intro.mp3')

# ---------- main.js: звук можно играть без нажатия ----------
m = open('main.js', encoding='utf8').read()
old = "webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: false }"
assert old in m
m = m.replace(old, "webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: false, autoplayPolicy: 'no-user-gesture-required' }", 1)
open('main.js', 'w', encoding='utf8').write(m)

# ---------- index.html ----------
h = open(r'renderer\index.html', encoding='utf8').read()
old = '<div id="splash"><div class="splash-in"><div id="splashLogo"></div><p>Включи свою историю</p></div></div>'
assert old in h
h = h.replace(old, '<div id="splash"><div class="sp-beam"></div><div class="sp-bloom"></div><div class="sp-ring"></div>'
              '<div class="sp-lock"><div class="sp-mark" id="splashLogo"></div><div class="sp-word"><b>Luma</b></div><i class="sp-shine"></i></div>'
              '<p class="sp-tag">Включи свою историю</p>'
              '<i class="sp-star s1"></i><i class="sp-star s2"></i><i class="sp-star s3"></i></div>\n<div id="aurora"><i></i><i></i></div>', 1)
open(r'renderer\index.html', 'w', encoding='utf8').write(h)

# ---------- style.css ----------
c = open(r'renderer\style.css', encoding='utf8').read()
c += r"""

/* ===== заставка с анимацией и звуком; только transform/opacity, поэтому нагрузка на видеокарту минимальная ===== */
#splash{overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;transition:none}
#splash.out{opacity:0;transform:scale(1.05);transition:opacity .5s ease-in,transform .5s ease-in}
#splash.gone{display:none}
#splash svg,#splash svg.luma-logo{animation:none}
#splash .sp-lock{position:relative;display:flex;align-items:center;gap:16px;overflow:hidden;padding:24px 50px}
#splash .sp-mark{opacity:0;transform:scale(.7);filter:drop-shadow(0 0 22px rgba(255,51,102,.55));display:flex}
#splash .sp-word{overflow:hidden;clip-path:inset(0 100% 0 0);opacity:0}
#splash .sp-word b{display:block;font:700 64px 'Unbounded',Inter,sans-serif;color:#F8F9FA;transform:translateX(-28px)}
#splash .sp-tag{position:absolute;left:0;right:0;top:calc(50% + 78px);text-align:center;color:var(--muted);font-size:14px;letter-spacing:.2em;text-transform:uppercase;font-weight:500;opacity:0}
#splash .sp-shine{position:absolute;top:-20%;bottom:-20%;left:0;width:110px;background:linear-gradient(100deg,transparent,rgba(255,255,255,.55),transparent);transform:translateX(-240px) skewX(-18deg);opacity:0;mix-blend-mode:overlay}
#splash .sp-beam{position:absolute;left:50%;top:-10%;width:900px;height:120%;margin-left:-450px;background:linear-gradient(180deg,rgba(255,226,170,.16),rgba(255,160,90,.05) 55%,transparent 85%);clip-path:polygon(46% 0,54% 0,100% 100%,0 100%);opacity:0;transform-origin:50% 0}
#splash .sp-bloom{position:absolute;left:50%;top:50%;width:1000px;height:1000px;margin:-500px 0 0 -500px;background:radial-gradient(circle,rgba(255,51,102,.32),rgba(255,184,0,.08) 38%,transparent 62%);opacity:0;transform:scale(.4)}
#splash .sp-ring{position:absolute;left:50%;top:50%;width:200px;height:200px;margin:-100px 0 0 -190px;border-radius:50%;border:2px solid rgba(255,120,150,.7);opacity:0;transform:scale(.3)}
#splash .sp-star{position:absolute;width:22px;height:22px;opacity:0;transform:scale(0) rotate(0);background:radial-gradient(circle,#fff 0,rgba(255,255,255,.9) 12%,transparent 60%);clip-path:polygon(50% 0,60% 40%,100% 50%,60% 60%,50% 100%,40% 60%,0 50%,40% 40%)}
#splash .s1{left:calc(50% - 190px);top:calc(50% - 66px)}
#splash .s2{left:calc(50% + 190px);top:calc(50% - 30px);width:16px;height:16px}
#splash .s3{left:calc(50% + 40px);top:calc(50% + 50px);width:13px;height:13px}
#splash.go .sp-beam{animation:spBeam 1.5s linear both}
#splash.go .sp-mark{animation:spMark .9s cubic-bezier(.16,1,.3,1) .5s both}
#splash.go .sp-bloom{animation:spBloom 2s ease-out .52s both}
#splash.go .sp-ring{animation:spRing 1.2s ease-out .52s both}
#splash.go .sp-word{animation:spWord .75s cubic-bezier(.2,.8,.2,1) .8s both}
#splash.go .sp-word b{animation:spWordIn .75s cubic-bezier(.2,.8,.2,1) .8s both}
#splash.go .sp-shine{animation:spShine .9s ease-in-out 1.35s both}
#splash.go .sp-tag{animation:spTag .7s ease-out 1.5s both}
#splash.go .sp-star{animation:spStar .8s ease-out both}
#splash.go .s1{animation-delay:1.45s} #splash.go .s2{animation-delay:1.62s} #splash.go .s3{animation-delay:1.8s}
@keyframes spBeam{0%{opacity:0}8%{opacity:.8}14%{opacity:.35}22%{opacity:.9}30%{opacity:.5}45%{opacity:.85}100%{opacity:0;transform:scaleY(1.05)}}
@keyframes spMark{from{opacity:0;transform:scale(.7)}to{opacity:1;transform:scale(1)}}
@keyframes spBloom{0%{opacity:0;transform:scale(.4)}25%{opacity:1}100%{opacity:.55;transform:scale(1)}}
@keyframes spRing{0%{opacity:.9;transform:scale(.3)}100%{opacity:0;transform:scale(3.4)}}
@keyframes spWord{from{opacity:1;clip-path:inset(0 100% 0 0)}to{opacity:1;clip-path:inset(0 0 0 0)}}
@keyframes spWordIn{from{transform:translateX(-28px)}to{transform:translateX(0)}}
@keyframes spShine{0%{opacity:1;transform:translateX(-240px) skewX(-18deg)}100%{opacity:1;transform:translateX(620px) skewX(-18deg)}}
@keyframes spTag{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes spStar{0%{opacity:0;transform:scale(0) rotate(0)}35%{opacity:1;transform:scale(1.2) rotate(40deg)}100%{opacity:0;transform:scale(.4) rotate(90deg)}}

/* фоновое переливание: два больших слоя с градиентом медленно плывут (только transform, без размытия и фильтров) */
#aurora{position:fixed;inset:0;z-index:0;overflow:hidden;pointer-events:none;contain:strict}
#aurora i{position:absolute;width:1300px;height:1300px;border-radius:50%;will-change:transform;backface-visibility:hidden}
#aurora i:nth-child(1){left:-450px;top:-520px;background:radial-gradient(circle,rgba(255,51,102,.15),rgba(255,51,102,.04) 45%,transparent 68%);animation:auroraA 38s ease-in-out infinite alternate}
#aurora i:nth-child(2){right:-520px;bottom:-600px;background:radial-gradient(circle,rgba(255,150,40,.11),rgba(120,60,255,.05) 48%,transparent 68%);animation:auroraB 46s ease-in-out infinite alternate}
@keyframes auroraA{0%{transform:translate3d(0,0,0)}50%{transform:translate3d(520px,220px,0) scale(1.08)}100%{transform:translate3d(220px,440px,0)}}
@keyframes auroraB{0%{transform:translate3d(0,0,0)}50%{transform:translate3d(-540px,-260px,0) scale(1.1)}100%{transform:translate3d(-180px,-480px,0)}}
body.noaurora #aurora{display:none}
body.is-hidden #aurora i{animation-play-state:paused}
"""
open(r'renderer\style.css', 'w', encoding='utf8').write(c)

# ---------- app.js ----------
j = open(r'renderer\app.js', encoding='utf8').read()
old = """  $('#splashLogo').innerHTML = window.lumaLogo({ height: 64 });
  await initStore();
  await refreshTmdb();
  buildNav();
  go({ name: 'home' });
  setTimeout(() => $('#splash').classList.add('gone'), 900);
})();"""
assert old in j
j = j.replace(old, """  $('#splashLogo').innerHTML = window.lumaLogo({ wordmark: false, height: 84 });
  if (optGet('luma.aurora', '1') === '0') document.body.classList.add('noaurora');
  // заставка: логотип с анимацией и коротким звуком; приложение открывается, когда звук и анимация закончились
  const introOn = optGet('luma.intro', '1') !== '0';
  let introAt = 0;
  const startIntro = () => {
    if (introAt) return; introAt = Date.now();
    if (!introOn) return;
    $('#splash').classList.add('go');
    try { const a = new Audio('intro.mp3'); a.volume = 0.8; a.play().catch(() => {}); } catch {}
  };
  if (document.visibilityState === 'visible') startIntro(); else document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') startIntro(); }, { once: true });
  setTimeout(startIntro, 3000);
  await initStore();
  await refreshTmdb();
  buildNav();
  go({ name: 'home' });
  const left = introOn ? Math.max(0, 2850 - (Date.now() - (introAt || Date.now()))) : 0;
  setTimeout(() => { const sp = $('#splash'); sp.classList.add('out'); setTimeout(() => sp.classList.add('gone'), 520); }, left);
})();""", 1)
j = j.replace("/* ================= старт ================= */", r"""/* ================= оформление: заставка и фон ================= */
function optGet(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } }
document.addEventListener('visibilitychange', () => document.body.classList.toggle('is-hidden', document.visibilityState !== 'visible'));
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-opt]'); if (!b) return;
  const k = 'luma.' + b.dataset.opt, v = optGet(k, '1') === '0' ? '1' : '0';
  try { localStorage.setItem(k, v); } catch {}
  if (b.dataset.opt === 'aurora') document.body.classList.toggle('noaurora', v === '0');
  b.classList.toggle('on', v !== '0'); b.textContent = v !== '0' ? 'Включено' : 'Выключено';
});

/* ================= старт ================= */""", 1)
old = '    <section class="set-card" id="tmProxyCard">'
assert old in j
j = j.replace(old, """    <section class="set-card" id="lookCard">
      <div class="set-head"><div><h2>Оформление</h2><p>Заставка с анимацией логотипа и звуком при запуске и медленное тёмное переливание фона. Всё считается на видеокарте и почти не нагружает компьютер.</p></div></div>
      <div class="key-row"><span style="flex:1">Заставка со звуком при запуске</span><button class="pill ${optGet('luma.intro', '1') !== '0' ? 'on' : ''}" data-opt="intro">${optGet('luma.intro', '1') !== '0' ? 'Включено' : 'Выключено'}</button></div>
      <div class="key-row"><span style="flex:1">Анимированный фон</span><button class="pill ${optGet('luma.aurora', '1') !== '0' ? 'on' : ''}" data-opt="aurora">${optGet('luma.aurora', '1') !== '0' ? 'Включено' : 'Выключено'}</button></div>
    </section>
""" + old, 1)
open(r'renderer\app.js', 'w', encoding='utf8').write(j)
print('ok')
