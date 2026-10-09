// BLOCKS: shapes of four squares fall into a ten-by-twenty well; fill a row and it goes.
// Seven shapes dealt from a bag, a turn that nudges off a wall if it must, a ghost of where
// it will land. Nobody playing, a bot plays it (one look at each landing: fewest holes, lowest).
import { SCREEN, type GameMaker, type Pad, type ScreenColours } from '../types';
import { best, text } from '../screen';

const W = 10;
const H = 20;
const CELL = 14;
const WX = 8; // the well's left and top, in screen units
const WY = 20;
const SIDE = 194; // the sidebar's centre line
const DAS = 0.17; // hold a direction this long, then it repeats…
const REPEAT = 0.05; // …this often
const LOCK = 0.5; // a piece on the floor waits this long before it sets
const FLASH = 0.3; // a cleared row blinks this long
const MAX_STEP = 0.05;
const POINTS = [0, 100, 300, 500, 800];

type Cells = [number, number][];

// The seven, as cells in their box (I and O in their own sizes), in the order of `pick`:
// I O T S Z J L. Every turn is worked out once, here.
const BASE: { n: number; cells: Cells }[] = [
  { n: 4, cells: [[0, 1], [1, 1], [2, 1], [3, 1]] },
  { n: 2, cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  { n: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1]] },
  { n: 3, cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
  { n: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
  { n: 3, cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
  { n: 3, cells: [[2, 0], [0, 1], [1, 1], [2, 1]] },
];
const SHAPES: Cells[][] = BASE.map(({ n, cells }) => {
  const turns = [cells];
  for (let r = 1; r < 4; r++) {
    turns.push(turns[r - 1].map(([x, y]): [number, number] => [n - 1 - y, x]));
  }
  return turns;
});

// Where a turn tries to sit when the plain one is blocked: sideways, then up off the floor.
const KICKS: [number, number][] = [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1], [-1, -1], [1, -1]];

type Mode = 'play' | 'clear' | 'over';

export const blocks: GameMaker = {
  id: 'blocks',
  title: 'BLOCKS',
  keys: [
    { key: '← →', does: 'move' },
    { key: '↑', does: 'turn' },
    { key: '↓', does: 'drop faster' },
    { key: 'Space', does: 'drop' },
    { key: 'Esc', does: 'leave' },
  ],
  make: (c: ScreenColours) => {
    let board = new Uint8Array(W * H); // 0 empty, else the piece's index + 1
    let bag: number[] = [];
    let mode: Mode = 'play';
    let human = false;
    let k = 0; // the falling piece, its turn and its place
    let r = 0;
    let px = 0;
    let py = 0;
    let next = 0;
    let score = 0;
    let lines = 0;
    let hi = best('blocks');
    let fall = 0; // seconds towards the next row down
    let lockT = 0;
    let resets = 0;
    let rows: number[] = [];
    let clearT = 0;
    let overT = 0;
    let clock = 0;
    const held = { left: false, right: false, down: false };
    let dir = 0; // -1, 0 or 1: the last of left and right still held
    let dasT = 0;
    let plan: { r: number; x: number } | null = null;
    let botT = 0;

    const level = () => 1 + Math.floor(lines / 10);
    const gravity = () => {
      const l = level() - 1;
      return Math.max(0.03, Math.pow(0.8 - l * 0.007, l));
    };

    function deal(): number {
      if (!bag.length) {
        bag = [0, 1, 2, 3, 4, 5, 6];
        for (let i = 6; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [bag[i], bag[j]] = [bag[j], bag[i]];
        }
      }
      return bag.pop()!;
    }

    function fits(b: Uint8Array, kind: number, turn: number, x: number, y: number): boolean {
      for (const [cx, cy] of SHAPES[kind][turn]) {
        const bx = x + cx;
        const by = y + cy;
        if (bx < 0 || bx >= W || by >= H) return false;
        if (by >= 0 && b[by * W + bx]) return false;
      }
      return true;
    }

    function begin(by: boolean) {
      board = new Uint8Array(W * H);
      bag = [];
      human = by;
      score = 0;
      lines = 0;
      hi = best('blocks');
      held.left = held.right = held.down = false;
      dir = 0;
      next = deal();
      mode = 'play';
      overT = 0;
      spawn();
    }

    function spawn() {
      k = next;
      next = deal();
      r = 0;
      px = Math.floor((W - BASE[k].n) / 2);
      py = -1;
      fall = lockT = resets = 0;
      plan = null;
      botT = 0.25;
      if (fits(board, k, r, px, py)) return;
      if (!human) return begin(false); // the bot's well is full: start again, quietly
      mode = 'over';
      overT = 0;
      hi = Math.max(hi, best('blocks', score));
    }

    function shift(dx: number): boolean {
      if (mode !== 'play' || !fits(board, k, r, px + dx, py)) return false;
      px += dx;
      eased();
      return true;
    }

    function turn(d: number): boolean {
      if (mode !== 'play') return false;
      const nr = (r + d + 4) % 4;
      for (const [dx, dy] of KICKS) {
        if (!fits(board, k, nr, px + dx, py + dy)) continue;
        r = nr;
        px += dx;
        py += dy;
        eased();
        return true;
      }
      return false;
    }

    // A move or turn on the floor buys a little more time (but not for ever).
    function eased() {
      if (resets < 12) {
        lockT = 0;
        resets++;
      }
    }

    function landing(b: Uint8Array, kind: number, turn: number, x: number, y: number): number {
      while (fits(b, kind, turn, x, y + 1)) y++;
      return y;
    }

    function lock() {
      for (const [cx, cy] of SHAPES[k][r]) {
        const by = py + cy;
        if (by >= 0) board[by * W + px + cx] = k + 1;
      }
      rows = [];
      for (let y = 0; y < H; y++) {
        let full = true;
        for (let x = 0; x < W && full; x++) full = board[y * W + x] > 0;
        if (full) rows.push(y);
      }
      if (!rows.length) return spawn();
      mode = 'clear';
      clearT = FLASH;
    }

    function cleared() {
      const n = rows.length;
      const keep = new Uint8Array(W * H);
      let to = H - 1;
      for (let y = H - 1; y >= 0; y--) {
        if (rows.includes(y)) continue;
        keep.set(board.subarray(y * W, y * W + W), to * W);
        to--;
      }
      board = keep;
      score += POINTS[n] * level();
      lines += n;
      mode = 'play';
      spawn();
    }

    function hard() {
      if (mode !== 'play') return;
      const y = landing(board, k, r, px, py);
      score += 2 * (y - py);
      py = y;
      lock();
    }

    // The bot: try every turn and column, keep the one that leaves the fewest holes, lowest.
    function rate(kind: number, turn: number, x: number): number {
      const y = landing(board, kind, turn, x, py);
      const b = board.slice();
      for (const [cx, cy] of SHAPES[kind][turn]) if (y + cy >= 0) b[(y + cy) * W + x + cx] = 1;
      const left: number[] = [];
      for (let yy = 0; yy < H; yy++) {
        let full = true;
        for (let xx = 0; xx < W && full; xx++) full = b[yy * W + xx] > 0;
        if (!full) left.push(yy);
      }
      const cleared = H - left.length;
      let total = 0;
      let holes = 0;
      let bumps = 0;
      let before = -1;
      for (let xx = 0; xx < W; xx++) {
        let top = left.length;
        for (let i = 0; i < left.length; i++) {
          if (b[left[i] * W + xx]) {
            if (top === left.length) top = i;
          } else if (top < i) holes++;
        }
        const h = left.length - top;
        total += h;
        if (before >= 0) bumps += Math.abs(h - before);
        before = h;
      }
      return cleared * 0.76 - total * 0.51 - holes * 0.36 - bumps * 0.18 + Math.random() * 0.3;
    }

    function think() {
      let top = -Infinity;
      plan = { r: 0, x: px };
      for (let t = 0; t < 4; t++) {
        for (let x = -2; x < W; x++) {
          if (!fits(board, k, t, x, py)) continue;
          const v = rate(k, t, x);
          if (v > top) {
            top = v;
            plan = { r: t, x };
          }
        }
      }
    }

    function bot(dt: number) {
      botT -= dt;
      if (botT > 0) return;
      botT = 0.07;
      if (!plan) think();
      if (!plan) return;
      const dx = plan.x - px;
      // The box's own column shifts when it turns, so turn first, then walk.
      if (r !== plan.r) {
        if (!turn(1)) hard();
      } else if (dx) {
        if (!shift(Math.sign(dx))) hard();
      } else hard();
    }

    function step(dt: number) {
      clock += dt;
      if (mode === 'over') {
        overT += dt;
        return;
      }
      if (mode === 'clear') {
        clearT -= dt;
        if (clearT <= 0) cleared();
        return;
      }
      if (!human) {
        bot(dt);
        if (lines >= 40) return begin(false);
      }
      if (human && dir) {
        dasT -= dt;
        for (let i = 0; dasT <= 0 && i < 12; i++) {
          if (!shift(dir)) {
            dasT = 0;
            break;
          }
          dasT += REPEAT;
        }
      }
      const every = held.down && human ? Math.min(gravity(), 0.04) : gravity();
      fall += dt;
      for (let i = 0; fall >= every && i < 4; i++) {
        if (!fits(board, k, r, px, py + 1)) break;
        py++;
        fall -= every;
        if (held.down && human) score++;
      }
      if (fits(board, k, r, px, py + 1)) {
        lockT = 0;
      } else {
        fall = 0;
        lockT += held.down && human ? dt * 4 : dt;
        if (lockT >= LOCK) lock();
      }
    }

    // ---- drawing ----

    function cell(g: CanvasRenderingContext2D, x: number, y: number, s: number, colour: string) {
      g.fillStyle = colour;
      g.fillRect(x + 1, y + 1, s - 2, s - 2);
      g.globalAlpha = 0.3;
      g.fillStyle = c.fg;
      g.fillRect(x + 1, y + 1, s - 2, 2);
      g.fillRect(x + 1, y + 1, 2, s - 2);
      g.fillStyle = c.bg;
      g.fillRect(x + 1, y + s - 3, s - 2, 2);
      g.fillRect(x + s - 3, y + 1, 2, s - 2);
      g.globalAlpha = 1;
    }

    function label(g: CanvasRenderingContext2D, name: string, value: string, y: number) {
      text(g, name, SIDE, y, 9, c.dim);
      text(g, value, SIDE, y + 14, 12, c.fg);
    }

    function veil(g: CanvasRenderingContext2D) {
      g.globalAlpha = 0.78;
      g.fillStyle = c.bg;
      g.fillRect(WX, WY, W * CELL, H * CELL);
      g.globalAlpha = 1;
    }

    return {
      update(dt, playing) {
        if (playing && !human) begin(true);
        else if (!playing && human) {
          best('blocks', score);
          begin(false);
        }
        let left = Math.min(Math.max(dt, 0), 0.25);
        while (left > 1e-6) {
          const d = Math.min(left, MAX_STEP);
          step(d);
          left -= d;
        }
      },

      draw(g) {
        g.fillStyle = c.bg;
        g.fillRect(0, 0, SCREEN.width, SCREEN.height);

        // The well, with its grid.
        g.globalAlpha = 0.35;
        g.fillStyle = c.dim;
        for (let x = 1; x < W; x++) g.fillRect(WX + x * CELL, WY, 1, H * CELL);
        for (let y = 1; y < H; y++) g.fillRect(WX, WY + y * CELL, W * CELL, 1);
        g.globalAlpha = 1;
        g.strokeStyle = c.dim;
        g.lineWidth = 2;
        g.strokeRect(WX - 1, WY - 1, W * CELL + 2, H * CELL + 2);

        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const v = board[y * W + x];
            if (v) cell(g, WX + x * CELL, WY + y * CELL, CELL, c.pick[v - 1]);
          }
        }
        if (mode === 'clear') {
          g.globalAlpha = Math.floor(clearT * 24) % 2 ? 0.95 : 0.4;
          g.fillStyle = c.fg;
          for (const y of rows) g.fillRect(WX, WY + y * CELL, W * CELL, CELL);
          g.globalAlpha = 1;
        }

        if (mode === 'play') {
          // Where it will land, then the piece itself.
          const gy = landing(board, k, r, px, py);
          g.strokeStyle = c.pick[k];
          g.lineWidth = 1;
          g.globalAlpha = 0.55;
          for (const [cx, cy] of SHAPES[k][r]) {
            if (gy + cy >= 0) {
              g.strokeRect(WX + (px + cx) * CELL + 1.5, WY + (gy + cy) * CELL + 1.5, CELL - 3, CELL - 3);
            }
          }
          g.globalAlpha = 1;
          for (const [cx, cy] of SHAPES[k][r]) {
            if (py + cy >= 0) cell(g, WX + (px + cx) * CELL, WY + (py + cy) * CELL, CELL, c.pick[k]);
          }
        }

        // The sidebar: what's next, then the numbers.
        text(g, 'NEXT', SIDE, 18, 9, c.dim);
        const s = 9;
        const cells = SHAPES[next][0];
        const x0 = Math.min(...cells.map((p) => p[0]));
        const x1 = Math.max(...cells.map((p) => p[0])) + 1;
        const y0 = Math.min(...cells.map((p) => p[1]));
        const y1 = Math.max(...cells.map((p) => p[1])) + 1;
        for (const [cx, cy] of cells) {
          cell(g, SIDE - ((x1 - x0) * s) / 2 + (cx - x0) * s, 46 - ((y1 - y0) * s) / 2 + (cy - y0) * s, s, c.pick[next]);
        }
        label(g, 'SCORE', String(score), 84);
        label(g, 'LINES', String(lines), 124);
        label(g, 'LEVEL', String(level()), 164);
        label(g, 'BEST', String(Math.max(hi, human ? score : 0)), 204);

        const mx = WX + (W * CELL) / 2;
        const blink = Math.floor(clock * 2) % 2 === 0;
        if (!human) {
          veil(g);
          text(g, 'BLOCKS', mx, WY + 88, 26, c.fg);
          text(g, `BEST ${hi}`, mx, WY + 128, 12, c.dim);
          if (blink) text(g, 'PRESS SPACE', mx, WY + 176, 12, c.fg);
        } else if (mode === 'over') {
          veil(g);
          text(g, 'GAME OVER', mx, WY + 100, 16, c.fg);
          text(g, `SCORE ${score}`, mx, WY + 130, 12, c.fg);
          if (overT >= 1 && blink) text(g, 'PRESS A KEY', mx, WY + 170, 10, c.dim);
        }
      },

      pad(button: Pad, down: boolean) {
        if (!human) return;
        if (button === 'left' || button === 'right') {
          held[button] = down;
          const d = button === 'left' ? -1 : 1;
          if (down) {
            dir = d;
            dasT = DAS;
            shift(d);
          } else if (dir === d) {
            dir = held.left ? -1 : held.right ? 1 : 0;
            dasT = DAS;
          }
          return;
        }
        if (button === 'down') held.down = down;
        if (!down) return;
        if (mode === 'over') {
          if (overT >= 1) begin(true);
          return;
        }
        if (button === 'up') turn(1);
        else if (button === 'b') turn(-1);
        else if (button === 'a') hard();
      },

      start() {
        begin(true);
      },

      stop() {
        if (human) best('blocks', score);
        begin(false);
        hi = best('blocks');
      },
    };
  },
};
