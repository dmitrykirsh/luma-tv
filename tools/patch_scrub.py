import os
os.chdir(r'D:\lift\tv\app\src\main\assets')
n = open('nplayer.js', encoding='utf8').read()
def rep(old, new, cnt=1):
    global n
    assert old in n, old[:70]
    n = n.replace(old, new, cnt)

# ---- разбор превью со страницы плеера ----
rep("function npParse(html) {", """// превью для перемотки: спрайты кадров (по умолчанию 10×10 кадров 160×90 раз в 5 секунд)
function parsePreview(raw) {
  if (!raw) return null;
  const src = (String(raw).match(/src:\\s*"([^"]+)"/) || String(raw).match(/"src":\\s*"([^"]+)"/) || [])[1];
  if (!src || !src.includes('${spriteNum}')) return null;
  const num = (k, d) => { const m = String(raw).match(new RegExp('["\\\\s{,]' + k + '"?\\\\s*:\\\\s*(\\\\d+)')); return m ? Number(m[1]) : d; };
  return { src, interval: num('interval', 5), w: num('width', 160), h: num('height', 90), size: num('spriteSize', 100), row: num('rowSize', 10), first: num('firstNum', 1) };
}
function npParse(html) {""")
rep("    if (out.seasons) for (const s of out.seasons) for (const e of s.episodes || []) { e.hls = fix(e.hls); e.dasha = fix(e.dasha); e.dash = fix(e.dash); }",
    "    if (out.seasons) for (const s of out.seasons) for (const e of s.episodes || []) { e.hls = fix(e.hls); e.dasha = fix(e.dasha); e.dash = fix(e.dash); e.prev = e.preview && e.preview.src ? parsePreview(JSON.stringify(e.preview)) : null; }")
rep("out.movie = { hls: fix(hls),", "out.movie = { prev: parsePreview((seg.match(/preview:\\s*\\{[^}]*\\}/) || [])[0]), hls: fix(hls),")
rep("    return { hls: e.hls, dash: e.dash, dasha: e.dasha,", "    return { prev: e.prev, hls: e.hls, dash: e.dash, dasha: e.dasha,")
rep("  NP.src = src; NP.secs", "  NP.prev = src.prev || null; NP.scrub = null; NP.src = src; NP.secs")

# ---- панель: метка и окошко с кадром ----
rep('<div class="np-bar"><i class="pos"></i><span class="t0">0:00</span><span class="t1">0:00</span></div>',
    '<div class="np-bar"><i class="pos"></i><i class="mark"></i><div class="np-thumb hidden"><div class="img"></div><span></span></div><span class="t0">0:00</span><span class="t1">0:00</span></div>')

# пока идёт перемотка, текущее состояние плеера не двигает полоску
rep("  if (d) {\n    $('#np .pos').style.width", "  if (d && !NP.scrub) {\n    $('#np .pos').style.width")

# ---- логика перемотки ----
rep("  if (k === 'ArrowLeft' || k === 'ArrowRight') {\n    const dir = k === 'ArrowRight' ? 1 : -1, now = Date.now();\n    NP.seek.step = now - NP.seek.t < 500 ? Math.min(NP.seek.step * 1.5, 180) : 10; NP.seek.t = now;\n    NATIVE.npCmd('seekBy', dir * NP.seek.step * 1000);\n    npOsd(3000); e.preventDefault(); return true;\n  }\n  if (k === 'Enter') {",
"""  if (k === 'ArrowLeft' || k === 'ArrowRight') {
    const dir = k === 'ArrowRight' ? 1 : -1, now = Date.now();
    NP.seek.step = now - NP.seek.t < 500 ? Math.min(NP.seek.step * 1.5, 180) : 10; NP.seek.t = now;
    const dur = NP.st.d / 1000 || 1e9;
    if (!NP.scrub) NP.scrub = { t: NP.st.p / 1000 };
    NP.scrub.t = Math.max(0, Math.min(dur - 2, NP.scrub.t + dir * NP.seek.step));
    showScrub(); clearTimeout(NP.scrubT); NP.scrubT = setTimeout(commitScrub, 800);   // применится, когда перестанете нажимать
    e.preventDefault(); return true;
  }
  if (k === 'Enter' && NP.scrub) { commitScrub(); e.preventDefault(); return true; }
  if (k === 'Enter') {""")

rep("/* ---------- пульт ---------- */", """/* ---------- перемотка с превью кадров ---------- */
const sprites = new Map();
function showScrub() {
  const t = NP.scrub.t, d = NP.st.d / 1000;
  npOsd(4000);
  $('#np .mark').style.left = (d ? t / d * 100 : 0) + '%'; $('#np .mark').classList.add('on');
  $('#np .pos').style.width = (d ? t / d * 100 : 0) + '%';
  $('#np .t0').textContent = npFmt(t);
  const box = $('#np .np-thumb'); box.classList.remove('hidden');
  box.style.left = Math.max(8, Math.min(92, d ? t / d * 100 : 0)) + '%';
  $('span', box).textContent = npFmt(t);
  const P = NP.prev, img = $('.img', box);
  if (!P) { img.style.display = 'none'; return; }
  img.style.display = '';
  const idx = Math.floor(t / P.interval), sprite = P.first + Math.floor(idx / P.size), within = idx % P.size;
  const url = P.src.replace('${spriteNum}', sprite), col = within % P.row, row = Math.floor(within / P.row);
  const Z = 2;   // кадр 160×90 показываем 320×180
  img.style.width = P.w * Z + 'px'; img.style.height = P.h * Z + 'px';
  img.style.backgroundImage = `url("${url}")`;
  img.style.backgroundSize = P.w * P.row * Z + 'px auto';
  img.style.backgroundPosition = `-${col * P.w * Z}px -${row * P.h * Z}px`;
  if (!sprites.has(url)) { const i = new Image(); i.src = url; sprites.set(url, 1); }   // заранее загружаем этот и соседний спрайт
  const next = P.src.replace('${spriteNum}', sprite + 1); if (!sprites.has(next) && idx % P.size > P.size - 25) { const i = new Image(); i.src = next; sprites.set(next, 1); }
}
function commitScrub() {
  clearTimeout(NP.scrubT);
  if (!NP.scrub) return;
  const t = NP.scrub.t; NP.scrub = null;
  NATIVE.npCmd('seekTo', Math.floor(t * 1000));
  $('#np .np-thumb')?.classList.add('hidden'); $('#np .mark')?.classList.remove('on');
  npOsd(2500);
}

/* ---------- пульт ---------- */""")
# при закрытии или смене серии сбрасываем перемотку
rep("  Object.assign(NP, { on: true, d, seasons, season, episode, key, tr: null, secs: [], mode: 'play'", "  Object.assign(NP, { on: true, scrub: null, d, seasons, season, episode, key, tr: null, secs: [], mode: 'play'")
open('nplayer.js', 'w', encoding='utf8').write(n)

c = open('style.css', encoding='utf8').read()
c += '''
/* перемотка с превью кадров */
.np-bar .mark{position:absolute;top:-8px;width:6px;height:26px;margin-left:-3px;border-radius:3px;background:#fff;box-shadow:0 0 10px rgba(255,255,255,.6);opacity:0}
.np-bar .mark.on{opacity:1}
.np-thumb{position:absolute;bottom:34px;transform:translateX(-50%);padding:6px;border-radius:14px;background:rgba(11,12,16,.92);box-shadow:0 12px 40px rgba(0,0,0,.6);text-align:center}
.np-thumb .img{border-radius:9px;background-color:#000;background-repeat:no-repeat;overflow:hidden}
.np-thumb span{display:block;margin-top:6px;font:600 24px var(--body)}
'''
open('style.css', 'w', encoding='utf8').write(c)
print('ok')
