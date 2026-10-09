// The arcade screens' colours in each look, and the drawing helpers every game shares.
import type { Look } from '../museum/materials';
import type { Pad, ScreenColours } from './types';

export const COLOURS: Record<Look, ScreenColours> = {
  colour: {
    bg: '#0d0b1e',
    fg: '#f4f1e8',
    dim: '#4a4670',
    pick: ['#ff4d6d', '#ffd23f', '#3bceac', '#5aa9e6', '#c77dff', '#ff9f1c', '#7bd389'],
  },
  // Paper: ink on a pale screen, the pieces in greys and a red.
  paper: {
    bg: '#f4f4f1',
    fg: '#111111',
    dim: '#b9b9b2',
    pick: ['#111111', '#c8322d', '#55554f', '#8a8a82', '#2d2d2a', '#a6a69e', '#6e6e67'],
  },
  // Ink: pale light on a black screen, like an old monochrome monitor.
  ink: {
    bg: '#121211',
    fg: '#ecece8',
    dim: '#4a4a46',
    pick: ['#ecece8', '#bdbdb7', '#9a9a94', '#d8d8d2', '#7c7c77', '#f6f6f2', '#acaca6'],
  },
};

/** A key (KeyboardEvent.code) as a pad button: arrows and W A S D, Space, Enter. */
export function padOf(code: string): Pad | null {
  switch (code) {
    case 'ArrowUp':
    case 'KeyW':
      return 'up';
    case 'ArrowDown':
    case 'KeyS':
      return 'down';
    case 'ArrowLeft':
    case 'KeyA':
      return 'left';
    case 'ArrowRight':
    case 'KeyD':
      return 'right';
    case 'Space':
      return 'a';
    case 'Enter':
      return 'b';
    default:
      return null;
  }
}

/** Blocky arcade text: monospace, bold, at size px, centred on x unless `align` says. */
export function text(
  g: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  size: number,
  colour: string,
  align: CanvasTextAlign = 'center',
) {
  g.font = `bold ${size}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillStyle = colour;
  g.fillText(s, x, y);
}

/** The best score for a game, kept in this browser (0 if none, or it can't be). */
export function best(id: string, score?: number): number {
  const key = `arcade:${id}`;
  let kept = 0;
  try {
    kept = Number(localStorage.getItem(key)) || 0;
    if (score !== undefined && score > kept) {
      localStorage.setItem(key, String(score));
      kept = score;
    }
  } catch {}
  return Math.max(kept, score ?? 0);
}
