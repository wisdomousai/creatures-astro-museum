// PLACEHOLDER: to be replaced by the real game.
import { SCREEN, type GameMaker } from '../types';
import { text } from '../screen';

export const racer: GameMaker = {
  id: 'racer',
  title: 'RACER',
  keys: [{ key: 'Esc', does: 'leave' }],
  make: (c) => ({
    update() {},
    draw(g) {
      g.fillStyle = c.bg;
      g.fillRect(0, 0, SCREEN.width, SCREEN.height);
      text(g, 'RACER', SCREEN.width / 2, SCREEN.height / 2, 20, c.fg);
    },
    pad() {},
    start() {},
    stop() {},
  }),
};
