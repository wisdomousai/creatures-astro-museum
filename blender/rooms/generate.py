"""The themed rooms' pictures, painted by Codex's image generation ($imagegen), as PNGs:

    python3 blender/rooms/generate.py OUT_DIR [jungle forest/bark ...]

Then textures.py makes them the rooms' textures (OUT_DIR is its GENERATED_DIR). With names,
only the pictures whose names start with one of them; a picture already in OUT_DIR is kept,
so delete one to have it painted again.

- each room's four walls: the back wall first, then the left and right ones continuing it
  (round the room's corners, with the back wall to go by), then the front one from those two;
- tiling textures (floors, bark, rock, ice);
- sheets of cut-outs on a flat key colour (leaves, flowers, the falling leaf), which
  textures.py keys out.

Needs the Codex CLI, logged in, with image generation (`codex features list`). Six run at a
time; a wall waits for the ones it continues. Each prints `ok`, or `FAILED` and where its log is.
"""

import base64
import concurrent.futures as cf
import os
import re
import subprocess
import sys
import tempfile
import threading
import time

MURAL = ('A landscape 1536x1024 hand-painted backdrop for a walk-in museum diorama room: rich painterly '
         'illustration, soft atmospheric depth, natural light. Looking straight ahead at eye level: the horizon line '
         'is {h}% of the image height up from the bottom edge. The bottom edge is the ground seen close up; the top '
         'edge is {top}. No people, no text, no border or frame.')

#: Each room: where its horizon is (% up the wall: lower for a taller room, so it's at eye
#: height), what's at the top of its walls, and the place.
THEMES = {
    'jungle': (27, 'the leafy canopy',
               'Deep inside a lush tropical jungle: giant buttress-root trees, hanging lianas, huge monstera and '
               'banana leaves, ferns, orchids and bromeliads, a waterfall glimpsed far off through mist, shafts of '
               'warm sunlight. No animals.'),
    'forest': (27, 'the leafy canopy',
               'A quiet temperate forest in early autumn: tall old beech and spruce trunks, mossy boulders, ferns, a '
               'clear stream, misty rays of light, golden and green leaves. No animals.'),
    'aquarium': (32, 'the bright rippling water surface seen from below',
                 'Underwater on a sunny coral reef, seen from the sandy sea floor as if standing inside a vast '
                 'aquarium: colourful corals, sea fans, anemones, swaying kelp, rocks, sunbeams from the surface, deep '
                 'blue fading to turquoise. Only tiny far-off shoals of fish as silhouettes.'),
    'snow': (32, 'a pale winter sky',
             'A frozen land of snow and ice: blue glacier ice walls with crevasses, great icicles, a frozen '
             'waterfall, snow-laden spruces, sparkling snow drifts, soft low winter sun. No animals.'),
    'village': (23, 'a blue summer sky',
                'A sunny village square in Provence, France: old stone and ochre stucco houses with blue and '
                'sage-green wooden shutters, terracotta roofs, window boxes of red geraniums, wisteria, a café awning, '
                'a bakery shopfront with a blank unlettered sign, a bell tower beyond, plane trees, cobblestones. No '
                'animals, nobody about.'),
    'alps': (27, 'a deep blue sky',
             'The view from the summit of a high mountain over the Swiss Alps: a sea of jagged snow-capped peaks with '
             'a Matterhorn-like pyramid in the distance, glaciers, a sea of clouds filling the valleys below, crisp '
             'morning light. The near foreground at the bottom edge is the rocky summit edge dropping away. No '
             'animals.'),
}
SIDE = ('The reference image is the back wall of the same room. Paint the {side} wall: the view continuing to the '
        '{side} of the reference: the same place, style, light, palette and horizon height. Its {edge} edge '
        'continues seamlessly from the reference\'s {redge} edge (they meet in the room\'s corner). A new '
        'composition, not a copy. ')
FRONT = ('The two reference images are the left wall (first) and the right wall (second) of the same room. Paint the '
         'wall behind the viewer: its left edge continues from the right wall\'s right edge and its right edge from '
         'the left wall\'s left edge. Same place, style, light, palette and horizon height. Keep the lower middle '
         'simple and open (a doorway will be cut there). ')
TEX = ('A square 1024x1024 seamless tileable texture, seen straight on, flat even lighting with no cast shadows, '
       'painterly but detailed, for a 3D model: ')
ATLAS = ('A square 1024x1024 sprite sheet: a 2x2 grid of four separate cut-out subjects on a perfectly flat pure '
         '{key} background, each centred in its own quarter with a clear margin, flat front view, crisp edges, no '
         'shadows, no ground, no {key} or similar colours in the subjects. Painterly but detailed. The four: ')

#: Every picture: its prompt, and the pictures it goes by (painted first).
JOBS = {
    'rock': (TEX + 'grey stone covered in patches of green moss.', []),
    'jungle/floor': (TEX + 'tropical rainforest floor seen from above: brown leaf litter, moss, small seedlings, rich '
                     'soil.', []),
    'jungle/bark': (TEX + 'tropical tree bark with vertical grain, patches of moss and lichen.', []),
    'jungle/leaves': (ATLAS.format(key='magenta #FF00FF') + 'a monstera leaf, a banana leaf, a palm frond, a large fern '
                      'frond; stems pointing down.', []),
    'forest/floor': (TEX + 'temperate forest floor seen from above: moss, pine needles, fallen orange and brown beech '
                     'leaves, twigs.', []),
    'forest/bark': (TEX + 'old spruce bark with deep vertical plates, a little lichen.', []),
    'forest/leaves': (ATLAS.format(key='magenta #FF00FF') + 'a spruce bough, a beech twig with green-gold leaves, a '
                      'bracken fern frond, an ivy sprig; stems pointing down.', []),
    'aquarium/floor': (TEX + 'pale sea-floor sand with soft ripples and a few small shells, seen from above.', []),
    'aquarium/rock': (TEX + 'porous reef rock encrusted with tiny corals and sponges, warm ochre and coral tones.', []),
    'aquarium/plants': (ATLAS.format(key='magenta #FF00FF') + 'a tall golden-brown kelp frond, an orange-red sea fan, '
                        'an orange branching coral, a tuft of green sea grass; bases pointing down.', []),
    'snow/floor': (TEX + 'fresh soft snow surface with gentle drifts and a faint sparkle, seen from above.', []),
    'snow/ice': (TEX + 'clear blue glacier ice with cracks and trapped bubbles.', []),
    'village/floor': (TEX + 'old rounded cobblestone pavement in a French village, warm grey and honey stones, seen '
                      'from above.', []),
    'village/stone': (TEX + 'pale honey limestone blocks with soft weathering.', []),
    'village/bark': (TEX + 'plane tree bark: smooth patches of cream, olive and grey like camouflage.', []),
    'village/flowers': (ATLAS.format(key='cyan #00FFFF') + 'a red geranium in bloom with its leaves, a bunch of '
                        'lavender, a trailing ivy, a clipped boxwood ball; bases pointing down.', []),
    'alps/floor': (TEX + 'weathered larch wooden deck planks running left to right, silver-brown.', []),
    'alps/rock': (TEX + 'grey granite with orange and green lichen.', []),
    'alps/flowers': (ATLAS.format(key='cyan #00FFFF') + 'a tuft of edelweiss, blue gentians, an alpine rose bush in '
                     'pink bloom, a tuft of alpine grass; bases pointing down.', []),
    'wings': (ATLAS.format(key='green #00FF00') + 'a blue morpho butterfly, a monarch butterfly and a yellow '
              'swallowtail butterfly, each seen from straight above with wings fully open and the body vertical, '
              'and an orange maple leaf.', []),
}
for _t, (_h, _top, _scene) in THEMES.items():
    _m = MURAL.format(h=_h, top=_top) + ' ' + _scene
    JOBS[f'{_t}/back'] = (_m, [])
    JOBS[f'{_t}/left'] = (SIDE.format(side='left', edge='right', redge='left') + _m, [f'{_t}/back'])
    JOBS[f'{_t}/right'] = (SIDE.format(side='right', edge='left', redge='right') + _m, [f'{_t}/back'])
    JOBS[f'{_t}/front'] = (FRONT + _m, [f'{_t}/left', f'{_t}/right'])


# The zoo's rooms (cat-cafe, dog-park, aviary, robot-park): each wall painted on its own, from
# one description of the place, and its floor.
ZOO_STYLE = ('Rich painterly illustration, bright and detailed, storybook realism, like the backdrop of a '
             'diorama. No people, no animals, no birds, no text, no lettering, no signs.')
ZOO_WALL = 'A painted wall mural, landscape 3:2, wide eye-level view: '
ZOO_TILE = 'A seamless tileable texture, square, seen straight from above, evenly lit, no shadows, no perspective: '
ZOO = {
    'cat-cafe/back': (ZOO_WALL + (
        'the inside of a cosy, sunny cat cafe seen from its middle - the far wall with tall arched '
        'windows onto a little street, wooden shelves of mugs and plants, a counter with cakes under '
        'glass domes, wall-mounted cat shelves and steps, hanging lamps, warm afternoon light, honey '
        'wood and cream and sage green. The floor (warm wooden boards) runs along the bottom edge.'
    ) + ' ' + ZOO_STYLE),
    'cat-cafe/left': (ZOO_WALL + (
        'the side wall of a cosy, sunny cat cafe: a long cushioned window seat under big windows onto'
        ' a leafy street, cat shelves and a rope bridge climbing up the cream and sage green wall, '
        'hanging plants, framed botanical prints, a bookcase of games. Warm afternoon light, honey '
        'wood. The wooden board floor runs along the bottom edge.'
    ) + ' ' + ZOO_STYLE),
    'cat-cafe/right': (ZOO_WALL + (
        'the side wall of a cosy, sunny cat cafe: a long wooden counter with a coffee machine, jars, '
        'cakes under glass domes, open shelves of cups and teapots, a chalkboard frame with only '
        'drawings of cups, pendant lamps, little cat houses built into the sage green wall high up, '
        'plants. Warm afternoon light, honey wood. The wooden board floor runs along the bottom edge.'
    ) + ' ' + ZOO_STYLE),
    'cat-cafe/front': (ZOO_WALL + (
        'the entrance wall of a cosy, sunny cat cafe seen from inside: a double glass door in the '
        'middle with a little vestibule, coat hooks and umbrella stand either side, shelves with '
        'potted plants, scratching posts wrapped in rope, framed pictures, cream and sage green '
        'walls, warm light. The wooden board floor runs along the bottom edge.'
    ) + ' ' + ZOO_STYLE),
    'cat-cafe/floor': (ZOO_TILE + (
        'warm honey-coloured wooden floorboards, oak planks with gentle grain and a soft satin sheen,'
        ' a few knots.'
    )),
    'dog-park/back': (ZOO_WALL + (
        'a big sunny dog park: a wide mown meadow running back to a white picket fence, beyond it '
        'rolling green hills, big shady oak trees, a winding gravel path, a little blue pond, agility'
        ' hoops and jump poles and a tunnel in the distance, wooden benches, summer sky with fluffy '
        'clouds. The grass runs along the bottom edge.'
    ) + ' ' + ZOO_STYLE),
    'dog-park/left': (ZOO_WALL + (
        'the side of a sunny dog park: a wooden picket fence close by, behind it a row of tall leafy '
        'trees and flowering bushes, a red drinking fountain post, a wooden bench, a gravel path, '
        'meadow flowers, glimpses of rolling hills and blue sky. The grass runs along the bottom '
        'edge.'
    ) + ' ' + ZOO_STYLE),
    'dog-park/right': (ZOO_WALL + (
        'the side of a sunny dog park: a low wooden fence, a little wooden shelter with a shingle '
        'roof, a row of birch and chestnut trees, a sand pit, colourful agility weave poles and a '
        'ramp on the grass, a distant village with red roofs on a hill, summer sky. The grass runs '
        'along the bottom edge.'
    ) + ' ' + ZOO_STYLE),
    'dog-park/front': (ZOO_WALL + (
        'the gate side of a sunny dog park seen from inside: a wooden double gate in a picket fence '
        'in the middle, hedges either side, a lamp post, a wooden bench under a tree, a path leading '
        'away to a town, blue sky with clouds. The grass runs along the bottom edge.'
    ) + ' ' + ZOO_STYLE),
    'dog-park/floor': (ZOO_TILE + (
        'a lush green mown lawn, short grass with a little clover and a few tiny daisies, natural '
        'variation.'
    )),
    'aviary/back': (ZOO_WALL + (
        'the inside of a grand Victorian glasshouse aviary: tall white iron arches and glass panes '
        'rising up, a misty tropical garden of palms, tree ferns, flowering vines and orchids, a '
        'little waterfall over mossy rocks into a pool, perches and swings hanging from the ironwork,'
        ' soft golden light through the glass. A mossy flagstone path at the bottom edge.'
    ) + ' ' + ZOO_STYLE),
    'aviary/left': (ZOO_WALL + (
        'the side of a grand Victorian glasshouse aviary: white iron columns and arched glass panes, '
        'lush tropical plants, bird of paradise flowers, bamboo, hanging baskets of ferns, wooden '
        'birdhouses and perches on the ironwork, dappled golden light. Mossy flagstones and plants at'
        ' the bottom edge.'
    ) + ' ' + ZOO_STYLE),
    'aviary/right': (ZOO_WALL + (
        'the side of a grand Victorian glasshouse aviary: white iron and glass, banana plants and '
        'palms, a little wooden bridge over a stream, nesting boxes, hanging rope perches, flowering '
        'hibiscus, soft misty light. Mossy flagstones and plants at the bottom edge.'
    ) + ' ' + ZOO_STYLE),
    'aviary/front': (ZOO_WALL + (
        'the entrance wall of a grand Victorian glasshouse aviary seen from inside: an arched iron '
        'and glass double door in the middle, hanging bead curtain, potted palms either side, '
        'climbing jasmine on the white ironwork, glass panes above. Mossy flagstones at the bottom '
        'edge.'
    ) + ' ' + ZOO_STYLE),
    'aviary/floor': (ZOO_TILE + (
        'old grey and warm sandstone flagstones with moss and tiny ferns in the joints, a little '
        'damp.'
    )),
    'robot-park/back': (ZOO_WALL + (
        'a cheerful retro-futuristic robot playground park: smooth pastel domes and rounded towers, '
        'curving monorail track on stilts, friendly antenna towers with blinking lights, solar sails,'
        ' round topiary trees, a charging station with glowing plugs, a sleek city of rounded white '
        'towers in the distance, clear blue sky. Rubber play tiles run along the bottom edge.'
    ) + ' ' + ZOO_STYLE + ' No robots.'),
    'robot-park/left': (ZOO_WALL + (
        'the side of a cheerful retro-futuristic robot playground park: a pastel curved wall with '
        'round portholes, a spiral slide in brushed metal, coloured pipes and big gears, a row of '
        'round topiary trees, satellite dishes, glowing round lamps, blue sky. Rubber play tiles run '
        'along the bottom edge.'
    ) + ' ' + ZOO_STYLE + ' No robots.'),
    'robot-park/right': (ZOO_WALL + (
        'the side of a cheerful retro-futuristic robot playground park: a mint and orange climbing '
        'frame of pipes, a test track with stripes and cones, a little control tower with round '
        'windows, solar panels on rounded roofs, lollipop trees, a distant monorail, blue sky with '
        'soft clouds. Rubber play tiles run along the bottom edge.'
    ) + ' ' + ZOO_STYLE + ' No robots.'),
    'robot-park/front': (ZOO_WALL + (
        'the gate side of a cheerful retro-futuristic robot playground park seen from inside: a round'
        ' sliding door in the middle in a pastel curved wall, glowing light strips, a row of charging'
        ' pods either side, rounded planters with topiary, blue sky above. Rubber play tiles run '
        'along the bottom edge.'
    ) + ' ' + ZOO_STYLE + ' No robots.'),
    'robot-park/floor': (ZOO_TILE + (
        'soft rubber playground flooring of hexagonal tiles in mint, pale blue and cream, faint '
        'speckles, rounded edges.'
    )),
}
JOBS.update({n: (prompt, []) for n, prompt in ZOO.items()})

def paint(out, prompt, refs):
    """One picture, by Codex, at `out` (with these pictures to go by). Codex is asked to copy
    it there; if it doesn't, it's in the session's rollout as base64."""
    os.makedirs(os.path.dirname(out), exist_ok=True)
    work = tempfile.mkdtemp(prefix=os.path.basename(out) + '.', dir=os.path.dirname(out))
    start = time.time()
    args = ['codex', 'exec', '--dangerously-bypass-approvals-and-sandbox', '--skip-git-repo-check',
            '-c', 'model_reasoning_effort=low', '-C', work]
    for r in refs:
        args += ['-i', r]
    # (`--` so the last -i doesn't take the prompt for another picture.)
    args += ['--', f'$imagegen {prompt}\n\nWhen the image is generated, copy the PNG file to exactly this path: '
                   f'{out} (overwrite it if it exists). Do not edit, crop or resize it. Then stop.']
    with open(os.path.join(work, 'log.txt'), 'w') as log:
        subprocess.run(args, stdout=log, stderr=subprocess.STDOUT)
    if not (os.path.exists(out) and os.path.getsize(out)):
        rollout(work, start, out)
    ok = os.path.exists(out) and os.path.getsize(out) > 0
    print(f'ok {out} {time.time() - start:.0f}s' if ok else f'FAILED {out} (see {work}/log.txt)', flush=True)


def rollout(work, start, out):
    """The picture from the rollout of the Codex session that ran in `work`."""
    root = os.path.expanduser('~/.codex/sessions')
    for dirpath, _, files in os.walk(root):
        for f in files:
            path = os.path.join(dirpath, f)
            if not f.startswith('rollout-') or os.path.getmtime(path) < start:
                continue
            text = open(path, encoding='utf-8', errors='replace').read()
            if work not in text:
                continue
            blobs = re.findall(r'(?:base64,|"result":")([A-Za-z0-9+/=]{5000,})', text)
            if blobs:
                with open(out, 'wb') as o:
                    o.write(base64.b64decode(max(blobs, key=len)))
                return


def main(out_dir, only):
    done = {n: threading.Event() for n in JOBS}

    def run(name):
        prompt, refs = JOBS[name]
        for r in refs:
            done[r].wait()
        out = os.path.join(out_dir, f'{name}.png')
        if not os.path.exists(out):
            paint(out, prompt, [os.path.join(out_dir, f'{r}.png') for r in refs])
        done[name].set()

    names = [n for n in JOBS if not only or any(n.startswith(o) for o in only)]
    # (And what they go by, all the way back.)
    for n in names:
        names += [r for r in JOBS[n][1] if r not in names]
    # Those that wait go last, so waiting never holds a worker for long.
    names.sort(key=lambda n: len(JOBS[n][1]))
    with cf.ThreadPoolExecutor(6) as ex:
        list(ex.map(run, names))


if __name__ == '__main__':
    main(os.path.abspath(sys.argv[1]), sys.argv[2:])
