'use strict';
function tvActivityEntries(){
  const entries=[...(S.history||[]).filter(h=>h.ts).map(h=>({time:new Date(h.ts).getTime(),title:h.name,poster:h.poster,label:h.season&&h.episode?'Открыта серия '+(h.aoSlug?h.episode:h.season+'×'+h.episode):'Открыт для просмотра',id:h.aoSlug?'ao:'+h.aoSlug:h.routeId||h.id})),...(S.favs||[]).filter(f=>f.at).map(f=>({time:new Date(f.at).getTime(),title:f.name,poster:f.poster,label:'Добавлено в избранное',id:f.aoSlug?'ao:'+f.aoSlug:f.routeId||f.id}))];
  return entries.filter(x=>Number.isFinite(x.time)&&x.title&&x.id!=null).sort((a,b)=>b.time-a.time);
}
window.RENDER.activity=()=>{
  const items=tvActivityEntries(), groups=new Map();
  for(const item of items){const date=new Date(item.time),key=date.toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'});if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);}
  const sections=[...groups].map(([day,entries])=>`<section class="tv-activity-day"><h2>${esc(day)}</h2><div class="tv-activity-grid">${entries.map(x=>`<button class="notice-row f" tabindex="-1" data-activityid="${esc(x.id)}" data-k="activity:${esc(x.id)}:${x.time}"><span class="notice-art">${x.poster?`<img src="${esc(x.poster)}" alt="">`:ico('film')}</span><span class="notice-copy"><span class="tv-activity-label">${esc(x.label)}</span><b>${esc(x.title)}</b><small>${esc(new Date(x.time).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}))}</small></span></button>`).join('')}</div></section>`).join('');
  view.innerHTML=`<div class="page activity-page">${tvCatalogHeader('Недавняя активность','История просмотра и добавления в избранное.','ВАША БИБЛИОТЕКА')}${sections?'<div class="tv-activity-groups">'+sections+'</div>':'<div class="notice-empty"><span>'+ico('heart')+'</span><h3>Пока здесь тихо</h3><p>Откройте тайтл или добавьте его в избранное.</p></div>'}</div>`;
};
document.addEventListener('click',e=>{if(e.target.closest('[data-activity]')){go('activity');return;}const el=e.target.closest('[data-activityid]');if(!el)return;const id=el.dataset.activityid;if(/^ao:/.test(id))go('details',{id});else if(Number.isSafeInteger(Number(id))&&Number(id)>0)go('details',{id:Number(id)});});
