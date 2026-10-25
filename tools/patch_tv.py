import os
os.chdir(r'D:\lift\tv\app\src\main\assets')

h = open('index.html', encoding='utf8').read()
if 'tv.js' not in h:
    h = h.replace('<script src="app.js"></script>', '<script src="hls.min.js"></script>\n<script src="app.js"></script>\n<script src="tv.js"></script>')
open('index.html', 'w', encoding='utf8').write(h)

s = open('app.js', encoding='utf8').read()
def rep(old, new, cnt=1):
    global s
    assert old in s, old[:60]
    s = s.replace(old, new, cnt)

rep("['tvshows', 'ТВ-шоу', 'show'], ['mine', 'Моё', 'heart']];", "['tvshows', 'ТВ-шоу', 'show'], ['tv', 'Каналы', 'live'], ['mine', 'Моё', 'heart']];")
rep("  restart: '<path", "  live: '<rect x=\"3\" y=\"7\" width=\"18\" height=\"13\" rx=\"2.5\"/><path d=\"M8 3l4 3.5L16 3\"/><circle cx=\"12\" cy=\"13.5\" r=\"2.2\"/>',\n  restart: '<path")
rep("const fn = { home: renderHome, mine: renderMine, search: renderSearch, settings: renderSettings, import: renderImport, details: renderDetails }[r.name] || renderSection;",
    "const fn = { home: renderHome, mine: renderMine, search: renderSearch, settings: renderSettings, import: renderImport, details: renderDetails }[r.name] || (window.RENDER && window.RENDER[r.name]) || renderSection;")
rep("topLevel(['home', 'mine', 'search', 'settings'].includes(k) ? k : 'section', ['home', 'mine', 'search', 'settings'].includes(k) ? {} : { sec: k });",
    "const top = ['home', 'mine', 'search', 'settings', 'tv'].includes(k); topLevel(top ? k : 'section', top ? {} : { sec: k });")
# назад / медиа-клавиши / пауза
rep("window.lumaBack = () => {\n", "window.lumaBack = () => {\n  if (window.tvBack && window.tvBack()) return true;\n")
rep("window.lumaMedia = (k) => { if (playing)", "window.lumaMedia = (k) => { if (window.tvMedia && window.tvMedia(k)) return; if (playing)")
rep("window.lumaPause = () => { if (playing)", "window.lumaPause = () => { if (window.tvPause) window.tvPause(); if (playing)")
# область перемещения фокуса: список каналов поверх плеера
rep("const scope = !$('#modal').classList.contains('hidden') ? $('#modal') : !$('#plPick').classList.contains('hidden') ? $('#plPick') : document.body;",
    "const tvl = $('#tvList');\n  const scope = !$('#modal').classList.contains('hidden') ? $('#modal') : !$('#plPick').classList.contains('hidden') ? $('#plPick') : (tvl && !tvl.classList.contains('hidden')) ? tvl : document.body;")
# клавиши: плеер ТВ
rep("document.addEventListener('keydown', (e) => {\n", "document.addEventListener('keydown', (e) => {\n  if (window.tvPlayerOpen && window.tvPlayerOpen()) {\n    if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); lumaBack(); return; }\n    if (window.tvKey(e)) return;\n  }\n")
# старт после загрузки tv.js
rep("show({ name: 'home' }).then(", "setTimeout(() => show({ name: 'home' }).then(")
rep("setTimeout(() => $('#splash').classList.add('off'), 300));", "setTimeout(() => $('#splash').classList.add('off'), 300)), 0);")
open('app.js', 'w', encoding='utf8').write(s)

c = open('style.css', encoding='utf8').read()
c += '''
/* ТВ-каналы */
.tvgrid{grid-template-columns:repeat(5,300px);gap:26px 24px}
.chc{flex:none;width:300px;position:relative;transition:transform .22s cubic-bezier(.22,1,.36,1)}
.chc .lg{position:relative;height:168px;border-radius:18px;background:var(--surface);display:grid;place-items:center;overflow:hidden}
.chc .lg span{font:700 44px var(--display);color:var(--muted);text-transform:uppercase}
.chc .lg img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;padding:26px 36px;opacity:0;transition:opacity .3s;background:var(--surface)}
.chc .lg img.ok{opacity:1}
.chc .st{position:absolute;right:12px;top:8px;font-style:normal;font-size:26px;color:var(--accent)}
.chc .n{margin-top:12px;font-size:24px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.chc .np{margin-top:2px;font-size:20px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.chc .pg{position:absolute;left:0;top:160px;height:7px;background:var(--grad);border-radius:0 4px 0 0}
.chc:focus{transform:scale(1.05);z-index:3}
.chc:focus .lg{box-shadow:0 0 0 5px var(--primary),0 14px 40px rgba(255,51,102,.35)}
.tvchips{flex-wrap:wrap;gap:12px 12px;padding-bottom:14px}
#tvp{position:absolute;inset:0;z-index:60;background:#000}
#tvv{position:absolute;inset:0;width:100%;height:100%;background:#000;object-fit:contain}
#tvst{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:22px;font-size:30px;font-weight:600;text-shadow:0 2px 12px #000}
#tvOsd{position:absolute;left:0;right:0;bottom:0;padding:90px 96px 56px;background:linear-gradient(transparent,rgba(5,6,8,.92))}
#tvOsd .o1{display:flex;align-items:baseline;gap:24px}
#tvOsd b{font:700 46px var(--display)}
#tvOsd .o1 span{font-size:24px;color:var(--muted)}
#tvOsd .o2{margin-top:10px;font-size:32px;font-weight:600}
#tvOsd .o3{margin-top:16px;height:7px;border-radius:4px;background:rgba(255,255,255,.22);overflow:hidden}
#tvOsd .o3 i{display:block;height:100%;background:linear-gradient(90deg,#FFB800,#FF3366)}
#tvOsd .o4{margin-top:12px;font-size:25px;color:#d6d9e0;min-height:30px}
#tvOsd .o5{margin-top:8px;font-size:21px;color:var(--muted)}
#tvList{position:absolute;left:0;top:0;bottom:0;width:760px;background:linear-gradient(90deg,rgba(11,12,16,.97) 88%,rgba(11,12,16,0));padding:34px 60px 20px 48px;display:flex;flex-direction:column}
.tl-h{font:700 32px var(--display);margin-bottom:18px}
.tl-b{flex:1;overflow:hidden auto;display:flex;flex-direction:column;gap:10px;scrollbar-width:none}
.tl-b::-webkit-scrollbar{display:none}
.tl-r{display:flex;gap:10px;flex:none}
.tl-c{flex:1;min-width:0;height:78px;border-radius:18px;background:var(--surface);padding:0 24px;display:flex;flex-direction:column;justify-content:center;text-align:left}
.tl-c .a{font-size:26px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tl-c .b{font-size:20px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tl-c.cur{box-shadow:inset 0 0 0 3px var(--accent)}
.tl-s{flex:none;width:78px;height:78px;border-radius:18px;background:var(--surface);font-size:34px;color:var(--muted)}
.tl-s.on{color:var(--accent)}
.tl-c:focus,.tl-s:focus{background:var(--grad);color:#fff}
.tl-c:focus .b{color:rgba(255,255,255,.85)}
.tl-s.on:focus{color:#fff}
'''
open('style.css', 'w', encoding='utf8').write(c)
print('patched')
