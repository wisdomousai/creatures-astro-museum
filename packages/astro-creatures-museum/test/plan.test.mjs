// The museum's plan and the way round it: `npm test` (Node 22.18+, which reads the .ts).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generate } from '../src/plan/generate.ts';
import { Grid, collide } from '../src/nav/grid.ts';

/** n made-up pages for a collection, in its wing's way. */
const entries = (collection, n, template = 'framed-picture', extra = {}) =>
  Array.from({ length: n }, (_, i) => ({
    key: `${collection}/${i}`,
    collection,
    title: `${collection} ${i}`,
    summary: '',
    href: `/${collection}/${i}`,
    inside: true,
    kicker: '',
    template,
    size: ['s', 'm', 'l'][i % 3],
    room: false,
    image: i % 2 ? { src: '/a.webp', width: 1600, height: 900 } : null,
    video: null,
    gallery: [],
    model: null,
    date: null,
    ...extra,
  }));

const input = (works = 12, posts = 15) => ({
  title: 'Lorem',
  wings: [
    // Every fifth work has a room of its own, hung with its gallery.
    {
      path: '/projects',
      label: 'Works',
      entries: entries('projects', works).map((e, i) =>
        i % 5 === 2 ? { ...e, room: true, gallery: [{ src: '/g.webp', width: 900, height: 1200 }] } : e,
      ),
    },
    { path: '/blog', label: 'Library', entries: entries('blog', posts, 'bookshelf') },
  ],
  about: entries('about', 1, 'about-wall')[0],
  contact: entries('contact', 1, 'front-desk')[0],
  filler: { density: 0.6, seed: 'museum' },
});

test('the same content makes the same museum', () => {
  assert.equal(JSON.stringify(generate(input())), JSON.stringify(generate(input())));
});

test('every page is hung, once', () => {
  const plan = generate(input());
  // (A room of its own's gallery hangs as plates of the page: key#1...)
  const keys = plan.hung.flatMap((h) => h.entries.map((e) => e.key)).filter((k) => !k.includes('#'));
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(keys.length, 12 + 15 + 2);
  // Fifteen posts go on shelves of nine: two shelves.
  assert.equal(plan.hung.filter((h) => h.template === 'bookshelf').length, 2);
});

test('no two rooms overlap', () => {
  const plan = generate({
    ...input(40, 40),
    wings: [
      { path: '/a', label: 'A', entries: entries('a', 40).map((e, i) => ({ ...e, room: i % 3 === 0 })) },
      { path: '/b', label: 'B', entries: entries('b', 40).map((e, i) => ({ ...e, room: i % 4 === 1 })) },
      { path: '/c', label: 'C', entries: entries('c', 40, 'plinth-object') },
      { path: '/d', label: 'D', entries: entries('d', 10) },
    ],
  });
  for (const [i, a] of plan.rooms.entries())
    for (const b of plan.rooms.slice(i + 1)) {
      const overlap =
        Math.min(a.max[0], b.max[0]) - Math.max(a.min[0], b.min[0]) > 1e-6 &&
        Math.min(a.max[1], b.max[1]) - Math.max(a.min[1], b.min[1]) > 1e-6;
      assert.ok(!overlap, `${a.id} overlaps ${b.id}`);
    }
});

test('everything hung is on a wall of its room, inside it', () => {
  const plan = generate(input(30, 20));
  for (const h of plan.hung) {
    const room = plan.rooms.find((r) => r.id === h.slot.room);
    const [x, , z] = h.slot.at;
    assert.ok(x >= room.min[0] - 0.2 && x <= room.max[0] + 0.2, h.slot.id);
    assert.ok(z >= room.min[1] - 0.2 && z <= room.max[1] + 0.2, h.slot.id);
    if (h.slot.mount === 'floor') continue;
    assert.ok(h.slot.at[1] - h.slot.height / 2 >= -1e-6, `${h.slot.id} is in the floor`);
    assert.ok(h.slot.at[1] + h.slot.height / 2 <= plan.height, `${h.slot.id} is through the ceiling`);
  }
});

test('every exhibit can be walked to from the way in', () => {
  const plan = generate(input(40, 30));
  const grid = new Grid(plan);
  const from = [plan.spawn.at[0], plan.spawn.at[2]];
  for (const h of plan.hung) {
    const to = [h.view.at[0], h.view.at[2]];
    const path = grid.path(from, to);
    assert.ok(path.length >= 2, `no way to ${h.slot.id}`);
    for (let k = 1; k < path.length; k++)
      assert.ok(grid.isClear(path[k - 1], path[k]), `the way to ${h.slot.id} goes through something`);
  }
});

test('there is no way to a place outside the museum', () => {
  const grid = new Grid(generate(input()));
  assert.deepEqual(grid.path([0, 4], [0, 40]).length > 0 ? 'found' : 'none', 'none');
});

test('walking into a wall stops at it', () => {
  const plan = generate(input());
  // The lobby's east wall (a doorway in its middle, at z = 0).
  const e = plan.rooms.find((r) => r.id === 'lobby').max[0];
  const [x] = collide(plan, [e - 0.6, 3], [e + 0.1, 3]);
  assert.ok(x < e - 0.12 - 0.3, `went into the wall: ${x}`);
  // ...but through the doorway is fine.
  const [x2] = collide(plan, [e - 0.4, 0], [e, 0]);
  assert.ok(Math.abs(x2 - e) < 1e-9);
  // And a bench is walked round, not through.
  const b = plan.blocks[plan.blocks.length - 1];
  const mid = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2];
  const [bx, bz] = collide(plan, [mid[0], b.min[1] - 0.6], mid);
  assert.ok(!(bx > b.min[0] && bx < b.max[0] && bz > b.min[1] && bz < b.max[1]), 'went into a bench');
});

test('nothing hangs over a post (where walls meet)', () => {
  const plan = generate(input());
  // Every wall's ends are posts, 0.52 m across.
  const posts = plan.walls.flatMap((w) => [w.a, w.b]);
  for (const h of plan.hung) {
    if (h.slot.mount !== 'wall') continue;
    // Along the wall the slot is on: its own right, seen from the room.
    const along = [Math.cos(h.slot.yaw), -Math.sin(h.slot.yaw)];
    const normal = [Math.sin(h.slot.yaw), Math.cos(h.slot.yaw)];
    for (const p of posts) {
      const dx = p[0] - h.slot.at[0];
      const dz = p[1] - h.slot.at[2];
      const off = Math.abs(dx * normal[0] + dz * normal[1]);
      if (off > 0.4) continue;
      const t = Math.abs(dx * along[0] + dz * along[1]);
      assert.ok(t > h.slot.width / 2 + 0.26, `${h.slot.id} hangs over the post at ${p}`);
    }
  }
});

test('lanes lie inside their rooms, and links join lane ends once each', () => {
  const plan = generate(input());
  const ids = new Set(plan.lanes.map((l) => l.id));
  for (const l of plan.lanes) {
    const room = plan.rooms.find((r) => r.id === l.room);
    // The front edge's ends and the back's: the floor goes back toward [z, -x] of along.
    const back = [l.along[1], -l.along[0]];
    for (const s of [0, l.length])
      for (const d of [0, l.width]) {
        const x = l.at[0] + l.along[0] * s + back[0] * d;
        const z = l.at[1] + l.along[1] * s + back[1] * d;
        assert.ok(x > room.min[0] && x < room.max[0] && z > room.min[1] && z < room.max[1], `${l.id} leaves ${room.id}`);
      }
  }
  const ends = new Set();
  for (const k of plan.links)
    for (const e of [k.a, k.b]) {
      assert.ok(ids.has(e.lane), `no lane ${e.lane}`);
      const key = `${e.lane}:${e.end}`;
      assert.ok(!ends.has(key), `${key} linked twice`);
      ends.add(key);
    }
  assert.ok(plan.links.length > 0);
});

test('a room of its own is off its hall, through a doorway, with the piece inside', () => {
  const plan = generate(input(40, 10));
  const alcoves = plan.rooms.filter((r) => r.kind === 'alcove');
  assert.equal(alcoves.length, 8);
  for (const a of alcoves) {
    const door = plan.doors.find((d) => d.rooms[1] === a.id);
    assert.ok(door, `no way into ${a.id}`);
    assert.ok(plan.rooms.find((r) => r.id === door.rooms[0])?.kind === 'hall');
    const main = plan.hung.find((h) => h.slot.id === `${a.id}-main`);
    assert.equal(main.entries.length, 1);
    assert.equal(main.entries[0].title, a.title);
    // Its plate, and art on the other side.
    assert.equal(plan.hung.filter((h) => h.slot.room === a.id).length, 3);
  }
});
