// The crew in the museum: each of them, as made for the window's frame in creatures 0.5,
// walks a lane, a strip of floor along a hall (plan/types.ts, Lane). A character knows only
// px on a screen, so a lane gives it a screen of its own: a frame whose bottom edge is the
// lane's front, `length` px long, as deep as the lane is wide, and so tall (its top far up)
// that nothing on it shrinks with distance. It walks and plays there unchanged; after its
// update, where it is is read back out of that screen into the lane, in metres.
//
// This is the one file that knows how: creatures 0.6 is to have a world-space host
// (Frame.flat, a viewer's distance in Env.pointer), and then only this file changes.
import { type Character, depthScale, type Env, floorDepth, type Frame, horizon, Stage } from '@wisdomousai/creatures';
import { Group, PerspectiveCamera, Vector3 } from 'three';
import type { Lane } from '../plan/types';

/** Lane px a metre. */
export const PX = 100;
/** The crew's unit (--bot), in lane px: Bolt (1.45 of them) stands 0.8 m tall. */
export const BOT = 55;
/** How high a flier may go, in metres (under the ceiling). */
const CEILING = 3.2;

export class LaneHost {
  readonly lane: Lane;
  /** In the museum: x along the lane, y up, z out of its front; scaled to metres. */
  readonly group = new Group();
  readonly frame: Frame;
  /** The lane's length and width, in its px. */
  readonly length: number;
  readonly width: number;
  private eye = new Vector3();

  constructor(lane: Lane) {
    this.lane = lane;
    this.length = lane.length * PX;
    this.width = lane.width * PX;
    this.frame = {
      left: 0,
      right: this.length,
      bottom: 0,
      top: -1e6,
      band: BOT,
      bot: BOT,
      depth: 1,
      back: 1,
    };
    this.frame.depth = solveDepth(this.frame, this.width);
    const [ax, az] = lane.along;
    this.group.position.set(lane.at[0], 0, lane.at[1]);
    this.group.rotation.y = Math.atan2(-az, ax);
    this.group.scale.setScalar(1 / PX);
    this.group.name = `lane:${lane.id}`;
  }

  /** Where a character is, in the museum: after its update, out of the lane's screen. */
  place(c: Character) {
    const f = this.frame;
    // Fliers stay under the ceiling (their screen goes up a long way).
    if (c.free) c.free.y = Math.max(c.free.y, -CEILING * PX);
    const foot = c.foot(f);
    const k = depthScale(f, c.depth);
    const vx = (f.left + f.right) / 2;
    const vy = horizon(f);
    const x = vx + (foot.x - vx) / k;
    const y = vy + (foot.y - vy) / k;
    c.holder.position.set(x, -y, -c.depth * floorDepth(f) + c.forth);
    c.holder.scale.setScalar(c.px / k);
  }

  /** The visitor's eye, as the crew on this lane see it: a point on their screen (viewport
   * px), there when it's in front of the lane and not too far. */
  pointer(eye: Vector3, time: number): Env['pointer'] {
    const p = this.group.worldToLocal(this.eye.copy(eye));
    return { x: p.x, y: -p.y, at: time, present: p.z > -this.width && p.length() < 16 * PX };
  }

  /** A point on the lane (s px along it, d of the way back) in the museum. */
  world(s: number, d: number, out = new Vector3()) {
    return this.group.localToWorld(out.set(s, 0, -d * floorDepth(this.frame)));
  }
}

/** The frame's depth for a floor `width` px deep (floorDepth grows with it; halve it till
 * it's found). */
function solveDepth(frame: Frame, width: number): number {
  let lo = 1e-6;
  let hi = width * 4;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (floorDepth({ ...frame, depth: mid }) < width) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** The crew's outlines are a set width in px of the canvas: tell them its size. (Stage's
 * own resize does, on a stage of no more than what it touches.) */
export function outlineViewport(width: number, height: number) {
  const stage = {
    renderer: { setPixelRatio() {}, setSize() {} },
    camera: new PerspectiveCamera(),
  };
  Stage.prototype.resize.call(stage as unknown as Stage, width, height);
}

/** A character dressed for the museum: its shadow card goes (the sun casts it a real one),
 * its clipping too, and it casts and takes shadows like everything else. */
export function forMuseum(c: Character) {
  const card = (c as unknown as { shadow?: { layers: { set(n: number): void } } }).shadow;
  card?.layers.set(31);
  c.holder.traverse((o) => {
    const m = o as { isMesh?: boolean; castShadow: boolean; receiveShadow: boolean };
    if (m.isMesh && o !== (card as unknown)) m.castShadow = m.receiveShadow = true;
  });
}
