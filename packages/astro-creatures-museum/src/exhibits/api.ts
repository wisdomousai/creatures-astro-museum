// For a site's own exhibit templates: `@wisdomousai/astro-creatures-museum/templates`.
//
//   import { defineTemplate, framed } from '@wisdomousai/astro-creatures-museum/templates';
//   export default defineTemplate({ id: 'neon', build(ctx, hung) { ... } });
//
// List the file in the integration's `templates` option, and name it in an entry's
// `exhibit.template` or a wing's `template`.
import type { ExhibitTemplate } from './types';

export type { Built, Ctx, ExhibitTemplate } from './types';
export type { Entry, Footprint, Hung, Slot } from '../plan/types';
export { framed, picture } from './parts';
export { painting, sculpture } from '../museum/art';
export { MOULDING } from '../plan/footprints';

export const defineTemplate = (t: ExhibitTemplate) => t;
