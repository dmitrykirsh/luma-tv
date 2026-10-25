import os, re
os.chdir(r'D:\lift\tv\app\src\main\assets')

h = open('index.html', encoding='utf8').read()
if 'details.js' not in h:
    h = h.replace('<script src="tv.js"></script>', '<script src="brands.js"></script>\n<script src="tv.js"></script>\n<script src="details.js"></script>')
open('index.html', 'w', encoding='utf8').write(h)

s = open('app.js', encoding='utf8').read()
def rep(old, new, cnt=1):
    global s
    assert old in s, old[:70]
    s = s.replace(old, new, cnt)

rep("const fn = { home: renderHome,", "const fn = (window.RENDER && window.RENDER[r.name]) || { home: renderHome,")
rep("|| (window.RENDER && window.RENDER[r.name]) || renderSection;", "|| renderSection;")
rep("return { kind, imdb:", "return { kind, tmdb: found.id, vote: Number(x.vote_average) || 0, imdb:")
rep("  restart: '<path", "  trailer: '<rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"3\"/><path d=\"M10 9.5v5l4.5-2.5z\"/>',\n  restart: '<path")
# назад: трейлер и просмотр кадров закрываются первыми
rep("window.lumaBack = () => {\n", "window.lumaBack = () => {\n  if (window.lightboxBack && window.lightboxBack()) return true;\n  if (window.trailerBack && window.trailerBack()) return true;\n")
# клавиши: просмотр кадров, трейлер
rep("document.addEventListener('keydown', (e) => {\n", "document.addEventListener('keydown', (e) => {\n  if (window.lightboxOpen && window.lightboxOpen()) { if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); lumaBack(); return; } if (window.lightboxKey(e)) return; e.preventDefault(); return; }\n  if (window.trailerOpen && window.trailerOpen()) { if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); lumaBack(); } return; }\n")
open('app.js', 'w', encoding='utf8').write(s)

c = open('style.css', encoding='utf8').read()
c += '''
/* оценки с логотипами сервисов */
.det .rates{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin-top:18px}
.rate{display:inline-flex;align-items:center;gap:10px;font:700 28px var(--body);padding:8px 18px 8px 14px;border-radius:16px;background:rgba(24,26,32,.85);border:1px solid var(--line)}
.rate b{font-weight:700}
.rate .brand{width:30px;height:30px;flex:none;display:block}
.rate .brand.wide{width:52px;height:30px}
svg.brand,svg.brand path{stroke:none!important;fill-rule:evenodd}
.rate.hi{color:var(--accent)}.rate.mid{color:var(--text)}.rate.lo{color:rgba(248,249,250,.78)}
.genres{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px}
.chip.genre{height:44px;font-size:21px;color:var(--text);background:rgba(248,249,250,.1)}
.det .rates small{display:none}

/* вкладки и панели страницы фильма */
.dtabs{display:flex;gap:12px;padding:6px 48px 4px;overflow:hidden;position:relative}
.dtabs .chip{flex:none}
.dpanel{padding:14px 48px 40px;min-height:300px}
.blk{padding:18px 24px;border-radius:18px;background:rgba(24,26,32,.7);margin-bottom:12px;font-size:24px;line-height:1.5;color:#d6d9e0}
.blk:focus{background:var(--surface-2);box-shadow:0 0 0 4px var(--primary)}
.desc2{font-size:25px;line-height:1.55}
.facts{display:grid;grid-template-columns:repeat(3,1fr);gap:14px 28px;padding:20px 24px;border-radius:18px;background:rgba(24,26,32,.7);margin-bottom:12px}
.facts:focus{background:var(--surface-2);box-shadow:0 0 0 4px var(--primary)}
.fact small{display:block;color:var(--muted);font-size:19px;margin-bottom:4px}
.fact b{font-size:23px;font-weight:600}
.ph3{font:600 28px var(--display);margin:22px 0 12px}
.triv{font-size:22px}
.trailers{display:grid;grid-template-columns:repeat(3,1fr);gap:22px}
.tr{position:relative;border-radius:18px;transition:transform .22s}
.tr .th{position:relative;height:220px;border-radius:18px;overflow:hidden;background:var(--surface)}
.tr .th img{width:100%;height:100%;object-fit:cover}
.tr .th i{position:absolute;inset:0;display:grid;place-items:center;font-style:normal;font-size:60px;color:#fff;text-shadow:0 4px 20px #000;opacity:.9}
.tr b{display:block;margin-top:10px;font-size:22px;font-weight:600;line-height:1.3;height:58px;overflow:hidden}
.tr small{color:var(--muted);font-size:19px}
.tr:focus{transform:scale(1.04);z-index:3}
.tr:focus .th{box-shadow:0 0 0 5px var(--primary),0 14px 40px rgba(255,51,102,.35)}
.people{padding-left:0!important;padding-right:0!important}
.person{flex:none;width:190px;text-align:center;transition:transform .22s}
.person .pha{width:150px;height:150px;border-radius:50%;margin:0 auto 12px;overflow:hidden;background:var(--surface);display:grid;place-items:center;font:700 52px var(--display);color:var(--muted)}
.person .pha img{width:100%;height:100%;object-fit:cover}
.person b{display:block;font-size:22px;font-weight:600;line-height:1.25}
.person small{display:block;color:var(--muted);font-size:19px;margin-top:3px}
.person:focus{transform:scale(1.06)}
.person:focus .pha{box-shadow:0 0 0 5px var(--primary),0 14px 40px rgba(255,51,102,.35)}
.shots2{padding-left:0!important;padding-right:0!important}
#trl,#lbx{position:absolute;inset:0;z-index:70;background:#000}
#trlFrame{position:absolute;inset:0;width:100%;height:100%;border:0}
#lbx{display:grid;place-items:center}
#lbxImg{max-width:100%;max-height:100%;object-fit:contain}
#lbxN{position:absolute;right:40px;bottom:30px;font-size:26px;font-weight:600;text-shadow:0 2px 10px #000}
'''
open('style.css', 'w', encoding='utf8').write(c)
print('ok')
