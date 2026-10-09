// The lobby's two: the about wall (a portrait of sorts and a panel of words) and the front
// desk, where you get in touch.
import { BoxGeometry, Group, Mesh } from 'three';
import { FOOTPRINTS } from '../../plan/footprints';
import { painting } from '../../museum/art';
import { canvas, SANS, SERIF, texture, wrap } from '../../museum/text';
import { framed, picture } from '../parts';
import type { ExhibitTemplate } from '../types';
import { still } from './pictures';

/** A panel of words on the wall: a heading and a paragraph, `w` x `h` metres. */
function panel(title: string, kicker: string, body: string, w: number, h: number, paper: string, ink: string) {
  const k = 400;
  const { c, g } = canvas(w * k, h * k);
  g.fillStyle = paper;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = ink;
  g.textBaseline = 'top';
  const pad = 0.16 * k;
  let y = pad;
  g.globalAlpha = 0.6;
  g.font = `600 ${0.06 * k}px ${SANS}`;
  g.fillText(kicker.toUpperCase(), pad, y);
  g.globalAlpha = 1;
  y += 0.13 * k;
  g.font = `400 ${0.2 * k}px ${SERIF}`;
  for (const line of wrap(g, title, c.width - 2 * pad, 2)) {
    g.fillText(line, pad, y);
    y += 0.22 * k;
  }
  y += 0.06 * k;
  g.font = `400 ${0.075 * k}px ${SERIF}`;
  g.globalAlpha = 0.85;
  const room = Math.floor((c.height - y - pad) / (0.105 * k));
  for (const line of wrap(g, body, c.width - 2 * pad, room)) {
    g.fillText(line, pad, y);
    y += 0.105 * k;
  }
  return texture(c);
}

export const aboutWall: ExhibitTemplate = {
  id: 'about-wall',
  footprint: FOOTPRINTS['about-wall'],
  async build(ctx, hung) {
    const e = hung.entries[0] ?? null;
    const { paper, ink } = ctx.materials.palette;
    const group = new Group();
    // The portrait: the page's picture if it has one, else a painting of its own.
    const pw = 1.05;
    const ph = 1.4;
    const portrait = new Group();
    portrait.add(framed(ctx, pw, ph));
    const tex = e?.image ? await ctx.image(e.image.src) : painting(hung.seed, pw / ph, ctx.look);
    const pic = picture(tex, pw, ph);
    pic.position.z = 0.03;
    portrait.add(pic);
    portrait.position.x = -hung.slot.width / 2 + pw / 2 + 0.15;
    group.add(portrait);
    // The words, on a board.
    const bw = hung.slot.width - pw - 0.55;
    const bh = hung.slot.height - 0.3;
    const board = new Mesh(new BoxGeometry(bw + 0.08, bh + 0.08, 0.05), ctx.materials.role('Trim'));
    board.position.set(hung.slot.width / 2 - bw / 2 - 0.1, 0, 0.025);
    board.castShadow = true;
    group.add(board);
    const words = picture(panel(e?.title ?? 'About', e?.kicker ?? '', e?.summary ?? '', bw, bh, paper, ink), bw, bh);
    words.position.set(board.position.x, 0, 0.052);
    group.add(words);
    return { object: group, picks: [group] };
  },
};

export const frontDesk: ExhibitTemplate = {
  id: 'front-desk',
  footprint: FOOTPRINTS['front-desk'],
  async build(ctx, hung) {
    const e = hung.entries[0] ?? null;
    const group = ctx.kit.mesh('desk', ctx.materials);
    const group2 = new Group();
    group2.add(group);
    // A card standing on the desk, turned up toward whoever's come in.
    const card = ctx.label(e, 0.62, 0.4, { foot: 'Write ↵' });
    card.position.set(0.1, 1.32, 0.1);
    card.rotation.x = -0.35;
    group2.add(card);
    // The front panel: what it is.
    const front = picture(await still(ctx, e, 1.9, 0.5, ctx.materials.palette.roles.Velvet), 1.9, 0.5);
    front.position.set(0, 0.55, 0.47);
    group2.add(front);
    return { object: group2, picks: [group2] };
  },
};
