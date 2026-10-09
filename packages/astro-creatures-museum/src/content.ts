// The site's content collections, for its src/content.config.ts:
//
//   export { collections } from '@wisdomousai/astro-creatures-museum/content';
//
// A collection of your own joins the museum by having a wing (astro.config.mjs) and an
// `exhibit` field in its schema: `exhibit: exhibit(image)`.
import { defineCollection, type SchemaContext } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

/**
 * How a page shows in the museum, all of it optional: without it the page hangs in its
 * wing's way, with its cover (if it has one) for a picture.
 */
export const exhibit = (image: SchemaContext['image']) =>
  z
    .object({
      /** Which template shows it ('framed-picture', 'plinth-object', 'video-wall'…). */
      template: z.string().optional(),
      /** Which wing it hangs in, if not its collection's. */
      wing: z.string().optional(),
      /** Lower comes first along the wing. */
      order: z.number().optional(),
      /** How big it hangs. */
      size: z.enum(['s', 'm', 'l']).default('m'),
      /** A little room of its own, off the hall, hung with its gallery. */
      room: z.boolean().default(false),
      /** Left out of the museum (the page is still there). */
      hidden: z.boolean().default(false),
      /** The picture in the frame, if not the cover. */
      image: image().optional(),
      /** A short loop that plays in the frame while you stand in front of it, from
       * public/ ('/museum/lorem.mp4'): muted, a few seconds, 720p is plenty. */
      video: z.string().optional(),
      /** The whole film, with sound, for the player (from public/, or a video file's
       * address): what Watch plays. Without one, Watch plays the loop. */
      film: z.string().optional(),
      /** More pictures, for a room of its own or a triptych. */
      gallery: z.array(image()).default([]),
      /** A model for a plinth, from public/ ('/museum/teapot.glb'). */
      model: z.string().optional(),
    })
    .optional();

// Files starting with _ are left out (the templates).
const blog = defineCollection({
  loader: glob({ base: './src/content/blog', pattern: '**/[^_]*.{md,mdx}' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string(),
      date: z.coerce.date(),
      updated: z.coerce.date().optional(),
      draft: z.boolean().default(false),
      tags: z.array(z.string()).default([]),
      cover: image().optional(),
      exhibit: exhibit(image),
      // Set when the original lives elsewhere, so search engines credit that copy.
      canonical: z.url().optional(),
    }),
});

// One file per project. A project with a `url` and no body links straight to it; write a
// body and it gets a page of its own.
const projects = defineCollection({
  loader: glob({ base: './src/content/projects', pattern: '**/[^_]*.{md,mdx}' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      summary: z.string(),
      url: z.url().optional(),
      order: z.number().default(100), // lower comes first
      role: z.string().optional(),
      period: z.string().optional(),
      stack: z.array(z.string()).default([]),
      cover: image().optional(),
      draft: z.boolean().default(false),
      exhibit: exhibit(image),
    }),
});

// The about and contact pages, by file name: a title, a description (for search results)
// and the page's body.
const pages = defineCollection({
  loader: glob({ base: './src/content/pages', pattern: '*.{md,mdx}' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    updated: z.coerce.date().optional(),
  }),
});

export const collections = { blog, projects, pages };
