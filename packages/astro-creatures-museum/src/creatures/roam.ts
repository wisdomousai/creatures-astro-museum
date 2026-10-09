// The crew about the museum: a few out at once, on the lanes near the visitor. One turns
// up now and then where the visitor isn't looking (walking in from a lane's end, or up
// from the floor), stays a while, and goes; then someone else comes, somewhere else.
// Poke one and it notices; poke it again and it does a trick.
import { type Character, type LookName, loadModel, ROSTER } from '@wisdomousai/creatures';
import { Frustum, Matrix4, type PerspectiveCamera, type Ray, type Scene, Vector3 } from 'three';
import type { Plan } from '../plan/types';
import { LaneHost, PX, forMuseum, outlineViewport } from './lane';

export interface RoamOptions {
  /** Where the models are served, ending in a slash. */
  models: string;
  roster: string[];
  max: number;
  look: LookName;
  /** Seconds between arrivals, picked between the two. */
  every?: [number, number];
}

interface Out {
  c: Character;
  host: LaneHost;
}

/** How near (m) a lane must be for anyone to come to it. */
const NEAR = 18;

export class Roam {
  readonly hosts: LaneHost[];
  private opts: Required<RoamOptions>;
  private members = new Map<string, Character>();
  private loading = new Set<string>();
  private out: Out[] = [];
  private time = 0;
  private next = 1.5;
  private frustum = new Frustum();
  private m = new Matrix4();
  private v = new Vector3();
  private poked = new Map<Character, number>();
  enabled = true;

  constructor(plan: Plan, scene: Scene, opts: RoamOptions) {
    this.opts = { every: [6, 16], ...opts };
    this.hosts = plan.lanes.map((l) => new LaneHost(l));
    for (const h of this.hosts) scene.add(h.group);
    outlineViewport(innerWidth, innerHeight);
    addEventListener('resize', () => outlineViewport(innerWidth, innerHeight));
  }

  /** Who's out, and on which lane. */
  get onStage(): readonly Out[] {
    return this.out;
  }

  update(dt: number, camera: PerspectiveCamera) {
    this.time += dt;
    const eye = camera.position;
    this.m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.m);

    // Someone new, now and then.
    if (this.enabled && this.out.length < this.opts.max && this.loading.size === 0) {
      this.next -= dt;
      if (this.next <= 0) {
        const [a, b] = this.opts.every;
        this.next = a + Math.random() * (b - a);
        void this.call(eye);
      }
    }

    // Each lane's crew live on their own screen: everyone on it, and where the visitor is.
    for (const host of this.hosts) {
      const here = this.out.filter((o) => o.host === host);
      if (!here.length) continue;
      const env = {
        frame: host.frame,
        pointer: host.pointer(eye, this.time),
        time: this.time,
        crew: here.map((o) => o.c),
        props: [],
      };
      for (const o of here) {
        o.c.update(dt, env);
        host.place(o.c);
      }
    }
    // The ones who've gone.
    for (const o of [...this.out])
      if (o.c.state === 'gone') {
        o.host.group.remove(o.c.holder);
        this.out.splice(this.out.indexOf(o), 1);
      }
  }

  /** Bring someone onto a lane near the visitor, where they won't see them arrive. */
  private async call(eye: Vector3) {
    const busy = new Set(this.out.map((o) => o.c));
    const names = this.opts.roster.filter((n) => ROSTER[n] && !busy.has(this.members.get(n)!));
    if (!names.length) return;
    const lanes = this.hosts
      .map((h) => ({ h, d: h.world(h.length / 2, 0.5, this.v).distanceTo(eye) }))
      .filter((x) => x.d < NEAR && !this.out.some((o) => o.host === x.h && this.out.length > 1))
      .sort((a, b) => a.d - b.d);
    if (!lanes.length) return;
    const name = pickWeighted(names);
    const c = await this.load(name);
    if (!c || this.out.some((o) => o.c === c)) return;
    // The nearest lane with somewhere out of sight to come in by.
    for (const { h } of lanes) {
      const ends: ('start' | 'end')[] = Math.random() < 0.5 ? ['start', 'end'] : ['end', 'start'];
      if (c.spec.entrance === 'walk') {
        const from = ends.find((e) => !this.seen(h, e === 'start' ? 0 : h.length));
        if (!from) continue;
        const s = h.length * (0.25 + Math.random() * 0.5);
        h.group.add(c.holder);
        c.enter(h.frame, 'bottom', s, from);
      } else {
        // Up from the floor (or down from the air): somewhere on the lane out of sight.
        const s = [0.2, 0.5, 0.8].map((t) => t * h.length).find((x) => !this.seen(h, x));
        if (s === undefined) continue;
        h.group.add(c.holder);
        c.enter(h.frame, 'bottom', s);
      }
      h.place(c);
      this.out.push({ c, host: h });
      return;
    }
  }

  private seen(h: LaneHost, s: number) {
    return [0, 0.5, 1].some((d) => {
      const p = h.world(s, d, this.v);
      p.y = 0.4;
      return this.frustum.containsPoint(p);
    });
  }

  private async load(name: string): Promise<Character | null> {
    const had = this.members.get(name);
    if (had) return had;
    if (this.loading.has(name)) return null;
    this.loading.add(name);
    try {
      const member = ROSTER[name];
      const file = /^([a-z][a-z\d+.-]*:|\/)/i.test(member.file) ? member.file : this.opts.models + member.file;
      const c = member.make(await loadModel(file));
      c.dress(this.opts.look);
      forMuseum(c);
      this.members.set(name, c);
      return c;
    } catch (e) {
      console.error(`museum: ${name} couldn't come`, e);
      return null;
    } finally {
      this.loading.delete(name);
    }
  }

  /** The crew member a ray from the camera meets first, if any. */
  pick(ray: Ray): Character | null {
    let best: Character | null = null;
    let bestD = Infinity;
    for (const { c } of this.out) {
      if (c.state === 'gone') continue;
      // Its box, as a sphere: near enough to point at.
      c.holder.updateWorldMatrix(true, false);
      const centre = c.holder.getWorldPosition(this.v);
      const r = (c.heightPx / PX) * 0.5;
      centre.y += r;
      const d = ray.distanceSqToPoint(centre);
      if (d < r * r) {
        const along = centre.sub(ray.origin).dot(ray.direction);
        if (along > 0 && along < bestD) {
          bestD = along;
          best = c;
        }
      }
    }
    return best;
  }

  /** Poked: it notices; poked again soon after, a trick. */
  poke(c: Character) {
    const last = this.poked.get(c) ?? -10;
    this.poked.set(c, this.time);
    if (this.time - last < 3) c.trick();
    else c.poke();
  }

  /** Over one: it knows. */
  hover(c: Character | null) {
    for (const { c: o } of this.out) o.hovered = o === c;
  }

  /** A new look for everyone. */
  dress(look: LookName) {
    this.opts.look = look;
    for (const c of this.members.values()) c.dress(look);
  }
}

function pickWeighted(names: string[]) {
  const total = names.reduce((s, n) => s + ROSTER[n].weight, 0);
  let r = Math.random() * total;
  for (const n of names) if ((r -= ROSTER[n].weight) <= 0) return n;
  return names[names.length - 1];
}
