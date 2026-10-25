p = r'D:\lift\app\renderer\app.js'
a = open(p, encoding='utf8').read()
i = a.index('const TP_SCRIPT = `')
j = a.index('`;', i)
s = open(r'D:\lift\app\cloudflare-worker\tmdb-proxy.js', encoding='utf8').read()
s = s.replace('\\', '\\\\').replace('`', '\\`').replace('${', '\\${')
a = a[:i] + 'const TP_SCRIPT = `' + s + a[j:]
open(p, 'w', encoding='utf8').write(a)
print('pipe in embedded:', '||' in a[i:i + len(s) + 40])
