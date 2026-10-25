import os
os.chdir(r'D:\lift\app')

def edit(path, pairs):
    s = open(path, encoding='utf8').read()
    for old, new in pairs:
        assert old in s, (path, old[:80])
        s = s.replace(old, new, 1)
    open(path, 'w', encoding='utf8').write(s)

# ---------- lb.js: быстрые версии списков, превью постеров, перевод ----------
edit('lb.js', [
    ("  async function getTrList(id) {\n    const ck = 'src:tr:' + id, hit = cached(ck, 1800000);",
     "  async function getTrList(id, quick) {\n    const ck = 'src:tr:' + id + (quick ? ':q' : ''), hit = cached(ck, 1800000);"),
    ("for (let page = 1, pages = 1; page <= Math.min(pages, 6); page++) {", "for (let page = 1, pages = 1; page <= Math.min(pages, quick ? 1 : 6); page++) {"),
    ("  // совместимость со старыми вызовами\n",
     r"""  /* ---------- оформление карточек подборок: постеры из списка и перевод названий ---------- */
  const listPrev = () => (getStore().listPrev ||= {});
  ipcMain.handle('lists:preview', async (_e, ref) => {
    try {
      ref = String(ref || '');
      const c = listPrev()[ref];
      if (c && Date.now() - c.t < 7 * 864e5) return { posters: c.p };
      let list;
      if (ref.startsWith('md:')) list = await getMdList(ref.slice(3));
      else if (ref.startsWith('tr:')) list = await getTrList(ref.slice(3), true);
      else { const url = await normalizeListUrl(ref); if (!url) return { posters: [] }; list = await getLbList(url, true); }
      const got = await tm.pool((list.films || []).slice(0, 16), 4, matchFilm);
      const posters = got.filter((x) => x && x.poster).slice(0, 4).map((x) => x.poster);
      if (posters.length) {
        const m = listPrev(); m[ref] = { t: Date.now(), p: posters };
        const keys = Object.keys(m); if (keys.length > 400) for (const k of keys.slice(0, keys.length - 400)) delete m[k];
        saveStore();
      }
      return { posters };
    } catch { return { posters: [] }; }
  });
  const listTr = () => (getStore().listTr ||= {});
  async function toRussian(s) {
    const c = listTr(); if (c[s]) return c[s];
    try {
      const r = await fetch('https://api.mymemory.translated.net/get?langpair=en|ru&q=' + encodeURIComponent(s.slice(0, 450)), { signal: AbortSignal.timeout(8000) });
      const j = await r.json();
      const t = String((j.responseData && j.responseData.translatedText) || '').trim();
      if (t && CYR.test(t) && !/MYMEMORY WARNING|QUERY LENGTH LIMIT|INVALID/i.test(t)) {
        c[s] = t;
        const keys = Object.keys(c); if (keys.length > 3000) for (const k of keys.slice(0, keys.length - 3000)) delete c[k];
        return t;
      }
    } catch {}
    return s;
  }
  ipcMain.handle('lists:translate', async (_e, texts) => {
    const out = {};
    const todo = [...new Set((texts || []).map((x) => String(x || '').trim()).filter(Boolean))].slice(0, 12);
    await tm.pool(todo, 3, async (s) => { out[s] = CYR.test(s) ? s : await toRussian(s); });
    saveStore();
    return out;
  });
  // совместимость со старыми вызовами
"""),
])

# ---------- preload.js ----------
edit('preload.js', [
    ("  listsGet: (ref) => ipcRenderer.invoke('lists:get', ref),",
     "  listsGet: (ref) => ipcRenderer.invoke('lists:get', ref),\n  listsPreview: (ref) => ipcRenderer.invoke('lists:preview', ref),\n  listsTranslate: (t) => ipcRenderer.invoke('lists:translate', t),"),
])

# ---------- renderer/app.js: оформление карточек ----------
edit('renderer/app.js', [
    ("function segIndicator(seg) {",
     r"""/* ---------- красивые карточки подборок: размытая мозаика постеров, ряд постеров и название по-русски ---------- */
const LENH = { io: null, queue: [], busy: 0 };
function enhanceLists(root) {
  if (!LENH.io) LENH.io = new IntersectionObserver((en) => {
    for (const e of en) if (e.isIntersecting) { LENH.io.unobserve(e.target); LENH.queue.push(e.target); }
    pumpLists();
  }, { rootMargin: '250px' });
  $$('.lcard:not([data-enh])', root).forEach((c) => { c.dataset.enh = '1'; LENH.io.observe(c); });
}
function pumpLists() {
  while (LENH.busy < 3 && LENH.queue.length) {
    const c = LENH.queue.shift(); if (!document.contains(c)) continue;
    LENH.busy++;
    enhanceCard(c).catch(() => {}).finally(() => { LENH.busy--; pumpLists(); });
  }
}
async function enhanceCard(c) {
  const h = $('h3', c), p = $('p:not(.lnames)', c);
  const title = h ? h.textContent : '', desc = p ? p.textContent : '';
  const [prev, tr] = await Promise.all([
    window.lift.listsPreview(c.dataset.url).catch(() => null),
    window.lift.listsTranslate([title, desc.length > 140 ? desc.slice(0, 140).replace(/\s+\S*$/, '') + '…' : desc].filter(Boolean)).catch(() => null)
  ]);
  if (!document.contains(c)) return;
  const posters = (prev && prev.posters) || [];
  if (posters.length) {
    c.classList.add('has-art');
    c.insertAdjacentHTML('afterbegin', `<div class="lbg">${posters.map((u) => `<i style="background-image:url('${esc(u)}')"></i>`).join('')}</div>`);
    c.insertAdjacentHTML('beforeend', `<div class="lposters">${posters.map((u) => `<img src="${esc(u)}" alt="" loading="lazy">`).join('')}</div>`);
  }
  if (tr) {
    const ru = tr[title];
    if (h && ru && ru !== title) { h.textContent = ru; h.insertAdjacentHTML('afterend', `<div class="lorig">${esc(title)}</div>`); }
    if (p && desc) { const key = desc.length > 140 ? desc.slice(0, 140).replace(/\s+\S*$/, '') + '…' : desc; if (tr[key] && tr[key] !== key) p.textContent = tr[key]; }
  }
}
function segIndicator(seg) {"""),
    # после отрисовки подборок: оформляем карточки
    ("  const body = $('#lBody'), seg = $('#lTabs');",
     "  const body = $('#lBody'), seg = $('#lTabs');\n  new MutationObserver(() => enhanceLists(body)).observe(body, { childList: true, subtree: true });"),
])

c = open('renderer/style.css', encoding='utf8').read()
c += """
/* подборки: карточки с размытой мозаикой постеров и рядом постеров */
.lcard{overflow:hidden;isolation:isolate}
.lcard .lbg{position:absolute;inset:-30px;z-index:-1;display:grid;grid-template-columns:1fr 1fr;opacity:.55;filter:blur(26px) saturate(1.5);transform:scale(1.2)}
.lcard .lbg i{background-size:cover;background-position:center}
.lcard.has-art::before{content:'';position:absolute;inset:0;z-index:-1;background:linear-gradient(135deg,rgba(11,12,16,.82),rgba(11,12,16,.5) 70%,rgba(11,12,16,.35))}
.lcard .lorig{margin-top:3px;color:var(--muted);font-size:12px;font-style:italic;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}
.lcard .lposters{display:flex;gap:7px;margin-top:14px}
.lcard .lposters img{flex:1;min-width:0;aspect-ratio:2/3;object-fit:cover;border-radius:8px;box-shadow:0 6px 16px rgba(0,0,0,.45);animation:fadeIn .5s var(--ease) both}
@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
"""
open('renderer/style.css', 'w', encoding='utf8').write(c)
print('ok')
