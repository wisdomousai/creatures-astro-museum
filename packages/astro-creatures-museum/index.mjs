// @ts-check
// The Astro integration: a site's content in src/content, shown as a museum to walk round.
//
// Every page is a real page first, at its own address, for search engines and for anyone
// who'd rather read than walk. Over it, when the browser can, the museum: a lobby with the
// about wall and the front desk, a wing of halls per collection, each page an exhibit on a
// wall or a plinth, and the crew wandering about. Step into an exhibit and its page opens.
//
// It brings the pages (injected routes), the layouts and styles, mdx, the sitemap and code
// highlighting; the site brings its words (src/content) and its settings (the options).
import { cpSync, createReadStream, existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import expressiveCode from 'astro-expressive-code';

/** @typedef {import('./src/types').Options} Options */
/** @typedef {import('./src/types').Config} Config */

/** @type {Config['wings']} */
const WINGS = [
  { collection: 'projects', label: 'Works', template: 'framed-picture' },
  { collection: 'blog', label: 'Library', template: 'bookshelf' },
];

/** The site's pages, from src/routes, and the museum's plan. */
const ROUTES = [
  ['/', 'index.astro'],
  ['/about', 'about.astro'],
  ['/contact', 'contact.astro'],
  ['/blog', 'blog/index.astro'],
  ['/blog/[...slug]', 'blog/[...slug].astro'],
  ['/projects', 'projects/index.astro'],
  ['/projects/[...slug]', 'projects/[...slug].astro'],
  ['/rss.xml', 'rss.xml.js'],
  ['/museum.json', 'museum.json.ts'],
  ['/404', '404.astro'],
];

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
/** The crew's models and textures, in the installed creatures package. */
const models = join(dirname(require.resolve('@wisdomousai/creatures/package.json')), 'models');
/** The building's kit: walls, floors, frames, plinths (blender/, built by `npm run kit`). */
const kit = join(here, 'assets', 'kit');

/**
 * @param {Options} [options]
 * @returns {import('astro').AstroIntegration}
 */
export default function museum(options = {}) {
  /** @type {Config} */
  const config = {
    title: options.title ?? 'Lorem Ipsum',
    description: options.description ?? 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
    author: options.author ?? 'Lorem Ipsum',
    email: options.email ?? 'hello@example.com',
    links: options.links ?? {},
    nav: options.nav ?? [
      { label: 'Blog', href: '/blog' },
      { label: 'Projects', href: '/projects' },
      { label: 'About', href: '/about' },
      { label: 'Contact', href: '/contact' },
    ],
    wings: options.wings ?? WINGS,
    filler: { density: 0.6, seed: 'museum', ...options.filler },
    building: options.building ?? null,
    buildingFile: null,
    templates: options.templates ?? [],
    crew: {
      roster: ['bolt', 'dog', 'cat', 'corgi', 'hedgehog', 'owl', 'duck', 'bunny', 'fox', 'penguin', 'bear', 'squirrel', 'vacuum', 'snail', 'turtle', 'pug', 'raven', 'drone', 'kitten', 'beagle'],
      max: [4, 10],
      look: 'colour',
      respectReducedMotion: true,
      ...options.crew,
    },
  };

  /** The files served from the site itself: [address under the base, folder, filter]. */
  const served = /** @type {[string, string, (from: string) => boolean][]} */ ([
    // (The portraits and the painted rooms are for the creatures' own playground.)
    [
      'creatures/',
      models,
      (from) => from !== join(models, 'thumbs') && from !== join(models, 'pic'),
    ],
    ['museum-kit/', kit, () => true],
  ]);
  let base = '/';
  let root = process.cwd();

  return {
    name: '@wisdomousai/astro-creatures-museum',
    hooks: {
      'astro:config:setup': ({ config: astro, updateConfig, injectRoute }) => {
        root = fileURLToPath(astro.root);
        if (config.building)
          config.buildingFile = join(fileURLToPath(astro.publicDir), config.building.replace(/^\//, ''));
        const has = (/** @type {string} */ name) => astro.integrations.some((i) => i.name === name);
        updateConfig({
          integrations: [
            // Before mdx, so code in .mdx is highlighted too.
            ...(has('astro-expressive-code')
              ? []
              : [
                  expressiveCode({
                    themes: ['github-light', 'github-dark'],
                    styleOverrides: {
                      borderRadius: '4px',
                      codeFontFamily: 'var(--font-mono)',
                      codeFontSize: '0.85rem',
                      uiFontFamily: 'var(--font-sans)',
                    },
                  }),
                ]),
            ...(has('@astrojs/mdx') ? [] : [mdx()]),
            ...(has('@astrojs/sitemap') ? [] : [sitemap()]),
          ],
          vite: { plugins: [settings(config), templates(config.templates, () => root)] },
        });
        for (const [pattern, file] of ROUTES)
          injectRoute({ pattern, entrypoint: join(here, 'src', 'routes', file) });
      },
      'astro:config:done': ({ config: astro }) => {
        base = astro.base.replace(/\/?$/, '/');
      },
      'astro:server:setup': ({ server }) => {
        for (const [at, folder] of served)
          server.middlewares.use((req, res, next) => {
            const prefix = base + at;
            const path = decodeURIComponent((req.url ?? '').split('?')[0]);
            if (!path.startsWith(prefix)) return next();
            const file = normalize(join(folder, path.slice(prefix.length)));
            if (!file.startsWith(folder + sep)) return next();
            let size;
            try {
              const stat = statSync(file);
              if (!stat.isFile()) return next();
              size = stat.size;
            } catch {
              return next();
            }
            res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
            res.setHeader('Content-Length', size);
            createReadStream(file).pipe(res);
          });
      },
      'astro:build:done': ({ dir, logger }) => {
        for (const [at, folder, filter] of served) {
          if (!existsSync(folder)) continue;
          cpSync(folder, join(fileURLToPath(dir), at), { recursive: true, filter });
          logger.info(`${at} copied from ${folder}`);
        }
      },
    },
  };
}

const TYPES = /** @type {Record<string, string>} */ ({
  '.glb': 'model/gltf-binary',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.json': 'application/json',
});

/**
 * The settings, for the pages and the museum alike: `virtual:astro-creatures-museum/config`.
 * @param {Config} config
 * @returns {import('vite').Plugin}
 */
function settings(config) {
  const id = 'virtual:astro-creatures-museum/config';
  return {
    name: 'astro-creatures-museum-config',
    resolveId: (source) => (source === id ? `\0${id}` : undefined),
    load: (source) =>
      source === `\0${id}` ? `export default ${JSON.stringify(config)};` : undefined,
  };
}

/**
 * The site's own exhibit templates (the `templates` option), as one module the museum
 * imports: `virtual:astro-creatures-museum/templates`.
 * @param {string[]} files
 * @param {() => string} root
 * @returns {import('vite').Plugin}
 */
function templates(files, root) {
  const id = 'virtual:astro-creatures-museum/templates';
  return {
    name: 'astro-creatures-museum-templates',
    resolveId: (source) => (source === id ? `\0${id}` : undefined),
    load: (source) => {
      if (source !== `\0${id}`) return undefined;
      const paths = files.map((f) => JSON.stringify(resolve(root(), f)));
      return [
        ...paths.map((p, i) => `import t${i} from ${p};`),
        `export default [${paths.map((_, i) => `t${i}`).join(', ')}];`,
      ].join('\n');
    },
  };
}
