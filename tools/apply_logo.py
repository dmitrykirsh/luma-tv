"""Подставляет новый логотип в десктопную и ТВ-версии: favicon, logo.js, иконки, баннер ТВ."""
import json, os, re
from PIL import Image, ImageDraw, ImageFont

OUT = r'D:\lift\tv\tools\logo_out'
P = json.load(open(os.path.join(OUT, 'paths.json'), encoding='utf8'))
vx, vy, vw, vh = [float(x) for x in P['viewBox'].split()]
PINK, GOLD = P['pink'], P['gold']

def mark_group(height=44, x=2, y=2):
    s = height / vh
    return f'<g transform="translate({x} {y}) scale({s:.5f}) translate({-vx:.1f} {-vy:.1f})"><path fill="#FF3366" fill-rule="evenodd" d="{PINK}"/><path fill="#FFB800" fill-rule="evenodd" d="{GOLD}"/></g>', vw * s

def mark_svg(size_attr=''):
    return f'<svg viewBox="{P["viewBox"]}" {size_attr}><path fill="#FF3366" fill-rule="evenodd" d="{PINK}"/><path fill="#FFB800" fill-rule="evenodd" d="{GOLD}"/></svg>'

# ---------- иконки PNG ----------
icon = Image.open(os.path.join(OUT, 'icon-1024.png'))
D = r'D:\lift\app'
icon.resize((256, 256), Image.LANCZOS).save(os.path.join(D, 'build', 'icon.png'))
icon.resize((512, 512), Image.LANCZOS).save(os.path.join(D, 'build', 'icon-512.png'))
T = r'D:\lift\tv\app\src\main\res\drawable-nodpi'
icon.resize((256, 256), Image.LANCZOS).save(os.path.join(T, 'ic_launcher.png'))

# баннер ТВ 320x180: иконка слева, слово Luma и слоган справа
k = 3; W, H = 320 * k, 180 * k
b = Image.new('RGB', (W, H), (11, 12, 16)); d = ImageDraw.Draw(b)
ic = icon.resize((110 * k, 110 * k), Image.LANCZOS); b.paste(ic, (30 * k, 35 * k), ic)
d.text((160 * k, 52 * k), 'Luma', font=ImageFont.truetype('C:/Windows/Fonts/seguibl.ttf', 44 * k), fill=(248, 249, 250))
d.text((162 * k, 110 * k), 'Включи свою историю', font=ImageFont.truetype('C:/Windows/Fonts/segoeuib.ttf', 12 * k), fill=(142, 149, 165))
b.resize((320, 180), Image.LANCZOS).save(os.path.join(T, 'banner.png'))

# ---------- favicon (десктоп) ----------
g, w = mark_group(height=40, x=0, y=0)
fav = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><rect width="64" height="64" rx="14" fill="#0B0C10"/><g transform="translate({(64 - w) / 2:.2f} 12)">{g}</g></svg>\n'
open(os.path.join(D, 'renderer', 'favicon.svg'), 'w', encoding='utf8').write(fav)

# ---------- logo.js (десктоп): метка в квадрате 48 и слово LUMA ----------
g, w = mark_group(height=44, x=2, y=2)
src = open(os.path.join(D, 'renderer', 'logo.js'), encoding='utf8').read()
a = src.index('  const MARK ='); bidx = src.index('  /** lumaLogo(')
src = src[:a] + "  const MARK = '" + g.replace("'", "\\'") + "';\n\n" + src[bidx:]
src = src.replace('Логотип Luma: монограмма «L», стопа которой переходит в треугольник Play (#FF3366),\n   золотой луч проектора (#FFB800)', 'Логотип Luma: монограмма «L» с треугольником Play (#FF3366) и золотым лучом (#FFB800)')
src = src.replace('x="58" y="34"', 'x="%d" y="34"' % round(w + 12))
open(os.path.join(D, 'renderer', 'logo.js'), 'w', encoding='utf8').write(src)

# ---------- ТВ: значок в интерфейсе и на заставке ----------
A = r'D:\lift\tv\app\src\main\assets'
app = open(os.path.join(A, 'app.js'), encoding='utf8').read()
app = re.sub(r"const LOGO = '<svg.*?</svg>';", lambda m: "const LOGO = '" + mark_svg().replace("'", "\\'") + "';", app, flags=re.S)
open(os.path.join(A, 'app.js'), 'w', encoding='utf8').write(app)
idx = open(os.path.join(A, 'index.html'), encoding='utf8').read()
idx = re.sub(r'<div id="splash"><svg.*?</svg>', '<div id="splash">' + mark_svg(), idx, flags=re.S)
open(os.path.join(A, 'index.html'), 'w', encoding='utf8').write(idx)
print('готово')
