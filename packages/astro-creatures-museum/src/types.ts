/** A wing of the museum: one collection's pages, hung in a row of halls. */
export interface Wing {
  /** The content collection it shows: 'projects', 'blog', or one of your own. */
  collection: string;
  /** What the wing is called, on the sign over its doorway. */
  label: string;
  /** How its exhibits are shown unless they say otherwise (src/exhibits/templates). */
  template: string;
  /** Where its pages live, if not at /<collection>/<id>. */
  path?: string;
}

export interface Crew {
  /** Who wanders the halls (`npx @wisdomousai/creatures list`); empty and nobody comes. */
  roster: string[];
  /** How many about at once on a phone, and on a bigger screen. */
  max: [phone: number, desktop: number];
  /** The crew's look: 'ink', 'paper' or 'colour'. The building wears it too. */
  look: 'ink' | 'paper' | 'colour';
  /** Nobody comes for visitors who ask for less motion. */
  respectReducedMotion: boolean;
}

/** The integration's options: every one has a lorem-ipsum default. */
export interface Options {
  title?: string;
  description?: string;
  author?: string;
  email?: string;
  links?: { github?: string; [name: string]: string | undefined };
  nav?: { label: string; href: string }[];
  /** The wings off the lobby, in order (the first is straight ahead). */
  wings?: Wing[];
  /** Generated art on the walls between exhibits: how much (0–1), and its seed. */
  filler?: { density?: number; seed?: string };
  /** A building of your own, made in Blender with named slots (blender/README.md), from
   * public/: '/museum/building.glb'. Without one, the museum is built from the kit. */
  building?: string;
  /** Your own exhibit templates: modules exporting an ExhibitTemplate as default, relative
   * to the project root ('./src/museum/neon.ts'). */
  templates?: string[];
  crew?: Partial<Crew>;
}

/** The settings as the pages and the museum see them. */
export interface Config extends Required<Omit<Options, 'crew' | 'filler' | 'building'>> {
  crew: Crew;
  filler: { density: number; seed: string };
  building: string | null;
}
