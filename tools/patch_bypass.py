import os
os.chdir(r'D:\lift\app')
m = open('main.js', encoding='utf8').read()

# сеть: запросы к адресам TMDB идут через отдельную сессию с обходом
old = "  const nodeFetch = globalThis.fetch;\n  globalThis.fetch = (u, o) => net.fetch(u, o).catch((e) => { if (o && o.signal && o.signal.aborted) throw e; return nodeFetch(u, o); });"
assert old in m
m = m.replace(old, """  const nodeFetch = globalThis.fetch;
  bypass = require('./bypass')({ app, session });
  bypass.start().catch(() => {});
  const hostOf = (u) => { try { return new URL(typeof u === 'string' ? u : u.url || String(u)).hostname; } catch { return ''; } };
  globalThis.fetch = (u, o) => {
    const viaBypass = bypass.ready() && bypass.isTmdb(hostOf(u));
    return (viaBypass ? bypass.fetch(u, o) : net.fetch(u, o)).catch((e) => { if (o && o.signal && o.signal.aborted) throw e; return nodeFetch(u, o); });
  };""", 1)
m = m.replace("let win;\n", "let win;\nlet bypass = null;   // обход блокировки TMDB (bypass.js)\n", 1)

# картинки: прямой источник тоже идёт через обход
old = "            const r = await net.fetch(s.url, { signal: AbortSignal.timeout(s.ms) });"
assert old in m
m = m.replace(old, "            const r = await (s.id === 'direct' && bypass && bypass.ready() ? bypass.fetch(s.url, { signal: AbortSignal.timeout(s.ms) }) : net.fetch(s.url, { signal: AbortSignal.timeout(s.ms) }));", 1)
open('main.js', 'w', encoding='utf8').write(m)

j = open('package.json', encoding='utf8').read()
j = j.replace('      "diag.js",', '      "diag.js",\n      "bypass.js",', 1).replace('"version": "2.6.9"', '"version": "2.7.0"')
open('package.json', 'w', encoding='utf8').write(j)

c = open('CHANGELOG.md', encoding='utf8').read().replace("# Что нового\n", "# Что нового\n\n## 2.7.0\n- Встроенный обход блокировки TMDB провайдером: запросы к TMDB (данные и картинки) идут через маленький локальный прокси внутри Luma, который отправляет первый пакет соединения по частям. VPN, посредник и сторонние программы для этого больше не нужны. Остальной трафик не затрагивается.\n", 1)
open('CHANGELOG.md', 'w', encoding='utf8').write(c)
print('ok')
