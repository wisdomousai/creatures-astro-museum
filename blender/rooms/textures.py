"""The rooms' pictures, from what the generator made (generate.py) into textures/:

    python3 blender/rooms/textures.py GENERATED_DIR

- the walls' wallpaper (<theme>/back, left, right, front) as it was painted, 1536 wide;
- the tiling ones (floors, bark, rock, ice...) at 1024;
- the sheets of cut-outs (leaves, flowers, sea creatures, wings) keyed off their flat
  background, one file a cut-out (<sheet>-0, -1...), trimmed to it;
- a ceiling for each room: the wallpaper's top edges, blending in to the theme's zenith.

All webp. Needs Pillow and numpy.
"""

import os
import sys

import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'textures')

#: Sheets of cut-outs: the key colour and the grid (columns, rows).
SHEETS = {
    'jungle/leaves': ((255, 0, 255), (2, 2)),
    'forest/leaves': ((255, 0, 255), (2, 2)),
    'aquarium/plants': ((255, 0, 255), (2, 2)),
    'village/flowers': ((0, 255, 255), (2, 2)),
    'alps/flowers': ((0, 255, 255), (2, 2)),
    'wings': ((0, 255, 0), (2, 2)),
}
WALLS = ('back', 'left', 'right', 'front')
#: Rooms under the open sky: their ceiling is the sky's, from this at its edges (whatever's
#: at the top of their walls: trees, a roof) to the zenith.
SKY = {
    'snow': (214, 226, 238),
    'village': (150, 196, 236),
    'alps': (104, 156, 222),
}
#: Straight up from the middle of each room: what the wallpaper's top edges blend in to.
ZENITH = {
    'jungle': (34, 58, 30),
    'forest': (52, 70, 44),
    'aquarium': (190, 236, 240),
    'snow': (196, 214, 232),
    'village': (92, 150, 214),
    'alps': (52, 104, 186),
    'cat-cafe': (240, 228, 204),
    'dog-park': (104, 162, 222),
    'aviary': (226, 238, 228),
    'robot-park': (118, 178, 232),
}


def key_out(im, key):
    """The sheet with its flat background made transparent, its edges' colour cleaned."""
    rgb = np.asarray(im.convert('RGB')).astype(np.float32)
    d = np.sqrt(((rgb - np.array(key, np.float32)) ** 2).sum(-1))
    a = np.clip((d - 70) / 110, 0, 1)
    # Despill: where it's see-through at all, take the key's colour back out of what's
    # left (its strong channels no stronger than the others).
    hot = [i for i, k in enumerate(key) if k > 128]
    cold = [i for i, k in enumerate(key) if k <= 128]
    cap = rgb[..., cold].max(-1)
    edge = a < 1
    for i in hot:
        rgb[..., i] = np.where(edge, np.minimum(rgb[..., i], cap), rgb[..., i])
    out = np.dstack([rgb, a * 255]).astype(np.uint8)
    im = Image.fromarray(out, 'RGBA')
    # A little erosion, so no rim of the key shows.
    alpha = im.getchannel('A').filter(ImageFilter.MinFilter(3))
    im.putalpha(alpha)
    return im


def cut(im, grid):
    """Each cell's cut-out, trimmed to what's in it."""
    cols, rows = grid
    w, h = im.size
    out = []
    for j in range(rows):
        for i in range(cols):
            cell = im.crop((i * w // cols, j * h // rows, (i + 1) * w // cols, (j + 1) * h // rows))
            # Its subject: the most of it in one run of rows and of columns (a neighbour's
            # tail poking in over the cell's edge is left out).
            a = cell.getchannel('A')
            t, b = _run([sum(1 for x in range(0, a.width, 2) if a.getpixel((x, y)) > 24) for y in range(a.height)])
            l, r = _run([sum(1 for y in range(t, b, 2) if a.getpixel((x, y)) > 24) for x in range(a.width)])
            pad = 4
            cell = cell.crop((max(0, l - pad), max(0, t - pad), min(cell.width, r + pad), min(cell.height, b + pad)))
            cell.thumbnail((512, 512), Image.LANCZOS)
            out.append(cell)
    return out


def _run(counts):
    """The run of non-empty places (rows, columns) with the most in it: (start, end)."""
    best, start, mass = (0, len(counts)), None, 0
    top = -1
    for i, c in enumerate(counts + [0]):
        if c and start is None:
            start, mass = i, 0
        if c:
            mass += c
        elif start is not None:
            if mass > top:
                top, best = mass, (start, i)
            start = None
    return best


def ceiling(theme):
    """The wallpaper's top edges, round a square, blending in to the zenith in the middle."""
    n = 256
    tops = {}
    for wall in WALLS:
        im = Image.open(os.path.join(OUT, theme, f'{wall}.webp')).convert('RGB')
        strip = im.crop((0, 0, im.width, max(1, im.height // 24))).resize((n, 1), Image.BOX)
        tops[wall] = [strip.getpixel((i, 0)) for i in range(n)]
    z = ZENITH[theme]
    c = Image.new('RGB', (n, n))
    px = c.load()
    for y in range(n):
        for x in range(n):
            # Seen from below, from the doorway: the back wall at the top of the picture,
            # the left wall on the left (u runs left to right along each wall's top).
            dl, dr, dt, db = x, n - 1 - x, y, n - 1 - y
            d = min(dl, dr, dt, db)
            if d == dt:
                edge = tops['back'][x]
            elif d == db:
                edge = tops['front'][n - 1 - x]
            elif d == dl:
                edge = tops['left'][n - 1 - y]
            else:
                edge = tops['right'][y]
            if theme in SKY:
                edge = SKY[theme]
            t = min(1.0, d / (n * 0.42)) ** 0.8
            px[x, y] = tuple(int(e + (zz - e) * t) for e, zz in zip(edge, z))
    c.filter(ImageFilter.GaussianBlur(6)).save(os.path.join(OUT, theme, 'ceiling.webp'), quality=88)


def main(src):
    for root, _, files in os.walk(src):
        for f in files:
            if not f.endswith('.png'):
                continue
            name = os.path.relpath(os.path.join(root, f), src)[:-4]
            im = Image.open(os.path.join(root, f))
            os.makedirs(os.path.dirname(os.path.join(OUT, name)) or OUT, exist_ok=True)
            if name in SHEETS:
                key, grid = SHEETS[name]
                for i, c in enumerate(cut(key_out(im, key), grid)):
                    c.save(os.path.join(OUT, f'{name}-{i}.webp'), quality=90)
            elif name.split('/')[-1] in WALLS:
                im = im.convert('RGB')
                im.resize((1536, round(1536 * im.height / im.width)), Image.LANCZOS).save(
                    os.path.join(OUT, f'{name}.webp'), quality=88)
            else:
                im.convert('RGB').resize((1024, 1024), Image.LANCZOS).save(
                    os.path.join(OUT, f'{name}.webp'), quality=88)
            print('texture', name)
    for theme in ZENITH:
        if all(os.path.exists(os.path.join(OUT, theme, f'{w}.webp')) for w in WALLS):
            ceiling(theme)
            print('ceiling', theme)


if __name__ == '__main__':
    main(sys.argv[1])
