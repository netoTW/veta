"""Corta un tríptico transparente (bajo · medio · alto) en tres piedras cuadradas y
las escribe como webp a 480 y 96 px. Uso:
   python3 scripts/piedras.py <triptico.png> public/img/tier [bajo,medio,alto] [lift]
lift: multiplicador de luminancia sobre la roca (no sobre la veta) para que aguante
sobre #0C0E10 a 24 px. Por defecto 1.0 (nada)."""
import sys, pathlib
from PIL import Image, ImageEnhance
import numpy as np

src, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
names = (sys.argv[3] if len(sys.argv) > 3 else 'bajo,medio,alto').split(',')
lift = float(sys.argv[4]) if len(sys.argv) > 4 else 1.0
out.mkdir(parents=True, exist_ok=True)

im = Image.open(src).convert('RGBA'); a = np.array(im)[:, :, 3]
cols = (a > 8).sum(axis=0) > 0
runs, start = [], None
for x, v in enumerate(cols):
    if v and start is None: start = x
    if not v and start is not None: runs.append((start, x)); start = None
if start is not None: runs.append((start, len(cols)))
runs = [r for r in runs if r[1] - r[0] > 60]
assert len(runs) >= len(names), f'esperaba {len(names)} piedras, encontré {len(runs)}'

for name, (x0, x1) in zip(names, runs):
    sub = im.crop((x0, 0, x1, im.height)); sa = np.array(sub)[:, :, 3]
    ys = np.where((sa > 8).sum(axis=1) > 0)[0]; sub = sub.crop((0, ys[0], sub.width, ys[-1] + 1))
    if lift != 1.0:
        rgb = np.array(sub).astype(np.float32)
        # la veta (verde o dorado saturado) no se toca: sólo la roca gris
        r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
        sat = (np.max(rgb[..., :3], axis=2) - np.min(rgb[..., :3], axis=2)) / (np.max(rgb[..., :3], axis=2) + 1)
        m = (sat < 0.22)[..., None]
        rgb[..., :3] = np.where(m, np.clip(rgb[..., :3] * lift, 0, 255), rgb[..., :3])
        sub = Image.fromarray(rgb.astype(np.uint8), 'RGBA')
    S = max(sub.width, sub.height) + int(sub.width * 0.06)
    sq = Image.new('RGBA', (S, S), (0, 0, 0, 0)); sq.alpha_composite(sub, ((S - sub.width) // 2, (S - sub.height) // 2))
    for px in (480, 96):
        sq.resize((px, px), Image.LANCZOS).save(out / f'{name}-{px}.webp', 'WEBP', quality=88, method=6)
    print(name, sub.size, '→', out / f'{name}-480.webp')
