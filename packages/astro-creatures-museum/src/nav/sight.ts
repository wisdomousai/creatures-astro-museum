// What the visitor can see from where they stand: the rooms, by way of the doorways. The
// walls are whole (floor to ceiling, no windows), so a room is in sight only if a line from
// the eye gets to it through every doorway on the way; each doorway narrows the way on
// (seen from above, a wedge of directions), till it's shut. What's in the rooms out of
// sight needn't be drawn: from the lobby, a whole wing stands in front of the visitor,
// most of it behind its halls' walls. Pure: tested in Node.
import type { Plan, V2 } from '../plan/types.ts';

/** Standing this near a room (m), it's in sight (in a doorway, it's both rooms'). */
const NEAR = 0.4;
/** Directions this much either side of the view's edges are in it too (rad). */
const SLACK = 0.12;
/** Doorways on the way, at most, and doorways looked through, all told. */
const DEPTH = 8;
const STEPS = 4000;

interface Door {
  a: V2;
  b: V2;
  rooms: [number, number];
}

/** Which way the visitor looks, seen from above: the yaw of the middle of the view (as
 * atan2(x, z) of a direction), and how far either side of it they see (rad). */
export interface Wedge {
  yaw: number;
  half: number;
}

export class Sight {
  private ids: string[];
  private rooms: Plan['rooms'];
  private doorsOf: Door[][];
  private steps = 0;

  constructor(plan: Pick<Plan, 'rooms' | 'doors'>) {
    this.rooms = plan.rooms;
    this.ids = plan.rooms.map((r) => r.id);
    const index = new Map(this.ids.map((id, i) => [id, i]));
    this.doorsOf = plan.rooms.map(() => []);
    for (const d of plan.doors) {
      const i = index.get(d.rooms[0]);
      const j = index.get(d.rooms[1]);
      if (i === undefined || j === undefined) continue;
      const door: Door = { a: d.a, b: d.b, rooms: [i, j] };
      this.doorsOf[i].push(door);
      this.doorsOf[j].push(door);
    }
  }

  /** The rooms in sight from [x, z], looking `view`'s way (or every way, without one). */
  from([x, z]: V2, view?: Wedge | null): Set<string> {
    const seen = new Set<number>();
    const here = this.rooms.flatMap((r, i) =>
      x >= r.min[0] - NEAR && x <= r.max[0] + NEAR && z >= r.min[1] - NEAR && z <= r.max[1] + NEAR
        ? [i]
        : [],
    );
    // (Off every floor, somehow: the nearest.)
    if (!here.length) {
      let best = -1;
      let bestD = Infinity;
      this.rooms.forEach((r, i) => {
        const dx = Math.max(r.min[0] - x, 0, x - r.max[0]);
        const dz = Math.max(r.min[1] - z, 0, z - r.max[1]);
        if (dx * dx + dz * dz < bestD) [best, bestD] = [i, dx * dx + dz * dz];
      });
      if (best >= 0) here.push(best);
    }
    this.steps = 0;
    const wide = !view || view.half >= Math.PI - SLACK;
    for (const i of here) seen.add(i);
    for (const i of here)
      for (const door of this.doorsOf[i]) {
        if (wide) this.through(x, z, door, i, null, -Infinity, Infinity, 0, seen);
        else this.through(x, z, door, i, view.yaw, -view.half - SLACK, view.half + SLACK, 0, seen);
      }
    return new Set([...seen].map((i) => this.ids[i]));
  }

  /** Through `door` out of room `from`, the way on still open between lo and hi (directions
   * as yaws less `ref`; none yet, with ref null). */
  private through(
    x: number,
    z: number,
    door: Door,
    from: number,
    ref: number | null,
    lo: number,
    hi: number,
    depth: number,
    seen: Set<number>,
  ) {
    if (++this.steps > STEPS) return;
    const to = door.rooms[0] === from ? door.rooms[1] : door.rooms[0];
    const ya = Math.atan2(door.a[0] - x, door.a[1] - z);
    const yb = Math.atan2(door.b[0] - x, door.b[1] - z);
    let nlo = lo;
    let nhi = hi;
    // Standing in the doorway, all of it's open: no narrower than it was.
    if (!inDoor(x, z, door)) {
      ref ??= ya + wrap(yb - ya) / 2;
      // Its middle and half its width, seen from here (a doorway right behind may straddle
      // -π and π: it's tried a turn either way too).
      const half = Math.abs(wrap(yb - ya)) / 2;
      const mid = wrap(ya + wrap(yb - ya) / 2 - ref);
      let best = -1;
      for (const turn of [0, 2 * Math.PI, -2 * Math.PI]) {
        const l = Math.max(lo, mid + turn - half);
        const h = Math.min(hi, mid + turn + half);
        if (h - l > best) [best, nlo, nhi] = [h - l, l, h];
      }
      if (best < 1e-4) return;
    }
    seen.add(to);
    if (depth >= DEPTH) return;
    for (const next of this.doorsOf[to])
      if (next !== door) this.through(x, z, next, to, ref, nlo, nhi, depth + 1, seen);
  }
}

/** An angle as -π to π. */
function wrap(a: number) {
  return a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
}

/** In the gap itself (or all but: within NEAR of its line, between its ends). */
function inDoor(x: number, z: number, d: Door) {
  const dx = d.b[0] - d.a[0];
  const dz = d.b[1] - d.a[1];
  const len = Math.hypot(dx, dz);
  const t = ((x - d.a[0]) * dx + (z - d.a[1]) * dz) / len;
  const across = Math.abs((x - d.a[0]) * dz - (z - d.a[1]) * dx) / len;
  return t >= 0 && t <= len && across <= NEAR;
}
