// The museum, laid out from the site's content: a lobby with the about wall and the front
// desk, and a wing per collection off it (straight ahead, then right, left and behind),
// each a row of halls, one through the next, as long as its pages need. Pictures hang on
// the halls' long walls, objects stand down the middle, and what wall is left over gets
// generated art. The same content always makes the same museum.
import { footprint as builtin } from './footprints.ts';
import { hash, rng } from './rng.ts';
import type {
  Block,
  Entry,
  Footprint,
  Hung,
  Lane,
  Link,
  Plan,
  Room,
  Sign,
  Slot,
  ThemeSpec,
  V2,
  V3,
  View,
  Wall,
} from './types.ts';

export interface WingInput {
  /** Its pages' address ('/projects'), where the wing is in the museum too. */
  path: string;
  label: string;
  entries: Entry[];
}

export interface Input {
  title: string;
  wings: WingInput[];
  about: Entry | null;
  contact: Entry | null;
  filler: { density: number; seed: string };
  /** How much room a template wants (the built-in ones', unless the site has its own). */
  measure?: (template: string, entry: Entry | null, r: number) => Footprint;
  /** The themed rooms' sizes and what stands in them (assets/rooms/rooms.json). */
  themes?: Record<string, ThemeSpec>;
  /** The arcade's games, a cabinet each, in order (src/arcade/games.ts). None, no arcade. */
  arcade?: string[];
}

/** The walls' height, a doorway's size and the eye's height. */
export const HEIGHT = 4;
export const DOOR = { width: 2, height: 2.8 };
export const EYE = 1.6;
/** Walls are this thick, their middle on the room's edge. */
export const WALL = 0.24;
/** How far the rails along the walls stand out from them (blender/pieces.py, wall_1m). */
export const RAIL = 0.08;

const HALL = { width: 8, min: 8, max: 20 };
/** Clear wall at each end of a hall, and between two things hung. */
const END = 1.2;
const GAP = 1.0;
/** Objects down the middle of a hall: the first's distance in, and the step between. */
const FLOOR = { first: 2.6, step: 3.6 };
const LOBBY: { min: V2; max: V2 } = { min: [-9, -7], max: [9, 7] };
/** A room of its own off a hall (an exhibit with `room: true`): as wide along the hall's
 * wall and as deep behind it. */
const ALCOVE = { width: 5, depth: 5.5 };
/** The arcade: a room as wide as a hall, this deep, with its cabinets stood against the
 * walls (a cabinet is this wide and this deep, and the visitor stands this far from it). */
const ARCADE = { depth: 7, cabinet: 0.9, deep: 0.84, apart: 1.5, view: 1.6 };
/** A themed room's crew keep this far from its side walls (its trees and rocks are there). */
const CORNERS = 2.2;
/** One wall painting in so many (by its seed) is a living one. */
const LIVING = 3;

type Side = 'n' | 'e' | 'w' | 's';
/** The order wings take the lobby's sides: straight ahead, right, left, behind. */
const SIDES: Side[] = ['n', 'e', 'w', 's'];
const OUT: Record<Side, V2> = { n: [0, -1], e: [1, 0], w: [-1, 0], s: [0, 1] };
const DOORWAY: Record<Side, V2> = {
  n: [0, LOBBY.min[1]],
  e: [LOBBY.max[0], 0],
  w: [LOBBY.min[0], 0],
  s: [0, LOBBY.max[1]],
};

const add = (a: V2, b: V2, k = 1): V2 => [a[0] + b[0] * k, a[1] + b[1] * k];
/** To the right of facing `f`, seen from above. */
const right = (f: V2): V2 => [-f[1], f[0]];
const neg = (f: V2): V2 => [-f[0], -f[1]];
export const yawOf = (n: V2) => Math.atan2(n[0], n[1]);
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const v3 = (p: V2, y: number): V3 => [r3(p[0]), r3(y), r3(p[1])];

/** A hall's own frame: `u` metres in from its doorway along `f`, `v` to the right. */
class Frame {
  readonly at: V2;
  readonly f: V2;
  constructor(at: V2, f: V2) {
    this.at = at;
    this.f = f;
  }
  get r() {
    return right(this.f);
  }
  p(u: number, v: number): V2 {
    return add(add(this.at, this.f, u), this.r, v);
  }
}

interface Placed {
  template: string;
  entries: Entry[];
  fp: Footprint;
  /** Along the wall, or down the middle. */
  u: number;
  seed: number;
  /** A room of its own behind a doorway here, not hung on the wall. */
  alcove?: boolean;
}

interface HallPlan {
  left: Placed[];
  right: Placed[];
  floor: Placed[];
  used: { left: number; right: number; floor: number };
}

const emptyHall = (): HallPlan => ({
  left: [],
  right: [],
  floor: [],
  used: { left: 0, right: 0, floor: 0 },
});

export function generate(input: Input): Plan {
  const measure = input.measure ?? builtin;
  const themes = input.themes ?? {};
  /** A themed room's size, if it's one there is (else it's a plain room of its own). */
  const themeOf = (e: Entry) => (e.theme && themes[e.theme] ? themes[e.theme] : null);
  const seedOf = (key: string) => hash(`${input.filler.seed}:${key}`);
  const rooms: Room[] = [];
  const walls: Wall[] = [];
  const doors: Plan['doors'] = [];
  const hung: Hung[] = [];
  const benches: Plan['benches'] = [];
  const signs: Sign[] = [];
  const blocks: Block[] = [];
  const lanes: Lane[] = [];
  const links: Link[] = [];
  const link = (a: string, ae: 'start' | 'end', b: string, be: 'start' | 'end') =>
    links.push({ a: { lane: a, end: ae }, b: { lane: b, end: be } });
  const wings: Plan['wings'] = [];

  /** A run of wall from a to b, with a doorway in its middle if `door` (or doorways
   * centred so far along it, in metres). */
  const side = (a: V2, b: V2, door: boolean | number[], room: string) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const at = door === true ? [len / 2] : door === false ? [] : [...door].sort((x, y) => x - y);
    const d: V2 = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    const half = DOOR.width / 2;
    let from = a;
    for (const m of at) {
      const d0 = add(a, d, m - half);
      const d1 = add(a, d, m + half);
      walls.push({ a: from, b: d0, kind: 'solid', room });
      walls.push({ a: d0, b: d1, kind: 'door', room });
      from = d1;
    }
    walls.push({ a: from, b, kind: 'solid', room });
  };

  /** Hang it: a slot on the wall at `p` facing `n`, and where to stand to see it. */
  const hangOn = (
    room: string,
    id: string,
    p: V2,
    n: V2,
    fp: Footprint,
    template: string,
    entries: Entry[],
    seed: number,
    extra?: { game: string; view: View },
  ) => {
    // (Hung things clear the wall's rails, which stand RAIL proud of it.)
    const face = add(p, n, WALL / 2 + (fp.stands ? 0 : RAIL));
    const y = fp.stands ? fp.height / 2 : Math.max(EYE, fp.height / 2 + 0.7);
    const slot: Slot = {
      id,
      room,
      mount: 'wall',
      at: v3(face, y),
      yaw: r3(yawOf(n)),
      width: r3(fp.width),
      height: r3(fp.height),
    };
    const back = Math.min(Math.max(Math.max(fp.width, fp.height) * 1.15 + 0.6, 2.2), 5.5);
    const view: View = extra?.view ?? { at: v3(add(face, n, back), EYE), look: v3(face, y) };
    hung.push({ slot, template, entries, seed, view, ...(extra && { game: extra.game }) });
  };

  /** Stand it on the floor at `p`, facing `n`. */
  const standAt = (
    room: string,
    id: string,
    p: V2,
    n: V2,
    fp: Footprint,
    template: string,
    entries: Entry[],
    seed: number,
  ) => {
    const slot: Slot = {
      id,
      room,
      mount: 'floor',
      at: v3(p, 0),
      yaw: r3(yawOf(n)),
      width: r3(fp.width),
      height: r3(fp.height),
    };
    const view: View = { at: v3(add(p, n, 2.4 + fp.width / 2), EYE), look: v3(p, 1.0) };
    hung.push({ slot, template, entries, seed, view });
    const h = fp.width / 2 + 0.1;
    blocks.push({ min: [r3(p[0] - h), r3(p[1] - h)], max: [r3(p[0] + h), r3(p[1] + h)] });
  };

  // ---------- The lobby ----------
  const used = input.wings.slice(0, SIDES.length);
  const doorOn = new Set(used.map((_, i) => SIDES[i]));
  // The arcade, if there are games: on the first of these sides no wing has.
  const games = input.arcade ?? [];
  const arcadeOn = games.length ? (['w', 's'] as Side[]).find((s) => !doorOn.has(s)) : undefined;
  if (arcadeOn) doorOn.add(arcadeOn);
  rooms.push({
    id: 'lobby',
    kind: 'lobby',
    wing: '',
    min: LOBBY.min,
    max: LOBBY.max,
    forward: [0, -1],
  });
  const [x0, z0] = LOBBY.min;
  const [x1, z1] = LOBBY.max;
  side([x0, z0], [x1, z0], doorOn.has('n'), 'lobby');
  side([x1, z0], [x1, z1], doorOn.has('e'), 'lobby');
  side([x1, z1], [x0, z1], doorOn.has('s'), 'lobby');
  side([x0, z1], [x0, z0], doorOn.has('w'), 'lobby');

  /** A piece of art, no wider than `fit` (another seed's, if its own is too wide). Every
   * so often a painting on a wall is a living one, with one of the crew in it. */
  const art = (key: string, mount: 'wall' | 'floor', fit = Infinity) => {
    const living = mount === 'wall' && seedOf(`${key}:living`) % LIVING === 0;
    const template = mount === 'floor' ? 'filler-sculpture' : living ? 'living-painting' : 'filler-painting';
    let seed = seedOf(key);
    let fp = measure(template, null, rng(seed)());
    for (let k = 1; k < 12 && fp.width > fit; k++) {
      seed = seedOf(`${key}:${k}`);
      fp = measure(template, null, rng(seed)());
    }
    return { seed, template, fp };
  };
  // Where a wing's hall meets the lobby, its side walls run into the lobby's: a post on
  // each side of the doorway, HALL.width apart. What's on a lobby wall keeps clear of them,
  // in the runs between the posts and the corners.
  const junction = HALL.width / 2;
  // The north wall: the about wall to the left of the way ahead, art to the right.
  const outer = (x1 + junction) / 2;
  const room = x1 - junction - 2 * 0.4;
  if (input.about) {
    const fp = measure('about-wall', input.about, 0.5);
    hangOn(
      'lobby',
      'about',
      [-outer, z0],
      [0, 1],
      fp,
      'about-wall',
      [input.about],
      seedOf('about'),
    );
  }
  {
    const a = art('lobby-n', 'wall', room);
    hangOn(
      'lobby',
      'lobby-n',
      [doorOn.has('n') ? outer : 0, z0],
      [0, 1],
      a.fp,
      a.template,
      [],
      a.seed,
    );
  }
  // The side walls and the back: art either side of a doorway, or in the middle (either
  // side of the way in, on the back wall).
  const lobbyWall = (s: Side, along: (t: number) => V2, n: V2, half: number) => {
    const between = (half + junction) / 2;
    const spots = doorOn.has(s) ? [-between, between] : s === 's' ? [-half / 2, half / 2] : [0];
    const fit = doorOn.has(s) ? half - junction - 2 * 0.4 : half - 1;
    spots.forEach((t, i) => {
      const a = art(`lobby-${s}-${i}`, 'wall', fit);
      hangOn('lobby', `lobby-${s}-${i}`, along(t), n, a.fp, a.template, [], a.seed);
    });
  };
  lobbyWall('e', (t) => [x1, t], [-1, 0], z1);
  lobbyWall('w', (t) => [x0, t], [1, 0], z1);
  lobbyWall('s', (t) => [t, z1], [0, -1], x1);
  // The front desk, by the way in, turned toward whoever comes in.
  if (input.contact) {
    const fp = measure('front-desk', input.contact, 0.5);
    const p: V2 = [4.4, 3.2];
    const toward: V2 = [-4.4, 2.2];
    const len = Math.hypot(...toward);
    standAt(
      'lobby',
      'contact',
      p,
      [toward[0] / len, toward[1] / len],
      fp,
      'front-desk',
      [input.contact],
      seedOf('contact'),
    );
  }
  lanes.push({
    id: 'lobby',
    room: 'lobby',
    at: [-6.4, -1.4],
    along: [1, 0],
    length: 12.8,
    width: 3.6,
  });
  // And one by the way in, facing the lobby's middle: crew round the visitor's feet.
  lanes.push({
    id: 'lobby-s',
    room: 'lobby',
    at: [2.4, 3.6], // (clear of the front desk)
    along: [-1, 0],
    length: 8.8,
    width: 2.6,
  });

  /**
   * A room of its own for an exhibit (`room: true`), behind a doorway in a hall's wall at
   * `c`: the hall runs along `f`, and the room goes `out` from it. The piece hangs on its
   * back wall, to be seen through the doorway from the hall; its gallery, or art, on the
   * side walls; its name over the doorway.
   */
  const alcoveOff = (hall: string, wing: string, c: V2, f: V2, out: V2, p: Placed) => {
    const e = p.entries[0];
    const id = `${hall}-${e.key.replace(/[^a-z0-9]+/gi, '-')}`;
    const box = (w: number, d: number) => {
      const xs = [c, add(c, f, -w / 2), add(c, f, w / 2)].flatMap((q) => [q, add(q, out, d)]);
      return {
        min: [r3(Math.min(...xs.map((q) => q[0]))), r3(Math.min(...xs.map((q) => q[1])))] as V2,
        max: [r3(Math.max(...xs.map((q) => q[0]))), r3(Math.max(...xs.map((q) => q[1])))] as V2,
      };
    };
    // A themed room is its theme's size, unless that would run into a room already there
    // (another wing's): then it's a plain one.
    let theme = themeOf(e);
    if (theme) {
      const b = box(theme.width, theme.depth);
      const into = rooms.some(
        (o) =>
          b.min[0] < o.max[0] && b.max[0] > o.min[0] && b.min[1] < o.max[1] && b.max[1] > o.min[1],
      );
      if (into) theme = null;
    }
    const W = theme?.width ?? ALCOVE.width;
    const half = W / 2;
    const D = theme?.depth ?? ALCOVE.depth;
    const c0 = add(c, f, -half);
    const c1 = add(c, f, half);
    const b0 = add(c0, out, D);
    const b1 = add(c1, out, D);
    rooms.push({
      id,
      kind: 'alcove',
      wing,
      title: e.title,
      ...box(W, D),
      forward: out,
      ...(theme ? { theme: e.theme!, height: theme.height } : {}),
    });
    // Its walls, the room on each one's right (as the halls' are).
    const centre = add(c, out, D / 2);
    const wall = (a: V2, b: V2) => {
      const d: V2 = [b[0] - a[0], b[1] - a[1]];
      const toward = (centre[0] - a[0]) * right(d)[0] + (centre[1] - a[1]) * right(d)[1];
      walls.push(
        toward > 0 ? { a, b, kind: 'solid', room: id } : { a: b, b: a, kind: 'solid', room: id },
      );
    };
    wall(c0, b0);
    wall(b0, b1);
    wall(b1, c1);
    doors.push({ a: add(c, f, -DOOR.width / 2), b: add(c, f, DOOR.width / 2), rooms: [hall, id] });
    // A strip for the crew across it, facing the doorway: visitors to the piece (clear of a
    // themed room's corners). A room with residents has strips of its own for them, from
    // the doorway to short of the piece, clear of what stands there.
    const along: V2 = [-out[1], out[0]];
    const reach = theme ? Math.min(half - 0.7, half - CORNERS) : half - 0.7;
    if (theme?.residents?.length) {
      let [from, to] = [1.2, D - 2.6];
      for (const [u0, v0, u1, v1] of theme.blocks) {
        if (Math.max(u0, u1) <= -reach || Math.min(u0, u1) >= reach) continue;
        if (Math.min(v0, v1) > D / 2) to = Math.min(to, Math.min(v0, v1) - 0.1);
        else from = Math.max(from, Math.max(v0, v1) + 0.1);
      }
      const n = Math.max(1, Math.floor((to - from) / 2.6));
      const each = (to - from) / n;
      for (let k = 0; k < n; k++)
        lanes.push({
          id: `${id}-lane${n > 1 ? `-${k + 1}` : ''}`,
          room: id,
          at: add(add(c, out, r3(from + k * each)), along, -reach),
          along,
          length: 2 * reach,
          width: r3(each - 0.2),
          residents: theme.residents.join(' '),
        });
    } else
      lanes.push({
        id: `${id}-lane`,
        room: id,
        at: add(add(c, out, 1.2), along, -reach),
        along,
        length: 2 * reach,
        width: 2.4,
      });
    // What stands in a themed room, to walk round: its blocks from the room's own frame
    // (u across, to the left as you come in; v in).
    if (theme) {
      const u: V2 = [out[1], -out[0]];
      for (const [u0, v0, u1, v1] of theme.blocks) {
        const ps = [add(add(c, u, u0), out, v0), add(add(c, u, u1), out, v1)];
        blocks.push({
          min: [r3(Math.min(ps[0][0], ps[1][0])), r3(Math.min(ps[0][1], ps[1][1]))],
          max: [r3(Math.max(ps[0][0], ps[1][0])), r3(Math.max(ps[0][1], ps[1][1]))],
        });
      }
    }
    signs.push({
      text: e.title,
      at: v3(add(c, out, -WALL / 2 - 0.01), DOOR.height + 0.5),
      yaw: r3(yawOf(neg(out))),
    });

    // The piece, as big as the back wall allows.
    const fit = (fp: Footprint, w: number, h: number): Footprint => {
      const k = Math.min(1, w / fp.width, h / fp.height);
      return { ...fp, mount: 'wall', width: fp.width * k, height: fp.height * k };
    };
    const rnd = rng(p.seed);
    const main = measure(p.template, e, rnd());
    const template = main.mount === 'floor' ? 'framed-picture' : p.template;
    const big = { ...main, width: main.width * 1.25, height: main.height * 1.25 };
    // (Bigger in a big room: a themed room keeps its back wall that clear.)
    const most = theme ? [Math.min(3.6, W - 4), Math.min(2.8, theme.height - 2)] : [3, 2.4];
    hangOn(
      id,
      `${id}-main`,
      add(c, out, D),
      neg(out),
      fit(big, most[0], most[1]),
      template,
      [e],
      p.seed,
    );
    // The gallery (one to a side wall), else art.
    const sides: [V2, V2][] = [
      [add(c0, out, D / 2), f],
      [add(c1, out, D / 2), neg(f)],
    ];
    sides.forEach(([at, n], i) => {
      const g = e.gallery[i];
      if (g) {
        const plate: Entry = {
          ...e,
          key: `${e.key}#${i + 1}`,
          kicker: e.title,
          title: `Plate ${i + 1}`,
          summary: '',
          image: g,
          video: null,
          film: null,
          gallery: [],
          template: 'framed-picture',
        };
        const fp = fit(measure('framed-picture', plate, rnd()), Math.min(3, D - 2.2), 2.2);
        hangOn(id, `${id}-plate-${i + 1}`, at, n, fp, 'framed-picture', [plate], p.seed + i + 1);
      } else {
        const a = art(`${id}-art-${i}`, 'wall');
        hangOn(
          id,
          `${id}-art-${i}`,
          at,
          n,
          fit(a.fp, Math.min(3, D - 2.2), 2.2),
          a.template,
          [],
          a.seed,
        );
      }
    });
  };

  // ---------- The wings ----------
  used.forEach((wing, w) => {
    const s = SIDES[w];
    const f = OUT[s];
    // Lay the wing's pages into halls: each on the long wall with more room left (the
    // left first), objects down the middle; a new hall when one is full.
    const halls: HallPlan[] = [emptyHall()];
    const room = HALL.max - 2 * END;
    const groups: { template: string; entries: Entry[] }[] = [];
    for (const e of wing.entries) {
      const last = groups[groups.length - 1];
      const holds = measure(e.template, e, 0.5).holds ?? 1;
      if (
        holds > 1 &&
        !e.room &&
        last &&
        !last.entries[0].room &&
        last.template === e.template &&
        last.entries.length < holds
      )
        last.entries.push(e);
      else groups.push({ template: e.template, entries: [e] });
    }
    for (const g of groups) {
      const seed = seedOf(g.entries[0].key);
      const alcove = g.entries[0].room;
      const fp: Footprint = alcove
        ? {
            mount: 'wall',
            width: themeOf(g.entries[0])?.width ?? ALCOVE.width,
            height: DOOR.height,
          }
        : measure(g.template, g.entries[0], rng(seed)());
      let hall = halls[halls.length - 1];
      if (fp.mount === 'floor') {
        const u = FLOOR.first + hall.floor.length * FLOOR.step;
        if (u > HALL.max - FLOOR.first) halls.push((hall = emptyHall()));
        const at = FLOOR.first + hall.floor.length * FLOOR.step;
        hall.floor.push({ template: g.template, entries: g.entries, fp, u: at, seed });
        hall.used.floor = at + FLOOR.first - END;
        continue;
      }
      const fits = (k: 'left' | 'right') =>
        hall.used[k] + (hall.used[k] ? GAP : 0) + fp.width <= room;
      if (!fits('left') && !fits('right')) halls.push((hall = emptyHall()));
      const k: 'left' | 'right' =
        hall.used.left <= hall.used.right || !fits('right') ? 'left' : 'right';
      const start = END + hall.used[k] + (hall.used[k] ? GAP : 0);
      hall[k].push({
        template: g.template,
        entries: g.entries,
        fp,
        u: start + fp.width / 2,
        seed,
        alcove,
      });
      hall.used[k] = start + fp.width - END;
    }

    let at = DOORWAY[s];
    let parent = 'lobby';
    halls.forEach((hall, h) => {
      const id = `${wing.path.split('/').filter(Boolean).pop() ?? 'wing'}-${h + 1}`; // (not the site's base)
      const fr = new Frame(at, f);
      const run = Math.max(hall.used.left, hall.used.right, hall.used.floor);
      const length = Math.min(HALL.max, Math.max(HALL.min, Math.ceil(run + 2 * END)));
      const half = HALL.width / 2;
      const corners = [fr.p(0, -half), fr.p(length, half)];
      rooms.push({
        id,
        kind: 'hall',
        wing: wing.label,
        min: [Math.min(corners[0][0], corners[1][0]), Math.min(corners[0][1], corners[1][1])],
        max: [Math.max(corners[0][0], corners[1][0]), Math.max(corners[0][1], corners[1][1])],
        forward: f,
      });
      doors.push({ a: fr.p(0, -DOOR.width / 2), b: fr.p(0, DOOR.width / 2), rooms: [parent, id] });
      if (h === 0) {
        // Its name over the way in, on the lobby's side, and where to stand: just inside.
        signs.push({
          text: wing.label,
          at: v3(add(at, f, -WALL / 2 - 0.01), DOOR.height + 0.5),
          yaw: r3(yawOf(neg(f))),
        });
        wings.push({
          path: wing.path,
          label: wing.label,
          view: { at: v3(add(at, f, 1.2), EYE), look: v3(add(at, f, 10), EYE) },
        });
      }
      const more = h < halls.length - 1;
      // The long walls, with a doorway to each room of its own off them.
      const doorsOn = (k: 'left' | 'right') => hall[k].filter((p) => p.alcove).map((p) => p.u);
      side(fr.p(0, -half), fr.p(length, -half), doorsOn('left'), id);
      side(
        fr.p(length, half),
        fr.p(0, half),
        doorsOn('right').map((u) => length - u),
        id,
      );
      side(fr.p(length, -half), fr.p(length, half), more, id);

      const r = fr.r;
      for (const p of hall.left)
        if (p.alcove) alcoveOff(id, wing.label, fr.p(p.u, -half), f, neg(r), p);
        else
          hangOn(
            id,
            `${id}-l-${p.u.toFixed(2)}`,
            fr.p(p.u, -half),
            r,
            p.fp,
            p.template,
            p.entries,
            p.seed,
          );
      for (const p of hall.right)
        if (p.alcove) alcoveOff(id, wing.label, fr.p(p.u, half), f, r, p);
        else
          hangOn(
            id,
            `${id}-r-${p.u.toFixed(2)}`,
            fr.p(p.u, half),
            neg(r),
            p.fp,
            p.template,
            p.entries,
            p.seed,
          );
      for (const p of hall.floor)
        standAt(
          id,
          `${id}-f-${p.u.toFixed(2)}`,
          fr.p(p.u, 0),
          neg(f),
          p.fp,
          p.template,
          p.entries,
          p.seed,
        );
      // Art on what's left of the long walls, now and then.
      for (const k of ['left', 'right'] as const) {
        let u = END + hall.used[k] + (hall.used[k] ? GAP : 0);
        let i = 0;
        for (;;) {
          const a = art(`${id}-${k}-${i}`, 'wall');
          if (u + a.fp.width > length - END) break;
          const chance = rng(a.seed ^ 0x5bd1e995)();
          if (chance < input.filler.density) {
            const v = k === 'left' ? -half : half;
            const n = k === 'left' ? r : neg(r);
            hangOn(
              id,
              `${id}-${k}-art-${i}`,
              fr.p(u + a.fp.width / 2, v),
              n,
              a.fp,
              a.template,
              [],
              a.seed,
            );
          }
          u += a.fp.width + GAP;
          i++;
        }
      }
      // The far wall of the last hall: a big piece of art to walk toward.
      if (!more) {
        const a = art(`${id}-end`, 'wall');
        const fp = { ...a.fp, width: a.fp.width * 1.5, height: a.fp.height * 1.5 };
        hangOn(id, `${id}-end`, fr.p(length, 0), neg(f), fp, a.template, [], a.seed);
      }
      // Down the middle, with nothing standing there: a sculpture now and then, and a bench.
      if (!hall.floor.length) {
        const a = art(`${id}-middle`, 'floor');
        const sculpture = rng(a.seed ^ 0x27d4eb2d)() < input.filler.density;
        if (sculpture)
          standAt(id, `${id}-middle`, fr.p(length / 2, 0), neg(f), a.fp, a.template, [], a.seed);
        const benchAt = sculpture
          ? [length / 2 - 2.6, length / 2 + 2.6].filter((u) => u > 2 && u < length - 2)
          : [length / 2];
        for (const u of benchAt) {
          const p = fr.p(u, 0);
          benches.push({ at: [r3(p[0]), r3(p[1])], yaw: r3(yawOf(r)) });
          const [hx, hz] = Math.abs(f[0]) > 0 ? [0.3, 0.95] : [0.95, 0.3];
          blocks.push({ min: [r3(p[0] - hx), r3(p[1] - hz)], max: [r3(p[0] + hx), r3(p[1] + hz)] });
        }
      }
      // Two strips for the crew, between the middle and each long wall.
      lanes.push({
        id: `${id}-a`,
        room: id,
        at: fr.p(END, -0.9),
        along: f,
        length: length - 2 * END,
        width: 2.3,
      });
      lanes.push({
        id: `${id}-b`,
        room: id,
        at: fr.p(length - END, 0.9),
        along: neg(f),
        length: length - 2 * END,
        width: 2.3,
      });
      // And ways through for them: on from the hall before (the lobby's lane, on the east and
      // west), back the way they came, and round at the far end.
      if (h > 0) {
        link(`${parent}-a`, 'end', `${id}-a`, 'start');
        link(`${id}-b`, 'end', `${parent}-b`, 'start');
      } else if (s === 'w' || s === 'e')
        link('lobby', s === 'w' ? 'start' : 'end', `${id}-a`, 'start');
      else link(`${id}-b`, 'end', `${id}-a`, 'start');
      if (!more) link(`${id}-a`, 'end', `${id}-b`, 'start');

      parent = id;
      at = fr.p(length, 0);
    });
  });

  // ---------- The arcade ----------
  // A room off the lobby like a hall's first, but a room of its own: cabinets against the
  // back wall, then the side walls, each facing in; the crew come in along its middle.
  if (arcadeOn) {
    const f = OUT[arcadeOn];
    const fr = new Frame(DOORWAY[arcadeOn], f);
    const half = HALL.width / 2;
    const D = ARCADE.depth;
    const r = fr.r;
    const corners = [fr.p(0, -half), fr.p(D, half)];
    rooms.push({
      id: 'arcade',
      kind: 'arcade',
      wing: '',
      title: 'Arcade',
      min: [Math.min(corners[0][0], corners[1][0]), Math.min(corners[0][1], corners[1][1])],
      max: [Math.max(corners[0][0], corners[1][0]), Math.max(corners[0][1], corners[1][1])],
      forward: f,
    });
    doors.push({
      a: fr.p(0, -DOOR.width / 2),
      b: fr.p(0, DOOR.width / 2),
      rooms: ['lobby', 'arcade'],
    });
    signs.push({
      text: 'Arcade',
      at: v3(add(DOORWAY[arcadeOn], f, -WALL / 2 - 0.01), DOOR.height + 0.5),
      yaw: r3(yawOf(neg(f))),
    });
    side(fr.p(0, -half), fr.p(D, -half), false, 'arcade');
    side(fr.p(D, half), fr.p(0, half), false, 'arcade');
    side(fr.p(D, -half), fr.p(D, half), false, 'arcade');

    // The back wall takes up to five, spread evenly; the side walls the rest, left then
    // right, from the back corners toward the door (clear of the back wall's end ones).
    const nb = Math.min(games.length, 5);
    const apart = nb > 4 ? 1.4 : ARCADE.apart;
    const spots: { p: V2; n: V2 }[] = [];
    for (let i = 0; i < nb; i++) spots.push({ p: fr.p(D, (i - (nb - 1) / 2) * apart), n: neg(f) });
    for (let i = 0; spots.length < games.length && i < 6; i++) {
      const u = D - 1.9 - Math.floor(i / 2) * ARCADE.apart;
      if (u < 2) break;
      spots.push(i % 2 ? { p: fr.p(u, half), n: neg(r) } : { p: fr.p(u, -half), n: r });
    }
    const fp = measure('arcade-cabinet', null, 0.5);
    spots.forEach(({ p, n }, i) => {
      const id = `arcade-${i + 1}`;
      // The visitor stands in front of its screen, looking at it.
      const face = add(p, n, WALL / 2);
      const view: View = {
        at: v3(add(face, n, ARCADE.deep + ARCADE.view), EYE),
        look: v3(add(face, n, 0.64), 1.35),
      };
      hangOn('arcade', id, p, n, fp, 'arcade-cabinet', [], seedOf(id), { game: games[i], view });
      // And the nav grid walks round it.
      const wx = (Math.abs(n[1]) * ARCADE.cabinet) / 2;
      const wz = (Math.abs(n[0]) * ARCADE.cabinet) / 2;
      const [ox, oz] = add(face, n, ARCADE.deep);
      blocks.push({
        min: [r3(Math.min(face[0] - wx, ox - wx)), r3(Math.min(face[1] - wz, oz - wz))],
        max: [r3(Math.max(face[0] + wx, ox + wx)), r3(Math.max(face[1] + wz, oz + wz))],
      });
    });
    // Two strips for the crew, in and out along the middle, short of the back cabinets.
    lanes.push({
      id: 'arcade-a',
      room: 'arcade',
      at: fr.p(1.2, -0.7),
      along: f,
      length: D - 3.6,
      width: 2,
    });
    lanes.push({
      id: 'arcade-b',
      room: 'arcade',
      at: fr.p(D - 2.4, 0.7),
      along: neg(f),
      length: D - 3.6,
      width: 2,
    });
    // In from the lobby's lane nearest the door, and round at the far end.
    if (arcadeOn === 'w') link('lobby', 'start', 'arcade-a', 'start');
    else link('lobby-s', 'start', 'arcade-a', 'start');
    link('arcade-a', 'end', 'arcade-b', 'start');
  }

  return {
    version: 1,
    title: input.title,
    height: HEIGHT,
    rooms,
    walls: walls.map((w) => ({ ...w, a: [r3(w.a[0]), r3(w.a[1])], b: [r3(w.b[0]), r3(w.b[1])] })),
    doors: doors.map((d) => ({ ...d, a: [r3(d.a[0]), r3(d.a[1])], b: [r3(d.b[0]), r3(d.b[1])] })),
    hung,
    benches,
    signs,
    blocks,
    lanes: lanes.map((l) => ({ ...l, at: [r3(l.at[0]), r3(l.at[1])], length: r3(l.length) })),
    links,
    spawn: { at: [0, EYE, 5.4], look: [0, EYE, z0] },
    wings,
  };
}
