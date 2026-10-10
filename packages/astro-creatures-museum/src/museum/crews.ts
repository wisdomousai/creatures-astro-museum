// Who's about: the crew going round the halls, and those living in the themed rooms (the
// cats in the cat café, the fish in the aquarium...), each room's its own, who stay. Now and
// then those together get up a game: a bone to fetch, a ball of yarn, tag. Seen from
// boot.ts as one: what's under the pointer, taken up, poked, whoever it is.
import {
  CARDS,
  type Character,
  GAMES,
  inFamily,
  type Family,
  type LaneSpec,
  type LookName,
  ROSTER,
  Roam,
  type RoamSeat,
  WORLD_GAMES,
} from '@wisdomousai/creatures';
import type { PerspectiveCamera, Ray, Scene } from 'three';
import { Vector3 } from 'three';
import type { Lane, Plan, Room } from '../plan/types';

const FAMILIES = new Set<string>(Object.values(CARDS).map((c) => c.family));
/** Residents are about while the visitor's this near their room (m), and still beyond. */
const AWAKE = 26;
/** How far beside one of them a pointer may be and still point at it (rad: some 15 px). */
const SLACK = 0.018;

/** The games a room's residents play, by their family: the creatures' own playgrounds'
 * (but those played with a mouse); the rest play none (the fish). */
const PLAYGROUND: Record<string, string> = { cat: 'cats', dog: 'dogs', bird: 'birds' };
function gamesOf(who: string[]): string[] | false {
  const games = who.flatMap((w) => GAMES[`creatures/${PLAYGROUND[w]}`] ?? []);
  const fit = [...new Set(games)].filter((g) => WORLD_GAMES.includes(g));
  return fit.length ? fit : false;
}

/** Families and names ('cat', 'butterfly') as the names of all of them there are. */
export function roster(who: string[]): string[] {
  const names = who.flatMap((w) => (FAMILIES.has(w) ? inFamily(w as Family) : [w]));
  return [...new Set(names)].filter((n) => ROSTER[n]);
}

/** A room's residents: they come on when the visitor's near (unseen, as the crew do), and
 * don't leave; they get up on its furniture (themed.ts finds its tops: `seats`). */
class Residents extends Roam {
  readonly centre: Vector3;

  constructor(
    scene: Scene,
    readonly room: Room,
    lanes: LaneSpec[],
    who: string[],
    options: { models: string; look: LookName; height: number },
  ) {
    const names = roster(who);
    super(scene, {
      lanes,
      roster: names,
      models: options.models,
      look: options.look,
      castShadows: true,
      // A room full soon after the visitor comes near, and fliers up under its ceiling.
      max: Math.min(names.length, 2 * lanes.length + 2),
      perLane: 4,
      every: [0.6, 2],
      near: AWAKE - 6,
      ceiling: options.height - 0.6,
      leave: false,
      play: gamesOf(who),
    });
    this.centre = new Vector3((room.min[0] + room.max[0]) / 2, 0, (room.min[1] + room.max[1]) / 2);
  }
}

export class Crews {
  /** The crew going round. */
  readonly roam: Roam;
  readonly residents: Residents[] = [];
  private holder: Roam | null = null;
  /** Each lane's room, by its id. */
  private laneRoom: Map<string, string>;
  private v = new Vector3();
  private w = new Vector3();

  constructor(
    scene: Scene,
    plan: Plan,
    options: {
      models: string;
      look: LookName;
      roster: string[];
      max: number;
      /** What the crew going round can get up on (the benches). */
      seats?: RoamSeat[];
    },
  ) {
    const rooms = new Map(plan.rooms.map((r) => [r.id, r]));
    this.laneRoom = new Map(plan.lanes.map((l) => [l.id, l.room]));
    // (One held may be taken anywhere in its room, clear of the walls.)
    const spec = (l: Lane): LaneSpec => {
      const r = rooms.get(l.room);
      const floor: [number, number, number, number] | undefined = r && [
        r.min[0] + 0.35,
        r.min[1] + 0.35,
        r.max[0] - 0.35,
        r.max[1] - 0.35,
      ];
      return { id: l.id, at: l.at, along: l.along, length: l.length, width: l.width, floor };
    };
    // They walk the plan's lanes, through its doorways; the sun casts their shadows.
    this.roam = new Roam(scene, {
      lanes: plan.lanes.filter((l) => !l.residents).map(spec),
      links: plan.links,
      models: options.models,
      roster: options.roster,
      max: options.max,
      look: options.look,
      castShadows: true,
      // All over the place: soon, often, two to a lane, in every room near enough to see.
      every: [1.2, 4],
      near: 30,
      perLane: 2,
      seats: options.seats,
      play: true,
    });
    const homes = new Map<string, Lane[]>();
    for (const l of plan.lanes)
      if (l.residents) homes.set(l.room, [...(homes.get(l.room) ?? []), l]);
    for (const [id, lanes] of homes) {
      const room = rooms.get(id)!;
      this.residents.push(
        new Residents(scene, room, lanes.map(spec), lanes[0].residents!.split(' '), {
          models: options.models,
          look: options.look,
          height: room.height ?? plan.height,
        }),
      );
    }
  }

  /** A themed room's furniture is in: its tops, for those living there to get up on. */
  furnished(room: string, seats: RoamSeat[]) {
    const r = this.residents.find((r) => r.room.id === room);
    if (r) r.seats = seats;
  }

  private get all(): Roam[] {
    return [this.roam, ...this.residents];
  }

  /** Off when no one new should come (those out stay). */
  set enabled(on: boolean) {
    for (const r of this.all) r.enabled = on;
  }
  get enabled() {
    return this.roam.enabled;
  }

  private owner(c: Character) {
    return this.all.find((r) => r.onStage.some((o) => o.c === c)) ?? null;
  }

  /** The nearest of everyone out that the ray meets, or all but meets: each is a sphere
   * round its box (as Roam's pick has it), and a little more (SLACK), so the smallest of
   * them can be pointed at. */
  pick(ray: Ray): Character | null {
    let best: Character | null = null;
    let bestD = Infinity;
    for (const r of this.all)
      for (const { c, lane } of r.onStage) {
        if (c.state === 'gone' || !lane.group.visible) continue;
        const centre = c.holder.getWorldPosition(this.v);
        const radius = (c.heightPx / lane.px) * 0.5;
        centre.y += radius;
        const along = this.w.copy(centre).sub(ray.origin).dot(ray.direction);
        if (along <= 0 || along >= bestD) continue;
        const reach = radius + along * SLACK;
        if (ray.distanceSqToPoint(centre) < reach * reach) [best, bestD] = [c, along];
      }
    return best;
  }

  grab(c: Character, ray: Ray) {
    const r = this.owner(c);
    if (!r?.grab(c, ray)) return false;
    this.holder = r;
    return true;
  }

  drag(ray: Ray) {
    this.holder?.drag(ray);
  }

  drop() {
    this.holder?.drop();
    this.holder = null;
  }

  poke(c: Character) {
    this.owner(c)?.poke(c);
  }

  /** One (a ROSTER name, or one of the crew in a picture) jumps out of a picture: its feet
   * at `at` (world), down onto the floor at `land`, one of that room's residents if it has
   * any, else of the crew going round. */
  async jumpOut(who: string | Character, at: Vector3, land: [number, number]) {
    const [x, z] = land;
    const home = this.residents.find(
      (r) => x >= r.room.min[0] && x <= r.room.max[0] && z >= r.room.min[1] && z <= r.room.max[1],
    );
    return Boolean(await (home ?? this.roam).jumpOut(who, at, land));
  }

  /** The games this one could get up with whoever's about it. */
  games(c: Character): string[] {
    return this.owner(c)?.games(c) ?? [];
  }

  /** Get up a game (by name, or any that fits) with whoever's about this one. */
  play(c: Character, name?: string) {
    return this.owner(c)?.play(c, name) ?? Promise.resolve(false);
  }

  hover(c: Character | null) {
    for (const r of this.all) r.hover(c);
  }

  /** Each frame. The residents of rooms far off are left as they are, out of sight; and
   * whoever's in a room out of sight (`seen` has those in it, if it's known) isn't drawn. */
  update(dt: number, camera: PerspectiveCamera, seen: Set<string> | null = null) {
    const shown = (lane: { spec: { id: string } }) =>
      !seen || seen.has(this.laneRoom.get(lane.spec.id) ?? '');
    for (const lane of this.roam.lanes) lane.group.visible = shown(lane);
    this.roam.update(dt, camera);
    for (const r of this.residents) {
      const awake =
        r.centre.distanceTo(this.v.set(camera.position.x, 0, camera.position.z)) < AWAKE;
      for (const lane of r.lanes) lane.group.visible = awake && shown(lane);
      if (awake) r.update(dt, camera);
    }
  }
}
