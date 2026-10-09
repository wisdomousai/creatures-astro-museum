// A living painting: a deep frame on the wall, a painting at the back of it, and one of the
// crew standing in it, looking out at whoever's there and pottering about. Click it and out
// it jumps (itself, not another of its kind), down onto the floor of the room, one of the
// crew going round now; and someone else comes up into the frame. Hung in place of the museum's own paintings, here and there.
import { CARDS, type Character, Lane, loadModel, ROSTER } from '@wisdomousai/creatures';
import { BoxGeometry, Group, Mesh, type Object3D, Vector3 } from 'three';
import { FOOTPRINTS, MOULDING } from '../../plan/footprints';
import { rng } from '../../plan/rng';
import { painting } from '../../museum/art';
import { framed, picture } from '../parts';
import type { CrewHook, Ctx, ExhibitTemplate } from '../types';

/** How deep the frame stands out from the wall (m), and its sides' thickness. */
const DEEP = 0.36;
const SIDE = 0.04;
/** The one in it stands no taller than this much of the picture. */
const TALL = 0.55;
/** Families that don't stand in a frame (they fly or swim). */
const AFLOAT = new Set(['bird', 'sea']);
/** A moment after one jumps out, the next comes up (s). */
const NEXT = 1.4;

export const livingPainting: ExhibitTemplate = {
  id: 'living-painting',
  footprint: FOOTPRINTS['living-painting'],
  build(ctx, hung) {
    const w = hung.slot.width - 2 * MOULDING;
    const h = hung.slot.height - 2 * MOULDING;
    const group = new Group();
    group.add(...shadowBox(ctx, w, h));
    const back = picture(painting(hung.seed, w / h, ctx.look), w, h);
    back.position.z = 0.02;
    group.add(back);
    // The card beside it says who's in it (a new one for each).
    let card: Object3D | null = null;
    const label = (title: string, foot?: string) => {
      if (card) group.remove(card);
      card = ctx.label(null, 0.46, 0.32, { kicker: 'Alive', title, foot });
      card.position.set(hung.slot.width / 2 + 0.38, 1.32 - hung.slot.at[1], 0.01);
      group.add(card);
    };
    const crew = ctx.crew;
    if (!crew) {
      label('Gone out');
      return { object: group, picks: [] };
    }
    const sitter = new Sitter(crew, group, w, h, hung.seed, label);
    void sitter.fill();
    return {
      object: group,
      picks: [group],
      update: (dt) => sitter.update(dt),
      poke: () => void sitter.poke(),
    };
  },
};

/** A frame standing out from the wall, its front a frame round an open face: the sides,
 * the top and a floor to stand on, about a `w` x `h` opening. */
function shadowBox(ctx: Ctx, w: number, h: number): Object3D[] {
  const frame = framed(ctx, w, h, true, true);
  frame.position.z = DEEP;
  const panel = (sx: number, sy: number, sz: number, x: number, y: number, role: string) => {
    const m = new Mesh(new BoxGeometry(sx, sy, sz), ctx.materials.role(role));
    m.position.set(x, y, DEEP / 2);
    m.castShadow = m.receiveShadow = true;
    return m;
  };
  return [
    frame,
    panel(SIDE, h, DEEP, -(w - SIDE) / 2, 0, 'Frame'),
    panel(SIDE, h, DEEP, (w - SIDE) / 2, 0, 'Frame'),
    panel(w, SIDE, DEEP, 0, (h - SIDE) / 2, 'Frame'),
    panel(w, SIDE, DEEP, 0, -(h - SIDE) / 2, 'Wood'),
  ];
}

/** The one in the frame: who it is, on a lane of its own across the frame's floor. */
class Sitter {
  private c: Character | null = null;
  private name = '';
  private lane: Lane | null = null;
  private time = 0;
  private wait = 0;
  private going = false;
  /** Who'll come into the frame, in turn (its own order, from its seed). */
  private queue: string[];
  /** Those who turned out not to stand in a frame. */
  private never = new Set<string>();

  constructor(
    private crew: CrewHook,
    private group: Group,
    private w: number,
    private h: number,
    seed: number,
    private label: (title: string, foot?: string) => void,
  ) {
    const r = rng(seed ^ 0x51ed);
    this.queue = crew.roster
      .filter((n) => ROSTER[n] && !AFLOAT.has(CARDS[n]?.family ?? ''))
      .map((n) => ({ n, k: r() }))
      .sort((a, b) => a.k - b.k)
      .map((x) => x.n);
  }

  /** The next (not the kind just here) comes up into the frame. */
  async fill() {
    for (let tries = 0; tries < this.queue.length; tries++) {
      const name = this.queue.shift()!;
      this.queue.push(name);
      if (this.never.has(name) || name === this.name) continue;
      const member = ROSTER[name];
      const file = /^([a-z][a-z\d+.-]*:|\/)/i.test(member.file)
        ? member.file
        : this.crew.models + member.file;
      let c: Character;
      try {
        c = member.make(await loadModel(file));
      } catch {
        this.never.add(name);
        continue;
      }
      if (c.flies || !c.jumpsOut || !c.spec.edges.includes('bottom')) {
        this.never.add(name);
        continue;
      }
      this.show(name, c);
      return;
    }
  }

  private show(name: string, c: Character) {
    c.dress(this.crew.look);
    c.shadowCard = false;
    c.stays = true;
    c.model.traverse((o) => {
      const m = o as { isMesh?: boolean; castShadow: boolean; receiveShadow: boolean };
      if (m.isMesh) m.castShadow = m.receiveShadow = true;
    });
    // As big as it is in the halls, unless that's too big for the frame: then smaller (more
    // of its px to a metre).
    let lane = this.makeLane(100);
    c.enter(lane.frame, 'bottom', lane.length / 2, 'below');
    const tall = c.heightPx / lane.px;
    if (tall > this.h * TALL) {
      lane = this.makeLane((100 * tall) / (this.h * TALL));
      c.enter(lane.frame, 'bottom', lane.length * (0.3 + Math.random() * 0.4), 'below');
    }
    lane.group.add(c.holder);
    lane.place(c);
    if (this.lane) this.group.remove(this.lane.group);
    this.group.add(lane.group);
    [this.c, this.name, this.lane] = [c, name, lane];
    this.label(c.spec.name, 'Click to let out');
  }

  /** A lane across the frame's floor, `px` of it a metre. */
  private makeLane(px: number) {
    const lane = new Lane(
      {
        id: 'frame',
        at: [-this.w / 2 + SIDE + 0.06, DEEP - 0.06],
        along: [1, 0],
        length: this.w - 2 * SIDE - 0.12,
        width: DEEP - 0.14,
      },
      { px, ceiling: this.h - 2 * SIDE - 0.05 },
    );
    lane.group.position.y = -this.h / 2 + SIDE;
    return lane;
  }

  update(dt: number) {
    this.time += dt;
    if (this.wait > 0 && (this.wait -= dt) <= 0) void this.fill();
    const { c, lane } = this;
    if (!c || !lane) return;
    // It looks out at whoever's in front of the frame, near.
    c.update(dt, {
      frame: lane.frame,
      pointer: lane.pointer(this.crew.eye, this.time, 7),
      time: this.time,
      crew: [c],
    });
    lane.place(c);
  }

  /** Clicked: out it jumps, down onto the floor in front, and the frame's empty a moment. */
  async poke() {
    const { c, lane } = this;
    if (!c || !lane || this.going) return;
    if (c.state !== 'here') return c.poke();
    this.going = true;
    const at = c.holder.getWorldPosition(new Vector3());
    // Down a metre or so in front of the wall, where it stood across the frame.
    const across = Math.max(-0.6, Math.min(0.6, this.group.worldToLocal(at.clone()).x));
    const floor = this.group.localToWorld(new Vector3(across, -this.groupHeight(), DEEP + 0.9));
    const out = await this.crew.jumpOut(c, at, [floor.x, floor.z]);
    this.going = false;
    if (!out) return c.trick();
    // (It's the room's now: it went with its holder.)
    this.c = null;
    this.label('Out for a walk');
    this.wait = NEXT;
  }

  /** How high the frame's middle is off the floor (m). */
  private groupHeight() {
    return this.group.getWorldPosition(new Vector3()).y;
  }
}
