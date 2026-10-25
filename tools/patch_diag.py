import os
os.chdir(r'D:\lift\app')
m = open('main.js', encoding='utf8').read()
old = "const updater = require('./updater')"
assert old in m
m = m.replace(old, "require('./diag')({ ipcMain, app, getStore: () => store, tm: tmApi });\n" + old, 1)
open('main.js', 'w', encoding='utf8').write(m)

p = open('preload.js', encoding='utf8').read()
p = p.replace("  tmdbClear:", "  diagRun: () => ipcRenderer.invoke('diag:run'),\n  tmdbClear:", 1)
open('preload.js', 'w', encoding='utf8').write(p)

j = open('package.json', encoding='utf8').read()
j = j.replace('      "sync.js",', '      "sync.js",\n      "diag.js",', 1)
j = j.replace('"version": "2.6.4"', '"version": "2.6.5"')
open('package.json', 'w', encoding='utf8').write(j)

a = open(r'renderer\app.js', encoding='utf8').read()
card = '''
    <section class="set-card" id="diagCard">
      <div class="set-head"><div><h2>Проверка связи</h2><p>Если что-то не грузится (поиск, кадры, рейтинги, трейлеры), нажмите кнопку: Luma проверит нужные сервисы и покажет отчёт, который можно скопировать и отправить. Ключи в отчёт не попадают.</p></div></div>
      <div class="key-row"><button class="btn primary" id="dgRun">Проверить</button><button class="btn ghost" id="dgCopy" style="display:none">Скопировать отчёт</button></div>
      <pre id="dgOut" class="hint" style="display:none;white-space:pre-wrap;user-select:text;margin-top:12px;font-size:13px;line-height:1.6"></pre>
    </section>'''
marker = '    <section class="set-card" id="tvSync">'
assert marker in a
a = a.replace(marker, card + '\n' + marker, 1)
old = "  wireTvSync();\n"
assert old in a
a = a.replace(old, old + '''  $('#dgRun').onclick = async () => {
    const b = $('#dgRun'), out = $('#dgOut'); b.disabled = true; b.textContent = 'Проверяем…'; out.style.display = ''; out.textContent = 'Это займёт до 15 секунд…';
    const r = await window.lift.diagRun().catch(() => ({ text: 'Проверка не удалась' }));
    out.textContent = r.text; b.disabled = false; b.textContent = 'Проверить ещё раз'; $('#dgCopy').style.display = '';
  };
  $('#dgCopy').onclick = async () => { try { await navigator.clipboard.writeText($('#dgOut').textContent); toast('Отчёт скопирован'); } catch { toast('Не получилось скопировать'); } };
''', 1)
open(r'renderer\app.js', 'w', encoding='utf8').write(a)

c = open('CHANGELOG.md', encoding='utf8').read()
c = c.replace("# Что нового\n", "# Что нового\n\n## 2.6.5\n- Настройки → «Проверка связи»: одна кнопка проверяет доступность серверов сайта (каталог и поиск по каждому зеркалу), TMDB напрямую и через посредника, ключ TMDB, Rutube и YouTube. Отчёт копируется и без ключей его можно отправить.\n", 1)
open('CHANGELOG.md', 'w', encoding='utf8').write(c)
print('ok')
