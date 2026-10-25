import os
os.chdir(r'D:\lift\app')
a = open(r'renderer\app.js', encoding='utf8').read()

old_start = a.index("  let T = null, R = null, bdSrc = '', logoSrc = '';")
old_end = a.index("  const posterSrc = posterOk ||")
new = """  let T = null, R = null, bdSrc = '', logoSrc = '', tmWhy = '';
  if (tm.has) {
    T = await cap(window.lift.tmdbFind({ name: d.name, origin_name: d.origin_name || inf.name_eng, year: d.year, type: d.type }), tm.slow ? 15000 : 8000);
    if (!alive()) return;
    if (!T) tmWhy = 'TMDB не ответил вовремя';
    else if (T.error) { tmError(T.error); tmWhy = { BAD_KEY: 'TMDB не принял ключ', NETWORK: 'TMDB недоступен', TIMEOUT: 'TMDB отвечает слишком долго', HTTP: 'TMDB вернул ошибку', NO_KEY: 'не задан ключ TMDB' }[T.error] || 'ошибка TMDB (' + T.error + ')'; T = null; }
    else if (T.none) { tmWhy = 'этот фильм не найден в TMDB'; T = null; }
  } else tmWhy = 'не задан ключ TMDB';
  // каждая часть ждёт отдельно: если одна из картинок не успела, остальное всё равно показываем
  const [posterOk, bd0, logo0, R0] = await Promise.all([
    cap(pre(d.poster), 6000),
    T && T.backdrop ? cap(pre(TMG(T.backdrop, 'w1280')), tm.slow ? 12000 : 8000) : '',
    T && T.logo ? cap(pre(TMG(T.logo, 'w500')), tm.slow ? 12000 : 8000) : '',
    T ? cap(window.lift.ratings({ kind: T.kind, tmdb: T.tmdb, imdb: T.imdb }).catch(() => null), tm.slow ? 12000 : 8000) : null
  ]);
  if (!alive()) return;
  bdSrc = bd0 || ''; logoSrc = logo0 || ''; R = R0 || null;
  if (T && T.backdrop && !bdSrc) tmWhy = 'картинки TMDB не загрузились (см. Настройки → Проверка связи)';
"""
a = a[:old_start] + new + a[old_end:]
a = a.replace("  const posterSrc = posterOk ||", "  const posterSrc = (posterOk || '') ||", 1)

# подсказка рядом с оценками
old = '        <div class="det-rates" style="--i:5">'
assert old in a
a = a.replace(old, '        ${tmWhy ? `<div class="hint" style="--i:5;margin:10px 0 0;opacity:.75">Данные TMDB не загружены: ${esc(tmWhy)}. Откройте Настройки → Проверка связи.</div>` : \'\'}\n' + old, 1)
open(r'renderer\app.js', 'w', encoding='utf8').write(a)

j = open('package.json', encoding='utf8').read().replace('"version": "2.7.0"', '"version": "2.7.1"')
open('package.json', 'w', encoding='utf8').write(j)
c = open('CHANGELOG.md', encoding='utf8').read().replace("# Что нового\n", "# Что нового\n\n## 2.7.1\n- Страница фильма: части TMDB (фон, логотип, рейтинги) ждутся каждая отдельно. Раньше, если одна картинка не успевала за 5 секунд, терялись и фон, и логотип, и рейтинги, даже уже полученные.\n- Если данные TMDB не загрузились, страница теперь пишет причину (нет ключа, TMDB не ответил, фильм не найден, картинки не загрузились) и подсказывает про «Проверку связи».\n", 1)
open('CHANGELOG.md', 'w', encoding='utf8').write(c)
print('ok')
