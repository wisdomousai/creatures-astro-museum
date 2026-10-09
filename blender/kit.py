"""The toolbox for the museum's kit: chunky, rounded shapes, like the creatures' own
(their blender/kit.py), and materials that are only names.

The site builds every material itself, by name (src/museum/materials.ts), in the crew's
look: so a material here is a name and a preview colour, nothing more.

    Wall    painted wall          Trim    baseboards, cornices, posts, mouldings
    Frame   a picture's moulding  Plinth  what objects stand on
    Wood    benches, desks        Velvet  cushions, ropes
    Brass   rivets, bells, posts  Glow    lamps, skylights
    Floor   floors                Dark    the inside of things (a shelf's back)

Units are metres, Blender's z up; each piece's origin is where the site places it (see
pieces.py). Exported y-up for three.js.
"""

import math

import bmesh
import bpy

PREVIEW = {
    'Wall': '#e9e4d8',
    'Trim': '#3c3a36',
    'Frame': '#b08a4a',
    'Plinth': '#f1ede4',
    'Wood': '#9a6a42',
    'Velvet': '#9b3b3b',
    'Brass': '#c9a24c',
    'Glow': '#fff4d6',
    'Floor': '#c8b89c',
    'Dark': '#26241f',
}


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.objects):
        for item in list(block):
            block.remove(item)


def srgb(hex_colour):
    h = hex_colour.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c] + [1.0]


def material(name):
    """The material for a part's role: one each, shared by every piece."""
    mat = bpy.data.materials.get(name)
    if mat:
        return mat
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = srgb(PREVIEW[name])
    bsdf.inputs['Roughness'].default_value = 0.55
    if name == 'Brass':
        bsdf.inputs['Metallic'].default_value = 0.8
        bsdf.inputs['Roughness'].default_value = 0.35
    if name == 'Glow':
        bsdf.inputs['Emission Color'].default_value = srgb(PREVIEW[name])
        bsdf.inputs['Emission Strength'].default_value = 2.0
    return mat


def _finish(obj, mat, bevel, segments, smooth):
    obj.data.materials.append(material(mat))
    if bevel > 0:
        mod = obj.modifiers.new('Bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = segments
        mod.limit_method = 'ANGLE'
        mod.harden_normals = False
        apply_modifiers(obj)
    if smooth:
        for poly in obj.data.polygons:
            poly.use_smooth = True
        # Flat faces stay flat, rounded edges shade round.
        obj.data.set_sharp_from_angle(angle=math.radians(40))
    return obj


def box(name, size, at, mat, bevel=0.0, segments=2, smooth=True):
    """A box `size` (x, y, z) with its middle at `at`, its edges rounded by `bevel`."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=at)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = size
    apply_transforms(obj)
    return _finish(obj, mat, bevel, segments, smooth)


def cylinder(name, radius, depth, at, mat, bevel=0.0, segments=3, vertices=24, axis='Z'):
    """A cylinder, its middle at `at`, along `axis`."""
    rotation = {'X': (0, math.pi / 2, 0), 'Y': (math.pi / 2, 0, 0), 'Z': (0, 0, 0)}[axis]
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=radius, depth=depth, location=at, rotation=rotation
    )
    obj = bpy.context.active_object
    obj.name = name
    apply_transforms(obj)
    return _finish(obj, mat, bevel, segments, True)


def sphere(name, radius, at, mat, segments=16, rings=10, squash=1.0):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=radius, location=at)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (1, 1, squash)
    apply_transforms(obj)
    return _finish(obj, mat, 0, 0, True)


def lathe(name, profile, at, mat, seg=32):
    """Round about z: `profile` is (radius, height) points, bottom to top."""
    bm = bmesh.new()
    rings = []
    for k in range(seg):
        a = 2 * math.pi * k / seg
        rings.append([bm.verts.new((r * math.cos(a), r * math.sin(a), z)) for r, z in profile])
    for k in range(seg):
        a, b = rings[k], rings[(k + 1) % seg]
        for i in range(len(profile) - 1):
            bm.faces.new((a[i], b[i], b[i + 1], a[i + 1]))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(obj)
    obj.location = at
    apply_transforms(obj)
    return _finish(obj, mat, 0, 0, True)


def apply_transforms(obj):
    with bpy.context.temp_override(active_object=obj, object=obj, selected_objects=[obj],
                                   selected_editable_objects=[obj]):
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def apply_modifiers(obj):
    with bpy.context.temp_override(active_object=obj, object=obj, selected_objects=[obj],
                                   selected_editable_objects=[obj]):
        for mod in list(obj.modifiers):
            bpy.ops.object.modifier_apply(modifier=mod.name)


def join(name, parts):
    """One object of all the parts, its origin at the world's: the piece."""
    target = parts[0]
    with bpy.context.temp_override(active_object=target, object=target, selected_objects=parts,
                                   selected_editable_objects=parts):
        bpy.ops.object.join()
    target.name = target.data.name = name
    return target


def mirror_x(parts, about=0.0):
    """Copies of these parts mirrored left to right about x = `about`."""
    out = []
    for p in parts:
        q = p.copy()
        q.data = p.data.copy()
        bpy.context.collection.objects.link(q)
        for v in q.data.vertices:
            v.co.x = 2 * about - v.co.x
        q.data.flip_normals()
        out.append(q)
    return out


def mirror_y(parts):
    """Copies of these parts mirrored front to back (the wall's other face)."""
    out = []
    for p in parts:
        q = p.copy()
        q.data = p.data.copy()
        bpy.context.collection.objects.link(q)
        for v in q.data.vertices:
            v.co.y = -v.co.y
        q.data.flip_normals()
        out.append(q)
    return out
