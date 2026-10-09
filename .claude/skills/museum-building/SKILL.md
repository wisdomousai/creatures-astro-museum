---
name: museum-building
description: Helps make or fix a building of one's own for @wisdomousai/astro-creatures-museum, an authored Blender building in place of the generated halls. Covers the naming conventions (NAV_, WALL_, COL_, SLOT_, LANE_, SIGN_, SPAWN), exporting and compressing, and checking it with npm run museum:check. Use when someone wants to design the museum's building themselves, convert a Blender scene into one, or a building fails its check.
---

# A building of one's own

The museum reads an authored building's plan from object names and custom properties
(`packages/astro-creatures-museum/src/plan/authored.ts`). The full table is in
`blender/buildings/README.md`; read it first. The sample is
`blender/buildings/template.py`.

## Start from the sample

```sh
npm run building                    # template.py → starter/public/museum/building.glb, checked
MUSEUM_BUILDING=1 npm run dev       # walk it
```

That also saves `blender/build/building.blend` to open and change. Keep a copy elsewhere:
the next `npm run building` overwrites it.

## Making one

With the Blender MCP connected, work in the open scene and check as you go:

- **Rooms** are rectangles: a `NAV_<room>` floor mesh each, lined up with x and y. Where
  two floors meet, a gap of 0.8 m or more in the `WALL_`s along that line is a doorway.
  Give a wing's room `wing: "<label>"`, matching a label in `museum({ wings })`, and the
  lobby `kind: "lobby"`.
- **Walls**: thin boxes named `WALL_…`. Only the long middle line stops the visitor, so
  keep them under 0.6 m thick, and split a wall at a doorway.
- **Slots**: an empty per place to show something, its -Y facing the room. Turn it about z:
  90° faces +x, -90° faces -x, 180° faces +y. On a wall, set it at the wall's face, with its
  middle at picture height (about 1.6 m). Give it `w` and `h` for the room it has, then
  `wing` for that wing's next page, `entry` for one page, `page` for `about` or `contact`
  (`mount: "floor"` for the front desk), or nothing, for art.
- **Lanes** for the crew: an empty at the front-start corner, X along and Y back, scaled
  to length and width (2–3 m deep). They face the room along their -Y. Keep them off
  columns and benches. Link the lanes that meet through a doorway with `link_end: "<lane>:start"`.
- **Signs** over doorways (`SIGN_…`, `text`) and **SPAWN**, looking along +Y into the
  building.
- **Materials** named for the kit's roles (`Wall`, `Trim`, `Floor`, `Plinth`, `Brass`,
  `Glow`…) take the museum's look. Any others keep their own.

Then export, compress and check:

```sh
sh blender/buildings/build.sh path/to/mine.blend starter/public/museum/building.glb
```

## When the check complains

`npm run museum:check -- <file.glb>` prints what it found and any problems. A problem stops
the site's build too.

- _isn't over any floor_: the slot, lane or SPAWN is outside every `NAV_` rectangle, often
  because it's on the wrong side of a wall.
- _is mirrored_: the lane's Y isn't 90° anticlockwise of its X (a negative scale). Use
  positive scales and turn the lane about z instead.
- _meet, but there's no gap_: two floors touch with no doorway between them, so the
  visitor can't get through. Shorten a wall.
- _nothing left to hang_ / _have nowhere to hang_: more slots than pages (they get art), or
  more pages than slots (add slots).
- _N m thick_: a wall that's really a block. Name it `COL_` instead.

Last, walk it in the browser at 1440 px. Check every slot's view, every doorway, and
that the crew walk their lanes (`?crew`).
