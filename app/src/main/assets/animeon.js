// Animeon — основной видеопуть для аниме: каталог, AnimeOn 2.0, озвучки и франшизы.
// Сайт в РФ заблокирован, но их Android-приложение работает через отдельные API-домены,
// которые блокировка не трогает. Делаем так же: список доменов с запоминанием рабочего
// (как api_failover у них в приложении). Подробности: ../animeon-api.md
function initAnimeon({ ipcMain, getStore, saveStore }) {
  const HOSTS = ['https://api.animeon.cloud', 'https://api.animeon.co'];
  const cache = new Map();   // url -> { t, v }
  // постеры и кадры (/media/anime/poster/…) отдаёт тот же API-домен, что и данные
  const media = () => getStore().animeonHost || HOSTS[0];

  const abs = (u) => {
    if (!u) return '';
    if (u.startsWith('//')) return 'https:' + u;
    if (u.startsWith('/')) return media() + u;
    return u;
  };

  async function aget(path, ttl = 300000) {
    const key = 'GET ' + path;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.t < ttl) return hit.v;
    const pref = (getStore().animeonHost || '').toString();
    const hosts = [...HOSTS].sort((a, b) => (b === pref) - (a === pref));
    let last;
    for (const h of hosts) {
      try {
        const r = await fetch(tvPx(h + path, '', '', true), { signal: AbortSignal.timeout(8000) });
        if (!r.ok) { last = new Error('HTTP ' + r.status); continue; }
        const v = await r.json();
        if (h !== pref) { saveStore && (getStore().animeonHost = h, saveStore()); }
        cache.set(key, { t: Date.now(), v });
        return v;
      } catch (e) { last = e; }
    }
    throw last || new Error('animeon недоступен');
  }

  const KIND_TYPE = { movie: 6, anime: 6, 'anime-serial': 7, tv: 7, ova: 7, ona: 7, special: 7, music: 6, tv_special: 7 };
  const kindOf = (c) => String(c.kind || c.material_data?.anime_kind || 'tv').toLowerCase();
  // В каталоге Animeon год бывает в корне и в material_data.aired_at.
  // Корневой year точнее для карточек франшизы, поэтому он в приоритете.
  const yearOf = (c) => {
    const md = (c && c.material_data) || {};
    const direct = Number(c && c.year);
    if (Number.isInteger(direct) && direct >= 1900 && direct <= 2200) return direct;
    const fromDate = Number(String(md.aired_at || c?.aired_at || '').slice(0, 4));
    return Number.isInteger(fromDate) && fromDate >= 1900 && fromDate <= 2200 ? fromDate : 0;
  };

  // нормализация полной карточки тайтла в компактный вид для рендерера
  function normalize(c) {
    if (!c || typeof c !== 'object') return null;
    const md = c.material_data || {};
    const tr = c.translations && typeof c.translations === 'object' ? c.translations : {};
    const selfHosted = c.self_hosted && typeof c.self_hosted === 'object' ? c.self_hosted : {};
    const seo = c.use_seo_data && c.seo_data && typeof c.seo_data === 'object' ? c.seo_data : {};
    const highlights = Array.isArray(seo.content?.bullet_highlights_ru) ? seo.content.bullet_highlights_ru.filter(x => typeof x === 'string' && x.trim()).slice(0,12).map(x=>x.trim().slice(0,1000)) : [];
    const faq = Array.isArray(seo.faq) ? seo.faq.filter(x => typeof x?.q === 'string' && x.q.trim() && typeof x?.a === 'string' && x.a.trim()).slice(0,12).map(x=>({question:x.q.trim().slice(0,500),answer:x.a.trim().slice(0,4000)})) : [];
    const voices = {};
    const epSet = new Set();
    const stills = [...new Set(Object.values(c.episode_screenshots || {})
      .flatMap((items) => Array.isArray(items) ? items : [])
      .map(abs)
      .filter(Boolean))].slice(0, 12);
    for (const [voice, v] of Object.entries(tr)) {
      const eps = (v && v.episodes) || {};
      const map = {};
      for (const [ep, rec] of Object.entries(eps)) {
        if (!rec || !rec.link) continue;
        map[String(ep)] = abs(rec.link);
        epSet.add(String(ep));
      }
      if (Object.keys(map).length) voices[voice] = map;
    }
    const episodes = [...epSet].map(Number).filter((n) => isFinite(n)).sort((a, b) => a - b);
    let franchise = null;
    const f = c.franchise;
    if (f && Array.isArray(f.nodes) && f.nodes.length > 1) {
      franchise = {
        currentId: f.current_id,
        links: (f.links || []).map((link) => ({ sourceId: link.source_id, targetId: link.target_id, relation: link.relation })),
        nodes: f.nodes.map((n) => ({
          id: n.id, name: n.name, year: n.year || (n.date ? new Date(n.date * 1000).getFullYear() : 0),
          kind: n.kind_key || n.kind || '', weight: n.weight ?? 0, date: n.date || 0,
          slug: n.slug || null, inBase: !!n.anime_link, poster: abs(n.poster_url) || n.image_url || '',
          score: n.score || 0, eps: n.episodes_available || 0, status: n.status || ''
        }))
      };
    }
    return {
      slug: c.anime_url || '',
      title: c.title || md.anime_title || '',
      titleOrig: c.title_orig || md.title_en || '',
      aliases: String(c.other_title || '').split(/\s*\/\s*/).map(x=>x.trim()).filter(Boolean).slice(0,8),
      type: KIND_TYPE[kindOf(c)] || 7,
      year: yearOf(c),
      status: c.status || md.anime_status || '',
      nextEpisodeAt: String(md.next_episode_at || c.next_episode_at || ''),
      episodesAired: Number(md.episodes_aired || 0),
      episodesTotal: Number(md.episodes_total || 0),
      poster: abs(c.anime_poster || c.poster || md.anime_poster || ''),
      description: c.description || md.anime_description || md.description || '',
      highlights, faq,
      genres: c.genres || md.anime_genres || [],
      duration: md.duration || 0,
      mpaa: md.rating_mpaa || '',
      studios: md.anime_studios || [],
      rating: Number(c.rating) || Number(md.shikimori_rating) || 0,
      kpRating: Number(md.kinopoisk_rating) || 0,
      imdbRating: Number(md.imdb_rating) || 0,
      shikimori: String(c.shikimori_id || ''),
      animeId: String(c.id || ''),
      kp: String(c.kinopoisk_id || ''),
      kodikId: c.kodik_id || '',
      trailer: c.trailer_id || '',
      stills,                 // кадры серий для «живого» фона карточки
      episodeStills: Object.fromEntries(Object.entries(c.episode_screenshots || {}).filter(([ep, images]) => /^\d+$/.test(ep) && Array.isArray(images) && images.length).map(([ep, images]) => [ep, abs(images[0])]).filter(([, url]) => /^https:\/\//i.test(url))),
      episodeStillAlternatives: Object.fromEntries(Object.entries(c.episode_screenshots || {}).filter(([ep, images]) => /^\d+$/.test(ep) && Array.isArray(images)).map(([ep, images]) => [ep, [...new Set(images.filter(url => typeof url === 'string').map(abs).filter(url => /^https:\/\//i.test(url)))].slice(0, 5)]).filter(([, images]) => images.length)),
      episodesAvailable: c.episodes_available || episodes.length,
      episodes,                 // [1,2,…] — объединение серий всех озвучек
      voices,                   // { 'AniDUB': { '1': 'https://kodikplayer.com/…', … } }
      voiceNames: Object.keys(voices),
      // Метаданные собственного AnimeOn 2.0. Ссылки на поток намеренно не
      // передаём в renderer: они выдаются API только после авторизации.
      selfHosted: {
        available: selfHosted.available === true,
        episodes: Array.isArray(selfHosted.episodes) ? selfHosted.episodes.map(Number).filter(Number.isFinite) : [],
        translations: selfHosted.translations || {}
      },
      franchise,
      source: 'animeon'
    };
  }

  const normSpace = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  // API сортирует найденные части франшизы не по основному тайтлу, а по своей
  // популярности/свежести. Для строки вроде «Клинок корол…» первым должен идти
  // стартовый сезон, а не четвёртая часть.
  const searchRank = (it, query) => {
    const q = normSpace(query), title = normSpace(it.title || it.material_data?.anime_title), orig = normSpace(it.title_orig);
    let rank = 0;
    if (title === q || orig === q) rank += 100000;
    else if (title.startsWith(q) || orig.startsWith(q)) rank += 10000;
    else if (title.includes(q) || orig.includes(q)) rank += 1000;
    // При одинаковом совпадении у франшизы естественно показывать ранние части.
    return rank - yearOf(it) / 10000;
  };
  const compact = (it) => ({
    slug: it.anime_url, title: it.title || it.material_data?.anime_title || '',
    titleOrig: it.title_orig || it.material_data?.title_en || '',
    type: KIND_TYPE[String(it.kind || it.material_data?.anime_kind || '').toLowerCase()] || 7,
    year: yearOf(it), poster: abs(it.poster || it.anime_poster || it.material_data?.anime_poster || ''),
    rating: Number(it.rating) || Number(it.material_data?.shikimori_rating) || 0,
    kpRating: Number(it.material_data?.kinopoisk_rating) || 0,
    imdbRating: Number(it.material_data?.imdb_rating) || 0,
    genres: it.genres || it.material_data?.anime_genres || [], status: it.status || ''
  });

  // поиск тайтла по названию и году: выбираем лучшего кандидата из выдачи
  async function match({ name, origin, year }) {
    const queries = [...new Set([name, origin].filter(Boolean))];
    let best = null;
    for (const q of queries) {
      let r;
      try { r = await aget('/api/anime?limit=8&search=' + encodeURIComponent(q), 120000); } catch { continue; }
      for (const it of (r && r.items) || []) {
        const t = normSpace(it.title), o = normSpace(it.title_orig), nq = normSpace(q);
        const md = it.material_data || {};
        const y = yearOf(it);
        let score = 0;
        if (t === nq || o === nq) score += 100;
        else if (t.includes(nq) || nq.includes(t)) score += 60;
        else if (o && (o.includes(nq) || nq.includes(o))) score += 50;
        if (year && y) score += Math.max(0, 20 - Math.abs(year - y) * 10);
        score += Math.min(10, Number(it.rating) || 0);
        if (!best || score > best.score) best = { score, slug: it.anime_url };
      }
      if (best && best.score >= 100) break;   // точное совпадение — дальше не ищем
    }
    if (!best || best.score < 60) return null;
    return normalize(await aget('/api/anime/' + best.slug, 600000));
  }

  ipcMain.handle('animeon:match', async (_e, q) => { try { return await match(q || {}); } catch { return null; } });
  ipcMain.handle('animeon:info', async (_e, slug, fresh = false) => {
    try { return normalize(await aget('/api/anime/' + encodeURIComponent(String(slug || '')), fresh ? 0 : 600000)); } catch { return null; }
  });
  ipcMain.handle('animeon:search', async (_e, q) => {
    try {
      const query = String(q || '').trim();
      const r = await aget('/api/search?q=' + encodeURIComponent(query), 60000);
      return ((r && r.results) || []).slice().sort((a, b) => searchRank(b, query) - searchRank(a, query)).slice(0, 8).map(compact).filter((x) => x.slug);
    } catch { return []; }
  });
  ipcMain.handle('animeon:random', async () => {
    try { const result=await aget('/api/anime/random', 0); return result?.anime_url && !result.disabled ? compact(result) : null; }
    catch { return null; }
  });
  ipcMain.handle('animeon:slider', async () => {
    try {
      const data=await aget('/api/slider', 300000);
      return (Array.isArray(data?.slides) ? data.slides : []).filter(s=>s.is_active !== false && s.anime_url && s.anime_data && !s.anime_data.disabled).slice(0,12).map(s=>({
        ...compact({...s.anime_data,anime_url:s.anime_url}),
        title:String(s.title || s.anime_title || s.anime_data.title || '').slice(0,200),
        description:String(s.description || s.anime_data.description || '').slice(0,1200),
        background:abs(s.bg_image_url || ''),
        video:/^\/media\/slider\/video\/[\w-]+\/master\.m3u8(?:\?.*)?$/i.test(String(s.bg_video_url || '')) ? abs(s.bg_video_url) : ''
      }));
    } catch { return []; }
  });
  ipcMain.handle('animeon:collection-tags', async () => {
    try {
      const result = await aget('/api/collections/tags', 3600000);
      return { tags: (Array.isArray(result?.tags) ? result.tags : []).filter(t => ['themes','genres','formats'].includes(t.group) && t.is_active !== false && /^[a-z0-9-]{1,80}$/.test(String(t.slug || '')) && t.label && Number(t.count) > 0).map(t => ({ slug:t.slug, label:String(t.label), group:String(t.group || ''), count:Number(t.count) || 0 })) };
    } catch { return { tags:[], error:'NETWORK' }; }
  });
  ipcMain.handle('animeon:collections', async (_e, options) => {
    try {
      const q = String(typeof options === 'string' ? options : options?.query || '').trim();
      const page = Math.max(1, Math.floor(Number(options?.page) || 1));
      const sort = ['popular', 'new'].includes(options?.sort) ? options.sort : 'popular';
      const params = new URLSearchParams({ page: String(page), limit: '24' });
      if (q) params.set('q', q); else params.set('sort', sort);
      if (!q && /^[a-z0-9-]{1,80}$/.test(String(options?.tag || ''))) params.set('tag', options.tag);
      const path = (q ? '/api/collections/search?' : '/api/collections?') + params;
      const result = await aget(path, 60000);
      return { total: Number(result.total) || 0, page, items: (result.collections || []).map((c) => ({ slug: c.slug, title: c.title, author: c.owner_username, count: c.items_count, desc: c.short_description || c.description, likes: c.likes_count, tags: Array.isArray(c.tags) ? c.tags : [], covers: (c.cover_items || []).map(compact) })) };
    } catch { return { items: [], error: 'NETWORK' }; }
  });
  ipcMain.handle('animeon:collection', async (_e, slug) => {
    try {
      const result = await aget('/api/collections/' + encodeURIComponent(String(slug || '')), 60000);
      const c = result.collection;
      if (!c) return { error: 'NOT_FOUND' };
      return { slug: c.slug, title: c.title, author: c.owner_username, desc: c.description, count: c.items_count, items: (c.items || []).map((x) => compact(x.anime || {})).filter((x) => x.slug) };
    } catch { return { error: 'NETWORK' }; }
  });
  ipcMain.handle('animeon:comments', async (_e, animeId, page = 1) => {
    try {
      const id = String(animeId || '');
      if (!/^[a-f\d]{24}$/i.test(id)) return { error: 'BAD_ID' };
      const params = new URLSearchParams({ anime_id: id, page: String(Math.max(1, Math.floor(Number(page) || 1))), limit: '20' });
      const result = await aget('/api/comments?' + params, 60000);
      return { comments: (result.comments || []).filter((c) => !c.is_deleted && c.body).map((c) => ({ author: c.author_username || 'Пользователь', body: String(c.body).slice(0, 5000), date: c.created_at, likes: Number(c.likes_count) || 0, replies: Number(c.replies_count) || 0 })), hasMore: (result.comments || []).length >= 20, total: Number(result.total) || 0 };
    } catch { return { error: 'NETWORK' }; }
  });
  ipcMain.handle('animeon:genres',async()=>{try{const r=await aget('/api/anime/filters',3600000);return {items:(Array.isArray(r.genres)?r.genres:[]).filter(x=>typeof x==='string'&&x.trim()).map(x=>x.trim())};}catch{return {items:[],error:'NETWORK'};}});
  ipcMain.handle('animeon:catalog', async (_e, q) => {
    try {
      const page = Math.max(1, Number(q?.page) || 1), limit = Math.min(48, Math.max(8, Number(q?.limit) || 24));
      if (q?.feed === 'new') {
        // Недавние завершённые релизы по популярности; текущие онгоинги остаются в отдельной ленте.
        const chunks = await Promise.all([1,2,3,4].map(n => aget(`/api/anime?page=${n}&limit=48&sort=popular&status=released`, 120000)));
        const year = new Date().getFullYear();
        const items = chunks.flatMap(x => x?.items || []).map(compact).filter(x => x.slug && x.status === 'released' && x.year >= year-1 && x.year <= year);
        return {items:items.slice((page-1)*limit,page*limit), page, total:items.length};
      }
      if (q?.feed === 'recent') {
        const result = await aget('/api/anime/schedule/recent', 120000);
        const unique = [...new Map((Array.isArray(result) ? result : []).filter(x => x.anime_url).map(x => [x.anime_url, x])).values()];
        const items = unique.slice((page-1)*limit, page*limit).map(x => ({...compact({...x, poster:x.poster_url}), episode:x.episode, releasedAt:x.released_at}));
        return {items, page, total:unique.length};
      }
      const sort = ['popular', 'rating', 'year'].includes(q?.sort) ? q.sort : 'popular';
      const p = new URLSearchParams({ page: String(page), limit: String(limit), sort });
      if (sort === 'rating') p.set('order', 'desc');
      if (q?.genre) p.set('genre', String(q.genre));
      if (q?.status === 'ongoing') p.set('status', 'ongoing');
      const r = await aget('/api/anime?' + p, 120000);
      return { items: ((r && r.items) || []).map(compact).filter((x) => x.slug), page, total: Number(r?.total_count) || 0 };
    } catch { return { items: [], page: 1, total: 0, error: 'NETWORK' }; }
  });
};

const aoHandlers = {};
initAnimeon({ipcMain:{handle:(name,fn)=>{aoHandlers[name]=fn;}},getStore:()=>tvX(),saveStore:save});
const aoCall=(name,...args)=>aoHandlers['animeon:'+name](null,...args);

function aoCompactToTv(c) { return { id:'ao:'+c.slug, type:c.type, name:c.title, origin_name:c.titleOrig, poster:c.poster, year:c.year, kp_rating:c.kpRating||0, imdb_rating:c.imdbRating||0 }; }
window.lumaAnimeHome = async () => ((await aoCall('catalog', { sort:'popular', limit:20 })).items || []).map(aoCompactToTv);
window.lumaAnimeSuggestions = async lists => {const all=await Promise.all(lists.map(l=>aoCall('collection',l.url.slice(8)).then(c=>c?.items||[]).catch(()=>[]))),seen=new Set(),items=[];for(let i=0;i<300&&items.length<20;i++){let found=false;for(const list of all){const x=list[i];if(!x)continue;found=true;if(!x.slug||seen.has(x.slug)||wasOpened(x))continue;seen.add(x.slug);items.push(aoCompactToTv(x));if(items.length>=20)break;}if(!found)break;}return items;};
function aoFollowupsFor(ao,history,done,opened){
  if(!ao?.franchise||!ao.episodes?.length||!['released','finished'].includes(String(ao.status||'').toLowerCase()))return [];
  const final=Math.max(...ao.episodes.map(Number).filter(Number.isFinite));if(!Number.isFinite(final)||(ao.episodesTotal&&final<ao.episodesTotal)||!(done[history.id+':'+history.season]||[]).map(String).includes(String(final)))return [];
  const fr=ao.franchise,current=String(fr.currentId),next=new Set();for(const l of fr.links||[]){if(l.relation==='sequel'&&String(l.sourceId)===current)next.add(String(l.targetId));if(l.relation==='prequel'&&String(l.targetId)===current)next.add(String(l.sourceId));}
  return fr.nodes.filter(n=>next.has(String(n.id))&&n.slug&&n.inBase&&Number(n.eps)>0&&!opened({id:'ao:'+n.slug,slug:n.slug})).map(n=>({id:'ao:'+n.slug,name:n.name,poster:n.poster,year:n.year,type:n.kind==='movie'?6:7,kp_rating:n.score||0}));
}
window.lumaAnimeFollowups=async history=>{const candidates=history.filter(h=>h.season&&(h.aoSlug||String(h.id).startsWith('ao:'))).slice(0,8),all=await Promise.all(candidates.map(h=>aoCall('info',h.aoSlug||String(h.id).slice(3)).catch(()=>null))),seen=new Set(),result=[];for(let i=0;i<candidates.length;i++)for(const x of aoFollowupsFor(all[i],candidates[i],S.extra?.done||{},wasOpened))if(!seen.has(x.id)){seen.add(x.id);result.push(x);}return result;};
const tvAnimeRankCache = new Map();
async function tvAnimeRankMatch(item){
  const key=String(item.id),cached=tvAnimeRankCache.get(key);if(cached)return cached;
  const task=(async()=>{
    const norm=x=>String(x||'').toLowerCase().replace(/ё/g,'е').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
    const names=[item.name,item.origin_name].map(norm).filter(Boolean),year=Number(item.year)||0;if(!names.length||!year)return null;
    let found=[];for(const query of [...new Set([item.name,item.origin_name].filter(Boolean))]){
      const hits=await aoCall('search',query);for(const hit of hits){const y=Number(hit.year)||0;if(y&&Math.abs(y-year)<=1&&Number(hit.type)===Number(item.type)&&[hit.title,hit.titleOrig].map(norm).some(n=>n&&names.includes(n))&&!found.some(x=>x.slug===hit.slug))found.push(hit);}if(found.length>1)return null;
    }
    if(found.length!==1)return null;return {...aoCompactToTv(found[0]),kp_rating:Number(item.kp_rating)||0,imdb_rating:Number(item.imdb_rating)||0};
  })();tvAnimeRankCache.set(key,task);task.then(v=>{if(!v&&tvAnimeRankCache.get(key)===task)tvAnimeRankCache.delete(key);},()=>{if(tvAnimeRankCache.get(key)===task)tvAnimeRankCache.delete(key);});return task;
}
async function tvAnimeRank(sort,page=1){
  const raw=await catalog({cat:'anime_series,anime_films',sort,page,limit:24}),valid=raw.filter(x=>Number(x.views||0)>=(sort==='imdb'?30:5)&&Number(sort==='imdb'?x.imdb_rating:x.kp_rating)>0);
  const out=new Array(valid.length);let cursor=0;await Promise.all(Array.from({length:Math.min(4,valid.length)},async()=>{while(cursor<valid.length){const i=cursor++;out[i]=await tvAnimeRankMatch(valid[i]).catch(()=>null);}}));return out.filter(Boolean).map(x=>sort==='imdb'?{...x,kp_rating:0}:x);
}
async function renderAnimeHome(t) {
  const feeds=[['aoOngoing','Онгоинги',{status:'ongoing'}],['aoNew','Недавние завершённые релизы',{feed:'new'}],['aoRecent','Новые серии',{feed:'recent'}],['aoPopular','Популярное',{sort:'popular'}]];
  view.innerHTML='<div class="page tv-catalog-page">'+tvCatalogHeader('Аниме','Сериалы, фильмы и подборки AnimeOn.','ANIMEON')+'<div class="chips filters tv-catalog-toolbar"><button class="chip fl f" tabindex="-1" data-aogenres="1" data-k="ao:genres">Жанры ▾</button><button class="chip fl f" tabindex="-1" data-aocollections="1" data-k="ao:collections">Подборки сообщества</button><button class="chip fl f" tabindex="-1" data-aorandom="1" data-k="ao:random">Случайное аниме</button></div>'+feeds.map(([id,title])=>section(id,title).replace('</h2>', '</h2><button class="chip f" tabindex="-1" data-aofeed="'+id+'" data-k="list:'+id+'">Все ›</button>')).join('')+[['aoKp','Кинопоиску','kp'],['aoImdb','IMDb','imdb']].map(([id,title,sort])=>section(id,'Лучшее по '+title).replace('</h2>','</h2><button class="chip f" tabindex="-1" data-aorank="'+sort+'" data-k="rank:'+sort+'">Все ›</button>')).join('')+'</div>';
  const results=await Promise.all(feeds.map(([, , q])=>aoCall('catalog',{...q,limit:24}).catch(()=>({items:[]}))));
  if(!alive(t))return;
  results.forEach((r,i)=>fillRail(feeds[i][0],(r.items||[]).map(aoCompactToTv)));
  for(const [id,sort] of [['aoKp','kp'],['aoImdb','imdb']])tvAnimeRank(sort).then(items=>{if(alive(t))fillRail(id,items);}).catch(()=>{if(alive(t))document.getElementById(id)?.remove();});
  if(!view.querySelector('.card'))view.innerHTML='<div class="empty"><b>AnimeOn временно недоступен</b><span>Проверьте подключение к интернету.</span><button class="btn f" tabindex="-1" data-aoretry="1" data-k="ao:retry">Повторить</button></div>';
}

window.RENDER.animeRank=async(r,t)=>{
  const sort=r.sort==='imdb'?'imdb':'kp',page=Math.max(1,Number(r.page)||1),label=sort==='imdb'?'IMDb':'Кинопоиску';
  view.innerHTML=`<div class="page tv-catalog-page">${tvCatalogHeader('Аниме · по '+label,'Карточки AnimeOn, порядок по оценкам '+(sort==='imdb'?'IMDb':'Кинопоиска')+'.','ANIMEON')}<div class="grid" id="aoRankGrid">${skel(14)}</div><div class="chips" id="aoRankPages">${page>1?`<button class="chip f" tabindex="-1" data-rankpage="${page-1}" data-k="rank:prev">‹ Назад</button>`:''}<button class="chip f" tabindex="-1" data-rankpage="${page+1}" data-k="rank:next">Следующая страница ›</button></div></div>`;
  try{const items=await tvAnimeRank(sort,page);if(!alive(t))return;$('#aoRankGrid').innerHTML=items.length?items.map((x,i)=>cardHTML(x,'aorank:'+i,{orig:true})).join(''):'<div class="empty" style="grid-column:1/-1">На этой странице нет однозначных совпадений с AnimeOn.</div>';hookImages($('#aoRankGrid'));}catch{if(alive(t)){$('#aoRankGrid').innerHTML='<div class="empty" style="grid-column:1/-1"><b>Рейтинг временно недоступен</b><button class="btn f" tabindex="-1" data-aoretry="1" data-k="ao:retry">Повторить</button></div>';$('#aoRankPages').classList.add('hidden');}}
};
document.addEventListener('click',e=>{const rank=e.target.closest('[data-aorank]');if(rank){go('animeRank',{sort:rank.dataset.aorank,page:1});return;}const page=e.target.closest('[data-rankpage]');if(page&&route.name==='animeRank')show({...route,page:Number(page.dataset.rankpage)},{scroll:0});});

let aoGenreOptions=[],aoGenreSelected=new Set(),aoGenreKind='anime';
async function tvChooseAnimeGenres(kind='anime'){
 aoGenreKind=kind;const returnKey=document.activeElement?.dataset.k||'',selected=String(route.genre||'').split(',').filter(Boolean);aoGenreSelected=new Set(selected);dlg('<h3>'+(kind==='anime'?'Жанры аниме':'Жанры')+'</h3><p class="sub">Выберите один или несколько жанров.</p><div class="ao-genre-options" id="aoGenreOptions"><div class="spin"></div></div><div class="ao-genre-actions"><button class="btn f" tabindex="-1" data-ag-clear="1" data-k="ag:clear">Сбросить</button><button class="btn f" tabindex="-1" data-ag-cancel="1" data-k="ag:cancel">Отмена</button><button class="btn primary f" tabindex="-1" data-ag-apply="1" data-k="ag:apply">Показать</button></div>');$('#modal').dataset.returnGenre=returnKey;const actions=$('.ao-genre-actions');actions.onkeydown=e=>{if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight')return;const buttons=[...actions.querySelectorAll('button')],i=buttons.indexOf(document.activeElement),next=i+(e.key==='ArrowRight'?1:-1);if(i>=0&&buttons[next]){e.preventDefault();e.stopPropagation();buttons[next].focus({preventScroll:true});}};const target=$('#aoGenreOptions');let result;try{result=kind==='anime'?await aoCall('genres'):{items:GENRES};}catch{result={error:'NETWORK'};}if(!target?.isConnected||$('#modal').classList.contains('hidden')||$('#aoGenreOptions')!==target)return;if(result.error||!result.items?.length){target.innerHTML='<p class="sub">Не удалось загрузить жанры. Закройте окно и попробуйте ещё раз.</p>';return;}aoGenreOptions=[...new Set([...selected,...result.items])];target.innerHTML=aoGenreOptions.map((g,i)=>`<button class="chip f ${aoGenreSelected.has(g)?'on':''}" tabindex="-1" data-ag-toggle="${i}" data-k="ag:${i}" aria-pressed="${aoGenreSelected.has(g)}">${esc(g)}</button>`).join('');target.querySelector('.f')?.focus({preventScroll:true});
}
const AO_FEEDS = {aoOngoing:{status:'ongoing'},aoNew:{feed:'new'},aoRecent:{feed:'recent'},aoPopular:{sort:'popular'}};
window.RENDER = window.RENDER || {};
window.RENDER.animeList = async (r,t) => {
  const q=AO_FEEDS[r.feed] || {sort:'popular'}, genre=r.genre||'', page=Math.max(1,Number(r.page)||1);
  const feedTitle={aoOngoing:'Онгоинги',aoNew:'Недавние завершённые релизы',aoRecent:'Новые серии',aoPopular:'Популярное'}[r.feed]||'Аниме';
  view.innerHTML='<div class="page tv-catalog-page">'+tvCatalogHeader(genre?tvGenreSummary(genre):feedTitle,'Аниме из каталога AnimeOn.','ANIMEON')+'<div class="chips filters tv-catalog-toolbar"><button class="chip f" tabindex="-1" data-aogenres="1" data-k="ao:genres">Жанры'+(genre?' · '+esc(tvGenreSummary(genre)):' · все')+'</button></div><div class="grid" id="aoGrid">'+skel(14)+'</div><div class="chips" id="aoPages"></div></div>';
  let data;try{data=await aoCall('catalog',{...q,genre,page,limit:48});}catch{data={error:'NETWORK'};}if(!alive(t))return;
  const grid=$('#aoGrid'), items=(data.items||[]).map(aoCompactToTv);
  if(data.error){grid.innerHTML='<div class="empty" style="grid-column:1/-1"><b>Не удалось загрузить аниме</b><span>Проверьте соединение и попробуйте снова.</span><button class="btn f" tabindex="-1" data-aoretry="1" data-k="ao:retry">Повторить</button></div>';return;}
  grid.innerHTML=items.length?items.map(x=>cardHTML(x,'aolist:'+x.id,{orig:true})).join(''):'<div class="empty" style="grid-column:1/-1">Ничего не найдено</div>';hookImages(grid);
  const nav=$('#aoPages');if(nav)nav.innerHTML=(page>1?'<button class="chip f" tabindex="-1" data-aopage="'+(page-1)+'" data-k="ao:prev">‹ Предыдущая</button>':'')+(items.length===48&&(!data.total||page*48<data.total)?'<button class="chip f" tabindex="-1" data-aopage="'+(page+1)+'" data-k="ao:next">Следующая страница ›</button>':'');
};
document.addEventListener('click', e=>{const el=e.target.closest('.f');if(!el)return;
  if(el.dataset.aoretry){show(route);return;}
  if(el.dataset.aofeed)go('animeList',{feed:el.dataset.aofeed,page:1});
  if(el.dataset.aopage)show({name:'animeList',feed:route.feed,genre:route.genre,page:Number(el.dataset.aopage)},{scroll:0});
  if(el.dataset.aogenres){tvChooseAnimeGenres();return;}
  if(el.dataset.agToggle!==undefined){const g=aoGenreOptions[Number(el.dataset.agToggle)];if(!g)return;aoGenreSelected.has(g)?aoGenreSelected.delete(g):aoGenreSelected.add(g);el.classList.toggle('on',aoGenreSelected.has(g));el.setAttribute('aria-pressed',String(aoGenreSelected.has(g)));return;}
  if(el.dataset.agClear){aoGenreSelected.clear();$$('[data-ag-toggle]',$('#modal')).forEach(b=>{b.classList.remove('on');b.setAttribute('aria-pressed','false');});return;}
  if(el.dataset.agCancel){closeDlg();return;}
  if(el.dataset.agApply){const genre=[...aoGenreSelected].join(',');closeDlg();if(aoGenreKind==='anime')go('animeList',{genre,page:1});else show({...route,genre},{scroll:0});return;}
});

window.RENDER.animeCollections = async (r,t) => {
  const page=Math.max(1,Number(r.page)||1),query=String(r.query||'').trim().slice(0,100),sort=r.sort==='new'?'new':'popular',tag=/^[a-z0-9-]{1,80}$/.test(String(r.tag||''))?r.tag:'';
  view.innerHTML=`<div class="page tv-catalog-page">${tvCatalogHeader('Подборки сообщества','Коллекции и темы зрителей AnimeOn.','ANIMEON')}<div class="chips filters tv-catalog-toolbar"><button class="chip fl f" tabindex="-1" data-aocolfilter="query" data-k="collections:query"><small>Поиск</small>${esc(query||'Название подборки')}<i>⌕</i></button><button class="chip fl f" tabindex="-1" data-aocolfilter="tag" data-k="collections:tag"><small>Тема</small>${esc(r.tagLabel||'Все темы')}<i>▾</i></button><button class="chip fl f" tabindex="-1" data-aocolfilter="sort" data-k="collections:sort"><small>Сортировка</small>${sort==='new'?'Новые':'Популярные'}<i>▾</i></button></div>${query?'<p class="sub">Поиск по названию: тема и сортировка не применяются.</p>':''}<div id="aoCollections" class="grid">${skel(12)}</div></div>`;
  const result=await aoCall('collections',{page,query,sort,tag}).catch(()=>null)||{error:'NETWORK'};if(!alive(t))return;const grid=$('#aoCollections');
  grid.innerHTML=(result.items||[]).map(c=>{const poster=c.covers?.find(x=>x.poster)?.poster||'';return `<div class="card f" tabindex="-1" data-aocollection="${esc(c.slug)}" data-k="collection:${esc(c.slug)}"><div class="poster">${poster?`<img decoding="async" src="${esc(poster)}" alt="">`:''}<div class="ph">Подборка AnimeOn</div></div><div class="t">${esc(c.title)}</div><div class="s">${Number(c.count)||0} тайтлов${c.author?' · '+esc(c.author):''}</div></div>`}).join('');
  if(!result.items?.length)grid.innerHTML=result.error?'<div class="empty"><b>Не удалось загрузить подборки</b><span>Проверьте соединение и попробуйте снова.</span><button class="btn f" tabindex="-1" data-aoretry="1" data-k="collections:retry">Повторить</button></div>':'<div class="empty">Подходящих подборок не нашлось</div>';
  const nav=(page>1?`<button class="chip f" tabindex="-1" data-aocolpage="${page-1}" data-k="collections:prev">‹ Предыдущая</button>`:'')+(page*24<Number(result.total)?`<button class="chip f" tabindex="-1" data-aocolpage="${page+1}" data-k="collections:next">Следующая страница ›</button>`:'');if(nav)grid.insertAdjacentHTML('afterend',`<div class="chips">${nav}</div>`);hookImages(grid);
};
window.RENDER.animeCollection = async (r,t) => {
  view.innerHTML='<div class="page"><div class="empty"><div class="spin"></div></div></div>';const c=await aoCall('collection',r.slug).catch(()=>({error:'NETWORK'}));if(!alive(t))return;
  if(!c||c.error){view.innerHTML='<div class="empty"><b>Не удалось открыть подборку</b><span>Проверьте соединение и попробуйте снова.</span><button class="btn f" tabindex="-1" data-aoretry="1" data-k="collection:retry">Повторить</button></div>';return;}
  if(!c.items?.length){view.innerHTML='<div class="empty">Подборка недоступна или пуста</div>';return;}
  const url='animeon:'+c.slug;let unseen=false;const saved=()=>savedLists().some(x=>x.url===url),opened=c.items.filter(wasOpened).length;
  view.innerHTML=`<div class="page"><div class="lhead tv-collection-head"><div class="tv-collection-copy"><div class="person-kicker">ПОДБОРКА · ANIMEON</div><h1 class="pname">${esc(c.title)}</h1><div class="meta"><span>от ${esc(c.author||'сообщества')}</span><span>•</span><span>${c.items.length} тайтлов</span><span>•</span><span>Открывали ${opened} из ${c.items.length}</span></div>${c.desc?`<div class="tv-collection-description"><p class="ldesc">${esc(c.desc)}</p>${c.desc.length>140?'<button class="chip f tv-collection-more" tabindex="-1" data-collection-more="1" data-k="collection:more" aria-expanded="false">Читать полностью</button>':''}</div>`:''}</div><div class="btns tv-collection-actions"><button class="btn f ${saved()?'on':''}" tabindex="-1" data-aosave="1" data-k="ao:save">${saved()?'В сохранённых':'Сохранить'}</button><button class="btn f" tabindex="-1" data-aounseen="1" data-k="ao:unseen" aria-pressed="false">Только не открывавшиеся</button><button class="btn f" tabindex="-1" data-aorelated="1" data-k="ao:related">Что посмотреть похожего</button></div></div><div id="aoRelated"></div><div class="grid" id="aoCollectionGrid"></div></div>`;
  const paint=()=>{const items=c.items.filter(x=>!unseen||!wasOpened(x));$('#aoCollectionGrid').innerHTML=items.length?items.map(x=>cardHTML(aoCompactToTv(x),'col:'+x.slug,{orig:true,sub:wasOpened(x)?'Открывали':''})).join(''):'<div class="empty">Нет неоткрытых тайтлов</div>';hookImages($('#aoCollectionGrid'));};paint();
  $('[data-aosave]').onclick=e=>{const a=savedLists(),i=a.findIndex(x=>x.url===url);if(i>=0){markListRemoved(url);a.splice(i,1);}else a.unshift({url,source:'animeon',title:c.title,author:c.author,count:c.items.length,desc:(c.desc||'').slice(0,160),names:c.items.slice(0,3).map(x=>x.title),at:listSavedAt(url)});save();e.currentTarget.classList.toggle('on',i<0);e.currentTarget.textContent=i<0?'В сохранённых':'Сохранить';toast(i<0?'Подборка сохранена':'Подборка убрана');};
  $('[data-aounseen]').onclick=e=>{unseen=!unseen;e.currentTarget.classList.toggle('on',unseen);e.currentTarget.setAttribute('aria-pressed',String(unseen));paint();};
  $('[data-aorelated]').onclick=async e=>{
    const trigger=e.currentTarget,out=$('#aoRelated');if(trigger.dataset.busy)return;trigger.dataset.busy='1';trigger.setAttribute('aria-busy','true');out.innerHTML='<div class="empty"><div class="spin"></div></div>';
    try{
      const count=Math.min(8,c.items.length),sample=Array.from({length:count},(_,i)=>c.items[Math.floor(i*c.items.length/count)]);
      const details=await Promise.all(sample.map(x=>aoCall('info',x.slug).catch(()=>null)));if(!alive(t))return;
      const genres=new Map();for(const title of details)for(const genre of new Set((title?.genres||[]).filter(x=>typeof x==='string'&&x.trim()).map(x=>x.trim())))genres.set(genre,(genres.get(genre)||0)+1);
      const selected=[...genres].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'ru')).slice(0,2).map(x=>x[0]);
      const responses=await Promise.all(selected.map(genre=>aoCall('catalog',{page:1,limit:30,sort:'popular',genre}).catch(()=>({items:[]}))));if(!alive(t))return;
      const excluded=new Set(c.items.map(x=>x.slug)),matched=new Map();
      for(const response of responses)for(const item of response.items||[]){if(!item.slug||excluded.has(item.slug)||wasOpened(item))continue;const score=(item.genres||[]).reduce((sum,genre)=>sum+(genres.get(genre)||0),0);if(!matched.has(item.slug)||matched.get(item.slug).score<score)matched.set(item.slug,{item,score});}
      const items=[...matched.values()].sort((a,b)=>b.score-a.score).slice(0,18).map(x=>x.item);
      out.innerHTML=items.length?`<section class="sec"><h2>Похоже на эту подборку</h2><p class="sub">По жанрам ${selected.map(esc).join(' и ')}. Уже открытые тайтлы и сама подборка исключены.</p><div class="grid">${items.map(x=>cardHTML(aoCompactToTv(x),'related:'+x.slug,{orig:true})).join('')}</div></section>`:'<p class="sub">Похожие тайтлы не найдены. Попробуйте позже.</p>';
      hookImages(out);
    }catch{if(alive(t))out.innerHTML='<p class="sub">Не удалось найти похожие тайтлы. Попробуйте позже.</p>';}
    finally{delete trigger.dataset.busy;trigger.removeAttribute('aria-busy');}
  };
};
document.addEventListener('click',async e=>{const el=e.target.closest('.f');if(!el)return;
  if(el.dataset.aocollections)go('animeCollections',{page:1});
  if(el.dataset.aocolpage)show({...route,name:'animeCollections',page:Number(el.dataset.aocolpage)},{scroll:0});
  if(el.dataset.aocolfilter&&route.name==='animeCollections'){
    const action=el.dataset.aocolfilter,current={...route,name:'animeCollections'},refresh=patch=>show({...current,...patch,page:1},{scroll:0,focus:'collections:'+action});
    if(action==='query')inputDlg({title:'Поиск подборок',sub:'Введите название подборки AnimeOn',ok:'Найти',fields:[{id:'query',label:'Название',value:current.query||'',placeholder:'Например, приключения'}],onOk:async({query})=>{refresh({query:query.slice(0,100),tag:'',tagLabel:''});return null;}});
    else if(action==='sort')pickDlg('Сортировка',[{v:'popular',label:'Популярные'},{v:'new',label:'Новые'}].map(x=>({...x,on:(current.sort||'popular')===x.v})),o=>refresh({sort:o.v,query:''}));
    else if(action==='tag'){
      if(el.dataset.busy)return;el.dataset.busy='1';const token=renderToken;const result=await aoCall('collection-tags').catch(()=>null);delete el.dataset.busy;if(!alive(token)||route.name!=='animeCollections')return;
      if(!result?.tags?.length){toast('Темы пока недоступны');return;}
      const groups=[['all','Все темы'],['themes','Темы'],['genres','Жанры'],['formats','Форматы']];
      pickDlg('Выберите группу',groups.map(([v,label])=>({v,label,on:v==='all'&&!current.tag})),o=>{if(o.v==='all'){refresh({tag:'',tagLabel:'',query:''});return;}const tags=result.tags.filter(x=>x.group===o.v);if(!tags.length){toast('Темы этой группы пока недоступны');return;}pickDlg(o.label,tags.map(x=>({v:x.slug,label:x.label+' · '+x.count,on:current.tag===x.slug})),x=>refresh({tag:x.v,tagLabel:tags.find(y=>y.slug===x.v)?.label||'',query:''}));});
    }
    return;
  }
  if(el.dataset.aocollection)go('animeCollection',{slug:el.dataset.aocollection});
  if(el.dataset.aorandom){if(el.dataset.busy)return;el.dataset.busy='1';const viewed=new Set([...S.history,...S.favs].map(x=>String(x.id)));let pick=null;for(let i=0;i<6;i++){let x=await aoCall('random');if(x?.slug&&!viewed.has('ao:'+x.slug)){pick=x;break;}}delete el.dataset.busy;if(pick)go('details',{id:'ao:'+pick.slug});else toast('Не удалось подобрать новое аниме');}
});
