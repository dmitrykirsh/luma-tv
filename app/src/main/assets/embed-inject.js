/* Luma TV: свой плеер поверх плеера сайта, управляется кнопками пульта.
   Видео и потоки ведёт плеер сайта (embed.*), а родной интерфейс скрыт (embed-theme.css): здесь рисуем панель, меню озвучки,
   качества, субтитров и скорости, субтитры и карточку «Далее». Страница-оболочка получает только события (время, серии, назад). */
(function () {
  if (window.__lumaTv) return; window.__lumaTv = 1;
  var P = function (m) { try { m.luma = 1; parent.postMessage(m, '*'); } catch (e) {} };
  var isKodik = /(^|\.)kodikplayer\.com$/i.test(location.hostname);
  if(isKodik){
    // This WebView is only used to locate the stream. Its audio must never
    // escape while the native player is being prepared.
    var mediaPlay=HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play=function(){this.muted=true;return mediaPlay.apply(this,arguments);};
    document.addEventListener('play',function(e){if(e.target instanceof HTMLMediaElement)e.target.muted=true;},true);
    var oldOpen=XMLHttpRequest.prototype.open,kodikManifestSeen=false;
    XMLHttpRequest.prototype.open=function(method,url){try{var u=new URL(String(url),location.href);if(u.protocol==='https:'&&/(^|\.)solodcdn\.com$/i.test(u.hostname)&&/^\/(?:useruploads|animetvseries)\/.+\/(?:240|360|480|720|1080|1440|2160)\.mp4:hls:manifest(?:-v[0-9]+-a[0-9]+)?\.m3u8$/i.test(u.pathname)){kodikManifestSeen=true;P({k:'kodikManifest',url:u.href,frameUrl:location.href});}}catch(e){}return oldOpen.apply(this,arguments);};
    var kodikTries=0,kodikStart=setInterval(function(){if(kodikManifestSeen||++kodikTries>12){clearInterval(kodikStart);return;}var v=document.querySelector('.main-player video.fp-engine,.main-player video');if(v){try{var r=v.play();if(r&&r.catch)r.catch(function(){});}catch(e){}}var b=document.querySelector('.play_button,.main-player .fp-big-play');if(b&&kodikTries===3)try{b.click();}catch(e){}},700);
  }

  if(isKodik){var kcss=document.createElement('style');kcss.textContent='.main-player .fp-controls,.main-player .fp-header,.main-player .fp-menu,.fp-waiting,.fp-x-waiting,.movie-translations-box,.ltv-has-content .main-player .fp-big-play{opacity:0!important;pointer-events:none!important}';document.documentElement.appendChild(kcss);}
  var V = function () { if (!isKodik) return document.querySelector('video'); return Array.prototype.find.call(document.querySelectorAll('video'), function(v) { return isFinite(v.duration) && v.duration >= 120; }) || null; };
  var ctrl = function () { try { return window.app && window.app._settings && window.app._settings.ctrl; } catch (e) { return null; } };
  var fmt = function (s) { s = Math.max(0, Math.floor(s || 0)); var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + (m < 10 ? '0' : '') + m : m) + ':' + (x < 10 ? '0' : '') + x; };
  var esc = function (t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;'); };
  var ls = function (k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } };
  var lset = function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} };
  var NL = String.fromCharCode(10);

  /* ---------- стили ---------- */
  var css = document.createElement('style');
  css.textContent =
    '#ltv{position:fixed;inset:0;z-index:2147483647;pointer-events:none;font:600 28px Inter,system-ui,sans-serif;color:#F8F9FA;-webkit-font-smoothing:antialiased}' +
    '#ltv *{box-sizing:border-box;margin:0;padding:0}' +
    '#ltv .shade{position:absolute;inset:0;opacity:0;transition:opacity .4s;background:linear-gradient(0deg,rgba(6,7,10,.92) 0,rgba(6,7,10,.55) 22%,transparent 46%),linear-gradient(180deg,rgba(6,7,10,.7) 0,transparent 18%)}' +
    '#ltv.on .shade{opacity:1}' +
    '#ltv .pauseinfo{position:absolute;inset:0;display:flex;align-items:center;padding:0 5.5% 7%;background:linear-gradient(90deg,rgba(7,8,12,.90),rgba(7,8,12,.64) 42%,rgba(7,8,12,.14) 78%),linear-gradient(0deg,rgba(7,8,12,.35),transparent 40%);opacity:0;transition:opacity .2s}' +
    '#ltv .pauseinfo.on{opacity:1}#ltv .pausecopy{max-width:900px}#ltv .pausecopy .label{font:700 19px Inter,system-ui,sans-serif;letter-spacing:3px;color:#ff5c84}' +
    '#ltv .pausecopy h2{font:700 48px/1.2 Inter,system-ui,sans-serif;margin:18px 0}#ltv .pausecopy img{display:block;max-width:560px;max-height:145px;width:auto;height:auto;object-fit:contain;object-position:left center;margin:18px 0;filter:drop-shadow(0 3px 15px rgba(0,0,0,.45))}' +
    '#ltv .pausecopy .meta{font:600 23px Inter,system-ui,sans-serif;color:#c7cbd5}#ltv .pausecopy .desc{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:4;overflow:hidden;font:400 25px/1.48 Inter,system-ui,sans-serif;color:#e4e5ea;margin-top:26px}#ltv .pausecopy .left{font:700 22px Inter,system-ui,sans-serif;margin-top:24px}' +
    '#ltv .top{position:absolute;left:96px;top:60px;max-width:1100px;opacity:0;transform:translateY(-14px);transition:opacity .4s,transform .5s cubic-bezier(.22,1,.36,1)}' +
    '#ltv.on .top{opacity:1;transform:none}' +
    '#ltv.paused-info .top{opacity:0}' +
    '#ltv .top b{display:block;font:700 46px/1.15 Inter,system-ui,sans-serif;letter-spacing:-.4px;text-shadow:0 2px 18px rgba(0,0,0,.6)}' +
    '#ltv .top span{display:block;margin-top:8px;font:500 28px Inter,system-ui,sans-serif;color:#B9BECA}' +
    '#ltv .panel{position:absolute;left:96px;right:96px;bottom:54px;opacity:0;transform:translateY(26px);transition:opacity .4s,transform .5s cubic-bezier(.22,1,.36,1)}' +
    '#ltv.on .panel{opacity:1;transform:none}' +
    '#ltv .prog{position:relative;height:10px;border-radius:5px;background:rgba(248,249,250,.22);transition:height .2s}' +
    '#ltv.seek .prog{height:14px}' +
    '#ltv .prog i{position:absolute;left:0;top:0;bottom:0;border-radius:inherit;width:0}' +
    '#ltv .buf{background:rgba(248,249,250,.3)}' +
    '#ltv .fill{background:linear-gradient(90deg,#FF3366,#FFB800);box-shadow:0 0 22px rgba(255,120,60,.5)}' +
    '#ltv .knob{position:absolute;top:50%;left:0;width:30px;height:30px;margin:-15px 0 0 -15px;border-radius:50%;background:#fff;box-shadow:0 4px 18px rgba(0,0,0,.6),0 0 0 7px rgba(255,184,0,.32);transform:scale(0);transition:transform .2s}' +
    '#ltv.seek .knob{transform:scale(1)}' +
    '#ltv .times{display:flex;justify-content:space-between;align-items:center;margin-top:16px;font:600 27px Inter,system-ui,sans-serif;font-variant-numeric:tabular-nums;color:#F8F9FA}' +
    '#ltv .times .d{color:#8E95A5}' +
    '#ltv .times .st{color:#FFB800;font-size:23px;letter-spacing:.14em;text-transform:uppercase}' +
    '#ltv .chips{display:flex;gap:16px;margin-top:24px}' +
    '#ltv .chip{height:72px;padding:0 34px;border-radius:36px;display:flex;align-items:center;gap:12px;background:rgba(36,38,46,.88);border:2px solid rgba(248,249,250,.1);font:600 28px Inter,system-ui,sans-serif;white-space:nowrap;transition:transform .2s,background .2s,color .2s}' +
    '#ltv .chip em{font-style:normal;color:#8E95A5;font-weight:500}' +
    '#ltv .chip.f{background:#F8F9FA;color:#0B0C10;border-color:transparent;transform:scale(1.07);box-shadow:0 12px 36px rgba(0,0,0,.5)}' +
    '#ltv .chip.f em{color:#4a4f5c}' +
    '#ltv .chip.hq b{color:#FFB800}' +
    '#ltv .chip.f.hq b{color:#c47f00}' +
    '#ltv .menu{position:absolute;right:96px;bottom:220px;width:560px;max-height:640px;overflow:hidden;padding:18px;border-radius:30px;background:rgba(22,24,30,.97);border:2px solid rgba(248,249,250,.12);box-shadow:0 40px 120px rgba(0,0,0,.7);opacity:0;transform:translateY(24px) scale(.97);transition:opacity .3s,transform .4s cubic-bezier(.22,1,.36,1)}' +
    '#ltv .menu.on{opacity:1;transform:none}' +
    '#ltv .menu h4{font:600 22px Inter,system-ui,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#8E95A5;padding:8px 20px 14px}' +
    '#ltv .opt{display:flex;align-items:center;height:76px;padding:0 24px;border-radius:20px;font:500 30px Inter,system-ui,sans-serif;gap:14px}' +
    '#ltv .opt span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '#ltv .opt svg{width:34px;height:34px;fill:none;stroke:#FF3366;stroke-width:3.4;stroke-linecap:round;stroke-linejoin:round;opacity:0}' +
    '#ltv .opt.cur{font-weight:700}#ltv .opt.cur svg{opacity:1}' +
    '#ltv .opt.f{background:#F8F9FA;color:#0B0C10}' +
    '#ltv .sub{position:absolute;left:10%;right:10%;bottom:78px;text-align:center;opacity:0;transition:bottom .5s cubic-bezier(.22,1,.36,1),opacity .15s}' +
    '#ltv .sub.on{opacity:1}' +
    '#ltv .skip{position:absolute;right:6%;bottom:24%;padding:18px 28px;border-radius:18px;background:#ff3366;color:#fff;font:700 26px Inter,system-ui,sans-serif;box-shadow:0 10px 35px rgba(0,0,0,.5);opacity:0;transition:opacity .2s}' +
    '#ltv .skip.on{opacity:1}' +
    '#ltv.on .sub{bottom:330px}' +
    '#ltv .sub span{display:inline;padding:.06em .5em;line-height:1.55;font:600 var(--lsz,48px)/1.55 Inter,system-ui,sans-serif;color:#fff;text-shadow:0 2px 3px rgba(0,0,0,.9),0 3px 20px rgba(0,0,0,.85);background:rgba(8,9,12,.5);border-radius:14px;-webkit-box-decoration-break:clone;box-decoration-break:clone}' +
    '#ltv .sub i{font-style:italic}' +
    '#ltv .next{position:absolute;right:96px;bottom:250px;width:600px;padding:26px 30px;border-radius:28px;background:rgba(22,24,30,.96);border:2px solid rgba(248,249,250,.12);box-shadow:0 30px 90px rgba(0,0,0,.65);overflow:hidden;opacity:0;transform:translateY(20px);transition:opacity .35s,transform .45s cubic-bezier(.22,1,.36,1)}' +
    '#ltv .next.on{opacity:1;transform:none}' +
    '#ltv .next small{display:block;font:600 22px Inter,system-ui,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#FFB800}' +
    '#ltv .next b{display:block;margin:10px 0 6px;font:600 32px/1.25 Inter,system-ui,sans-serif}' +
    '#ltv .next p{font:500 25px Inter,system-ui,sans-serif;color:#8E95A5}' +
    '#ltv .next .hint{margin-top:16px;font:500 23px Inter,system-ui,sans-serif;color:#B9BECA}' +
    '#ltv .next .hint u{text-decoration:none;color:#F8F9FA;font-weight:700}' +
    '#ltv .next .bar{position:absolute;left:0;bottom:0;height:6px;background:linear-gradient(90deg,#FF3366,#FFB800);transition:width 1s linear}' +
    '#ltv .fb{position:absolute;left:50%;top:50%;width:150px;height:150px;margin:-75px 0 0 -75px;border-radius:50%;background:rgba(11,12,16,.7);display:grid;place-items:center;opacity:0;transform:scale(.8);transition:opacity .25s,transform .35s cubic-bezier(.22,1,.36,1)}' +
    '#ltv .fb.on{opacity:1;transform:scale(1)}#ltv .fb svg{width:68px;height:68px;fill:#fff}' +
    '#ltv .wait{position:absolute;left:50%;top:50%;width:84px;height:84px;margin:-42px 0 0 -42px;border-radius:50%;border:6px solid rgba(248,249,250,.18);border-top-color:#FFB800;opacity:0;transition:opacity .25s}' +
    '#ltv .wait.on{opacity:1;animation:ltvspin .9s linear infinite}@keyframes ltvspin{to{transform:rotate(360deg)}}' +
    /* Панель резервного плеера повторяет цвета и размеры основного интерфейса Luma TV. */
    '#ltv .panel{left:80px;right:80px;bottom:52px}#ltv .prog{height:10px}#ltv.seek .prog{height:10px}' +
    '#ltv .fill{background:linear-gradient(90deg,#FFB800,#FF3366);box-shadow:none}#ltv .knob{width:20px;height:20px;margin:-10px 0 0 -10px;box-shadow:0 0 0 5px rgba(255,51,102,.25)}' +
    '#ltv .times{margin-top:15px;font-size:24px}#ltv .times .st{font-size:18px;color:#ff7899;letter-spacing:.1em}#ltv .chips{gap:14px;margin-top:26px}' +
    '#ltv .chip{height:68px;padding:0 24px;border:1px solid rgba(255,255,255,.08);border-radius:34px;background:rgba(248,249,250,.14);font-size:24px;transition:none}' +
    '#ltv .chip.f{background:#ff3366;color:#fff;border-color:#ff85a5;transform:none;box-shadow:0 8px 26px rgba(255,51,102,.35)}#ltv .chip.f em{color:rgba(255,255,255,.82)}#ltv .chip.f.hq b{color:#fff}' +
    '#ltv .menu{right:0;top:0;bottom:0;width:640px;max-height:none;border-radius:24px 0 0 24px;background:#111218;padding:50px 56px 30px 64px;box-shadow:-18px 0 48px rgba(0,0,0,.48);transform:none;transition:none}' +
    '#ltv .menu h4{font-size:25px;letter-spacing:0;color:#f8f9fa;padding:8px 0 18px}#ltv .opt{height:72px;padding:0 20px;border-radius:16px;font-size:24px}#ltv .opt.f{background:#ff3366;color:#fff}#ltv .opt.f svg{stroke:#fff}' +
    '#ltv.paused-info .fb{opacity:0!important}#ltv .wait{border-top-color:#ff3366}';
  var root = document.createElement('div'); root.id = 'ltv';
  var CHECK = '<svg viewBox="0 0 24 24"><path d="M5 12.500l4.500 4.500L19 7.500"/></svg>';
  root.innerHTML = '<div class="shade"></div><div class="pauseinfo"><div class="pausecopy"></div></div><div class="top"><b></b><span></span></div><div class="sub"></div><div class="wait"></div><div class="fb"></div>' +
    '<div class="next"></div><div class="menu"></div><div class="skip"></div>' +
    '<div class="panel"><div class="prog"><i class="buf"></i><i class="fill"></i><b class="knob"></b></div>' +
    '<div class="times"><span class="n">0:00</span><span class="st"></span><span class="d">0:00</span></div><div class="chips"></div></div>';
  var $ = function (s) { return root.querySelector(s); };
  var ready = function () { (document.head || document.documentElement).appendChild(css); (document.body || document.documentElement).appendChild(root); };
  if (document.body) ready(); else document.addEventListener('DOMContentLoaded', ready);

  /* ---------- состояние ---------- */
  var lumaTitle = '', lumaEpisode = '';
  var pauseInfo=null,pauseSignature='';
  function paintPause(){var v=V(),el=$('.pauseinfo');if(isKodik)document.documentElement.classList.toggle('ltv-has-content',!!v);var on=!!(pauseInfo&&pauseInfo.enabled&&v&&v.paused&&v.readyState>=2&&isFinite(v.duration)&&v.duration>=120);el.classList.toggle('on',on);root.classList.toggle('paused-info',on);if(!on)return;var copy=$('.pausecopy'),sig=[lumaTitle,pauseInfo.logo,pauseInfo.meta,pauseInfo.description].join('|');if(sig!==pauseSignature){pauseSignature=sig;copy.innerHTML='<span class="label">ПАУЗА</span><h2></h2><p class="meta"></p><p class="desc"></p><p class="left"></p>';copy.querySelector('h2').textContent=lumaTitle||'Видео';copy.querySelector('.meta').textContent=String(pauseInfo.meta||'');copy.querySelector('.desc').textContent=String(pauseInfo.description||'');if(pauseInfo.logo){var image=new Image();image.alt=lumaTitle;image.onload=function(){if(pauseSignature!==sig)return;var h=copy.querySelector('h2');if(h)h.replaceWith(image);};image.src=String(pauseInfo.logo);}}copy.querySelector('.left').textContent='Осталось '+fmt(Math.max(0,v.duration-v.currentTime));}
  var mode = 'hidden';          // hidden | seek | chips | menu | next
  var chipI = 0, menuK = '', menuI = 0, hideT = 0, fbT = 0;
  var serial = /[?&]season=\d+/.test(location.search);
  var subSize = ls('ltv.subsize', 'm'), subOffset=0;
  var SIZES = { s: 40, m: 48, l: 58 };
  var nextShown = false, nextCancelled = false, nextTotal = 0, nextEl = null;
  var skipSegments=[],skipCurrent=null,skipDone={},skipAuto={op:false,ed:false};
  function paintSkip(){var v=V();skipCurrent=v?skipSegments.find(function(s){return v.currentTime>=s.start&&v.currentTime<s.end-1;}):null;if(skipCurrent&&v&&!v.paused&&skipAuto[skipCurrent.type]&&!skipDone[skipCurrent.type+':'+skipCurrent.start]){skipNow();return;}var el=$('.skip');el.textContent=skipCurrent?(skipCurrent.type==='ed'?'OK · Пропустить эндинг':'OK · Пропустить заставку'):'';el.classList.toggle('on',!!skipCurrent);}
  function skipNow(){var v=V();if(!v||!skipCurrent)return false;skipDone[skipCurrent.type+':'+skipCurrent.start]=true;try{if(window.app&&window.app.seek)window.app.seek(skipCurrent.end);else v.currentTime=skipCurrent.end;}catch(e){v.currentTime=skipCurrent.end;}skipCurrent=null;$('.skip').classList.remove('on');return true;}

  /* ---------- кнопки под полосой ---------- */
  var SETS = {
    snd: { title: 'Озвучка', key: 'sound', label: function (v) { return String(v); } },
    q: { title: 'Качество', key: 'quality', label: function (v) { return v + 'p'; } },
    cc: { title: 'Субтитры', key: 'cc', label: function (v) { return v === 'Откл' ? 'Выключены' : String(v).replace(/\s*-\s*\d+$/, ''); } },
    sp: { title: 'Скорость', key: 'speed', label: function (v) { return v === 1 ? 'Обычная' : v + '×'; } }
  };
  var setting = function (k) { var c = ctrl(), d = SETS[k]; if (!c || !d || !c[d.key] || !c.ls || !c.ls[d.key]) return null; try { return { v: c[d.key].value, ls: c.ls[d.key].value }; } catch (e) { return null; } };
  var chipList = function () {
    var out = [];
    if (serial) out.push({ id: 'eps', html: 'Серии' });
    ['snd', 'q', 'cc', 'sp'].forEach(function (k) {
      var s = setting(k); if (!s || (s.ls || []).length < 2) return;
      var d = SETS[k], v = k === 'q' ? '<b>' + s.v + 'p</b>' : esc(d.label(s.v));
      out.push({ id: k, html: d.title + ' <em>' + (k === 'cc' && s.v === 'Откл' ? 'выкл' : v) + '</em>', hq: k === 'q' && s.v >= 1080 });
    });
    return out;
  };
  var chipsKey = '';
  function paintChips() {
    var list = chipList(), key = JSON.stringify(list) + chipI + mode;
    if (key === chipsKey) return; chipsKey = key;
    if (chipI >= list.length) chipI = Math.max(0, list.length - 1);
    $('.chips').innerHTML = list.map(function (c, i) { return '<div class="chip' + (c.hq ? ' hq' : '') + (mode === 'chips' && i === chipI ? ' f' : '') + '">' + c.html + '</div>'; }).join('');
  }

  /* ---------- панель ---------- */
  function paint() {
    var v = V(); if (!v) return;
    var d = isFinite(v.duration) ? v.duration : 0, r = d ? Math.min(1, v.currentTime / d) : 0, buf = 0;
    try { for (var i = 0; i < v.buffered.length; i++) if (v.buffered.start(i) <= v.currentTime + 0.5 && v.buffered.end(i) >= v.currentTime) buf = v.buffered.end(i); } catch (e) {}
    $('.fill').style.width = r * 100 + '%'; $('.knob').style.left = r * 100 + '%'; $('.buf').style.width = (d ? Math.min(1, buf / d) : 0) * 100 + '%';
    $('.n').textContent = fmt(v.currentTime); $('.d').textContent = fmt(d);
    $('.st').textContent = v.paused ? 'Пауза' : '';
    $('.wait').classList.toggle('on', !v.paused && v.readyState < 3);
    var t = document.title || '', m = /^(.*?)\s*\((\d+)\s*сезон\)\s*-\s*(\d+)\s*сери/i.exec(t);
    $('.top b').textContent = lumaTitle || (m ? m[1] : t); $('.top span').textContent = lumaEpisode || (m ? 'Сезон ' + m[2] + ' · Серия ' + m[3] : '');
    paintChips();
  }
  function show(ms) {
    root.classList.add('on'); paint(); clearTimeout(hideT);
    if (mode === 'hidden') mode = 'seek';
    root.classList.toggle('seek', mode === 'seek');
    var v = V();
    if (ms !== 0 && mode === 'seek' && !(v && v.paused)) hideT = setTimeout(hide, ms || 4000);
  }
  function hide() { clearTimeout(hideT); if (mode === 'menu' || mode === 'chips') return; mode = 'hidden'; root.classList.remove('on', 'seek'); closeMenu(true); }
  function flash(paused) {
    var fb = $('.fb'); fb.innerHTML = paused ? '<svg viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M7 4.500v15l13-7.500z"/></svg>';
    fb.classList.add('on'); clearTimeout(fbT); fbT = setTimeout(function () { fb.classList.remove('on'); }, 700);
  }

  /* ---------- меню ---------- */
  var SUB_SIZES = [['s', 'Мелкие'], ['m', 'Обычные'], ['l', 'Крупные']];
  function menuItems() {
    var s = setting(menuK); if (!s) return [];
    var d = SETS[menuK], items = s.ls.map(function (v) { return { v: v, label: d.label(v), cur: v === s.v }; });
    if (menuK === 'cc') SUB_SIZES.forEach(function (z) { items.push({ size: z[0], label: 'Размер: ' + z[1].toLowerCase(), cur: z[0] === subSize }); });
    if (menuK === 'cc' && subCanSync()) { items.push({shift:-0.5,label:'Раньше на 0,5 с',cur:false},{reset:true,label:'Сдвиг: '+(subOffset>0?'+':'')+subOffset.toFixed(1)+' с · сброс',cur:false},{shift:0.5,label:'Позже на 0,5 с',cur:false}); }
    return items;
  }
  function paintMenu() {
    var items = menuItems(); if (menuI >= items.length) menuI = items.length - 1;
    $('.menu').innerHTML = '<h4>' + SETS[menuK].title + '</h4>' + items.map(function (it, i) { return '<div class="opt' + (it.cur ? ' cur' : '') + (i === menuI ? ' f' : '') + '"><span>' + esc(it.label) + '</span>' + CHECK + '</div>'; }).join('');
    var f = $('.menu .f'); if (f && f.scrollIntoView) f.scrollIntoView({ block: 'nearest' });
  }
  function openMenu(k) {
    menuK = k; var items = menuItems(); if (!items.length) return;
    mode = 'menu'; var cur = items.findIndex(function (i) { return i.cur && !i.size; }); menuI = Math.max(0, cur);
    paintMenu(); $('.menu').classList.add('on'); clearTimeout(hideT); chipsKey = ''; paintChips();
  }
  function closeMenu(silent) { $('.menu').classList.remove('on'); if (!silent && mode === 'menu') { mode = 'chips'; chipsKey = ''; paintChips(); } }
  function pickMenu() {
    var it = menuItems()[menuI], c = ctrl(); if (!it) return;
    if (it.size) { subSize = it.size; lset('ltv.subsize', subSize); applySize(); }
    else if(it.shift || it.reset){subOffset=it.reset?0:Math.max(-30,Math.min(30,subOffset+it.shift));paintSub();paintMenu();return;}
    else if (c) { try { c[SETS[menuK].key].value = it.v; } catch (e) {} }
    if (menuK === 'sp' || menuK === 'q' || menuK === 'snd' || (menuK === 'cc' && !it.size)) { closeMenu(); chipsKey = ''; paintChips(); } else paintMenu();
  }

  /* ---------- субтитры ---------- */
  var subLast = null, hooked = [];
  function subCanSync(){var v=V();if(!v)return false;for(var i=0;i<v.textTracks.length;i++){var t=v.textTracks[i];try{if(t.mode==='showing'&&t.cues)return true;}catch(e){}}return false;}
  function applySize() { root.style.setProperty('--lsz', SIZES[subSize] + 'px'); }
  function subHtml(t) { return String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/&lt;(\/?)(i|b|u)>/gi, '<$1$2>').replace(/&lt;[^>]*>/g, '').replace(/\{\\[^}]*\}/g, '').replace(/\r?\n/g, '<br>').trim(); }
  function subText() {
    var v = V(), out = ''; if (!v) return '';
    for (var i = 0; i < v.textTracks.length; i++) {
      var t = v.textTracks[i];
      if (hooked.indexOf(t) < 0) { hooked.push(t); t.addEventListener('cuechange', paintSub); }
      if (t.mode === 'showing') {try{var cues=subOffset&&t.cues?Array.prototype.filter.call(t.cues,function(q){var at=v.currentTime-subOffset;return q.startTime<=at&&at<q.endTime;}):t.activeCues;if(cues)out=Array.prototype.map.call(cues,function(q){return q.text;}).join(NL);}catch(e){}}
    }
    return out;
  }
  function paintSub() {
    var h = subHtml(subText()), el = $('.sub');
    if (h === subLast) return; subLast = h;
    el.innerHTML = h ? '<span>' + h + '</span>' : ''; el.classList.toggle('on', !!h);
  }
  applySize();

  /* ---------- карточка «Далее» ---------- */
  function nextInfo() {
    var cancel = document.querySelector('[class*="cancel_"]'), box = cancel && cancel.closest('[class*="wrap_"]');
    if (nextEl && nextEl !== box) nextEl.removeAttribute('data-ltv-next');
    nextEl = box || null; if (!box) return null;
    box.setAttribute('data-ltv-next', '');
    var t = box.querySelector('[class*="title_"]'), c = box.querySelector('[class*="count_"]');
    return { title: t ? t.textContent.trim() : '', n: c ? parseInt(c.textContent, 10) || 0 : 0, cancel: cancel };
  }
  function paintNext() {
    var nx = nextInfo(), el = $('.next'), v = V();
    if (nx) { var m = /(\d+)\s*сери/i.exec(nx.title), cur = /(\d+)\s*сери/i.exec(document.title || ''); if (m && cur && m[1] === cur[1]) nx = null; }   // последняя серия: следующей нет
    if (!nx) { nextCancelled = false; nextTotal = 0; if (nextShown) { nextShown = false; el.classList.remove('on'); if (mode === 'next') mode = 'hidden'; } return; }
    if (nextCancelled) return;
    nextTotal = Math.max(nextTotal, nx.n || 0);
    if (!nextShown) { nextShown = true; if (mode === 'hidden') mode = 'next'; el.innerHTML = '<small>Далее</small><b></b><p></p><div class="hint"><u>OK</u> смотреть сейчас · <u>Назад</u> отмена</div><i class="bar"></i>'; el.classList.add('on'); }
    el.querySelector('b').textContent = nx.title.replace(/^.*?\(\d+\s*сезон\)\s*-\s*/i, '') || nx.title;
    el.querySelector('p').textContent = nx.n ? 'Запуск через ' + nx.n + ' с' : 'Запускаем…';
    el.querySelector('.bar').style.width = nextTotal ? Math.max(0, Math.min(100, (nextTotal - nx.n) / nextTotal * 100)) + '%' : '0';
  }
  function nextNow() { var b = document.querySelector('button.episode-next'); if (b) b.click(); $('.next').classList.remove('on'); nextShown = false; if (mode === 'next') mode = 'hidden'; }
  var cancelAt = 0;
  function nextCancel() { var nx = nextInfo(); if (nx && nx.cancel) nx.cancel.click(); nextCancelled = true; cancelAt = Date.now(); $('.next').classList.remove('on'); nextShown = false; if (mode === 'next') mode = 'hidden'; }

  /* ---------- управление ---------- */
  function toggle() { var v = V(); if (!v) return; if (v.paused) { v.play(); flash(false); show(1500); } else { v.pause(); flash(true); show(0); } }
  var step = 10, lastSeek = 0, holdStart = 0;
  function seek(dir) {
    var v = V(); if (!v) return;
    var now = Date.now(); if(now-lastSeek>550)holdStart=now;else if(now-lastSeek<180)return;step=now-holdStart>=2500?30:now-holdStart>=1200?20:10;lastSeek=now;
    var t = Math.max(0, Math.min((v.duration || 1e9) - 1, v.currentTime + dir * step));
    try { if (window.app && window.app.seek) window.app.seek(t); else v.currentTime = t; } catch (e) { v.currentTime = t; }
    show(3000);
  }
  function key(e) {
    var k = e.key, hasV = !!V(), used = true;
    if (isKodik && k === 'ArrowUp') { P({k:'reserveMenu'}); e.preventDefault(); e.stopPropagation(); return; }
    if (isKodik && !hasV && (k === 'Enter' || k === ' ')) { var play = document.querySelector('.play_button'); if (play) { play.click(); e.preventDefault(); e.stopPropagation(); return; } }
    var back = k === 'Escape' || k === 'Backspace';
    if (mode === 'menu') {
      var n = menuItems().length;
      if (k === 'ArrowDown') { menuI = Math.min(n - 1, menuI + 1); paintMenu(); }
      else if (k === 'ArrowUp') { menuI = Math.max(0, menuI - 1); paintMenu(); }
      else if (k === 'Enter' || k === ' ') pickMenu();
      else if (back || k === 'ArrowLeft') closeMenu();
      else used = false;
    } else if (mode === 'chips') {
      var cl = chipList();
      if (k === 'ArrowLeft') { chipI = Math.max(0, chipI - 1); chipsKey = ''; paintChips(); }
      else if (k === 'ArrowRight') { chipI = Math.min(cl.length - 1, chipI + 1); chipsKey = ''; paintChips(); }
      else if (k === 'Enter' || k === ' ') { var c = cl[chipI]; if (c) { if (c.id === 'eps') { mode = 'seek'; chipsKey = ''; hide(); P({ k: 'menu' }); } else openMenu(c.id); } }
      else if (k === 'ArrowDown' || back) { mode = 'seek'; chipsKey = ''; show(); }
      else used = false;
    } else if (nextShown && !nextCancelled && (k === 'Enter' || k === ' ' || back)) { if (back) nextCancel(); else nextNow(); }
    else if (k === 'ArrowRight' && hasV) seek(1);
    else if (k === 'ArrowLeft' && hasV) seek(-1);
    else if ((k === 'Enter' || k === ' ') && hasV && skipCurrent) skipNow();
    else if ((k === 'Enter' || k === ' ') && hasV) toggle();
    else if (k === 'ArrowUp') { var l = chipList(); if (l.length) { mode = 'chips'; chipsKey = ''; root.classList.remove('seek'); show(0); } else if (serial) P({ k: 'menu' }); }
    else if (k === 'ArrowDown') { if (mode === 'hidden') show(4000); else hide(); }
    else if (back) { if (mode === 'seek') { hide(); } else P({ k: 'back' }); }
    else used = false;
    if (used) { e.preventDefault(); e.stopPropagation(); }
  }
  window.addEventListener('keydown', key, true);

  /* ---------- связь с оболочкой ---------- */
  window.addEventListener('message', function (e) {
    var want = e.data && e.data.lumaSeek;
    if (want == null) return;
    var n = 0, id = setInterval(function () {
      var v = V(); n++;
      if (v && v.readyState >= 1 && isFinite(v.duration) && v.duration > 0) { if (Math.abs(v.currentTime - want) > 1.5) { try { if (window.app && window.app.seek) window.app.seek(want); else v.currentTime = want; } catch (er) { v.currentTime = want; } } clearInterval(id); }
      else if (n > 40) clearInterval(id);
    }, 500);
  });
  window.addEventListener('message', function (e) {
    if(e.source===parent && e.data && Array.isArray(e.data.lumaSkips)){skipSegments=e.data.lumaSkips.filter(function(s){return s&&['op','ed'].indexOf(s.type)>=0&&isFinite(s.start)&&isFinite(s.end)&&s.start>=0&&s.end>s.start&&s.end-s.start<=300;});paintSkip();return;}
    if(e.data && e.data.lumaTitle){lumaTitle=String(e.data.lumaTitle);lumaEpisode=String(e.data.lumaEpisode||'');if(e.source===parent&&e.data.lumaAutoSkip){skipAuto={op:e.data.lumaAutoSkip.op===true,ed:e.data.lumaAutoSkip.ed===true};}if(e.source===parent&&e.data.lumaPauseInfo){pauseInfo=e.data.lumaPauseInfo;paintPause();}return;}
    var c = e.data && e.data.lumaCmd; if (!c) return;
    if(isKodik && c==='quality-list'){var nodes=Array.prototype.slice.call(document.querySelectorAll('.fp-quality-dropdown [data-quality]'));P({k:'reserveQuality',values:nodes.map(function(x){return Number(x.dataset.quality)}).filter(function(x){return x>0}),current:Number(document.querySelector('.fp-quality-dropdown .current')?.dataset.quality)||0,auto:!!e.data.auto});return;}
    if(isKodik && c==='quality-set'){var option=Array.prototype.find.call(document.querySelectorAll('.fp-quality-dropdown [data-quality]'),function(x){return Number(x.dataset.quality)===Number(e.data.value)});if(option)option.click();return;}
    var v = V(); if (!v) return;
    if (c === 'playpause') toggle(); else if (c === 'pause') { v.pause(); show(0); } else if (c === 'ff') seek(1); else if (c === 'rw') seek(-1);
  });
  setInterval(function () {
    var v = V(); if (!v) {paintPause();return;}
    paintSub(); paintNext(); paintSkip(); paintPause();
    if (root.classList.contains('on')) paint(); else $('.wait').classList.toggle('on', !v.paused && v.readyState < 3);
  }, 250);
  setInterval(function () {
    var v = V(); if (!v || !isFinite(v.duration)) return;
    P({ k: 'time', t: v.currentTime, d: v.duration, p: v.paused });
  }, 3000);
  var hookedV = null;
  setInterval(function () { var v = V(); if (v && v !== hookedV) { hookedV = v; try { v.play(); } catch (e) {} v.addEventListener('ended', function () { if (Date.now() - cancelAt > 120000) P({ k: 'ended' }); }); } }, 1500);
})();
