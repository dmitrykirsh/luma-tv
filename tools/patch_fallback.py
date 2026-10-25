import os
os.chdir(r'D:\lift\app')

# ---------- tmdb.js: прямой путь первым, посредник как запасной ----------
t = open('tmdb.js', encoding='utf8').read()
a = t.index("    const px = String(getStore().tmdbProxy")
b = t.index("    const v = await r.json();\n    mem.set(ck")
new = '''    const px = String(getStore().tmdbProxy || '').replace(/\\/+$/, '');
    const params2 = { language: 'ru-RU', ...params };
    const build = (base) => { const u = new URL(base + path); for (const [k, v] of Object.entries(params2)) u.searchParams.set(k, v); return u; };
    const headers = { Accept: 'application/json' };
    const bearer = key.startsWith('eyJ');
    if (bearer) headers.Authorization = 'Bearer ' + key;
    const keyed = (u) => { if (!bearer) u.searchParams.set('api_key', key); return u; };
    const ck = build(TMDB_API).toString() + (bearer ? '#b' : '');
    const hit = mem.get(ck);
    if (hit && Date.now() - hit.t < ttl) return hit.v;
    // Прямой путь быстрее, поэтому идём сначала им. Посредник (если задан) — запасной: к нему переключаемся,
    // когда напрямую не отвечает, и на 10 минут запоминаем, что напрямую недоступно.
    const routes = [{ u: () => keyed(build(TMDB_API)), ms: px ? 6000 : 12000, direct: true }];
    if (px) routes.push({ u: () => keyed(build(px + '/3')), ms: 15000, direct: false });
    if (px && Date.now() < directBadUntil) routes.reverse();
    let r, lastErr;
    for (const rt of routes) {
      try {
        r = await fetch(rt.u(), { headers, signal: AbortSignal.timeout(rt.ms) });
        if (r.status >= 500) { lastErr = new Error('HTTP ' + r.status); r = null; continue; }
        if (rt.direct) directBadUntil = 0; else if (routes[0].direct === false) { /* посредник был первым */ } else directBadUntil = Date.now() + 600000;
        break;
      } catch (e) { lastErr = e; r = null; if (rt.direct) directBadUntil = Date.now() + 600000; }
    }
    if (!r) throw lastErr;
    if (r.status === 401) throw Object.assign(new Error('BAD_KEY'), { code: 'BAD_KEY' });
    if (!r.ok) throw Object.assign(new Error('HTTP ' + r.status), { code: 'HTTP' });
'''
t = t[:a] + new + t[b:]
t = t.replace("  const mem = new Map();\n", "  const mem = new Map();\n  let directBadUntil = 0;   // до этого времени прямой путь к TMDB считаем неработающим\n", 1)
open('tmdb.js', 'w', encoding='utf8').write(t)

# ---------- main.js: картинки: быстрые попытки, запоминаем, что работает ----------
m = open('main.js', encoding='utf8').read()
a = m.index("    try {\n      for (let i = 0; i < 4; i++) {")
b = m.index("    } finally { imgDone(); }")
new = '''    const save = async (r) => {
      const buf = Buffer.from(await r.arrayBuffer());
      try { fs.writeFileSync(file, buf); } catch {}
      return new Response(buf, { headers: { 'content-type': r.headers.get('content-type') || type, 'cache-control': 'max-age=86400' } });
    };
    // Порядок источников: прямой адрес TMDB, свой посредник (если задан), публичный прокси картинок.
    // Если прямой путь не отвечает, он на 10 минут уходит в конец очереди, чтобы не ждать таймаут на каждой картинке.
    const px = String(store.tmdbProxy || '').replace(/\\/+$/, '');
    const sources = [
      { id: 'direct', url: 'https://image.tmdb.org' + u.pathname, ms: 6000 },
      ...(px ? [{ id: 'proxy', url: px + '/img' + u.pathname, ms: 8000 }] : []),
      { id: 'wsrv', url: 'https://wsrv.nl/?url=' + encodeURIComponent('image.tmdb.org' + u.pathname), ms: 10000 },
      { id: 'weserv', url: 'https://images.weserv.nl/?url=' + encodeURIComponent('image.tmdb.org' + u.pathname), ms: 10000 }
    ];
    sources.sort((a, b) => ((imgBad.get(a.id) || 0) > Date.now() ? 1 : 0) - ((imgBad.get(b.id) || 0) > Date.now() ? 1 : 0));
    try {
      for (let round = 0; round < 2; round++) {
        for (const s of sources) {
          try {
            const r = await net.fetch(s.url, { signal: AbortSignal.timeout(s.ms) });
            if (r.ok) { imgBad.delete(s.id); return await save(r); }
            if (r.status === 404 && s.id === 'direct') return new Response('', { status: 404 });
            imgBad.set(s.id, Date.now() + 600000);
          } catch { imgBad.set(s.id, Date.now() + 600000); }
        }
        await new Promise((res) => setTimeout(res, 600));
      }
'''
m = m[:a] + new + m[b:]
m = m.replace("let imgActive = 0;", "const imgBad = new Map();   // источник картинок -> до какого времени считаем неработающим\nlet imgActive = 0;", 1)
open('main.js', 'w', encoding='utf8').write(m)

# ---------- версия и журнал ----------
j = open('package.json', encoding='utf8').read().replace('"version": "2.6.6"', '"version": "2.6.7"')
open('package.json', 'w', encoding='utf8').write(j)
c = open('CHANGELOG.md', encoding='utf8').read().replace("# Что нового\n", "# Что нового\n\n## 2.6.7\n- TMDB: сначала запрос идёт напрямую, а свой посредник Cloudflare используется только как запасной, если напрямую не отвечает (раньше посредник мог замедлять всё, хотя TMDB открывался сам).\n- Картинки TMDB: источники пробуются быстро по очереди (напрямую, посредник, публичный прокси), неработающий на 10 минут уходит в конец очереди. Раньше при недоступных картинках приходилось ждать минуту.\n", 1)
open('CHANGELOG.md', 'w', encoding='utf8').write(c)
print('ok')
