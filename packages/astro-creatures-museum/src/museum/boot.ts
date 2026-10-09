// The museum, opened behind the page (src/lib/mode.ts): the plan the site was built with
// (/museum.json), the building from the kit, every exhibit from its template, the visitor
// at the door (or at the exhibit whose page this is), and the halls drawn till the tab is
// closed. Clicking walks; clicking an exhibit goes to stand before it and shows its
// caption, from which its page opens over the halls.
import './museum.css';
import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Raycaster,
  RingGeometry,
  Scene,
  SRGBColorSpace,
  type Texture,
  TextureLoader,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import config from 'virtual:astro-creatures-museum/config';
import { Roam } from '../creatures/roam';
import { template } from '../exhibits/registry';
import type { Built, Ctx } from '../exhibits/types';
import { Grid } from '../nav/grid';
import type { Entry, Hung, Plan, Room } from '../plan/types';
import { type Caption, Hud } from './hud';
import { Kit, build } from './kit';
import { type Look, Materials } from './materials';
import { Pages } from './page';
import { Player } from './player';
import { fontsReady, label } from './text';
import { Videos } from './videos';
import { Walker } from './walk';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
const HOME = BASE || '/';
/** How far a click may wander and still be a click, not a drag (px). */
const CLICK = 5;

interface Exhibit {
  hung: Hung;
  built: Built;
}

/** Open the museum. False if it can't be (the page stays as it is). */
export async function open(): Promise<boolean> {
  const look = chooseLook();
  const materials = new Materials(look);
  const plan: Plan = await (await fetch(`${BASE}/museum.json`)).json();
  const hud = new Hud(plan.title, HOME, materials.palette);
  try {
    await run(plan, hud, materials, look);
    return true;
  } catch (e) {
    hud.failed();
    hud.root.remove();
    throw e;
  }
}

/** The building's look: the crew's (the site's setting), or this browser's choice. */
function chooseLook(): Look {
  let kept: string | null = null;
  try {
    kept = localStorage.getItem('look');
  } catch {}
  return kept === 'ink' || kept === 'paper' || kept === 'colour' ? kept : config.crew.look;
}

async function run(plan: Plan, hud: Hud, materials: Materials, look: Look) {
  const palette = materials.palette;
  const renderer = new WebGLRenderer({ canvas: hud.canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;

  const scene = new Scene();
  scene.background = new Color(palette.paper);
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;
  pmrem.dispose();

  const camera = new PerspectiveCamera(62, innerWidth / innerHeight, 0.05, 200);

  // Daylight from the skylights, a sun that follows the visitor (so its shadows are sharp
  // wherever they are), and the sky and floor's bounce.
  scene.add(new HemisphereLight(0xfffaf0, palette.floor[1], palette.light));
  const sun = new DirectionalLight(0xfff4e0, 1.6 * palette.light + 0.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = sun.shadow.camera.bottom = -14;
  sun.shadow.camera.right = sun.shadow.camera.top = 14;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 40;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);

  const kit = await Kit.load(`${BASE}/museum-kit/kit.glb`);
  await fontsReady();

  const building = build(plan, kit, materials);
  // (The skylights let the light in: they'd shade the whole floor otherwise.)
  building.group.traverse((o) => {
    if (o.name.startsWith('skylight:')) o.castShadow = false;
  });
  scene.add(building.group);

  const videos = new Videos();
  const ctx = makeCtx(kit, materials, look, videos, renderer.capabilities.getMaxAnisotropy());

  // Every exhibit, built by its template and put in its slot. One that fails is left out.
  const exhibits: Exhibit[] = [];
  const pickOf = new Map<Object3D, Exhibit>();
  await Promise.all(
    plan.hung.map(async (hung) => {
      try {
        const built = await template(hung.template).build(ctx, hung);
        const o = built.object;
        o.position.set(...hung.slot.at);
        o.rotation.y = hung.slot.yaw;
        o.traverse((m) => {
          if ((m as Mesh).isMesh) m.castShadow = m.receiveShadow = true;
        });
        scene.add(o);
        const ex = { hung, built };
        exhibits.push(ex);
        for (const p of built.picks) pickOf.set(p, ex);
      } catch (e) {
        console.error(`museum: ${hung.template} in ${hung.slot.id}`, e);
      }
    }),
  );
  const picks = [...pickOf.keys()];

  /** The caption showing. */
  let shown: Caption | null = null;
  /** Frames drawn since a page opened over the halls (they stop, a little after). */
  let still = 0;

  // The crew, about the halls: not for visitors who'd rather nothing moved (unless they've
  // asked for them: ?crew, kept).
  const roam = new Roam(plan, scene, {
    models: `${BASE}/creatures/`,
    roster: config.crew.roster,
    max: config.crew.max[1],
    look,
  });
  roam.enabled = wantCrew();

  const grid = new Grid(plan);
  const walker = new Walker(camera, grid);
  walker.onMove = () => hud.moved();

  // Where to stand for a page (an exhibit's address, or a wing's).
  const byHref = new Map<string, Exhibit>();
  for (const ex of exhibits)
    for (const e of ex.hung.entries) if (e.inside) byHref.set(trim(new URL(e.href, location.href).pathname), ex);
  const wingByPath = new Map(plan.wings.map((w) => [trim(w.path), w]));
  const roomOf = (x: number, z: number): Room | undefined =>
    plan.rooms.find((r) => x >= r.min[0] && x <= r.max[0] && z >= r.min[1] && z <= r.max[1]);
  const wingPathOf = (room: Room | undefined) =>
    plan.wings.find((w) => room && w.label === room.wing)?.path ?? HOME;

  // The pages, over the halls.
  const pages = new Pages(HOME, plan.title);
  pages.walkPaths.add(trim(HOME));
  for (const w of plan.wings) pages.walkPaths.add(trim(w.path));
  pages.onRoute = (path, mode) => {
    if (mode !== 'read') return;
    // A page opened from another page: the visitor goes to its exhibit, unseen behind it.
    const ex = byHref.get(trim(path));
    if (ex) walker.set(ex.hung.view);
    shown = null;
    hud.show(null);
  };
  pages.onOpen = () => {
    walker.release();
    walker.stop();
    still = 0;
  };
  hud.onClose = () => pages.close(wingPathOf(roomOf(walker.x, walker.z)));

  // Where the visitor starts: at the exhibit whose page this is, in a wing's doorway, or
  // at the front door.
  const here = trim(location.pathname);
  const start = byHref.get(here)?.hung.view ?? wingByPath.get(here)?.view ?? plan.spawn;
  walker.set(start);
  if (pages.mode === 'read') pages.onOpen?.();

  // Going to see something.
  const caption = (c: Caption | null) => {
    shown = c;
    hud.show(c);
  };
  const go = (ex: Exhibit, entry: Entry | null) => {
    caption(null);
    const show = () =>
      entry && caption({ hung: ex.hung, entry, watch: Boolean(entry.film || entry.video) });
    const [x, , z] = ex.hung.view.at;
    if (Math.hypot(walker.x - x, walker.z - z) < 0.3) walker.lookAt(ex.hung.view.look, show);
    else if (!walker.view(ex.hung.view, show)) show();
  };
  const step = (entry: Entry) => {
    if (entry.inside) void pages.open(entry.href);
    else window.open(entry.href, '_blank', 'noopener');
  };
  hud.onStep = (c) => step(c.entry);

  // Watching: up to the screen, near enough that it fills most of the view, and the film
  // comes up over it.
  const player = new Player();
  hud.onWatch = (c) => {
    const src = c.entry.film ?? c.entry.video;
    if (!src) return;
    caption(null);
    const film = { src, poster: c.entry.image?.src, title: c.entry.title, kicker: c.entry.kicker };
    const { at, look } = c.hung.view;
    const dx = look[0] - at[0];
    const dz = look[2] - at[2];
    const far = Math.hypot(dx, dz);
    const fov = (camera.fov * Math.PI) / 180;
    const near = Math.min(far, c.hung.slot.height / 2 / Math.tan(fov / 2) / 0.8);
    const to: [number, number] = [look[0] - (dx / far) * near, look[2] - (dz / far) * near];
    player.onClose = () => caption(c);
    if (!walker.goTo(to, look, () => player.show(film), 3.4)) player.show(film);
  };
  hud.onGo = (hung, wing) => {
    if (pages.mode === 'read') pages.close(wing ?? HOME);
    const ex = hung && exhibits.find((x) => x.hung === hung);
    if (ex) go(ex, hung.entries[0] ?? null);
    else {
      caption(null);
      walker.view(wing ? (wingByPath.get(trim(wing))?.view ?? plan.spawn) : plan.spawn);
    }
  };
  hud.setIndex(plan);

  // Pointing: drag to look round, click to go. What's under the pointer: an exhibit (and
  // which of its parts: a book on a shelf), or the floor.
  const ray = new Raycaster();
  const ndc = new Vector2();
  const targets = [...picks, ...building.floors];
  const under = (x: number, y: number) => {
    ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const who = roam.pick(ray.ray);
    if (who) return { kind: 'crew' as const, who };
    const hit = ray.intersectObjects(targets, true)[0];
    if (!hit || hit.distance > 40) return null;
    for (let o: Object3D | null = hit.object; o; o = o.parent) {
      const ex = pickOf.get(o);
      if (ex) {
        let entry: Entry | null = null;
        for (let p: Object3D | null = hit.object; p && !entry; p = p.parent) entry = p.userData.entry ?? null;
        return { kind: 'exhibit' as const, ex, entry: entry ?? ex.hung.entries[0] ?? null, part: hit.object };
      }
      if (o.userData.floor) return { kind: 'floor' as const, point: hit.point };
    }
    return null;
  };

  const marker = new Mesh(
    new RingGeometry(0.16, 0.24, 40),
    new MeshBasicMaterial({ color: palette.roles.Brass, transparent: true, opacity: 0, depthWrite: false }),
  );
  marker.rotation.x = -Math.PI / 2;
  scene.add(marker);

  const canvas = hud.canvas;
  let down: { x: number; y: number; moved: number } | null = null;
  let hovered: Object3D | null = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || pages.mode === 'read' || player.open) return;
    down = { x: e.clientX, y: e.clientY, moved: 0 };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (down) {
      const dx = e.clientX - down.x;
      const dy = e.clientY - down.y;
      down.moved += Math.abs(dx) + Math.abs(dy);
      down.x = e.clientX;
      down.y = e.clientY;
      if (down.moved > CLICK) walker.drag(dx, dy);
      return;
    }
    hoverAt = [e.clientX, e.clientY];
  });
  canvas.addEventListener('pointerup', (e) => {
    const was = down;
    down = null;
    if (!was || was.moved > CLICK) return;
    const u = under(e.clientX, e.clientY);
    if (!u) return;
    if (u.kind === 'crew') roam.poke(u.who);
    else if (u.kind === 'exhibit') {
      // A second click on what's showing steps in.
      if (u.entry && u.entry === shown?.entry && !walker.moving) step(u.entry);
      else go(u.ex, u.entry);
    } else if (walker.goTo([u.point.x, u.point.z])) {
      caption(null);
      marker.position.set(u.point.x, 0.01, u.point.z);
      marker.material.opacity = 1;
    }
  });
  canvas.addEventListener('pointercancel', () => (down = null));
  // Hovering: worked out once a frame at most.
  let hoverAt: [number, number] | null = null;
  const hover = () => {
    if (!hoverAt) return;
    const u = under(...hoverAt);
    hoverAt = null;
    canvas.dataset.over = !u ? '' : u.kind === 'exhibit' ? (u.ex.hung.entries.length ? 'exhibit' : 'art') : u.kind;
    roam.hover(u?.kind === 'crew' ? u.who : null);
    const part = u?.kind === 'exhibit' && u.part.userData.entry ? u.part : null;
    if (part !== hovered) {
      if (hovered) hovered.userData.hovered = false;
      if (part) part.userData.hovered = true;
      hovered = part;
    }
  };

  addEventListener('keydown', (e) => {
    if (pages.mode === 'read' || player.open || e.metaKey || e.ctrlKey || e.altKey) return;
    if ((e.target as HTMLElement).closest?.('input, textarea, select, [contenteditable]')) return;
    walker.key(e.code, true);
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  });
  addEventListener('keyup', (e) => walker.key(e.code, false));
  addEventListener('blur', () => walker.release());
  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    still = 0;
  });

  // Every frame.
  const eye = new Vector3();
  const forward = new Vector3();
  let room: Room | undefined;
  let last = performance.now();
  renderer.setAnimationLoop((now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (pages.mode === 'read') {
      // The halls are only a backdrop now: a few frames to settle, then none.
      if (still++ > 3) return;
    }
    walker.update(dt);
    camera.getWorldPosition(eye);
    walker.forward(forward);
    hover();

    const r = roomOf(walker.x, walker.z);
    if (r && r !== room) {
      room = r;
      hud.setRoom(r.kind === 'lobby' ? 'The lobby' : r.wing);
      pages.walkAt(wingPathOf(r));
    }
    if (shown && !walker.moving) {
      // Walked off from it: further from the exhibit than where it's best seen, and then
      // some, or off to its side.
      const { at, look } = shown.hung.view;
      const far = Math.hypot(look[0] - at[0], look[2] - at[2]);
      const off = Math.hypot(walker.x - at[0], walker.z - at[2]);
      if (Math.hypot(walker.x - look[0], walker.z - look[2]) > far + 1.2 || off > far) caption(null);
    }

    for (const ex of exhibits) {
      if (!ex.built.update) continue;
      const [x, , z] = ex.hung.view.at;
      ex.built.update(dt, Math.max(0, 1 - Math.hypot(walker.x - x, walker.z - z) / 6));
    }
    videos.update(dt, eye, forward);
    roam.update(dt, camera);
    if (marker.material.opacity > 0) marker.material.opacity = Math.max(0, marker.material.opacity - dt * 1.2);

    // The sun's shadows follow the visitor, a metre at a time (so they don't shimmer).
    const sx = Math.round(walker.x);
    const sz = Math.round(walker.z);
    sun.position.set(sx + 5, 18, sz + 3);
    sun.target.position.set(sx, 0, sz);
    sun.target.updateMatrixWorld();

    renderer.render(scene, camera);
  });

  hud.ready();
  const debug = { plan, scene, camera, renderer, walker, grid, pages, hud, videos, player, roam, exhibits, go, step };
  (window as unknown as { __museum: typeof debug }).__museum = debug;
}

/** The crew, unless motion's unwelcome (and the visitor hasn't asked for them anyway). */
function wantCrew() {
  let asked: string | null = null;
  try {
    if (new URLSearchParams(location.search).has('crew')) localStorage.setItem('crew', 'on');
    asked = localStorage.getItem('crew');
  } catch {}
  if (asked === 'on') return true;
  return !(config.crew.respectReducedMotion && matchMedia('(prefers-reduced-motion: reduce)').matches);
}

/** What templates build with. */
function makeCtx(kit: Kit, materials: Materials, look: Look, videos: Videos, anisotropy: number): Ctx {
  const loader = new TextureLoader();
  const images = new Map<string, Promise<Texture>>();
  const { paper, ink } = materials.palette;
  return {
    kit,
    materials,
    look,
    image(src) {
      let p = images.get(src);
      if (!p) {
        p = loader.loadAsync(src).then((t) => {
          t.colorSpace = SRGBColorSpace;
          t.anisotropy = anisotropy;
          return t;
        });
        images.set(src, p);
      }
      return p;
    },
    video(src, material, object) {
      videos.add(src, material, object);
    },
    label(entry, w, h, extra) {
      const map = label(
        {
          kicker: extra?.kicker ?? entry?.kicker,
          title: extra?.title ?? entry?.title ?? '',
          summary: entry?.summary,
          foot: extra?.foot,
        },
        w,
        h,
        paper,
        ink,
      );
      const card = new Mesh(
        new PlaneGeometry(w, h),
        new MeshBasicMaterial({ map, color: 0xeeeeee, toneMapped: false }),
      );
      if (entry) card.userData.entry = entry;
      return card;
    },
  };
}

/** A path without its trailing slash ('/' stays '/'). */
const trim = (path: string) => path.replace(/\/$/, '') || '/';
