// The building, from the kit (blender/pieces.py, in assets/kit/kit.glb): every run of wall
// a row of wall_1m, every doorway a lintel, a post at every corner and doorway's side,
// skylights in the ceilings, benches and signs. Each piece is drawn once for all its
// copies (instanced), whatever room they're in; the walls take their room's paint.
import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import type { RoamSeat } from '@wisdomousai/creatures';
import type { Plan, V2 } from '../plan/types';
import type { Materials } from './materials';
import { signFace } from './text';

/** A piece's parts: a geometry and its role (material name) each. */
export type Piece = { geometry: BufferGeometry; role: string }[];

export class Kit {
  private pieces = new Map<string, Piece>();

  static async load(url: string): Promise<Kit> {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync(url);
    const kit = new Kit();
    for (const child of gltf.scene.children) {
      const parts: Piece = [];
      child.updateMatrixWorld(true);
      child.traverse((o) => {
        const m = o as Mesh;
        if (!m.isMesh) return;
        // (The piece sits at the origin; bake any node transform into its geometry. That
        // includes meshopt's dequantizing scale, so the attributes go to floats first: in
        // their own 16 bits they'd be clamped to ±1.)
        const g = floats(m.geometry);
        g.applyMatrix4(m.matrixWorld);
        parts.push({ geometry: g, role: (m.material as { name: string }).name });
      });
      kit.pieces.set(child.name, parts);
    }
    return kit;
  }

  piece(name: string): Piece {
    const p = this.pieces.get(name);
    if (!p) throw new Error(`The kit has no ${name}`);
    return p;
  }

  /** One copy of a piece, as ordinary meshes (for an exhibit's own frame, say). */
  mesh(name: string, materials: Materials): Group {
    const g = new Group();
    for (const part of this.piece(name)) {
      const m = new Mesh(part.geometry, materials.role(part.role));
      m.castShadow = m.receiveShadow = true;
      g.add(m);
    }
    return g;
  }
}

/** A copy of a geometry whose attributes are all plain floats. */
function floats(source: BufferGeometry): BufferGeometry {
  const g = new BufferGeometry();
  g.setIndex(source.index);
  for (const [name, a] of Object.entries(source.attributes)) {
    const out = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++)
      for (let k = 0; k < a.itemSize; k++) out[i * a.itemSize + k] = a.getComponent(i, k);
    g.setAttribute(name, new BufferAttribute(out, a.itemSize));
  }
  return g;
}

/** Copies of pieces, gathered, then drawn as one InstancedMesh per piece and material. */
export class Instancer {
  private copies = new Map<string, { matrix: Matrix4; colour?: Color }[]>();

  add(piece: string, matrix: Matrix4, colour?: Color) {
    let list = this.copies.get(piece);
    if (!list) this.copies.set(piece, (list = []));
    list.push({ matrix, colour });
  }

  build(kit: Kit, materials: Materials): Group {
    const group = new Group();
    for (const [name, list] of this.copies) {
      for (const part of kit.piece(name)) {
        const mesh = new InstancedMesh(part.geometry, materials.role(part.role), list.length);
        list.forEach((c, i) => {
          mesh.setMatrixAt(i, c.matrix);
          // Only the walls' paint differs room to room; the rest is the role's own.
          if (part.role.startsWith('Wall')) mesh.setColorAt(i, c.colour ?? WHITE);
        });
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.computeBoundingSphere();
        mesh.name = `${name}:${part.role}`;
        group.add(mesh);
      }
    }
    return group;
  }
}

const WHITE = new Color(1, 1, 1);
const UP = new Vector3(0, 1, 0);

/** The benches, as somewhere the crew can get up on and sit: each one's top, from the
 * kit's bench (its length along its own x, before it's turned). */
export function benchSeats(plan: Plan, kit: Kit): RoamSeat[] {
  const box = new Box3();
  for (const part of kit.piece('bench')) {
    part.geometry.computeBoundingBox();
    box.union(part.geometry.boundingBox!);
  }
  const size = box.getSize(new Vector3());
  const long = size.x >= size.z;
  return plan.benches.map((b) => {
    // (Turned yaw about y, its own +x runs (cos, -sin) on the floor.)
    const x: [number, number] = [Math.cos(b.yaw), -Math.sin(b.yaw)];
    return {
      at: [b.at[0], b.at[1]],
      height: box.max.y,
      length: (long ? size.x : size.z) - 0.1,
      width: (long ? size.z : size.x) - 0.1,
      along: long ? x : [-x[1], x[0]],
    };
  });
}

/** A matrix: at (x, y, z), turned `yaw` about y, scaled. */
export function place(x: number, y: number, z: number, yaw = 0, sx = 1, sy = 1, sz = 1) {
  return new Matrix4().compose(
    new Vector3(x, y, z),
    new Quaternion().setFromAxisAngle(UP, yaw),
    new Vector3(sx, sy, sz),
  );
}

/** The yaw that turns +x to run along d (three.js: rotation.y θ takes +x to (cos θ, -sin θ)). */
export const yawAlong = (d: V2) => Math.atan2(-d[1], d[0]);

export interface Building {
  group: Group;
  /** The floors, for clicking where to walk. */
  floors: Object3D[];
}

/** The museum's rooms, built from the plan. */
export function build(plan: Plan, kit: Kit, materials: Materials): Building {
  const group = new Group();
  const parts = new Instancer();
  const paint = new Map<string, Color>();
  const wings = [...new Set(plan.rooms.map((r) => r.wing))];
  for (const r of plan.rooms) paint.set(r.id, materials.room(wings.indexOf(r.wing)));

  // A building of the site's own brings its own walls, floors and ceilings (own.ts): the
  // kit only hangs the signs.
  const own = !!plan.building;
  const floors: Object3D[] = [];
  // A themed room brings its own walls, floor and ceiling too (themed.ts): the kit only
  // gives it a floor to click on, unseen.
  const themed = new Set(plan.rooms.filter((r) => r.theme).map((r) => r.id));

  // The walls: a metre at a time (the last one cut to fit), lintels over doorways.
  const posts = new Map<string, V2>();
  for (const w of own ? [] : plan.walls.filter((w) => !themed.has(w.room))) {
    const dx = w.b[0] - w.a[0];
    const dz = w.b[1] - w.a[1];
    const len = Math.hypot(dx, dz);
    const d: V2 = [dx / len, dz / len];
    const yaw = yawAlong(d);
    const colour = paint.get(w.room);
    if (w.kind === 'door') parts.add('lintel_2m', place(w.a[0], 0, w.a[1], yaw, len / 2), colour);
    else {
      const n = Math.ceil(len - 1e-6);
      for (let i = 0; i < n; i++) {
        const piece = Math.min(1, len - i);
        parts.add('wall_1m', place(w.a[0] + d[0] * i, 0, w.a[1] + d[1] * i, yaw, piece), colour);
      }
    }
    for (const p of [w.a, w.b]) posts.set(`${p[0].toFixed(2)},${p[1].toFixed(2)}`, p);
  }
  for (const p of posts.values()) parts.add('post', place(p[0], 0, p[1]));

  // Skylights down the middle of every room, every four metres.
  for (const r of own ? [] : plan.rooms) {
    const w = r.max[0] - r.min[0];
    const d = r.max[1] - r.min[1];
    const cx = (r.min[0] + r.max[0]) / 2;
    const cz = (r.min[1] + r.max[1]) / 2;
    const along = w > d ? 0 : 1;
    const len = along === 0 ? w : d;
    const n = themed.has(r.id) ? 0 : Math.max(1, Math.floor(len / 4));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n - 0.5;
      const x = along === 0 ? cx + t * len : cx;
      const z = along === 1 ? cz + t * len : cz;
      parts.add('skylight', place(x, plan.height, z));
    }
    // Its floor and ceiling.
    const tex = materials.floor(r.kind === 'lobby' ? 'tiles' : 'boards').clone();
    tex.repeat.set(w / 2, d / 2);
    tex.needsUpdate = true;
    const floor = new Mesh(
      new PlaneGeometry(w, d),
      new MeshStandardMaterial({ map: tex, roughness: 0.78, metalness: 0 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0, cz);
    floor.receiveShadow = true;
    floor.userData.floor = r.id;
    floors.push(floor);
    if (themed.has(r.id)) {
      floor.visible = false;
      group.add(floor);
      continue;
    }
    const ceiling = new Mesh(
      new PlaneGeometry(w + 0.4, d + 0.4),
      new MeshStandardMaterial({ color: materials.palette.ceiling, roughness: 0.9 }),
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(cx, plan.height, cz);
    group.add(floor, ceiling);
  }
  // The floors in the doorways (between two rooms' floors).
  for (const door of own ? [] : plan.doors) {
    const dx = door.b[0] - door.a[0];
    const dz = door.b[1] - door.a[1];
    const len = Math.hypot(dx, dz);
    const plate = new Mesh(
      new PlaneGeometry(len, 0.5),
      materials.role('Trim') as MeshStandardMaterial,
    );
    // Flat on the floor, then turned to lie across the doorway.
    plate.rotation.set(-Math.PI / 2, yawAlong([dx / len, dz / len]), 0, 'YXZ');
    plate.position.set((door.a[0] + door.b[0]) / 2, 0.004, (door.a[1] + door.b[1]) / 2);
    plate.receiveShadow = true;
    plate.userData.floor = door.rooms[1];
    floors.push(plate);
    group.add(plate);
  }

  for (const b of plan.benches) parts.add('bench', place(b.at[0], 0, b.at[1], b.yaw));

  // Signs over the doorways, the wing's name on each.
  const { paper, ink } = materials.palette;
  for (const s of plan.signs) {
    parts.add('sign', place(s.at[0], s.at[1], s.at[2], s.yaw));
    const face = new Mesh(
      new PlaneGeometry(2.36, 0.46),
      new MeshBasicMaterial({ map: signFace(s.text, 2.36, 0.46, paper, ink), side: DoubleSide }),
    );
    face.position.set(s.at[0], s.at[1], s.at[2]);
    face.rotation.y = s.yaw;
    face.translateZ(0.085);
    group.add(face);
  }

  group.add(parts.build(kit, materials));
  return { group, floors };
}
