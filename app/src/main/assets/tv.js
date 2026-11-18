'use strict';
/* ================= ТВ: каналы, телепрограмма, плеер ================= */
// Источники встроенных плейлистов: сначала своё зеркало (снимок с ПК, gist dmitrykirsh),
// затем оригинал (вдруг вернётся) и зеркала-форки; пробуем по очереди
const TV_RAWS = [
  'https://gist.githubusercontent.com/dmitrykirsh/997edd2c85ffed1bf9d12ba7e24f4fca/raw/',
  'https://raw.githubusercontent.com/smolnp/IPTVru/gh-pages/',
  'https://raw.githubusercontent.com/AlbertAnimates/IPTVru/gh-pages/',
  'https://raw.githubusercontent.com/timinside/IPTVru/gh-pages/',
];
const TV_LISTS = [['main', 'IPTVru.m3u'], ['stable', 'IPTVstable.m3u8']];
const TV_EPG_URL = 'https://iptvx.one/epg/epg_lite.xml.gz';
const TV_ADULT = /(xxx|эротик|для взрослых|взрослые|adult|18\+)/i;
const TV_TTL = 6 * 3600e3;

const tvB64 = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const tvPx = (u, ua = '', ref = '', raw = false, hdr = null) => 'https://liftw.ws/__p/' + tvB64(JSON.stringify({ u, ua, ref, ...(raw ? { raw: true } : {}), ...(hdr ? { hdr } : {}) }));
const tvNrm = (x) => String(x || '').toLowerCase().replace(/ё/g, 'е').replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').replace(/\b(hd|fhd|uhd|4k|sd|orig)\b/g, ' ').replace(/[^a-zа-я0-9]+/g, '');
const tvSlug = (x) => tvNrm(x) || String(x).length + ':' + String(x).slice(0, 12);
const tvChannelCount=n=>n+' '+(n%100>=11&&n%100<=14?'каналов':n%10===1?'канал':n%10>=2&&n%10<=4?'канала':'каналов');

const TVD = { channels: [], list: [], cat: 'Все', cur: null, srcIdx: 0, hls: null, epg: { programmes: {}, alias: {}, at: 0 }, epgBusy: false, shown: 0, osdT: 0, stuckT: 0, timers: {}, loading: null };
TVD.scope = 'rutube'; TVD.rutubeAt = 0; TVD.rutubeLoading = null;
const tvX = () => (S.extra = S.extra || {});
const tvFavs = () => (tvX().tvFav = tvX().tvFav || []);
const tvIsFav = (id) => tvFavs().includes(id);
function tvToggleFav(id) { const f = tvFavs(), i = f.indexOf(id), meta = (tvX().tvFavMeta ||= Object.create(null)), old = meta[id]; if (i >= 0) f.splice(i, 1); else f.unshift(id); meta[id] = {on:i < 0, ts:Math.max(Date.now(), Number(old?.ts || 0) + 1)}; save(); return i < 0; }
const tvStats = () => (tvX().tvStats = tvX().tvStats || {});

/* ---------- плейлисты ---------- */
function tvParseM3u(text, dropAdult) {
  const out = []; let meta = null, opts = {}, grp = '';
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF')) {
      const m = line.match(/^#EXTINF:\s*-?[\d.]+\s*((?:[\w.-]+="[^"]*"\s*)*)(?:[\w.-]+=\S+\s*)*,(.*)$/);
      const attrs = {};
      if (m) for (const a of m[1].matchAll(/([\w.-]+)="([^"]*)"/g)) attrs[a[1].toLowerCase()] = a[2];
      meta = { attrs, name: ((m && m[2]) || line.split(',').pop() || '').trim() }; opts = {};
    } else if (/^#EXTVLCOPT:/i.test(line)) {
      const m = line.match(/^#EXTVLCOPT:http-(user-agent|referrer|referer|origin)\s*=\s*"?(.*?)"?$/i);
      if (m) opts[/user-agent/i.test(m[1]) ? 'ua' : /origin/i.test(m[1]) ? 'origin' : 'ref'] = m[2];
    } else if (/^#EXTGRP:/i.test(line)) grp = line.slice(8).trim();
    else if (line.startsWith('#')) continue;
    else if (meta && /^https?:\/\//i.test(line)) {
      let url = line, ua = opts.ua, ref = opts.ref;
      const bar = url.indexOf('|');
      if (bar > 0) { for (const kv of url.slice(bar + 1).split('&')) { const [k, ...v] = kv.split('='); let val = v.join('='); try { val = decodeURIComponent(val); } catch {} if (/^user-agent$/i.test(k)) ua = val; else if (/^referr?er$/i.test(k)) ref = val; } url = url.slice(0, bar); }
      const group = meta.attrs['group-title'] || grp || 'Без категории';
      if (!(dropAdult && (TV_ADULT.test(group) || TV_ADULT.test(meta.name)))) out.push({ name: meta.name || 'Без названия', group, logo: meta.attrs['tvg-logo'] || '', tvg: (meta.attrs['tvg-id'] || '').toLowerCase(), url, ua, ref });
      meta = null;
    }
  }
  return out;
}
function tvToChannels(items, prefix) {
  const by = new Map();
  for (const c of items) {
    const id = prefix + (c.tvg || tvSlug(c.name));
    let ch = by.get(id);
    if (!ch) { ch = { id, name: c.name, group: c.group, logo: c.logo, tvg: c.tvg, sources: [] }; by.set(id, ch); }
    if (!ch.logo && c.logo) ch.logo = c.logo;
    if (!ch.sources.some((s) => s.url === c.url)) ch.sources.push({ url: c.url, ua: c.ua || '', ref: c.ref || '' });
  }
  return [...by.values()];
}
async function tvFetchList(url, builtin) {
  // встроенные списки — имя файла, пробуем все источники; свои списки — полный URL, один запрос
  const tries = /^https?:\/\//i.test(url) ? [url] : TV_RAWS.map((b) => b + url);
  let lastErr = null;
  for (const u of tries) {
    try {
      const r = await fetch(tvPx(u, '', '', true));   // плейлист каналов отдаём как есть, без переписывания адресов
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return tvToChannels(tvParseM3u(await r.text(), builtin), '');
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('NO_CHANNELS');
}
async function tvLoad(force) {
  if (TVD.loading) return TVD.loading;
  if (TVD.channels.length && !force) return;
  TVD.loading = (async () => {
    // быстрый старт: каналы из прошлого запуска
    if (!force) { try { const c = JSON.parse(localStorage.getItem('luma.tv.ch2') || 'null'); if (c && Date.now() - c.at < TV_TTL && c.list.length) { TVD.channels = c.list; tvAfterLoad(); return; } } catch {} }
    const res = await Promise.allSettled(TV_LISTS.map(([, u]) => tvFetchList(u, true)));
    const [main, stable] = res.map((x) => (x.status === 'fulfilled' ? x.value : []));
    const stableById = new Map(stable.map((c) => [c.id, c]));
    let list = main.map((c) => { const s = stableById.get(c.id); return s ? { ...c, stable: true, sources: [...s.sources, ...c.sources.filter((x) => !s.sources.some((y) => y.url === x.url))] } : c; });
    for (const s of stable) if (!list.some((c) => c.id === s.id)) list.push({ ...s, stable: true });
    for (const e of (tvX().tvCustom || []).filter((x) => x && (x.url || x.file) && x.enabled !== false)) {
      try {
        const chs = e.file ? tvToChannels(tvParseM3u(await IDB.get('pl:' + e.id) || '', false), '') : await tvFetchList(e.url, false);
        list.push(...chs.map((c) => ({ ...c, id: 'c' + e.id + ':' + c.id, list: e.name })));
      } catch {}
    }
    if (!list.length) throw new Error('NO_CHANNELS');
    TVD.channels = list;
    try { localStorage.setItem('luma.tv.ch2', JSON.stringify({ at: Date.now(), list })); } catch {}
    tvAfterLoad();
  })();
  try { await TVD.loading; } finally { TVD.loading = null; }
}
function tvAfterLoad() { try { const c = JSON.parse(localStorage.getItem('luma.tv.epg') || 'null'); if (c) TVD.epg = c; } catch {} if (TVD.epg.aliasVersion !== 2 || Date.now() - (TVD.epg.at || 0) > TV_TTL) tvEpgRefresh(); }

async function tvAttachRutube(force=false) {
  if(TVD.rutubeLoading)return TVD.rutubeLoading;
  if(!force&&TVD.rutubeAt&&Date.now()-TVD.rutubeAt<300000)return true;
  TVD.rutubeLoading=(async()=>{
    const items=[];
    for(let page=1;page<=10;page++){
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);let j;
      try{const r=await fetch(tvPx(`https://rutube.ru/api/video/topic/1/?limit=100&page=${page}`,'','',true),{signal:controller.signal});if(!r.ok)throw Error('HTTP');j=await r.json();}finally{clearTimeout(timer);}
      items.push(...(Array.isArray(j.results)?j.results:[]));if(!j.has_next)break;
    }
    const live=[],seen=new Set();
    for(const x of items){if(!/^[a-f0-9]{32}$/i.test(String(x.id||''))||!x.is_livestream||!x.is_on_air||!sportFree(x)||x.is_adult||seen.has(x.id))continue;seen.add(x.id);
      const name=String(x.title||'').replace(/^прямой эфир\s*(?:телеканала?\s*)?[«"“]?/i,'').replace(/[»"”]\s*$/,'').trim()||x.author?.name||'Прямой эфир';
      live.push({id:'rt:'+x.id,name:name.slice(0,120),group:x.topics?.find(t=>t.name&&t.name!=='Все прямые эфиры')?.name||'Прямые эфиры',logo:x.author?.avatar_url||x.thumbnail_url||'',tvg:'',rutube:true,sources:[{kind:'rutube',id:x.id}]});
    }
    if(!live.length)throw Error('EMPTY');
    const base=(TVD.baseChannels||TVD.channels).filter(c=>!c.rutube),names=new Map();
    for(const c of base){const key=tvNrm(c.name);if(!key)continue;if(!names.has(key))names.set(key,[]);names.get(key).push(c);}
    const used=new Set();const merged=live.map(c=>{const found=names.get(tvNrm(c.name));if(!found||found.length!==1||used.has(found[0].id))return c;const match=found[0];used.add(match.id);return {...c,id:match.id,tvg:match.tvg,sources:[...c.sources,...match.sources]};});
    TVD.baseChannels=base;TVD.channels=[...merged,...base.filter(c=>!used.has(c.id))];TVD.rutubeAt=Date.now();
    if(TVD.epgBusy)TVD.epgRefreshAgain=true;else tvEpgRefresh();return true;
  })();
  try{return await TVD.rutubeLoading;}finally{TVD.rutubeLoading=null;}
}

/* ---------- телепрограмма (читается в фоне, в памяти остаются только нужные каналы) ---------- */
function tvEpgWorker() {
  self.onmessage = async (e) => {
    const { url, ids, names } = e.data;
    const nrm = (x) => String(x || '').toLowerCase().replace(/ё/g, 'е').replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').replace(/\b(hd|fhd|uhd|4k|sd|orig)\b/g, ' ').replace(/[^a-zа-я0-9]+/g, '');
    const dec = (x) => String(x || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&amp;/g, '&').trim();
    const ptime = (x) => {
      const m = String(x).match(/(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)\s*([+-])?(\d\d)?(\d\d)?/); if (!m) return 0;
      const off = m[7] ? (m[7] === '-' ? -1 : 1) * ((+m[8] || 0) * 60 + (+m[9] || 0)) : 0;
      return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) - off * 60000;
    };
    const wantedIds = new Set(ids), wantedNames = new Map(names), nameToEpg = new Map();
    const now = Date.now(), from = now - 4 * 3600e3, to = now + 48 * 3600e3;
    const programmes = {}; let total = 0;
    try {
      const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status);
      const rd = r.body.pipeThrough(new DecompressionStream('gzip')).pipeThrough(new TextDecoderStream()).getReader();
      let buf = '', phaseProg = false;
      for (;;) {
        const { value, done } = await rd.read(); if (done) break;
        buf += value; let pos = 0;
        for (;;) {
          const c = phaseProg ? -1 : buf.indexOf('<channel ', pos), p = buf.indexOf('<programme ', pos);
          let i, kind;
          if (c >= 0 && (p < 0 || c < p)) { i = c; kind = 'c'; } else if (p >= 0) { i = p; kind = 'p'; phaseProg = true; } else { pos = Math.max(pos, buf.length - 12); break; }
          const end = buf.indexOf(kind === 'c' ? '</channel>' : '</programme>', i);
          if (end < 0) { pos = i; break; }
          const block = buf.substring(i, end);
          if (kind === 'c') {
            const id = (block.match(/^<channel\s+id="([^"]*)"/) || [])[1];
            if (id) for (const n of block.matchAll(/<display-name[^>]*>([\s\S]*?)<\/display-name>/g)) { const k = nrm(dec(n[1])); if (k && wantedNames.has(k)) { if (!nameToEpg.has(k)) nameToEpg.set(k, new Set()); nameToEpg.get(k).add(id); wantedIds.add(id); } }
            pos = end + 10;
          } else {
            const m = block.match(/^<programme\s+([^>]*)>/);
            if (m) {
              const a = m[1], ch = (a.match(/channel="([^"]*)"/) || [])[1];
              if (ch && wantedIds.has(ch)) {
                const s = ptime((a.match(/start="([^"]*)"/) || [])[1]), e2 = ptime((a.match(/stop="([^"]*)"/) || [])[1]);
                if (s && e2 && e2 >= from && s <= to) { const title = dec((block.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1]); if (title) { (programmes[ch] = programmes[ch] || []).push([s, e2, title]); total++; } }
              }
            }
            pos = end + 12;
          }
        }
        buf = buf.slice(pos);
      }
      for (const id of Object.keys(programmes)) programmes[id].sort((x, y) => x[0] - y[0]);
      const alias = {};
      for (const [k, cids] of wantedNames) { const matches = nameToEpg.get(k); if (!matches || matches.size !== 1) continue; const e3 = [...matches][0]; if (programmes[e3]) for (const id of cids) alias[id] = e3; }
      postMessage({ ok: true, programmes, alias, total });
    } catch (err) { postMessage({ error: String(err && err.message || err) }); }
  };
}
function tvEpgRefresh() {
  if (TVD.epgBusy || !TVD.channels.length || typeof Worker === 'undefined') return;
  TVD.epgBusy = true;
  const ids = [], by = new Map();
  for (const c of TVD.channels) { if (c.tvg) ids.push(c.tvg); else { const k = tvNrm(c.name); if (k) { if (!by.has(k)) by.set(k, []); by.get(k).push(c.id); } } }
  let w;
  try { w = new Worker(URL.createObjectURL(new Blob(['(' + tvEpgWorker.toString() + ')()'], { type: 'text/javascript' }))); } catch { TVD.epgBusy = false; return; }
  const done = () => { TVD.epgBusy = false; try { w.terminate(); } catch {} if(TVD.epgRefreshAgain){TVD.epgRefreshAgain=false;setTimeout(tvEpgRefresh,0);} };
  w.onmessage = (e) => {
    done();
    if (!e.data.ok) return;
    TVD.epg = { aliasVersion: 2, programmes: e.data.programmes, alias: e.data.alias, at: Date.now() };
    try { localStorage.setItem('luma.tv.epg', JSON.stringify(TVD.epg)); } catch {}
    if (route.name === 'tv') tvPaintNow(); else if (route.name === 'tvguide') tvGuideUpdate(); else if(route.name === 'sport') sportUpdateChannelEpg();
  };
  w.onerror = done;
  w.postMessage({ url: tvPx(TV_EPG_URL, '', '', true), ids: [...new Set(ids)], names: [...by] });
}
function tvNowNext(ch) {
  const list=tvGuideSchedule(ch); if (!list.length) return {};
  const now = Date.now();
  for (let i = 0; i < list.length; i++) if (list[i][0] <= now && now < list[i][1]) return { now: list[i][2], next: list[i + 1]?.[2], pct: Math.round(100 * (now - list[i][0]) / (list[i][1] - list[i][0])), end: list[i][1] };
  return {};
}

/* ---------- экран «Каналы» ---------- */
/* ---------- «Каналы мира»: общий каталог iptv-org (проект сообщества, каналы всех стран) ---------- */
const TVW = { all: null, at: 0, loading: null, byId: new Map(), cc: '', q: '', epg:{}, epgAt:{}, epgPending:{} };
const TVW_URL = 'https://iptv-org.github.io/iptv/index.m3u';
const TVW_GROUPS = { General: 'Общие', Movies: 'Фильмы', Series: 'Сериалы', Entertainment: 'Развлекательные', Music: 'Музыка', Sports: 'Спорт', News: 'Новости', Kids: 'Детские', Documentary: 'Документальные', Religious: 'Религия', Culture: 'Культура', Outdoor: 'Природа и путешествия', Lifestyle: 'Стиль жизни', Undefined: 'Без категории', Education: 'Образование', Animation: 'Мультфильмы', Business: 'Бизнес', Comedy: 'Комедии', Cooking: 'Кулинария', Family: 'Семейные', Legislative: 'Парламент', Public: 'Общественные', Relax: 'Релакс', Science: 'Наука', Shop: 'Магазины', Travel: 'Путешествия', Weather: 'Погода', Auto: 'Авто', Classic: 'Классика', Interactive: 'Интерактивные', Local: 'Местные' };
async function tvWideLoad() {
  if (TVW.all && Date.now() - TVW.at < TV_TTL) return TVW.all;
  if (TVW.loading) return TVW.loading;
  TVW.loading = (async () => {
    const r = await fetch(tvPx(TVW_URL, '', '', true));
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const items = tvParseM3u(await r.text(), true)
      .filter((c) => !/\[(?:Not 24\/7|Geo-blocked)\]/i.test(c.name))   // каналы «не круглосуточно» и «только из своей страны» не показываем
      .map((c) => ({ ...c, name: c.name.replace(/\s*\(\d{3,4}p\)/gi, '').replace(/\s*\[[^\]]*\]/g, '').trim(), group: String(c.group || '').split(';').map((g) => TVW_GROUPS[g.trim()] || g.trim()).filter(Boolean)[0] || 'Без категории' }));
    const list = tvToChannels(items, 'x:').map((c) => ({ ...c, cc: ((c.tvg || '').match(/\.([a-z]{2,3})(?:@|$)/) || [])[1] || 'int' }));
    TVW.all = list; TVW.at = Date.now(); TVW.byId = new Map(list.map((c) => [c.id, c]));
    return list;
  })();
  try { return await TVW.loading; } finally { TVW.loading = null; }
}
function tvWideEpgWorker(){self.onmessage=async e=>{const {url,names}=e.data,wanted=new Map(names),candidates=new Map(),need=new Set(),map=new Map(),programme={};const norm=x=>String(x||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/ё/g,'е').replace(/\b(?:hd|fhd|uhd|4k|sd)\b/g,' ').replace(/[^\p{L}\p{N}]+/gu,'');const dec=x=>String(x||'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;|&#39;/g,"'").replace(/&amp;/g,'&').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).trim();const tm=x=>{const m=String(x||'').match(/^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)\s*([+-])?(\d\d)?(\d\d)?/);if(!m)return 0;const off=m[7]?(m[7]==='-'?-1:1)*(+(m[8]||0)*60+ +(m[9]||0)):0;return Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+m[6])-off*60000;};try{const r=await fetch(url);if(!r.ok)throw Error('HTTP');const rd=r.body.pipeThrough(new DecompressionStream('gzip')).pipeThrough(new TextDecoderStream()).getReader();let buf='',phase=false;for(;;){const {value,done}=await rd.read();if(done)break;buf+=value;let pos=0;for(;;){const c=phase?-1:buf.indexOf('<channel ',pos),p=buf.indexOf('<programme ',pos);let i,k;if(c>=0&&(p<0||c<p)){i=c;k='c';}else if(p>=0){i=p;k='p';if(!phase){phase=true;const choices=new Map();for(const [n,ids] of candidates)for(const cid of wanted.get(n)||[]){if(!choices.has(cid))choices.set(cid,{i:new Set(),n:new Set()});for(const id of ids)choices.get(cid)[n[0]].add(id);}for(const [cid,choice] of choices){const ids=choice.i.size?choice.i:choice.n;if(ids.size===1){const id=[...ids][0];need.add(id);map.set(cid,{id});}}}}else{pos=Math.max(pos,buf.length-16);break;}const end=buf.indexOf(k==='c'?'</channel>':'</programme>',i);if(end<0){pos=i;break;}const block=buf.slice(i,end);pos=end+(k==='c'?10:12);if(k==='c'){const id=block.match(/^<channel\s+id="([^"]+)"/)?.[1];if(!id)continue;const identity='i:'+norm(id);if(wanted.has(identity)){if(!candidates.has(identity))candidates.set(identity,new Set());candidates.get(identity).add(id);}for(const m of block.matchAll(/<display-name[^>]*>([\s\S]*?)<\/display-name>/g)){const key='n:'+norm(dec(m[1]));if(wanted.has(key)){if(!candidates.has(key))candidates.set(key,new Set());candidates.get(key).add(id);}}}else{const a=block.match(/^<programme\s+([^>]*)>/)?.[1]||'',id=a.match(/channel="([^"]+)"/)?.[1];if(!need.has(id))continue;const start=tm(a.match(/start="([^"]+)"/)?.[1]),stop=tm(a.match(/stop="([^"]+)"/)?.[1]),now=Date.now();if(!start||!stop||stop<now-4*3600000||start>now+48*3600000)continue;const title=dec(block.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1]);if(title)(programme[id]||=[]).push([start,stop,title]);}}buf=buf.slice(pos);if(buf.length>2000000)throw Error('BAD_XML');}const out={};for(const [cid,match] of map){const rows=programme[match.id];if(rows?.length)out[cid]=rows.slice().sort((a,b)=>a[0]-b[0]);}postMessage({ok:true,programmes:out});}catch{postMessage({error:true});}};}
const tvWideEpgKey=x=>String(x||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/ё/g,'е').replace(/\b(?:hd|fhd|uhd|4k|sd)\b/g,' ').replace(/[^\p{L}\p{N}]+/gu,'');
async function tvWideEpgLoad(country){let cc=String(country||'').toLowerCase();if(cc==='uk')cc='gb';const files={us:'US2',gb:'UK1',ca:'CA2',au:'AU1',br:'BR1',de:'DE1',es:'ES1',fr:'FR1',it:'IT1',nl:'NL1',pl:'PL1',pt:'PT1',rs:'RS1',tr:'TR1',ua:'UA1'};if(!files[cc])return;if(TVW.epgAt[cc]&&Date.now()-TVW.epgAt[cc]<6*3600000)return;if(TVW.epgPending[cc])return TVW.epgPending[cc];const run=(TVW.epgQueue||Promise.resolve()).catch(()=>{}).then(async()=>{const channels=await tvWideLoad(),names=new Map();for(const c of channels){const code=String(c.cc||'').toLowerCase();if(code!==cc&&!(cc==='gb'&&code==='uk'))continue;if(String(c.tvg||'').includes('@')&&!/@(?:sd|hd|fhd|uhd|4k)$/i.test(c.tvg))continue;for(const [kind,value] of [['n',c.name],['i',String(c.tvg||'').replace(/@(?:sd|hd|fhd|uhd|4k)$/i,'')]]){const k=tvWideEpgKey(value);if(k){const key=kind+':'+k;if(!names.has(key))names.set(key,[]);names.get(key).push(c.id);}}}return new Promise(resolve=>{const blob=URL.createObjectURL(new Blob(['('+tvWideEpgWorker.toString()+')()'],{type:'text/javascript'})),w=new Worker(blob),timeout=setTimeout(()=>done(),90000);function done(){clearTimeout(timeout);w.terminate();URL.revokeObjectURL(blob);resolve();}w.onmessage=e=>{if(e.data?.ok){Object.assign(TVW.epg,e.data.programmes);TVW.epgAt[cc]=Date.now();if(route.name==='tvworld'||route.name==='tv')tvPaintNow();if(route.name==='tvguide')tvGuideUpdate();}done();};w.onerror=done;w.postMessage({url:tvPx('https://epgshare01.online/epgshare01/epg_ripper_'+files[cc]+'.xml.gz','','',true),names:[...names]});});});TVW.epgQueue=run.catch(()=>{});TVW.epgPending[cc]=run;try{await run}finally{delete TVW.epgPending[cc]}}
const tvRegion = (() => { let dn = null; try { dn = new Intl.DisplayNames(['ru'], { type: 'region' }); } catch {} return (cc) => { const u = String(cc || '').toUpperCase(); if (!u || u === 'INT') return 'Международные'; try { return (dn && dn.of(u === 'UK' ? 'GB' : u)) || u; } catch { return u; } }; })();
const tvChan = (id) => TVD.channels.find((c) => c.id === id) || TVW.byId.get(id);
function tvChipsList() {
  const g = new Map();
  for (const c of TVD.channels.filter(c=>TVD.scope!=='rutube'||c.rutube)) g.set(c.group, (g.get(c.group) || 0) + 1);
  const groups = [...g.entries()].sort((a, b) => b[1] - a[1]).map((x) => x[0]);
  return ['Все', '★ Избранные', ...groups];
}
function tvFiltered() {
  const cat = TVD.cat, q=String(TVD.q||'').trim().toLocaleLowerCase('ru-RU');
  return TVD.channels.filter((c) => (TVD.scope!=='rutube'||c.rutube) && (cat === 'Все' || (cat === '★ Избранные' ? tvIsFav(c.id) : c.group === cat)) && (!q || c.name.toLocaleLowerCase('ru-RU').includes(q)));
}
function tvCard(c, key) {
  const nn = tvNowNext(c);
  return `<div class="chc f" tabindex="-1" data-ch="${esc(c.id)}" data-k="${esc(key)}"><div class="lg"><span>${esc(c.name.slice(0, 2))}</span>${c.logo ? `<img decoding="async" loading="lazy" src="${esc(/^https?:/i.test(c.logo) ? tvPx(c.logo) : c.logo)}" alt="">` : ''}${tvIsFav(c.id) ? '<i class="st">★</i>' : ''}</div>
    <div class="n">${esc(c.name)}</div><div class="np">${nn.now ? esc(nn.now) : esc(c.group)}</div>${nn.pct != null ? `<i class="pg" style="width:${nn.pct}%"></i>` : ''}</div>`;
}
function tvHook(root) { $$('.chc .lg img', root).forEach((im) => { im.onload = () => im.classList.add('ok'); im.onerror = () => im.remove(); if (im.complete && im.naturalWidth) im.classList.add('ok'); }); }
function tvGuideLogoHooks(root) { $$('.tvg-channel img',root).forEach(img=>{if(img.dataset.w)return;img.dataset.w='1';img.onerror=()=>{const fallback=document.createElement('i');fallback.textContent=img.parentElement?.querySelector('b')?.textContent?.trim()[0]||'?';img.replaceWith(fallback);};if(img.complete&&!img.naturalWidth)img.onerror();}); }
function tvPaintNow() {
  if (route.name !== 'tv' && route.name !== 'tvworld') return;
  $$('.chc').forEach((el) => { const c = tvChan(el.dataset.ch); if (!c) return; const nn = tvNowNext(c); const np = $('.np', el); if (np) np.textContent = nn.now || c.group; let pg = $('.pg', el); if (nn.pct != null) { if (!pg) { pg = document.createElement('i'); pg.className = 'pg'; el.appendChild(pg); } pg.style.width = nn.pct + '%'; } else pg?.remove(); });
}
async function renderTv(r, t) {
  view.innerHTML = '<div class="empty"><div class="spin"></div></div>';
  try { await tvLoad(); } catch { /* Rutube может работать даже когда списки недоступны. */ }
  let rtOk=true;try{await tvAttachRutube();}catch{rtOk=false;if(!TVD.rutubeAt)TVD.scope='all';}
  if(!TVD.channels.length){if(alive(t))view.innerHTML='<div class="empty"><b>Каналы не загрузились</b>Проверьте интернет и откройте раздел ещё раз</div>';return;}
  if (!alive(t)) return;
  feedPublish();   // каналы загружены: лаунчер получит логотипы недавних и избранных
  const recent = Object.entries(tvStats()).filter(([id, s]) => s.last && tvChan(id)).sort((a, b) => b[1].last - a[1].last).slice(0, 14).map(([id]) => tvChan(id));
  const favs = tvFavs().map(tvChan).filter(Boolean);
  const rails = TVD.cat === 'Все'
    ? (favs.length ? `<section class="sec tv-personal-rail"><h2>Избранные</h2><div class="track">${favs.map((c) => tvCard(c, 'f:' + c.id)).join('')}</div></section>` : '') +
      (recent.length ? `<section class="sec tv-personal-rail"><h2>Недавно смотрели</h2><div class="track">${recent.map((c) => tvCard(c, 'r:' + c.id)).join('')}</div></section>` : '') : '';
  view.innerHTML = `<div class="page tv-catalog-page tv-channels-page">${tvCatalogHeader('Телеканалы','Программа передач, избранные каналы и прямой эфир.','ТЕЛЕВИДЕНИЕ')}<div class="chips filters tv-catalog-toolbar"><button class="chip fl f" tabindex="-1" data-tvscope="1" data-k="tv:scope"><small>Источник</small>${TVD.scope==='rutube'?'Rutube':'Все каналы'}<i>▾</i></button><button class="chip fl f ${TVD.cat === 'Все' ? '' : 'on'}" tabindex="-1" data-tvflt="1" data-k="flt:cat"><small>Категория</small>${esc(TVD.cat)}<i>▾</i></button><input id="tvSearch" class="tv-channel-search f" tabindex="-1" data-k="tv:search" placeholder="Найти канал" aria-label="Найти канал" autocomplete="off"><button class="chip fl f" tabindex="-1" data-tvguide="1" data-k="tvguide">Телепрограмма<i>›</i></button><button class="chip fl f" tabindex="-1" data-tvworld="1" data-k="tvworld"><small>Другие страны</small>Каналы мира<i>›</i></button><span class="fcount">${tvChannelCount(tvFiltered().length)}${rtOk?'':' · Rutube недоступен'}</span></div>${rails}<div class="grid tvgrid" id="tvGrid"></div></div>`;
  TVD.list = tvFiltered(); TVD.shown = 0;
  const search=$('#tvSearch'); search.value=TVD.q||'';
  const paintGrid=()=>{TVD.list=tvFiltered();TVD.shown=0;const grid=$('#tvGrid');grid.innerHTML='';$$('.tv-personal-rail',view).forEach(el=>el.classList.toggle('hidden',!!String(TVD.q||'').trim()));const count=$('.fcount',view);if(count)count.textContent=tvChannelCount(TVD.list.length)+(rtOk?'':' · Rutube недоступен');if(!TVD.list.length)grid.innerHTML=TVD.q?'<div class="empty"><b>Каналов не нашлось</b>Попробуйте другое название</div>':TVD.cat==='★ Избранные'?'<div class="empty"><b>Здесь пока пусто</b>Добавьте каналы в избранное: на экране просмотра нажмите OK и выберите ★</div>':'<div class="empty"><b>Каналов в этой категории нет</b>Выберите другую категорию или источник</div>';else tvMore();};
  paintGrid();let searchTimer;search.oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{if(!alive(t))return;TVD.q=search.value;paintGrid();},180);};search.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();clearTimeout(searchTimer);TVD.q=search.value;paintGrid();$('#tvGrid .chc')?.focus({preventScroll:true});}};
  tvHook(view);
  const first = $('#tvGrid .chc') || $('.chc') || $('.chip.on');
  first?.focus({ preventScroll: true });
}
function tvMore() {
  const g = $('#tvGrid'); if (!g || TVD.shown >= TVD.list.length) return;
  const part = TVD.list.slice(TVD.shown, TVD.shown + 56); TVD.shown += part.length;
  g.insertAdjacentHTML('beforeend', part.map((c) => tvCard(c, 'g:' + c.id)).join(''));
  tvHook(g);
}

/* ---------- экран «Каналы мира»: страны и поиск по всем странам ---------- */
async function renderTvWorld(r, t) {
  view.innerHTML = '<div class="empty"><div class="spin"></div></div>';
  let all;
  try { all = await tvWideLoad(); } catch { if (alive(t)) view.innerHTML = '<div class="empty"><b>Каталог не загрузился</b>Проверьте интернет и попробуйте ещё раз</div>'; return; }
  if (!alive(t)) return;
  const cc = r.cc || '';
  const base = r.sport ? all.filter(c=>c.group==='Спорт') : cc ? all.filter((c) => c.cc === cc) : all;
  TVW.guideList=base;
  if(r.sport)['us','gb','ca'].forEach(tvWideEpgLoad);else if(cc)tvWideEpgLoad(cc);
  view.innerHTML = `<div class="page tv-catalog-page tv-world-page">${tvCatalogHeader(r.sport?'Спортивные каналы мира':cc?tvRegion(cc):'Каналы мира','Телеканалы разных стран и программа передач.','ТЕЛЕВИДЕНИЕ')}<div class="chips filters tv-catalog-toolbar"><button class="chip f" tabindex="-1" data-tvguide="1" data-k="tvguide">Телепрограмма ›</button><input id="wq" class="tv-channel-search f" tabindex="-1" data-k="wq" placeholder="${cc ? 'Найти канал: ' + esc(tvRegion(cc)) : 'Найти канал среди всех стран'}" aria-label="Поиск канала" autocomplete="off"></div>
    ${r.sport?`<h3 class="ph3" style="padding:0 48px">Спортивные каналы мира <small>· ${base.length} каналов</small></h3>`:cc ? `<h3 class="ph3" style="padding:0 48px">${esc(tvRegion(cc))}<small> · ${base.length} каналов</small></h3>` : ''}
    <div id="wbody"></div></div>`;
  const body = $('#wbody');
  const countries = () => {
    const n = {}; all.forEach((c) => { n[c.cc] = (n[c.cc] || 0) + 1; });
    const rows = Object.entries(n).map(([k, v]) => [k, v, tvRegion(k)]).sort((a, b) => b[1] - a[1]);
    body.innerHTML = `<h3 class="ph3" style="padding:0 48px">Страны</h3><div class="grid wgrid">${rows.map(([k, v, name]) => `<button class="wc f" tabindex="-1" data-wcc="${esc(k)}" data-k="wc:${esc(k)}"><b>${esc(name)}</b><small>${v} каналов</small></button>`).join('')}</div>
      <p class="whint">Каталог ведёт сообщество проекта iptv-org (github.com/iptv-org/iptv). Часть ссылок может не работать.</p>`;
  };
  const show = (list) => {
    TVW.guideList=list; TVD.list = list; TVD.shown = 0;
    body.innerHTML = list.length ? '<div class="grid tvgrid" id="tvGrid"></div>' : '<div class="empty"><b>Каналов не нашлось</b>Попробуйте другое название</div>';
    if (list.length) { tvMore(); tvHook(body); }
  };
  const run = () => {
    const q = ($('#wq').value || '').trim().toLowerCase();
    if (!q) { if (cc||r.sport) show(base); else countries(); return; }
    show(base.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 300));
  };
  if (cc||r.sport) show(base); else countries();
  const q = $('#wq');
  q.onkeydown = (e) => { if (e.key !== 'Enter') return; e.preventDefault(); run(); q.blur(); setTimeout(() => ($('#tvGrid .chc') || $('.wc'))?.focus({ preventScroll: true }), 150); };
  q.oninput = () => { if (!q.value.trim()) run(); };
  const first = $('#tvGrid .chc') || $('.wc') || q;
  first.focus({ preventScroll: true });
}
window.RENDER = window.RENDER || {};
window.RENDER.tvworld = renderTvWorld;
function tvGuideSchedule(c){const link=tvX().tvEpgLinks?.[c.id];if(link?.id)return TVD.epg.programmes[link.tvg]||TVD.epg.programmes[TVD.epg.alias[link.id]]||TVW.epg[link.id]||[];return tvGuideRawSchedule(c);}
function tvGuideRawSchedule(c){const id=(c.tvg&&TVD.epg.programmes[c.tvg])?c.tvg:TVD.epg.alias[c.id];const primary=(id&&TVD.epg.programmes[id])||[],world=TVW.epg[c.id]||[];const now=Date.now();return primary.some(p=>p[0]<=now&&p[1]>now)?primary:world.some(p=>p[0]<=now&&p[1]>now)?world:primary.some(p=>p[1]>now)?primary:world.length?world:primary;}
let tvGuideOffset=0,tvGuideSelection=null;
const tvGuideBegin=()=>Math.floor(Date.now()/1800000)*1800000+tvGuideOffset*1800000;
function tvPickEpgLink(ch){if(!ch)return;const candidates=(TVD.list||[]).filter(c=>c.id!==ch.id&&tvGuideRawSchedule(c).length).sort((a,b)=>a.name.localeCompare(b.name,'ru'));const items=[{label:'Автоматически',v:'',on:!tvX().tvEpgLinks?.[ch.id]?.id},...candidates.map(c=>({label:c.name,v:c.id,on:tvX().tvEpgLinks?.[ch.id]?.id===c.id}))];pickDlg('Программа для '+ch.name,items,item=>{const source=candidates.find(c=>c.id===item.v);tvX().tvEpgLinks=tvX().tvEpgLinks||{};tvX().tvEpgLinks[ch.id]={id:source?.id||'',tvg:source?.tvg||'',name:source?.name||'',cc:source?.cc||'',ts:Date.now()};save();tvGuideUpdate();tvGuideFeature(ch);$('#tvgMap')?.focus({preventScroll:true});});const grid=$('#modal .pgrid'),head=$('#modal h3');if(grid&&head){head.insertAdjacentHTML('afterend','<input class="epg-tv-search f" tabindex="-1" data-k="epg:search" placeholder="Найти канал" aria-label="Найти канал">');const input=$('#modal .epg-tv-search');input.addEventListener('input',()=>{const q=input.value.trim().toLocaleLowerCase('ru-RU'),filtered=items.filter((x,i)=>i===0||x.label.toLocaleLowerCase('ru-RU').includes(q));window.__pk.items=filtered;grid.innerHTML=filtered.map((it,i)=>`<button class="pk f ${it.on?'on':''}" tabindex="-1" data-pk="${i}" data-k="pk:${i}"><i>${it.on?'✓':''}</i><span>${esc(it.label)}</span></button>`).join('');});}}
function tvGuideCells(c,begin,end){const now=Date.now(),rows=tvGuideSchedule(c).filter(p=>p[1]>begin&&p[0]<end);return rows.length?rows.map(p=>{const a=Math.max(0,(p[0]-begin)/(end-begin)*100),b=Math.min(100,(p[1]-begin)/(end-begin)*100);return `<span class="tvg-show ${p[0]<=now&&p[1]>now?'on':''} ${tvGuideSelection?.id===c.id&&tvGuideSelection.start===p[0]?'selected':''}" style="left:${a}%;width:${Math.max(0,b-a)}%"><b>${esc(p[2])}</b></span>`}).join(''):'<span class="tvg-empty">Нет данных программы</span>';}
function tvGuideRow(c,begin,end){return `<button class="tvg-row f" tabindex="-1" data-guide-channel="${esc(c.id)}" data-k="guide:${esc(c.id)}"><span class="tvg-channel">${c.logo?`<img loading="lazy" src="${esc(tvPx(c.logo))}" alt="">`:`<i>${esc((c.name||'?')[0])}</i>`}<b>${esc(c.name)}</b></span><span class="tvg-line">${tvGuideCells(c,begin,end)}</span></button>`;}
function tvGuideFeature(c){TVD.guideSelected=c.id;const link=tvX().tvEpgLinks?.[c.id];if(link?.id&&link.cc&&!TVW.epg[link.id])tvWideEpgLoad(link.cc);const map=$('#tvgMap');if(map)map.textContent=tvX().tvEpgLinks?.[c.id]?.id?'Программа: '+tvX().tvEpgLinks[c.id].name:'Привязать программу';const title=$('#tvgTitle'),sub=$('#tvgSubtitle'),logo=$('#tvgFeatureLogo');if(!c||!title||!sub)return;const now=tvNowNext(c),selected=tvGuideSelection?.id===c.id?tvGuideSchedule(c).find(p=>p[0]===tvGuideSelection.start):null;const reminder=$('#tvgReminder');if(reminder){const valid=!!selected&&Number(selected[0])>Date.now();reminder.classList.toggle('is-muted',!valid);reminder.setAttribute('aria-disabled',String(!valid));reminder.setAttribute('aria-pressed',String(valid&&tvProgramReminderOn(c,selected)));reminder.textContent=valid&&tvProgramReminderOn(c,selected)?'Напоминание включено':'Напомнить за 15 мин';}const label=$('.tvg-feature span');if(label)label.textContent=selected&&!(selected[0]<=Date.now()&&selected[1]>Date.now())?'ТЕЛЕВИЗОР · ВЫБРАННАЯ ПЕРЕДАЧА':'ТЕЛЕВИЗОР · СЕЙЧАС В ЭФИРЕ';title.textContent=selected?.[2]||now.now||c.name;sub.textContent=selected?c.name+' · '+new Date(selected[0]).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})+'–'+new Date(selected[1]).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}):now.now?c.name+' · '+(now.end?'до '+new Date(now.end).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}):'В эфире'):'Программа канала пока недоступна';if(logo){logo.innerHTML=c.logo?'<img alt="">':'<b></b>';const img=logo.querySelector('img');if(img){img.onerror=()=>{const fallback=document.createElement('b');fallback.textContent=(c.name||'?')[0];img.replaceWith(fallback);};img.src=tvPx(c.logo);}else logo.querySelector('b').textContent=(c.name||'?')[0];}}
function tvGuideUpdate(){if(route.name!=='tvguide')return;const begin=tvGuideBegin(),end=begin+3*3600000;$$('.tvg-times time',view).forEach((el,i)=>el.textContent=new Date(begin+i*1800000).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}));$$('[data-guide-channel]',view).forEach(el=>{const c=tvChan(el.dataset.guideChannel),line=$('.tvg-line',el);if(c&&line)line.innerHTML=tvGuideCells(c,begin,end);});const current=document.activeElement?.closest('[data-guide-channel]');if(current)tvGuideFeature(tvChan(current.dataset.guideChannel));}
async function renderTvGuide(r,t){view.innerHTML='<div class="empty"><div class="spin"></div><p>Загружаем телепрограмму…</p></div>';if(r.world)await tvWideLoad().catch(()=>[]);else{await tvLoad().catch(()=>{});await tvAttachRutube().catch(()=>{});}if(!alive(t))return;tvGuideOffset=0;tvGuideSelection=null;const items=(r.world?(TVW.guideList||TVW.all||[]):tvFiltered()).slice(),begin=tvGuideBegin(),end=begin+3*3600000;TVD.list=items;let shown=0;view.innerHTML=`<div class="page tv-guide-page"><div class="tvg-hero"><div class="tvg-feature"><div id="tvgFeatureLogo" class="tvg-feature-logo"></div><div><span>ТЕЛЕВИЗОР · СЕЙЧАС В ЭФИРЕ</span><h2 id="tvgTitle">Телепрограмма</h2><p id="tvgSubtitle">Выберите канал, чтобы смотреть</p></div></div><button class="chip f" tabindex="-1" data-guide-back="1" data-k="guide:back">← Каналы</button></div><div class="tvg-time-actions"><button class="chip f is-muted" id="tvgReminder" tabindex="-1" data-guide-reminder="1" data-k="guide:reminder" aria-disabled="true">Напомнить за 15 мин</button><button class="chip f" id="tvgMap" tabindex="-1" data-guide-map="1" data-k="guide:map">Привязать программу</button><button class="chip f" tabindex="-1" data-guide-shift="-6" data-k="guide:earlier">‹ Ранее</button><button class="chip f" tabindex="-1" data-guide-shift="now" data-k="guide:now">Сейчас</button><button class="chip f" tabindex="-1" data-guide-shift="6" data-k="guide:later">Позже ›</button></div><div class="tvg-times"><span>Канал</span><div>${Array.from({length:6},(_,i)=>`<time>${esc(new Date(begin+i*1800000).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}))}</time>`).join('')}</div></div><div id="tvgRows"></div><div id="tvgMore"></div></div>`;const rows=$('#tvgRows');rows.addEventListener('focusin',e=>{const row=e.target.closest('[data-guide-channel]');if(row){const c=tvChan(row.dataset.guideChannel),begin=tvGuideBegin(),rows=c?tvGuideSchedule(c):[],p=rows.find(x=>x[0]<=Date.now()&&x[1]>Date.now()&&x[1]>begin&&x[0]<begin+3*3600000)||rows.find(x=>x[1]>begin&&x[0]<begin+3*3600000);tvGuideSelection=p?{id:c.id,start:p[0]}:null;tvGuideUpdate();}});const append=()=>{if(!alive(t)||!rows)return;const next=items.slice(shown,shown+50);shown+=next.length;const currentBegin=tvGuideBegin();rows.insertAdjacentHTML('beforeend',next.map(c=>tvGuideRow(c,currentBegin,currentBegin+3*3600000)).join(''));tvGuideLogoHooks(rows);if(r.world)[...new Set(next.map(c=>c.cc).filter(Boolean))].forEach(tvWideEpgLoad);};append();if(typeof IntersectionObserver!=='undefined'){const more=$('#tvgMore'),observer=new IntersectionObserver(entries=>{if(!alive(t)){observer.disconnect();return;}if(entries[0].isIntersecting){append();if(shown>=items.length)observer.disconnect();}},{root:view,rootMargin:'600px'});observer.observe(more);}if(r.world){const countries=r.cc?[r.cc]:r.sport?['us','gb','ca']:[];countries.forEach(tvWideEpgLoad);}$('#tvgRows .f')?.focus({preventScroll:true});if(items.length)tvGuideFeature(items[0]);const tick=()=>{if(!alive(t)||route.name!=='tvguide')return;tvGuideUpdate();setTimeout(tick,30000);};setTimeout(tick,30000);}
document.addEventListener('keydown',e=>{if(route.name!=='tvguide'||!$('#modal').classList.contains('hidden')||!['ArrowLeft','ArrowRight'].includes(e.key))return;const row=document.activeElement?.closest('[data-guide-channel]'),c=row&&tvChan(row.dataset.guideChannel);if(!c)return;const list=tvGuideSchedule(c);if(!list.length)return;let i=list.findIndex(p=>tvGuideSelection?.id===c.id&&p[0]===tvGuideSelection.start);if(i<0)i=list.findIndex(p=>p[1]>tvGuideBegin());const next=i+(e.key==='ArrowRight'?1:-1);if(next<0||next>=list.length)return;e.preventDefault();e.stopImmediatePropagation();const p=list[next];tvGuideSelection={id:c.id,start:p[0]};const base=Math.floor(Date.now()/1800000)*1800000;if(p[0]>=tvGuideBegin()+3*3600000||p[1]<=tvGuideBegin())tvGuideOffset=Math.max(-8,Math.min(90,Math.floor((p[0]-base)/1800000)));tvGuideUpdate();},true);
window.RENDER.tvguide=renderTvGuide;


/* ---------- плеер ---------- */
const tvOpen = () => !$('#tvp').classList.contains('hidden');
function tvEnsureDom() {
  if ($('#tvp')) return;
  $('#stage').insertAdjacentHTML('beforeend', `<div id="tvp" class="hidden"><video id="tvv" playsinline></video><div id="tvst" class="hidden"><div class="spin"></div><span></span></div>
    <div id="tvOsd" class="hidden"><div class="pclk"></div><div class="o1"><b id="tvName"></b><span id="tvSrc"></span></div><div class="o2" id="tvNow"></div><div class="o3"><i id="tvBar"></i></div><div class="o4" id="tvNext"></div><div class="o5">▲ ▼ каналы · OK или ◀ список каналов · ▶ программа передач</div></div>
    <div id="tvList" class="hidden"></div><div id="tvProg" class="hidden"></div></div>`);
}
function tvStatus(msg, spin = true) { const s = $('#tvst'); if (!msg) { s.classList.add('hidden'); return; } s.classList.remove('hidden'); $('span', s).textContent = msg; $('.spin', s).style.display = spin ? '' : 'none'; }
function tvOsd(ms = 4500) {
  const c = TVD.cur; if (!c) return;
  tick();
  const nn = tvNowNext(c);
  $('#tvName').textContent = (tvIsFav(c.id) ? '★ ' : '') + c.name;
  $('#tvSrc').textContent = c.sources.length > 1 ? `источник ${TVD.srcIdx + 1} из ${c.sources.length}` : '';
  $('#tvNow').textContent = nn.now || c.group;
  $('#tvNext').textContent = nn.next ? 'Дальше: ' + nn.next : '';
  $('#tvBar').style.width = (nn.pct || 0) + '%';
  $('.o3').style.visibility = nn.pct != null ? 'visible' : 'hidden';
  $('#tvOsd').classList.remove('hidden'); clearTimeout(TVD.osdT); TVD.osdT = setTimeout(() => $('#tvOsd').classList.add('hidden'), ms);
}
function tvStop() {
  clearTimeout(TVD.stuckT);
  if (TVD.hls) { try { TVD.hls.destroy(); } catch {} TVD.hls = null; }
  const v = $('#tvv'); if (v) { try { v.pause(); } catch {} v.removeAttribute('src'); v.load(); }
}
async function tvPlay(ch, srcIdx = 0, fresh = true, tries = 0) {
  tvEnsureDom();
  if (!ch) return;
  const first = !tvOpen();
  $('#tvp').classList.remove('hidden');
  if (first) { try { NATIVE?.keepOn?.(true); } catch {} }
  TVD.cur = ch; TVD.srcIdx = srcIdx % ch.sources.length;
  if (fresh) { tvX().tvLast = ch.id; const st = tvStats(); const s = (st[ch.id] = st[ch.id] || { n: 0, t: 0, last: 0, name: '' }); s.last = Date.now(); s.n++; s.name = ch.name; save(); }
  const request=TVD.playRequest=(TVD.playRequest||0)+1;
  tvStop(); tvStatus('Подключаемся…'); tvOsd();
  let src = ch.sources[TVD.srcIdx]; const v = $('#tvv');
  const fail = () => {
    if (TVD.cur !== ch || request!==TVD.playRequest) return;
    if (ch.sources.length > 1 && tries < ch.sources.length - 1) { const next=(TVD.srcIdx + 1) % ch.sources.length; tvPlay(ch, next, false, tries + 1); toast('Источник ' + (next + 1) + ' из ' + ch.sources.length); return; }
    tvStatus('Нет сигнала. ▲ ▼ — другой канал', false);
  };
  if(src.kind==='rutube'){
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
    try{const r=await fetch(tvPx(`https://rutube.ru/api/play/options/${src.id}/?format=json`,'','',true),{signal:controller.signal});if(!r.ok)throw Error('HTTP');const j=await r.json();if(j.acl_access?.allowed===false)throw Error('ACCESS');const u=new URL(j.video_balancer?.m3u8||j.live_streams?.hls?.find(x=>x.is_video!==false)?.url);if(u.protocol!=='https:'||!(u.hostname==='bl.rutube.ru'||u.hostname.endsWith('.rtbcdn.ru')))throw Error('URL');src={url:u.href,ua:'',ref:'https://rutube.ru/'};}
    catch{fail();return;}
    finally{clearTimeout(timeout);}
    if(request!==TVD.playRequest||TVD.cur!==ch||!tvOpen())return;
  }
  const url = tvPx(src.url, src.ua, src.ref);
  v.onplaying = () => { tvStatus(''); clearTimeout(TVD.stuckT); };
  v.onwaiting = () => { if (TVD.cur !== ch || request !== TVD.playRequest) return; tvStatus('Буферизация…'); clearTimeout(TVD.stuckT); const startedAt=v.currentTime; TVD.stuckT=setTimeout(()=>{if(TVD.cur===ch&&request===TVD.playRequest&&tvOpen()&&v.currentTime<=startedAt)fail();},20000); };
  v.onerror = fail;
  TVD.stuckT = setTimeout(() => { if (TVD.cur === ch && request === TVD.playRequest && tvOpen() && !v.currentTime && v.readyState < 2) fail(); }, 20000);
  const isHls = /\.m3u8?(\?|#|$)/i.test(src.url) || !/\.(mp4|ts|mkv|avi|webm)(\?|#|$)/i.test(src.url);
  if (isHls && window.Hls && Hls.isSupported()) {
    const h = new Hls({ maxBufferLength: 20, backBufferLength: 10, liveSyncDurationCount: 3, manifestLoadingTimeOut: 15000, levelLoadingTimeOut: 15000, fragLoadingTimeOut: 25000, manifestLoadingMaxRetry: 1, levelLoadingMaxRetry: 2, fragLoadingMaxRetry: 3 });
    let net = 0, med = 0;
    h.on(Hls.Events.MANIFEST_PARSED, () => { v.play().catch(() => {}); });
    h.on(Hls.Events.ERROR, (_e, d) => {
      if (!d.fatal) return;
      if (d.type === Hls.ErrorTypes.NETWORK_ERROR && net++ < 1) { h.startLoad(); return; }
      if (d.type === Hls.ErrorTypes.MEDIA_ERROR && med++ < 2) { h.recoverMediaError(); return; }
      fail();
    });
    h.loadSource(url); h.attachMedia(v); TVD.hls = h;
  } else { v.src = url; v.play().catch(() => {}); }
  clearInterval(TVD.timers.count);
  TVD.timers.count = setInterval(() => { if (!v.paused && TVD.cur) { const s = tvStats()[TVD.cur.id]; if (s) { s.t += 15; s.last = Date.now(); save(); } } }, 15000);
}
function tvClose() {
  TVD.playRequest=(TVD.playRequest||0)+1;
  clearInterval(TVD.timers.count); tvStop(); tvStatus('');
  $('#tvp').classList.add('hidden'); $('#tvList').classList.add('hidden'); $('#tvOsd').classList.add('hidden');
  try { NATIVE?.keepOn?.(false); } catch {}
  TVD.cur = null;
  if (route.name === 'tv') { const k = lastContent; show(route, { scroll: view.scrollTop, focus: k }); }
}
function tvZap(dir) {
  const list = TVD.list.length ? TVD.list : TVD.channels;
  let i = list.findIndex((c) => c.id === TVD.cur.id);
  if (i < 0) i = 0;
  tvPlay(list[(i + dir + list.length) % list.length]);
}
function tvOpenList() {
  const box = $('#tvList'), list = TVD.list.length ? TVD.list : TVD.channels;
  const i = Math.max(0, list.findIndex((c) => c.id === TVD.cur.id));
  const from = Math.max(0, i - 150), part = list.slice(from, from + 320);
  box.innerHTML = `<div class="tl-h">${esc(TVD.cat)}<span> · ${list.length} каналов</span></div><div class="tl-b">${part.map((c) => `<div class="tl-r"><button class="tl-c f ${c.id === TVD.cur.id ? 'cur' : ''}" tabindex="-1" data-tvplay="${esc(c.id)}" data-k="tl:${esc(c.id)}"><span class="a">${esc(c.name)}</span><span class="b">${esc(tvNowNext(c).now || c.group)}</span></button><button class="tl-s f ${tvIsFav(c.id) ? 'on' : ''}" tabindex="-1" data-tvstar="${esc(c.id)}" data-k="ts:${esc(c.id)}" aria-label="Избранное">★</button><button class="tl-g f" tabindex="-1" data-tvprog="${esc(c.id)}" data-k="tg:${esc(c.id)}" aria-label="Программа">≡</button></div>`).join('')}</div>`;
  box.classList.remove('hidden');
  const cur = $('.tl-c.cur', box) || $('.tl-c', box);
  cur?.focus({ preventScroll: true }); cur?.scrollIntoView({ block: 'center' });
}
const tvHm = (ms) => new Date(ms).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
function tvOpenProg(ch) {
  const box = $('#tvProg');
  const id = (ch.tvg && TVD.epg.programmes[ch.tvg]) ? ch.tvg : TVD.epg.alias[ch.id];
  const primary=(id&&TVD.epg.programmes[id])||[],world=TVW.epg[ch.id]||[],now=Date.now(),list=primary.some(p=>p[0]<=now&&p[1]>now)?primary:world.some(p=>p[0]<=now&&p[1]>now)?world:primary.some(p=>p[1]>now)?primary:world.length?world:primary;
  let day = '', rows = '';
  for (const [s0, e0, title] of list) {
    if (e0 < now - 2 * 3600e3) continue;
    const d = new Date(s0).toLocaleDateString('ru', { weekday: 'long', day: 'numeric', month: 'long' });
    if (d !== day) { day = d; rows += `<div class="tp-day">${esc(d)}</div>`; }
    const isNow = s0 <= now && now < e0;
    rows += `<div class="tp-r f ${isNow ? 'now' : e0 < now ? 'past' : ''}" tabindex="-1" data-k="pg:${s0}"><span class="tm">${tvHm(s0)} – ${tvHm(e0)}</span><span class="ti">${esc(title)}</span>${isNow ? `<i style="width:${Math.round(100 * (now - s0) / (e0 - s0))}%"></i>` : ''}</div>`;
  }
  const same = TVD.cur && TVD.cur.id === ch.id;
  box.innerHTML = `<div class="tp-h"><b>${esc(ch.name)}</b>${same && ch.sources.length > 1 ? `<button class="tp-s f" tabindex="-1" data-tvsrc="1" data-k="tp:src">Источник ${TVD.srcIdx + 1} из ${ch.sources.length} ›</button>` : ''}</div><div class="tp-sub">${list.length ? 'Телепрограмма' : ''}</div>
    <div class="tp-b">${rows || '<div class="empty" style="padding:60px 0;text-align:left">Для этого канала телепрограмма не найдена.</div>'}</div>`;
  box.classList.remove('hidden'); $('#tvList').classList.add('hidden');
  const target = $('.tp-r.now', box) || $('.tp-r', box) || $('.tp-s', box);
  target?.focus({ preventScroll: true }); target?.scrollIntoView({ block: 'center' });
}
function tvKey(e) {
  if (!$('#tvList').classList.contains('hidden') || !$('#tvProg').classList.contains('hidden')) return false;   // панели управляются общим перемещением фокуса
  const k = e.key;
  if (k === 'ArrowUp') tvZap(-1);
  else if (k === 'ArrowDown') tvZap(1);
  else if (k === 'ArrowLeft' || k === 'Enter') tvOpenList();
  else if (k === 'ArrowRight') tvOpenProg(TVD.cur);
  else return false;
  e.preventDefault(); return true;
}
function tvBack() {
  if (!$('#tvp') || !tvOpen()) return false;
  const p = $('#tvProg'), l = $('#tvList');
  if (!p.classList.contains('hidden')) { p.classList.add('hidden'); return true; }
  if (!l.classList.contains('hidden')) { l.classList.add('hidden'); return true; }
  tvClose(); return true;
}
window.tvPlayerOpen = () => !!$('#tvp') && tvOpen();
window.tvKey = tvKey; window.tvBack = tvBack;
window.tvMedia = (k) => { const v = $('#tvv'); if (!v || !tvOpen()) return false; if (k === 'playpause') { v.paused ? v.play() : v.pause(); } else if (k === 'next') tvZap(1); else if (k === 'prev') tvZap(-1); return true; };
window.tvPause = () => { try { $('#tvv')?.pause(); } catch {} };

/* клики по каналам, звёздам, категориям */
document.addEventListener('click', (e) => {
  const el = e.target.closest('.f'); if (!el) return;
  if(el.dataset.tvguide){if(route.name==='tv')localStorage.setItem('luma.tv.view','guide');go('tvguide',{world:route.name==='tvworld',sport:!!route.sport,cc:route.cc||''});return;}
  if(el.dataset.guideReminder){const c=tvChan(TVD.guideSelected),p=c&&tvGuideSelection?.id===c.id?tvGuideSchedule(c).find(x=>x[0]===tvGuideSelection.start):null;if(!p||Number(p[0])<=Date.now()){toast('Выберите будущую передачу');return;}const on=tvProgramReminderToggle(c,p,route.world?'wide':TVD.scope);tvGuideFeature(c);toast(on?'Напоминание включено':'Напоминание отменено');return;}
  if(el.dataset.guideMap){tvPickEpgLink(tvChan(TVD.guideSelected));return;}
  if(el.dataset.guideShift){tvGuideOffset=el.dataset.guideShift==='now'?0:Math.max(-8,Math.min(90,tvGuideOffset+Number(el.dataset.guideShift)));tvGuideUpdate();return;}
  if(el.dataset.guideBack){if(!route.world)localStorage.setItem('luma.tv.view','cards');go(route.world?'tvworld':'tv',route.world?{sport:!!route.sport,cc:route.cc||''}:{});return;}
  if(el.dataset.guideChannel){const c=tvChan(el.dataset.guideChannel);if(c)tvPlay(c);return;}
  if (el.dataset.tvworld) { go('tvworld', {}); return; }
  if (el.dataset.tvscope) { pickDlg('Источник каналов',[{label:'Rutube',v:'rutube',on:TVD.scope==='rutube'},{label:'Все каналы',v:'all',on:TVD.scope==='all'}],o=>{TVD.scope=o.v;TVD.cat='Все';show({name:'tv'},{scroll:0,focus:'tv:scope'});});return; }
  if (el.dataset.wcc) { go('tvworld', { cc: el.dataset.wcc }); return; }
  if (el.dataset.ch) { TVD.list = (route.name === 'tv' || route.name === 'tvworld') && TVD.list.length ? TVD.list : TVD.channels; const c = tvChan(el.dataset.ch); if (c) tvPlay(c); }
  else if (el.dataset.tvflt) {
    const cnt = new Map(); for (const c of TVD.channels) cnt.set(c.group, (cnt.get(c.group) || 0) + 1);
    pickDlg('Категория каналов', tvChipsList().map((g) => ({ label: g, on: g === TVD.cat, v: g, sub: g === 'Все' ? String(TVD.channels.length) : g === '★ Избранные' ? String(tvFavs().length) : String(cnt.get(g) || '') })), (o) => { TVD.cat = o.v; show({ name: 'tv' }, { scroll: 0, focus: 'flt:cat' }); });
  }
  else if (el.dataset.tvplay) { const c = tvChan(el.dataset.tvplay); $('#tvList').classList.add('hidden'); if (c) tvPlay(c); }
  else if (el.dataset.tvprog) { const c = tvChan(el.dataset.tvprog); if (c) tvOpenProg(c); }
  else if (el.dataset.tvsrc) { tvPlay(TVD.cur, TVD.srcIdx + 1, false); tvOpenProg(TVD.cur); }
  else if (el.dataset.tvstar) { const on = tvToggleFav(el.dataset.tvstar); el.classList.toggle('on', on); toast(on ? 'Канал в избранном' : 'Убрано из избранного'); tvOsd(); }
});
document.addEventListener('focusin', (e) => {
  const el = e.target.closest?.('.chc'); if (!el || !el.closest('#tvGrid')) return;
  const cards = $$('#tvGrid .chc'); if (cards.length - cards.indexOf(el) <= 14) tvMore();
});
window.RENDER = window.RENDER || {};
window.RENDER.tv = renderTv;

// luma://tv?id=… из лаунчера: включить канал сразу
window.tvOpenReminder=async item=>{try{if(item.scope==='wide')await tvWideLoad();else{await tvLoad();await tvAttachRutube().catch(()=>{});}const c=tvChan(item.channelId);if(c){TVD.list=TVD.list.length?TVD.list:(item.scope==='wide'?TVW.all:TVD.channels);tvPlay(c);}else toast('Канал не найден в доступном списке');}catch{toast('Не удалось загрузить канал');}};
window.lumaOpenTv = async (id) => { try { await tvLoad(); const c = tvChan(id); if (c) { TVD.list = TVD.list.length ? TVD.list : TVD.channels; tvPlay(c); } } catch {} };
