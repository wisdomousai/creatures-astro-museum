"""The themed rooms: a room of its own (an exhibit with `room: jungle`, say) dressed as a
place, its walls papered with a painted view of it (textures/, made by generate.py) and
things standing in it, modelled here, in the generator's pictures.

    Blender -b --factory-startup -P blender/rooms/rooms.py -- OUT_DIR [theme...]

writes OUT_DIR/<theme>.glb for each, and OUT_DIR/rooms.json: each room's size and the
footprints of what stands on its floor, for the plan (src/plan/generate.ts).
blender/rooms/build.sh runs it and compresses the rooms into the package.

A room's origin is the middle of its doorway, on the floor, in the hall's wall; it goes
back from there along -y (three.js's +z), W wide along x, D deep, H high. Facing in, +x is
on the left. The exhibit hangs in the middle of the back wall, and one on each side wall,
halfway back: those walls are kept clear, as is the way in and the way to each.

The site makes the rest (src/museum/themed.ts): the materials named Mural... are lit like a
backdrop, Card... are cut-outs (alpha), and the floor is what's clicked to walk on. Who lives
in each room (RESIDENTS) and the creatures' own furniture and toys standing in it (`set`, by
Room.piece) go in rooms.json too: the site brings them, as the creatures package has them.
"""

import json
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector, noise

HERE = os.path.dirname(os.path.abspath(__file__))
TEX = os.path.join(HERE, 'textures')
sys.path.insert(0, os.path.dirname(HERE))
import kit  # noqa: E402

#: Each room's size (wide along the hall, deep, high): not all alike.
SIZES = {
    'jungle': (9, 9, 6),
    'forest': (8, 9, 6),
    'aquarium': (8, 10, 5),
    'snow': (7, 8, 5),
    'village': (10, 10, 7),
    'alps': (10, 7, 6),
    'cat-cafe': (9, 8, 4.5),
    'dog-park': (10, 10, 7),
    'aviary': (9, 10, 8),
    'robot-park': (10, 9, 6),
}
#: How many metres of floor one picture of it covers.
FLOOR_TILE = {'jungle': 3, 'forest': 3, 'aquarium': 4, 'snow': 4, 'village': 2.5, 'alps': 2.4,
              'cat-cafe': 2.5, 'dog-park': 3, 'aviary': 2.5, 'robot-park': 2}
#: Who lives in each (the creatures' families, or any of them by name): the site brings
#: them on, in the middle of the floor, and they stay.
RESIDENTS = {
    'jungle': ['jungle', 'butterfly', 'dragonfly', 'toucan', 'macaw'],
    'forest': ['fox', 'squirrel', 'hedgehog', 'bunny', 'fawn', 'raccoon', 'beaver', 'bear', 'owl', 'mouse', 'snail', 'firefly'],
    'aquarium': ['sea'],
    'snow': ['penguin', 'polarcub', 'snowleopard', 'sealpup', 'husky'],
    'village': ['shorthair', 'oldtabby', 'beagle', 'corgi', 'hen', 'rooster', 'chick', 'duck', 'goose', 'piglet', 'donkey', 'butterfly', 'bee'],
    'alps': ['goat', 'ram', 'lamb', 'alpaca', 'highlandcalf', 'cow', 'bordercollie', 'saintbernard', 'raven', 'butterfly'],
    'cat-cafe': ['cat'],
    'dog-park': ['dog'],
    'aviary': ['bird'],
    'robot-park': ['robot'],
}
DOOR = (2.0, 2.8)
#: Where the wallpaper hangs: just off the room's walls (half a wall's thickness), and off
#: the hall's wall (its panels stand out from it) for the one round the doorway.
INSET = 0.125
FRONT = 0.2


# ---------- Materials ----------

def _image(rel):
    path = os.path.join(TEX, rel + '.webp')
    return bpy.data.images.load(path, check_existing=True)


def textured(name, rel, rough=0.85, alpha=False, metal=0.0):
    """A material showing a picture: `Mural.` for a wall's, `Card.` for a cut-out."""
    mat = bpy.data.materials.get(name)
    if mat:
        return mat
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = nodes.get('Principled BSDF')
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = _image(rel)
    mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    if alpha:
        mat.node_tree.links.new(tex.outputs['Alpha'], bsdf.inputs['Alpha'])
        mat.use_backface_culling = False
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    return mat


def plain(name, hex_colour, rough=0.6, metal=0.0, glow=0.0):
    """A plain colour (or a role's, by the kit's names: then the museum's look decides)."""
    mat = bpy.data.materials.get(name)
    if mat:
        return mat
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = kit.srgb(hex_colour)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if glow:
        bsdf.inputs['Emission Color'].default_value = kit.srgb(hex_colour)
        bsdf.inputs['Emission Strength'].default_value = glow
    return mat


# ---------- Meshes ----------

def _object(name, bm, mat, smooth=True):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(obj)
    me.materials.append(mat)
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    return obj


def uv_box(obj, size, offset=(0.0, 0.0, 0.0)):
    """Picture coordinates by where each face looks: the picture `size` metres across."""
    me = obj.data
    uv = me.uv_layers.new(name='UVMap')
    for poly in me.polygons:
        n = poly.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co + Vector(offset)
            u, v = ((co.y, co.z), (co.x, co.z), (co.x, co.y))[ax]
            uv.data[li].uv = (u / size, v / size)
    return obj


def lathe(name, at, radius, height, mat, seg=20, rings=12, tile=1.0, cap=True, wiggle=0.0, seed=0):
    """Round about z: `radius(t, a)` at height t (0..1) and angle a, picture wrapped round
    it (`tile` metres high), a little unevenness (`wiggle`) if it's natural."""
    bm = bmesh.new()
    grid = []
    for j in range(rings + 1):
        t = j / rings
        row = []
        for k in range(seg):
            a = 2 * math.pi * k / seg
            r = radius(t, a)
            if wiggle:
                r *= 1 + wiggle * noise.noise(Vector((math.cos(a) * 1.7, math.sin(a) * 1.7, t * 3 + seed)))
            row.append(bm.verts.new((at[0] + r * math.cos(a), at[1] + r * math.sin(a), at[2] + t * height)))
        grid.append(row)
    uv = bm.loops.layers.uv.new('UVMap')
    # Round it a whole number of times, about as wide as it's high.
    circ = 2 * math.pi * radius(0.5, 0)
    turns = max(1, round(circ / tile))
    for j in range(rings):
        for k in range(seg):
            k1 = (k + 1) % seg
            f = bm.faces.new((grid[j][k], grid[j][k1], grid[j + 1][k1], grid[j + 1][k]))
            us = (k / seg * turns, (k + 1) / seg * turns)
            vs = (j / rings * height / tile, (j + 1) / rings * height / tile)
            for loop, (u, v) in zip(f.loops, ((us[0], vs[0]), (us[1], vs[0]), (us[1], vs[1]), (us[0], vs[1]))):
                loop[uv].uv = (u, v)
    if cap:
        top = bm.faces.new(grid[-1])
        for loop in top.loops:
            loop[uv].uv = (loop.vert.co.x / tile, loop.vert.co.y / tile)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _object(name, bm, mat)


def blob(name, at, size, mat, rough=0.25, seed=0, tile=1.5, sink=0.0, subdiv=3):
    """A lump (a rock, a drift of snow, a coral head): a sphere `size` (x, y, z radii) made
    uneven, cut flat where it meets the ground (`sink` of it below)."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0)
    for v in bm.verts:
        d = v.co.normalized()
        k = 1 + rough * noise.noise(d * 1.6 + Vector((seed * 3.1, seed * 1.7, seed))) \
            + rough * 0.4 * noise.noise(d * 4.2 + Vector((seed, 0, 0)))
        v.co = Vector((d.x * size[0] * k, d.y * size[1] * k, d.z * size[2] * k))
        v.co.z = max(v.co.z, -size[2] * sink)
        v.co += Vector(at)
    obj = _object(name, bm, mat)
    return uv_box(obj, tile)


def card(name, rel, at, height, yaw=0.0, tilt=0.0, roll=0.0, width=None):
    """A cut-out standing on its base at `at`: `height` high (as wide as its picture is),
    turned `yaw` about z, leant `tilt` back from upright, and `roll` about its own face."""
    img = _image(rel)
    w = width or height * img.size[0] / img.size[1]
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    vs = [bm.verts.new(p) for p in ((-w / 2, 0, 0), (w / 2, 0, 0), (w / 2, 0, height), (-w / 2, 0, height))]
    f = bm.faces.new(vs)
    for loop, c in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
        loop[uv].uv = c
    m = Matrix.Translation(at) @ Matrix.Rotation(yaw, 4, 'Z') @ Matrix.Rotation(tilt, 4, 'X') @ Matrix.Rotation(roll, 4, 'Y')
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
    return _object(name, bm, textured('Card.' + rel.replace('/', '.'), rel, alpha=True, rough=0.7), smooth=False)


def tuft(name, rels, at, height, n, r, spread=0.6, lean=(0.25, 0.9)):
    """A plant: `n` cut-outs from its foot (on the floor, if it's only x and y), fanned round
    and leaning out."""
    at = (*at, 0.0) if len(at) == 2 else at
    parts = []
    for i in range(n):
        yaw = 2 * math.pi * i / n + r.uniform(-0.4, 0.4)
        foot = (at[0] + math.cos(yaw) * spread * 0.2, at[1] + math.sin(yaw) * spread * 0.2, at[2])
        # (A card faces -y; turned so it leans out along `yaw`.)
        parts.append(card(f'{name}-{i}', r.choice(rels), foot, height * r.uniform(0.75, 1.1),
                          yaw=yaw - math.pi / 2, tilt=-r.uniform(*lean), roll=r.uniform(-0.2, 0.2)))
    return parts


def crown(name, rels, at, radii, n, r, size=(1.2, 1.8)):
    """Leaves in a clump (a tree's crown, a canopy): cut-outs about inside an ellipsoid."""
    parts = []
    for i in range(n):
        while True:
            p = Vector((r.uniform(-1, 1), r.uniform(-1, 1), r.uniform(-1, 1)))
            if p.length <= 1:
                break
        c = (at[0] + p.x * radii[0], at[1] + p.y * radii[1], at[2] + p.z * radii[2])
        parts.append(card(f'{name}-{i}', r.choice(rels), c, r.uniform(*size), yaw=r.uniform(0, 2 * math.pi),
                          tilt=r.uniform(-1.4, 1.4), roll=r.uniform(-math.pi, math.pi)))
    return parts


def tube(name, points, radius, mat, tile=0.6):
    """A rope, a vine, a rail: a round tube through `points`."""
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = radius
    cu.bevel_resolution = 3
    cu.use_fill_caps = True
    sp = cu.splines.new('NURBS')
    sp.points.add(len(points) - 1)
    for p, c in zip(sp.points, points):
        p.co = (c[0], c[1], c[2], 1)
    sp.use_endpoint_u = True
    sp.order_u = min(4, len(points))
    sp.resolution_u = 8
    ob = bpy.data.objects.new(name, cu)
    bpy.context.collection.objects.link(ob)
    deps = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(deps))
    bpy.data.objects.remove(ob)
    obj = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(obj)
    me.materials.clear()
    me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = True
    return uv_box(obj, tile)


def boxy(name, size, at, mat, tile=1.0, bevel=0.0):
    """A box, its middle at `at`, the picture `tile` metres across."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    if bevel:
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=bevel, segments=2, affect='EDGES')
    bmesh.ops.translate(bm, vec=at, verts=bm.verts)
    obj = _object(name, bm, mat, smooth=False)
    return uv_box(obj, tile, offset=(0.37, 0.11, 0.0))


def quad(name, corners, uvs, mat):
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    f = bm.faces.new([bm.verts.new(c) for c in corners])
    for loop, c in zip(f.loops, uvs):
        loop[uv].uv = c
    return _object(name, bm, mat, smooth=False)


# ---------- The room ----------

class Room:
    """One themed room being made: its shell, and a record of what stands on its floor."""

    def __init__(self, theme):
        self.theme = theme
        self.W, self.D, self.H = SIZES[theme]
        self.r = random.Random(theme)
        self.blocks = []
        self.set = []

    def block(self, x, y, rx, ry=None):
        """Something standing at (x, y) about `rx` by `ry` from its middle: walked round."""
        ry = rx if ry is None else ry
        # (u across, v in: three.js's x and z.)
        self.blocks.append([round(x - rx, 2), round(-y - ry, 2), round(x + rx, 2), round(-y + ry, 2)])

    def piece(self, model, x, y, size, rx=0.0, ry=None, face=None, yaw=None):
        """One of the creatures' own pieces (models/<model>.glb, set-cattree say), stood at
        (x, y) by the site, its biggest side `size` metres, facing the point `face` (x, y;
        the middle of the room, if not) or turned `yaw`; walked round if `rx`."""
        fx, fy = face or (0.0, -self.D / 2)
        a = yaw if yaw is not None else math.atan2(fx - x, -(fy - y))
        # (In the room's frame as the site has it: u = x across, v = -y in; 0 faces in.)
        self.set.append({'model': model, 'at': [round(x, 2), round(-y, 2)], 'yaw': round(a, 3), 'size': size})
        if rx:
            self.block(x, y, rx, ry)

    def shell(self):
        """The wallpaper on all four walls, the floor and the ceiling."""
        W, D, H, t = self.W, self.D, self.H, self.theme
        x0, x1 = W / 2 - INSET, -(W / 2 - INSET)  # left, right
        yb = -(D - INSET)

        def wall(name, a, b, front=False):
            """The picture over a wall from a (on its left, seen from in the room) to b, as much
            of it as fills the wall (cropped, not stretched)."""
            img = _image(f'{t}/{name}')
            mat = textured(f'Mural.{t}.{name}', f'{t}/{name}', rough=0.95)
            length = (Vector(b) - Vector(a)).length
            aspect = img.size[0] / img.size[1]
            # Cover: scale to fill the wall's height or length, whichever needs more.
            if length / H > aspect:
                su, sv = 1.0, (length / H) / aspect
            else:
                su, sv = aspect / (length / H), 1.0
            u0, v0 = (1 - 1 / su) / 2, (1 - 1 / sv) * 0.35  # (keep more of the sky than the ground)

            def at(s, z):
                p = Vector(a).lerp(Vector(b), s)
                return (p.x, p.y, z), (u0 + s / su, v0 + z / H / sv)

            def piece(s0, s1, z0, z1, k):
                ps = [at(s0, z0), at(s1, z0), at(s1, z1), at(s0, z1)]
                quad(f'{name}-{k}', [p[0] for p in ps], [p[1] for p in ps], mat)

            if not front:
                piece(0, 1, 0, H, 0)
            else:
                # Round the doorway: either side of it and over it.
                d0 = (length - DOOR[0]) / 2 / length
                d1 = 1 - d0
                piece(0, d0, 0, H, 0)
                piece(d1, 1, 0, H, 1)
                piece(d0, d1, DOOR[1], H, 2)

        wall('back', (x0, yb), (x1, yb))
        wall('left', (x0, -FRONT), (x0, yb))
        wall('right', (x1, yb), (x1, -FRONT))
        wall('front', (x1, -FRONT), (x0, -FRONT), front=True)
        # The doorway's sides and top, from the hall's wall to the wallpaper.
        trim = plain('Trim', kit.PREVIEW['Trim'])
        hw = DOOR[0] / 2
        for s in (-1, 1):
            quad(f'reveal-{s}', [(s * hw, -0.11, 0), (s * hw, -FRONT, 0), (s * hw, -FRONT, DOOR[1]), (s * hw, -0.11, DOOR[1])],
                 [(0, 0)] * 4, trim)
        quad('reveal-top', [(-hw, -0.11, DOOR[1]), (hw, -0.11, DOOR[1]), (hw, -FRONT, DOOR[1]), (-hw, -FRONT, DOOR[1])],
             [(0, 0)] * 4, trim)
        # The floor, the picture tiled across it.
        k = FLOOR_TILE[t]
        floor = quad('Floor', [(W / 2, 0, 0), (-W / 2, 0, 0), (-W / 2, -D, 0), (W / 2, -D, 0)],
                     [(0, 0), (W / k, 0), (W / k, D / k), (0, D / k)],
                     textured(f'Ground.{t}', f'{t}/floor', rough=0.95))
        floor.name = 'Floor'
        # The ceiling: back wall at the picture's top, left wall on its left.
        quad('Ceiling', [(W / 2, 0, H), (W / 2, -D, H), (-W / 2, -D, H), (-W / 2, 0, H)],
             [(0, 0), (0, 1), (1, 1), (1, 0)], textured(f'Mural.{t}.ceiling', f'{t}/ceiling', rough=1))

    # Where things may stand: the corners, clear of the way in, the way to each exhibit and
    # the exhibits' walls. (x, y) in the room, y negative.
    def front_corner(self, side, depth=None, inset=0.9):
        """Near a front corner: `side` +1 left, -1 right."""
        depth = depth if depth is not None else self.r.uniform(0.9, self.D / 2 - 2.2)
        return (side * (self.W / 2 - inset), -depth)

    def back_corner(self, side, along=None, depth=0.9):
        """Near a back corner, `along` from the side wall."""
        along = along if along is not None else self.r.uniform(0.8, self.W / 2 - 2.6)
        return (side * (self.W / 2 - along), -(self.D - depth))

    def side_back(self, side, inset=0.8):
        """Against a side wall, between its exhibit and the back."""
        return (side * (self.W / 2 - inset), -self.r.uniform(self.D / 2 + 2.0, self.D - 1.0))


# ---------- The themes ----------

def tree(room, name, at, r0, height, bark, flare=0.6, lean=0.0, tile=1.6):
    """A trunk: wider at the foot, with buttress roots (`flare`), up to `height`."""
    seed = room.r.uniform(0, 100)
    ph = room.r.uniform(0, 6)

    def radius(t, a):
        root = flare * max(0.0, math.cos(5 * a + ph)) ** 3 * max(0.0, 1 - t * 6) ** 2
        return r0 * (1.35 - 0.45 * t + 0.35 * max(0.0, 1 - t * 8) + root * 2.2)

    obj = lathe(name, (at[0], at[1], -0.05), radius, height, bark, seg=24, rings=16, tile=tile, wiggle=0.08, seed=seed)
    if lean:
        for v in obj.data.vertices:
            v.co.x += lean * (v.co.z / height) ** 2
    room.block(at[0], at[1], r0 * 1.6 + 0.2)
    return obj


def rock(room, name, at, size, mat, tile=1.5, solid=True):
    obj = blob(name, at, size, mat, rough=0.3, seed=room.r.uniform(0, 50), tile=tile, sink=0.3)
    if solid and size[2] > 0.25:
        room.block(at[0], at[1], size[0] + 0.15, size[1] + 0.15)
    return obj


def jungle(room):
    r, W, D, H = room.r, room.W, room.D, room.H
    bark = textured('Bark.jungle', 'jungle/bark')
    moss = textured('Rock.moss', 'rock')
    leaves = [f'jungle/leaves-{i}' for i in range(4)]
    big = leaves[:3]
    for s in (1, -1):
        # A giant at each front corner, its crown up under the canopy, and one at the back.
        x, y = room.front_corner(s, depth=1.6, inset=1.0)
        tree(room, f'tree-f{s}', (x, y), 0.42, H + 0.2, bark, flare=0.9)
        crown(f'crown-f{s}', big, (x - s * 0.6, y - 0.6, H - 0.7), (2.0, 1.6, 0.7), 26, r, size=(1.4, 2.2))
        bx, by = room.back_corner(s, along=1.3)
        tree(room, f'tree-b{s}', (bx, by), 0.36, H + 0.2, bark, flare=0.7)
        crown(f'crown-b{s}', big, (bx - s * 0.4, by + 0.5, H - 0.6), (1.8, 1.4, 0.6), 22, r, size=(1.4, 2.2))
        # Plants at their feet and along the walls, low under the exhibits.
        tuft(f'monstera-{s}', [leaves[0]], (x - s * 0.3, y - 1.2, 0), 1.3, 7, r)
        tuft(f'banana-{s}', [leaves[1]], (bx + s * 0.7, by + 0.9, 0), 2.2, 6, r, lean=(0.15, 0.5))
        tuft(f'fern-{s}', [leaves[3]], room.side_back(s, inset=0.5), 1.1, 8, r)
        tuft(f'ferns-{s}', [leaves[3], leaves[2]], (s * (W / 2 - 0.5), -D / 2, 0), 0.55, 6, r)
        tuft(f'fern-front-{s}', [leaves[3]], (s * (W / 2 - 0.4), -0.6, 0), 0.9, 6, r)
        rock(room, f'rock-{s}', (bx + s * 0.2, by + 1.5, 0), (0.55, 0.45, 0.35), moss)
        # Lianas from the canopy, hanging in loops by the walls.
        for k in range(3):
            x0 = s * (W / 2 - r.uniform(0.6, 1.6))
            y0 = -r.uniform(0.8, D - 0.8)
            if abs(y0 + D / 2) < 2.0:
                continue
            drop = r.uniform(1.6, 3.0)
            tube(f'liana-{s}-{k}', [(x0, y0, H), (x0 - s * 0.3, y0 + 0.4, H - drop), (x0 - s * 0.6, y0 + 1.1, H - drop * 0.6),
                                    (x0 - s * 0.9, y0 + 1.6, H)], 0.035, bark)
    # The canopy: leaves all over the ceiling's edges, more at the back.
    for k in range(10):
        x = r.uniform(-W / 2 + 0.6, W / 2 - 0.6)
        y = -r.uniform(0.6, D - 0.6)
        crown(f'canopy-{k}', big, (x, y, H - 0.3), (1.2, 1.2, 0.25), 9, r, size=(1.2, 2.0))


def forest(room):
    r, W, D, H = room.r, room.W, room.D, room.H
    bark = textured('Bark.forest', 'forest/bark')
    moss = textured('Rock.moss', 'rock')
    leaves = [f'forest/leaves-{i}' for i in range(4)]
    spruce, beech, bracken, ivy = leaves
    cap = plain('Paint.mushroom', '#c0392b', rough=0.5)
    stem = plain('Paint.stem', '#efe6d2', rough=0.7)
    spot = plain('Paint.spots', '#fbf7ee', rough=0.7)

    def fir(name, at, height):
        tree(room, name, at, 0.22, height, bark, flare=0.3, tile=1.2)
        # Tiers of boughs, wider lower down, from 1.8 m up.
        for j, z in enumerate([1.8 + i * 0.55 for i in range(int((height - 2.1) / 0.55))]):
            reach = 1.5 * (1 - (z - 1.8) / (height - 1.4)) + 0.35
            for k in range(7):
                a = 2 * math.pi * k / 7 + j * 0.45 + r.uniform(-0.2, 0.2)
                card(f'{name}-bough-{j}-{k}', spruce, (at[0], at[1], z), reach * 1.1, yaw=a - math.pi / 2,
                     tilt=-1.2 - r.uniform(0, 0.2))

    for s in (1, -1):
        fx, fy = room.front_corner(s, depth=1.8, inset=1.1)
        fir(f'fir-f{s}', (fx, fy), H + 0.4)
        bx, by = room.back_corner(s, along=1.0)
        tree(room, f'beech-{s}', (bx, by), 0.34, H + 0.2, bark, flare=0.5)
        crown(f'beech-crown-{s}', [beech, beech, ivy], (bx - s * 0.6, by + 0.5, H - 0.8), (1.9, 1.5, 0.9), 26, r, size=(0.9, 1.5))
        tuft(f'bracken-{s}', [bracken], (bx - s * 1.5, by + 0.2, 0), 1.1, 7, r)
        tuft(f'bracken-side-{s}', [bracken], room.side_back(s, inset=0.6), 0.9, 6, r)
        tuft(f'ivy-{s}', [ivy], (s * (W / 2 - 0.4), -D / 2, 0), 0.45, 5, r)
        rock(room, f'boulder-{s}', (bx - s * 0.2, by + 1.6, 0), (0.6, 0.5, 0.45), moss)
        # A family of toadstools.
        mx, my = fx - s * 0.9, fy - 1.0
        for k in range(3):
            px, py = mx + r.uniform(-0.35, 0.35), my + r.uniform(-0.35, 0.35)
            h = r.uniform(0.18, 0.4)
            lathe(f'stem-{s}-{k}', (px, py, 0), lambda t, a, h=h: h * 0.16 * (1.1 - 0.25 * t), h, stem, seg=12, rings=3)
            capr = h * 0.55
            lathe(f'cap-{s}-{k}', (px, py, h * 0.92), lambda t, a, c=capr: c * math.cos(t * math.pi / 2) ** 0.6, capr * 0.75,
                  cap, seg=16, rings=6, cap=False)
            for d in range(5):
                a = r.uniform(0, 2 * math.pi)
                rr = capr * r.uniform(0.35, 0.75)
                blob(f'spot-{s}-{k}-{d}', (px + rr * math.cos(a), py + rr * math.sin(a), h * 0.92 + capr * 0.75 * math.cos(rr / capr * 1.2)),
                     (0.025, 0.025, 0.012), spot, rough=0, subdiv=1)
    # A fallen log along the back wall's foot, off to the side.
    lx, ly = -(W / 2 - 0.55), -(D / 2 + 2.5)
    log = lathe('log', (0, 0, 0), lambda t, a: 0.24, 2.0, bark, seg=16, rings=4, tile=1.2, wiggle=0.06)
    log.data.transform(Matrix.Translation((lx, ly, 0.22)) @ Matrix.Rotation(math.pi / 2, 4, 'X') @ Matrix.Translation((0, 0, -1.0)))
    room.block(lx, ly, 0.35, 1.1)


def aquarium(room):
    r, W, D, H = room.r, room.W, room.D, room.H
    reef = textured('Rock.reef', 'aquarium/rock')
    plants = [f'aquarium/plants-{i}' for i in range(4)]
    kelp, fan, coral, grass = plants
    corals = [plain('Paint.coral-a', '#ff7f50', rough=0.7), plain('Paint.coral-b', '#e85d75', rough=0.7),
              plain('Paint.coral-c', '#f2c14e', rough=0.7), plain('Paint.coral-d', '#7a5cc8', rough=0.7)]
    for s in (1, -1):
        for corner, (x, y) in (('f', room.front_corner(s, depth=1.9, inset=1.1)), ('b', room.back_corner(s, along=1.2, depth=1.2))):
            rock(room, f'reef-{corner}{s}', (x, y, 0), (0.9, 0.8, 0.8), reef, tile=1.2)
            rock(room, f'reef2-{corner}{s}', (x + s * 0.35, y + (0.8 if corner == 'f' else -0.2), 0), (0.55, 0.5, 0.45), reef, tile=1.2)
            # Brain corals on the rocks, and fans and branches on top.
            for k in range(3):
                blob(f'brain-{corner}{s}-{k}', (x + r.uniform(-0.6, 0.6), y + r.uniform(-0.5, 0.5), 0.55 + r.uniform(0, 0.3)),
                     (0.22, 0.22, 0.16), r.choice(corals), rough=0.15, seed=r.uniform(0, 9), subdiv=2)
            tuft(f'fan-{corner}{s}', [fan], (x, y, 0.6), 1.1, 3, r, lean=(0.0, 0.3))
            tuft(f'coral-{corner}{s}', [coral], (x - s * 0.6, y - 0.3, 0.4), 0.8, 4, r, lean=(0.1, 0.5))
        # Kelp, swaying up toward the light, along the side walls.
        for k in range(4):
            y = -r.uniform(0.8, D - 0.8)
            if abs(y + D / 2) < 1.9:
                continue
            x = s * (W / 2 - r.uniform(0.3, 0.8))
            tuft(f'kelp-{s}-{k}', [kelp], (x, y, 0), r.uniform(2.6, 4.2), 3, r, lean=(0.0, 0.15))
        tuft(f'grass-{s}', [grass], (s * (W / 2 - 0.4), -D / 2, 0), 0.5, 6, r)
        tuft(f'grass-b-{s}', [grass], (s * 2.4, -(D - 0.5), 0), 0.5, 6, r)
    # An old anchor, leant against the right wall between its exhibit and the back.
    iron = plain('Paint.iron', '#4a4038', rough=0.8, metal=0.6)
    ax, ay = -(W / 2 - 0.55), -(D / 2 + 2.6)
    parts = [
        lathe('anchor-shank', (0, 0, 0.1), lambda t, a: 0.07, 1.7, iron, seg=12, rings=2),
        boxy('anchor-stock', (0.09, 0.95, 0.09), (0, 0, 1.55), iron),
        tube('anchor-ring', [(0, 0, 1.8)] + [(0.13 * math.sin(a), 0, 1.93 - 0.13 * math.cos(a)) for a in
                                              (0.6, 1.6, 2.6, 3.6, 4.6, 5.6)] + [(0, 0, 1.8)], 0.028, iron),
        tube('anchor-arms', [(-0.65, 0, 0.6), (-0.45, 0, 0.18), (0, 0, 0.08), (0.45, 0, 0.18), (0.65, 0, 0.6)], 0.06, iron),
    ]
    for side in (-1, 1):
        fluke = boxy(f'anchor-fluke-{side}', (0.26, 0.05, 0.2), (0, 0, 0), iron)
        fluke.data.transform(Matrix.Translation((side * 0.62, 0, 0.62)) @ Matrix.Rotation(side * 0.6, 4, 'Y'))
        parts.append(fluke)
    for part in parts:
        part.data.transform(Matrix.Translation((ax, ay, 0)) @ Matrix.Rotation(-math.pi / 2, 4, 'Z') @ Matrix.Rotation(-0.12, 4, 'Y'))
    room.block(ax, ay, 0.35, 0.8)


def snow(room):
    r, W, D, H = room.r, room.W, room.D, room.H
    ice = textured('Ice', 'snow/ice', rough=0.12)
    drift = textured('Snow', 'snow/floor', rough=0.9)
    bark = textured('Bark.forest', 'forest/bark')
    spruce = 'forest/leaves-0'
    carrot = plain('Paint.carrot', '#e8742c', rough=0.6)
    coal = plain('Paint.coal', '#1c1c1e', rough=0.9)
    scarf = plain('Paint.scarf', '#c0392b', rough=0.9)

    def crystal(name, at, height, rad, tilt, yaw):
        def radius(t, a, h=height):
            return rad * (1.0 if t < 0.78 else max(0.02, (1 - t) / 0.22))
        obj = lathe(name, (0, 0, 0), radius, height, ice, seg=6, rings=6, tile=0.8)
        obj.data.transform(Matrix.Translation(at) @ Matrix.Rotation(yaw, 4, 'Z') @ Matrix.Rotation(tilt, 4, 'X'))
        return obj

    for s in (1, -1):
        # Clusters of ice crystals in the back corners.
        bx, by = room.back_corner(s, along=1.0, depth=1.0)
        for k in range(7):
            crystal(f'crystal-{s}-{k}', (bx + r.uniform(-0.5, 0.5), by + r.uniform(-0.4, 0.4), -0.1), r.uniform(0.8, 2.6),
                    r.uniform(0.1, 0.24), r.uniform(-0.5, 0.5), r.uniform(0, 6))
        room.block(bx, by, 0.9, 0.8)
        rock(room, f'drift-b{s}', (s * (W / 2 - 0.85), by + 1.6, 0), (0.6, 0.9, 0.35), drift, tile=3)
        # Snowy spruces by the front corners.
        fx, fy = room.front_corner(s, depth=1.6, inset=0.9)
        tree(room, f'spruce-{s}', (fx, fy), 0.16, H - 0.6, bark, flare=0.2, tile=1.0)
        for j, z in enumerate([1.0 + i * 0.5 for i in range(6)]):
            reach = 1.2 * (1 - (z - 1.0) / 3.6) + 0.25
            for k in range(6):
                a = 2 * math.pi * k / 6 + j * 0.5
                card(f'spruce-{s}-{j}-{k}', spruce, (fx, fy, z), reach, yaw=a - math.pi / 2, tilt=-1.25)
            # Snow lying on each tier.
            blob(f'spruce-snow-{s}-{j}', (fx, fy, z + 0.12), (reach * 0.65, reach * 0.65, 0.09), drift, rough=0.35, subdiv=2, tile=2)
        rock(room, f'drift-f{s}', (fx - s * 0.2, fy - 1.3, 0), (0.8, 0.6, 0.3), drift, tile=3)
        # Icicles all along the tops of the walls.
        for k in range(14):
            y = -r.uniform(0.3, D - 0.3)
            x = s * (W / 2 - INSET - 0.08)
            L = r.uniform(0.25, 0.9)
            lathe(f'icicle-{s}-{k}', (x, y, H - L), lambda t, a: 0.07 * t ** 1.4, L, ice, seg=6, rings=3, cap=False)
    for k in range(10):
        x = r.uniform(-W / 2 + 0.3, W / 2 - 0.3)
        L = r.uniform(0.25, 0.9)
        lathe(f'icicle-b-{k}', (x, -(D - INSET - 0.08), H - L), lambda t, a: 0.07 * t ** 1.4, L, ice, seg=6, rings=3, cap=False)
    # A snowman, in a front corner's lee.
    sx, sy = -(W / 2 - 1.0), -(D / 2 + 2.2)
    for k, (rad, z) in enumerate(((0.42, 0.34), (0.31, 0.95), (0.22, 1.38))):
        blob(f'snowman-{k}', (sx, sy, z), (rad, rad, rad * 0.95), drift, rough=0.04, subdiv=3, tile=2)
    nose = lathe('snowman-nose', (0, 0, 0), lambda t, a: 0.04 * (1 - t), 0.22, carrot, seg=10, rings=2, cap=False)
    nose.data.transform(Matrix.Translation((sx + 0.2, sy, 1.4)) @ Matrix.Rotation(math.pi / 2, 4, 'Y'))
    for e in (-1, 1):
        blob(f'snowman-eye-{e}', (sx + 0.19, sy + e * 0.08, 1.48), (0.025, 0.025, 0.025), coal, rough=0, subdiv=1)
    for b in range(3):
        blob(f'snowman-button-{b}', (sx + 0.3 - b * 0.02, sy, 1.12 - b * 0.16), (0.03, 0.03, 0.03), coal, rough=0, subdiv=1)
    lathe('snowman-scarf', (sx, sy, 1.15), lambda t, a: 0.25, 0.08, scarf, seg=16, rings=1)
    room.block(sx, sy, 0.55)


def village(room):
    r, W, D, H = room.r, room.W, room.D, room.H
    stone = textured('Stone.village', 'village/stone', rough=0.85)
    plane = textured('Bark.plane', 'village/bark')
    flowers = [f'village/flowers-{i}' for i in range(4)]
    geranium, lavender, ivy, box = flowers
    beech = 'forest/leaves-1'
    green = plain('Paint.shutter', '#4d6b5a', rough=0.5, metal=0.3)
    pot = plain('Paint.terracotta', '#c2673f', rough=0.85)
    cloth = [plain('Paint.awning-red', '#c8453a', rough=0.9), plain('Paint.cream', '#f4ead2', rough=0.9)]
    flags = [plain(f'Paint.flag-{c}', c, rough=0.9) for c in ('#2f5fa8', '#f4ead2', '#c8453a', '#e8b23a')]

    # A plane tree in each front corner.
    for s in (1, -1):
        fx, fy = room.front_corner(s, depth=1.8, inset=1.2)
        tree(room, f'plane-{s}', (fx, fy), 0.3, 4.6, plane, flare=0.2, tile=1.6)
        crown(f'plane-crown-{s}', [beech], (fx - s * 0.4, fy - 0.3, 5.3), (2.0, 1.8, 1.1), 40, r, size=(1.0, 1.6))
    # A fountain against the left wall at the back: a basin and a column with a spout.
    fx, fy = W / 2 - 1.6, -(D - 1.7)
    lathe('basin', (fx, fy, 0), lambda t, a: 1.05 + 0.12 * t, 0.55, stone, seg=28, rings=3, tile=1.0)
    lathe('water', (fx, fy, 0.45), lambda t, a: 1.0, 0.01, plain('Paint.water', '#5fa6b8', rough=0.05, metal=0.2), seg=28, rings=1)
    lathe('column', (fx, fy, 0), lambda t, a: 0.22 - 0.08 * math.sin(t * math.pi), 2.0, stone, seg=16, rings=6, tile=1.0)
    lathe('bowl', (fx, fy, 1.6), lambda t, a: 0.15 + 0.45 * t ** 0.6, 0.3, stone, seg=20, rings=4, tile=1.0)
    room.block(fx, fy, 1.25)
    # A café on the right at the back: two tables, their chairs, a parasol.
    cx, cy = -(W / 2 - 1.9), -(D - 1.9)
    for k, (tx, ty) in enumerate(((cx, cy), (cx + 0.1, cy + 1.8))):
        lathe(f'table-{k}', (tx, ty, 0), lambda t, a: 0.06 if t < 0.95 else 0.4, 0.74, green, seg=16, rings=6)
        for c in range(2):
            a = c * math.pi + 0.4
            px, py = tx + math.cos(a) * 0.62, ty + math.sin(a) * 0.62
            boxy(f'chair-seat-{k}-{c}', (0.42, 0.42, 0.05), (px, py, 0.46), green)
            for lx in (-0.17, 0.17):
                for ly in (-0.17, 0.17):
                    boxy(f'chair-leg-{k}-{c}-{lx}-{ly}', (0.03, 0.03, 0.46), (px + lx, py + ly, 0.23), green)
            back = boxy(f'chair-back-{k}-{c}', (0.42, 0.04, 0.45), (0, 0, 0), green)
            back.data.transform(Matrix.Translation((px + math.cos(a) * 0.2, py + math.sin(a) * 0.2, 0.72)) @ Matrix.Rotation(a + math.pi / 2, 4, 'Z'))
        room.block(tx, ty, 1.0)
    lathe('parasol-pole', (cx + 0.05, cy + 0.9, 0), lambda t, a: 0.03, 2.6, green, seg=8, rings=1)
    # Its canopy: eight panels, red and cream.
    px, py = cx + 0.05, cy + 0.9
    for k in range(8):
        a0, a1 = k * math.pi / 4, (k + 1) * math.pi / 4
        rim = [(px + 1.5 * math.cos(a), py + 1.5 * math.sin(a), 2.3) for a in (a0, a1)]
        quad(f'parasol-{k}', [rim[0], rim[1], (px, py, 2.75)], [(0, 0), (1, 0), (0.5, 1)], cloth[k % 2])
    # Planters of geraniums and lavender along the walls, low, and a boxwood by the door.
    for s in (1, -1):
        for k, y in enumerate((-(D / 2 - 2.2), -(D / 2 + 2.3))):
            x = s * (W / 2 - 0.45)
            boxy(f'planter-{s}-{k}', (0.5, 1.4, 0.4), (x, y, 0.2), pot, bevel=0.03)
            for j in range(5):
                tuft(f'flowers-{s}-{k}-{j}', [geranium if (j + k) % 2 else lavender], (x, y - 0.55 + j * 0.27, 0.38), 0.45, 3, r)
            room.block(x, y, 0.35, 0.8)
        lathe(f'pot-{s}', (s * 1.6, -0.5, 0), lambda t, a: 0.25 + 0.07 * t, 0.45, pot, seg=16, rings=2)
        tuft(f'box-{s}', [box], (s * 1.6, -0.5, 0.42), 0.8, 3, r, lean=(0.0, 0.2))
        tuft(f'ivy-{s}', [ivy], (s * (W / 2 - 0.3), -D / 2, 3.6), 1.4, 3, r, lean=(2.6, 3.0))
    # Bunting across the square, under the sky.
    for k in range(3):
        y = -(2.5 + k * 3.0)
        n = 14
        for i in range(n):
            t = (i + 0.5) / n
            x = W / 2 - INSET - t * (W - 2 * INSET)
            z = H - 1.2 - 0.9 * math.sin(t * math.pi)
            quad(f'flag-{k}-{i}', [(x + 0.16, y, z), (x - 0.16, y, z), (x, y, z - 0.38)], [(0, 0), (1, 0), (0.5, 1)], flags[(i + k) % 4])
        tube(f'string-{k}', [(W / 2 - INSET, y, H - 1.2), (0, y, H - 2.1), (-(W / 2 - INSET), y, H - 1.2)], 0.008,
             plain('Paint.string', '#e8e0cc'))


def alps(room):
    r, W, D, H = room.r, room.W, room.D, room.H
    granite = textured('Rock.granite', 'alps/rock')
    larch = textured('Wood.larch', 'alps/floor', rough=0.8)
    flowers = [f'alps/flowers-{i}' for i in range(4)]
    edelweiss, gentian, rose, grass = flowers
    brass = plain('Brass', kit.PREVIEW['Brass'], rough=0.35, metal=0.85)
    red = plain('Paint.flag-red', '#d52b1e', rough=0.8)
    white = plain('Paint.flag-white', '#ffffff', rough=0.8)

    # A railing round the edge of the terrace, but not in front of the exhibits.
    def rail(name, a, b):
        a, b = Vector(a), Vector(b)
        n = max(1, round((b - a).length / 1.4))
        for i in range(n + 1):
            p = a.lerp(b, i / n)
            boxy(f'{name}-post-{i}', (0.1, 0.1, 1.05), (p.x, p.y, 0.525), larch, tile=1.2)
        for z in (0.55, 1.05):
            d = b - a
            obj = boxy(f'{name}-rail-{z}', (d.length + 0.1, 0.07, 0.07), (0, 0, 0), larch, tile=1.2)
            obj.data.transform(Matrix.Translation(((a.x + b.x) / 2, (a.y + b.y) / 2, z)) @ Matrix.Rotation(math.atan2(d.y, d.x), 4, 'Z'))
    e = 0.55  # in from the walls
    for s in (1, -1):
        x = s * (W / 2 - e)
        rail(f'rail-side-f{s}', (x, -0.6), (x, -(D / 2 - 1.7)))
        rail(f'rail-side-b{s}', (x, -(D / 2 + 1.7)), (x, -(D - e)))
        rail(f'rail-back-{s}', (x, -(D - e)), (s * 2.0, -(D - e)))
    # Granite outcrops in the corners, with alpine flowers in their lee.
    for s in (1, -1):
        bx, by = room.back_corner(s, along=1.2, depth=1.5)
        rock(room, f'outcrop-{s}', (bx, by, 0), (0.75, 0.6, 0.55), granite, tile=1.4)
        tuft(f'edelweiss-{s}', [edelweiss, grass], (bx - s * 0.8, by + 0.4, 0), 0.4, 5, r)
        tuft(f'gentian-{s}', [gentian, grass], (bx + s * 0.1, by + 0.9, 0), 0.35, 5, r)
        fx, fy = room.front_corner(s, depth=1.4, inset=1.2)
        tuft(f'rose-{s}', [rose], (fx, fy, 0), 0.7, 4, r, lean=(0.1, 0.5))
        tuft(f'grass-{s}', [grass, edelweiss], (s * (W / 2 - 1.0), -D / 2, 0), 0.35, 6, r)
    # A summit cross in the left back corner, on its cairn.
    cx, cy = W / 2 - 1.3, -(D - 1.3)
    blob('cairn', (cx, cy, 0), (0.6, 0.6, 0.5), granite, rough=0.35, tile=1.0, sink=0.3)
    boxy('cross-upright', (0.16, 0.16, 3.2), (cx, cy, 1.6), larch, tile=1.2)
    boxy('cross-arm', (1.3, 0.16, 0.16), (cx, cy, 2.55), larch, tile=1.2)
    room.block(cx, cy, 0.75)
    # A telescope for the view, by the right front corner.
    tx, ty = -(W / 2 - 1.5), -(D / 2 - 2.3)
    lathe('scope-post', (tx, ty, 0), lambda t, a: 0.07 + 0.08 * (1 - t) ** 4, 1.1, brass, seg=14, rings=6)
    body = lathe('scope-body', (0, 0, 0), lambda t, a: 0.11 + 0.04 * t, 0.7, brass, seg=16, rings=2)
    body.data.transform(Matrix.Translation((tx, ty, 1.25)) @ Matrix.Rotation(-math.pi / 2 - 0.15, 4, 'X') @ Matrix.Translation((0, 0, -0.3)))
    room.block(tx, ty, 0.3)
    # A Swiss flag on a pole in the right back corner.
    px, py = -(W / 2 - 1.0), -(D - 1.0)
    lathe('flagpole', (px, py, 0), lambda t, a: 0.035, 4.6, white, seg=8, rings=1)
    boxy('flag', (0.02, 1.0, 1.0), (px, py + 0.55, 4.0), red, tile=1)
    boxy('flag-cross-a', (0.03, 0.6, 0.18), (px, py + 0.55, 4.0), white, tile=1)
    boxy('flag-cross-b', (0.03, 0.18, 0.6), (px, py + 0.55, 4.0), white, tile=1)
    room.block(px, py, 0.2)


# ---------- The zoo: rooms of the crew's own, furnished with their own pieces ----------
# (Their middles are kept clear, a band W - 4.4 wide from the doorway to short of the
# back wall: the residents live there. What stands is along the sides and in the corners.)

def cat_cafe(room):
    W, D = room.W, room.D
    for s in (1, -1):
        room.piece('set-cattree', s * (W / 2 - 0.9), -(D - 1.1), 2.0, 0.6)
    room.piece('set-armchair', W / 2 - 1.0, -1.3, 1.0, 0.5)
    room.piece('set-lamp', W / 2 - 0.4, -2.1, 1.7, 0.25)
    room.piece('prop-table', -(W / 2 - 1.1), -1.5, 0.9, 0.5)
    for dx in (-0.7, 0.7):
        room.piece('set-stool', -(W / 2 - 1.1) + dx, -1.5, 0.5, face=(-(W / 2 - 1.1), -1.5))
    room.piece('set-fern', W / 2 - 1.5, -(D - 2.1), 1.0, 0.35)
    room.piece('prop-crate', -(W / 2 - 1.6), -(D - 2.0), 0.7, 0.4)
    room.piece('set-rug', 0, -D / 2 + 0.2, 2.6, yaw=0)
    room.piece('prop-cushion', 1.3, -2.4, 0.7)
    room.piece('prop-yarn', -1.1, -4.6, 0.3)
    room.piece('prop-yarn', 1.8, -5.3, 0.25)


def dog_park(room):
    r, W, D = room.r, room.W, room.D
    bark = textured('Bark.forest', 'forest/bark')
    beech = 'forest/leaves-1'
    flowers = [f'village/flowers-{i}' for i in range(4)]
    for s in (1, -1):
        room.piece('set-kennel', s * (W / 2 - 1.3), -(D - 1.6), 1.6, 0.8)
        fx, fy = s * (W / 2 - 1.0), -1.4
        tree(room, f'oak-{s}', (fx, fy), 0.3, 4.4, bark, flare=0.4, tile=1.6)
        crown(f'oak-crown-{s}', [beech], (fx - s * 0.5, fy - 0.4, 5.0), (2.0, 1.8, 1.1), 40, r, size=(1.0, 1.6))
        room.piece('set-sunflower', s * (W / 2 - 0.5), -3.0, 1.6, 0.2)
        room.piece('set-sunflower', s * (W / 2 - 0.9), -3.2, 1.3, 0.2)
        for k, y in enumerate((-(D / 2 + 2.0), -(D / 2 - 2.2))):
            tuft(f'flowers-{s}-{k}', flowers[:2], (s * (W / 2 - 0.35), y, 0), 0.45, 5, r)
    room.piece('prop-ball', 1.1, -3.1, 0.35)
    room.piece('prop-bone', -1.6, -5.4, 0.45)
    room.piece('prop-frisbee', 0.9, -6.1, 0.4)


def aviary(room):
    r, W, D, H = room.r, room.W, room.D, room.H
    bark = textured('Bark.jungle', 'jungle/bark')
    leaves = [f'jungle/leaves-{i}' for i in range(4)]
    for s in (1, -1):
        room.piece('set-perch', s * (W / 2 - 1.1), -2.0, 2.0, 0.4)
        room.piece('set-perch', s * (W / 2 - 1.1), -(D - 2.4), 2.3, 0.4)
        room.piece('set-fern', s * (W / 2 - 0.5), -3.0, 1.0, 0.3)
        tuft(f'fern-front-{s}', [leaves[3]], (s * (W / 2 - 0.4), -0.6, 0), 0.9, 6, r)
        tuft(f'banana-{s}', [leaves[1]], (s * (W / 2 - 0.5), -(D / 2 + 2.0), 0), 2.0, 5, r, lean=(0.15, 0.5))
    # A tree in the left back corner for them to sit in, a bath in the right.
    tx, ty = W / 2 - 0.9, -(D - 0.9)
    tree(room, 'tree', (tx, ty), 0.3, H - 1.0, bark, flare=0.7)
    crown('crown', leaves[:3], (tx - 0.6, ty + 0.6, H - 1.8), (1.8, 1.5, 0.9), 28, r, size=(1.2, 2.0))
    room.piece('set-birdbath', -(W / 2 - 1.9), -(D - 1.0), 1.1, 0.45)


def robot_park(room):
    W, D = room.W, room.D
    room.piece('prop-trampoline', W / 2 - 1.2, -(D - 1.6), 1.7, 0.85)
    room.piece('prop-seesaw', -(W / 2 - 1.2), -(D - 1.9), 2.2, 0.4, 1.1, yaw=math.pi / 2)
    for s in (1, -1):
        room.piece('set-lamp', s * (W / 2 - 0.5), -2.0, 1.8, 0.25)
    room.piece('prop-drum', -(W / 2 - 1.4), -1.6, 0.7, 0.4)
    room.piece('prop-crate', W / 2 - 1.3, -1.6, 0.8, 0.45)
    room.piece('prop-top', 1.0, -3.0, 0.45)
    room.piece('prop-block-star', -1.2, -4.6, 0.35)
    room.piece('prop-block-heart', -0.6, -4.9, 0.3)
    room.piece('prop-block-ring', 1.5, -5.4, 0.35)
    room.piece('prop-ball', -0.3, -2.4, 0.35)


THEMES = {'jungle': jungle, 'forest': forest, 'aquarium': aquarium, 'snow': snow, 'village': village, 'alps': alps,
          'cat-cafe': cat_cafe, 'dog-park': dog_park, 'aviary': aviary, 'robot-park': robot_park}


def make(theme):
    kit.reset_scene()
    room = Room(theme)
    room.shell()
    THEMES[theme](room)
    return room


def merge():
    """Everything of one material as one mesh (but the floor, which is clicked on): a room
    is a few dozen draws, not hundreds of leaves."""
    groups = {}
    for o in list(bpy.context.scene.objects):
        if o.type == 'MESH' and o.name != 'Floor':
            groups.setdefault(o.data.materials[0].name, []).append(o)
    for name, parts in groups.items():
        if len(parts) > 1:
            kit.join(name, parts)
        else:
            parts[0].name = name


def export(out, room):
    merge()
    for o in bpy.context.scene.objects:
        o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format='GLB',
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_materials='EXPORT',
        export_image_format='WEBP',
        export_image_quality=88,
        export_texcoords=True,
        export_normals=True,
        export_animations=False,
        export_extras=False,
        export_cameras=False,
        export_lights=False,
    )
    tris = sum(len(p.vertices) - 2 for o in bpy.context.scene.objects if o.type == 'MESH' for p in o.data.polygons)
    print(f'ROOM {room.theme} {room.W}x{room.D}x{room.H} m, {len(bpy.context.scene.objects)} objects, {tris} triangles')


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out = args[0] if args else '.'
    themes = args[1:] or list(THEMES)
    os.makedirs(out, exist_ok=True)
    spec_path = os.path.join(out, 'rooms.json')
    spec = json.load(open(spec_path)) if os.path.exists(spec_path) else {}
    for theme in themes:
        room = make(theme)
        export(os.path.join(out, f'{theme}.glb'), room)
        spec[theme] = {'width': room.W, 'depth': room.D, 'height': room.H, 'residents': RESIDENTS[theme],
                       'blocks': room.blocks, 'set': room.set}
    for theme, v in spec.items():
        v['residents'] = RESIDENTS.get(theme, v.get('residents', []))
    with open(spec_path, 'w') as f:
        # (A block, a piece, to a line.)
        def room_json(t, v):
            head = (f'  "{t}": {{"width": {v["width"]}, "depth": {v["depth"]}, "height": {v["height"]}, '
                    f'"residents": {json.dumps(v["residents"])}, "blocks": [\n')
            blocks = ',\n'.join(f'    {json.dumps(b)}' for b in v['blocks'])
            pieces = ',\n'.join(f'    {json.dumps(p)}' for p in v.get('set', []))
            return head + blocks + '\n  ], "set": [' + ('\n' + pieces + '\n  ' if pieces else '') + ']}'
        f.write('{\n' + ',\n'.join(room_json(t, v) for t, v in sorted(spec.items())) + '\n}\n')
    print(f'EXPORTED {out}')
