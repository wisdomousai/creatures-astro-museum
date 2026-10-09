---
name: museum-make
description: Makes more for the creatures-astro-museum package on request. Covers a new exhibit template (a way of showing a page, built in three.js from the Blender kit), a new kit piece modelled procedurally in Blender, a new family of generated paintings or sculptures, or a new layout recipe in the plan generator. Use when working in this repo and someone asks for a new template, exhibit style, piece of furniture, frame, art style, or kind of room.
---

# Make more for the museum

The museum is `packages/astro-creatures-museum`, and `starter/` is the site it shows. Run
`npm run dev`, then open `localhost:4321` at 1440 px or wider. In the automation browser,
reduced motion is on (add `?crew` for the robots), and a hidden tab doesn't animate. Step
it from the console with `__museum.walker`, `__museum.roam.update(dt, __museum.camera)`
and `__museum.renderer.render(__museum.scene, __museum.camera)`.

Before you finish, run all of these: `npm run check`, `npm test`, `npm run build`, and a
screenshot of what you made, in all three looks (`crew.look`: `'colour'`, `'ink'`,
`'paper'`).

## A new exhibit template

1. **Its footprint**, in `src/plan/footprints.ts`: how much wall or floor it wants for an
   entry (`mount`, `width`, `height`; `holds` for several entries in one place; `stands`
   for something that stands against the wall). It's pure, because the build asks it when
   laying out the halls.
2. **Its build**, in `src/exhibits/templates/<group>.ts`: `build(ctx, hung)` returns
   `{ object, picks, update? }`.
   - It's built about the slot. For a wall slot that's x across, y up from the middle, +z
     out of the wall; for a floor slot, y up from the floor and +z toward the visitor.
   - `hung.slot.width` and `height` are what it was given.
   - Use `ctx.materials.role('Brass')` and the other roles, so it wears the look.
   - Use `framed()`, `picture()` and `ctx.label()` from `../parts`, `ctx.image()` for
     pictures, and `ctx.video(src, material, mesh)` for a loop.
   - `picks` are what a click opens. A part's `userData.entry` says which entry, if not
     the first.
3. **Register it** in `src/exhibits/registry.ts` (`BUILT_IN`). Add it to the template table
   in the package README.
4. **See it**: give a starter project `exhibit: { template: '<id>' }`. Walk to it, or call
   `__museum.go(ex)` with `ex` from `__museum.exhibits`. Then take a screenshot.

A site can add one without touching the package: a file exporting
`defineTemplate({...})` from `@wisdomousai/astro-creatures-museum/templates`, listed in
`museum({ templates: [...] })`. Make it there first if it's only for one site.

## A new kit piece (furniture, a frame, a fitting)

The kit is procedural Blender (`blender/pieces.py`, using `blender/kit.py`'s rounded
boxes, cylinders and lathes), exported as one file.

1. If the Blender MCP is connected, prototype live: import `kit` and `pieces` from
   `blender/` and build it in the open scene. Look with `render_viewport_to_path`, and keep
   it chunky and rounded, like the creatures.
2. Write it as a function in `pieces.py`: its origin where the site places it, Blender's z
   up, its front -y. Use materials only by role name (`'Wall'`, `'Trim'`, `'Brass'`…,
   `kit.PREVIEW`). Add it to `PIECES`.
3. Run `npm run kit` (headless Blender, then meshopt into `assets/kit/kit.glb`). Keep the
   kit small: it prints the size, and every visitor loads it.
4. Use it from a template with `ctx.kit.piece('<name>')`, or in the halls from
   `src/museum/kit.ts`'s `build()`.

## A new family of art

`src/museum/art.ts`: a painter is `(g, w, h, r, colours) => void`, drawing on a 2D canvas
with the seeded `r()` and the look's `colours`. A sculptor builds a `Group` of meshes.
Add one to `PAINTERS` or `SCULPTORS`.

Adding one changes which family each seed picks, so the starter's walls will all change.
Say so. To see many at once, render `painting(seed, 1.4, 'colour')` for 12 seeds onto a
canvas grid in the console.

## A new kind of room

The halls are laid out in `src/plan/generate.ts`. It's deterministic: same content, same
museum. A room of its own (`room: true`), the lobby and the halls are all there. A new
recipe must:

- add `Room`s, `Wall`s with `kind: 'door'` gaps, and `doors` between rooms (the visitor
  only crosses between rooms through those);
- hang things with `hangOn` and `standAt`, and give the crew `lanes` and `links` if it's
  big enough;
- pass `npm test`: no rooms overlap, everything can be walked to, nothing hangs over a
  post, lanes stay inside their rooms. Add a test for it in `test/plan.test.mjs`.
