// An arcade cabinet: an upright machine against the wall (the kit's arcade_cabinet) with a
// game on its screen and the game's name lit in its marquee. Nobody at it, the game plays
// itself (the attract mode) while the visitor's near enough to see, and stands still when
// they're not. Click it and the visitor goes up to it and plays (boot.ts).
import {
  CanvasTexture,
  Group,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from 'three';
import { GAMES } from '../../arcade/games';
import { COLOURS, text } from '../../arcade/screen';
import { SCREEN, type Game } from '../../arcade/types';
import { FOOTPRINTS } from '../../plan/footprints';
import { canvas } from '../../museum/text';
import type { ExhibitTemplate } from '../types';

// Where the kit's cabinet (blender/pieces.py, arcade_cabinet) has its screen and its
// marquee's face, in its own space (y up, +z out of its front, its middle at the floor).
const BACK = 0.4;
const SCREEN_AT = { y: 1.33, z: 0.2385 };
const SCREEN_SIZE = { w: 0.405, h: 0.54 };
const LEAN = (12.2 * Math.PI) / 180;
const MARQUEE = { y: 1.735, z: 0.335, w: 0.65, h: 0.17 };
/** The screen is redrawn this often at most while nobody is playing (s). */
const IDLE = 1 / 30;

/** A texture from a canvas that's drawn on again: crisp, with no mipmaps to make. */
function live(c: HTMLCanvasElement): CanvasTexture {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.minFilter = t.magFilter = LinearFilter;
  t.generateMipmaps = false;
  return t;
}

export const arcadeCabinet: ExhibitTemplate = {
  id: 'arcade-cabinet',
  footprint: FOOTPRINTS['arcade-cabinet'],
  build(ctx, hung) {
    const maker = GAMES.get(hung.game ?? '');
    const colours = COLOURS[ctx.look];
    const cabinet = new Group();
    // It stands on the floor, its back to the wall.
    cabinet.position.set(0, -hung.slot.height / 2, BACK);
    cabinet.add(ctx.kit.mesh('arcade_cabinet', ctx.materials));

    // The marquee: the name, lit, with a stripe of the screen's colours under it.
    const m = canvas(1040, 272);
    m.g.fillStyle = colours.bg;
    m.g.fillRect(0, 0, 1040, 272);
    colours.pick.slice(0, 5).forEach((c, i) => {
      m.g.fillStyle = c;
      m.g.fillRect(i * 208, 244, 208, 28);
    });
    if (ctx.look === 'colour') {
      m.g.shadowColor = colours.pick[(hung.seed >>> 3) % colours.pick.length];
      m.g.shadowBlur = 36;
    }
    text(m.g, maker?.title ?? 'OUT OF ORDER', 520, 124, maker && maker.title.length > 7 ? 130 : 160, colours.fg);
    const marquee = new Mesh(
      new PlaneGeometry(MARQUEE.w, MARQUEE.h),
      new MeshBasicMaterial({ map: live(m.c), toneMapped: false }),
    );
    marquee.position.set(0, MARQUEE.y, MARQUEE.z);
    cabinet.add(marquee);

    // The screen: the game drawn at twice its size, in the bay (leaning back).
    const s = canvas(SCREEN.width * 2, SCREEN.height * 2);
    s.g.setTransform(2, 0, 0, 2, 0, 0);
    s.g.imageSmoothingEnabled = false;
    const map = live(s.c);
    const screen = new Mesh(
      new PlaneGeometry(SCREEN_SIZE.w, SCREEN_SIZE.h),
      new MeshBasicMaterial({ map, toneMapped: false }),
    );
    screen.rotation.x = -LEAN;
    // (A hair out of the bay's face along its normal, so it doesn't flicker with it.)
    screen.position.set(0, SCREEN_AT.y + Math.sin(LEAN) * 0.003, SCREEN_AT.z + Math.cos(LEAN) * 0.003);
    cabinet.add(screen);

    const group = new Group();
    group.add(cabinet);
    if (!maker) {
      s.g.fillStyle = colours.bg;
      s.g.fillRect(0, 0, SCREEN.width, SCREEN.height);
      text(s.g, 'OUT OF', SCREEN.width / 2, 140, 24, colours.fg);
      text(s.g, 'ORDER', SCREEN.width / 2, 176, 24, colours.fg);
      map.needsUpdate = true;
      return { object: group, picks: [cabinet] };
    }

    const game: Game = maker.make(colours, ctx.look);
    let playing = false;
    let since = 0;
    const draw = () => {
      game.draw(s.g);
      map.needsUpdate = true;
      since = 0;
    };
    draw();
    return {
      object: group,
      picks: [cabinet],
      update(dt, near) {
        // Far off, nothing; near, it plays itself, drawn thirty times a second at most (every
        // frame while someone's playing).
        if (!playing && near <= 0) return;
        game.update(dt, playing);
        since += dt;
        if (playing || since >= IDLE) draw();
      },
      play: {
        title: maker.title,
        keys: maker.keys,
        screen,
        start() {
          playing = true;
          game.start();
          draw();
        },
        stop() {
          playing = false;
          game.stop();
          draw();
        },
        pad: (button, down) => game.pad(button, down),
      },
    };
  },
};
