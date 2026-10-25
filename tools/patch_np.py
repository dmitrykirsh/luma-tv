import os
os.chdir(r'D:\lift\tv\app\src\main\assets')

h = open('index.html', encoding='utf8').read()
if 'nplayer.js' not in h:
    h = h.replace('<script src="update.js"></script>', '<script src="update.js"></script>\n<script src="nplayer.js"></script>')
open('index.html', 'w', encoding='utf8').write(h)

s = open('app.js', encoding='utf8').read()
def rep(old, new, cnt=1):
    global s
    assert old in s, old[:70]
    s = s.replace(old, new, cnt)

# назад
rep("window.lumaBack = () => {\n", "window.lumaBack = () => {\n  if (window.npBack && window.npBack()) return true;\n")
# медиа-клавиши
rep("window.lumaMedia = (k) => { if (window.tvMedia", "window.lumaMedia = (k) => { if (window.npMedia && window.npMedia(k)) return; if (window.tvMedia")
# область перемещения фокуса
rep("const tvl = $('#tvList'), tvg = $('#tvProg');\n  const scope = (tvg", "const tvl = $('#tvList'), tvg = $('#tvProg');\n  const npm = window.npActive && window.npActive() ? ($('#npMenu') && !$('#npMenu').classList.contains('hidden') ? $('#npMenu') : $('#np')) : null;\n  const scope = npm ? npm : (tvg")
# клавиши
rep("document.addEventListener('keydown', (e) => {\n", "document.addEventListener('keydown', (e) => {\n  if (window.npActive && window.npActive()) {\n    if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); lumaBack(); return; }\n    if (window.npKey(e)) return;\n  }\n")
open('app.js', 'w', encoding='utf8').write(s)

n = open('nplayer.js', encoding='utf8').read()
old = "    det = { d: NP.d, seasons: NP.seasons };\n    paintEps($('#npSeasons'), $('#npEps'), NP.npSeason || NP.season, 'n', { season: NP.season, episode: NP.episode });"
assert old in n
n = n.replace(old, "    const savedDet = det; det = { d: NP.d, seasons: NP.seasons };\n    paintEps($('#npSeasons'), $('#npEps'), NP.npSeason || NP.season, 'n', { season: NP.season, episode: NP.episode });\n    det = savedDet;")
old = "  if (el.dataset.pkSeason && el.dataset.pref === 'n') { NP.npSeason = el.dataset.pkSeason; renderNpMenu(false); $(`[data-k=\"ns${el.dataset.pkSeason}\"]`)?.focus({ preventScroll: true }); }\n  else if (el.dataset.ep && el.closest('#npEps')) { closeNpMenu(true); playItemNative(NP.d, NP.seasons, el.dataset.season, el.dataset.ep); }"
assert old in n
n = n.replace(old, "  if (el.dataset.pkSeason && el.dataset.pref === 'n') { e.stopImmediatePropagation(); NP.npSeason = el.dataset.pkSeason; renderNpMenu(false); $(`[data-k=\"ns${el.dataset.pkSeason}\"]`)?.focus({ preventScroll: true }); }\n  else if (el.dataset.ep && el.closest('#npEps')) { e.stopImmediatePropagation(); closeNpMenu(true); playItemNative(NP.d, NP.seasons, el.dataset.season, el.dataset.ep); }")
open('nplayer.js', 'w', encoding='utf8').write(n)

c = open('style.css', encoding='utf8').read()
c += '''
/* плеер: видео рисует система под прозрачной страницей */
html:has(body.np),body.np,body.np #stage{background:transparent!important}
body.np #view,body.np #rail,body.np #top{display:none}
#np{position:absolute;inset:0;z-index:60}
.np-load{position:absolute;inset:0;background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;font-size:30px;font-weight:600}
.np-buf{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);padding:24px;border-radius:50%;background:rgba(11,12,16,.6)}
.np-osd{position:absolute;left:0;right:0;bottom:0;padding:120px 80px 44px;background:linear-gradient(transparent,rgba(5,6,8,.55) 30%,rgba(5,6,8,.92))}
.np-title b{font:700 44px var(--display)}
.np-title span{margin-left:22px;font-size:26px;color:var(--muted)}
.np-bar{position:relative;margin-top:22px;height:10px;border-radius:5px;background:rgba(255,255,255,.22)}
.np-bar .pos{position:absolute;left:0;top:0;bottom:0;border-radius:5px;background:linear-gradient(90deg,#FFB800,#FF3366);width:0}
.np-bar .t0,.np-bar .t1{position:absolute;top:22px;font-size:24px;font-weight:600}
.np-bar .t0{left:0}.np-bar .t1{right:0}
.np-btns{display:flex;align-items:center;gap:14px;margin-top:70px}
.npsp{flex:1}
.npb{height:68px;min-width:68px;border-radius:34px;background:rgba(248,249,250,.14);display:grid;place-items:center;padding:0 22px;font-size:28px;color:#fff}
.npb svg{width:30px;height:30px;fill:currentColor}
.npb.big{width:86px;height:86px;min-width:86px;border-radius:50%}
.npb.big svg{width:38px;height:38px}
.npb.txt{font-size:24px;font-weight:600}
.npb:focus{background:var(--grad);box-shadow:0 8px 26px rgba(255,51,102,.4)}
.np-hint{margin-top:18px;font-size:21px;color:var(--muted)}
.np-skip{position:absolute;right:80px;bottom:260px}
.np-skip .btn{height:68px}
.np-menu{position:absolute;right:0;top:0;bottom:0;width:640px;background:linear-gradient(270deg,rgba(11,12,16,.97) 85%,rgba(11,12,16,0));padding:50px 56px 30px 110px;overflow:hidden auto;scrollbar-width:none}
.np-menu::-webkit-scrollbar{display:none}
.np-menu h3{font:700 34px var(--display);margin-bottom:22px}
.nm-list{display:flex;flex-direction:column;gap:10px}
.nm-r{display:flex;align-items:center;gap:18px;min-height:74px;padding:10px 24px;border-radius:18px;background:var(--surface);font-size:26px;font-weight:600;text-align:left}
.nm-r i{flex:none;width:30px;font-style:normal;color:var(--accent);font-size:28px}
.nm-r span{flex:1}.nm-r small{font-size:20px;color:var(--muted)}
.nm-r.on{box-shadow:inset 0 0 0 3px var(--accent)}
.nm-r:focus{background:var(--grad);color:#fff}
.nm-r:focus small,.nm-r:focus i{color:#fff}
.nm-e{color:var(--muted);font-size:24px;padding:20px 0}
.np-menu .epgrid{flex-wrap:wrap;gap:12px}
.np-menu .seasons{flex-wrap:wrap;gap:10px}
'''
open('style.css', 'w', encoding='utf8').write(c)
print('ok')
