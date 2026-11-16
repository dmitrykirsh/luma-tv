'use strict';
// Проверка выполняется только при запуске и по запросу пользователя.
const tvNotices = () => {
  const x = S.extra ||= {};
  if (!x.notifications || typeof x.notifications !== 'object') x.notifications = { snapshot:{}, items:[] };
  const n = x.notifications;
  if (!n.snapshot || typeof n.snapshot !== 'object') n.snapshot = {};
  if (!Array.isArray(n.items)) n.items = [];
  return n;
};
let tvNoticeChecking = false, tvNoticeFailures = [];
const premiereDay = date => {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date||'')))return null;
  const [y,m,d]=date.split('-').map(Number),day=new Date(y,m-1,d);
  return day.getFullYear()===y&&day.getMonth()===m-1&&day.getDate()===d?day.getTime():null;
};
const premiereToday = () => {const d=new Date();d.setHours(0,0,0,0);return d.getTime();};
const tvPremieres = () => {const x=S.extra||={};return Array.isArray(x.trackedPremieres)?x.trackedPremieres:(x.trackedPremieres=[]);};
const tmMovie = x => ({id:Number(x.id),title:String(x.title||x.original_title||''),origin:String(x.original_title||''),date:String(x.release_date||''),poster:String(x.poster_path||''),overview:String(x.overview||'')});
window.updateNoticeBadge = () => {
  const badge=$('#noticeCount');if(!badge)return;
  const count=tvNotices().items.filter(x=>!x.read).length;
  badge.hidden=!count;badge.textContent=count>99?'99+':String(count);
};
function tvNoticeAdd(state,item) {
  if(!state.items.some(x=>x.id===item.id))state.items.unshift({...item,at:Date.now(),read:false});
}
async function tvSeriesSchedule(item){
  const names=[item.name,item.origin_name].map(nrm).filter(Boolean),hits=new Map(),year=Number(item.year)||0;if(!names.length)return null;
  for(const q of [...new Set([item.name,item.origin_name].filter(Boolean))]){const r=await tmdb('/search/tv',{query:q});for(const x of r.results||[]){if(![x.name,x.original_name].map(nrm).some(n=>n&&names.includes(n)))continue;const y=Number(String(x.first_air_date||'').slice(0,4))||0;if(year&&(!y||Math.abs(y-year)>1))continue;hits.set(x.id,x);}}
  if(hits.size!==1)return null;const details=await tmdb('/tv/'+[...hits.keys()][0],{},true),ep=details.next_episode_to_air;
  if(!ep)return {none:true};const day=premiereDay(ep.air_date);if(day===null||!Number.isInteger(ep.season_number)||!Number.isInteger(ep.episode_number))return null;
  return {date:ep.air_date,season:ep.season_number,episode:ep.episode_number};
}
function tvUpcoming(){
  const state=tvNotices(),out=[],seen=new Set();for(const item of [...(S.favs||[]),...(S.history||[])]){
    const slug=item.aoSlug||(String(item.id).startsWith('ao:')?String(item.id).slice(3):''),id=slug?'ao:'+slug:Number(item.routeId||item.id),key=String(id);if(seen.has(key))continue;seen.add(key);
    if(slug){const at=Date.parse(state.snapshot['air:'+slug]||'');if(Number.isFinite(at)&&at>Date.now())out.push({item:{...item,id},at,source:'AnimeOn',label:new Date(at).toLocaleString('ru-RU',{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'})+' · эфир AnimeOn'});}
    else {const s=state.snapshot['schedule:luma:'+id],at=premiereDay(s?.date);if(at!==null&&at>=premiereToday())out.push({item:{...item,id},at,source:'TMDB',label:new Date(at).toLocaleDateString('ru-RU',{day:'numeric',month:'long'})+' · '+s.season+'×'+s.episode+' · эфир по TMDB'});}
  }return out.sort((a,b)=>a.at-b.at);
}
window.updateHomeUpcoming=()=>{const root=$('#homeUpcoming');if(!root||route.name!=='home')return;const items=tvUpcoming();root.innerHTML=items.length?section('rUpcoming','Скоро: новые серии из библиотеки'):'';if(items.length)fillRail('rUpcoming',items.map(x=>x.item),{each:it=>({sub:items.find(x=>String(x.item.id)===String(it.id))?.label||''})});};
async function tvCheckNotices(manual = false) {
  if(tvNoticeChecking)return;tvNoticeChecking=true;
  const check=$('[data-noticecheck]');if(check)check.textContent='Проверяем…';
  const state=tvNotices(), queue=new Map();
  for(const item of [...(S.favs||[]),...(S.history||[])]){
    const slug=item.aoSlug||(String(item.id).startsWith('ao:')?String(item.id).slice(3):'');
    if(slug)queue.set('ao:'+slug,{item,slug});
    else if([3,4,5].includes(Number(item.type))&&Number.isSafeInteger(Number(item.id))&&Number(item.id)>0)queue.set('luma:'+item.id,{item});
  }
  for(const item of tvPremieres())if(Number.isSafeInteger(Number(item.id))&&Number(item.id)>0)queue.set('premiere:tmdb:'+item.id,{premiere:item});
  const entries=[...queue.entries()];let cursor=0;const failures=[];
  const worker=async()=>{while(cursor<entries.length){const [key,entry]=entries[cursor++];try{
    if(entry.premiere){
      const item=entry.premiere,original=Number(item.id),result=await tmdb('/movie/'+original,{},true),next=tmMovie(result),nextDay=premiereDay(next.date);
      if(!tvPremieres().some(x=>Number(x.id)===original)||nextDay===null)continue;
      const previous=state.snapshot[key],oldDate=previous?.date||item.date,oldDay=premiereDay(oldDate),today=premiereToday();
      if(oldDay!==null&&oldDay<=today&&nextDay<=oldDay)tvNoticeAdd(state,{id:key+':'+oldDate,premiereId:original,title:next.title||item.title,poster:item.poster?TMI(item.poster,'w342'):'',text:'Наступила дата премьеры по TMDB. Доступность для просмотра может отличаться.'});
      state.snapshot[key]={date:next.date,checkedAt:Date.now()};item.date=next.date;continue;
    }
    const data=entry.slug?await aoCall('info',entry.slug,true):await info(Number(entry.item.id));
    if(!data||(!entry.slug&&(!data.episodes||typeof data.episodes!=='object'||Array.isArray(data.episodes))))throw Error('unavailable');
    const episodes=entry.slug?[...new Set([...(data.episodes||[]),...(data.selfHosted?.episodes||[])].map(Number).filter(n=>Number.isInteger(n)&&n>0))].sort((a,b)=>a-b):Object.entries(data.episodes||{}).flatMap(([season,list])=>Array.isArray(list)?list.map(ep=>season+':'+ep):[]);
    const previous=state.snapshot[key], title=data.title||data.name||entry.item.name,poster=data.poster||entry.item.poster||'',id=entry.slug?'ao:'+entry.slug:Number(entry.item.id);
    if(episodes.length||!Array.isArray(previous)){
      if(Array.isArray(previous)){const seen=new Set(previous.map(String)),added=episodes.filter(ep=>!seen.has(String(ep)));if(added.length)tvNoticeAdd(state,{id:key+':'+added.map(String).join(','),routeId:id,title,poster,text:(entry.slug?'Новые серии AnimeOn: ':'Новые серии: ')+added.map(x=>String(x).replace(':','×')).join(', ')});}
      state.snapshot[key]=episodes;
    }
    if(entry.slug){const airKey='air:'+entry.slug,old=state.snapshot[airKey],oldTime=Date.parse(old||''),next=data.nextEpisodeAt||'',nextTime=Date.parse(next),now=Date.now();
      const postponed=Number.isFinite(nextTime)&&nextTime>now&&nextTime>oldTime;
      if(Number.isFinite(oldTime)&&oldTime<=now&&!postponed)tvNoticeAdd(state,{id:airKey+':'+old,routeId:id,title,poster,text:'Наступила дата эфира следующей серии. Озвучка может появиться позже.'});
      state.snapshot[airKey]=Number.isFinite(nextTime)&&nextTime>now?next:(Number.isFinite(oldTime)&&oldTime>now?old:'');
    }else {try{const scheduleKey='schedule:luma:'+entry.item.id,old=state.snapshot[scheduleKey],oldDay=premiereDay(old?.date),next=await tvSeriesSchedule(entry.item);if(next){const nextDay=premiereDay(next.date),same=!next.none&&String(old?.season)===String(next.season)&&String(old?.episode)===String(next.episode),moved=same&&nextDay!==null&&oldDay!==null&&nextDay>oldDay;if(oldDay!==null&&oldDay<=premiereToday()&&!moved)tvNoticeAdd(state,{id:scheduleKey+':'+old.date+':'+old.season+':'+old.episode,routeId:Number(entry.item.id),title,poster,text:'Наступил день эфира серии '+old.season+'×'+old.episode+' по TMDB. Время и наличие озвучки могут отличаться.'});state.snapshot[scheduleKey]=!next.none&&nextDay!==null&&nextDay>=premiereToday()?{...next,checkedAt:Date.now()}:{none:true,checkedAt:Date.now()};}}catch{}}
  }catch{failures.push({title:String(entry.premiere?.title||entry.item?.name||'Тайтл'),source:entry.premiere?'TMDB':entry.slug?'AnimeOn':'Luma'});}}};
  try{await Promise.all(Array.from({length:Math.min(3,entries.length)},()=>worker()));state.items=state.items.slice(0,200);state.checkedAt=Date.now();save();updateNoticeBadge();if(window.updateHomeUpcoming)window.updateHomeUpcoming();}
  finally{tvNoticeFailures=failures;tvNoticeChecking=false;if(route.name==='notifications')show(route,{scroll:view.scrollTop,focus:'notice:check'});}
  if(manual&&failures.length)toast('Не удалось проверить: '+failures.length+' · подробности в уведомлениях');
}
window.RENDER.notifications = () => {
  const n=tvNotices(),unread=n.items.filter(x=>!x.read).length;
  const air=tvUpcoming(),airRows=air.length?'<h3 class="notice-section">Ближайшие серии</h3><div class="notice-list">'+air.map(x=>`<button class="notice-row f" tabindex="-1" data-upcoming="${esc(x.item.id)}" data-k="upcoming:${esc(x.item.id)}"><span class="notice-art">${x.item.poster?`<img src="${esc(x.item.poster)}" alt="">`:ico('film')}</span><span class="notice-copy"><b>${esc(x.item.name)}</b><span>${esc(x.label)}</span></span></button>`).join('')+'</div>':'';
  const upcoming=tvPremieres().filter(x=>premiereDay(x.date)!==null&&premiereDay(x.date)>=premiereToday()).sort((a,b)=>premiereDay(a.date)-premiereDay(b.date));
  const premieres=upcoming.length?'<h3 class="notice-section">Ближайшие премьеры</h3><div class="notice-list">'+upcoming.map(x=>`<button class="notice-row f" tabindex="-1" data-premiere="${Number(x.id)}" data-k="premiere:${Number(x.id)}"><span class="notice-art">${x.poster?`<img src="${esc(TMI(x.poster,'w342'))}" alt="">`:ico('film')}</span><span class="notice-copy"><b>${esc(x.title)}</b><span>${esc(new Date(premiereDay(x.date)).toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'}))} · премьера по TMDB</span></span></button>`).join('')+'</div>':'';
  const tvReminders=tvActiveReminders(),tvReminderRows=tvReminders.length?'<h3 class="notice-section">Напоминания о передачах</h3><div class="notice-list">'+tvReminders.map((x,i)=>`<button class="notice-row f" tabindex="-1" data-tv-reminder-remove="${i}" data-k="notice:tv-reminder:${i}"><span class="notice-art">${ico('live')}</span><span class="notice-copy"><b>${esc(x.title)}</b><span>${esc(x.channelName)} · ${esc(new Date(x.startsAt).toLocaleString('ru-RU',{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'}))}</span><small>Отменить напоминание</small></span></button>`).join('')+'</div>':'';
  const rows=n.items.map((x,i)=>`<button class="notice-row f" tabindex="-1" data-notice="${i}" data-k="notice:${esc(x.id)}"><span class="notice-art">${x.poster?`<img src="${esc(x.poster)}" alt="">`:ico('bell')}</span><span class="notice-copy"><b>${esc(x.title)}</b><span>${esc(x.text)}</span><small>${esc(new Date(x.at).toLocaleDateString('ru-RU'))}</small></span>${x.read?'':'<i class="notice-dot"></i>'}</button>`).join('');
  const failures=tvNoticeFailures.length?'<p class="sub">Не удалось проверить: '+tvNoticeFailures.map(x=>esc(x.title)+' ('+esc(x.source)+')').join(', ')+'. Попробуйте повторить проверку позже.</p>':'';
  view.innerHTML=`<div class="page notice-page"><div class="notice-heading"><div><h2>Уведомления</h2><p class="sub">Новые серии и премьеры из вашей библиотеки</p></div><div class="notice-actions">${unread?'<button class="btn f" tabindex="-1" data-noticereadall="1" data-k="notice:readall">Прочитать все · '+unread+'</button>':''}<button class="btn f" tabindex="-1" data-premieresearch="1" data-k="premiere:search">Отслеживать фильм</button><button class="btn f" tabindex="-1" data-noticecheck="1" data-k="notice:check">${tvNoticeChecking?'Проверяем…':'Проверить сейчас'}</button></div></div>${failures}${airRows}${premieres}${tvReminderRows}${rows?'<h3 class="notice-section">Новые события</h3><div class="notice-list">'+rows+'</div>':upcoming.length||air.length||tvReminders.length?'':'<div class="notice-empty"><span>'+ico('bell')+'</span><h3>Пока новых уведомлений нет</h3><p>Здесь появятся новости о сериалах и премьерах из вашей библиотеки.</p></div>'}</div>`;
};
document.addEventListener('click',e=>{const remove=e.target.closest('[data-tv-reminder-remove]');if(remove){const item=tvActiveReminders()[Number(remove.dataset.tvReminderRemove)];if(item){sportRemoveReminder(item);show(route,{focus:'notice:check'});}return;}if(e.target.closest('[data-noticereadall]')){for(const n of tvNotices().items)n.read=true;save();updateNoticeBadge();show(route,{scroll:view.scrollTop,focus:'notice:check'});return;}const check=e.target.closest('[data-noticecheck]');if(check){tvCheckNotices(true);return;}if(e.target.closest('[data-premieresearch]')){go('premiereSearch');return;}const upcoming=e.target.closest('[data-upcoming]');if(upcoming){const id=upcoming.dataset.upcoming;go('details',{id:id.startsWith('ao:')?id:Number(id)});return;}const premiere=e.target.closest('[data-premiere]');if(premiere){go('premiere',{id:Number(premiere.dataset.premiere)});return;}const row=e.target.closest('[data-notice]');if(!row)return;const n=tvNotices().items[Number(row.dataset.notice)];if(!n)return;n.read=true;save();updateNoticeBadge();if(n.tvReminder)window.tvOpenReminder(n.tvReminder);else if(n.sportReminder)show({name:'sport',panel:'calendar',league:n.sportReminder.league,date:n.sportReminder.date});else if(n.premiereId)go('premiere',{id:Number(n.premiereId)});else if(n.routeId)go('details',{id:n.routeId});});
let premiereSearchSeq=0,premiereDrafts=new Map();
window.RENDER.premiereSearch = (_,token) => {
  view.innerHTML='<div class="page notice-page"><div class="notice-heading"><div><h2>Отслеживать премьеру</h2><p class="sub">Найдите фильм по названию в TMDB</p></div></div><div class="notice-search"><input class="f" id="premiereQuery" data-k="premiere:q" tabindex="-1" placeholder="Название фильма" autocomplete="off" enterkeyhint="search"></div><div id="premiereResults" class="notice-list"><p class="sub">Нажмите OK, чтобы ввести название.</p></div></div>';
  const input=$('#premiereQuery');let timer;
  const run=async()=>{const q=input.value.trim(),seq=++premiereSearchSeq;if(q.length<2)return;const box=$('#premiereResults');box.innerHTML='<div class="empty"><div class="spin"></div></div>';try{const j=await tmdb('/search/movie',{query:q});if(!alive(token)||seq!==premiereSearchSeq)return;const items=(j.results||[]).map(tmMovie).filter(x=>x.id>0&&x.title&&premiereDay(x.date)!==null&&premiereDay(x.date)>=premiereToday()).slice(0,20);for(const item of items)premiereDrafts.set(item.id,item);box.innerHTML=items.length?items.map(x=>`<button class="notice-row f" tabindex="-1" data-premiere="${x.id}" data-k="premiere:${x.id}"><span class="notice-art">${x.poster?`<img src="${esc(TMI(x.poster,'w342'))}" alt="">`:ico('film')}</span><span class="notice-copy"><b>${esc(x.title)}</b><span>${esc(new Date(premiereDay(x.date)).toLocaleDateString('ru-RU'))} · TMDB</span></span></button>`).join(''):'<p class="sub">Будущих премьер по этому названию не найдено.</p>';}catch{if(alive(token)&&seq===premiereSearchSeq)box.innerHTML='<p class="sub">Не удалось загрузить результаты. Попробуйте позже.</p>';}};
  input.oninput=()=>{clearTimeout(timer);timer=setTimeout(run,450);};input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();clearTimeout(timer);run().then(()=>{if(alive(token))$('#premiereResults .f')?.focus({preventScroll:true});});}};input.focus({preventScroll:true});
};
window.RENDER.premiere = async (r,token) => {
  const id=Number(r.id);if(!Number.isSafeInteger(id)||id<=0){view.innerHTML='<div class="empty">Фильм не найден</div>';return;}
  const saved=()=>tvPremieres().find(x=>Number(x.id)===id);view.innerHTML='<div class="empty"><div class="spin"></div></div>';
  let item;try{item=tmMovie(await tmdb('/movie/'+id));}catch{item=saved()||premiereDrafts.get(id);}if(!alive(token))return;
  if(!item){view.innerHTML='<div class="empty">Не удалось загрузить фильм</div>';return;}
  const day=premiereDay(item.date),date=day===null?'Дата неизвестна':new Date(day).toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'});
  view.innerHTML=`<div class="page notice-page premiere-page"><div class="premiere-poster">${item.poster?`<img src="${esc(TMI(item.poster,'w500'))}" alt="">`:ico('film')}</div><div class="premiere-info"><span class="premiere-label">ПРЕМЬЕРА · TMDB</span><h2>${esc(item.title)}</h2>${item.origin&&item.origin!==item.title?`<p class="sub">${esc(item.origin)}</p>`:''}<p><b>${esc(date)}</b> · дата премьеры по TMDB</p><p class="sub">Доступность для просмотра может отличаться от даты премьеры.</p>${item.overview?`<p class="premiere-overview">${esc(item.overview)}</p>`:''}<div class="notice-actions"><button class="btn primary f" tabindex="-1" data-premieretoggle="1" data-k="premiere:toggle">${saved()?'Не отслеживать':'Отслеживать'}</button><button class="btn f" tabindex="-1" data-premierelookup="1" data-k="premiere:lookup">Найти в Luma</button></div><p class="sub" id="premiereStatus"></p></div></div>`;
  const toggle=$('[data-premieretoggle]');if(!saved()&&(day===null||day<premiereToday())){toggle.disabled=true;toggle.classList.remove('f');}
  toggle.onclick=()=>{if(saved()){S.extra.trackedPremieres=tvPremieres().filter(x=>Number(x.id)!==id);delete tvNotices().snapshot['premiere:tmdb:'+id];toast('Отслеживание отключено');}else{if(tvPremieres().length>=100){toast('Можно отслеживать до 100 премьер');return;}tvPremieres().unshift(item);tvNotices().snapshot['premiere:tmdb:'+id]={date:item.date,checkedAt:Date.now()};toast('Премьера добавлена');}save();toggle.textContent=saved()?'Не отслеживать':'Отслеживать';};
  $('[data-premierelookup]').onclick=async()=>{const status=$('#premiereStatus');status.textContent='Ищем в каталоге…';try{const results=await search(item.title);if(!alive(token))return;const names=[item.title,item.origin].map(nrm).filter(Boolean),year=Number(item.date.slice(0,4));const matches=results.filter(x=>Number(x.id)>0&&[x.name,x.origin_name].map(nrm).some(n=>n&&names.includes(n))&&(!year||!Number(x.year)||Math.abs(Number(x.year)-year)<=1));if(matches.length===1){go('details',{id:Number(matches[0].id)});return;}status.textContent=matches.length?'Найдено несколько совпадений. Уточните название через поиск Luma.':'В каталоге Luma пока не найдено.';}catch{if(alive(token))status.textContent='Не удалось проверить каталог. Попробуйте позже.';}};
};
setTimeout(()=>tvCheckNotices(),6000);
