// Every template the museum knows: the built-in ones and the site's own (its `templates`
// option), by id. A site's template of the same id takes the built-in one's place.
import own from 'virtual:astro-creatures-museum/templates';
import { arcadeCabinet } from './templates/arcade';
import { aboutWall, frontDesk } from './templates/lobby';
import { bookshelf } from './templates/library';
import { livingPainting } from './templates/living';
import { fillerPainting, fillerSculpture, plinthObject } from './templates/objects';
import { framedPicture, plaque, triptych, videoWall } from './templates/pictures';
import type { ExhibitTemplate } from './types';

export const BUILT_IN: ExhibitTemplate[] = [
  framedPicture,
  triptych,
  videoWall,
  plaque,
  aboutWall,
  frontDesk,
  bookshelf,
  plinthObject,
  fillerPainting,
  fillerSculpture,
  livingPainting,
  arcadeCabinet,
];

export const TEMPLATES = new Map<string, ExhibitTemplate>(
  [...BUILT_IN, ...own].map((t) => [t.id, t]),
);

/** The template for an id: a framed picture for one nobody knows. */
export const template = (id: string) => TEMPLATES.get(id) ?? framedPicture;
