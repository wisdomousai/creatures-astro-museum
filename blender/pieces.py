"""The museum's kit: the pieces the site builds every hall from, tile by tile.

Each is a function making one object at the origin, where the site puts it (Blender's z
up, -y is the front: three.js's +z, toward the room):

    wall_1m       a metre of wall, x 0..1, both faces panelled, 4 m high
    lintel_2m     the wall over a doorway, x 0..2, from the doorway's top up
    post          a corner or a doorway's side: a rounded pillar, centred
    frame_edge    a metre of a picture's moulding along x, centred (stretched along x)
    frame_corner  the block at a frame's corner
    lamp          the picture light over a frame (stretched along x to its width)
    plinth        a plinth, 1 x 1 x 0.9 (scaled to what stands on it)
    bench         a bench with a velvet cushion, 1.8 long along x
    desk          the front desk, 2.4 along x, its front to -y
    bookshelf     a bookcase, 1.8 wide, its shelves open to -y (the books are the site's)
    arcade_cabinet  an upright arcade machine, 0.72 x 0.8 x 1.85, its back to +y (the screen
                  and the marquee are flat recesses: the site fills them in)
    skylight      a lamp panel for the ceiling, hanging down from z = 0
    sign          a board for over a doorway, its words the site's

Change one, then `npm run kit` (blender/build.sh) to rebuild assets/kit/kit.glb.
"""

import math

import kit
from kit import box, cylinder, extrude, join, lathe, mirror_y, sphere

HEIGHT = 4.0
THICK = 0.2


def _cornice(x0, x1):
    w, x = x1 - x0, (x0 + x1) / 2
    front = [
        box('cornice', (w, 0.1, 0.22), (x, -0.13, HEIGHT - 0.17), 'Trim', bevel=0.03),
    ]
    return front + mirror_y(front) + [
        box('cap', (w, 0.38, 0.06), (x, 0, HEIGHT - 0.03), 'Trim', bevel=0.02),
    ]


def wall_1m():
    core = box('core', (1, THICK, HEIGHT), (0.5, 0, HEIGHT / 2), 'Wall', smooth=False)
    face = [
        # A panel standing a little proud, so a run of wall reads as panels.
        box('panel', (0.94, 0.03, 3.2), (0.5, -0.115, 0.32 + 1.6), 'Wall', bevel=0.012),
        box('rail', (1.0, 0.05, 0.08), (0.5, -0.125, 1.05), 'Trim', bevel=0.02),
        box('base', (1.0, 0.07, 0.3), (0.5, -0.135, 0.15), 'Trim', bevel=0.025),
    ]
    return join('wall_1m', [core] + face + mirror_y(face) + _cornice(0, 1))


def lintel_2m():
    bottom = 2.8
    core = box('core', (2, THICK, HEIGHT - bottom), (1, 0, (HEIGHT + bottom) / 2), 'Wall')
    face = [box('panel', (1.94, 0.03, 0.62), (1, -0.115, 3.3), 'Wall', bevel=0.012)]
    under = box('under', (2, 0.34, 0.16), (1, 0, bottom + 0.08), 'Trim', bevel=0.035)
    keystone = [box('key', (0.3, 0.06, 0.34), (1, -0.15, bottom + 0.22), 'Brass', bevel=0.03)]
    return join('lintel_2m', [core, under] + face + mirror_y(face) + keystone + mirror_y(keystone) + _cornice(0, 2))


def post():
    parts = [
        box('shaft', (0.4, 0.4, HEIGHT), (0, 0, HEIGHT / 2), 'Trim', bevel=0.06),
        box('foot', (0.52, 0.52, 0.32), (0, 0, 0.16), 'Trim', bevel=0.05),
        box('head', (0.52, 0.52, 0.24), (0, 0, HEIGHT - 0.12), 'Trim', bevel=0.05),
        box('band', (0.45, 0.45, 0.07), (0, 0, 1.05), 'Brass', bevel=0.02),
    ] + [
        sphere('rivet', 0.03, (x, y, 0.16), 'Brass', segments=10, rings=6, squash=0.6)
        for x, y in ((0, -0.265), (0, 0.265), (-0.265, 0), (0.265, 0))
    ]
    return join('post', parts)


def frame_edge():
    parts = [
        box('moulding', (1, 0.08, 0.12), (0, -0.04, 0), 'Frame', bevel=0.03),
        box('lip', (1, 0.02, 0.025), (0, -0.07, -0.05), 'Trim', bevel=0.008),
    ]
    return join('frame_edge', parts)


def frame_corner():
    parts = [
        box('block', (0.17, 0.1, 0.17), (0, -0.05, 0), 'Frame', bevel=0.045),
        sphere('stud', 0.03, (0, -0.1, 0), 'Brass', segments=12, rings=8, squash=0.7),
    ]
    return join('frame_corner', parts)


def lamp():
    parts = [
        cylinder('arm', 0.014, 0.3, (0, -0.15, 0.12), 'Brass', axis='Y', vertices=10),
        cylinder('hood', 0.045, 1.0, (0, -0.3, 0.12), 'Brass', bevel=0.012, axis='X', vertices=16),
        cylinder('light', 0.03, 0.96, (0, -0.3, 0.095), 'Glow', axis='X', vertices=12),
    ]
    return join('lamp', parts)


def plinth():
    parts = [
        box('body', (1, 1, 0.9), (0, 0, 0.45), 'Plinth', bevel=0.06),
        box('top', (1.08, 1.08, 0.08), (0, 0, 0.9), 'Trim', bevel=0.03),
        box('foot', (1.06, 1.06, 0.1), (0, 0, 0.05), 'Trim', bevel=0.03),
    ]
    return join('plinth', parts)


def bench():
    parts = [
        box('seat', (1.8, 0.5, 0.12), (0, 0, 0.42), 'Wood', bevel=0.04),
        box('cushion', (1.7, 0.44, 0.08), (0, 0, 0.51), 'Velvet', bevel=0.035, segments=4),
        box('leg', (0.12, 0.44, 0.36), (-0.74, 0, 0.18), 'Trim', bevel=0.03),
        box('leg', (0.12, 0.44, 0.36), (0.74, 0, 0.18), 'Trim', bevel=0.03),
    ]
    return join('bench', parts)


def desk():
    bell = lathe(
        'bell',
        [(0.07, 0), (0.07, 0.015), (0.06, 0.04), (0.04, 0.07), (0.015, 0.085), (0.0, 0.09)],
        (0.75, 0.1, 1.08),
        'Brass',
        seg=20,
    )
    parts = [
        box('body', (2.4, 0.9, 1.0), (0, 0, 0.5), 'Wood', bevel=0.06),
        box('top', (2.56, 1.02, 0.08), (0, 0, 1.04), 'Trim', bevel=0.03),
        box('front', (2.0, 0.03, 0.56), (0, -0.465, 0.52), 'Plinth', bevel=0.02),
        box('kick', (2.3, 0.04, 0.12), (0, -0.46, 0.06), 'Trim', bevel=0.015),
        bell,
        cylinder('stem', 0.018, 0.4, (-0.85, 0.2, 1.28), 'Brass', vertices=10),
        sphere('globe', 0.11, (-0.85, 0.2, 1.52), 'Glow', segments=16, rings=10),
    ]
    return join('desk', parts)


def bookshelf():
    w, d, h = 1.8, 0.4, 2.3
    parts = [
        box('side', (0.08, d, h), (-w / 2 + 0.04, 0, h / 2), 'Wood', bevel=0.02),
        box('side', (0.08, d, h), (w / 2 - 0.04, 0, h / 2), 'Wood', bevel=0.02),
        box('top', (w + 0.06, d + 0.04, 0.08), (0, 0, h - 0.04), 'Trim', bevel=0.02),
        box('foot', (w, d, 0.14), (0, 0, 0.07), 'Trim', bevel=0.02),
        box('back', (w - 0.1, 0.03, h - 0.1), (0, d / 2 - 0.015, h / 2), 'Dark'),
    ]
    for z in (0.56, 1.0, 1.44, 1.88):
        parts.append(box('shelf', (w - 0.14, d - 0.04, 0.04), (0, 0, z), 'Wood', bevel=0.01))
    return join('bookshelf', parts)


def _lean(obj, degrees, about):
    """Turn a part about the x axis through `about` (y, z): the front tips down."""
    a = math.radians(degrees)
    c, s = math.cos(a), math.sin(a)
    for v in obj.data.vertices:
        y, z = v.co.y - about[0], v.co.z - about[1]
        v.co.y, v.co.z = about[0] + y * c - z * s, about[1] + y * s + z * c
    return obj


def arcade_cabinet():
    """Upright, like the ones in every arcade: a base with a coin door, a control panel
    sloping toward the player with a joystick and two buttons, the screen leaning back in
    a bay, a marquee box over it. Seen from the side (y, z; the front is -y), the screen
    bay's face runs from (-0.30, 1.04) up to (-0.177, 1.62), 12 degrees back, 0.405 x 0.54
    of it the screen; the marquee's face is the recess at y = -0.33, 0.65 x 0.17 about z 1.735."""
    w, tip = 0.63, 30.3
    side = [(-0.34, 0), (0.40, 0), (0.40, 1.85), (-0.36, 1.85), (-0.36, 1.62), (-0.177, 1.62),
            (-0.30, 1.04), (-0.30, 1.00), (-0.42, 0.93), (-0.42, 0.86), (-0.34, 0.84)]
    parts = [
        extrude('side', side, -0.36, -w / 2, 'Trim', bevel=0.012),
        extrude('side', side, w / 2, 0.36, 'Trim', bevel=0.012),
        # The base, the control panel standing out over it, and the back.
        box('base', (w, 0.74, 0.84), (0, 0.03, 0.42), 'Trim', bevel=0.012),
        extrude('panel', [(-0.34, 0.84), (-0.42, 0.86), (-0.42, 0.93), (-0.30, 1.0), (-0.30, 0.84)],
                -w / 2, w / 2, 'Velvet', bevel=0.014),
        box('back', (w, 0.03, 1.01), (0, 0.385, 1.345), 'Trim'),
        # The coin door, with its two slots.
        box('door', (0.24, 0.02, 0.32), (0, -0.345, 0.45), 'Dark', bevel=0.008),
        box('slot', (0.05, 0.012, 0.09), (-0.05, -0.356, 0.5), 'Brass', bevel=0.004),
        box('slot', (0.05, 0.012, 0.09), (0.05, -0.356, 0.5), 'Brass', bevel=0.004),
        box('stripe', (0.012, 0.12, 0.84), (-0.364, -0.05, 0.42), 'Velvet'),
        box('stripe', (0.012, 0.12, 0.84), (0.364, -0.05, 0.42), 'Velvet'),
        # The screen bay: a dark floor along the lean, and the bezel standing round it.
        _lean(box('bay', (w, 0.03, 0.59), (0, -0.2385 + 0.0145, 1.33), 'Dark'), -12.2, (-0.2385, 1.33)),
        _lean(box('bezel', (0.105, 0.045, 0.6), (-0.2625, -0.2385 - 0.0225, 1.33), 'Trim', bevel=0.01),
              -12.2, (-0.2385, 1.33)),
        _lean(box('bezel', (0.105, 0.045, 0.6), (0.2625, -0.2385 - 0.0225, 1.33), 'Trim', bevel=0.01),
              -12.2, (-0.2385, 1.33)),
        _lean(box('bezel', (w, 0.045, 0.04), (0, -0.2385 - 0.0225, 1.04), 'Trim', bevel=0.01),
              -12.2, (-0.2385, 1.33)),
        # The marquee: a box with a lip round its face, so the face is a recess.
        box('marquee', (0.72, 0.73, 0.23), (0, 0.035, 1.735), 'Trim', bevel=0.012),
        box('lip', (0.72, 0.03, 0.03), (0, -0.345, 1.835), 'Trim', bevel=0.008),
        box('lip', (0.72, 0.03, 0.03), (0, -0.345, 1.635), 'Trim', bevel=0.008),
        box('lip', (0.035, 0.03, 0.23), (-0.3425, -0.345, 1.735), 'Trim', bevel=0.008),
        box('lip', (0.035, 0.03, 0.23), (0.3425, -0.345, 1.735), 'Trim', bevel=0.008),
    ]
    # Where the panel's top is, 30 degrees, from its front edge (-0.42, 0.93) back along it;
    # what stands on it is made upright there, then leant to stand square to it.
    d = (math.cos(math.radians(tip)), math.sin(math.radians(tip)))

    def on_panel(s):
        return (-0.42 + d[0] * s, 0.93 + d[1] * s)

    for x, s, kind in ((-0.15, 0.075, 'stick'), (0.07, 0.05, 'a'), (0.19, 0.085, 'b')):
        y, z = on_panel(s)
        if kind == 'stick':
            part = [
                cylinder('plate', 0.045, 0.012, (x, y, z + 0.006), 'Dark', bevel=0.004, vertices=20),
                cylinder('stem', 0.01, 0.09, (x, y, z + 0.055), 'Brass', vertices=10),
                sphere('ball', 0.032, (x, y, z + 0.12), 'Plinth', segments=16, rings=10),
            ]
        else:
            part = [
                cylinder('button', 0.027, 0.022, (x, y, z + 0.011), 'Frame' if kind == 'a' else 'Plinth',
                         bevel=0.007, vertices=20)
            ]
        parts += [_lean(p, tip, (y, z)) for p in part]
    return join('arcade_cabinet', parts)


def skylight():
    parts = [
        box('rim', (1.8, 1.8, 0.1), (0, 0, -0.05), 'Trim', bevel=0.03),
        box('light', (1.56, 1.56, 0.04), (0, 0, -0.1), 'Glow', bevel=0.015),
    ]
    return join('skylight', parts)


def sign():
    parts = [
        box('board', (2.6, 0.08, 0.6), (0, -0.04, 0), 'Trim', bevel=0.035),
        sphere('stud', 0.03, (-1.18, -0.085, 0), 'Brass', segments=12, rings=8, squash=0.7),
        sphere('stud', 0.03, (1.18, -0.085, 0), 'Brass', segments=12, rings=8, squash=0.7),
    ]
    return join('sign', parts)


PIECES = {
    'wall_1m': wall_1m,
    'lintel_2m': lintel_2m,
    'post': post,
    'frame_edge': frame_edge,
    'frame_corner': frame_corner,
    'lamp': lamp,
    'plinth': plinth,
    'bench': bench,
    'desk': desk,
    'bookshelf': bookshelf,
    'arcade_cabinet': arcade_cabinet,
    'skylight': skylight,
    'sign': sign,
}


def build(names=None):
    """Make the pieces (all, or these), side by side for a look in Blender."""
    made = []
    for i, name in enumerate(names or PIECES):
        obj = PIECES[name]()
        made.append(obj)
    return made


if __name__ == '__main__':
    kit.reset_scene()
    build()
