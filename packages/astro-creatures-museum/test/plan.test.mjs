// The museum's plan and the way round it: `npm test` (Node 22.18+, which reads the .ts).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { generate } from '../src/plan/generate.ts';
import { Grid, collide } from '../src/nav/grid.ts';
import { Sight } from '../src/nav/sight.ts';

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
        i % 5 === 2
          ? { ...e, room: true, gallery: [{ src: '/g.webp', width: 900, height: 1200 }] }
          : e,
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
  const keys = plan.hung
    .flatMap((h) => h.entries.map((e) => e.key))
    .filter((k) => !k.includes('#'));
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(keys.length, 12 + 15 + 2);
  // Fifteen posts go on shelves of nine: two shelves.
  assert.equal(plan.hung.filter((h) => h.template === 'bookshelf').length, 2);
});

test('no two rooms overlap', () => {
  const plan = generate({
    ...input(40, 40),
    wings: [
      {
        path: '/a',
        label: 'A',
        entries: entries('a', 40).map((e, i) => ({ ...e, room: i % 3 === 0 })),
      },
      {
        path: '/b',
        label: 'B',
        entries: entries('b', 40).map((e, i) => ({ ...e, room: i % 4 === 1 })),
      },
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
    assert.ok(
      h.slot.at[1] + h.slot.height / 2 <= plan.height,
      `${h.slot.id} is through the ceiling`,
    );
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
      assert.ok(
        grid.isClear(path[k - 1], path[k]),
        `the way to ${h.slot.id} goes through something`,
      );
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
  assert.ok(
    !(bx > b.min[0] && bx < b.max[0] && bz > b.min[1] && bz < b.max[1]),
    'went into a bench',
  );
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
        assert.ok(
          x > room.min[0] && x < room.max[0] && z > room.min[1] && z < room.max[1],
          `${l.id} leaves ${room.id}`,
        );
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

// The themed rooms' sizes and what stands in them, as Blender made them.
const themes = JSON.parse(readFileSync(new URL('../assets/rooms/rooms.json', import.meta.url)));
const NAMES = Object.keys(themes);
/** Works with themed rooms of their own, every theme in turn, two wings of them. */
const themedInput = () => {
  let k = 0;
  const theme = () => NAMES[k++ % NAMES.length];
  return {
    ...input(30, 10),
    themes,
    wings: [
      {
        path: '/projects',
        label: 'Works',
        entries: entries('projects', 30).map((e, i) =>
          i % 3 === 1 ? { ...e, room: true, theme: theme() } : e,
        ),
      },
      {
        path: '/more',
        label: 'More',
        entries: entries('more', 20).map((e, i) =>
          i % 2 ? { ...e, room: true, theme: theme() } : e,
        ),
      },
    ],
  };
};

test('a themed room is its own size, with what stands in it to walk round', () => {
  const plan = generate(themedInput());
  const themed = plan.rooms.filter((r) => r.theme);
  assert.ok(new Set(themed.map((r) => r.theme)).size === NAMES.length, 'every theme is there');
  for (const r of themed) {
    const t = themes[r.theme];
    const w = r.max[0] - r.min[0];
    const d = r.max[1] - r.min[1];
    const [across, deep] = Math.abs(r.forward[0]) ? [d, w] : [w, d];
    assert.ok(Math.abs(across - t.width) < 1e-6 && Math.abs(deep - t.depth) < 1e-6, r.id);
    assert.equal(r.height, t.height);
    // Its blocks are in it.
    const inside = plan.blocks.filter(
      (b) =>
        b.min[0] >= r.min[0] &&
        b.max[0] <= r.max[0] &&
        b.min[1] >= r.min[1] &&
        b.max[1] <= r.max[1],
    );
    assert.ok(inside.length >= t.blocks.length - 1, `${r.id}'s things aren't in it`);
  }
  // Not all alike.
  assert.ok(new Set(themed.map((r) => `${r.max[0] - r.min[0]}x${r.max[1] - r.min[1]}`)).size > 2);
});

test('themed rooms keep clear of each other, and all of them can be walked round', () => {
  const plan = generate(themedInput());
  for (const [i, a] of plan.rooms.entries())
    for (const b of plan.rooms.slice(i + 1)) {
      const overlap =
        Math.min(a.max[0], b.max[0]) - Math.max(a.min[0], b.min[0]) > 1e-6 &&
        Math.min(a.max[1], b.max[1]) - Math.max(a.min[1], b.min[1]) > 1e-6;
      assert.ok(!overlap, `${a.id} overlaps ${b.id}`);
    }
  const grid = new Grid(plan);
  const from = [plan.spawn.at[0], plan.spawn.at[2]];
  for (const h of plan.hung) {
    const path = grid.path(from, [h.view.at[0], h.view.at[2]]);
    assert.ok(path.length >= 2, `no way to ${h.slot.id}`);
  }
  // The crew's strips are clear of what stands there.
  for (const l of plan.lanes.filter((l) => plan.rooms.find((r) => r.id === l.room)?.theme)) {
    const back = [l.along[1], -l.along[0]];
    for (const s of [0, l.length / 2, l.length])
      for (const d of [0, l.width / 2]) {
        const x = l.at[0] + l.along[0] * s + back[0] * d;
        const z = l.at[1] + l.along[1] * s + back[1] * d;
        const hit = plan.blocks.find(
          (b) => x > b.min[0] && x < b.max[0] && z > b.min[1] && z < b.max[1],
        );
        assert.ok(!hit, `${l.id} runs into something at ${x}, ${z}`);
      }
  }
});

test('a theme there is no room for is a plain room of its own', () => {
  // Rooms the size of a wing off every hall, both sides: some must give way.
  const big = { width: 9, depth: 30, height: 6, blocks: [] };
  const plan = generate({
    ...input(4, 4),
    themes: { big },
    wings: ['a', 'b', 'c', 'd'].map((k) => ({
      path: `/${k}`,
      label: k,
      entries: entries(k, 6).map((e) => ({ ...e, room: true, theme: 'big' })),
    })),
  });
  const alcoves = plan.rooms.filter((r) => r.kind === 'alcove');
  assert.ok(alcoves.some((r) => r.theme) && alcoves.some((r) => !r.theme));
});

test('who lives in a themed room has its floor to themselves, short of its piece', () => {
  const plan = generate(themedInput());
  for (const r of plan.rooms.filter((r) => r.theme)) {
    const own = plan.lanes.filter((l) => l.room === r.id);
    assert.ok(own.length >= 1, `no one lives in ${r.id}`);
    for (const l of own) {
      assert.equal(l.residents, themes[r.theme].residents.join(' '), l.id);
      // Not on the crew's way round.
      assert.ok(!plan.links.some((k) => k.a.lane === l.id || k.b.lane === l.id), l.id);
      // In the room, its far side short of the back wall (the piece is seen over them).
      const back = [l.along[1], -l.along[0]];
      for (const [s, d] of [
        [0, 0],
        [l.length, 0],
        [0, l.width],
        [l.length, l.width],
      ]) {
        const x = l.at[0] + l.along[0] * s + back[0] * d;
        const z = l.at[1] + l.along[1] * s + back[1] * d;
        assert.ok(x >= r.min[0] && x <= r.max[0] && z >= r.min[1] && z <= r.max[1], l.id);
        const deep = (x - r.min[0]) * r.forward[0] + (z - r.min[1]) * r.forward[1];
        const D =
          Math.abs(r.forward[0]) * (r.max[0] - r.min[0]) +
          Math.abs(r.forward[1]) * (r.max[1] - r.min[1]);
        const into = r.forward[0] + r.forward[1] > 0 ? deep : D + deep;
        assert.ok(into <= D - 2.5, `${l.id} runs up to the piece`);
      }
    }
  }
  // Plain rooms of their own keep the crew's single strip.
  const plain = generate(input());
  for (const l of plain.lanes) assert.equal(l.residents, undefined);
});

const GAMES = ['blocks', 'racer', 'snake', 'bricks'];
/** The input with n wings (of the four there could be), and an arcade of these games. */
const withArcade = (n, arcade = GAMES) => ({
  ...input(),
  wings: ['a', 'b', 'c', 'd'].slice(0, n).map((k) => ({
    path: `/${k}`,
    label: k,
    entries: entries(k, 6),
  })),
  arcade,
});

test('the arcade is a room off the lobby on the first side no wing has, with a cabinet a game', () => {
  for (const [n, door] of [
    [0, [-9, 0]],
    [2, [-9, 0]],
    [3, [0, 7]],
  ]) {
    const plan = generate(withArcade(n));
    const room = plan.rooms.find((r) => r.id === 'arcade');
    assert.equal(room?.kind, 'arcade', `no arcade with ${n} wings`);
    assert.equal(room.title, 'Arcade');
    // Through a doorway in the lobby's wall, with its sign over it.
    const d = plan.doors.find((d) => d.rooms[1] === 'arcade');
    assert.deepEqual(d.rooms, ['lobby', 'arcade']);
    assert.deepEqual([(d.a[0] + d.b[0]) / 2, (d.a[1] + d.b[1]) / 2], door);
    assert.ok(plan.signs.some((s) => s.text === 'Arcade'));
    // A cabinet each, in order, standing in the room, and a block for each to walk round.
    const cabinets = plan.hung.filter((h) => h.template === 'arcade-cabinet');
    assert.deepEqual(
      cabinets.map((h) => h.game),
      GAMES,
    );
    for (const h of cabinets) {
      assert.equal(h.slot.room, 'arcade');
      assert.equal(h.entries.length, 0);
      const [x, , z] = h.slot.at;
      assert.ok(x > room.min[0] && x < room.max[0] && z > room.min[1] && z < room.max[1]);
      // (A block runs out from its back, which is on the wall.)
      const [fx, fz] = [x + Math.sin(h.slot.yaw) * 0.4, z + Math.cos(h.slot.yaw) * 0.4];
      assert.ok(
        plan.blocks.some((b) => fx > b.min[0] && fx < b.max[0] && fz > b.min[1] && fz < b.max[1]),
        `${h.slot.id} has no block`,
      );
    }
    // Two of them are never closer than 1.3 m.
    for (const [i, a] of cabinets.entries())
      for (const b of cabinets.slice(i + 1))
        assert.ok(Math.hypot(a.slot.at[0] - b.slot.at[0], a.slot.at[2] - b.slot.at[2]) >= 1.3);
    // The visitor can walk to every one, to stand where its screen is seen.
    const grid = new Grid(plan);
    const from = [plan.spawn.at[0], plan.spawn.at[2]];
    for (const h of cabinets) {
      const to = [h.view.at[0], h.view.at[2]];
      assert.ok(grid.test(to), `${h.slot.id}'s view is in something`);
      assert.ok(grid.path(from, to).length >= 2, `no way to ${h.slot.id}`);
      assert.equal(h.view.look[1], 1.35);
    }
    // It overlaps nothing, and nothing hangs over a post.
    for (const o of plan.rooms.filter((o) => o !== room))
      assert.ok(
        Math.min(room.max[0], o.max[0]) - Math.max(room.min[0], o.min[0]) < 1e-6 ||
          Math.min(room.max[1], o.max[1]) - Math.max(room.min[1], o.min[1]) < 1e-6,
        `arcade overlaps ${o.id}`,
      );
    for (const h of plan.hung.filter((h) => h.slot.room === 'lobby' || h.slot.room === 'arcade'))
      for (const w of plan.walls)
        for (const p of [w.a, w.b]) {
          const [dx, dz] = [p[0] - h.slot.at[0], p[1] - h.slot.at[2]];
          const off = Math.abs(dx * Math.sin(h.slot.yaw) + dz * Math.cos(h.slot.yaw));
          const t = Math.abs(dx * Math.cos(h.slot.yaw) - dz * Math.sin(h.slot.yaw));
          assert.ok(off > 0.4 || t > h.slot.width / 2 + 0.26, `${h.slot.id} hangs over ${p}`);
        }
    // The crew come in along a lane, from a lobby lane.
    const lane = plan.lanes.find((l) => l.room === 'arcade');
    assert.ok(lane);
    assert.ok(plan.links.some((k) => k.b.lane === 'arcade-a' || k.a.lane === 'arcade-a'));
  }
});

test('no arcade with a wing on every side, or no games', () => {
  assert.equal(
    generate(withArcade(4)).rooms.some((r) => r.kind === 'arcade'),
    false,
  );
  assert.equal(
    generate(withArcade(4)).hung.some((h) => h.template === 'arcade-cabinet'),
    false,
  );
  for (const arcade of [[], undefined]) {
    const plan = generate({ ...withArcade(2), arcade });
    assert.ok(!plan.rooms.some((r) => r.kind === 'arcade'));
    assert.ok(!plan.hung.some((h) => h.game));
  }
});

test('the arcade holds more games than the back wall has room for', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const plan = generate(withArcade(2, ids));
  const cabinets = plan.hung.filter((h) => h.template === 'arcade-cabinet');
  assert.deepEqual(
    cabinets.map((h) => h.game),
    ids,
  );
  assert.equal(new Set(cabinets.map((h) => h.slot.at.join())).size, ids.length);
});

test('what can be seen is never left out of sight', () => {
  const plan = generate(input(40, 30));
  const grid = new Grid(plan);
  const sight = new Sight(plan);
  const roomAt = ([x, z]) =>
    plan.rooms.find((r) => x >= r.min[0] && x <= r.max[0] && z >= r.min[1] && z <= r.max[1]);
  // Every exhibit, from where it's seen, looking at it.
  for (const h of plan.hung) {
    const [x, , z] = h.view.at;
    const yaw = Math.atan2(h.view.look[0] - x, h.view.look[2] - z);
    assert.ok(sight.from([x, z], { yaw, half: 0.5 }).has(h.slot.room), `${h.slot.id} unseen`);
  }
  // Anywhere to anywhere a straight walk goes clear: in sight, looking every way.
  const free = [];
  for (let j = 0; j < grid.rows; j += 6)
    for (let i = 0; i < grid.cols; i += 6) if (grid.isFree(i, j)) free.push(grid.point(i, j));
  let pairs = 0;
  for (const a of free) {
    const seen = sight.from(a);
    for (const b of free) {
      if (!grid.isClear(a, b)) continue;
      pairs++;
      assert.ok(seen.has(roomAt(b).id), `${roomAt(b).id} unseen from ${a}`);
    }
  }
  assert.ok(pairs > 1000, `only ${pairs} pairs tried`);
});

test('the halls behind the walls are out of sight', () => {
  const plan = generate(input(40, 30));
  const sight = new Sight(plan);
  // In the lobby, looking back at the way in: the lobby, and nothing beyond it.
  assert.deepEqual([...sight.from([0, 5], { yaw: 0, half: 0.9 })], ['lobby']);
  // Looking up the first wing, its halls in a line, but not the rooms off their sides.
  const ahead = sight.from([0, 5], { yaw: Math.PI, half: 0.9 });
  assert.ok(ahead.size > 2 && ahead.size < plan.rooms.length, [...ahead].join(' '));
  assert.ok(![...ahead].some((id) => plan.rooms.find((r) => r.id === id).kind === 'alcove'));
});
