// SNAKE: eat, grow, and don't meet the wall or yourself. The arrows turn it (two turns are
// kept, so a quick pair of taps isn't lost, and it won't turn back on itself); it quickens as
// it grows. With nobody playing it steers itself: towards the food, but only to where it can
// still get out of again.
import { SCREEN, type GameMaker, type Pad } from '../types';
import { best, text } from '../screen';

const CELL = 12;
const COLS = SCREEN.width / CELL;
const ROWS = 24;
/** The score bar's height; the field takes the rest of the screen. */
const TOP = SCREEN.height - ROWS * CELL;
/** Up, right, down, left: a turn is one of these, and its opposite is two on. */
const DIRS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;
const DIR_OF: Partial<Record<Pad, number>> = { up: 0, right: 1, down: 2, left: 3 };
/** A step takes this long at first, and so much less for each cell grown, down to FASTEST. */
const SLOWEST = 0.15;
const FASTEST = 0.07;
const QUICKEN = 0.003;
/** Longest frame we'll believe (s), and the most steps we'll take in one. */
const MAX_DT = 0.25;
const MAX_STEPS = 8;
/** Beaten, the attract snake waits this long before starting over; a game over this long before a button restarts. */
const PAUSE = 0.9;
const LOCKED = 1;

type Cell = { x: number; y: number };
type Mode = 'attract' | 'play' | 'over';

const opposite = (d: number) => (d + 2) % 4;

export const snake: GameMaker = {
  id: 'snake',
  title: 'SNAKE',
  keys: [
    { key: '← ↑ ↓ →', does: 'turn' },
    { key: 'Esc', does: 'leave' },
  ],
  make: (c) => {
    let mode: Mode = 'attract';
    let body: Cell[] = [];
    let dir = 1;
    let turns: number[] = [];
    let food: Cell | null = null;
    let eaten = 0;
    let score = 0;
    let acc = 0;
    let clock = 0;
    /** Seconds since the game ended (play) or the attract snake died (it waits PAUSE, then starts over). */
    let since = 0;
    let dead = false;
    let top = best('snake');

    const interval = () => Math.max(FASTEST, SLOWEST - (body.length - 3) * QUICKEN);
    const at = (x: number, y: number) => y * COLS + x;
    const out = (x: number, y: number) => x < 0 || y < 0 || x >= COLS || y >= ROWS;

    function reset() {
      const x = COLS / 2;
      const y = ROWS / 2;
      body = [
        { x, y },
        { x: x - 1, y },
        { x: x - 2, y },
      ];
      dir = 1;
      turns = [];
      eaten = 0;
      score = 0;
      acc = 0;
      since = 0;
      dead = false;
      food = spawn();
    }

    /** A free cell for the food, at random (none: null, the field's full). */
    function spawn(): Cell | null {
      const used = new Set(body.map((b) => at(b.x, b.y)));
      const free: Cell[] = [];
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) if (!used.has(at(x, y))) free.push({ x, y });
      }
      return free.length ? free[Math.floor(Math.random() * free.length)] : null;
    }

    /** Whether the cell is the wall or the body (the first `keep` cells of it). */
    function blocked(x: number, y: number, keep: number) {
      if (out(x, y)) return true;
      for (let i = 0; i < keep; i++) if (body[i].x === x && body[i].y === y) return true;
      return false;
    }

    /** How many cells can be reached from here, the body (its first `keep`) in the way. */
    function room(sx: number, sy: number, keep: number) {
      const seen = new Uint8Array(COLS * ROWS);
      for (let i = 0; i < keep; i++) seen[at(body[i].x, body[i].y)] = 1;
      const stack = [at(sx, sy)];
      seen[stack[0]] = 1;
      let n = 0;
      while (stack.length) {
        const i = stack.pop()!;
        n++;
        const x = i % COLS;
        const y = (i - x) / COLS;
        for (const [dx, dy] of DIRS) {
          const nx = x + dx;
          const ny = y + dy;
          if (out(nx, ny) || seen[at(nx, ny)]) continue;
          seen[at(nx, ny)] = 1;
          stack.push(at(nx, ny));
        }
      }
      return n;
    }

    /** The attract snake's turn: nearest the food of those that don't end it, and that leave it room. */
    function steer(): number {
      const head = body[0];
      let pick = dir;
      let high = -Infinity;
      for (let d = 0; d < 4; d++) {
        if (d === opposite(dir)) continue;
        const nx = head.x + DIRS[d][0];
        const ny = head.y + DIRS[d][1];
        const eats = !!food && food.x === nx && food.y === ny;
        const keep = body.length - (eats ? 0 : 1);
        if (blocked(nx, ny, keep)) continue;
        const space = room(nx, ny, keep);
        const near = food ? Math.abs(food.x - nx) + Math.abs(food.y - ny) : 0;
        // Cramped is far worse than far; of the roomy, the nearest, and straight on if it's a tie.
        const s = (space >= body.length ? 0 : space - 1000) - near + (d === dir ? 0.5 : 0);
        if (s > high) {
          high = s;
          pick = d;
        }
      }
      return pick;
    }

    const ended = () => dead || mode === 'over';

    function finish() {
      since = 0;
      if (mode === 'play') {
        mode = 'over';
        top = Math.max(top, best('snake', score));
      } else dead = true;
    }

    function step() {
      if (mode === 'attract') dir = steer();
      else {
        const turn = turns.shift();
        if (turn !== undefined) dir = turn;
      }
      const nx = body[0].x + DIRS[dir][0];
      const ny = body[0].y + DIRS[dir][1];
      const eats = !!food && food.x === nx && food.y === ny;
      if (blocked(nx, ny, body.length - (eats ? 0 : 1))) return finish();
      body.unshift({ x: nx, y: ny });
      if (!eats) {
        body.pop();
        return;
      }
      eaten++;
      score += 10;
      food = spawn();
      if (!food) finish();
    }

    function start() {
      mode = 'play';
      reset();
    }

    function stop() {
      if (mode !== 'attract') top = Math.max(top, best('snake', score));
      mode = 'attract';
      reset();
    }

    /** A dimmed band across the field to put words on. */
    function band(g: CanvasRenderingContext2D, y: number, h: number) {
      g.globalAlpha = 0.85;
      g.fillStyle = c.bg;
      g.fillRect(0, y, SCREEN.width, h);
      g.globalAlpha = 1;
      g.fillStyle = c.dim;
      g.fillRect(0, y, SCREEN.width, 1);
      g.fillRect(0, y + h - 1, SCREEN.width, 1);
    }

    reset();
    return {
      update(dt, playing) {
        if (!playing && mode !== 'attract') stop();
        if (!(dt > 0)) return;
        dt = Math.min(dt, MAX_DT);
        clock += dt;
        if (mode === 'over') {
          since += dt;
          return;
        }
        if (dead) {
          since += dt;
          if (since >= PAUSE) reset();
          return;
        }
        acc += dt;
        for (let n = 0; acc >= interval() && n < MAX_STEPS && !ended(); n++) {
          acc -= interval();
          step();
        }
        if (acc > interval()) acc = 0;
      },

      pad(button, down) {
        if (!down) return;
        if (mode === 'over') {
          if (since >= LOCKED) start();
          return;
        }
        const d = DIR_OF[button];
        if (mode !== 'play' || d === undefined || turns.length >= 2) return;
        const last = turns.length ? turns[turns.length - 1] : dir;
        if (d !== last && d !== opposite(last)) turns.push(d);
      },

      start,
      stop,

      draw(g) {
        const W = SCREEN.width;
        g.fillStyle = c.bg;
        g.fillRect(0, 0, W, SCREEN.height);

        // The score bar, and the field's dots.
        text(g, `SCORE ${score}`, 8, 16, 14, c.fg, 'left');
        text(g, `BEST ${Math.max(top, score)}`, W - 8, 16, 14, c.fg, 'right');
        g.fillStyle = c.dim;
        g.fillRect(0, TOP - 1, W, 1);
        for (let y = 0; y < ROWS; y++) {
          for (let x = 0; x < COLS; x++) g.fillRect(x * CELL + CELL / 2, TOP + y * CELL + CELL / 2, 1, 1);
        }

        if (food) {
          g.fillStyle = c.pick[(1 + eaten) % c.pick.length];
          g.beginPath();
          g.arc(food.x * CELL + CELL / 2, TOP + food.y * CELL + CELL / 2, 4.5, 0, Math.PI * 2);
          g.fill();
        }

        // The body in squares with a hair between; the head whole, with eyes looking its way.
        g.fillStyle = c.fg;
        for (let i = body.length - 1; i >= 0; i--) {
          const s = body[i];
          const inset = i === 0 ? 0 : 1;
          g.fillRect(s.x * CELL + inset, TOP + s.y * CELL + inset, CELL - 2 * inset, CELL - 2 * inset);
        }
        if (body.length) {
          const h = body[0];
          const [dx, dy] = DIRS[dir];
          const cx = h.x * CELL + CELL / 2 + dx * 2;
          const cy = TOP + h.y * CELL + CELL / 2 + dy * 2;
          g.fillStyle = c.bg;
          g.fillRect(cx - 2 + dy * 3, cy - 2 + dx * 3, 2, 2);
          g.fillRect(cx - 2 - dy * 3, cy - 2 - dx * 3, 2, 2);
        }

        const blink = clock % 1 < 0.6;
        if (mode === 'attract' && !dead) {
          band(g, 112, 96);
          text(g, 'SNAKE', W / 2, 140, 30, c.fg);
          text(g, `BEST ${top}`, W / 2, 170, 14, c.fg);
          if (blink) text(g, 'PRESS SPACE', W / 2, 194, 14, c.fg);
        } else if (mode === 'over') {
          band(g, 104, 112);
          text(g, 'GAME OVER', W / 2, 130, 24, c.fg);
          text(g, `SCORE ${score}`, W / 2, 162, 14, c.fg);
          text(g, `BEST ${top}`, W / 2, 182, 14, c.fg);
          if (since >= LOCKED && blink) text(g, 'PRESS SPACE', W / 2, 204, 14, c.fg);
        }
      },
    };
  },
};
