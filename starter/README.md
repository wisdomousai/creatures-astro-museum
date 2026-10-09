# Creatures Astro starter

A small Astro site (a blog, projects, an about page, a contact page) with toy robots living
in it. Every word is lorem ipsum, put there so you can see where yours go.

```sh
npm create astro@latest -- --template wisdomousai/creatures-astro-starter/starter
cd your-site
npm run dev
```

How your words are shown is a shell, set in `astro.config.mjs`:

- **clean** (the default): the site as it is, with a frame round the window and robots who
  live on it. Every so often one turns up, walks along the frame or flies up its sides, has
  a look at what you're reading and goes home. Poke one and it jumps. Poke it three times
  quickly and it gets dizzy. Hold one down and it follows the pointer.
  [See it](https://wisdomousai.github.io/creatures-astro-starter/clean/)
- **room**: the same pages, played inside a little room, on a monitor standing on the
  floor. A tuner across the top is the navigation, each section has a painted room of its
  own, and the front page is a lobby where robots hold up signs for the sections.
  [See it](https://wisdomousai.github.io/creatures-astro-starter/room/)

```js
creatures({ shell: 'room' });
```

The shells come from [`@wisdomousai/astro-creatures`](https://www.npmjs.com/package/@wisdomousai/astro-creatures).
This folder holds only what's yours.

## Where things are

|                         |                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------- |
| `astro.config.mjs`      | Your address, the shell, the title, your email and links, and who comes by.        |
| `src/content/pages/`    | `about.md` and `contact.md`.                                                       |
| `src/content/blog/`     | Posts, in Markdown or MDX. `_template.md` has the fields.                          |
| `src/content/projects/` | Projects. One with a body gets a page of its own; one with only a `url` links out. |
| `public/og.png`         | The picture shown when someone shares a link.                                      |
| `public/favicon.svg`    | The icon in the tab.                                                               |

Files starting with `_` are never published, and neither is anything with `draft: true`
(drafts do show in `npm run dev`).

## Choosing the crew

```sh
npx @wisdomousai/creatures list
```

shows the 149 in the box. Put the ones you like in `crew.roster`:

```js
crew: {
  roster: ['bolt', 'owl', 'cat'],
  first: 'bolt',   // who comes soon after the page loads
  max: 2,          // how many at once
  every: [10, 25], // seconds between arrivals
},
```

An empty roster turns them off. In the clean shell, visitors who ask their browser for less
motion get the site without them (`respectReducedMotion: false` brings them back).

In the clean shell their models come from jsDelivr, pinned to the version installed. The
room serves them from your own site, out of `node_modules`, because it paints its rooms'
pictures on a canvas, and a browser won't read back a canvas with another site's picture on
it. That's why a room build is about 50 MB.

## The room's stations

The room's stations, the rooms they're in and the lobby's sign holders all have defaults.
To change them, pass `stations` and `lobby`:

```js
stations: [
  { key: 'home', label: 'Home', href: '/', room: null, dress: 'home' },
  { key: 'blog', label: 'Writing', href: '/blog', room: 'office', dress: 'home' },
  // …
],
```

`room` is `jungle`, `office`, `lab`, or `null` for the plain white box, and `dress` names
the furniture and hangings it brings (`home`, `work`, `about`, `contact`,
`creatures/birds`). The package's README has the rest.

## Putting it online

`npm run build` makes a static site in `dist/`. Set `site` in `astro.config.mjs` to your
address. Cloudflare Pages, Netlify and Vercel all take it as it is. For GitHub Pages under a
repo name, build with `BASE=/your-repo/` and `SITE=https://you.github.io`, and every link
follows.

## Have an agent set it up

`.claude/skills/creatures-setup/` teaches a coding agent to turn this into your site: your
words in place of the lorem ipsum (it asks you for them), your shell and crew, and a deploy.
To have it make you a robot of your own, too:

```sh
npx @wisdomousai/creatures skill
```

## Commands

|                   |                                                    |
| ----------------- | -------------------------------------------------- |
| `npm run dev`     | The site at `localhost:4321`, reloading as you go. |
| `npm run build`   | The static site, in `dist/`.                       |
| `npm run preview` | The build, served locally.                         |
| `npm run check`   | Types, and the content's frontmatter.              |

MIT.
