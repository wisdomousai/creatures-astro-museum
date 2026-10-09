# Creatures Astro museum

A portfolio you can walk round. Every page of an Astro site is an exhibit in a 3D museum:
framed pictures that play their loops as you stand before them, books on shelves, objects
on plinths, generated art on the walls between them, and rooms of their own for the best
work. The [creatures](https://github.com/wisdomousai/creatures) toy robots wander the halls.
Step into an exhibit and its page opens over the halls, at its real address.

[See it](https://wisdomousai.github.io/creatures-astro-museum/)

```sh
npm create astro@latest -- --template wisdomousai/creatures-astro-museum/starter
```

|                                    |                                                                                                                                   |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `starter/`                         | The template: lorem-ipsum content, placeholder loops and films, and `astro.config.mjs`.                                           |
| `packages/astro-creatures-museum/` | [`@wisdomousai/astro-creatures-museum`](packages/astro-creatures-museum/README.md), the integration: pages, the plan, the museum. |
| `blender/`                         | The kit the halls are built from (`pieces.py`) and [buildings of your own](blender/buildings/README.md).                          |
| `scripts/placeholders.sh`          | The starter's placeholder pictures and films, made with ffmpeg.                                                                   |
| `.claude/skills/`                  | `museum-make` (new templates, kit pieces, art, rooms) and `museum-building` (authored buildings).                                 |

How it fits together:

- **The plan.** At build time, `src/museum-content.ts` collects every wing's pages and
  `src/plan/generate.ts` lays them out: a lobby, a wing of halls per collection, rooms of
  their own, art in the gaps, lanes for the crew. The same content always makes the same
  museum. A building of your own is read by `src/plan/authored.ts` instead. Either way it's
  one JSON file, `/museum.json`.
- **The museum.** In the browser, `src/museum/boot.ts` builds the halls from the kit
  (instanced), each exhibit from its template, and the crew from creatures' `Roam`, then
  walks you round. A page opens over it (`page.ts`), fetched and swapped in, at its own URL.
- **The plain site.** It's the same pages without the museum, for search engines, browsers
  without WebGL2, and `?flat`.

## Working on it

```sh
npm install
npm run dev           # the starter, at localhost:4321
npm test              # the plan: layouts, walking, lanes, authored buildings
npm run check         # types
npm run build
npm run kit           # the Blender kit → assets/kit/kit.glb (Blender 5)
npm run building      # the sample building → starter/public/museum/building.glb
```

The museum is built for desktop browsers.

## Releasing

CI checks, tests and builds every push, and the demo deploys to GitHub Pages from `main`.
To release the package, bump its `version` in a commit of its own, then make a GitHub
release with tag `v<version>`. That publishes to npm with provenance (trusted publishing).
The very first version goes up by hand (`npm publish -w packages/astro-creatures-museum
--access public`). After that, add this repo's `publish.yml` as the package's trusted
publisher on npmjs.com.

MIT.
