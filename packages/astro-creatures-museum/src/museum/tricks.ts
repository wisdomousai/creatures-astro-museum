// The menu a right-click (or a long press) opens on one of the crew, at the pointer, as on
// the creatures' own pages: its name, a few of its tricks (a different few each time) with
// More for the rest, the games it could get up with whoever's about, and at the foot a way
// to send it off. A pick, a press anywhere else,
// Escape or the window changing size shuts it; the arrow keys go from one key to the next.
import type { Character } from '@wisdomousai/creatures';

/** How many of its tricks the menu offers at first, picked at random. */
const FEW = 6;

/** A name as words ('inspectClaw': 'inspect claw'), as it's written on a key. */
const words = (name: string) => name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();

let shown: { el: HTMLElement; shut: () => void } | null = null;

/** Shut the menu, if one's open. */
export function shutTricks() {
  shown?.shut();
}

/** Is one open? */
export function tricksOpen() {
  return shown !== null;
}

export function tricks(
  parent: HTMLElement,
  at: { x: number; y: number },
  c: Character,
  games: { names: string[]; play: (name: string) => void } | null = null,
) {
  shown?.shut();
  const name = c.spec.name;
  const items = c.repertoire;
  const el = document.createElement('div');
  el.className = 'm-tricks';
  el.setAttribute('role', 'menu');
  el.setAttribute('aria-label', `${name}'s tricks`);
  const head = document.createElement('div');
  head.className = 'm-tricks-name';
  head.textContent = name;
  const list = document.createElement('div');
  list.className = 'm-tricks-items';
  const button = (label: string, cls: string, fire: () => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.setAttribute('role', 'menuitem');
    b.textContent = label;
    b.onclick = () => {
      shut();
      fire();
    };
    return b;
  };
  const keys = (names: string[]) =>
    names.map((item) => button(words(item), 'm-tricks-item', () => c.perform(item)));
  // A few at random, in its own order (not idle, which shows nothing); the rest wait
  // behind More, unless there are hardly any more than the few.
  const few =
    items.length > FEW + 2
      ? new Set(
          items
            .filter((item) => item !== 'idle')
            .map((item) => ({ item, at: Math.random() }))
            .sort((a, b) => a.at - b.at)
            .slice(0, FEW)
            .map((r) => r.item),
        )
      : new Set(items.filter((item) => item !== 'idle'));
  const buttons = keys(items.filter((item) => few.has(item)));
  list.append(...buttons);
  el.append(head, list);
  const rest = items.filter((item) => !few.has(item) && item !== 'idle');
  if (rest.length) {
    const more = button('More', 'm-tricks-more', () => {});
    more.onclick = () => {
      const added = keys(rest);
      list.append(...added);
      more.remove();
      buttons.splice(buttons.indexOf(more), 1, ...added);
      place();
      added[0]?.focus({ preventScroll: true });
    };
    el.append(more);
    buttons.push(more);
  }
  if (games?.names.length) {
    const head = document.createElement('div');
    head.className = 'm-tricks-name m-tricks-games';
    head.textContent = 'Play';
    const row = document.createElement('div');
    row.className = 'm-tricks-items';
    const keys = games.names.map((g) => button(words(g), 'm-tricks-item', () => games.play(g)));
    row.append(...keys);
    el.append(head, row);
    buttons.push(...keys);
  }
  const off = button('Send off', 'm-tricks-last', () => c.leave());
  el.append(off);
  buttons.push(off);
  parent.append(el);
  // At the pointer, kept on the screen (again when More makes it longer).
  const place = () => {
    const r = el.getBoundingClientRect();
    el.style.left = `${Math.max(8, Math.min(at.x, innerWidth - r.width - 8))}px`;
    el.style.top = `${Math.max(8, Math.min(at.y, innerHeight - r.height - 8))}px`;
  };
  place();
  el.animate([{ opacity: 0, transform: 'scale(0.96)' }, { opacity: 1 }], {
    duration: 160,
    easing: 'ease-out',
  });

  const outside = (e: PointerEvent) => {
    if (!el.contains(e.target as Node)) shut();
  };
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      shut();
      return;
    }
    const by = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (by === undefined) return;
    e.preventDefault();
    const k = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[(k + by + buttons.length) % buttons.length]?.focus();
  };
  function shut() {
    if (shown?.el !== el) return;
    shown = null;
    el.remove();
    removeEventListener('pointerdown', outside, true);
    removeEventListener('keydown', key, true);
    removeEventListener('resize', shut);
  }
  addEventListener('pointerdown', outside, true);
  addEventListener('keydown', key, true);
  addEventListener('resize', shut);
  shown = { el, shut };
  buttons[0]?.focus({ preventScroll: true });
}
