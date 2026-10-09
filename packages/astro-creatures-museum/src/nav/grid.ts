// Where the visitor can go: a grid over the floor (after the explorable rooms'
// navigation.ts in the portfolio), free inside the rooms and through their doorways and
// clear of what stands on the floor, padded by the visitor's own width. A* finds the way
// round, and the way is pulled straight wherever a straight line is clear. Also the
// walls' pushing back, for walking with the keys. Pure: tested in Node.
import type { Plan, V2 } from '../plan/types.ts';
import { WALL } from '../plan/generate.ts';

export const RADIUS = 0.35;

export class Grid {
  readonly step: number;
  readonly min: V2;
  readonly cols: number;
  readonly rows: number;
  readonly plan: Plan;
  readonly radius: number;
  private free: Uint8Array;

  constructor(plan: Plan, step = 0.25, radius = RADIUS) {
    this.plan = plan;
    this.radius = radius;
    this.step = step;
    const xs = plan.rooms.flatMap((r) => [r.min[0], r.max[0]]);
    const zs = plan.rooms.flatMap((r) => [r.min[1], r.max[1]]);
    this.min = [Math.min(...xs) - 1, Math.min(...zs) - 1];
    this.cols = Math.ceil((Math.max(...xs) + 1 - this.min[0]) / step) + 1;
    this.rows = Math.ceil((Math.max(...zs) + 1 - this.min[1]) / step) + 1;
    this.free = new Uint8Array(this.cols * this.rows);
    for (let j = 0; j < this.rows; j++)
      for (let i = 0; i < this.cols; i++) this.free[j * this.cols + i] = this.test(this.point(i, j)) ? 1 : 0;
  }

  /** Can the visitor stand here? */
  test([x, z]: V2): boolean {
    const r = this.radius;
    const pad = WALL / 2 + r;
    const inRoom = this.plan.rooms.some(
      (m) => x >= m.min[0] + pad && x <= m.max[0] - pad && z >= m.min[1] + pad && z <= m.max[1] - pad,
    );
    const inDoor =
      !inRoom &&
      this.plan.doors.some((d) => {
        // Along the gap (short of its sides by r), and through the wall's thickness.
        const dx = d.b[0] - d.a[0];
        const dz = d.b[1] - d.a[1];
        const len = Math.hypot(dx, dz);
        const t = ((x - d.a[0]) * dx + (z - d.a[1]) * dz) / len;
        const across = Math.abs((x - d.a[0]) * dz - (z - d.a[1]) * dx) / len;
        return t >= r && t <= len - r && across <= pad + 0.05;
      });
    if (!inRoom && !inDoor) return false;
    return !this.plan.blocks.some(
      (b) => x > b.min[0] - r && x < b.max[0] + r && z > b.min[1] - r && z < b.max[1] + r,
    );
  }

  point(i: number, j: number): V2 {
    return [this.min[0] + i * this.step, this.min[1] + j * this.step];
  }

  cell([x, z]: V2): [number, number] {
    return [Math.round((x - this.min[0]) / this.step), Math.round((z - this.min[1]) / this.step)];
  }

  isFree(i: number, j: number) {
    return i >= 0 && j >= 0 && i < this.cols && j < this.rows && this.free[j * this.cols + i] === 1;
  }

  /** The free cell nearest p, searching outward ring by ring (or -1, -1 with none near). */
  nearest(p: V2, reach = 40): [number, number] {
    const [ci, cj] = this.cell(p);
    if (this.isFree(ci, cj)) return [ci, cj];
    let best: [number, number] = [-1, -1];
    let bestD = Infinity;
    for (let k = 1; k <= reach && best[0] < 0; k++)
      for (let dj = -k; dj <= k; dj++)
        for (let di = -k; di <= k; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== k || !this.isFree(ci + di, cj + dj)) continue;
          const d = di * di + dj * dj;
          if (d < bestD) {
            bestD = d;
            best = [ci + di, cj + dj];
          }
        }
    return best;
  }

  /** The way from one point to another, pulled straight; empty if there's none (an
   * unreachable place never sends the visitor through a wall). */
  path(from: V2, to: V2): V2[] {
    const s = this.nearest(from);
    const g = this.nearest(to);
    if (s[0] < 0 || g[0] < 0) return [];
    const cols = this.cols;
    const start = s[1] * cols + s[0];
    const goal = g[1] * cols + g[0];
    const cost = new Float32Array(this.cols * this.rows).fill(Infinity);
    const prev = new Int32Array(this.cols * this.rows).fill(-1);
    const closed = new Uint8Array(this.cols * this.rows);
    const heap = new Heap();
    cost[start] = 0;
    heap.push(start, 0);
    const h = (n: number) => Math.hypot((n % cols) - g[0], Math.floor(n / cols) - g[1]);
    while (heap.size) {
      const n = heap.pop();
      if (n === goal) break;
      if (closed[n]) continue;
      closed[n] = 1;
      const i = n % cols;
      const j = Math.floor(n / cols);
      for (const [di, dj] of NEIGHBOURS) {
        const a = i + di;
        const b = j + dj;
        // No cutting a corner: both of a diagonal's sides must be free.
        if (!this.isFree(a, b) || !this.isFree(a, j) || !this.isFree(i, b)) continue;
        const m = b * cols + a;
        const c = cost[n] + (di && dj ? Math.SQRT2 : 1);
        if (c < cost[m]) {
          cost[m] = c;
          prev[m] = n;
          heap.push(m, c + h(m));
        }
      }
    }
    if (goal !== start && prev[goal] < 0) return [];
    const cells: number[] = [];
    for (let n = goal; n >= 0; n = n === start ? -1 : prev[n]) cells.push(n);
    cells.reverse();
    const points = cells.map((n) => this.point(n % cols, Math.floor(n / cols)));
    points[0] = this.isClear(from, points[0]) ? from : points[0];
    if (this.test(to)) points.push(to);
    return this.straighten(points);
  }

  /** Is the straight line between two points free all the way? */
  isClear(a: V2, b: V2): boolean {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.ceil(len / (this.step / 2)));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const [i, j] = this.cell([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      if (!this.isFree(i, j)) return false;
    }
    return true;
  }

  private straighten(points: V2[]): V2[] {
    if (points.length < 3) return points;
    const out: V2[] = [points[0]];
    let k = 0;
    while (k < points.length - 1) {
      let far = points.length - 1;
      while (far > k + 1 && !this.isClear(points[k], points[far])) far--;
      out.push(points[far]);
      k = far;
    }
    return out;
  }
}

const NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;

/** A binary heap of cells by priority, smallest first. */
class Heap {
  private items: number[] = [];
  private keys: number[] = [];
  get size() {
    return this.items.length;
  }
  push(item: number, key: number) {
    const items = this.items;
    const keys = this.keys;
    let i = items.length;
    items.push(item);
    keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      items[i] = items[p];
      keys[i] = keys[p];
      i = p;
    }
    items[i] = item;
    keys[i] = key;
  }
  pop(): number {
    const items = this.items;
    const keys = this.keys;
    const top = items[0];
    const item = items.pop()!;
    const key = keys.pop()!;
    if (items.length) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        let mk = key;
        if (l < items.length && keys[l] < mk) {
          m = l;
          mk = keys[l];
        }
        if (r < items.length && keys[r] < mk) m = r;
        if (m === i) break;
        items[i] = items[m];
        keys[i] = keys[m];
        i = m;
      }
      items[i] = item;
      keys[i] = key;
    }
    return top;
  }
}

/**
 * Walking with the keys: where a step from `from` to `to` ends up, kept out of the walls
 * (each a thick line) and what stands on the floor, sliding along them. Pushed back to the
 * side the step came from, so no step goes through.
 */
export function collide(plan: Plan, from: V2, to: V2, radius = RADIUS): V2 {
  let [x, z] = to;
  for (let pass = 0; pass < 3; pass++) {
    for (const w of plan.walls) {
      if (w.kind !== 'solid') continue;
      const dx = w.b[0] - w.a[0];
      const dz = w.b[1] - w.a[1];
      const len2 = dx * dx + dz * dz;
      const t = Math.max(0, Math.min(1, ((x - w.a[0]) * dx + (z - w.a[1]) * dz) / len2));
      const cx = w.a[0] + dx * t;
      const cz = w.a[1] + dz * t;
      const min = WALL / 2 + radius;
      let nx = x - cx;
      let nz = z - cz;
      let d = Math.hypot(nx, nz);
      if (d >= min) continue;
      // Across the wall's line from where it started: back to that side.
      const side = (p: V2) => Math.sign((p[0] - w.a[0]) * dz - (p[1] - w.a[1]) * dx);
      const was = side(from);
      if (t > 0 && t < 1 && was !== 0 && side([x, z]) !== was) {
        nx = -nx;
        nz = -nz;
      }
      if (d < 1e-9) {
        const len = Math.sqrt(len2);
        [nx, nz] = [(dz / len) * (was || 1), (-dx / len) * (was || 1)];
        d = 1;
      }
      d = Math.hypot(nx, nz);
      x = cx + (nx / d) * min;
      z = cz + (nz / d) * min;
    }
    for (const b of plan.blocks) {
      const inside = x > b.min[0] && x < b.max[0] && z > b.min[1] && z < b.max[1];
      // From inside (it can't have started there): out the way it came in.
      const px = inside ? from[0] : x;
      const pz = inside ? from[1] : z;
      const cx = Math.max(b.min[0], Math.min(px, b.max[0]));
      const cz = Math.max(b.min[1], Math.min(pz, b.max[1]));
      const d = Math.hypot(px - cx, pz - cz);
      if (inside || d < radius) {
        if (d < 1e-9) continue;
        x = cx + ((px - cx) / d) * radius;
        z = cz + ((pz - cz) / d) * radius;
      }
    }
  }
  return [x, z];
}
