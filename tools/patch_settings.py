import os
os.chdir(r'D:\lift\tv\app\src\main\assets')

h = open('index.html', encoding='utf8').read()
for name, after in (('settings.js', 'nplayer.js'), ('sync.js', 'settings.js')):
    if name not in h:
        h = h.replace(f'<script src="{after}"></script>', f'<script src="{after}"></script>\n<script src="{name}"></script>')
open('index.html', 'w', encoding='utf8').write(h)

s = open('app.js', encoding='utf8').read()
def rep(old, new, cnt=1):
    global s
    assert old in s, old[:70]
    s = s.replace(old, new, cnt)

# иконки
rep("  restart: '<path", """  sync: '<path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 0 1-13.7 5.6L4 15.5M4 20v-4.5h4.5"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l3 3M14 9l2 2"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.5-5.8M20 4v5h-5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  restart: '<path""")

# слияние данных: всё объединяется, а не заменяется
a = s.index("function mergeBackup(b) {"); b = s.index("/* ================= API")
s = s[:a] + '''function mergeBackup(b) {
  const d = b.data || {};
  S.favs = uniq([...(S.favs || []), ...(d.favs || [])], 'id');
  const m = new Map();
  for (const x of [...(S.history || []), ...(d.history || [])]) { const o = m.get(x.id); if (!o || (x.ts || 0) > (o.ts || 0)) m.set(x.id, x); }
  S.history = [...m.values()].sort((a, b2) => (b2.ts || 0) - (a.ts || 0)).slice(0, 60);
  S.seen = { ...(S.seen || {}) };
  for (const [k, arr] of Object.entries(d.seen || {})) S.seen[k] = [...new Set([...(S.seen[k] || []), ...arr])];
  S.progress = { ...(S.progress || {}) };
  for (const [k, p] of Object.entries(d.progress || {})) if (!S.progress[k] || (p.ts || 0) > (S.progress[k].ts || 0)) S.progress[k] = p;
  S.secrets = { ...(S.secrets || {}), ...(b.secrets || {}) };
  const x = (S.extra = S.extra || {});
  if (d.lists) x.lists = uniq([...(x.lists || []), ...d.lists], 'url');
  if (d.tvFav) x.tvFav = [...new Set([...(x.tvFav || []), ...d.tvFav])];
  if (d.tvStats) { x.tvStats = x.tvStats || {}; for (const [id, st] of Object.entries(d.tvStats)) { const o = x.tvStats[id]; if (!o || (st.last || 0) > (o.last || 0)) x.tvStats[id] = { ...st, n: Math.max(st.n || 0, o?.n || 0), t: Math.max(st.t || 0, o?.t || 0) }; } }
  if (d.tvCustom) { const cur = x.tvCustom || []; x.tvCustom = [...cur, ...d.tvCustom.filter((e) => e && e.url && !cur.some((c) => c.url === e.url))]; }
  if (d.tvLast && !x.tvLast) x.tvLast = d.tvLast;
  S.imported = Date.now();
  save();
  return { favs: (d.favs || []).length, history: (d.history || []).length, keys: Object.keys(b.secrets || {}) };
}

''' + s[b:]

# при смене экрана сообщаем, откуда ушли (например, чтобы остановить приём синхронизации)
rep("async function show(r, restore) {\n  route = r;", "async function show(r, restore) {\n  const prev = route;\n  route = r;\n  if (window.onRouteLeave) window.onRouteLeave(prev, r);")
open('app.js', 'w', encoding='utf8').write(s)

# ТВ-каналы: плейлисты из файла
t = open('tv.js', encoding='utf8').read()
old = "    for (const e of (tvX().tvCustom || []).filter((x) => x && x.url && x.enabled !== false)) {\n      try { list.push(...(await tvFetchList(e.url, false)).map((c) => ({ ...c, id: 'c' + e.id + ':' + c.id, list: e.name }))); } catch {}\n    }"
assert old in t
t = t.replace(old, "    for (const e of (tvX().tvCustom || []).filter((x) => x && (x.url || x.file) && x.enabled !== false)) {\n      try {\n        const chs = e.file ? tvToChannels(tvParseM3u(await IDB.get('pl:' + e.id) || '', false), '') : await tvFetchList(e.url, false);\n        list.push(...chs.map((c) => ({ ...c, id: 'c' + e.id + ':' + c.id, list: e.name })));\n      } catch {}\n    }")
open('tv.js', 'w', encoding='utf8').write(t)

c = open('style.css', encoding='utf8').read()
c += '''
/* настройки */
.st{display:grid;grid-template-columns:520px 1fr;gap:40px;padding:20px 48px}
.st-nav{display:flex;flex-direction:column;gap:12px}
.st-it{display:flex;align-items:center;gap:22px;min-height:96px;padding:12px 24px;border-radius:22px;background:var(--surface);text-align:left;color:var(--muted)}
.st-it .sti{flex:none;width:56px;height:56px;border-radius:16px;background:rgba(248,249,250,.07);display:grid;place-items:center}
.st-it svg{width:30px;height:30px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
.st-it b{display:block;font-size:27px;font-weight:600;color:var(--text)}
.st-it small{display:block;font-size:20px;margin-top:2px}
.st-it.on{background:var(--surface-2);color:#fff}
.st-it.on .sti{background:var(--grad)}
.st-it:focus{background:var(--grad);color:#fff;box-shadow:0 10px 30px rgba(255,51,102,.35)}
.st-it:focus .sti{background:rgba(255,255,255,.2)}
.st-it:focus b{color:#fff}
.st-pane{display:flex;flex-direction:column;gap:14px;min-width:0}
.sc{padding:28px 34px;border-radius:24px;background:rgba(24,26,32,.85);font-size:24px;line-height:1.5;color:#d6d9e0}
.sc.hero{display:flex;gap:26px;align-items:center;background:linear-gradient(135deg,rgba(255,51,102,.18),rgba(255,184,0,.08) 70%),var(--surface)}
.sc.hero b{display:block;font:700 32px var(--display);color:var(--text);margin-bottom:6px}
.sc.hero p{margin:0}
.sci{flex:none;width:84px;height:84px;border-radius:24px;background:var(--grad);display:grid;place-items:center}
.sci svg{width:44px;height:44px;fill:none;stroke:#fff;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.srow{display:flex;align-items:center;gap:22px;min-height:96px;padding:14px 28px;border-radius:22px;background:var(--surface);text-align:left;font-size:26px}
.srow>span:nth-child(2){flex:1;min-width:0}
.srow b{display:block;font-weight:600;font-size:27px}
.srow small{display:block;font-size:21px;color:var(--muted);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.srow i{flex:none;font-style:normal;color:var(--muted);font-size:24px}
.sri{flex:none;width:56px;height:56px;border-radius:16px;background:rgba(248,249,250,.08);display:grid;place-items:center;font-size:30px;color:var(--muted)}
.sri svg{width:30px;height:30px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
.sri.bd.ok{background:rgba(94,226,154,.16);color:#5EE29A;font-weight:700}
.srow:focus{background:var(--surface-2);box-shadow:0 0 0 4px var(--primary)}
.srow:focus i{color:#fff}
.smeta{padding:6px 10px;font-size:22px;color:var(--muted)}
/* окна ввода */
#modal:has(.dlg.top){place-items:start center}
.dlg.top{margin-top:70px;width:1300px}
.dlg .sub{color:var(--muted);margin-bottom:12px;font-size:24px}
.dlg .help{padding:16px 22px;border-radius:16px;background:rgba(248,249,250,.06);font-size:22px;line-height:1.5;color:#d6d9e0;margin:8px 0 10px}
.dlg .help b{color:var(--text)}
.dlg .fields label{display:block;margin:16px 0 8px;font-size:21px;color:var(--muted)}
.din{width:100%;height:72px;border-radius:18px;background:var(--bg);border:2px solid var(--line);padding:0 24px;font-size:27px}
.din:focus{border-color:var(--primary);background:#10121a}
.derr{min-height:34px;margin-top:14px;font-size:23px;color:#FF6B8A}
.dbtns{display:flex;gap:16px;margin-top:6px}
/* синхронизация */
.sy{display:grid;grid-template-columns:660px 1fr;gap:40px;padding:20px 48px}
.sy-code{padding:40px;border-radius:28px;background:linear-gradient(135deg,rgba(255,51,102,.2),rgba(255,184,0,.08) 70%),var(--surface)}
.sy-code small{font-size:22px;color:var(--muted);letter-spacing:2px;text-transform:uppercase}
.sy-code b{display:block;margin:10px 0 18px;font:700 124px/1 var(--display);letter-spacing:6px}
.sy-code p{font-size:24px;line-height:1.5;color:#d6d9e0}
.sy-st{margin-top:22px;padding:14px 20px;border-radius:16px;background:rgba(248,249,250,.07);font-size:23px;line-height:1.4}
.sy-st.wait{color:var(--accent)}.sy-st.bad{color:#FF6B8A}.sy-st.ok{color:#5EE29A}
.sy-pc h3{font:700 34px var(--display);margin-bottom:8px}
.sy-pc p{font-size:23px;color:var(--muted);margin-bottom:20px}
.sy-list{display:flex;flex-direction:column;gap:12px;margin-top:18px}
'''
open('style.css', 'w', encoding='utf8').write(c)
print('ok')
