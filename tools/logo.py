"""Новый логотип Luma: вырезает иконку из присланной картинки и превращает метку в вектор.
Результат: tools/logo_out/icon-1024.png, tools/logo_out/mark.svg (метка без фона), tools/logo_out/paths.json."""
import json, os
import numpy as np
from PIL import Image, ImageDraw
import potrace

SRC = r'D:\lift\1792844346968.jpg'
OUT = os.path.join(os.path.dirname(__file__), 'logo_out'); os.makedirs(OUT, exist_ok=True)
im = Image.open(SRC).convert('RGB'); a = np.asarray(im).astype(int)

# тёмная плитка иконки (фон картинки серый ~ (64,64,64))
dark = (a.sum(axis=2) < 90)
ys, xs = np.where(dark)
x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
print('плитка', x0, y0, x1, y1)
tile = im.crop((x0, y0, x1, y1))
S = max(tile.size)
sq = Image.new('RGB', (S, S), (11, 12, 16)); sq.paste(tile, ((S - tile.width) // 2, (S - tile.height) // 2))

# иконка 1024 со скруглёнными углами и прозрачным фоном
big = sq.resize((1024, 1024), Image.LANCZOS).convert('RGBA')
k = 4; m = Image.new('L', (1024 * k, 1024 * k), 0)
ImageDraw.Draw(m).rounded_rectangle((2 * k, 2 * k, 1022 * k, 1022 * k), radius=int(0.225 * 1024 * k), fill=255)
big.putalpha(m.resize((1024, 1024), Image.LANCZOS))
big.save(os.path.join(OUT, 'icon-1024.png'))

# метка: розовая и золотая части
arr = np.asarray(sq).astype(int)
r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
pink = (r > 190) & (g < 130) & (b > 40) & (b < 170)
gold = (r > 210) & (g > 140) & (b < 90)
ys, xs = np.where(pink | gold)
bx0, bx1, by0, by1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
print('метка', bx0, by0, bx1, by1)

def trace(mask):
    bm = potrace.Bitmap(~mask)
    pl = bm.trace(turdsize=40, turnpolicy=potrace.POTRACE_TURNPOLICY_MINORITY, alphamax=1.0, opticurve=True, opttolerance=0.3)
    d = []
    for c in pl:
        sp = c.start_point; d.append('M%.1f %.1f' % (sp.x, sp.y))
        for s in c.segments:
            if s.is_corner: d.append('L%.1f %.1f L%.1f %.1f' % (s.c.x, s.c.y, s.end_point.x, s.end_point.y))
            else: d.append('C%.1f %.1f %.1f %.1f %.1f %.1f' % (s.c1.x, s.c1.y, s.c2.x, s.c2.y, s.end_point.x, s.end_point.y))
        d.append('Z')
    return ' '.join(d)

# золото рисуем поверх розового; у розового заполняем золотые участки, чтобы не было дыр
pink_full = pink | gold
dp, dg = trace(pink_full), trace(gold)
pad = 6
vb = f'{bx0 - pad} {by0 - pad} {bx1 - bx0 + 2 * pad} {by1 - by0 + 2 * pad}'
svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}"><path fill="#FF3366" fill-rule="evenodd" d="{dp}"/><path fill="#FFB800" fill-rule="evenodd" d="{dg}"/></svg>'
open(os.path.join(OUT, 'mark.svg'), 'w', encoding='utf8').write(svg)
json.dump({'viewBox': vb, 'pink': dp, 'gold': dg}, open(os.path.join(OUT, 'paths.json'), 'w'))
print('ok', len(svg))
