# A building of your own

By default the museum builds itself from the kit: a lobby and a wing of halls per
collection, as long as your content needs. Instead, you can make the building yourself in
Blender. The museum reads its plan from what your objects are called, so walking, the crew,
the exhibits and the pages work as before.

```js
museum({
  building: '/museum/building.glb', // in public/
  wings: [
    { collection: 'projects', label: 'Works', template: 'framed-picture' },
    { collection: 'blog', label: 'Library', template: 'bookshelf' },
  ],
});
```

## The sample

`template.py` makes one: a lobby, a long gallery for the Works with columns down it, and a
reading room for the Library.

```sh
npm run building                         # template.py → starter/public/museum/building.glb
MUSEUM_BUILDING=1 npm run dev            # walk it
```

It also saves `blender/build/building.blend`. Open that, change it, and build yours.

## Building your own

```sh
sh blender/buildings/build.sh mine.blend starter/public/museum/building.glb
npm run museum:check -- starter/public/museum/building.glb
```

`build.sh` exports everything in the file (`export_building.py`), compresses it (meshopt)
and checks it. The site's build checks it too. A problem stops the build; a note doesn't.

## The names

Blender's z is up. An object's **front is its -Y**, the side you see in the Front view.
Units are metres. Custom properties go in Object Properties → Custom Properties.

| Name         | What it is                                                                                                                                                                                   | Properties                                                                                                                                                                                      |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NAV_<room>` | A room's floor, a mesh. The visitor walks where floors are. Where two meet, a gap of 0.8 m or more in the walls between them is a doorway.                                                   | `kind`: `lobby`, `hall`, `alcove` · `wing`: the wing's label (it names the room and paints it) · `title`                                                                                        |
| `WALL_…`     | A wall: a box mesh, or a cube empty. The visitor is stopped at its long middle line.                                                                                                         |                                                                                                                                                                                                 |
| `COL_…`      | Something to walk round (a column, a bench): its box on the floor.                                                                                                                           |                                                                                                                                                                                                 |
| `SLOT_…`     | An empty where something is shown, facing its -Y. A wall slot's middle is the picture's middle.                                                                                              | `mount`: `wall` or `floor` · `w`, `h`: the room it has · then one of `wing` (that wing's next page), `entry` (`projects/lorem`), `page` (`about` or `contact`), or nothing for art · `template` |
| `LANE_<id>`  | An empty at the front-start corner of a strip of floor for the crew. X runs along the strip and Y goes back across it, so the crew face its -Y. Scale X is the length and scale Y the width. | `link_start`, `link_end`: `<lane>:start` or `<lane>:end`, the lane they walk on to through a doorway                                                                                            |
| `SIGN_…`     | An empty for a sign over a doorway, facing its -Y.                                                                                                                                           | `text`                                                                                                                                                                                          |
| `SPAWN`      | Where the visitor comes in, looking along its +Y.                                                                                                                                            | `height`: the ceiling's height (4)                                                                                                                                                              |

Everything else is shown just as you made it. Materials named for the kit's roles take the
museum's look: `Wall`, `Trim`, `Frame`, `Plinth`, `Wood`, `Velvet`, `Brass`, `Glow`, `Floor`
and `Dark` (`blender/kit.py`). Other materials stay as they are. Whatever is up at the
ceiling casts no shadow, so the sun reaches the floor.

## Good to know

- A wing's slots take its pages in order. Spare slots get art. Pages with no slot left
  aren't shown, and the check says how many.
- Lay lanes along walls, facing into the room, with 2–3 m of floor. Keep them clear of
  `COL_` things: the crew don't know about them.
- Floors and slots should line up with x and y. Rooms are rectangles on the floor, and a
  slot's view is worked out from where it faces.
