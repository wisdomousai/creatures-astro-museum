// The museum's own art, between the exhibits: paintings and sculptures made up from a
// seed, so the same wall always has the same picture. Add a family of your own to
// PAINTERS or SCULPTORS (the museum-make skill does it with you).
import {
  CylinderGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  BoxGeometry,
  type Texture,
} from 'three';
import { pick, rng } from '../plan/rng';
import type { Look } from './materials';
import { canvas, texture } from './text';

type Paint = (g: CanvasRenderingContext2D, w: number, h: number, r: () => number, colours: string[]) => void;

/** Sets of colours a painting is made from, in each look. */
const COLOURS: Record<Look, string[][]> = {
  colour: [
    ['#f2e8cf', '#386641', '#6a994e', '#a7c957', '#bc4749'],
    ['#fdf0d5', '#003049', '#c1121f', '#669bbc', '#780000'],
    ['#f4f1de', '#e07a5f', '#3d405b', '#81b29a', '#f2cc8f'],
    ['#fefae0', '#283618', '#606c38', '#dda15e', '#bc6c25'],
    ['#edf2f4', '#2b2d42', '#8d99ae', '#ef233c', '#d90429'],
    ['#fff8e7', '#264653', '#2a9d8f', '#e9c46a', '#e76f51'],
    ['#f1faee', '#1d3557', '#457b9d', '#a8dadc', '#e63946'],
  ],
  paper: [
    ['#f4f4f1', '#111111', '#55554f', '#9b9b94', '#d6d6d1'],
    ['#fbfbf8', '#1c1c1b', '#6e6e68', '#b9b9b2', '#e0e0db'],
  ],
  ink: [
    ['#1a1a18', '#ecece8', '#b89548', '#6b2f2c', '#55554f'],
    ['#121212', '#d9d9d2', '#8d99ae', '#b8423c', '#3a3631'],
  ],
};

export const PAINTERS: Record<string, Paint> = {
  /** Soft blocks of colour stacked up, edges breathing (after Rothko). */
  bands(g, w, h, r, c) {
    g.fillStyle = c[1];
    g.fillRect(0, 0, w, h);
    const n = 2 + Math.floor(r() * 2);
    const pad = w * 0.08;
    let y = pad;
    const each = (h - pad * (n + 1)) / n;
    for (let i = 0; i < n; i++) {
      g.fillStyle = c[2 + ((i + Math.floor(r() * 3)) % 3)];
      g.filter = `blur(${w * 0.012}px)`;
      g.globalAlpha = 0.92;
      g.fillRect(pad, y, w - 2 * pad, each * (0.8 + r() * 0.4));
      y += each + pad;
    }
    g.filter = 'none';
    g.globalAlpha = 1;
  },
  /** Circles, half-circles and bars on a grid (after the Bauhaus). */
  bauhaus(g, w, h, r, c) {
    g.fillStyle = c[0];
    g.fillRect(0, 0, w, h);
    const cols = 3 + Math.floor(r() * 3);
    const s = w / cols;
    const rows = Math.ceil(h / s);
    for (let i = 0; i < cols; i++)
      for (let j = 0; j < rows; j++) {
        const x = i * s;
        const y = j * s;
        g.fillStyle = pick(c.slice(1), r());
        const kind = Math.floor(r() * 5);
        g.beginPath();
        if (kind === 0) g.arc(x + s / 2, y + s / 2, s * 0.42, 0, Math.PI * 2);
        else if (kind === 1) {
          const a = Math.floor(r() * 4) * (Math.PI / 2);
          g.moveTo(x + s / 2, y + s / 2);
          g.arc(x + s / 2, y + s / 2, s * 0.48, a, a + Math.PI);
        } else if (kind === 2) g.rect(x + s * 0.1, y + s * 0.38, s * 0.8, s * 0.24);
        else if (kind === 3) {
          g.moveTo(x, y + s);
          g.arc(x, y + s, s, -Math.PI / 2, 0);
        }
        g.fill();
      }
  },
  /** A field of lines, all following the same unseen current. */
  flow(g, w, h, r, c) {
    g.fillStyle = c[0];
    g.fillRect(0, 0, w, h);
    const f1 = 1 + r() * 3;
    const f2 = 1 + r() * 3;
    const ph = r() * 10;
    g.lineCap = 'round';
    for (let k = 0; k < 700; k++) {
      let x = r() * w;
      let y = r() * h;
      g.strokeStyle = pick(c.slice(1), r());
      g.globalAlpha = 0.65;
      g.lineWidth = w * (0.002 + r() * 0.006);
      g.beginPath();
      g.moveTo(x, y);
      for (let s = 0; s < 40; s++) {
        const a = Math.sin((x / w) * f1 * Math.PI + ph) * 2 + Math.cos((y / h) * f2 * Math.PI) * 2;
        x += Math.cos(a) * w * 0.006;
        y += Math.sin(a) * w * 0.006;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    g.globalAlpha = 1;
  },
  /** An ink blot, folded down the middle. */
  blot(g, w, h, r, c) {
    g.fillStyle = c[0];
    g.fillRect(0, 0, w, h);
    g.fillStyle = c[1];
    for (let k = 0; k < 60; k++) {
      const x = w / 2 + (r() ** 1.6) * w * 0.38;
      const y = h * 0.15 + r() * h * 0.7;
      const s = w * (0.01 + r() ** 3 * 0.12);
      for (const side of [1, -1]) {
        g.beginPath();
        g.ellipse(w / 2 + (x - w / 2) * side, y, s, s * (0.6 + r() * 0.8), 0, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.fillStyle = c[4];
    g.globalAlpha = 0.85;
    g.beginPath();
    g.arc(w / 2, h * (0.3 + r() * 0.4), w * 0.04, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
  },
  /** Hills going back into the distance, a sun over them. */
  hills(g, w, h, r, c) {
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, c[0]);
    sky.addColorStop(1, c[3]);
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    g.fillStyle = c[4];
    g.beginPath();
    g.arc(w * (0.2 + r() * 0.6), h * (0.2 + r() * 0.15), w * 0.09, 0, Math.PI * 2);
    g.fill();
    const layers = 4;
    for (let i = 0; i < layers; i++) {
      g.fillStyle = c[1 + (i % 3)];
      g.globalAlpha = 0.55 + (i / layers) * 0.45;
      const base = h * (0.45 + i * 0.13);
      const f = 1.5 + r() * 2.5;
      const p = r() * 6;
      g.beginPath();
      g.moveTo(0, h);
      for (let x = 0; x <= w; x += w / 60)
        g.lineTo(x, base + Math.sin((x / w) * f * Math.PI + p) * h * 0.05);
      g.lineTo(w, h);
      g.fill();
    }
    g.globalAlpha = 1;
  },
  /** Stripes, turned, seen through a round window. */
  stripes(g, w, h, r, c) {
    g.fillStyle = c[0];
    g.fillRect(0, 0, w, h);
    g.save();
    g.beginPath();
    g.arc(w / 2, h / 2, Math.min(w, h) * (0.3 + r() * 0.12), 0, Math.PI * 2);
    g.clip();
    g.translate(w / 2, h / 2);
    g.rotate((Math.floor(r() * 8) * Math.PI) / 8);
    const s = w * (0.04 + r() * 0.05);
    for (let i = -30; i < 30; i++) {
      g.fillStyle = c[1 + (((i % 4) + 4) % 4)];
      g.fillRect(i * s, -h * 2, s, h * 4);
    }
    g.restore();
  },
};

/** A painting for a seed: `aspect` wide over high. */
export function painting(seed: number, aspect: number, look: Look): Texture {
  const r = rng(seed);
  const painter = pick(Object.values(PAINTERS), r());
  const colours = pick(COLOURS[look], r());
  const h = 768;
  const w = Math.round(h * aspect);
  const { c, g } = canvas(w, h);
  painter(g, w, h, r, colours);
  // A little grain, so it reads as paint on canvas.
  const img = g.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * 14;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  return texture(c);
}

type Sculpt = (r: () => number, m: (i: number) => MeshStandardMaterial) => Group;

export const SCULPTORS: Record<string, Sculpt> = {
  /** A vase turned on a lathe. */
  vase(r, m) {
    const pts: Vector2[] = [];
    const h = 0.7 + r() * 0.5;
    const a = 0.12 + r() * 0.1;
    const b = 0.05 + r() * 0.08;
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      pts.push(new Vector2(0.03 + a * Math.sin(Math.PI * t * (0.8 + r() * 0.05)) + b * Math.sin(t * 9), t * h));
    }
    const g = new Group();
    g.add(new Mesh(new LatheGeometry(pts, 48), m(0)));
    return g;
  },
  /** Blocks stacked and twisted. */
  twist(r, m) {
    const g = new Group();
    const n = 5 + Math.floor(r() * 5);
    const turn = (r() - 0.5) * 0.6;
    let y = 0;
    for (let i = 0; i < n; i++) {
      const s = 0.42 - i * (0.25 / n);
      const hgt = 0.12 + r() * 0.06;
      const b = new Mesh(new BoxGeometry(s, hgt, s), m(i));
      b.position.y = y + hgt / 2;
      b.rotation.y = i * turn;
      y += hgt;
      g.add(b);
    }
    return g;
  },
  /** Balls and rings, balanced. */
  balance(r, m) {
    const g = new Group();
    let y = 0;
    const n = 3 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      if (r() < 0.6) {
        const s = 0.12 + r() * 0.1;
        const ball = new Mesh(new SphereGeometry(s, 32, 16), m(i));
        ball.position.set((r() - 0.5) * 0.05, y + s, 0);
        y += s * 2;
        g.add(ball);
      } else {
        const s = 0.14 + r() * 0.08;
        const ring = new Mesh(new TorusGeometry(s, 0.035, 16, 48), m(i));
        ring.position.y = y + s + 0.035;
        ring.rotation.y = r() * Math.PI;
        y += 2 * s + 0.07;
        g.add(ring);
      }
    }
    const stem = new Mesh(new CylinderGeometry(0.015, 0.015, y), m(99));
    stem.position.y = y / 2;
    g.add(stem);
    return g;
  },
};

/** A sculpture for a seed, standing at the origin, in the look's colours. */
export function sculpture(seed: number, look: Look): Group {
  const r = rng(seed);
  const sculptor = pick(Object.values(SCULPTORS), r());
  const colours = pick(COLOURS[look], r());
  const made = new Map<number, MeshStandardMaterial>();
  const m = (i: number) => {
    let mat = made.get(i);
    if (!mat) {
      const shiny = r() < 0.3;
      mat = new MeshStandardMaterial({
        color: i === 99 ? colours[1] : colours[1 + (i % 4)],
        roughness: shiny ? 0.25 : 0.55,
        metalness: shiny ? 0.6 : 0,
      });
      made.set(i, mat);
    }
    return mat;
  };
  const g = sculptor(r, m);
  g.traverse((o) => {
    if ((o as Mesh).isMesh) o.castShadow = o.receiveShadow = true;
  });
  return g;
}
