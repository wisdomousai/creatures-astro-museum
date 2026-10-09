"""Export a building of your own for the site (museum({ building: ... })): everything in
the open .blend, empties and their custom properties too, the plan's names and all
(blender/buildings/README.md).

    Blender -b mine.blend -P blender/export_building.py -- OUT.glb

blender/buildings/build.sh runs this (or template.py) and compresses the result.
"""

import sys

import bpy


def export(out):
    for obj in bpy.context.scene.objects:
        obj.hide_set(False)
        obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format='GLB',
        use_selection=False,
        export_yup=True,
        export_apply=True,
        export_materials='EXPORT',
        export_animations=False,
        export_skins=False,
        export_texcoords=True,
        export_normals=True,
        export_extras=True,
        export_cameras=False,
        export_lights=False,
    )
    names = sorted(o.name for o in bpy.context.scene.objects)
    for prefix in ('NAV_', 'WALL_', 'COL_', 'SLOT_', 'LANE_', 'SIGN_'):
        print(f'PLAN {prefix} {sum(n.startswith(prefix) for n in names)}')
    print(f'PLAN SPAWN {"SPAWN" in names}')
    print(f'EXPORTED {out}')


if __name__ == '__main__':
    export(sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else 'building.glb')
