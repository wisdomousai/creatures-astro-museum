// Things on plinths and the museum's own art: an entry's model on a plinth (or its picture
// on a stand, with none), a generated painting, a generated sculpture.
import { Box3, Group, Mesh, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { FOOTPRINTS, MOULDING } from '../../plan/footprints';
import { pick, rng } from '../../plan/rng';
import { painting, sculpture } from '../../museum/art';
import { place } from '../../museum/kit';
import { assemble, framed, picture } from '../parts';
import type { Ctx, ExhibitTemplate } from '../types';
import { still } from './pictures';

const PLINTH = 0.9;

/** A plinth `w` across, its top at `h`. */
function plinth(ctx: Ctx, w: number, h = PLINTH) {
  return assemble(ctx, [{ piece: 'plinth', at: place(0, 0, 0, 0, w, h / PLINTH, w) }]);
}

/** Scaled to fit in a `size` box, standing on y = 0. */
function fit(object: Group, size: number) {
  const box = new Box3().setFromObject(object);
  const s = box.getSize(new Vector3());
  const k = size / Math.max(s.x, s.y, s.z);
  object.scale.setScalar(k);
  const c = box.getCenter(new Vector3());
  object.position.set(-c.x * k, -box.min.y * k, -c.z * k);
  const holder = new Group();
  holder.add(object);
  return holder;
}

export const plinthObject: ExhibitTemplate = {
  id: 'plinth-object',
  footprint: FOOTPRINTS['plinth-object'],
  async build(ctx, hung) {
    const e = hung.entries[0] ?? null;
    const w = hung.slot.width * 0.82;
    const group = new Group();
    group.add(plinth(ctx, w));
    let thing: Group;
    if (e?.model) {
      const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
      const gltf = await loader.loadAsync(e.model);
      gltf.scene.traverse((o) => {
        if ((o as Mesh).isMesh) o.castShadow = o.receiveShadow = true;
      });
      thing = fit(gltf.scene, w * 0.85);
    } else if (e) {
      // No model: its picture, framed on a little easel-like stand.
      const pw = w * 0.9;
      const ph = e.image ? (pw * e.image.height) / e.image.width : pw * 0.75;
      thing = new Group();
      const f = framed(ctx, pw, ph, false);
      const pic = picture(await still(ctx, e, pw, ph, ctx.materials.palette.roles.Velvet), pw, ph);
      pic.position.z = 0.03;
      f.add(pic);
      f.position.y = ph / 2 + MOULDING + 0.04;
      f.rotation.x = -0.12;
      thing.add(f);
    } else thing = sculpture(hung.seed, ctx.look);
    thing.position.y += PLINTH;
    group.add(thing);
    const card = ctx.label(e, 0.42, 0.26, { foot: e?.inside ? 'Step in ↵' : undefined });
    card.position.set(0, 0.62, w / 2 + 0.045);
    group.add(card);
    let t = 0;
    return {
      object: group,
      picks: [group],
      update(dt, near) {
        // Turning slowly on its plinth while someone's looking.
        t += dt * (0.15 + near * 0.35);
        thing.rotation.y = e?.model ? t : 0;
      },
    };
  },
};

const NAMES = {
  start: ['Study', 'Composition', 'Untitled', 'Interior', 'Figure', 'Variation', 'Landscape', 'Nocturne', 'Arrangement'],
  in: ['in Teal', 'in Ochre', 'with Circle', 'No. 3', 'No. 7', 'No. 12', 'for a Robot', 'at Noon', 'in Two Parts', 'with Window', 'after Rain'],
  makers: ['B. Olt', 'Hoot', 'Pixel', 'Earl Grey', 'Dibble & Chip', 'The Corgi', 'Anonymous', 'Lag', 'Link'],
};

/** A title, a maker and a year for a piece of the museum's own. */
function provenance(seed: number) {
  const r = rng(seed ^ 0x9e3779b9);
  return {
    title: `${pick(NAMES.start, r())} ${pick(NAMES.in, r())}`,
    kicker: `${pick(NAMES.makers, r())}, ${1960 + Math.floor(r() * 66)}`,
  };
}

export const fillerPainting: ExhibitTemplate = {
  id: 'filler-painting',
  footprint: FOOTPRINTS['filler-painting'],
  build(ctx, hung) {
    const w = hung.slot.width - 2 * MOULDING;
    const h = hung.slot.height - 2 * MOULDING;
    const group = new Group();
    group.add(framed(ctx, w, h));
    const pic = picture(painting(hung.seed, w / h, ctx.look), w, h);
    pic.position.z = 0.03;
    group.add(pic);
    const card = ctx.label(null, 0.4, 0.22, provenance(hung.seed));
    card.position.set(hung.slot.width / 2 + 0.3, 1.32 - hung.slot.at[1], 0.01);
    group.add(card);
    return { object: group, picks: [] };
  },
};

export const fillerSculpture: ExhibitTemplate = {
  id: 'filler-sculpture',
  footprint: FOOTPRINTS['filler-sculpture'],
  build(ctx, hung) {
    const w = hung.slot.width * 0.8;
    const group = new Group();
    group.add(plinth(ctx, w, 0.8));
    const s = sculpture(hung.seed, ctx.look);
    s.position.y = 0.8;
    group.add(s);
    const card = ctx.label(null, 0.36, 0.2, provenance(hung.seed));
    card.position.set(0, 0.55, w / 2 + 0.045);
    group.add(card);
    return { object: group, picks: [] };
  },
};
