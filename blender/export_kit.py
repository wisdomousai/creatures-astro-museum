"""Export the kit for the site: every piece (pieces.py) as a named mesh in one file, at the
origin, materials only as names (the site makes its own: src/museum/materials.ts).

    Blender -b --factory-startup -P blender/export_kit.py -- OUT.glb

blender/build.sh runs this and compresses the result into assets/kit/kit.glb.
"""

import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(__file__))
import kit  # noqa: E402
import pieces  # noqa: E402

out = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else 'kit.glb'
kit.reset_scene()
made = pieces.build()
for obj in made:
    obj.select_set(True)
    tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    print(f'PIECE {obj.name} {tris} triangles, {len(obj.data.materials)} materials')
bpy.ops.export_scene.gltf(
    filepath=out,
    export_format='GLB',
    use_selection=True,
    export_yup=True,
    export_apply=True,
    export_materials='EXPORT',
    export_animations=False,
    export_skins=False,
    export_texcoords=False,
    export_normals=True,
    export_extras=False,
)
print(f'EXPORTED {out}')
