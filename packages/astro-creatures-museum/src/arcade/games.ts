// The arcade's games, by id: one to a cabinet, in the order the cabinets stand.
import { blocks } from './games/blocks';
import { bricks } from './games/bricks';
import { racer } from './games/racer';
import { snake } from './games/snake';
import type { GameMaker } from './types';

export const GAMES = new Map<string, GameMaker>(
  [blocks, racer, snake, bricks].map((g) => [g.id, g]),
);
