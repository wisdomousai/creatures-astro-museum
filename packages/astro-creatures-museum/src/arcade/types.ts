// A game in one of the arcade's cabinets. Each draws onto its cabinet's screen, a 2D
// canvas SCREEN.width x SCREEN.height units (the cabinet scales it up), and is fed the
// visitor's keys while they're playing. Nobody playing, it plays itself (or shows its
// title and best score): the attract mode, so a cabinet across the room looks alive.
// No three.js and no DOM here beyond the 2D context, so a game can be tried on its own.
import type { Look } from '../museum/materials';

/** The screen's size, in the units a game draws in: portrait, like an upright cabinet's. */
export const SCREEN = { width: 240, height: 320 } as const;

/** The screen's colours in each look: a dark glass with bright light on it in colour, the
 * look's own ink and paper otherwise. `pick` are the colours for pieces, cars, bricks…:
 * seven, all readable on `bg`. */
export interface ScreenColours {
  bg: string;
  fg: string;
  /** Dimmer than fg: grids, kerbs, the score's label. */
  dim: string;
  pick: string[];
}

/** The keys a game hears: the arrows (or W A S D, as the same), Space and Enter. */
export type Pad = 'up' | 'down' | 'left' | 'right' | 'a' | 'b';

export interface Game {
  /** Advance by dt seconds. `playing`: false while nobody is (attract mode). */
  update(dt: number, playing: boolean): void;
  /** Draw the whole screen, every time (in SCREEN units: the cabinet has scaled it). */
  draw(g: CanvasRenderingContext2D): void;
  /** A button pressed or let go. */
  pad(button: Pad, down: boolean): void;
  /** A visitor's come to play: a new game, from the start. */
  start(): void;
  /** They've gone: back to attract mode (the best score is kept). */
  stop(): void;
}

export interface GameMaker {
  id: string;
  /** For the marquee over the screen: short, in capitals (BLOCKS, RACER). */
  title: string;
  /** How it's played, for the card while playing: a few words a key. */
  keys: { key: string; does: string }[];
  make(colours: ScreenColours, look: Look): Game;
}
