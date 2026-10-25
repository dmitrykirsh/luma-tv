/* Luma TV: управление плеером сайта кнопками пульта. Скрипт добавляется в страницу плеера (embed.*) при загрузке. */
(function () {
  if (window.__lumaTv) return; window.__lumaTv = 1;
  var P = function (m) { try { m.luma = 1; parent.postMessage(m, '*'); } catch (e) {} };
  var V = function () { return document.querySelector('video'); };
  var fmt = function (s) { s = Math.max(0, Math.floor(s || 0)); var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + (m < 10 ? '0' : '') + m : m) + ':' + (x < 10 ? '0' : '') + x; };

  // экранная панель: прогресс, время, значок паузы
  var css = document.createElement('style');
  css.textContent = '#ltv{position:fixed;left:0;right:0;bottom:0;z-index:2147483647;padding:60px 5% 34px;background:linear-gradient(transparent,rgba(5,6,8,.88));font:600 26px Inter,system-ui,sans-serif;color:#F8F9FA;opacity:0;transition:opacity .25s;pointer-events:none}' +
    '#ltv.on{opacity:1}#ltv .bar{height:8px;border-radius:4px;background:rgba(255,255,255,.22);overflow:hidden;margin-bottom:14px}#ltv .bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#FFB800,#FF3366)}' +
    '#ltv .row{display:flex;justify-content:space-between}#ltv .hint{color:#8E95A5;font-size:21px;margin-top:8px}' +
    '#ltvc{position:fixed;left:50%;top:50%;width:140px;height:140px;margin:-70px 0 0 -70px;border-radius:50%;background:rgba(11,12,16,.7);z-index:2147483647;display:grid;place-items:center;opacity:0;transform:scale(.8);transition:.25s;pointer-events:none}' +
    '#ltvc.on{opacity:1;transform:scale(1)}#ltvc svg{width:64px;height:64px;fill:#fff}';
  var bar = document.createElement('div'); bar.id = 'ltv';
  bar.innerHTML = '<div class="bar"><i></i></div><div class="row"><span class="t"></span><span class="d"></span></div><div class="hint">◀ ▶ перемотка · OK пауза · ▲ серии · Назад — выйти</div>';
  var ctr = document.createElement('div'); ctr.id = 'ltvc';
  var ready = function () { (document.head || document.documentElement).appendChild(css); (document.body || document.documentElement).appendChild(bar); (document.body || document.documentElement).appendChild(ctr); };
  if (document.body) ready(); else document.addEventListener('DOMContentLoaded', ready);

  var hideT = 0, ctrT = 0;
  function paint() {
    var v = V(); if (!v) return;
    bar.querySelector('i').style.width = (v.duration ? v.currentTime / v.duration * 100 : 0) + '%';
    bar.querySelector('.t').textContent = fmt(v.currentTime); bar.querySelector('.d').textContent = fmt(v.duration);
  }
  function showBar(ms) { paint(); bar.classList.add('on'); clearTimeout(hideT); hideT = setTimeout(function () { bar.classList.remove('on'); }, ms || 3200); }
  function flash(paused) {
    ctr.innerHTML = paused ? '<svg viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M7 4.500v15l13-7.500z"/></svg>';
    ctr.classList.add('on'); clearTimeout(ctrT); ctrT = setTimeout(function () { ctr.classList.remove('on'); }, 700);
  }
  function toggle() { var v = V(); if (!v) return; if (v.paused) { v.play(); flash(false); showBar(1500); } else { v.pause(); flash(true); showBar(60000); } }
  var step = 10, lastSeek = 0;
  function seek(dir) {
    var v = V(); if (!v) return;
    var now = Date.now(); step = now - lastSeek < 500 ? Math.min(step * 1.5, 180) : 10; lastSeek = now;
    v.currentTime = Math.max(0, Math.min((v.duration || 1e9) - 1, v.currentTime + dir * step));
    showBar(2500);
  }
  function key(e) {
    var k = e.key, handled = true, hasV = !!V();
    if (k === 'ArrowRight' && hasV) seek(1);
    else if (k === 'ArrowLeft' && hasV) seek(-1);
    else if ((k === 'Enter' || k === ' ') && hasV) toggle();
    else if (k === 'ArrowUp') P({ k: 'menu' });
    else if (k === 'ArrowDown') showBar(4000);
    else if (k === 'Escape' || k === 'Backspace') P({ k: 'back' });
    else handled = false;
    if (handled) { e.preventDefault(); e.stopPropagation(); }
  }
  window.addEventListener('keydown', key, true);
  // продолжить с сохранённого места: плеер сайта параметр времени не всегда понимает, поэтому перематываем сами
  window.addEventListener('message', function (e) {
    var want = e.data && e.data.lumaSeek; if (want == null) return;
    var n = 0, id = setInterval(function () {
      var v = V(); n++;
      if (v && v.readyState >= 1 && isFinite(v.duration) && v.duration > 0) { if (Math.abs(v.currentTime - want) > 5) v.currentTime = want; clearInterval(id); }
      else if (n > 40) clearInterval(id);
    }, 500);
  });
  window.addEventListener('message', function (e) {
    var c = e.data && e.data.lumaCmd; if (!c) return;
    var v = V(); if (!v) return;
    if (c === 'playpause') toggle(); else if (c === 'pause') v.pause(); else if (c === 'ff') seek(1); else if (c === 'rw') seek(-1);
  });
  setInterval(function () {
    var v = V(); if (!v || !isFinite(v.duration)) return;
    P({ k: 'time', t: v.currentTime, d: v.duration, p: v.paused });
    if (bar.classList.contains('on')) paint();
  }, 3000);
  var hooked = null;
  setInterval(function () { var v = V(); if (v && v !== hooked) { hooked = v; try { v.play(); } catch (e) {} v.addEventListener('ended', function () { P({ k: 'ended' }); }); } }, 1500);
})();
