// BRICKS: a paddle, a ball and a wall of bricks to knock down. The ball leaves the paddle at an
// angle that depends on where it met it, and quickens a little for each hit; three lives, and
// a cleared wall brings a faster one. With nobody playing, the paddle follows the ball itself,
// not quite well enough to never miss.
import { SCREEN, type GameMaker } from '../types';
import { best, text } from '../screen';

const W = SCREEN.width;
const H = SCREEN.height;
/** The score bar's height; the field is below it. */
const BAR = 28;
const COLS = 10;
const ROWS = 7;
const BW = W / COLS;
const BH = 11;
const WALL_TOP = 48;
/** The paddle: its top edge, its size, how fast it goes (units/s) and how quickly it gets there. */
const PY = 296;
const PW = 40;
const PH = 6;
const PACE = 300;
const ACCEL = 1700;
const BRAKE = 2400;
const R = 3;
/** The ball's speed (units/s): the first wall's, what each later wall adds, what each hit adds, and the limit. */
const SPEED = 140;
const FASTER = 22;
const HIT = 2.5;
const LIMIT = 400;
/** The steepest it may leave the paddle (rad), and the least of its speed it keeps going up or down. */
const SLANT = 1.05;
const STEEP = 0.3;
const LIVES = 3;
/** Fixed steps, so a long frame can't take the ball through a brick; the longest frame believed (s). */
const STEP = 1 / 120;
const MAX_DT = 0.25;
/** An attract wait, and how long a game over holds off the buttons. */
const PAUSE = 0.9;
const LOCKED = 1;

type Mode = 'attract' | 'play' | 'over';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const bricks: GameMaker = {
  id: 'bricks',
  title: 'BRICKS',
  keys: [
    { key: '← →', does: 'move' },
    { key: 'Space', does: 'serve' },
    { key: 'Esc', does: 'leave' },
  ],
  make: (c) => {
    let mode: Mode = 'attract';
    let wall = new Uint8Array(ROWS * COLS);
    let left = 0;
    let right = 0;
    let px = W / 2;
    let pv = 0;
    const ball = { x: 0, y: 0, vx: 0, vy: 0 };
    let stuck = true;
    let speed = SPEED;
    let hits = 0;
    let lives = LIVES;
    let level = 1;
    let score = 0;
    let acc = 0;
    let clock = 0;
    /** Time since the game ended, the attract game lost, or the ball was last put on the paddle. */
    let since = 0;
    let dead = false;
    /** The attract paddle's aim is off by this much, new each hit. */
    let err = 0;
    let top = best('bricks');

    const base = () => Math.min(LIMIT * 0.8, SPEED + (level - 1) * FASTER);

    function build() {
      wall = new Uint8Array(ROWS * COLS).fill(1);
      left = ROWS * COLS;
    }

    /** The ball back on the paddle, waiting to be served. */
    function park() {
      stuck = true;
      hits = 0;
      speed = base();
      since = 0;
      err = (Math.random() * 2 - 1) * (PW / 2 + 4);
    }

    function reset() {
      level = 1;
      lives = LIVES;
      score = 0;
      acc = 0;
      px = W / 2;
      pv = 0;
      dead = false;
      build();
      park();
    }

    function serve() {
      if (!stuck) return;
      stuck = false;
      const a = (Math.random() - 0.5) * 0.6;
      ball.vx = speed * Math.sin(a);
      ball.vy = -speed * Math.cos(a);
    }

    /** The ball's velocity back to `speed`, going up or down enough not to dawdle sideways. */
    function retarget() {
      const sp = Math.hypot(ball.vx, ball.vy) || 1;
      let vy = (ball.vy / sp) * speed;
      if (Math.abs(vy) < STEEP * speed) vy = (vy < 0 || ball.vy === 0 ? -1 : 1) * STEEP * speed;
      const vx = Math.sqrt(Math.max(0, speed * speed - vy * vy)) * (ball.vx < 0 ? -1 : 1);
      ball.vx = vx;
      ball.vy = vy;
    }

    function quicken() {
      hits++;
      speed = Math.min(LIMIT, base() + hits * HIT);
    }

    /** Knock out the bricks the ball overlaps; whether there were any. */
    function knock() {
      const c0 = clamp(Math.floor((ball.x - R) / BW), 0, COLS - 1);
      const c1 = clamp(Math.floor((ball.x + R) / BW), 0, COLS - 1);
      const r0 = clamp(Math.floor((ball.y - R - WALL_TOP) / BH), 0, ROWS - 1);
      const r1 = clamp(Math.floor((ball.y + R - WALL_TOP) / BH), 0, ROWS - 1);
      let any = false;
      for (let r = r0; r <= r1; r++) {
        for (let k = c0; k <= c1; k++) {
          const i = r * COLS + k;
          const y = WALL_TOP + r * BH;
          if (!wall[i] || ball.y + R < y || ball.y - R > y + BH) continue;
          if (ball.x + R < k * BW || ball.x - R > (k + 1) * BW) continue;
          wall[i] = 0;
          left--;
          score += ROWS - r;
          any = true;
        }
      }
      if (any) quicken();
      return any;
    }

    const ended = () => dead || mode === 'over';

    function finish() {
      since = 0;
      if (mode === 'play') {
        mode = 'over';
        top = Math.max(top, best('bricks', score));
      } else dead = true;
    }

    function lose() {
      if (--lives > 0) return park();
      finish();
    }

    function step(h: number) {
      // The paddle: keys (or, in attract mode, the ball) say which way, and it takes a moment to get there.
      let want = right - left;
      if (mode === 'attract') {
        const aim = (stuck ? W / 2 : ball.x) + err;
        want = clamp((aim - px) / 14, -1, 1);
        if (stuck && since > 0.7) serve();
      }
      const goal = want * PACE;
      const rate = want === 0 || Math.sign(want) !== Math.sign(pv) ? BRAKE : ACCEL;
      pv += clamp(goal - pv, -rate * h, rate * h);
      px += pv * h;
      if (px < PW / 2 || px > W - PW / 2) {
        px = clamp(px, PW / 2, W - PW / 2);
        pv = 0;
      }

      if (stuck) {
        ball.x = px;
        ball.y = PY - R;
        return;
      }

      const x0 = ball.x;
      ball.x += ball.vx * h;
      if (ball.x < R) {
        ball.x = R;
        ball.vx = Math.abs(ball.vx);
      } else if (ball.x > W - R) {
        ball.x = W - R;
        ball.vx = -Math.abs(ball.vx);
      } else if (knock()) {
        ball.x = x0;
        ball.vx = -ball.vx;
        retarget();
      }

      const y0 = ball.y;
      ball.y += ball.vy * h;
      if (ball.y < BAR + R) {
        ball.y = BAR + R;
        ball.vy = Math.abs(ball.vy);
      } else if (knock()) {
        ball.y = y0;
        ball.vy = -ball.vy;
        retarget();
      }

      if (
        ball.vy > 0 &&
        y0 + R <= PY + 3 &&
        ball.y + R >= PY &&
        ball.y - R <= PY + PH &&
        Math.abs(ball.x - px) <= PW / 2 + R
      ) {
        quicken();
        const a = clamp((ball.x - px) / (PW / 2), -1, 1) * SLANT;
        ball.y = PY - R;
        ball.vx = speed * Math.sin(a);
        ball.vy = -speed * Math.cos(a);
        err = (Math.random() * 2 - 1) * (PW / 2 + 4);
      } else if (ball.y - R > H) lose();

      if (!left) {
        level++;
        build();
        park();
      }
    }

    function start() {
      mode = 'play';
      left = right = 0;
      reset();
    }

    function stop() {
      if (mode !== 'attract') top = Math.max(top, best('bricks', score));
      mode = 'attract';
      left = right = 0;
      reset();
    }

    /** A dimmed band across the field to put words on. */
    function band(g: CanvasRenderingContext2D, y: number, h: number) {
      g.globalAlpha = 0.85;
      g.fillStyle = c.bg;
      g.fillRect(0, y, W, h);
      g.globalAlpha = 1;
      g.fillStyle = c.dim;
      g.fillRect(0, y, W, 1);
      g.fillRect(0, y + h - 1, W, 1);
    }

    reset();
    return {
      update(dt, playing) {
        if (!playing && mode !== 'attract') stop();
        if (!(dt > 0)) return;
        dt = Math.min(dt, MAX_DT);
        clock += dt;
        since += dt;
        if (mode === 'over') return;
        if (dead) {
          if (since >= PAUSE) reset();
          return;
        }
        acc += dt;
        while (acc >= STEP) {
          acc -= STEP;
          step(STEP);
          if (ended()) break;
        }
        if (ended()) acc = 0;
      },

      pad(button, down) {
        if (mode === 'over') {
          if (down && since >= LOCKED) start();
          return;
        }
        if (mode !== 'play') return;
        if (button === 'left') left = down ? 1 : 0;
        else if (button === 'right') right = down ? 1 : 0;
        else if (down && (button === 'a' || button === 'up')) serve();
      },

      start,
      stop,

      draw(g) {
        g.fillStyle = c.bg;
        g.fillRect(0, 0, W, H);

        // The score bar: score, wall, and a ball for each life.
        text(g, `SCORE ${score}`, 8, 16, 14, c.fg, 'left');
        text(g, `WALL ${level}`, W / 2 + 30, 16, 14, c.fg);
        g.fillStyle = c.fg;
        for (let i = 0; i < lives; i++) {
          g.beginPath();
          g.arc(W - 12 - i * 11, 15, R, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = c.dim;
        g.fillRect(0, BAR - 1, W, 1);

        for (let r = 0; r < ROWS; r++) {
          g.fillStyle = c.pick[r % c.pick.length];
          for (let k = 0; k < COLS; k++) {
            if (wall[r * COLS + k]) g.fillRect(k * BW + 1, WALL_TOP + r * BH + 1, BW - 2, BH - 2);
          }
        }

        g.fillStyle = c.fg;
        g.fillRect(px - PW / 2, PY, PW, PH);
        g.beginPath();
        g.arc(ball.x, ball.y, R, 0, Math.PI * 2);
        g.fill();

        const blink = clock % 1 < 0.6;
        if (mode === 'attract' && !dead) {
          band(g, 160, 96);
          text(g, 'BRICKS', W / 2, 188, 30, c.fg);
          text(g, `BEST ${top}`, W / 2, 216, 14, c.fg);
          if (blink) text(g, 'PRESS SPACE', W / 2, 240, 14, c.fg);
        } else if (mode === 'over') {
          band(g, 152, 112);
          text(g, 'GAME OVER', W / 2, 178, 24, c.fg);
          text(g, `SCORE ${score}`, W / 2, 210, 14, c.fg);
          text(g, `BEST ${top}`, W / 2, 230, 14, c.fg);
          if (since >= LOCKED && blink) text(g, 'PRESS SPACE', W / 2, 252, 14, c.fg);
        } else if (mode === 'play' && stuck && blink) {
          text(g, 'SPACE TO SERVE', W / 2, 250, 12, c.fg);
        }
      },
    };
  },
};
