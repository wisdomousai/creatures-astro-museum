// How much wall or floor the built-in templates want. Pure, so the plan can be made when
// the site is built; the templates themselves (src/exhibits/templates) draw into it.
import type { Entry, Footprint } from './types.ts';

const HEIGHT = { s: 1.0, m: 1.4, l: 2.0 };
const WIDE = { s: 2.4, m: 3.2, l: 4.2 };
/** The frame's moulding round a picture, each side. */
export const MOULDING = 0.12;

/** Width over height of the entry's picture, or a picture's usual 4:3. */
const aspect = (e: Entry | null) =>
  e?.image ? e.image.width / e.image.height : e?.video ? 16 / 9 : 4 / 3;

export const FOOTPRINTS: Record<string, (e: Entry | null, r: number) => Footprint> = {
  'framed-picture': (e) => {
    const h = HEIGHT[e?.size ?? 'm'];
    const w = Math.min(h * aspect(e), 3.6);
    return { mount: 'wall', width: w + 2 * MOULDING, height: h + 2 * MOULDING };
  },
  'video-wall': (e) => {
    const w = WIDE[e?.size ?? 'm'];
    return { mount: 'wall', width: w + 0.3, height: (w * 9) / 16 + 0.3 };
  },
  triptych: (e) => {
    const h = HEIGHT[e?.size ?? 'm'];
    return { mount: 'wall', width: 3 * h * 0.75 + 2 * 0.15 + 2 * MOULDING, height: h + 0.6 };
  },
  plaque: () => ({ mount: 'wall', width: 1.0, height: 0.7 }),
  'about-wall': () => ({ mount: 'wall', width: 3.6, height: 2.4 }),
  bookshelf: () => ({ mount: 'wall', width: 1.8, height: 2.3, holds: 9, stands: true }),
  'plinth-object': () => ({ mount: 'floor', width: 1.1, height: 1.1 }),
  'front-desk': () => ({ mount: 'floor', width: 2.6, height: 1.1 }),
  'filler-painting': (_, r) => {
    const h = 0.8 + r * 0.7;
    const w = h * (0.7 + ((r * 7.31) % 1) * 0.9);
    return { mount: 'wall', width: w + 2 * MOULDING, height: h + 2 * MOULDING };
  },
  'filler-sculpture': () => ({ mount: 'floor', width: 0.9, height: 0.9 }),
};

/** A template's footprint, or a framed picture's for one it doesn't know. */
export function footprint(template: string, e: Entry | null, r = 0.5): Footprint {
  return (FOOTPRINTS[template] ?? FOOTPRINTS['framed-picture'])(e, r);
}
