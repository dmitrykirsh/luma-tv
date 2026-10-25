import os
os.chdir(r'D:\lift\tv\app\src\main\assets')

def edit(path, pairs):
    s = open(path, encoding='utf8').read()
    for old, new in pairs:
        assert old in s, (path, old[:80])
        s = s.replace(old, new, 1)
    open(path, 'w', encoding='utf8').write(s)

edit('lists.js', [
    # быстрые версии списков (только первая страница): нужны для превью постеров
    ("async function lbList(url) {\n  const ck = 'lb:' + url, hit = lsGet(ck, 3600e3); if (hit) return hit;",
     "async function lbList(url, quick) {\n  const ck = 'lb:' + url + (quick ? ':q' : ''), hit = lsGet(ck, 3600e3); if (hit) return hit;"),
    ("  const pages = Math.min(10, Math.ceil((count || all.length) / 100));",
     "  const pages = quick ? 1 : Math.min(10, Math.ceil((count || all.length) / 100));"),
    ("async function trList(id) {\n  const ck = 'tr:' + id, hit = lsGet(ck, 1800e3); if (hit) return hit;",
     "async function trList(id, quick) {\n  const ck = 'tr:' + id + (quick ? ':q' : ''), hit = lsGet(ck, 1800e3); if (hit) return hit;"),
    ("for (let page = 1, pages = 1; page <= Math.min(pages, 6); page++) {\n    const r = await trakt('/lists/' + id + '/items/movies,shows'",
     "for (let page = 1, pages = 1; page <= Math.min(pages, quick ? 1 : 6); page++) {\n    const r = await trakt('/lists/' + id + '/items/movies,shows'"),
    ("async function getList(ref) {\n  ref = String(ref || '');\n  if (ref.startsWith('md:')) return mdList(ref.slice(3));\n  if (ref.startsWith('tr:')) return trList(ref.slice(3));\n  const m = ref.match(LIST_RE); if (!m) throw lsErr('FORMAT');\n  return lbList(`${LB_HOST}/${m[1]}/list/${m[2]}/`);",
     "async function getList(ref, quick) {\n  ref = String(ref || '');\n  if (ref.startsWith('md:')) return mdList(ref.slice(3));\n  if (ref.startsWith('tr:')) return trList(ref.slice(3), quick);\n  const m = ref.match(LIST_RE); if (!m) throw lsErr('FORMAT');\n  return lbList(`${LB_HOST}/${m[1]}/list/${m[2]}/`, quick);"),
    # оформление карточек
    ("/* ---------- экраны ---------- */",
     r"""/* ---------- оформление карточек: постеры из списка и название по-русски ---------- */
const lsLoadJ = (k) => { try { return JSON.parse(localStorage.getItem(k) || '{}'); } catch { return {}; } };
const lsPrev = lsLoadJ('luma.tv.lprev'), lsTr = lsLoadJ('luma.tv.ltr');
let lsStoreT = 0;
const lsStore = () => { clearTimeout(lsStoreT); lsStoreT = setTimeout(() => {
  for (const [m, cap] of [[lsPrev, 300], [lsTr, 1500]]) { const ks = Object.keys(m); if (ks.length > cap) for (const k of ks.slice(0, ks.length - cap)) delete m[k]; }
  try { localStorage.setItem('luma.tv.lprev', JSON.stringify(lsPrev)); localStorage.setItem('luma.tv.ltr', JSON.stringify(lsTr)); } catch {}
}, 800); };
async function lsPreview(ref) {
  const c = lsPrev[ref]; if (c && Date.now() - c.t < 7 * 864e5) return c.p;
  const L = await getList(ref, true), films = (L.films || []).slice(0, 14), posters = [];
  for (let i = 0; i < films.length && posters.length < 4; i += 4) {
    const got = await Promise.all(films.slice(i, i + 4).map(matchFilm));
    for (const x of got) if (x && x.poster && posters.length < 4) posters.push(x.poster);
  }
  if (posters.length) { lsPrev[ref] = { t: Date.now(), p: posters }; lsStore(); }
  return posters;
}
async function lsRu(s) {
  s = String(s || '').trim(); if (!s || CYR.test(s)) return s;
  if (lsTr[s]) return lsTr[s];
  try {
    const r = await fetch(tvPx('https://api.mymemory.translated.net/get?langpair=en|ru&q=' + encodeURIComponent(s.slice(0, 450)), '', '', true)); const j = await r.json();
    const mt = (j.matches || []).find((m) => m['created-by'] === 'MT!');   // из памяти переводов иногда приходит чужая фраза, берём машинный перевод
    const t = String((mt && mt.translation) || (j.responseData && j.responseData.translatedText) || '').trim();
    if (t && CYR.test(t) && !/MYMEMORY WARNING|QUERY LENGTH LIMIT|INVALID/i.test(t)) { lsTr[s] = t; lsStore(); return t; }
  } catch {}
  return s;
}
const lsEnh = { q: [], busy: 0 };
function lsEnhance(root) {
  $$('.lc[data-list]:not([data-enh])', root).forEach((c) => { c.dataset.enh = '1'; lsEnh.q.push(c); });
  lsPump();
}
function lsPump() {
  if (route.name !== 'lists') { lsEnh.q.length = 0; return; }   // ушли с экрана подборок: очередь больше не нужна
  while (lsEnh.busy < 2 && lsEnh.q.length) {
    const c = lsEnh.q.shift(); if (!document.contains(c)) continue;
    lsEnh.busy++;
    lsEnhCard(c).catch(() => {}).finally(() => { lsEnh.busy--; lsPump(); });
  }
}
async function lsEnhCard(c) {
  const b = $('b', c), title = b ? b.textContent : '';
  const [posters, ru] = await Promise.all([lsPreview(c.dataset.list).catch(() => []), lsRu(title).catch(() => title)]);
  if (!document.contains(c)) return;
  if (posters.length) {
    c.classList.add('has-art');
    c.insertAdjacentHTML('afterbegin', `<div class="lbg">${posters.map((u) => `<i style="background-image:url('${esc(u)}')"></i>`).join('')}</div>`);
    c.insertAdjacentHTML('beforeend', `<div class="lposters">${posters.map((u) => `<img src="${esc(u)}" alt="" decoding="async">`).join('')}</div>`);
  }
  if (b && ru && ru !== title) { b.textContent = ru; b.insertAdjacentHTML('afterend', `<i class="lorig">${esc(title)}</i>`); }
}
// карточка, на которую встал фокус, оформляется в первую очередь
document.addEventListener('focusin', (e) => {
  const c = e.target.closest?.('.lc[data-list]'); if (!c || !c.dataset.enh) return;
  const i = lsEnh.q.indexOf(c); if (i > 0) { lsEnh.q.splice(i, 1); lsEnh.q.unshift(c); }
});
new MutationObserver(() => { if (route.name === 'lists') lsEnhance(view); }).observe(document.getElementById('view') || document.body, { childList: true, subtree: true });

/* ---------- экраны ---------- */"""),
])

c = open('style.css', encoding='utf8').read()
if '.lposters' not in c:
    c += """
/* подборки: карточки с размытой мозаикой постеров и рядом постеров */
.lc{height:340px;isolation:isolate}
.lc .lbg{position:absolute;inset:-30px;z-index:-1;display:grid;grid-template-columns:1fr 1fr;opacity:.5;filter:blur(18px) saturate(1.4);transform:scale(1.2)}
.lc .lbg i{background-size:cover;background-position:center}
.lc.has-art::before{content:'';position:absolute;inset:0;z-index:-1;background:linear-gradient(135deg,rgba(11,12,16,.86),rgba(11,12,16,.5) 70%,rgba(11,12,16,.35))}
.lc.has-art em{-webkit-line-clamp:1}
.lc .lorig{font-style:italic;font-size:19px;color:var(--muted);display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}
.lc .lposters{position:absolute;left:26px;right:26px;bottom:20px;display:flex;gap:10px}
.lc .lposters img{flex:1;min-width:0;aspect-ratio:2/3;object-fit:cover;border-radius:10px;box-shadow:0 6px 16px rgba(0,0,0,.45)}
"""
    open('style.css', 'w', encoding='utf8').write(c)
print('ok')
