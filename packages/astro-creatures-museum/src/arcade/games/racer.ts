// RACER: an upright's road racer, OutRun-fashion. The road is a ring of short segments, each
// with its bend and its height; every frame the ones in view are projected to the screen
// (nearer is wider and lower), then drawn far to near as flat bands, so a crest hides what's
// behind it without any clipping. Beat the clock from checkpoint to checkpoint, pass the
// traffic. Nobody at the wheel, it drives itself round (and round) under the title.
import type { Look } from '../../museum/materials';
import { best, text } from '../screen';
import { SCREEN, type Game, type GameMaker, type Pad, type ScreenColours } from '../types';

const W = SCREEN.width;
const H = SCREEN.height;
/** A segment's length, the road's half-width, the camera's height (all world units). */
const SEG = 200;
const ROAD = 900;
const CAMH = 1000;
/** The camera's depth (a 100 degree view) and so how far ahead of it the car sits. */
const CAMD = 0.84;
const PZ = CAMH * CAMD;
/** Where the horizon is on the screen, and how tall a world unit is up close. */
const HOR = 112;
const K = 175;
/** Segments drawn, and the top speed (units/s), a car's width (units). */
const DRAW = 160;
const VMAX = 9000;
const CARW = 320;
const ACC = VMAX / 5;
const BRK = VMAX;
const DEC = VMAX / 5;
const OFFDEC = VMAX / 2;
const OFFLIM = VMAX / 4;
/** The clock: seconds to begin with, then each checkpoint's distance (segments) and bonus. */
const TIME0 = 24;
const LANES = [-0.66, 0, 0.66];
const CARS = 8;

const ease = (p: number) => p * p * (3 - 2 * p);
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const checkDist = (stage: number) => Math.min(300 + 30 * stage, 640);
const checkBonus = (stage: number) => Math.max(9, 17 - stage);

/** The ring of road: each segment's bend, and the height at each joint (the last is back at
 * the first, so it closes). Sections of road: lead in, hold, lead out, the bend and the
 * height it ends at. */
const { CS, HS, N } = (() => {
  const cs: number[] = [];
  const hs: number[] = [0];
  const road = (enter: number, hold: number, leave: number, curve: number, endY: number) => {
    const total = enter + hold + leave;
    const y0 = hs[hs.length - 1];
    for (let i = 0; i < total; i++) {
      cs.push(
        i < enter
          ? curve * ease(i / enter)
          : i < enter + hold
            ? curve
            : curve * (1 - ease((i - enter - hold) / leave)),
      );
      hs.push(lerp(y0, endY, ease((i + 1) / total)));
    }
  };
  road(10, 15, 10, 0, 0);
  road(20, 30, 20, 2, 0);
  road(15, 20, 15, 0, 2500);
  road(20, 30, 20, -3, 2500);
  road(20, 20, 20, 0, 0);
  road(25, 40, 25, 3.5, -1500);
  road(15, 15, 15, -2, 1500);
  road(20, 30, 20, 0, 4000);
  road(25, 25, 25, -4, 0);
  road(15, 25, 15, 2.5, 0);
  road(20, 25, 20, -2.5, 1800);
  road(15, 20, 15, 4, 0);
  road(20, 20, 20, 0, 0);
  return { CS: Float32Array.from(cs), HS: Float32Array.from(hs), N: cs.length };
})();

interface Traffic {
  /** Along the road (units, from the start), across it (-1 to 1), its speed. */
  z: number;
  x: number;
  v: number;
  body: string;
  /** Ahead of the player (so passing it counts), and bumped (so it doesn't). */
  ahead: boolean;
  hit: boolean;
}

/** The ground's height under z, between the joints. */
function groundAt(z: number): number {
  const i = Math.floor(z / SEG);
  return lerp(HS[i % N], HS[(i + 1) % N], (z - i * SEG) / SEG);
}

export const racer: GameMaker = {
  id: 'racer',
  title: 'RACER',
  keys: [
    { key: '↑', does: 'go' },
    { key: '↓', does: 'brake' },
    { key: '← →', does: 'steer' },
    { key: 'Esc', does: 'leave' },
  ],
  make: (c, look) => makeRacer(c, look),
};

function makeRacer(c: ScreenColours, look: Look): Game {
  // Value, not hue, tells things apart: the dark and the light of this look, the kerbs, the
  // cars' bodies (the player's the one that stands out), the trees.
  const paper = look === 'paper';
  const mono = look !== 'colour';
  const dark = paper ? c.fg : c.bg;
  const light = paper ? c.bg : c.fg;
  const kerbA = mono ? c.fg : c.pick[0];
  const kerbB = mono ? c.bg : c.fg;
  const mine = c.pick[look === 'ink' ? 5 : 1];
  const bodies = (look === 'colour' ? [0, 2, 3, 4, 5, 6] : paper ? [0, 3, 4, 6] : [2, 4, 6, 1]).map(
    (i) => c.pick[i],
  );
  const lit = mono ? light : c.pick[0];
  const leaf = c.pick[look === 'colour' ? 6 : paper ? 3 : 4];

  type Mode = 'attract' | 'play' | 'over';
  let mode: Mode = 'attract';
  let t = 0;
  let pos = 0;
  let speed = 0;
  let px = 0;
  let lean = 0;
  let wobble = 0;
  let cool = 0;
  let hillOff = 0;
  let time = TIME0;
  let overtakes = 0;
  let stage = 0;
  let nextZ = checkDist(0) * SEG;
  let flash = 0;
  let flashBonus = 0;
  let overT = 0;
  let bestNow = best('racer');
  let braking = false;
  const held = { up: false, down: false, left: false, right: false, a: false };
  const cars: Traffic[] = [];

  // The projected joints, near to far: where the road's centre is on the screen, its y, half
  // its width, and the scale there.
  const PX = new Float32Array(DRAW + 1);
  const PY = new Float32Array(DRAW + 1);
  const PW = new Float32Array(DRAW + 1);
  const PS = new Float32Array(DRAW + 1);

  const score = () => Math.floor(pos / (SEG * 2)) + overtakes * 25;

  /** A car for a spot d units ahead of the player, in a lane the others aren't in. */
  function place(car: Traffic, d: number) {
    for (let tries = 0; tries < 5; tries++) {
      car.x = LANES[Math.floor(Math.random() * LANES.length)] + rnd(-0.08, 0.08);
      if (
        !cars.some(
          (o) => o !== car && Math.abs(o.x - car.x) < 0.4 && Math.abs(o.z - (pos + PZ + d)) < 1800,
        )
      )
        break;
    }
    car.z = pos + PZ + d;
    car.v = VMAX * rnd(0.2, 0.42);
    car.body = bodies[Math.floor(Math.random() * bodies.length)];
    car.ahead = true;
    car.hit = false;
  }

  function traffic() {
    cars.length = 0;
    for (let i = 0; i < CARS; i++) {
      const car: Traffic = { z: 0, x: 0, v: 0, body: c.fg, ahead: true, hit: false };
      cars.push(car);
      place(car, 4000 + i * 3200 + rnd(0, 800));
    }
  }

  function over() {
    mode = 'over';
    overT = 0;
    bestNow = best('racer', score());
  }

  function attract() {
    if (mode !== 'attract') bestNow = best('racer', mode === 'play' ? score() : undefined);
    mode = 'attract';
    held.up = held.down = held.left = held.right = held.a = false;
  }

  /** The attract mode's driver: down the middle, round the inside of the bends, and out of the
   * way of whoever's ahead. */
  function drive(sp: number, idx: number) {
    let target = clamp(CS[(idx + 8) % N] * 0.07, -0.4, 0.4);
    let brk = sp > 0.7;
    for (const car of cars) {
      const d = car.z - (pos + PZ);
      if (d > 0 && d < 4500 && Math.abs(car.x - px) < 0.5) {
        target = car.x > 0 ? car.x - 0.75 : car.x + 0.75;
        if (d < 1800 && speed > car.v) brk = true;
      }
    }
    if (Math.abs(px) > 0.9) target = 0;
    return { thr: sp < 0.6 && !brk, brk, steer: clamp((target - px) * 2.5, -1, 1) };
  }

  function step(dt: number) {
    const idx = Math.floor((pos + PZ) / SEG) % N;
    const curve = CS[idx];
    const sp = speed / VMAX;
    let thr = false;
    let brk = false;
    let steer = 0;
    if (mode === 'play') {
      thr = held.up || held.a;
      brk = held.down;
      steer = (held.right ? 1 : 0) - (held.left ? 1 : 0);
    } else if (mode === 'attract') {
      ({ thr, brk, steer } = drive(sp, idx));
    } else {
      brk = true;
    }
    braking = brk && speed > 100;

    // The car: it steers by how fast it's going, and the bend pushes it out.
    px += steer * 2.6 * sp * dt - curve * sp * sp * 0.5 * dt;
    px = clamp(px, -2.2, 2.2);
    speed += (thr ? ACC : brk ? -BRK : -DEC) * dt;
    if (Math.abs(px) > 1.05 && speed > OFFLIM) speed -= OFFDEC * dt;
    speed = clamp(speed, 0, VMAX);
    pos += speed * dt;
    hillOff += curve * sp * dt * 30;
    lean += (steer * 0.8 - lean) * Math.min(1, dt * 8);
    wobble = Math.max(0, wobble - dt * 1.5);
    cool = Math.max(0, cool - dt);

    // The traffic: on at its own pace; whoever's fallen far behind is ahead again, further on.
    for (const car of cars) {
      car.z += car.v * dt;
      const d = car.z - (pos + PZ);
      if (d < -2500) place(car, rnd(24000, 31000));
      else if (d > 0) {
        car.ahead = true;
        if (d > 700) car.hit = false;
      } else if (car.ahead) {
        car.ahead = false;
        if (!car.hit && mode === 'play') overtakes++;
      }
      if (cool <= 0 && d > -60 && d < 260 && Math.abs(car.x - px) < 0.3) {
        speed = Math.min(speed, car.v * 0.45);
        px += px >= car.x ? 0.18 : -0.18;
        wobble = 1;
        cool = 0.5;
        car.hit = true;
      }
    }

    if (mode === 'play') {
      time -= dt;
      flash = Math.max(0, flash - dt);
      if (pos >= nextZ) {
        stage++;
        flashBonus = checkBonus(stage - 1);
        time += flashBonus;
        flash = 2.2;
        nextZ += checkDist(stage) * SEG;
      }
      if (time <= 0) {
        time = 0;
        over();
      }
    } else if (mode === 'over') overT += dt;
    if (!Number.isFinite(px + speed + pos + lean)) {
      px = 0;
      speed = 0;
      lean = 0;
      pos = Number.isFinite(pos) ? pos : 0;
    }
  }

  // The drawing: boxes by the car's width, from its bottom middle, sheared by its lean.
  let cx = 0;
  let cy = 0;
  let cu = 0;
  let cl = 0;
  const box = (
    g: CanvasRenderingContext2D,
    x0: number,
    x1: number,
    v0: number,
    v1: number,
    col: string,
  ) => {
    const sh = cl * cu * 0.16 * (v0 + v1);
    const l = Math.round(cx + x0 * cu + sh);
    const r = Math.round(cx + x1 * cu + sh);
    const b = Math.round(cy - v0 * cu);
    const tp = Math.round(cy - v1 * cu);
    g.fillStyle = col;
    g.fillRect(l, tp, Math.max(1, r - l), Math.max(1, b - tp));
  };
  /** A car from behind: tyres, body, cabin and its window, the lights. */
  function car(
    g: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    body: string,
    tilt: number,
    stop: boolean,
  ) {
    cx = x;
    cy = y;
    cu = w;
    cl = tilt;
    box(g, -0.52, -0.36, 0, 0.2, dark);
    box(g, 0.36, 0.52, 0, 0.2, dark);
    box(g, -0.5, 0.5, 0.08, 0.33, dark);
    box(g, -0.46, 0.46, 0.1, 0.31, body);
    box(g, -0.38, 0.38, 0.31, 0.57, dark);
    box(g, -0.34, 0.34, 0.31, 0.54, body);
    box(g, -0.27, 0.27, 0.37, 0.5, dark);
    box(g, -0.2, 0.2, 0.12, 0.17, dark);
    const s = stop ? 0.04 : 0;
    box(g, -0.45 - s, -0.29, 0.15 - s, 0.25 + s, lit);
    box(g, 0.29, 0.45 + s, 0.15 - s, 0.25 + s, lit);
  }

  function tree(g: CanvasRenderingContext2D, x: number, y: number, h: number) {
    if (h < 2) return;
    g.fillStyle = dark;
    g.fillRect(x - h * 0.04, y - h * 0.3, Math.max(1, h * 0.08), h * 0.3);
    g.fillStyle = leaf;
    g.beginPath();
    g.moveTo(x - h * 0.22, y - h * 0.22);
    g.lineTo(x + h * 0.22, y - h * 0.22);
    g.lineTo(x, y - h * 0.62);
    g.moveTo(x - h * 0.17, y - h * 0.5);
    g.lineTo(x + h * 0.17, y - h * 0.5);
    g.lineTo(x, y - h);
    g.closePath();
    g.fill();
  }

  /** A band across the road between two joints' heights and widths. */
  function quad(
    g: CanvasRenderingContext2D,
    xa: number,
    wa: number,
    ya: number,
    xb: number,
    wb: number,
    yb: number,
    f: number,
    o = 0,
  ) {
    g.beginPath();
    g.moveTo(xb + wb * o - wb * f, yb);
    g.lineTo(xb + wb * o + wb * f, yb);
    g.lineTo(xa + wa * o + wa * f, ya);
    g.lineTo(xa + wa * o - wa * f, ya);
    g.closePath();
    g.fill();
  }

  function panel(g: CanvasRenderingContext2D, y0: number, y1: number) {
    g.globalAlpha = 0.88;
    g.fillStyle = c.bg;
    g.fillRect(0, y0, W, y1 - y0);
    g.globalAlpha = 1;
  }

  function draw(g: CanvasRenderingContext2D) {
    const base = Math.floor(pos / SEG);
    const frac = (pos - base * SEG) / SEG;
    const camY = CAMH + groundAt(pos + PZ);

    // Sky, sun, two ranges of hills that slide as the road bends, the ground.
    g.globalAlpha = 1;
    g.fillStyle = c.bg;
    g.fillRect(0, 0, W, H);
    g.fillStyle = look === 'colour' ? c.pick[5] : paper ? c.dim : c.fg;
    g.beginPath();
    g.arc(170, 84, 15, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = c.dim;
    for (let layer = 0; layer < 2; layer++) {
      const amp = layer ? 5 : 8;
      g.globalAlpha = layer ? 0.85 : 0.5;
      g.beginPath();
      g.moveTo(0, HOR);
      for (let x = 0; x <= W; x += 8) {
        const u = x + hillOff * (layer ? 1.8 : 1) + layer * 90;
        g.lineTo(
          x,
          HOR -
            6 -
            amp *
              (1.5 +
                Math.sin(u * 0.031) +
                0.6 * Math.sin(u * 0.083 + 1.3) +
                0.3 * Math.sin(u * 0.19)),
        );
      }
      g.lineTo(W, HOR);
      g.fill();
    }
    g.globalAlpha = 1;

    // The joints, near to far: the bend adds up from the first.
    let bx = 0;
    let bdx = -frac * CS[base % N];
    for (let k = 0; k <= DRAW; k++) {
      const z = Math.max(4, (base + k) * SEG - pos);
      const s = CAMD / z;
      PS[k] = s;
      PX[k] = W / 2 + s * (bx - px * ROAD) * (W / 2);
      PY[k] = HOR + s * (camY - HS[(base + k) % N]) * K;
      PW[k] = s * ROAD * (W / 2);
      bx += bdx;
      bdx += CS[(base + k) % N];
    }

    const gate = Math.floor(nextZ / SEG) - base;
    for (let n = DRAW - 1; n >= 1; n--) {
      const abs = base + n;
      const ya = PY[n];
      const yb = PY[n + 1];
      const band = Math.floor(abs / 3) & 1;
      if (yb < ya) {
        const top = Math.floor(yb);
        const bot = Math.ceil(ya) + 1;
        if (band) {
          g.globalAlpha = 0.28;
          g.fillStyle = c.dim;
          g.fillRect(0, top, W, bot - top);
          g.globalAlpha = 1;
        }
        // Kerb, road (the lighter bands a touch brighter), lane lines on the lighter bands.
        g.fillStyle = band ? kerbA : kerbB;
        quad(g, PX[n], PW[n], bot, PX[n + 1], PW[n + 1], top, 1.14);
        g.fillStyle = c.dim;
        quad(g, PX[n], PW[n], bot, PX[n + 1], PW[n + 1], top, 1);
        if (band) {
          g.globalAlpha = 0.12;
          g.fillStyle = c.fg;
          quad(g, PX[n], PW[n], bot, PX[n + 1], PW[n + 1], top, 1);
          g.globalAlpha = 1;
        } else {
          g.fillStyle = c.fg;
          quad(g, PX[n], PW[n], bot, PX[n + 1], PW[n + 1], top, 0.025, 1 / 3);
          quad(g, PX[n], PW[n], bot, PX[n + 1], PW[n + 1], top, 0.025, -1 / 3);
        }
      }

      // Roadside: trees every so often, either side, further out or in.
      if (n > 5 && (abs % 5 === 0 || abs % 7 === 3)) {
        const side = abs % 5 === 0 ? -1 : 1;
        const out = 1.5 + (((abs * 2654435761) >>> 0) % 100) / 60;
        tree(g, PX[n] + side * PW[n] * out, PY[n], PW[n] * 1.7);
      }
      if (n === gate && mode === 'play') {
        const w = PW[n];
        const top = PY[n] - w * 1.15;
        for (let i = 0; i < 10; i++) {
          g.fillStyle = i & 1 ? dark : light;
          g.fillRect(PX[n] - w * 1.12 + i * w * 0.224, top, w * 0.224 + 1, Math.max(2, w * 0.3));
        }
        g.fillStyle = dark;
        g.fillRect(PX[n] - w * 1.12, top, Math.max(1, w * 0.08), PY[n] - top);
        g.fillRect(
          PX[n] + w * 1.12 - Math.max(1, w * 0.08),
          top,
          Math.max(1, w * 0.08),
          PY[n] - top,
        );
      }
      for (const o of cars) {
        if (Math.floor(o.z / SEG) - base !== n) continue;
        const p = (o.z - Math.floor(o.z / SEG) * SEG) / SEG;
        const s = lerp(PS[n], PS[n + 1], p);
        const w = s * CARW * (W / 2);
        if (w < 1.5) continue;
        car(
          g,
          lerp(PX[n], PX[n + 1], p) + o.x * lerp(PW[n], PW[n + 1], p),
          lerp(PY[n], PY[n + 1], p),
          w,
          o.body,
          0,
          false,
        );
      }
    }

    // The player's car, bouncing on the kerbs and on the grass, wobbling after a knock.
    const sp = speed / VMAX;
    const rough = Math.abs(px) > 1.05 ? 2.5 : 0.5;
    const bounce = Math.sin(t * 45) * sp * rough;
    car(
      g,
      W / 2 + Math.sin(t * 60) * wobble * 3,
      292 + bounce,
      CARW * (CAMD / PZ) * (W / 2),
      mine,
      lean + Math.sin(t * 30) * wobble * 0.9,
      braking,
    );

    if (mode === 'attract') {
      panel(g, 46, 152);
      text(g, 'RACER', W / 2, 74, 32, c.fg);
      text(g, `BEST ${bestNow}`, W / 2, 104, 12, c.fg);
      if (Math.floor(t * 2) % 2 === 0) text(g, 'PRESS SPACE', W / 2, 132, 12, c.fg);
      return;
    }

    text(g, `SPEED ${Math.round(sp * 300)}`, 6, 8, 9, c.fg, 'left');
    text(
      g,
      `TIME ${Math.ceil(time)}`,
      W - 6,
      8,
      9,
      time < 6 && Math.floor(t * 4) % 2 === 0 ? c.dim : c.fg,
      'right',
    );
    text(g, `SCORE ${score()}`, 6, 20, 9, c.fg, 'left');
    text(g, `BEST ${Math.max(bestNow, score())}`, W - 6, 20, 9, c.fg, 'right');
    if (mode === 'play' && flash > 0 && Math.floor(t * 6) % 2 === 0) {
      panel(g, 40, 82);
      text(g, 'CHECKPOINT', W / 2, 54, 16, c.fg);
      text(g, `+${flashBonus} SEC`, W / 2, 72, 12, c.fg);
    }
    if (mode === 'over') {
      panel(g, 52, 170);
      text(g, 'GAME OVER', W / 2, 78, 22, c.fg);
      text(g, `SCORE ${score()}`, W / 2, 108, 12, c.fg);
      text(g, `BEST ${bestNow}`, W / 2, 126, 12, c.fg);
      if (overT > 1 && Math.floor(t * 2) % 2 === 0) text(g, 'PRESS ANY KEY', W / 2, 152, 11, c.fg);
    }
  }

  function start() {
    pos = 0;
    speed = 0;
    px = 0;
    lean = 0;
    wobble = 0;
    cool = 0;
    time = TIME0;
    overtakes = 0;
    stage = 0;
    nextZ = checkDist(0) * SEG;
    flash = 0;
    held.up = held.down = held.left = held.right = held.a = false;
    traffic();
    bestNow = best('racer');
    mode = 'play';
  }

  traffic();
  return {
    update(dt, playing) {
      if (!playing && mode !== 'attract') attract();
      let rest = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.25);
      while (rest > 1e-6) {
        const d = Math.min(rest, 1 / 30);
        t += d;
        step(d);
        rest -= d;
      }
    },
    draw,
    pad(button: Pad, down: boolean) {
      held[button === 'b' ? 'a' : button] = down;
      if (down && mode === 'over' && overT > 1) start();
    },
    start,
    stop() {
      attract();
    },
  };
}
