'use strict';
const DETAIL_BG={seq:0,timer:0,hls:null,video:null,controller:null,token:0,detail:null,pending:false};
function stopDetailBackground(){
  DETAIL_BG.seq++;clearTimeout(DETAIL_BG.timer);DETAIL_BG.timer=0;DETAIL_BG.pending=false;DETAIL_BG.detail=null;DETAIL_BG.controller?.abort();DETAIL_BG.controller=null;
  if(DETAIL_BG.hls){try{DETAIL_BG.hls.destroy();}catch{}DETAIL_BG.hls=null;}
  if(DETAIL_BG.video){const v=DETAIL_BG.video;DETAIL_BG.video=null;try{v.pause();v.removeAttribute('src');v.load();}catch{}v.remove();}
}
window.pauseDetailBackground=()=>{try{DETAIL_BG.video?.pause();}catch{}};
window.resumeDetailBackground=()=>{if(route.name!=='details'||document.hidden||window.npActive?.()||playerOpen()||window.trailerOpen?.())return;const v=DETAIL_BG.video;if(v)v.play().catch(()=>{});else if(DETAIL_BG.pending&&DETAIL_BG.detail){const d=DETAIL_BG.detail,t=DETAIL_BG.token;DETAIL_BG.pending=false;window.startDetailBackground(d,t);}};
window.startDetailBackground=(d,token)=>{
  stopDetailBackground();if(optGet('luma.tv.backgroundTrailers','1')==='0')return;
  const seq=DETAIL_BG.seq;DETAIL_BG.token=token;DETAIL_BG.detail=d;
  DETAIL_BG.timer=setTimeout(async()=>{
    DETAIL_BG.timer=0;if(seq!==DETAIL_BG.seq||!alive(token)||route.name!=='details')return;if(document.hidden||window.npActive?.()||playerOpen()||window.trailerOpen?.()){DETAIL_BG.pending=true;return;}
    try{
      const name=String(d.name||'').replace(/\s*\[(?:ТВ|TV)[-\s]*\d+\]/gi,'').trim(),origin=String(d.origin_name||d.info?.name_eng||'').replace(/\s*\((?:19|20)\d{2}\)\s*$/,'').trim();
      const candidates=await findTrailers({name,origin,year:d.year,anime:!!d._ao||[6,7].includes(Number(d.type))});if(seq!==DETAIL_BG.seq||!alive(token))return;
      const candidate=candidates.find(x=>x.src==='Rutube'&&x.backgroundEligible&&/^[a-f0-9]{32}$/i.test(String(x.id||'')));if(!candidate)return;
      const controller=new AbortController();DETAIL_BG.controller=controller;const timeout=setTimeout(()=>controller.abort(),10000);let options;
      try{const response=await fetch(tvPx('https://rutube.ru/api/play/options/'+candidate.id+'/?format=json','','',true),{signal:controller.signal});if(!response.ok)throw Error('HTTP');options=await response.json();}finally{clearTimeout(timeout);if(DETAIL_BG.controller===controller)DETAIL_BG.controller=null;}
      if(seq!==DETAIL_BG.seq||!alive(token)||options.acl_access?.allowed===false)return;if(document.hidden||window.npActive?.()||playerOpen()||window.trailerOpen?.()){DETAIL_BG.pending=true;return;}
      const u=new URL(options.video_balancer?.m3u8);if(u.protocol!=='https:'||!(u.hostname==='bl.rutube.ru'||u.hostname.endsWith('.rtbcdn.ru')))return;
      const container=$('#dbg');if(!container)return;const video=document.createElement('video');video.className='detail-bg-video';video.muted=true;video.defaultMuted=true;video.loop=true;video.playsInline=true;video.setAttribute('playsinline','');video.setAttribute('aria-hidden','true');container.appendChild(video);DETAIL_BG.video=video;
      video.addEventListener('playing',()=>{if(seq===DETAIL_BG.seq&&alive(token)){container.classList.add('on');video.classList.add('on');}});
      const fail=()=>{if(seq===DETAIL_BG.seq)stopDetailBackground();};video.addEventListener('error',fail,{once:true});
      const stream=tvPx(u.href,'','https://rutube.ru/');
      if(window.Hls&&Hls.isSupported()){
        const h=new Hls({maxBufferLength:10,backBufferLength:5,capLevelToPlayerSize:false,manifestLoadingTimeOut:10000,fragLoadingTimeOut:15000});DETAIL_BG.hls=h;
        h.on(Hls.Events.MANIFEST_PARSED,()=>{if(seq!==DETAIL_BG.seq)return;const levels=(h.levels||[]).map((x,i)=>({i,h:Number(x.height)||0})).filter(x=>x.h>0).sort((a,b)=>a.h-b.h),best=levels.filter(x=>x.h<=480).pop()||levels[0];if(best)h.autoLevelCapping=best.i;window.resumeDetailBackground();});
        h.on(Hls.Events.ERROR,(_e,data)=>{if(data.fatal)fail();});h.loadSource(stream);h.attachMedia(video);
      }else{video.src=stream;window.resumeDetailBackground();}
    }catch{}
  },2200);
};
const previousRouteLeave=window.onRouteLeave;
window.onRouteLeave=(prev,next)=>{if(previousRouteLeave)previousRouteLeave(prev,next);if(prev?.name==='details')stopDetailBackground();};
document.addEventListener('visibilitychange',()=>document.hidden?window.pauseDetailBackground():window.resumeDetailBackground());
