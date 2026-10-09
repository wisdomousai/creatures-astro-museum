// A bookcase of pages: a post a book, its title down the spine, among books with nothing
// in them to fill the shelves. Point at one and it comes forward a little.
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { FOOTPRINTS } from '../../plan/footprints';
import { pick, rng } from '../../plan/rng';
import { canvas, SERIF, texture, wrap } from '../../museum/text';
import type { ExhibitTemplate } from '../types';

/** Where the shelves' tops are (the books stand on them), and the room above each. */
const SHELVES = [0.14, 0.58, 1.02, 1.46, 1.9];
const ROOM = 0.38;
const INSIDE = 1.62;

const CLOTH = ['#7b2d26', '#1f4e5f', '#2f5d3a', '#c9973b', '#3b3355', '#8a5a2b', '#a33d4a', '#235a73', '#5b6b2f'];

function spine(title: string, w: number, h: number, cloth: string, ink: string) {
  const k = 900;
  const { c, g } = canvas(w * k, h * k);
  g.fillStyle = cloth;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = ink;
  g.fillRect(0, c.height * 0.06, c.width, c.height * 0.012);
  g.fillRect(0, c.height * 0.93, c.width, c.height * 0.012);
  g.save();
  g.translate(c.width / 2, c.height * 0.5);
  g.rotate(-Math.PI / 2);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const size = c.width * 0.42;
  g.font = `400 ${size}px ${SERIF}`;
  const [line] = wrap(g, title, c.height * 0.8, 1);
  g.fillText(line, 0, 0);
  g.restore();
  return texture(c);
}

export const bookshelf: ExhibitTemplate = {
  id: 'bookshelf',
  footprint: FOOTPRINTS.bookshelf,
  build(ctx, hung) {
    const r = rng(hung.seed);
    const group = new Group();
    const shelf = ctx.kit.mesh('bookshelf', ctx.materials);
    // The bookcase stands on the floor, its back to the wall.
    const bottom = -hung.slot.height / 2;
    shelf.position.set(0, bottom, 0.2);
    group.add(shelf);
    const plain = CLOTH.map((c) => new MeshStandardMaterial({ color: c, roughness: 0.85 }));
    const picks: Mesh[] = [];
    const books: { mesh: Mesh; out: number }[] = [];
    // Which places on which shelves get a post: spread out, top shelves first.
    const entries = [...hung.entries];
    const perShelf = Math.ceil(entries.length / (SHELVES.length - 1));
    SHELVES.forEach((y0, s) => {
      let x = -INSIDE / 2;
      const mine = s === 0 ? [] : entries.splice(0, perShelf);
      const slots = new Set<number>();
      // The posts go in among about a dozen books, evenly.
      const count = 13 + Math.floor(r() * 4);
      mine.forEach((_, i) => slots.add(Math.floor(((i + 0.5) / mine.length) * count)));
      let k = 0;
      for (let i = 0; i < count && x < INSIDE / 2 - 0.05; i++) {
        const post = slots.has(i) ? mine[k++] : undefined;
        const w = post ? 0.09 : 0.04 + r() * 0.05;
        const h = post ? ROOM * 0.86 : ROOM * (0.62 + r() * 0.28);
        if (x + w > INSIDE / 2) break;
        const cloth = pick(CLOTH, r());
        const geo = new BoxGeometry(w, h, 0.27);
        let mesh: Mesh;
        if (post) {
          const face = new MeshStandardMaterial({ map: spine(post.title, w, h, cloth, '#f4ead2'), roughness: 0.7 });
          const side = new MeshStandardMaterial({ color: cloth, roughness: 0.85 });
          const pages = new MeshStandardMaterial({ color: '#efe6cf', roughness: 0.95 });
          mesh = new Mesh(geo, [pages, pages, pages, pages, face, side]);
          mesh.userData.entry = post;
          picks.push(mesh);
        } else {
          mesh = new Mesh(geo, pick(plain, r()));
          // Now and then one leans.
          if (r() < 0.08 && i > 0) mesh.rotation.z = -0.12;
        }
        mesh.position.set(x + w / 2, bottom + y0 + h / 2 + 0.005, 0.2 - 0.04);
        mesh.castShadow = mesh.receiveShadow = true;
        group.add(mesh);
        if (post) books.push({ mesh, out: 0 });
        x += w + 0.004;
      }
    });
    return {
      object: group,
      picks: picks.length ? picks : [shelf],
      update(dt) {
        for (const b of books) {
          const want = b.mesh.userData.hovered ? 0.08 : 0;
          b.out += (want - b.out) * Math.min(1, dt * 10);
          b.mesh.position.z = 0.16 + b.out;
        }
      },
    };
  },
};
