#!/usr/bin/env node
// Is a building of your own ready to walk? Reads its .glb as the museum will
// (src/plan/authored.ts) and says what it found and what's wrong:
//
//   npm run museum:check -- starter/public/museum/building.glb
//
// (Node 22.18+, which reads the .ts.) Exits 1 if there's a problem.
import { readFileSync } from 'node:fs';
import { authored, readGlb } from '../src/plan/authored.ts';

const file = process.argv[2];
if (!file) {
  console.error('Which building? npm run museum:check -- path/to/building.glb');
  process.exit(2);
}
const gltf = readGlb(readFileSync(file));

// The site's pages aren't known here: as many made-up ones for each wing named as it has
// slots, so every slot has something to hang.
const labels = new Map();
for (const n of gltf.nodes ?? []) {
  const wing = n.extras?.wing;
  if (n.name?.startsWith('SLOT_') && typeof wing === 'string')
    labels.set(wing, (labels.get(wing) ?? 0) + 1);
}
const entry = (key, template = 'framed-picture') => ({
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
const wings = [...labels].map(([label, n]) => ({
  path: `/${label.toLowerCase()}`,
  label,
  entries: Array.from({ length: n }, (_, i) =>
    entry(
      `${label.toLowerCase()}/${i}`,
      /libr|blog|book/i.test(label) ? 'bookshelf' : 'framed-picture',
    ),
  ),
}));
const { plan, report } = authored({
  title: 'Check',
  building: file,
  gltf,
  wings,
  about: entry('pages/about', 'about-wall'),
  contact: entry('pages/contact', 'front-desk'),
  filler: { density: 0.6, seed: 'check' },
});

const count = (xs, what) => `${xs.length} ${what}${xs.length === 1 ? '' : 's'}`;
console.log(`${file}:`);
console.log(
  `  ${count(plan.rooms, 'room')}: ${plan.rooms.map((r) => `${r.id}${r.wing ? ` (${r.wing})` : ''}`).join(', ')}`,
);
console.log(
  `  ${count(plan.walls, 'wall')}, ${count(plan.blocks, 'thing')} to walk round, ${count(plan.signs, 'sign')}`,
);
const byWing = new Map();
for (const h of plan.hung) {
  const what =
    h.entries[0]?.collection === 'pages'
      ? h.entries[0].key.slice(6)
      : h.entries.length
        ? 'wing pages'
        : 'art';
  byWing.set(what, (byWing.get(what) ?? 0) + 1);
}
console.log(
  `  ${count(plan.hung, 'slot')}: ${[...byWing].map(([k, n]) => `${n} ${k}`).join(', ')}`,
);
for (const [label, n] of labels) console.log(`    ${label}: ${n} to hang in`);
console.log(
  `  ${count(plan.lanes, 'lane')} for the crew, ${count(plan.links, 'way')} through between them`,
);
console.log(`  in at ${plan.spawn.at.map((x) => x.toFixed(1)).join(', ')}`);
for (const n of report.notes) console.log(`  note: ${n}`);
for (const p of report.problems) console.log(`  PROBLEM: ${p}`);
if (report.problems.length) process.exit(1);
console.log('  ready to walk.');
