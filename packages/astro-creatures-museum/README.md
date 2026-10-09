# @wisdomousai/astro-creatures-museum

An Astro integration that turns a portfolio into a museum you can walk round. Each page
is an exhibit: a framed picture that plays its video when you stand in front of it, a
bookcase of posts, an object on a plinth. Generated art fills the walls between them, and
the [creatures](https://www.npmjs.com/package/@wisdomousai/creatures) toy robots wander
the halls. Step into an exhibit and its page opens over the halls, at its own address.

[See it](https://wisdomousai.github.io/creatures-astro-museum/) ·
[the starter](https://github.com/wisdomousai/creatures-astro-museum/tree/main/starter)

```sh
npm create astro@latest -- --template wisdomousai/creatures-astro-museum/starter
```

Every page is still a real page: plain HTML for search engines, for browsers without
WebGL2, and for anyone who picks **Plain site** (or adds `?flat`). It's built for desktop:
click the floor to walk there, click an exhibit to go and stand before it, and drag to look
round. WASD or the arrow keys walk too, and Q and E turn.

## Options

```js
// astro.config.mjs
import museum from '@wisdomousai/astro-creatures-museum';

export default defineConfig({
  site: 'https://example.com',
  integrations: [
    museum({
      title: 'Lorem Ipsum',
      description: 'Lorem ipsum dolor sit amet.',
      author: 'Lorem Ipsum',
      email: 'hello@example.com',
      links: { github: 'https://github.com/you' },
      wings: [
        { collection: 'projects', label: 'Works', template: 'framed-picture' },
        { collection: 'blog', label: 'Library', template: 'bookshelf' },
      ],
      filler: { density: 0.6, seed: 'lorem' },
      crew: { roster: ['bolt', 'dog', 'cat'], max: [2, 3], look: 'colour' },
      building: undefined,
      templates: [],
    }),
  ],
});
```

| Option      | What it does                                                                                                                                                                                                                                                                                                        |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wings`     | A wing of halls off the lobby per collection, in order (the first is straight ahead). `label` goes on the sign over its doorway, `template` is how its pages are shown, and `path` is where they live, if not `/<collection>`.                                                                                      |
| `filler`    | Generated art on the spare wall: `density` from 0 to 1, and a `seed` (change it for different art).                                                                                                                                                                                                                 |
| `crew`      | Who wanders the halls (`npx @wisdomousai/creatures list`; an empty roster means nobody), how many at once, and their look: `'ink'`, `'paper'` or `'colour'`. The building wears the look too. `respectReducedMotion` (on by default) leaves them out for visitors who ask for less motion, unless they add `?crew`. |
| `building`  | A building of your own, made in Blender, from `public/` (see below). Without one, the halls are built from the kit, as long as your content needs.                                                                                                                                                                  |
| `templates` | Your own exhibit templates, as files (see below).                                                                                                                                                                                                                                                                   |

Your `src/content.config.ts` takes the package's collections:

```ts
export { collections } from '@wisdomousai/astro-creatures-museum/content';
```

## Exhibits

A page hangs in its wing's way, with its `cover` for the picture. An `exhibit` block in its
frontmatter says more:

```yaml
exhibit:
  template: framed-picture # or triptych, video-wall, plaque, plinth-object, bookshelf…
  size: l # s, m or l
  video: /museum/lorem.mp4 # a muted loop that plays in the frame while you're before it
  film: /museum/lorem-film.mp4 # the whole film, with sound, for the Watch button
  image: ../../assets/projects/other.jpg # if not the cover
  room: true # a room of its own off the hall, hung with the gallery
  gallery:
    - ../../assets/projects/lorem-1.jpg
    - ../../assets/projects/lorem-2.jpg
  model: /museum/teapot.glb # for a plinth
  order: 1 # lower comes first along the wing
  hidden: false # true leaves it out of the museum (the page stays)
```

Loops are best short (6 s), muted and small (720p at a high CRF). With `-movflags
+faststart` they start before they've loaded. A film plays in the museum's own player.

| Template           | Shows                                                        |
| ------------------ | ------------------------------------------------------------ |
| `framed-picture`   | A picture in a gilt frame, its loop playing in it.           |
| `triptych`         | Its gallery (or its picture) in three frames side by side.   |
| `video-wall`       | A big screen, for a film.                                    |
| `plaque`           | A brass plaque with the words on it.                         |
| `plinth-object`    | Its `model` on a plinth mid-hall, or its picture on a stand. |
| `bookshelf`        | A bookcase, a post a book. Nine to a shelf.                  |
| `about-wall`       | The about page, in the lobby.                                |
| `front-desk`       | The contact page: the lobby's front desk.                    |
| `filler-painting`  | Generated art (it's what fills the walls).                   |
| `filler-sculpture` | Generated sculpture.                                         |

### A film on a page

In MDX, `<Film>` is the same player, framed to match:

```mdx
<Film src="/museum/lorem-film.mp4" poster="/museum/lorem.jpg" caption="Lorem, the film" />
```

### Templates of your own

```ts
// src/museum/neon.ts
import { defineTemplate, framed, picture } from '@wisdomousai/astro-creatures-museum/templates';
import { Group } from 'three';

export default defineTemplate({
  id: 'neon',
  // How much wall it wants (pure: it's asked when the site is built, too).
  footprint: () => ({ mount: 'wall', width: 2.4, height: 1.6 }),
  async build(ctx, hung) {
    const e = hung.entries[0];
    const group = new Group();
    group.add(framed(ctx, 2.2, 1.4));
    if (e?.image) group.add(picture(await ctx.image(e.image.src), 2.2, 1.4));
    return { object: group, picks: [group] };
  },
});
```

```js
museum({ templates: ['./src/museum/neon.ts'] });
```

Then name it in a wing's `template` or an exhibit's `template`. A template of a built-in's
id takes its place.

## A building of your own

```js
museum({ building: '/museum/building.glb' });
```

Make it in Blender and name the parts the museum needs: `NAV_<room>` floors, `WALL_` walls,
`SLOT_` places to show things (with which wing's pages go there), `LANE_` strips of floor
for the crew, `SPAWN`. Everything else is shown as you made it. The build reads the plan
from those names, and stops with a list of what's wrong if it can't.
[The conventions, and a sample building](https://github.com/wisdomousai/creatures-astro-museum/tree/main/blender/buildings)

## The crew

The robots are [@wisdomousai/creatures](https://www.npmjs.com/package/@wisdomousai/creatures)'
own, walking lanes of floor in the halls (`Roam`). They turn up where you aren't looking,
go from hall to hall through the doorways, and watch you go by. Click one and it notices.
Click again and it does a trick. Their models are served from your site, out of
`node_modules`.

MIT.
