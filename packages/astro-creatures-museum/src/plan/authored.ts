// A building of the site's own (museum({ building: '/museum/building.glb' })): made in
// Blender, its plan read from what its objects are called and their custom properties
// (blender/buildings/README.md), into the same Plan the generator makes, so walking, the
// crew and the exhibits go on as before. Everything else in the file is just shown.
//
//   NAV_<room>   a room's floor (a mesh): where the visitor may walk.
//                [kind: 'lobby'|'hall'|'alcove', wing: a wing's label, title]
//   WALL_<any>   a wall (a mesh, or a cube empty): walked into, not through.
//   COL_<any>    something to walk round (a mesh, or a cube empty).
//   SLOT_<any>   an empty where something is shown; its front is its -Y.
//                [mount: 'wall'|'floor', w, h (m), and what: wing (a label), entry
//                 ('projects/lorem'), page ('about'|'contact'), or art; template]
//   LANE_<id>    an empty at the front-start corner of a strip of floor for the crew: X
//                along it, Y back across it, scaled to its length and width (m).
//                [link_start, link_end: '<lane>:start'|'<lane>:end']
//   SIGN_<any>   an empty for a sign, its front its -Y. [text]
//   SPAWN        where the visitor comes in, looking along its +Y. [height: the rooms'
//                height (m), 4 if not given]
//
// Blender's z is up and the file is y-up (glTF): Blender's -Y is the file's +z, which is
// a three.js object's front (types.ts), and Blender's +Y is the file's -z.
//
// Plain data in, plain data out (no three.js), so the build and the tests can run it.
import { EYE } from './generate.ts';
import { footprint as builtin } from './footprints.ts';
import { hash, rng } from './rng.ts';
import type {
  Entry,
  Footprint,
  Hung,
  Lane,
  Link,
  Plan,
  Room,
  Sign,
  V2,
  V3,
  View,
  Wall,
} from './types.ts';

/** The bits of a glTF file this reads. */
export interface Gltf {
  scene?: number;
  scenes?: { nodes?: number[] }[];
  nodes?: GltfNode[];
  meshes?: { primitives: { attributes: Record<string, number> }[] }[];
  accessors?: { min?: number[]; max?: number[]; normalized?: boolean; componentType?: number }[];
}

interface GltfNode {
  name?: string;
  children?: number[];
  mesh?: number;
  matrix?: number[];
  translation?: number[];
  rotation?: number[];
  scale?: number[];
  extras?: Record<string, unknown>;
}

export interface AuthoredInput {
  title: string;
  /** The file's address on the site (the museum loads it to show). */
  building: string;
  gltf: Gltf;
  wings: { path: string; label: string; template?: string; entries: Entry[] }[];
  about: Entry | null;
  contact: Entry | null;
  filler: { density: number; seed: string };
  measure?: (template: string, entry: Entry | null, r: number) => Footprint;
}

/** One object in the file, where it is in the world. */
interface Node {
  name: string;
  extras: Record<string, unknown>;
  /** Column-major, world. */
  m: number[];
  /** Its own box, if it's a mesh (else a cube empty's: ±1). */
  box: { min: number[]; max: number[] };
}

/** What's wrong with the file, as the check prints it: problems stop the build, notes
 * don't. */
export interface Report {
  problems: string[];
  notes: string[];
}

/** The JSON part of a .glb. */
export function readGlb(bytes: Uint8Array): Gltf {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error('not a .glb file');
  const length = view.getUint32(12, true);
  if (view.getUint32(16, true) !== 0x4e4f534a) throw new Error('a .glb without its JSON first');
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length)));
}

/** The plan of a building made in Blender, and what's wrong with it. */
export function authored(input: AuthoredInput): { plan: Plan; report: Report } {
  const report: Report = { problems: [], notes: [] };
  const problem = (s: string) => report.problems.push(s);
  const note = (s: string) => report.notes.push(s);
  const measure = input.measure ?? builtin;
  const nodes = walk(input.gltf);
  const named = (prefix: string) =>
    nodes.filter((n) => n.name.startsWith(prefix)).sort((a, b) => a.name.localeCompare(b.name));
  const str = (n: Node, k: string) =>
    typeof n.extras[k] === 'string' ? (n.extras[k] as string) : undefined;
  const num = (n: Node, k: string) => {
    const v = Number(n.extras[k]);
    return Number.isFinite(v) && v > 0 ? v : undefined;
  };

  // The rooms: their floors.
  const rooms: Room[] = named('NAV_').map((n, i) => {
    const { min, max } = footprintOf(n);
    const id = n.name.slice(4) || `room-${i}`;
    const kind = str(n, 'kind');
    return {
      id,
      kind: kind === 'lobby' || kind === 'alcove' ? kind : id === 'lobby' ? 'lobby' : 'hall',
      wing: str(n, 'wing') ?? '',
      ...(str(n, 'title') ? { title: str(n, 'title') } : {}),
      // (To the centimetre: a compressed file's floors are a hair out.)
      min: [r2(min[0]), r2(min[1])],
      max: [r2(max[0]), r2(max[1])],
      forward: [0, -1],
    };
  });
  if (!rooms.length) problem("No floors: name each room's floor NAV_<room> (a mesh).");
  const roomAt = (p: V2) =>
    rooms.find(
      (r) =>
        p[0] >= r.min[0] - 0.3 &&
        p[0] <= r.max[0] + 0.3 &&
        p[1] >= r.min[1] - 0.3 &&
        p[1] <= r.max[1] + 0.3,
    );

  // The walls: each one's long middle line.
  const walls: Wall[] = named('WALL_').map((n) => {
    const { centre, u, v } = flatBox(n);
    const long = len(u) >= len(v) ? u : v;
    const a: V2 = [r3(centre[0] - long[0]), r3(centre[1] - long[1])];
    const b: V2 = [r3(centre[0] + long[0]), r3(centre[1] + long[1])];
    const mid: V2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const thick = 2 * Math.min(len(u), len(v));
    if (thick > 0.6)
      note(`${n.name} is ${thick.toFixed(2)} m thick: only its middle line stops the visitor.`);
    return { a, b, kind: 'solid', room: roomAt(mid)?.id ?? rooms[0]?.id ?? '' };
  });
  if (rooms.length && !walls.length)
    note("No walls (WALL_…): nothing stops the visitor at the floors' edges but the edges.");

  const doors = doorsBetween(rooms, walls);
  for (const [i, a] of rooms.entries())
    for (const b of rooms.slice(i + 1))
      if (touching(a, b) && !doors.some((d) => d.rooms.includes(a.id) && d.rooms.includes(b.id)))
        note(
          `${a.id} and ${b.id} meet, but there's no gap in the walls between them (a doorway is a gap of 0.8 m or more).`,
        );

  const blocks = named('COL_').map((n) => {
    const { min, max } = footprintOf(n);
    return { min: [r3(min[0]), r3(min[1])] as V2, max: [r3(max[0]), r3(max[1])] as V2 };
  });

  // What's shown where.
  const seedOf = (key: string) => hash(`${input.filler.seed}:${key}`);
  const queues = new Map(input.wings.map((w) => [w.label, [...w.entries]]));
  const byKey = new Map(input.wings.flatMap((w) => w.entries.map((e) => [e.key, e] as const)));
  const hung: Hung[] = [];
  const shown = new Set<string>();
  for (const n of named('SLOT_')) {
    const id = n.name.slice(5);
    const at = point(n.m);
    const front = dir(n.m, 2);
    const yaw = r3(Math.atan2(front[0], front[1]));
    const room = roomAt([at[0], at[2]]);
    if (!room) problem(`${n.name} isn't over any floor (NAV_…).`);
    const mount = str(n, 'mount') === 'floor' ? 'floor' : 'wall';
    const w = num(n, 'w') ?? 1.6;
    const h = num(n, 'h') ?? 1.2;
    // What goes here: one page, a wing's next page, the about or contact page, or art.
    let entry: Entry | null = null;
    const key = str(n, 'entry');
    const wing = str(n, 'wing');
    const page = str(n, 'page');
    if (key) {
      entry = byKey.get(key) ?? null;
      if (!entry) problem(`${n.name} wants ${key}, which isn't in any wing.`);
    } else if (wing) {
      const q = queues.get(wing);
      if (!q) problem(`${n.name} is for the wing "${wing}", and there's none by that label.`);
      while (q?.length && shown.has(q[0].key)) q.shift();
      entry = q?.shift() ?? null;
      if (q && !entry)
        note(`${n.name}: the ${wing} wing has nothing left to hang, so it gets art.`);
    } else if (page === 'about') entry = input.about;
    else if (page === 'contact') entry = input.contact;
    if (entry) shown.add(entry.key);
    const seed = seedOf(entry?.key ?? n.name);
    const template =
      str(n, 'template') ??
      entry?.template ??
      (mount === 'floor' ? 'filler-sculpture' : 'filler-painting');
    // The template's size for it, made to fit the slot.
    const fp = measure(template, entry, rng(seed)());
    const k = Math.min(w / fp.width, h / fp.height, 1.25);
    const width = r3(fp.width * k);
    const height = r3(fp.height * k);
    // (What stands against a wall, a bookcase, stands on the floor.)
    const y = mount === 'floor' ? 0 : fp.stands ? height / 2 : at[1];
    // (A hair off the wall, where the author put it.)
    const face: V3 =
      mount === 'floor'
        ? [r3(at[0]), 0, r3(at[2])]
        : [r3(at[0] + front[0] * 0.01), r3(y), r3(at[2] + front[1] * 0.01)];
    const back =
      mount === 'floor'
        ? 2.4 + width / 2
        : Math.min(Math.max(Math.max(width, height) * 1.15 + 0.6, 2.2), 5.5);
    const view: View = {
      at: [r3(face[0] + front[0] * back), EYE, r3(face[2] + front[1] * back)],
      look: [face[0], mount === 'floor' ? 1 : face[1], face[2]],
    };
    hung.push({
      slot: { id, room: room?.id ?? '', mount, at: face, yaw, width, height },
      template,
      entries: entry ? [entry] : [],
      seed,
      view,
    });
  }
  for (const w of input.wings) {
    const left = w.entries.filter((e) => !shown.has(e.key)).length;
    if (left)
      note(
        `${left} of the ${w.label} wing's pages have nowhere to hang (add SLOT_s with wing: "${w.label}").`,
      );
  }

  // The crew's lanes, and the ways through between them.
  const lanes: Lane[] = named('LANE_').map((n) => {
    const at = point(n.m);
    const along = dir(n.m, 0);
    const length = r3(len(col(n.m, 0)));
    const width = r3(len(col(n.m, 2)));
    // (Back across it is the file's -z of the empty: Blender's +Y.)
    const back = dir(n.m, 2).map((x) => -x);
    if (Math.abs(back[0] - along[1]) + Math.abs(back[1] + along[0]) > 0.1)
      problem(
        `${n.name} is mirrored: its Y should be 90° anticlockwise of its X, seen from above.`,
      );
    const id = n.name.slice(5);
    const room = roomAt([
      at[0] + along[0] * length * 0.5 + back[0] * width * 0.5,
      at[2] + along[1] * length * 0.5 + back[1] * width * 0.5,
    ]);
    if (!room) problem(`${n.name} isn't over any floor (NAV_…).`);
    return {
      id,
      room: room?.id ?? '',
      at: [r3(at[0]), r3(at[2])],
      along: [r3(along[0]), r3(along[1])],
      length,
      width,
    };
  });
  const links: Link[] = [];
  const linked = new Set<string>();
  for (const n of named('LANE_'))
    for (const end of ['start', 'end'] as const) {
      const to = str(n, `link_${end}`);
      if (!to) continue;
      const [lane, other] = to.split(':');
      const a = `${n.name.slice(5)}:${end}`;
      if (!lanes.some((l) => l.id === lane) || (other !== 'start' && other !== 'end')) {
        problem(
          `${n.name}'s link_${end} is "${to}": it should be <lane>:start or <lane>:end, of a LANE_.`,
        );
        continue;
      }
      // (Both ends may say so; once is enough.)
      if (linked.has(a) || linked.has(to)) continue;
      linked.add(a).add(to);
      links.push({ a: { lane: n.name.slice(5), end }, b: { lane, end: other } });
    }

  const signs: Sign[] = named('SIGN_').map((n) => {
    const at = point(n.m);
    const front = dir(n.m, 2);
    return {
      text: str(n, 'text') ?? n.name.slice(5),
      at: [r3(at[0]), r3(at[1]), r3(at[2])],
      yaw: r3(Math.atan2(front[0], front[1])),
    };
  });

  const spawnNode = nodes.find((n) => n.name === 'SPAWN');
  let spawn: View;
  if (spawnNode) {
    const at = point(spawnNode.m);
    const look = dir(spawnNode.m, 2).map((x) => -x);
    spawn = {
      at: [r3(at[0]), EYE, r3(at[2])],
      look: [r3(at[0] + look[0] * 10), EYE, r3(at[2] + look[1] * 10)],
    };
    if (!roomAt([at[0], at[2]])) problem("SPAWN isn't over any floor (NAV_…).");
  } else {
    problem('No SPAWN: an empty where the visitor comes in, looking along its +Y.');
    const r = rooms[0];
    const c: V2 = r ? [(r.min[0] + r.max[0]) / 2, (r.min[1] + r.max[1]) / 2] : [0, 0];
    spawn = { at: [c[0], EYE, c[1]], look: [c[0], EYE, c[1] - 10] };
  }

  // Each wing starts where its first page hangs.
  const wings = input.wings.flatMap((w) => {
    const first = hung.find((h) => h.entries.some((e) => w.entries.includes(e)));
    return first ? [{ path: w.path, label: w.label, view: first.view }] : [];
  });

  const plan: Plan = {
    version: 1,
    title: input.title,
    height: (spawnNode && num(spawnNode, 'height')) || 4,
    building: input.building,
    rooms,
    walls,
    doors,
    hung,
    benches: [],
    signs,
    blocks,
    lanes,
    links,
    spawn,
    wings,
  };
  return { plan, report };
}

// ---------- The ways from room to room ----------

/** Where two floors meet: the line and the stretch of it they share. */
function shared(a: Room, b: Room): { axis: 0 | 1; at: number; lo: number; hi: number } | null {
  for (const axis of [0, 1] as const) {
    const o = axis === 0 ? 1 : 0;
    const at =
      Math.abs(a.max[axis] - b.min[axis]) < 0.05
        ? a.max[axis]
        : Math.abs(b.max[axis] - a.min[axis]) < 0.05
          ? a.min[axis]
          : null;
    if (at === null) continue;
    const lo = Math.max(a.min[o], b.min[o]);
    const hi = Math.min(a.max[o], b.max[o]);
    if (hi - lo > 0.5) return { axis, at, lo, hi };
  }
  return null;
}
const touching = (a: Room, b: Room) => shared(a, b) !== null;

/** The doorways: wherever two floors meet, the gaps in the walls along the line between. */
function doorsBetween(rooms: Room[], walls: Wall[]): Plan['doors'] {
  const doors: Plan['doors'] = [];
  for (const [i, a] of rooms.entries())
    for (const b of rooms.slice(i + 1)) {
      const s = shared(a, b);
      if (!s) continue;
      const o = s.axis === 0 ? 1 : 0;
      // The walls on that line, as stretches along it.
      const cover = walls
        .filter((w) => Math.abs(w.a[s.axis] - s.at) < 0.2 && Math.abs(w.b[s.axis] - s.at) < 0.2)
        .map((w) => [Math.min(w.a[o], w.b[o]), Math.max(w.a[o], w.b[o])])
        .sort((x, y) => x[0] - y[0]);
      let from = s.lo;
      const gap = (g0: number, g1: number) => {
        if (g1 - g0 < 0.8) return;
        const p = (t: number): V2 => (s.axis === 0 ? [s.at, r3(t)] : [r3(t), s.at]);
        doors.push({ a: p(g0), b: p(g1), rooms: [a.id, b.id] });
      };
      for (const [c0, c1] of cover) {
        if (c0 > from) gap(from, Math.min(c0, s.hi));
        from = Math.max(from, c1);
        if (from >= s.hi) break;
      }
      if (from < s.hi) gap(from, s.hi);
    }
  return doors;
}

// ---------- The file's nodes, in the world ----------

function walk(gltf: Gltf): Node[] {
  const out: Node[] = [];
  const all = gltf.nodes ?? [];
  const visit = (i: number, parent: number[]) => {
    const n = all[i];
    const m = mul(parent, local(n));
    let box = { min: [-1, -1, -1], max: [1, 1, 1] };
    if (n.mesh !== undefined) {
      const p = gltf.meshes?.[n.mesh]?.primitives ?? [];
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      for (const prim of p) {
        const acc = gltf.accessors?.[prim.attributes.POSITION];
        if (!acc?.min || !acc.max) continue;
        // (Quantized, as meshopt leaves it: the stored integers, to be read as -1..1 or 0..1.)
        const k0 = acc.normalized ? (NORMALIZE[acc.componentType ?? 0] ?? 1) : 1;
        for (let k = 0; k < 3; k++) {
          min[k] = Math.min(min[k], acc.min[k] / k0);
          max[k] = Math.max(max[k], acc.max[k] / k0);
        }
      }
      if (min[0] <= max[0]) box = { min, max };
    }
    out.push({ name: n.name ?? '', extras: n.extras ?? {}, m, box });
    for (const c of n.children ?? []) visit(c, m);
  };
  const scene = gltf.scenes?.[gltf.scene ?? 0];
  const roots = scene?.nodes ?? all.map((_, i) => i);
  for (const r of roots) visit(r, IDENTITY);
  return out;
}

/** What a normalized accessor's integers are divided by, by component type. */
const NORMALIZE: Record<number, number> = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 };

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function local(n: GltfNode): number[] {
  if (n.matrix) return n.matrix;
  const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = n.scale ?? [1, 1, 1];
  const [tx, ty, tz] = n.translation ?? [0, 0, 0];
  return [
    (1 - 2 * (y * y + z * z)) * sx,
    2 * (x * y + z * w) * sx,
    2 * (x * z - y * w) * sx,
    0,
    2 * (x * y - z * w) * sy,
    (1 - 2 * (x * x + z * z)) * sy,
    2 * (y * z + x * w) * sy,
    0,
    2 * (x * z + y * w) * sz,
    2 * (y * z - x * w) * sz,
    (1 - 2 * (x * x + y * y)) * sz,
    0,
    tx,
    ty,
    tz,
    1,
  ];
}

function mul(a: number[], b: number[]): number[] {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
      for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}

const point = (m: number[]): V3 => [m[12], m[13], m[14]];
/** A column (an axis, scaled) of the matrix, on the floor: [x, z]. */
const col = (m: number[], i: number): V2 => [m[i * 4], m[i * 4 + 2]];
const len = (v: number[]) => Math.hypot(...v);
/** An axis's direction on the floor. */
function dir(m: number[], i: number): V2 {
  const v = col(m, i);
  const l = len(v) || 1;
  return [v[0] / l, v[1] / l];
}
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** A node's box, flat on the floor: its middle and half its two sides (as vectors). */
function flatBox(n: Node) {
  const { min, max } = n.box;
  const c = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const apply = (p: number[]): V2 => [
    n.m[0] * p[0] + n.m[4] * p[1] + n.m[8] * p[2] + n.m[12],
    n.m[2] * p[0] + n.m[6] * p[1] + n.m[10] * p[2] + n.m[14],
  ];
  const centre = apply(c);
  const ex = apply([max[0], c[1], c[2]]);
  const ez = apply([c[0], c[1], max[2]]);
  return {
    centre,
    u: [ex[0] - centre[0], ex[1] - centre[1]] as V2,
    v: [ez[0] - centre[0], ez[1] - centre[1]] as V2,
  };
}

/** The rectangle on the floor a node's box covers (lined up with x and z). */
function footprintOf(n: Node): { min: V2; max: V2 } {
  const { centre, u, v } = flatBox(n);
  const hx = Math.abs(u[0]) + Math.abs(v[0]);
  const hz = Math.abs(u[1]) + Math.abs(v[1]);
  return { min: [centre[0] - hx, centre[1] - hz], max: [centre[0] + hx, centre[1] + hz] };
}
