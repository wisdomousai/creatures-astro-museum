# Creatures Astro museum starter

A portfolio you can walk round: a small Astro site (projects, a blog, an about page, a
contact page) shown as a museum. Every word is lorem ipsum, and every picture and film is a
placeholder, put there so you can see where yours go.

```sh
npm create astro@latest -- --template wisdomousai/creatures-astro-museum/starter
cd your-site
npm run dev
```

[See it](https://wisdomousai.github.io/creatures-astro-museum/)

You come in at the lobby, with the about wall and the front desk. Off the lobby is a wing
of halls per collection: projects hang as framed pictures that play their loops while you
stand in front of them, and posts are books on shelves. Generated art fills the spare wall.
Click an exhibit to go and stand before it, then step in, and its page opens over the halls
at its own address. Toy robots wander about. The plain site is always one click away
(**Plain site**, or `?flat`), and it's what search engines see.

It all comes from [`@wisdomousai/astro-creatures-museum`](https://www.npmjs.com/package/@wisdomousai/astro-creatures-museum).
This folder holds only what's yours.

## Where things are

|                         |                                                                                  |
| ----------------------- | -------------------------------------------------------------------------------- |
| `astro.config.mjs`      | Your address, title, email and links, the wings, the art, and who wanders about. |
| `src/content/pages/`    | `about.md` (the about wall) and `contact.md` (the front desk).                   |
| `src/content/projects/` | Projects, one exhibit each. `_template.md` has the fields.                       |
| `src/content/blog/`     | Posts, the Library's books. `_template.md` has the fields.                       |
| `src/assets/projects/`  | Covers and gallery pictures.                                                     |
| `public/museum/`        | Loops and films (and a building of your own, if you make one).                   |
| `public/og.png`         | The picture shown when someone shares a link.                                    |

Files starting with `_` are never published, and neither is anything with `draft: true`
(drafts do show in `npm run dev`).

## An exhibit

A project hangs with its `cover`. An `exhibit` block says more:

```yaml
cover: ../../assets/projects/lorem.jpg
exhibit:
  video: /museum/lorem.mp4 # a 6 s muted loop, played in the frame
  film: /museum/lorem-film.mp4 # the whole film, with sound: a Watch button plays it
  size: l
  room: true # a room of its own off the hall…
  gallery: # …with these on its walls
    - ../../assets/projects/lorem-1.jpg
```

A loop from your own footage:

```sh
ffmpeg -i in.mov -t 6 -an -vf scale=1280:-2 -c:v libx264 -crf 28 -preset slow \
  -pix_fmt yuv420p -movflags +faststart public/museum/lorem.mp4
```

In an MDX page, `<Film src="/museum/lorem-film.mp4" />` shows a film in the museum's
player. The package's README lists every template and option.

## The crew

```sh
npx @wisdomousai/creatures list
```

shows who there is. Put the ones you like in `crew.roster` (an empty roster means nobody
comes). Visitors who ask their browser for less motion get the museum without them, unless
they add `?crew`.

## A building of your own

Instead of the generated halls, you can make the building in Blender:
[`blender/buildings`](https://github.com/wisdomousai/creatures-astro-museum/tree/main/blender/buildings)
has the conventions and a sample. Put its `.glb` in `public/museum/` and set
`building: '/museum/building.glb'`.

## Putting it online

`npm run build` makes a static site in `dist/`. Set `site` in `astro.config.mjs` to your
address. Cloudflare Pages, Netlify and Vercel all take it as it is. For GitHub Pages under
a repo name, build with `BASE=/your-repo/` and `SITE=https://you.github.io`, and every link
follows.

## Have an agent set it up

`.claude/skills/museum-setup/` teaches a coding agent to turn this into your site. It puts
your words in place of the lorem ipsum (asking you for them), your pictures and films in
the frames, and your wings and crew in the config, and it can deploy it.

## Commands

|                   |                                                    |
| ----------------- | -------------------------------------------------- |
| `npm run dev`     | The site at `localhost:4321`, reloading as you go. |
| `npm run build`   | The static site, in `dist/`.                       |
| `npm run preview` | The build, served locally.                         |
| `npm run check`   | Types, and the content's frontmatter.              |

MIT.
