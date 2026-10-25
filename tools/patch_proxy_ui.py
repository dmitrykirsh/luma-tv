import os
os.chdir(r'D:\lift\app')
a = open(r'renderer\app.js', encoding='utf8').read()
script = open(r'cloudflare-worker\tmdb-proxy.js', encoding='utf8').read()

i = a.index('id="tmSave"')
j = a.index('</section>', i) + len('</section>')
card = '''
    <section class="set-card" id="tmProxyCard">
      <div class="set-head"><div><h2>TMDB не открывается? Свой адрес-посредник</h2><p>Если провайдер блокирует TMDB, а VPN не хочется, можно бесплатно поднять посредника на Cloudflare Workers за пару минут. Luma будет обращаться к нему, а не к TMDB напрямую.</p></div>
      <span class="status ${tmProxyUrl ? 'ok' : ''}" id="tpStatus">${tmProxyUrl ? 'Подключён' : 'Не используется'}</span></div>
      <ol class="steps">
        <li><i>1</i><div><b>Зарегистрируйтесь на Cloudflare</b><span>Бесплатный аккаунт на dash.cloudflare.com, карта не нужна.</span><button class="pill" data-ext="https://dash.cloudflare.com/sign-up">Открыть Cloudflare ↗</button></div></li>
        <li><i>2</i><div><b>Создайте Worker</b><span>В меню слева: Compute (Workers) → Create → Create Worker. Любое имя, например luma-tmdb. Нажмите Deploy, затем Edit code.</span></div></li>
        <li><i>3</i><div><b>Вставьте наш скрипт</b><span>Удалите весь код в редакторе, вставьте скопированный и нажмите Deploy.</span><button class="pill" id="tpCopy">Скопировать скрипт</button></div></li>
        <li><i>4</i><div><b>Вставьте адрес Worker сюда</b><span>Адрес вида https://luma-tmdb.ваше-имя.workers.dev (он показан на странице Worker). Luma проверит его и запомнит.</span></div></li>
      </ol>
      <div class="key-row"><input id="tpUrl" placeholder="https://luma-tmdb.ваше-имя.workers.dev" value="${esc(tmProxyUrl)}" spellcheck="false" autocomplete="off"><button class="btn primary" id="tpSave">Проверить и сохранить</button>${tmProxyUrl ? '<button class="btn ghost" id="tpDel">Отключить</button>' : ''}</div>
      <p class="hint" id="tpMsg"></p>
      <p class="hint">Через посредника идут запросы к TMDB (в том числе ваш ключ), как через любой прокси. Скрипт ничего не хранит и пересылает только адреса TMDB.</p>
    </section>'''
a = a[:j] + card + a[j:]

old = '  view.innerHTML = `<div class="page-head"><h1>Настройки</h1></div>'
assert old in a
a = a.replace(old, "  const tmProxyUrl = (await window.lift.tmdbProxyGet()).url || '';\n" + old, 1)

w = script.replace('\\', '\\\\').replace('`', '\\`').replace('${', '\\${')
handlers = '  const TP_SCRIPT = `' + w + '''`;
  $('#tpCopy').onclick = async () => { try { await navigator.clipboard.writeText(TP_SCRIPT); toast('Скрипт скопирован'); } catch { toast('Не получилось скопировать'); } };
  $('#tpSave').onclick = async () => {
    const m = $('#tpMsg'); m.className = 'hint'; m.textContent = 'Проверяю адрес…';
    const r = await window.lift.tmdbProxySet($('#tpUrl').value);
    if (r.ok) { toast(r.url ? 'Посредник подключён' : 'Посредник отключён'); renderSettings($('#view')); return; }
    m.className = 'hint bad';
    m.textContent = { FORMAT: 'Нужен адрес вида https://имя.workers.dev', NOT_PROXY: 'По этому адресу отвечает не наш скрипт: проверьте, что вставили код целиком и нажали Deploy', NETWORK: 'Адрес не открылся. Проверьте его и попробуйте ещё раз' }[r.error] || 'Не получилось';
  };
  $('#tpDel') && ($('#tpDel').onclick = async () => { await window.lift.tmdbProxySet(''); toast('Посредник отключён'); renderSettings($('#view')); });
'''
k = a.index("  const omMsg = $('#omMsg'), omIn = $('#omKey');")
a = a[:k] + handlers + a[k:]
open(r'renderer\app.js', 'w', encoding='utf8').write(a)
print('ok')
