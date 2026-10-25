import os
os.chdir(r'D:\lift\app')
SHARED = 'https://luma-tmdb-shared.dimakirsch.workers.dev'

def edit(path, pairs):
    s = open(path, encoding='utf8').read()
    for old, new in pairs:
        assert old in s, (path, old[:70])
        s = s.replace(old, new, 1)
    open(path, 'w', encoding='utf8').write(s)

# ---------- tmdb.js ----------
edit('tmdb.js', [
    ("const TMDB_API = 'https://api.themoviedb.org/3';",
     "const TMDB_API = 'https://api.themoviedb.org/3';\n// Общий тестовый ключ: лежит в секрете Worker на Cloudflare, а не в приложении. Используется, пока пользователь не ввёл свой ключ.\nconst SHARED = '" + SHARED + "';"),
    ("    const key = keyOverride || getKey();\n    if (!key) throw Object.assign(new Error('NO_KEY'), { code: 'NO_KEY' });\n",
     "    const key = keyOverride || getKey();\n    const shared = !key;   // своего ключа нет: идём через общий посредник\n"),
    ("    const bearer = key.startsWith('eyJ');", "    const bearer = !!key && key.startsWith('eyJ');"),
    ("const keyed = (u) => { if (!bearer) u.searchParams.set('api_key', key); return u; };",
     "const keyed = (u) => { if (key && !bearer) u.searchParams.set('api_key', key); return u; };"),
    ("const ck = build(TMDB_API).toString() + (bearer ? '#b' : '');", "const ck = build(TMDB_API).toString() + (bearer ? '#b' : '') + (shared ? '#s' : '');"),
    ("    if (px && Date.now() < directBadUntil) routes.reverse();\n",
     "    if (px && Date.now() < directBadUntil) routes.reverse();\n    if (shared) { routes.length = 0; routes.push({ u: () => build(SHARED + '/3'), ms: 15000, direct: false }); }\n"),
    ("    if (r.status === 401) throw Object.assign(new Error('BAD_KEY'), { code: 'BAD_KEY' });",
     "    if (r.status === 401 || r.status === 403) throw Object.assign(new Error(shared ? 'SHARED' : 'BAD_KEY'), { code: shared ? 'SHARED' : 'BAD_KEY' });"),
    ("ipcMain.handle('tmdb:status', () => ({ has: !!getKey() }));", "ipcMain.handle('tmdb:status', () => ({ has: true, shared: !getKey() }));"),
    ("      const hasKey = !!getKey();", "      const hasKey = true;"),
    ("  return { tmdb, getKey, setKey, nameOk, pool };", "  return { tmdb, getKey, setKey, hasAccess: () => true, SHARED, nameOk, pool };"),
])

# ---------- lb.js, trailers.js ----------
edit('lb.js', [("    if (!hit && tm.getKey()) {", "    if (!hit && tm.hasAccess()) {")])
edit('trailers.js', [("    if (t.tmdb && tm.getKey()) {", "    if (t.tmdb && tm.hasAccess()) {")])

# ---------- diag.js ----------
edit('diag.js', [
    ("    if (!tm.getKey()) lines.push('✗ Ключ TMDB: не задан (без него кадры, логотипы и рейтинги не показываются)');\n    else {",
     "    if (!tm.getKey()) lines.push('— Ключ TMDB: свой не задан, работает общий тестовый (через посредника Luma)');\n    {"),
    ("      try { await tm.tmdb('/configuration', {}, 0); lines.push('✓ Ключ TMDB: принят'); }",
     "      try { await tm.tmdb('/configuration', {}, 0); lines.push(tm.getKey() ? '✓ Ключ TMDB: принят' : '✓ Общий тестовый ключ TMDB: работает'); }"),
    ("    if (tm.getKey()) {\n      const step", "    {\n      const step"),
])

# ---------- main.js: картинки через общий посредник как дополнительный источник ----------
edit('main.js', [
    ("      { id: 'cub', url: 'https://imagetmdb.cub.black' + u.pathname, ms: 8000 },",
     "      { id: 'shared', url: '" + SHARED + "/img' + u.pathname, ms: 8000 },\n      { id: 'cub', url: 'https://imagetmdb.cub.black' + u.pathname, ms: 8000 },"),
])

# ---------- renderer/app.js ----------
edit('renderer/app.js', [
    ("async function refreshTmdb() { try { tm.has = !!(await window.lift.tmdbStatus()).has; } catch { tm.has = false; }",
     "async function refreshTmdb() { try { const st = await window.lift.tmdbStatus(); tm.has = !!st.has; tm.shared = !!st.shared; } catch { tm.has = false; tm.shared = false; }"),
    ("""      <span class="status ${tm.has ? 'ok' : ''}" id="tmStatus">${tm.has ? 'Подключено' : 'Не подключено'}</span></div>""",
     """      <span class="status ${tm.has && !tm.shared ? 'ok' : ''}" id="tmStatus">${tm.shared ? 'Тестовый общий ключ' : tm.has ? 'Подключено' : 'Не подключено'}</span></div>"""),
    ("""placeholder="${tm.has ? '•••••••••••••••• (ключ сохранён)' : 'Вставьте ключ сюда'}\"""",
     """placeholder="${tm.has && !tm.shared ? '•••••••••••••••• (ключ сохранён)' : 'Вставьте ключ сюда'}\""""),
    ("""        ${tm.has ? '<button class="btn ghost" id="tmDel">Удалить ключ</button>' : ''}</div>
      <p class="hint" id="tmMsg"></p>""",
     """        ${tm.has && !tm.shared ? '<button class="btn ghost" id="tmDel">Удалить ключ</button>' : ''}</div>
      <p class="hint" id="tmMsg"></p>
      ${tm.shared ? '<p class="hint">Сейчас работает общий тестовый ключ: у него общий лимит, и он может перестать работать. Лучше получить свой: это бесплатно и занимает пару минут (шаги выше). Свой ключ всегда главнее общего.</p>' : ''}"""),
    ("BAD_KEY: 'Ключ TMDB не подошёл — проверьте его в настройках',", "BAD_KEY: 'Ключ TMDB не подошёл — проверьте его в настройках', SHARED: 'Общий тестовый ключ TMDB сейчас не работает: получите свой в настройках',"),
])
print('ok')
