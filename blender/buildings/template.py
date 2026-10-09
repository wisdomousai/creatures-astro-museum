"""A sample building of your own: a lobby, a long gallery for the Works with columns down
it, and a reading room for the Library. It shows every name the museum reads
(blender/buildings/README.md); copy it, or open its .blend and change it.

    sh blender/buildings/build.sh            (builds this, exports, compresses, checks)

Blender's z is up and its -y is an object's front (what it shows, or which way a slot
faces). Metres.
"""

import math
import os
import sys

import bpy

here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(here))
import kit  # noqa: E402
import pieces  # noqa: E402
from export_building import export  # noqa: E402
from kit import box, cylinder  # noqa: E402

HEIGHT = 4.0
THICK = 0.24
DOOR = 2.4


def floor(room, x0, y0, x1, y1, **props):
    """A room's floor: NAV_<room>, where the visitor may walk."""
    obj = box(f'NAV_{room}', (x1 - x0, y1 - y0, 0.04), ((x0 + x1) / 2, (y0 + y1) / 2, -0.02), 'Floor', smooth=False)
    for k, v in props.items():
        obj[k] = v
    # And its ceiling, with a light in it.
    box(f'ceiling_{room}', (x1 - x0 + 0.3, y1 - y0 + 0.3, 0.1), ((x0 + x1) / 2, (y0 + y1) / 2, HEIGHT + 0.05), 'Plinth', smooth=False)
    w, d = x1 - x0, y1 - y0
    n = max(1, round(max(w, d) / 4))
    for i in range(n):
        t = (i + 0.5) / n
        at = (x0 + w * t, (y0 + y1) / 2) if w > d else ((x0 + x1) / 2, y0 + d * t)
        box(f'light_{room}_{i}', (1.6, 1.6, 0.06), (at[0], at[1], HEIGHT - 0.03), 'Glow', bevel=0.02)
    return obj


walls = 0


def wall(x0, y0, x1, y1):
    """A wall from (x0, y0) to (x1, y1): WALL_<n>, with a baseboard and a cornice round it."""
    global walls
    walls += 1
    along_x = abs(x1 - x0) > abs(y1 - y0)
    length = abs(x1 - x0) if along_x else abs(y1 - y0)
    mid = ((x0 + x1) / 2, (y0 + y1) / 2)
    size = (length + THICK, THICK, HEIGHT) if along_x else (THICK, length + THICK, HEIGHT)
    box(f'WALL_{walls}', size, (mid[0], mid[1], HEIGHT / 2), 'Wall', smooth=False)
    trim = (size[0] + 0.08, size[1] + 0.08, 0.18) if along_x else (size[0] + 0.08, size[1] + 0.08, 0.18)
    box(f'base_{walls}', trim, (mid[0], mid[1], 0.09), 'Trim', bevel=0.02)
    box(f'cornice_{walls}', trim, (mid[0], mid[1], HEIGHT - 0.12), 'Trim', bevel=0.02)


def doorway(x, y, along_x):
    """The wall over a doorway, and brass-capped posts at its sides."""
    size = (DOOR, THICK, HEIGHT - 2.9) if along_x else (THICK, DOOR, HEIGHT - 2.9)
    box('lintel', size, (x, y, (HEIGHT + 2.9) / 2), 'Wall', smooth=False)
    for s in (-1, 1):
        px, py = (x + s * DOOR / 2, y) if along_x else (x, y + s * DOOR / 2)
        cylinder('post', 0.2, HEIGHT, (px, py, HEIGHT / 2), 'Trim', bevel=0.04)


def empty(name, at, turn=0.0, scale=(1, 1, 1), **props):
    """An empty: a slot, a lane, a sign, the spawn. `turn` (degrees, about z) turns its
    front (-y) from facing -y."""
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_type = 'SINGLE_ARROW' if name.startswith(('SLOT_', 'SIGN_', 'SPAWN')) else 'PLAIN_AXES'
    obj.location = at
    obj.rotation_euler = (0, 0, math.radians(turn))
    obj.scale = scale
    for k, v in props.items():
        obj[k] = v
    bpy.context.collection.objects.link(obj)
    return obj


def column(name, x, y):
    cylinder(name, 0.32, HEIGHT, (x, y, HEIGHT / 2), 'Plinth', bevel=0.05)
    cylinder(f'{name}_foot', 0.42, 0.24, (x, y, 0.12), 'Trim', bevel=0.04)
    cylinder(f'{name}_head', 0.42, 0.24, (x, y, HEIGHT - 0.12), 'Trim', bevel=0.04)
    # What the visitor walks round: COL_.
    empty(f'COL_{name}', (x, y, HEIGHT / 2), scale=(0.45, 0.45, HEIGHT / 2)).empty_display_type = 'CUBE'


def build():
    kit.reset_scene()

    # The rooms. The lobby, the Works' gallery north of it, the Library's room east.
    floor('lobby', -6, -6, 6, 4, kind='lobby')
    floor('works', -4, 4, 4, 20, wing='Works')
    floor('library', 6, -4, 14, 4, wing='Library', title='The reading room')

    # The walls, with doorways from the lobby into each.
    wall(-6, -6, 6, -6)
    wall(-6, -6, -6, 4)
    wall(-6, 4, -DOOR / 2, 4)
    wall(DOOR / 2, 4, 6, 4)
    wall(6, -6, 6, -DOOR / 2)
    wall(6, DOOR / 2, 6, 4)
    doorway(0, 4, True)
    doorway(6, 0, False)
    wall(-4, 4, -4, 20)
    wall(4, 4, 4, 20)
    wall(-4, 20, 4, 20)
    wall(6, -4, 14, -4)
    wall(6, 4, 14, 4)
    wall(14, -4, 14, 4)

    # Columns down the gallery, a bench between each pair.
    for y in (8, 12, 16):
        column(f'col_w{y}', -1.6, y)
        column(f'col_e{y}', 1.6, y)
    for y in (10, 14):
        b = pieces.bench()
        b.location = (0, y, 0)
        b.rotation_euler = (0, 0, math.radians(90))
        empty(f'COL_bench{y}', (0, y, 0.3), scale=(0.3, 0.95, 0.3)).empty_display_type = 'CUBE'

    # Where things are shown. Slots face their -y: turn 90 faces +x, -90 faces -x, 180 +y.
    face = THICK / 2
    for i, y in enumerate((7, 11, 15)):
        empty(f'SLOT_works_w{i}', (-4 + face, y, 1.6), 90, wing='Works', w=2.4, h=1.8)
        empty(f'SLOT_works_e{i}', (4 - face, y, 1.6), -90, wing='Works', w=2.4, h=1.8)
    empty('SLOT_works_end', (0, 20 - face, 1.9), 0, art=True, w=3.2, h=2.4)
    for i, x in enumerate((8.4, 11.6)):
        empty(f'SLOT_library_{i}', (x, 4 - face, 1.2), 0, wing='Library', w=2.0, h=2.4)
    empty('SLOT_library_art', (14 - face, 0, 1.7), -90, art=True, w=2.4, h=1.8)
    empty('SLOT_about', (-6 + face, -1, 1.7), 90, page='about', w=3.2, h=2.6)
    empty('SLOT_desk', (3.4, -1.4, 0), -45, page='contact', mount='floor', w=2.6, h=1.2)
    empty('SLOT_lobby_art_w', (-3.2, 4 - face, 1.7), 0, art=True, w=1.6, h=1.4)
    empty('SLOT_lobby_art_e', (3.2, 4 - face, 1.7), 0, art=True, w=1.6, h=1.4)
    empty('SLOT_lobby_art_s', (0, -6 + face, 1.8), 180, art=True, w=3.0, h=2.0)

    # The crew's lanes: X along, Y back (so a lane faces its -y), scaled to length and
    # width; linked where they meet through a doorway.
    empty('LANE_lobby', (-4.5, 1.0, 0), 0, (9, 2.5, 1), link_start='works:end', link_end='library:start')
    empty('LANE_works', (2.0, 18.5, 0), -90, (13, 1.7, 1))  # (clear of the columns)
    empty('LANE_library', (7.0, 0.5, 0), 0, (6, 2.8, 1))

    # The signs over the doorways, facing the lobby.
    empty('SIGN_works', (0, 4 - face - 0.01, 3.4), 0, text='Works')
    empty('SIGN_library', (6 - face - 0.01, 0, 3.4), -90, text='Library')

    # In at the lobby's south end, looking north (+y).
    empty('SPAWN', (0, -4.4, 0), 0, height=HEIGHT)


if __name__ == '__main__':
    build()
    out = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else 'building.glb'
    blend = os.path.join(os.path.dirname(os.path.abspath(out)), 'building.blend')
    bpy.ops.wm.save_as_mainfile(filepath=blend)
    export(out)
