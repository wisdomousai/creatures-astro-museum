// Words in the museum, painted on canvases: the labels beside exhibits, the signs over the
// doorways, the cards in frames for pages with no picture, books' spines. In the site's
// own type (the fonts the page has loaded).
import { CanvasTexture, SRGBColorSpace, type Texture } from 'three';

export const SERIF = "'Newsreader Variable', Georgia, serif";
export const SANS = "'Schibsted Grotesk Variable', system-ui, sans-serif";

/** The site's fonts, before anything's painted in them. */
export async function fontsReady() {
  try {
    await Promise.all([
      document.fonts.load(`400 40px ${SERIF}`),
      document.fonts.load(`italic 400 40px ${SERIF}`),
      document.fonts.load(`600 40px ${SANS}`),
      document.fonts.load(`400 40px ${SANS}`),
    ]);
  } catch {
    // (Painted in the fallbacks, then.)
  }
}

export function canvas(width: number, height: number) {
  const c = document.createElement('canvas');
  c.width = Math.round(width);
  c.height = Math.round(height);
  return { c, g: c.getContext('2d')! };
}

export function texture(c: HTMLCanvasElement): Texture {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Lines of `text` no wider than `width` in the current font, at most `max` of them (the
 * last cut short with an ellipsis). */
export function wrap(g: CanvasRenderingContext2D, text: string, width: number, max = 99): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (g.measureText(next).width <= width || !line) line = next;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  if (lines.length > max) {
    const cut = lines.slice(0, max);
    let last = cut[max - 1];
    while (last && g.measureText(`${last}…`).width > width) last = last.replace(/\s*\S+$/, '');
    cut[max - 1] = `${last}…`;
    return cut;
  }
  return lines;
}

export interface LabelText {
  kicker?: string;
  title: string;
  summary?: string;
  /** 'Step in' or an address, small at the foot. */
  foot?: string;
}

/**
 * A museum label: a small card beside an exhibit, the kicker, the title and a line or two.
 * `w` x `h` metres, at 512 px a metre.
 */
export function label(t: LabelText, w: number, h: number, paper: string, ink: string): Texture {
  const k = 512;
  const { c, g } = canvas(w * k, h * k);
  g.fillStyle = paper;
  g.fillRect(0, 0, c.width, c.height);
  const pad = 0.06 * k;
  let y = pad;
  g.fillStyle = ink;
  g.textBaseline = 'top';
  if (t.kicker) {
    g.globalAlpha = 0.62;
    g.font = `600 ${0.042 * k}px ${SANS}`;
    for (const line of wrap(g, t.kicker.toUpperCase(), c.width - 2 * pad, 1)) {
      g.fillText(line, pad, y);
      y += 0.06 * k;
    }
    g.globalAlpha = 1;
    y += 0.01 * k;
  }
  g.font = `400 ${0.085 * k}px ${SERIF}`;
  for (const line of wrap(g, t.title, c.width - 2 * pad, 2)) {
    g.fillText(line, pad, y);
    y += 0.098 * k;
  }
  // The summary, in what room the title's left (above the foot, if there's one).
  const below = c.height - pad - (t.foot ? 0.07 * k : 0) - (y + 0.02 * k);
  const room = Math.floor(below / (0.064 * k));
  if (t.summary && room >= 1) {
    y += 0.02 * k;
    g.globalAlpha = 0.78;
    g.font = `400 ${0.046 * k}px ${SANS}`;
    for (const line of wrap(g, t.summary, c.width - 2 * pad, room)) {
      g.fillText(line, pad, y);
      y += 0.064 * k;
    }
    g.globalAlpha = 1;
  }
  if (t.foot) {
    g.font = `600 ${0.04 * k}px ${SANS}`;
    g.globalAlpha = 0.7;
    g.fillText(t.foot, pad, c.height - pad - 0.04 * k);
    g.globalAlpha = 1;
  }
  return texture(c);
}

/** A card to frame for a page with no picture: its title set large, on paper. */
export function titleCard(t: LabelText, aspect: number, paper: string, ink: string, accent: string): Texture {
  const h = 1024;
  const w = Math.round(h * aspect);
  const { c, g } = canvas(w, h);
  g.fillStyle = paper;
  g.fillRect(0, 0, w, h);
  g.fillStyle = accent;
  g.fillRect(0, 0, w, h * 0.035);
  g.fillStyle = ink;
  g.textBaseline = 'top';
  const pad = h * 0.09;
  let y = pad + h * 0.02;
  if (t.kicker) {
    g.globalAlpha = 0.6;
    g.font = `600 ${h * 0.04}px ${SANS}`;
    g.fillText(t.kicker.toUpperCase(), pad, y);
    g.globalAlpha = 1;
    y += h * 0.09;
  }
  const size = h * (t.title.length > 40 ? 0.1 : 0.14);
  g.font = `400 ${size}px ${SERIF}`;
  for (const line of wrap(g, t.title, w - 2 * pad, 3)) {
    g.fillText(line, pad, y);
    y += size * 1.08;
  }
  if (t.summary) {
    y += h * 0.04;
    g.font = `italic 400 ${h * 0.055}px ${SERIF}`;
    g.globalAlpha = 0.75;
    for (const line of wrap(g, t.summary, w - 2 * pad, 4)) {
      g.fillText(line, pad, y);
      y += h * 0.072;
    }
    g.globalAlpha = 1;
  }
  return texture(c);
}

/** A sign's face: one line of words, centred, `w` x `h` metres. */
export function signFace(text: string, w: number, h: number, paper: string, ink: string): Texture {
  const k = 256;
  const { c, g } = canvas(w * k, h * k);
  g.fillStyle = paper;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = ink;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let size = c.height * 0.56;
  g.font = `400 ${size}px ${SERIF}`;
  while (g.measureText(text).width > c.width * 0.86 && size > 10) {
    size *= 0.92;
    g.font = `400 ${size}px ${SERIF}`;
  }
  g.fillText(text, c.width / 2, c.height * 0.54);
  return texture(c);
}
