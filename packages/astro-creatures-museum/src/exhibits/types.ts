// What an exhibit template is: a way of showing a page (or a piece of art) in the museum.
// The built-in ones are in ./templates; a site adds its own with the `templates` option,
// each a module whose default export is an ExhibitTemplate (see ./api.ts).
import type { Object3D, Texture } from 'three';
import type { Kit } from '../museum/kit';
import type { Look, Materials } from '../museum/materials';
import type { Entry, Footprint, Hung } from '../plan/types';

/** What a template has to hand while it builds. */
export interface Ctx {
  kit: Kit;
  materials: Materials;
  look: Look;
  /** A picture, loaded (cached: the same address is the same texture). */
  image(src: string): Promise<Texture>;
  /** Show this entry's video on a material while the visitor stands before it: the
   * material's map is the still until then. `at` is the screen's middle, in the
   * exhibit's own space (it is turned into the museum's when the exhibit is placed). */
  video(src: string, material: { map: Texture | null; needsUpdate: boolean }, object: Object3D): void;
  /** A label card (kicker, title, summary), `w` x `h` metres, facing +z. */
  label(entry: Entry | null, w: number, h: number, extra?: { title?: string; kicker?: string; foot?: string }): Object3D;
}

/** An exhibit, built: what to add to the museum, and what can be clicked. */
export interface Built {
  /** Built about the slot: for a wall slot, x across it, y up from its middle, +z out of
   * the wall; for a floor slot, y up from the floor, +z toward the visitor. */
  object: Object3D;
  /** The parts that open something when clicked: each part's `userData.entry` says what
   * (the hung's first entry if it doesn't). */
  picks: Object3D[];
  /** Every frame: dt, and how close the visitor is (1 standing at it, 0 far off). */
  update?(dt: number, near: number): void;
}

export interface ExhibitTemplate {
  id: string;
  /** How much wall or floor it wants (a framed picture's, if it doesn't say). Pure: no
   * three.js or DOM here, as it's also asked when the site is built. */
  footprint?(entry: Entry | null, r: number): Footprint;
  build(ctx: Ctx, hung: Hung): Built | Promise<Built>;
}
