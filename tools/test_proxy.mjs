// Проверка: код TMDB в Luma через локальный посредник (тот же скрипт, что в Cloudflare Worker).
import http from 'node:http';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const worker = (await import('file:///D:/lift/app/cloudflare-worker/tmdb-proxy.js')).default;

const srv = http.createServer(async (rq, rs) => {
  const r = await worker.fetch(new Request('http://127.0.0.1:8787' + rq.url, { method: rq.method, headers: rq.headers }));
  rs.writeHead(r.status, Object.fromEntries(r.headers)); rs.end(Buffer.from(await r.arrayBuffer()));
}).listen(8787);

const store = JSON.parse(fs.readFileSync(process.env.APPDATA + '/Luma-dev/store.json', 'utf8'));
const key = process.env.TMDB_KEY;
store.tmdbProxy = 'http://127.0.0.1:8787';
store.tmdbKey = key;
const handlers = {};
const ipcMain = { handle: (n, f) => (handlers[n] = f), on() {} };
const getJson = async (u) => (await fetch(u, { headers: { 'User-Agent': 'x' } })).json();
require('D:/lift/app/tmdb.js')({ ipcMain, safeStorage: { isEncryptionAvailable: () => false }, getStore: () => store, saveStore() {}, getJson, API: 'https://api.liftw.ws' });
const r = await handlers['tmdb:find'](null, { name: 'Форрест Гамп', origin_name: 'Forrest Gump', year: 1994, type: 1 });
console.log(JSON.stringify({ err: r.error, none: r.none, backdrop: !!r.backdrop, logo: !!r.logo, shots: (r.backdrops || []).length, recs: (r.recs || []).length, imdb: r.imdb }));
srv.close(); process.exit(0);
