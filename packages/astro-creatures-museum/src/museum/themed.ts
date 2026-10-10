// The themed rooms (a room of its own with `room: jungle`, say): each its theme's file
// (assets/rooms/<theme>.glb, made in Blender by blender/rooms/rooms.py), put where the plan
// has the room, its wallpaper lit like a backdrop, in the museum's look, with the crew's
// own furniture and toys standing in it (the cat café's cat trees, the dog park's
// kennels). And what's in the air: bubbles in the aquarium, leaves falling in the forest,
// snow in the snow. Who lives there is the crew's (crews.ts).
import {
  AdditiveBlending,
  Box3,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  Mesh,
  type MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Raycaster,
  type Skeleton,
  type SkinnedMesh,
  SRGBColorSpace,
  type Texture,
  TextureLoader,
  Vector3,
} from 'three';
import { dress, loadModel, type RoamSeat } from '@wisdomousai/creatures';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { hash, rng } from '../plan/rng';
import type { Plan, Room, ThemeSpec } from '../plan/types';
import themes from '../../assets/rooms/rooms.json';
import type { Look, Materials } from './materials';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
/** The crew's pieces that those living in a room get up on (their tops, found by looking
 * down on them): true for those only fliers do (a perch, a birdbath). */
const SEATS: Record<string, boolean> = {
  'set-cattree': false,
  'set-armchair': false,
  'set-kennel': false,
  'set-stool': false,
  'prop-table': false,
  'prop-cushion': false,
  'prop-crate': false,
  'prop-drum': false,
  'prop-trampoline': false,
  'set-perch': true,
  'set-birdbath': true,
  'set-lamp': true,
};
const ROLES = new Set([
  'Wall',
  'Trim',
  'Frame',
  'Plinth',
  'Wood',
  'Velvet',
  'Brass',
  'Glow',
  'Floor',
  'Dark',
]);

/** A themed room in place: its size, and its frame (local +z is in from the doorway). */
interface Placed {
  room: Room;
  group: Group;
  W: number;
  D: number;
  H: number;
  life: Life | null;
}

/** What moves in a room: updated while the visitor is near enough to see it. */
interface Life {
  update(dt: number, t: number, eye: Vector3): void;
}

export class Themed {
  readonly group = new Group();
  /** A room's furniture is in: the tops of it to get up on, in the world. */
  onFurnished: ((room: string, seats: RoamSeat[]) => void) | null = null;
  private placed: Placed[] = [];
  private loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  private textures = new TextureLoader();
  private time = 0;

  constructor(
    plan: Plan,
    private materials: Materials,
    private look: Look,
    /** Things may move (the visitor hasn't asked for less motion). */
    private moving: boolean,
  ) {
    for (const room of plan.rooms) {
      if (!room.theme) continue;
      const out = room.forward;
      const W =
        Math.abs(out[1]) * (room.max[0] - room.min[0]) +
        Math.abs(out[0]) * (room.max[1] - room.min[1]);
      const D =
        Math.abs(out[0]) * (room.max[0] - room.min[0]) +
        Math.abs(out[1]) * (room.max[1] - room.min[1]);
      const group = new Group();
      // Its doorway's middle, on the hall's wall: the room's middle, back half its depth.
      group.position.set(
        (room.min[0] + room.max[0]) / 2 - (out[0] * D) / 2,
        0,
        (room.min[1] + room.max[1]) / 2 - (out[1] * D) / 2,
      );
      group.rotation.y = Math.atan2(out[0], out[1]);
      this.group.add(group);
      this.placed.push({ room, group, W, D, H: room.height ?? plan.height, life: null });
    }
  }

  get any() {
    return this.placed.length > 0;
  }

  /** Bring them in, nearest `from` first, one after another. */
  async load(from: [number, number]) {
    const near = (p: Placed) =>
      Math.hypot(p.group.position.x - from[0], p.group.position.z - from[1]);
    for (const p of [...this.placed].sort((a, b) => near(a) - near(b))) {
      try {
        const gltf = await this.loader.loadAsync(`${BASE}/museum-rooms/${p.room.theme}.glb`);
        gltf.scene.traverse((o) => this.dress(o));
        p.group.add(gltf.scene);
        await this.furnish(p);
        p.life = await this.lives(p);
        if (p.life) p.life.update(0, 0, new Vector3(1e3, 0, 1e3));
      } catch (e) {
        console.error(`museum: the ${p.room.theme} room`, e);
      }
    }
  }

  /** The crew's own furniture and toys (the cat tree, the kennel...), from their models, as
   * rooms.json has them stand. */
  private async furnish(p: Placed) {
    const set = (themes as Record<string, ThemeSpec>)[p.room.theme!]?.set ?? [];
    const seats: RoamSeat[] = [];
    await Promise.all(
      set.map(async (s) => {
        try {
          const model = await loadModel(`${BASE}/creatures/${s.model}.glb`);
          dress(model, this.look);
          // (It stands still: posed once, for good, rather than every frame.)
          still(model);
          // Its biggest side `size`, standing on the floor where it goes.
          rebound(model);
          const box = new Box3().setFromObject(model);
          const big = Math.max(...box.getSize(new Vector3()).toArray());
          const holder = new Group();
          holder.add(model);
          model.scale.setScalar(s.size / big);
          model.position.y = (-box.min.y * s.size) / big;
          holder.position.set(s.at[0], 0, s.at[1]);
          holder.rotation.y = s.yaw;
          holder.traverse((o) => {
            if ((o as Mesh).isMesh) o.castShadow = o.receiveShadow = true;
          });
          p.group.add(holder);
          if (s.model in SEATS) {
            holder.updateWorldMatrix(true, true);
            seats.push(...tops(holder, SEATS[s.model]));
          }
        } catch (e) {
          console.error(`museum: the ${s.model} in the ${p.room.theme} room`, e);
        }
      }),
    );
    this.onFurnished?.(p.room.id, seats);
  }

  /** A part of a room in the museum's look. */
  private dress(o: Object3D) {
    const m = o as Mesh;
    if (!m.isMesh) return;
    const mat = m.material as MeshStandardMaterial;
    const name = mat.name;
    m.receiveShadow = true;
    m.castShadow = !/^(Mural\.\w+\.ceiling|Ground)/.test(name);
    if (ROLES.has(name)) {
      m.material = this.materials.role(name);
      return;
    }
    if (name.startsWith('Mural.')) {
      // A painted view: lit from within, mostly, as a backdrop is (the sun's shadows still
      // fall on it). Its walls stand in for the room's: they cast shadows either way.
      mat.emissive = new Color(1, 1, 1);
      mat.emissiveMap = mat.map;
      mat.emissiveIntensity = this.look === 'ink' ? 0.22 : 0.62;
      mat.color.setScalar(0.5);
      mat.roughness = 1;
      mat.shadowSide = DoubleSide;
    }
    if (name.startsWith('Card.')) {
      // (Cut out, not blended: Blender says BLEND, and the loader leaves them out of the
      // depth buffer then, so whatever's drawn after them would cover them.)
      mat.alphaTest = 0.5;
      mat.transparent = false;
      mat.depthWrite = true;
      mat.side = DoubleSide;
    }
    this.toLook(mat);
  }

  /** Paper is all greys; in ink the lights are down. */
  private toLook(mat: MeshStandardMaterial | PointsMaterial) {
    if (this.look === 'ink' && !mat.name.startsWith('Mural.')) mat.color.multiplyScalar(0.55);
    if (this.look !== 'paper') return;
    mat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        gl_FragColor.rgb = mix(vec3(dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114))), vec3(1.0), 0.18);`,
      );
    };
    mat.customProgramCacheKey = () => 'museum-grey';
  }

  private sprites = new Map<string, Promise<Texture>>();
  private sprite(name: string) {
    let p = this.sprites.get(name);
    if (!p) {
      p = this.textures.loadAsync(`${BASE}/museum-rooms/sprites/${name}.webp`).then((t) => {
        t.colorSpace = SRGBColorSpace;
        return t;
      });
      this.sprites.set(name, p);
    }
    return p;
  }

  /** A cut-out `height` high, as wide as its picture, facing +z, lit. */
  private async cutout(name: string, height: number) {
    const map = await this.sprite(name);
    const img = map.image as { width: number; height: number };
    const mat = new MeshStandardMaterial({
      map,
      alphaTest: 0.5,
      side: DoubleSide,
      roughness: 0.75,
    });
    mat.name = `Sprite.${name}`;
    this.toLook(mat);
    const mesh = new Mesh(new PlaneGeometry((height * img.width) / img.height, height), mat);
    mesh.castShadow = true;
    return mesh;
  }

  /** What's in the air in each (who lives there is the crew's: crews.ts). */
  private async lives(p: Placed): Promise<Life | null> {
    const r = rng(hash(p.room.id));
    const parts: Life[] = [];
    const add = (o: Object3D) => p.group.add(o);
    switch (p.room.theme) {
      case 'aquarium':
        parts.push(
          this.motes(
            p,
            add,
            { n: 140, size: 0.05, colour: '#e8fbff', rise: 0.35, sway: 0.08, opacity: 0.7 },
            r,
          ),
        );
        break;
      case 'jungle':
        parts.push(
          this.motes(
            p,
            add,
            { n: 90, size: 0.035, colour: '#fff3c4', rise: 0.02, sway: 0.12, glow: true },
            r,
          ),
        );
        break;
      case 'forest':
        for (let i = 0; i < 16; i++) parts.push(await this.leaf(p, add, r));
        parts.push(
          this.motes(
            p,
            add,
            {
              n: 50,
              size: 0.05,
              colour: '#e9ff9a',
              rise: 0.01,
              sway: 0.2,
              glow: true,
              blink: true,
            },
            r,
          ),
        );
        break;
      case 'snow':
        parts.push(
          this.motes(
            p,
            add,
            { n: 800, size: 0.045, colour: '#ffffff', rise: -0.45, sway: 0.25, opacity: 0.95 },
            r,
          ),
        );
        break;
      case 'village':
      case 'dog-park':
        parts.push(
          this.motes(
            p,
            add,
            { n: 50, size: 0.03, colour: '#fff7d6', rise: 0.03, sway: 0.15, glow: true },
            r,
          ),
        );
        break;
      case 'alps':
        parts.push(
          this.motes(
            p,
            add,
            { n: 70, size: 0.035, colour: '#ffffff', rise: -0.12, sway: 0.3, opacity: 0.8 },
            r,
          ),
        );
        break;
      case 'aviary':
      case 'cat-cafe':
        // (Dust in the sun through the glass, the windows.)
        parts.push(
          this.motes(
            p,
            add,
            { n: 60, size: 0.025, colour: '#fff3d6', rise: 0.01, sway: 0.08, glow: true },
            r,
          ),
        );
        break;
    }
    if (!parts.length) return null;
    return {
      update: (dt, t, eye) => {
        for (const part of parts) part.update(dt, t, eye);
      },
    };
  }

  /** A leaf, falling, swaying and turning; up again at the top when it lands. */
  private async leaf(p: Placed, add: (o: Object3D) => void, r: () => number): Promise<Life> {
    const mesh = await this.cutout('wings-3', 0.14);
    add(mesh);
    const spot = () => [(r() - 0.5) * (p.W - 1), 0.8 + r() * (p.D - 1.6)];
    let [x, z] = spot();
    let y = r() * p.H;
    const k = r() * 9;
    const fall = 0.25 + r() * 0.2;
    return {
      update: (dt, t) => {
        y -= fall * dt;
        if (y < 0.02) {
          [x, z] = spot();
          y = p.H - 0.3;
        }
        mesh.position.set(x + 0.4 * Math.sin(t * 1.3 + k), y, z + 0.3 * Math.cos(t * 1.1 + k));
        mesh.rotation.set(Math.sin(t * 2 + k) * 0.9, t * 0.8 + k, Math.cos(t * 1.7 + k) * 0.6);
      },
    };
  }

  /** Specks in the air: snowflakes, bubbles, dust in the sun, fireflies. */
  private motes(
    p: Placed,
    add: (o: Object3D) => void,
    o: {
      n: number;
      size: number;
      colour: string;
      rise: number;
      sway: number;
      glow?: boolean;
      blink?: boolean;
      opacity?: number;
    },
    r: () => number,
  ): Life {
    const pos = new Float32Array(o.n * 3);
    const seed = new Float32Array(o.n);
    for (let i = 0; i < o.n; i++) {
      pos[i * 3] = (r() - 0.5) * (p.W - 0.6);
      pos[i * 3 + 1] = r() * p.H;
      pos[i * 3 + 2] = 0.3 + r() * (p.D - 0.6);
      seed[i] = r() * 100;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(pos, 3));
    const mat = new PointsMaterial({
      size: o.size,
      map: dot(),
      color: o.colour,
      transparent: true,
      opacity: o.opacity ?? 1,
      depthWrite: false,
    });
    if (o.glow && this.look !== 'paper') mat.blending = AdditiveBlending;
    if (this.look === 'paper') mat.color.set('#ffffff');
    const points = new Points(geometry, mat);
    points.frustumCulled = false;
    add(points);
    return {
      update: (dt, t) => {
        for (let i = 0; i < o.n; i++) {
          const s = seed[i];
          let y = pos[i * 3 + 1] + (o.rise + 0.03 * Math.sin(t * 0.7 + s)) * dt;
          if (y > p.H) y -= p.H;
          if (y < 0) y += p.H;
          pos[i * 3 + 1] = y;
          pos[i * 3] += o.sway * Math.sin(t * 0.9 + s) * dt;
          pos[i * 3 + 2] += o.sway * Math.cos(t * 0.6 + s * 1.3) * dt;
        }
        geometry.attributes.position.needsUpdate = true;
        if (o.blink) mat.opacity = 0.55 + 0.45 * Math.sin(t * 2.1);
      },
    };
  }

  /** Each frame: the rooms out of sight (if it's known which are in it: `seen`) aren't
   * drawn, and what lives in those near the visitor and in sight moves. */
  update(dt: number, eye: Vector3, seen: Set<string> | null = null) {
    for (const p of this.placed) p.group.visible = !seen || seen.has(p.room.id);
    if (!this.moving) return;
    this.time += dt;
    for (const p of this.placed) {
      if (!p.life || !p.group.visible) continue;
      const far = Math.hypot(eye.x - p.group.position.x, eye.z - p.group.position.z);
      if (far < Math.max(p.W, p.D) + 10) p.life.update(dt, this.time, eye);
    }
  }
}

let dotTexture: Texture | null = null;
/** A soft round speck. */
function dot(): Texture {
  if (dotTexture) return dotTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.8)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  dotTexture = new CanvasTexture(c);
  return dotTexture;
}

/** The tops of a piece to sit on, in the world: looked down on, a grid of rays, and each
 * run of neighbouring hits on a flat, level face at one height (a cat tree's platforms, an
 * armchair's seat, a kennel's roof) a seat, the rectangle round it. */
function tops(piece: Object3D, fliers: boolean): RoamSeat[] {
  const N = 12;
  rebound(piece);
  const box = new Box3().setFromObject(piece);
  const ray = new Raycaster();
  const down = new Vector3(0, -1, 0);
  const step = [(box.max.x - box.min.x) / N, (box.max.z - box.min.z) / N];
  // Each cell's height, if it looks down on something level there.
  const at: (number | null)[] = [];
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const x = box.min.x + (i + 0.5) * step[0];
      const z = box.min.z + (j + 0.5) * step[1];
      ray.set(new Vector3(x, box.max.y + 1, z), down);
      // (The first face of the piece itself, not its outline's shell.)
      const hit = ray
        .intersectObject(piece, true)
        .find(
          (h) =>
            (h.object as Mesh).material &&
            !(h.object as Mesh<BufferGeometry, MeshBasicMaterial>).material.isMeshBasicMaterial,
        );
      const n = hit?.face?.normal.clone().transformDirection(hit.object.matrixWorld);
      at.push(
        hit && n && n.y > 0.8 && hit.point.y > 0.15 && hit.point.y < 2.4 ? hit.point.y : null,
      );
    }
  // Runs of cells side by side at about the same height.
  const seen = new Set<number>();
  const seats: RoamSeat[] = [];
  for (let k = 0; k < at.length; k++) {
    if (at[k] === null || seen.has(k)) continue;
    const run = [k];
    seen.add(k);
    for (let q = 0; q < run.length; q++) {
      const [i, j] = [run[q] % N, Math.floor(run[q] / N)];
      for (const [di, dj] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const [a, b] = [i + di, j + dj];
        const n = b * N + a;
        if (a < 0 || b < 0 || a >= N || b >= N || seen.has(n) || at[n] === null) continue;
        if (Math.abs(at[n]! - at[k]!) > 0.06) continue;
        seen.add(n);
        run.push(n);
      }
    }
    // (Somewhere to sit, not the edge of a rail or a roof's ridge: unless it's a perch.)
    if (run.length < (fliers ? 1 : 3)) continue;
    const is = run.map((n) => n % N);
    const js = run.map((n) => Math.floor(n / N));
    const dx = (Math.max(...is) - Math.min(...is) + 1) * step[0];
    const dz = (Math.max(...js) - Math.min(...js) + 1) * step[1];
    const long = dx >= dz;
    if (!fliers && Math.min(dx, dz) < 0.25) continue;
    seats.push({
      at: [
        box.min.x + ((Math.min(...is) + Math.max(...is) + 1) / 2) * step[0],
        box.min.z + ((Math.min(...js) + Math.max(...js) + 1) / 2) * step[1],
      ],
      height: Math.max(...run.map((n) => at[n]!)),
      length: long ? dx : dz,
      width: long ? dz : dx,
      along: long ? [1, 0] : [0, 1],
      fliers,
    });
  }
  return seats;
}

/** A rigged piece's bounds as it is now (they're from its rest pose, as it was loaded). */
function rebound(piece: Object3D) {
  piece.updateWorldMatrix(true, true);
  piece.traverse((o) => {
    const m = o as SkinnedMesh;
    if (!m.isSkinnedMesh) return;
    m.skeleton.update();
    m.computeBoundingSphere();
    m.computeBoundingBox();
  });
}

/** A rigged piece that stands still (the cat tree, the kennel), as plain meshes in the pose
 * it's in: rigged, each part's skeleton would be worked out and sent to the graphics every
 * frame, and drawn wherever it is, in sight or not (dress() has every part drawn, as the
 * crew's limbs may swing out of their bounds). Its outlines share its parts' shapes. */
function still(piece: Object3D) {
  // (updateMatrixWorld, not updateWorldMatrix: only it brings a rigged part's own up to date.)
  piece.updateWorldMatrix(true, false);
  piece.updateMatrixWorld(true);
  const posed = new Map<BufferGeometry, Map<Skeleton, BufferGeometry>>();
  const v = new Vector3();
  const n = new Vector3();
  const skinned: SkinnedMesh[] = [];
  piece.traverse((o) => {
    if ((o as SkinnedMesh).isSkinnedMesh) skinned.push(o as SkinnedMesh);
    else if ((o as Mesh).isMesh) o.frustumCulled = true;
  });
  for (const m of skinned) {
    m.skeleton.update();
    let byPose = posed.get(m.geometry);
    if (!byPose) posed.set(m.geometry, (byPose = new Map()));
    let geometry = byPose.get(m.skeleton);
    if (!geometry) {
      // (Into new arrays of floats: the models' own are packed small, whole numbers to
      // scale, which a pose may not fit: they'd wrap round.)
      const pos = m.geometry.attributes.position;
      const nor = m.geometry.attributes.normal;
      const positions = new Float32Array(pos.count * 3);
      const normals = nor ? new Float32Array(pos.count * 3) : null;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        if (nor) n.fromBufferAttribute(nor, i).add(v);
        m.applyBoneTransform(i, v).toArray(positions, i * 3);
        // (Each vertex's blend of its bones is one affine map: a normal's end goes with it.)
        if (normals) m.applyBoneTransform(i, n).sub(v).normalize().toArray(normals, i * 3);
      }
      geometry = m.geometry.clone();
      geometry.deleteAttribute('skinIndex');
      geometry.deleteAttribute('skinWeight');
      geometry.setAttribute('position', new BufferAttribute(positions, 3));
      if (normals) geometry.setAttribute('normal', new BufferAttribute(normals, 3));
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      byPose.set(m.skeleton, geometry);
    }
    const mesh = new Mesh(geometry, m.material);
    mesh.name = m.name;
    mesh.userData = m.userData;
    mesh.renderOrder = m.renderOrder;
    mesh.position.copy(m.position);
    mesh.quaternion.copy(m.quaternion);
    mesh.scale.copy(m.scale);
    mesh.castShadow = m.castShadow;
    mesh.receiveShadow = m.receiveShadow;
    m.parent?.add(mesh);
    m.removeFromParent();
  }
}
