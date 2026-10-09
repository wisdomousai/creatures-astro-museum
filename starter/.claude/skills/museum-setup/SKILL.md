---
name: museum-setup
description: Turns this Astro starter (a lorem-ipsum portfolio shown as a walkable 3D museum by @wisdomousai/astro-creatures-museum, with exhibits, generated art and toy robots) into its owner's own site. Replaces the lorem ipsum with the owner's words, puts their pictures, loops and films in the frames, sets the wings, art and crew, and gets it online. Use when someone has just made a site from this starter, or asks to set it up, add exhibits, change the wings or robots, make video loops for it, or deploy it.
---

# Set up the museum starter

The starter is content and a config. The pages, the museum and its exhibits come from the
`@wisdomousai/astro-creatures-museum` integration in `astro.config.mjs`, so the job is to
fill in the owner's words, pictures and settings. Leave the pages to the package: don't copy
them into `src/pages/`, or the site stops getting the package's fixes.

## 1. Their words, never yours

Ask the owner for each piece of text. Never write copy for them: no bio, no taglines, no
project blurbs, no "passionate about". If they don't have something yet, leave the lorem
ipsum in place and list what's still missing at the end.

- `astro.config.mjs`, in `museum({...})`: `title` (on the lobby's map and every tab),
  `description`, `author`, `email`, `links`, `nav`.
- `src/content/pages/`: `about.md` (the lobby's about wall) and `contact.md` (the front
  desk). `title`, `description`, and the body.
- `src/content/projects/`: one file per project, one exhibit each. `_template.md` shows
  every field. A project with a body gets a page of its own; one with only a `url` leads out.
- `src/content/blog/`: posts, which are the Library's books. Delete the lorem ones.
- `public/og.png` (1200×630) and `public/favicon.svg`: ask for theirs, or leave them.

## 2. Their pictures and films

For each project, ask what to show:

- **A cover** (`cover:` in `src/assets/projects/`): the picture in the frame. Landscape
  hangs best, and 1600 px wide is plenty, since the build makes the sizes.
- **A loop** (`exhibit.video`, in `public/museum/`): a few seconds that play in the frame
  while a visitor stands before it. From their footage:

  ```sh
  ffmpeg -i in.mov -ss 2 -t 6 -an -vf scale=1280:-2 -c:v libx264 -crf 28 -preset slow \
    -pix_fmt yuv420p -movflags +faststart public/museum/<slug>.mp4
  ```

  Aim for under 1 MB. Without a cover, a still from the loop makes one:
  `ffmpeg -ss 3 -i public/museum/<slug>.mp4 -frames:v 1 -q:v 3 src/assets/projects/<slug>.jpg`.

- **A film** (`exhibit.film`): the whole thing with sound, for the Watch button.
  `-crf 26 -c:a aac -b:a 128k -movflags +faststart`, and keep it modest (a few minutes, 720p
  or 1080p). In an `.mdx` page, `<Film src="…" />` shows it in the page too.
- **A room of its own** (`exhibit.room: true` and `gallery:`): for their best piece. It
  gets its own room off the hall, the piece on the back wall and two gallery pictures on
  the sides. Or a place, with some of the crew living there: `room: jungle`, `forest`,
  `aquarium`, `snow`, `village`, `alps`, or the zoo's `cat-cafe`, `dog-park`, `aviary`,
  `robot-park`.
- `exhibit.size` (`s`, `m`, `l`) and `order` (lower comes first) to arrange the wing.

Then delete the starter's placeholders they no longer use: `public/museum/lorem*.mp4`,
`ipsum.mp4`, `dolor.mp4`, `eiusmod.mp4` and `src/assets/projects/*.jpg`. Keep
`public/museum/building.glb` only if they use the sample building.

## 3. Wings, art, crew

- `wings`: one per collection, in order. The first is straight ahead from the entrance,
  then right, left, behind. `label` is on the sign over its doorway. `template` is how its
  pages hang: `framed-picture`, `triptych`, `video-wall`, `plaque` or `plinth-object`, and
  `bookshelf` for posts. A collection of their own (talks, say) works too: add it in
  `src/content.config.ts`, with `exhibit: exhibit(image)` in its schema.
- `filler`: `density` 0–1 of the spare wall gets generated art. Change `seed` for
  different paintings.
- `crew.roster`: `npx @wisdomousai/creatures list` shows who there is. Let them choose.
  `max: [phone, desktop]`, and `look`: `'colour'`, `'ink'` or `'paper'`, which the
  building wears too.

Then `npm run check && npm run build`, which catches a missing frontmatter field.

## 4. Look at it

`npm run dev`, then open `localhost:4321` in a browser 1440 px or wider. The museum is
built for desktop. Walk each wing: every exhibit hangs, its loop plays when you stand in
front of it (not with reduced motion on, which also keeps the robots away unless you add
`?crew`), its label reads, Step in opens the page, and Back closes it. `?flat` shows the
plain site, which is what search engines see. Take a screenshot of each wing for the owner.

## 5. Online

Set `site` in `astro.config.mjs` to their address. `npm run build` gives a static `dist/`.

- **Cloudflare Pages / Netlify / Vercel**: build command `npm run build`, output `dist`.
- **GitHub Pages at a repo path**: build with `BASE=/<repo>/` and
  `SITE=https://<user>.github.io` (`actions/upload-pages-artifact` and
  `actions/deploy-pages`).

## A building of their own

If they'd rather design the building than have it generated, it's made in Blender with a
few naming rules (`museum({ building: '/museum/building.glb' })`). The conventions and a
sample are in the package's repo, under `blender/buildings`.

## Finally

Tell the owner what you changed, and list every place that still has lorem ipsum, a
placeholder film or example.com in it
(`grep -rln "Lorem\|lorem\|example.com" src public astro.config.mjs`).
