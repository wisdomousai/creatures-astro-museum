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
      // Who wanders the halls: `npx @wisdomousai/creatures list` says who there is.
      crew: { roster: ['bolt', 'dog', 'cat', 'corgi', 'hedgehog', 'owl'], look: 'colour' },
    }),
  ],
});
