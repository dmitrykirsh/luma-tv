import os
os.chdir(r'D:\lift\app')
s = open('main.js', encoding='utf8').read()
def rep(old, new):
    global s
    assert old in s, old[:60]
    s = s.replace(old, new, 1)

# ---- getJson: перебор зеркал API ----
rep("""async function getJson(url, ttl = 120000) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.t < ttl) return hit.v;
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  const v = await r.json();
  cache.set(url, { t: Date.now(), v });
  return v;
}""", """// У сайта несколько зеркал API; в разных сетях отдельные узлы бывают сломаны (например, каталог отвечает, а поиск даёт 500).
// Поэтому запрос идёт на последний рабочий узел, а при ошибке сервера пробуем остальные.
const API_HOSTS = ['api.liftw.ws', 'api.embandr.ws', 'api.niteface.ws', 'api.faphz.com', 'api.lateremb.ws'];
let apiHostI = 0;
async function apiRequest(path, init = {}) {
  let last;
  for (let round = 0; round < 2; round++) {
    for (let k = 0; k < API_HOSTS.length; k++) {
      const i = (apiHostI + k) % API_HOSTS.length;
      try {
        const r = await fetch('https://' + API_HOSTS[i] + path, { ...init, signal: AbortSignal.timeout(12000) });
        if (r.status >= 500 || r.status === 429) { last = new Error('HTTP ' + r.status); continue; }
        const v = await r.json();
        if (v && v.statusCode >= 500) { last = new Error('HTTP ' + v.statusCode); continue; }
        apiHostI = i; return v;
      } catch (e) { last = e; }
    }
    await new Promise((res) => setTimeout(res, 400));
  }
  throw last;
}
async function getJson(url, ttl = 120000) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.t < ttl) return hit.v;
  const v = url.startsWith(API + '/')
    ? await apiRequest(url.slice(API.length), { headers: { 'User-Agent': UA, Accept: 'application/json' } })
    : await (await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })).json();
  cache.set(url, { t: Date.now(), v });
  return v;
}""")
rep("""  const r = await fetch(API + p, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': UA }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  return r.json();""", """  return apiRequest(p, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': UA }, body: JSON.stringify(body) });""")

# ---- картинки TMDB: запасной путь через публичный прокси изображений ----
rep("""    } finally { imgDone(); }
    return new Response('', { status: 502 });""", """      for (const host of ['wsrv.nl', 'images.weserv.nl']) {
        try {
          const r = await net.fetch(`https://${host}/?url=` + encodeURIComponent('image.tmdb.org' + u.pathname), { signal: AbortSignal.timeout(15000) });
          if (r.ok) {
            const buf = Buffer.from(await r.arrayBuffer());
            try { fs.writeFileSync(file, buf); } catch {}
            return new Response(buf, { headers: { 'content-type': r.headers.get('content-type') || type, 'cache-control': 'max-age=86400' } });
          }
        } catch {}
      }
    } finally { imgDone(); }
    return new Response('', { status: 502 });""")

# ---- сеть через Chromium со своим DNS-over-HTTPS: провайдерская подмена адресов (127.0.0.1) обходится ----
rep("app.whenReady().then(() => {\n  setupImageProxy();", """app.whenReady().then(() => {
  try {
    // сначала безопасный DNS (у системного DNS некоторых провайдеров TMDB подменён на 127.0.0.1), при сбое — обычный
    app.configureHostResolver({ secureDnsMode: 'automatic', secureDnsServers: ['https://cloudflare-dns.com/dns-query', 'https://dns.google/dns-query'] });
  } catch {}
  // все запросы главного процесса идут через сетевой стек Chromium (он использует этот DNS и системный прокси)
  const nodeFetch = globalThis.fetch;
  globalThis.fetch = (u, o) => net.fetch(u, o).catch((e) => { if (o && o.signal && o.signal.aborted) throw e; return nodeFetch(u, o); });
  setupImageProxy();""")
open('main.js', 'w', encoding='utf8').write(s)
print('ok')
