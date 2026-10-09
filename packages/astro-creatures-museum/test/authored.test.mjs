// A building of the site's own (src/plan/authored.ts), read from the starter's sample
// (blender/buildings/template.py, built by `npm run building`).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { authored, readGlb } from '../src/plan/authored.ts';
import { Grid } from '../src/nav/grid.ts';

const gltf = readGlb(
  readFileSync(new URL('../../../starter/public/museum/building.glb', import.meta.url)),
);
const page = (key, template = 'framed-picture') => ({
  key,
  collection: key.split('/')[0],
  title: key,
  summary: '',
  href: `/${key}`,
  inside: true,
  kicker: '',
  template,
  size: 'm',
  room: false,
  image: null,
  video: null,
  film: null,
  gallery: [],
  model: null,
  date: null,
});
const read = (works = 4) =>
  authored({
    title: 'Lorem',
    building: '/museum/building.glb',
    gltf,
    wings: [
      {
        path: '/projects',
        label: 'Works',
        entries: Array.from({ length: works }, (_, i) => page(`projects/${i}`)),
      },
      { path: '/blog', label: 'Library', entries: [page('blog/a', 'bookshelf')] },
    ],
    about: page('pages/about', 'about-wall'),
    contact: page('pages/contact', 'front-desk'),
    filler: { density: 0.6, seed: 'lorem' },
  });

test('the sample building reads without a problem', () => {
  const { plan, report } = read();
  assert.deepEqual(report.problems, []);
  assert.equal(plan.building, '/museum/building.glb');
  // Blender's y is the file's -z: the Works' gallery, north of the lobby, is at -z.
  const works = plan.rooms.find((r) => r.id === 'works');
  assert.deepEqual(
    [works.min, works.max],
    [
      [-4, -20],
      [4, -4],
    ],
  );
  assert.equal(plan.rooms.find((r) => r.id === 'lobby').kind, 'lobby');
  assert.equal(plan.walls.length, 12);
  for (const w of plan.walls)
    assert.ok(Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) > 1.5, 'a wall is its long side');
});

test("pages go to their wings' slots, the rest is art", () => {
  const { plan, report } = read(2);
  const hungKeys = plan.hung.flatMap((h) => h.entries.map((e) => e.key));
  assert.deepEqual(
    hungKeys.filter((k) => k.startsWith('projects/')),
    ['projects/0', 'projects/1'],
  );
  assert.ok(hungKeys.includes('pages/about') && hungKeys.includes('pages/contact'));
  // Six slots for Works and two pages: four more get art, and it says so.
  assert.ok(report.notes.some((n) => /Works wing has nothing left/.test(n)));
  // Too many pages: it says they have nowhere to go.
  assert.ok(read(9).report.notes.some((n) => /3 of the Works wing's pages have nowhere/.test(n)));
});

test('every slot faces into its room and can be walked to', () => {
  const { plan } = read();
  const grid = new Grid(plan);
  const from = [plan.spawn.at[0], plan.spawn.at[2]];
  for (const h of plan.hung) {
    const room = plan.rooms.find((r) => r.id === h.slot.room);
    const [x, , z] = h.view.at;
    assert.ok(
      x > room.min[0] && x < room.max[0] && z > room.min[1] && z < room.max[1],
      `${h.slot.id} faces out of ${room.id}`,
    );
    assert.ok(grid.path(from, [x, z]).length >= 2, `no way to ${h.slot.id}`);
  }
});

test("the crew's lanes lie on the floors, linked through the doorways", () => {
  const { plan } = read();
  assert.equal(plan.lanes.length, 3);
  for (const l of plan.lanes) {
    const room = plan.rooms.find((r) => r.id === l.room);
    const back = [l.along[1], -l.along[0]];
    for (const s of [0, l.length])
      for (const d of [0, l.width]) {
        const x = l.at[0] + l.along[0] * s + back[0] * d;
        const z = l.at[1] + l.along[1] * s + back[1] * d;
        assert.ok(
          x >= room.min[0] - 1e-6 &&
            x <= room.max[0] + 1e-6 &&
            z >= room.min[1] - 1e-6 &&
            z <= room.max[1] + 1e-6,
          `${l.id} leaves ${room.id}`,
        );
      }
  }
  assert.deepEqual(plan.links.map((k) => `${k.a.lane}:${k.a.end}-${k.b.lane}:${k.b.end}`).sort(), [
    'lobby:end-library:start',
    'lobby:start-works:end',
  ]);
});
