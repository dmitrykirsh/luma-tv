import os
os.chdir(r'D:\lift\app')

# ---- backup.js ----
s = open('backup.js', encoding='utf8').read()
old = "  ipcMain.handle('backup:cancel', () => { pending = null; return { ok: true }; });\n};"
assert old in s
s = s.replace(old, """  ipcMain.handle('backup:cancel', () => { pending = null; return { ok: true }; });

  // для синхронизации с ТВ: выгрузка данных и слияние присланных
  function applyObj(obj) {
    if (!valid(obj)) throw new Error('FORMAT');
    const store = getStore(), merged = merge(store, obj.data);
    for (const k of Object.keys(store)) delete store[k];
    Object.assign(store, merged);
    for (const [name, value] of Object.entries(obj.secrets || {})) if (secrets[name] && typeof value === 'string' && value) secrets[name].set(value);
    saveStore();
    return summary(obj);
  }
  return { collect, applyObj, seal: (plain, pw) => JSON.parse(seal(JSON.parse(plain), pw)), unseal: (file, pw) => JSON.stringify(unseal(file, pw)) };
};""")
old = "} else if (k === 'lbRecent')"
assert old in s
s = s.replace(old, """} else if (k === 'tvFav') out.tvFav = [...new Set([...(cur.tvFav || []), ...(v || [])])];
      else if (k === 'tvStats') { out.tvStats = { ...(cur.tvStats || {}) }; for (const [id, st] of Object.entries(v || {})) { const o = out.tvStats[id]; if (!o || (st.last || 0) > (o.last || 0)) out.tvStats[id] = { ...st, n: Math.max(st.n || 0, o ? o.n || 0 : 0), t: Math.max(st.t || 0, o ? o.t || 0 : 0) }; } }
      else if (k === 'progress') { out.progress = { ...(cur.progress || {}) }; for (const [pk, pv] of Object.entries(v || {})) if (!out.progress[pk] || (pv.ts || 0) > (out.progress[pk].ts || 0)) out.progress[pk] = pv; }
      else if (k === 'tvCustom') { const c = cur.tvCustom || []; out.tvCustom = [...c, ...(v || []).filter((e) => e && !c.some((x) => x.url && x.url === e.url))]; }
      } else if (k === 'lbRecent')""", 1)
open('backup.js', 'w', encoding='utf8').write(s)

# ---- main.js ----
m = open('main.js', encoding='utf8').read()
assert "require('./backup')({" in m
m = m.replace("require('./backup')({", "const backupApi = require('./backup')({", 1)
i = m.index("const backupApi = require('./backup')({"); j = m.index("\n});", i) + 4
m = m[:j] + "\nrequire('./sync')({ ipcMain, app, getWindow: () => win, backup: backupApi, reload: () => { if (win && !win.isDestroyed()) win.webContents.send('sync:applied'); } });" + m[j:]
open('main.js', 'w', encoding='utf8').write(m)

# ---- preload.js ----
p = open('preload.js', encoding='utf8').read()
old = "  backupCancel: () => ipcRenderer.invoke('backup:cancel'),"
assert old in p
p = p.replace(old, old + """
  syncScan: () => ipcRenderer.invoke('sync:scan'),
  syncPush: (o) => ipcRenderer.invoke('sync:push', o),
  syncCode: (c) => ipcRenderer.invoke('sync:code', c),
  syncCancel: () => ipcRenderer.invoke('sync:cancel'),
  onSyncRequest: (cb) => ipcRenderer.on('sync:request', (_e, d) => cb(d)),
  onSyncRequestEnd: (cb) => ipcRenderer.on('sync:request-end', () => cb()),
  onSyncApplied: (cb) => ipcRenderer.on('sync:applied', () => cb()),""", 1)
open('preload.js', 'w', encoding='utf8').write(p)

# ---- renderer/app.js: карточка «Телевизор» и окно запроса кода ----
a = open(r'renderer\app.js', encoding='utf8').read()
old = '    <section class="set-card" id="bkCard">'
assert old in a
a = a.replace(old, '''    <section class="set-card" id="tvSync">
      <div class="set-head"><div><h2>Телевизор</h2><p>Синхронизация с Luma на ТВ в домашней сети: избранное, история, прогресс, подборки, каналы и ключи. Без облака и аккаунтов.</p></div></div>
      <div class="key-row"><button class="btn primary" id="tvFind">Найти телевизор</button></div>
      <div id="tvList" class="bk-box" style="display:none"></div>
    </section>
''' + old, 1)
old = "  wireBackup();\n  paintUpdateCard();"
assert old in a
a = a.replace(old, "  wireBackup();\n  wireTvSync();\n  paintUpdateCard();", 1)
a += '''

/* ================= синхронизация с ТВ ================= */
function wireTvSync() {
  const list = $('#tvList'), btn = $('#tvFind'); if (!btn) return;
  const show = (html) => { list.style.display = ''; list.innerHTML = html; };
  const ERR = { BAD_CODE: 'Код не подошёл: введите код с экрана ТВ.', NETWORK: 'Не получилось связаться с ТВ. Он должен быть включён, а Luma TV открыта на экране Настройки → Синхронизация.', FORMAT: 'Код состоит из 4 цифр.', TIMEOUT: 'ТВ не ответил вовремя.', ERR: 'Не получилось синхронизировать.' };
  btn.onclick = async () => {
    btn.disabled = true; show('<div class="spin"></div>');
    const tvs = await window.lift.syncScan(); btn.disabled = false;
    if (!tvs.length) { show('<p class="hint">Телевизоры не нашлись. На ТВ откройте Luma → Настройки → Синхронизация и нажмите «Найти телевизор» ещё раз.</p>'); return; }
    show(tvs.map((t, i) => `<div class="key-row" style="margin:6px 0"><b style="min-width:200px">${esc(t.name || 'Телевизор')} <small class="hint">${esc(t.ip)}</small></b><input class="tvcode" data-i="${i}" inputmode="numeric" maxlength="4" placeholder="Код с ТВ" style="width:130px"><button class="btn primary tvgo" data-i="${i}">Синхронизировать</button></div>`).join('') + '<p class="hint" id="tvMsg">Введите 4-значный код, который показан на экране ТВ.</p>');
    $$('.tvgo', list).forEach((b) => b.onclick = async () => {
      const t = tvs[+b.dataset.i], code = $(`.tvcode[data-i="${b.dataset.i}"]`, list).value;
      const m = $('#tvMsg'); m.className = 'hint'; m.textContent = 'Синхронизируем…'; b.disabled = true;
      const r = await window.lift.syncPush({ ip: t.ip, port: t.port, code }); b.disabled = false;
      if (r.ok) { await initStore(); await refreshTmdb(); updateBadges(); m.textContent = 'Готово: данные объединены с «' + (r.name || 'ТВ') + '».'; toast('Синхронизация с ТВ завершена'); }
      else { m.className = 'hint bad'; m.textContent = ERR[r.error] || ERR.ERR; }
    });
  };
}
// ТВ нашёл этот компьютер и прислал данные: спрашиваем код с экрана ТВ
window.lift.onSyncRequest(() => {
  $('#tvAsk')?.remove();
  document.body.insertAdjacentHTML('beforeend', `<div id="tvAsk" style="position:fixed;inset:0;z-index:9999;background:rgba(5,6,8,.7);display:grid;place-items:center"><div class="set-card" style="width:420px;margin:0"><div class="set-head"><div><h2>Телевизор хочет синхронизироваться</h2><p>Введите код, показанный на экране ТВ.</p></div></div>
    <div class="key-row"><input id="tvAskCode" inputmode="numeric" maxlength="4" placeholder="Код" style="width:140px"><button class="btn primary" id="tvAskOk">Подтвердить</button><button class="btn ghost" id="tvAskNo">Отклонить</button></div><p class="hint" id="tvAskMsg"></p></div></div>`);
  $('#tvAskCode').focus();
  const go = async () => {
    const r = await window.lift.syncCode($('#tvAskCode').value);
    if (r.ok) { $('#tvAsk')?.remove(); await initStore(); await refreshTmdb(); updateBadges(); toast('Синхронизация с ТВ завершена'); if (currentRoute?.name === 'settings') renderSettings($('#view')); }
    else { $('#tvAskMsg').className = 'hint bad'; $('#tvAskMsg').textContent = r.error === 'TOO_MANY' ? 'Слишком много попыток.' : 'Код не подошёл.'; if (r.error === 'TOO_MANY') setTimeout(() => $('#tvAsk')?.remove(), 1500); }
  };
  $('#tvAskOk').onclick = go; $('#tvAskCode').onkeydown = (e) => { if (e.key === 'Enter') go(); };
  $('#tvAskNo').onclick = () => { window.lift.syncCancel(); $('#tvAsk')?.remove(); };
});
window.lift.onSyncRequestEnd(() => $('#tvAsk')?.remove());
window.lift.onSyncApplied(async () => { await initStore(); await refreshTmdb(); updateBadges(); });
'''
open(r'renderer\app.js', 'w', encoding='utf8').write(a)
print('ok')
