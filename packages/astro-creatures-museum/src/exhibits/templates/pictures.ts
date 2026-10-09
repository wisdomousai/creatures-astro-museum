// Things on the wall: a framed picture (its video playing in the frame while you're in
// front of it), a triptych, a video wall, a plaque.
import { BoxGeometry, Group, Mesh, type Texture } from 'three';
import { FOOTPRINTS, MOULDING } from '../../plan/footprints';
import type { Entry, Hung } from '../../plan/types';
import { titleCard } from '../../museum/text';
import { framed, picture } from '../parts';
import type { Built, Ctx, ExhibitTemplate } from '../types';

/** The picture for an entry: its own, or a card with its title set on it. */
export async function still(ctx: Ctx, e: Entry | null, w: number, h: number, accent: string): Promise<Texture> {
  if (e?.image) return ctx.image(e.image.src);
  const { paper, ink } = ctx.materials.palette;
  return titleCard(
    { kicker: e?.kicker || e?.collection, title: e?.title ?? '', summary: e?.summary },
    w / h,
    paper,
    ink,
    accent,
  );
}

/** A label to the right of something `w` wide whose middle is `y` up from the floor:
 * its top at about the eye's height, as in a gallery. */
function sideLabel(
  ctx: Ctx,
  e: Entry | null,
  w: number,
  y: number,
  extra?: { title?: string; kicker?: string; foot?: string },
) {
  const card = ctx.label(e, 0.46, 0.3, extra);
  card.position.set(w / 2 + 0.36, 1.32 - y, 0.01);
  return card;
}

const accentOf = (ctx: Ctx) => ctx.materials.palette.roles.Velvet;

export const framedPicture: ExhibitTemplate = {
  id: 'framed-picture',
  footprint: FOOTPRINTS['framed-picture'],
  async build(ctx, hung) {
    const e = hung.entries[0] ?? null;
    const w = hung.slot.width - 2 * MOULDING;
    const h = hung.slot.height - 2 * MOULDING;
    const group = new Group();
    group.add(framed(ctx, w, h));
    const pic = picture(await still(ctx, e, w, h, accentOf(ctx)), w, h);
    pic.position.z = 0.03;
    group.add(pic);
    if (e?.video) ctx.video(e.video, pic.material, pic);
    group.add(sideLabel(ctx, e, w + 2 * MOULDING, hung.slot.at[1], { foot: e?.inside ? 'Step in ↵' : undefined }));
    return { object: group, picks: [group] };
  },
};

export const triptych: ExhibitTemplate = {
  id: 'triptych',
  footprint: FOOTPRINTS.triptych,
  async build(ctx, hung) {
    const e = hung.entries[0] ?? null;
    const h = hung.slot.height - 0.6;
    const pw = h * 0.75;
    const gap = 0.15;
    const group = new Group();
    const images = e?.gallery.length ? e.gallery : e?.image ? [e.image] : [];
    for (let i = 0; i < 3; i++) {
      const panel = new Group();
      panel.add(framed(ctx, pw, h, i === 1));
      const src = images[i % Math.max(1, images.length)];
      const tex = src ? await ctx.image(src.src) : await still(ctx, e, pw, h, accentOf(ctx));
      const pic = picture(tex, pw, h);
      // One picture across all three: each panel shows its third.
      if (images.length < 2 && src) {
        const t = tex.clone();
        t.repeat.set(1 / 3, 1);
        t.offset.set(i / 3, 0);
        t.needsUpdate = true;
        pic.material.map = t;
      }
      pic.position.z = 0.03;
      panel.add(pic);
      panel.position.x = (i - 1) * (pw + gap + 2 * MOULDING);
      group.add(panel);
    }
    group.add(sideLabel(ctx, e, hung.slot.width, hung.slot.at[1]));
    return { object: group, picks: [group] };
  },
};

export const videoWall: ExhibitTemplate = {
  id: 'video-wall',
  footprint: FOOTPRINTS['video-wall'],
  async build(ctx, hung) {
    const e = hung.entries[0] ?? null;
    const w = hung.slot.width - 0.3;
    const h = hung.slot.height - 0.3;
    const group = new Group();
    const bezel = new Mesh(new BoxGeometry(w + 0.24, h + 0.24, 0.14), ctx.materials.role('Trim'));
    bezel.position.z = 0.07;
    bezel.castShadow = true;
    group.add(bezel);
    const screen = picture(await still(ctx, e, w, h, accentOf(ctx)), w, h);
    screen.position.z = 0.145;
    group.add(screen);
    if (e?.video) ctx.video(e.video, screen.material, screen);
    group.add(sideLabel(ctx, e, hung.slot.width, hung.slot.at[1]));
    return { object: group, picks: [group] };
  },
};

export const plaque: ExhibitTemplate = {
  id: 'plaque',
  footprint: FOOTPRINTS.plaque,
  build(ctx, hung): Built {
    const e = hung.entries[0] ?? null;
    const group = new Group();
    const board = new Mesh(new BoxGeometry(hung.slot.width, hung.slot.height, 0.05), ctx.materials.role('Brass'));
    board.position.z = 0.025;
    group.add(board);
    const card = ctx.label(e, hung.slot.width - 0.1, hung.slot.height - 0.1);
    card.position.z = 0.052;
    group.add(card);
    return { object: group, picks: [group] };
  },
};

export type { Hung };
