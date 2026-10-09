// @ts-check
import museum from '@wisdomousai/astro-creatures-museum';
import { defineConfig } from 'astro/config';

// SITE and BASE come from the environment when it's built somewhere other than the root of
// a domain (the GitHub Pages workflow sets both); set `site` to your own address here.
export default defineConfig({
  site: process.env.SITE ?? 'https://example.com',
  base: process.env.BASE ?? '/',
  integrations: [
    museum({
      title: 'Lorem Ipsum',
      description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
      author: 'Lorem Ipsum',
      email: 'hello@example.com',
      links: { github: 'https://github.com' },
      // A wing of halls off the lobby for each collection, and how its pages are shown.
      wings: [
        { collection: 'projects', label: 'Works', template: 'framed-picture' },
        { collection: 'blog', label: 'Library', template: 'bookshelf' },
      ],
      // Generated art between the exhibits: how much of the spare wall it takes.
      filler: { density: 0.6, seed: 'lorem' },
      // Or a building of your own, made in Blender (blender/buildings/README.md), from
      // public/. The sample's is there: `MUSEUM_BUILDING=1 npm run dev` walks it.
      building: process.env.MUSEUM_BUILDING ? '/museum/building.glb' : undefined,
      // Who wanders the halls: `npx @wisdomousai/creatures list` says who there is.
      // A crowd: up to ten out at once on a big screen, all over the place.
      crew: {
        roster: ['bolt', 'dog', 'cat', 'corgi', 'hedgehog', 'owl', 'duck', 'bunny', 'fox', 'penguin', 'bear', 'squirrel', 'vacuum', 'snail', 'turtle', 'pug', 'raven', 'drone', 'kitten', 'beagle'],
        max: [4, 10],
        look: 'colour',
        // The crew come for everyone, those who ask for less motion too.
        respectReducedMotion: false,
      },
    }),
  ],
});
