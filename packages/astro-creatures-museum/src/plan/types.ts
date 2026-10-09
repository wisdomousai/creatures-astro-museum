// The museum's plan: what is where. Made once when the site is built (museum.json.ts), from
// the site's content and the kit (generate.ts) or from a building of the site's own
// (authored.ts), and read by the museum in the browser. Plain data, so it goes as JSON.
//
// Metres. x to the right, y up, z toward the entrance (the visitor starts looking along
// -z). A yaw turns about y: something with yaw θ faces (sin θ, cos θ) in x and z, as a
// three.js object turned by rotation.y = θ faces along its own +z.

export type V2 = [x: number, z: number];
export type V3 = [x: number, y: number, z: number];

/** A picture the build made (astro:assets), sized for the museum. */
export interface Picture {
  src: string;
  width: number;
  height: number;
}

/** One thing to show: a page of the site (or a piece of art, `art`). */
export interface Entry {
  /** collection/id, unique in the museum. */
  key: string;
  collection: string;
  title: string;
  /** A line or two: the summary or description. */
  summary: string;
  /** The page's address (with the site's base), or an outside address. */
  href: string;
  /** Opens in the museum (one of the site's pages), or leaves for another site. */
  inside: boolean;
  /** 'Project', 'No. 12 · 3 March 2026'… for the label beside it. */
  kicker: string;
  template: string;
  size: 's' | 'm' | 'l';
  room: boolean;
  /** A room of its own dressed as a place (THEMES), or null for a plain one. */
  theme: string | null;
  image: Picture | null;
  video: string | null;
  /** The whole film, with sound, for the player. */
  film: string | null;
  gallery: Picture[];
  model: string | null;
  /** For a bookshelf: a date to sort by and a colour seed. */
  date: string | null;
}

export interface Room {
  id: string;
  kind: 'lobby' | 'hall' | 'alcove' | 'arcade';
  /** The wing's label, for a hall (and a room off one); '' for the lobby. */
  wing: string;
  /** What it's called, if not its wing: a room of its own's exhibit. */
  title?: string;
  /** Its floor: min and max corners. */
  min: V2;
  max: V2;
  /** Into the room from where the visitor comes in. */
  forward: V2;
  /** A themed room's theme (assets/rooms/<theme>.glb), and its own height. */
  theme?: string;
  height?: number;
}

/** The themed rooms there are: `room: jungle` in a page's exhibit. Each has some of the
 * crew living in it; the last four are the zoo's (cats, dogs, birds, robots). */
export const THEMES = [
  'jungle',
  'forest',
  'aquarium',
  'snow',
  'village',
  'alps',
  'cat-cafe',
  'dog-park',
  'aviary',
  'robot-park',
] as const;

/** A themed room's size and what stands on its floor (assets/rooms/rooms.json, from
 * blender/rooms/rooms.py): u across, v in from its doorway's middle. */
export interface ThemeSpec {
  width: number;
  depth: number;
  height: number;
  /** What stands there, to walk round: [u0, v0, u1, v1] each. */
  blocks: number[][];
  /** Who lives there: families of the crew ('cat', 'sea'...) and any of it by name
   * ('butterfly'). They have the room to themselves, and stay. */
  residents?: string[];
  /** The crew's own furniture and toys standing in it (their models, set-cattree say):
   * where, turned how far about the vertical (radians, 0 facing in), and how big its
   * biggest side is (metres). */
  set?: { model: string; at: number[]; yaw: number; size: number }[];
}

/** A straight run of wall, from a to b, the room on its left (seen from above, -y). */
export interface Wall {
  a: V2;
  b: V2;
  /** 'solid', or a doorway's lintel over an opening. */
  kind: 'solid' | 'door';
  room: string;
}

/** Where an exhibit goes and how it faces. */
export interface Slot {
  id: string;
  room: string;
  mount: 'wall' | 'floor';
  /** Its middle: on the wall's face for a wall slot (y is the centre's height), on the
   * floor for a floor one. */
  at: V3;
  yaw: number;
  /** How much room it has. */
  width: number;
  height: number;
}

/** Something in a slot: pages (one, or a shelf's worth) or a piece of generated art. */
export interface Hung {
  slot: Slot;
  template: string;
  /** None for generated art. */
  entries: Entry[];
  /** Generated art's seed, and its sort ('painting' | 'sculpture'). */
  seed: number;
  /** An arcade cabinet's game (src/arcade/games.ts). */
  game?: string;
  /** Where to stand to see it. */
  view: View;
}

/** How much wall or floor a template wants for an entry (or for art, with none). */
export interface Footprint {
  mount: 'wall' | 'floor';
  width: number;
  height: number;
  /** Takes several entries in one place, up to this many (a bookshelf). */
  holds?: number;
  /** Stands on the floor against the wall, rather than hanging on it. */
  stands?: boolean;
}

export interface View {
  at: V3;
  look: V3;
}

/**
 * A strip of floor the crew walk along. Its front edge runs from `at`, `length` along
 * `along`; the strip goes back from there `width`, away from its front, which is to the
 * right of `along` (seen from above): where the crew think the person watching them is.
 */
export interface Lane {
  id: string;
  room: string;
  at: V2;
  along: V2;
  length: number;
  width: number;
  /** A themed room's: who lives on it, families of the crew or names, space between (the
   * crew going round don't come). */
  residents?: string;
}

/** A way through between two lanes' ends. */
export interface Link {
  a: { lane: string; end: 'start' | 'end' };
  b: { lane: string; end: 'start' | 'end' };
}

/** A sign over a doorway. */
export interface Sign {
  text: string;
  at: V3;
  yaw: number;
}

/** Something to walk round: a rectangle on the floor. */
export interface Block {
  min: V2;
  max: V2;
}

export interface Plan {
  version: 1;
  title: string;
  height: number;
  rooms: Room[];
  walls: Wall[];
  /** The ways from room to room: the gap's two ends and the rooms either side. */
  doors: { a: V2; b: V2; rooms: [string, string] }[];
  hung: Hung[];
  benches: { at: V2; yaw: number }[];
  signs: Sign[];
  blocks: Block[];
  lanes: Lane[];
  links: Link[];
  spawn: View;
  /** A building of the site's own (authored.ts): the file to show, instead of the kit's. */
  building?: string;
  /** Where each wing starts (its first hall's doorway), by the wing's path ('/blog'). */
  wings: { path: string; label: string; view: View }[];
}
