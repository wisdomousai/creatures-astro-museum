// Parts most exhibits are made of: a picture, a frame round it from the kit's mouldings
// and corner blocks with a light over it, pieces of the kit put together as one mesh per
// material (so a frame is three draw calls, not thirty).
import {
  BoxGeometry,
  type BufferGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  type Texture,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { place } from '../museum/kit';
import { RAIL } from '../plan/generate';
import type { Ctx } from './types';

/** Pieces of the kit at these places, merged: one mesh for each material. */
export function assemble(ctx: Ctx, pieces: { piece: string; at: Matrix4 }[]): Group {
  const byRole = new Map<string, BufferGeometry[]>();
  for (const { piece, at } of pieces)
    for (const part of ctx.kit.piece(piece)) {
      const g = part.geometry.clone().applyMatrix4(at);
      const role = part.role.replace(/\.\d+$/, '');
      if (!byRole.has(role)) byRole.set(role, []);
      byRole.get(role)!.push(g);
    }
  const group = new Group();
  for (const [role, list] of byRole) {
    const merged = mergeGeometries(list.map(strip), false);
    if (!merged) continue;
    const mesh = new Mesh(merged, ctx.materials.role(role));
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

/** Only what every piece has (positions and normals), so any of them merge. */
function strip(g: BufferGeometry): BufferGeometry {
  for (const name of Object.keys(g.attributes))
    if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  return g.index ? g.toNonIndexed() : g;
}

/** A picture: a `w` x `h` plane facing +z, showing the texture as it is (unlit). */
export function picture(texture: Texture | null, w: number, h: number): Mesh<PlaneGeometry, MeshBasicMaterial> {
  const m = new MeshBasicMaterial({ map: texture, toneMapped: false, color: 0xf2f2f2 });
  const mesh = new Mesh(new PlaneGeometry(w, h), m);
  return mesh;
}

const M = 0.12;

/**
 * A frame round a `w` x `h` picture, its face at z = 0 (the wall) and the picture set
 * in it; with a light over it unless `lamp` is false.
 */
export function framed(ctx: Ctx, w: number, h: number, lamp = true): Group {
  const x = w / 2 + M / 2;
  const y = h / 2 + M / 2;
  const pieces = [
    { piece: 'frame_edge', at: place(0, y, 0, 0, w) },
    { piece: 'frame_edge', at: place(0, -y, 0, 0, w) },
    { piece: 'frame_edge', at: upright(-x, h) },
    { piece: 'frame_edge', at: upright(x, h) },
    ...[-1, 1].flatMap((sx) =>
      [-1, 1].map((sy) => ({ piece: 'frame_corner', at: place(sx * x, sy * y, 0) })),
    ),
  ];
  if (lamp) pieces.push({ piece: 'lamp', at: place(0, h / 2 + M + 0.14, 0, 0, Math.max(0.5, w * 0.55)) });
  const group = assemble(ctx, pieces);
  // A backing board behind the picture, and the stretcher it's on, back to the wall (it
  // hangs clear of the rails, RAIL out).
  const back = new Mesh(new PlaneGeometry(w + 0.02, h + 0.02), ctx.materials.role('Dark'));
  back.position.z = 0.01;
  const stretcher = new Mesh(new BoxGeometry(w + M, h + M, RAIL), ctx.materials.role('Dark'));
  stretcher.position.z = -RAIL / 2;
  group.add(back, stretcher);
  return group;
}

/** A moulding `h` long, standing up at x: stretched along its length, then turned a
 * quarter about z. */
function upright(x: number, h: number): Matrix4 {
  return new Matrix4()
    .makeTranslation(x, 0, 0)
    .multiply(new Matrix4().makeRotationZ(Math.PI / 2))
    .multiply(new Matrix4().makeScale(h, 1, 1));
}
