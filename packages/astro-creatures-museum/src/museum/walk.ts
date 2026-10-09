// The visitor: eyes 1.6 m up, walking. Take hold of the floor and pull it to walk (toward
// you, and on you go; sideways, and you turn), or walk with W A S D and look round with the
// arrows; sent to an exhibit, they glide there round whatever's in the way. Walls and
// plinths push back. For visitors who'd rather nothing moved, a glide is a cut.
import { type PerspectiveCamera, type Ray, Vector3 } from 'three';
import { collide, type Grid } from '../nav/grid';
import { EYE } from '../plan/generate';
import type { V2, V3, View } from '../plan/types';

/** A gallery stroll (m/s), with Shift a brisk walk; turning and tilting with the keys (rad/s). */
const SPEED = 1.5;
const RUN = 2.8;
const TURN = 1.3;
const TILT = 0.9;
/** The floor's taken hold of no further off than this (m), and pulled no nearer than NEAR. */
const REACH = 25;
const NEAR = 0.4;
/** A pull goes through the walls' push in steps no longer than this (m). */
const STRIDE = 0.2;

export class Walker {
  readonly camera: PerspectiveCamera;
  readonly grid: Grid;
  x = 0;
  z = 0;
  yaw = 0;
  pitch = 0;
  /** A glide under way: the points still ahead, and where to look at the end. */
  private route: {
    points: V2[];
    look: V3 | null;
    done?: () => void;
    speed: number;
    t: number;
  } | null = null;
  private turning: { yaw: number; pitch: number; done?: () => void } | null = null;
  /** The floor where the pointer took hold (null: above the horizon, so it only turns), the
   * way it pointed then, and how far off it was last (kept while the pointer's above it). */
  private held: { p: V2 | null; bearing: number; far: number } | null = null;
  private keys = new Set<string>();
  private calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** Set when the visitor walks or looks on their own (the HUD's hints go). */
  onMove?: (how: 'walk' | 'look') => void;

  constructor(camera: PerspectiveCamera, grid: Grid) {
    this.camera = camera;
    this.grid = grid;
  }

  get moving() {
    return this.route !== null;
  }

  /** Stand here, looking there, at once. */
  set(view: View) {
    this.x = view.at[0];
    this.z = view.at[2];
    [this.yaw, this.pitch] = aim([this.x, EYE, this.z], view.look);
    this.route = null;
    this.turning = null;
    this.apply();
  }

  /** Walk to a point on the floor (round things), and look at `look` when there. */
  goTo(to: V2, look: V3 | null = null, done?: () => void, speed = SPEED) {
    const path = this.grid.path([this.x, this.z], to);
    if (path.length < 1) return false;
    if (this.calm) {
      const end = path[path.length - 1];
      this.x = end[0];
      this.z = end[1];
      if (look) [this.yaw, this.pitch] = aim([this.x, EYE, this.z], look);
      this.apply();
      done?.();
      return true;
    }
    this.route = { points: path.slice(1), look, done, speed, t: 0 };
    this.turning = null;
    return true;
  }

  /** Go and stand where something is best seen. */
  view(view: View, done?: () => void) {
    return this.goTo([view.at[0], view.at[2]], view.look, done);
  }

  /** Turn to look at a point, staying put. */
  lookAt(p: V3, done?: () => void) {
    const [yaw, pitch] = aim([this.x, EYE, this.z], p);
    if (this.calm) {
      this.yaw = yaw;
      this.pitch = pitch;
      this.apply();
      done?.();
    } else this.turning = { yaw: nearAngle(this.yaw, yaw), pitch, done };
  }

  stop() {
    this.route = null;
    this.turning = null;
  }

  /** The pointer's taken hold of the floor where its `ray` (from the camera) meets it. */
  grip(ray: Ray) {
    this.stop();
    const o = ray.origin;
    const d = ray.direction;
    let p: V2 | null = null;
    if (d.y < -0.02) {
      const t = Math.min(-o.y / d.y, REACH / Math.hypot(d.x, d.z));
      p = [o.x + d.x * t, o.z + d.z * t];
    }
    const far = p ? Math.hypot(p[0] - this.x, p[1] - this.z) : REACH;
    this.held = { p, bearing: bearing(d.x, d.z), far };
  }

  /**
   * The pointer holding the floor has moved (its `ray` now, from the camera as it is): the
   * visitor moves and turns so the floor they took hold of is under it again. Nearer the
   * bottom of the view, it's nearer them, so they walk up to it; to one side, they turn.
   */
  pull(ray: Ray) {
    const h = this.held;
    if (!h) return;
    const d = ray.direction;
    // Where the pointer is across the view, as an angle off straight ahead.
    const off = nearAngle(0, bearing(d.x, d.z) - this.yaw);
    if (!h.p) {
      this.yaw = h.bearing - off;
      this.apply();
      this.onMove?.('look');
      return;
    }
    // How far off the floor under the pointer is now, so far as the pointer's below the
    // horizon (above it, as far as it was last).
    if (d.y < -0.02) h.far = clamp(EYE / Math.tan(-Math.asin(d.y)), NEAR, REACH);
    const [px, pz] = h.p;
    const dx = px - this.x;
    const dz = pz - this.z;
    const line = Math.hypot(dx, dz) > 0.05 ? bearing(dx, dz) : bearing(d.x, d.z);
    // Along the line from the held point through where they stand, as far from it as the
    // pointer says; and turned so it's as far round as the pointer is.
    const to: V2 = [px + h.far * Math.sin(line), pz + h.far * Math.cos(line)];
    const was: V2 = [this.x, this.z];
    const steps = Math.ceil(Math.hypot(to[0] - this.x, to[1] - this.z) / STRIDE);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const step: V2 = [was[0] + (to[0] - was[0]) * t, was[1] + (to[1] - was[1]) * t];
      [this.x, this.z] = collide(this.grid.plan, [this.x, this.z], step);
    }
    this.yaw = line - off;
    this.apply();
    this.onMove?.(steps ? 'walk' : 'look');
  }

  /** The pointer's let go of the floor. */
  letGo() {
    this.held = null;
  }

  key(code: string, down: boolean) {
    if (down) this.keys.add(code);
    else this.keys.delete(code);
  }

  /** Every key let go (the window lost focus, or a page opened). */
  release() {
    this.keys.clear();
  }

  /** The way the visitor is looking, flat on the floor. */
  forward(out = new Vector3()) {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  update(dt: number) {
    const k = this.keys;
    const ahead = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    const side = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    const turn =
      (k.has('ArrowLeft') || k.has('KeyQ') ? 1 : 0) -
      (k.has('ArrowRight') || k.has('KeyE') ? 1 : 0);
    const tilt = (k.has('ArrowUp') ? 1 : 0) - (k.has('ArrowDown') ? 1 : 0);
    if (ahead || side || turn || tilt) {
      this.route = null;
      this.turning = null;
      this.onMove?.(ahead || side ? 'walk' : 'look');
      this.yaw += turn * TURN * dt;
      this.pitch = clamp(this.pitch + tilt * TILT * dt, -1.1, 1.1);
      const v = (k.has('ShiftLeft') || k.has('ShiftRight') ? RUN : SPEED) * dt;
      const fx = -Math.sin(this.yaw);
      const fz = -Math.cos(this.yaw);
      const len = Math.hypot(ahead, side) || 1;
      const to: V2 = [
        this.x + ((fx * ahead - fz * side) / len) * v,
        this.z + ((fz * ahead + fx * side) / len) * v,
      ];
      [this.x, this.z] = collide(this.grid.plan, [this.x, this.z], to);
    } else if (this.route) this.glide(dt);
    else if (this.turning) {
      const t = this.turning;
      const a = Math.min(1, dt * 2.6);
      this.yaw += (t.yaw - this.yaw) * a;
      this.pitch += (t.pitch - this.pitch) * a;
      if (Math.abs(t.yaw - this.yaw) < 0.01 && Math.abs(t.pitch - this.pitch) < 0.01) {
        this.turning = null;
        t.done?.();
      }
    }
    this.apply();
  }

  private glide(dt: number) {
    const r = this.route!;
    const next = r.points[0];
    const dx = next[0] - this.x;
    const dz = next[1] - this.z;
    const d = Math.hypot(dx, dz);
    const left = d + pathLength(r.points);
    // Easing into it over the first second, and slowing for the last metre and a half, so
    // it sets off and comes to rest rather than starts and stops.
    r.t += dt;
    const v = r.speed * Math.min(1, 0.2 + r.t) * Math.min(1, 0.2 + left / 1.6) * dt;
    if (d <= v) {
      this.x = next[0];
      this.z = next[1];
      r.points.shift();
    } else {
      this.x += (dx / d) * v;
      this.z += (dz / d) * v;
    }
    // Facing the way it goes, then turning to what it came to see as it arrives.
    let want: number;
    let pitch = 0;
    if (r.look && left < 2) [want, pitch] = aim([this.x, EYE, this.z], r.look);
    else want = d > 1e-3 ? Math.atan2(-dx, -dz) : this.yaw;
    if (r.look || d > 0.05) {
      const a = Math.min(1, dt * 2.2);
      this.yaw += (nearAngle(this.yaw, want) - this.yaw) * a;
      this.pitch += (pitch - this.pitch) * a;
    }
    if (!r.points.length) {
      this.route = null;
      if (r.look) this.lookAt(r.look, r.done);
      else r.done?.();
    }
  }

  private apply() {
    this.camera.position.set(this.x, EYE, this.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    // (Now, not at the next frame: the pointer's next ray, before it, is from here.)
    this.camera.updateMatrixWorld();
  }
}

function pathLength(points: V2[]) {
  let s = 0;
  for (let i = 1; i < points.length; i++)
    s += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return s;
}

/** The yaw and pitch that look from `from` at `to`. */
export function aim(from: V3, to: V3): [number, number] {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  return [Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz))];
}

/** The yaw that looks along (dx, dz) on the floor. */
const bearing = (dx: number, dz: number) => Math.atan2(-dx, -dz);

/** `to`, give or take whole turns, nearest to `from` (so a turn goes the short way). */
function nearAngle(from: number, to: number) {
  let a = to;
  while (a - from > Math.PI) a -= Math.PI * 2;
  while (a - from < -Math.PI) a += Math.PI * 2;
  return a;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
