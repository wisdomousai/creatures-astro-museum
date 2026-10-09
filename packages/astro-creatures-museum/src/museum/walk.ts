// The visitor: eyes 1.6 m up, walking. Click somewhere and they glide there round whatever's
// in the way; walk with W A S D (or the arrows), look round by dragging. Walls and plinths
// push back. For visitors who'd rather nothing moved, a glide is a cut.
import { type PerspectiveCamera, Vector3 } from 'three';
import { collide, type Grid } from '../nav/grid';
import { EYE } from '../plan/generate';
import type { V2, V3, View } from '../plan/types';

const SPEED = 2.8;
const RUN = 5;
const TURN = 2.2;
const LOOK = 0.0042;

export class Walker {
  readonly camera: PerspectiveCamera;
  readonly grid: Grid;
  x = 0;
  z = 0;
  yaw = 0;
  pitch = 0;
  /** A glide under way: the points still ahead, and where to look at the end. */
  private route: { points: V2[]; look: V3 | null; done?: () => void; speed: number } | null = null;
  private turning: { yaw: number; pitch: number; done?: () => void } | null = null;
  private keys = new Set<string>();
  private calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** Set when the visitor walks or looks on their own (the HUD's hints go). */
  onMove?: () => void;

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
    this.route = { points: path.slice(1), look, done, speed };
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

  /** Dragged by (dx, dy) px. */
  drag(dx: number, dy: number) {
    this.stopTurning();
    this.yaw -= dx * LOOK;
    this.pitch = clamp(this.pitch - dy * LOOK, -1.1, 1.1);
    this.onMove?.();
  }

  private stopTurning() {
    this.turning = null;
    if (this.route) this.route.look = null;
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
    const ahead = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const side = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    const turn = (k.has('ArrowLeft') || k.has('KeyQ') ? 1 : 0) - (k.has('ArrowRight') || k.has('KeyE') ? 1 : 0);
    if (ahead || side || turn) {
      this.route = null;
      this.turning = null;
      this.onMove?.();
      this.yaw += turn * TURN * dt;
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
      const a = Math.min(1, dt * 5);
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
    // Slowing for the last metre, so it comes to rest rather than stops.
    const v = r.speed * Math.min(1, 0.25 + left / 1.2) * dt;
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
    if (r.look && left < 1.6) [want, pitch] = aim([this.x, EYE, this.z], r.look);
    else want = d > 1e-3 ? Math.atan2(-dx, -dz) : this.yaw;
    if (r.look || d > 0.05) {
      const a = Math.min(1, dt * 4);
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

/** `to`, give or take whole turns, nearest to `from` (so a turn goes the short way). */
function nearAngle(from: number, to: number) {
  let a = to;
  while (a - from > Math.PI) a -= Math.PI * 2;
  while (a - from < -Math.PI) a += Math.PI * 2;
  return a;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
