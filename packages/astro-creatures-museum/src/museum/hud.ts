// What's over the halls: the site's name and the room you're in, a map (every wing and
// exhibit, as links, so the museum can be gone round by keyboard and read by a screen
// reader), the controls till you've walked and looked round, the caption of the exhibit you've come to, and the
// way back out of a page.
import type { Entry, Hung, Plan } from '../plan/types';
import type { Palette } from './materials';

export interface Caption {
  hung: Hung;
  entry: Entry;
  watch: boolean;
}

export class Hud {
  readonly root: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  private room: HTMLElement;
  private hint: HTMLElement;
  private caption: HTMLElement;
  private index: HTMLElement;
  private loading: HTMLElement;
  private mapButton: HTMLButtonElement;
  onStep?: (c: Caption) => void;
  onWatch?: (c: Caption) => void;
  onGo?: (hung: Hung | null, wing: string | null) => void;
  onClose?: () => void;
  private current: Caption | null = null;
  private keys = new Map<string, HTMLElement>();
  private done = new Set<'walk' | 'look'>();

  constructor(title: string, home: string, palette: Palette) {
    const root = document.createElement('div');
    root.id = 'museum';
    // (On the page as a whole: the way back sits over the page being read, outside this.)
    const css = document.documentElement.style;
    css.setProperty('--m-trim', palette.roles.Trim);
    css.setProperty('--m-brass', palette.roles.Brass);
    css.setProperty('--m-velvet', palette.roles.Velvet);
    css.setProperty('--m-paper', palette.paper);
    css.setProperty('--m-ink', palette.ink);
    root.innerHTML = `
      <canvas class="m-canvas" aria-hidden="true"></canvas>
      <header class="m-top">
        <p class="m-where"><a class="m-brand"></a><span class="m-room"></span></p>
        <div class="m-actions">
          <button class="m-button m-map" type="button" aria-expanded="false" aria-controls="m-index">Map</button>
          <a class="m-button m-flat" href="?flat">Plain site</a>
        </div>
      </header>
      <nav class="m-index" id="m-index" aria-label="The museum's rooms" hidden></nav>
      <aside class="m-hint" aria-label="How to get about">
        <div class="m-keys">
          <div class="m-pad" aria-hidden="true">
            <kbd data-key="KeyW">W</kbd><kbd data-key="KeyA">A</kbd><kbd data-key="KeyS">S</kbd><kbd data-key="KeyD">D</kbd>
          </div>
          <p><b>W A S D</b> walk</p>
        </div>
        <div class="m-keys">
          <div class="m-pad" aria-hidden="true">
            <kbd data-key="ArrowUp">↑</kbd><kbd data-key="ArrowLeft">←</kbd><kbd data-key="ArrowDown">↓</kbd><kbd data-key="ArrowRight">→</kbd>
          </div>
          <p><b>Arrows</b> look around</p>
        </div>
        <p class="m-also">or drag to look · click the floor or an exhibit to go there · <kbd>Shift</kbd> to hurry</p>
      </aside>
      <section class="m-caption" aria-live="polite" hidden>
        <p class="m-kicker"></p>
        <h2 class="m-title"></h2>
        <p class="m-summary"></p>
        <p class="m-do">
          <button class="m-button m-step" type="button">Step in <span aria-hidden="true">↵</span></button>
          <button class="m-button m-watch" type="button" hidden>Watch <span aria-hidden="true">▶</span></button>
        </p>
      </section>
      <p class="m-loading" role="status">Opening the museum…</p>`;
    // The way back from a page: over the page, so not in the museum's own layer.
    const close = document.createElement('button');
    close.className = 'm-button m-close';
    close.type = 'button';
    close.textContent = '← Back to the hall';
    close.addEventListener('click', () => this.onClose?.());
    document.body.append(root, close);
    this.root = root;
    this.canvas = root.querySelector('.m-canvas')!;
    this.room = root.querySelector('.m-room')!;
    this.hint = root.querySelector('.m-hint')!;
    for (const k of this.hint.querySelectorAll<HTMLElement>('[data-key]'))
      this.keys.set(k.dataset.key!, k);
    this.caption = root.querySelector('.m-caption')!;
    this.index = root.querySelector('.m-index')!;
    this.loading = root.querySelector('.m-loading')!;
    this.mapButton = root.querySelector('.m-map')!;
    const brand = root.querySelector<HTMLAnchorElement>('.m-brand')!;
    brand.textContent = title;
    brand.href = home;
    root
      .querySelector('.m-step')!
      .addEventListener('click', () => this.current && this.onStep?.(this.current));
    root
      .querySelector('.m-watch')!
      .addEventListener('click', () => this.current && this.onWatch?.(this.current));
    this.mapButton.addEventListener('click', () => this.toggleIndex());
    root.querySelector('.m-brand')!.addEventListener('click', (e) => {
      e.preventDefault();
      this.onGo?.(null, null);
    });
    addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && this.current && document.activeElement === document.body)
        this.onStep?.(this.current);
      if (e.key === 'Escape' && !this.index.hidden) this.toggleIndex(false);
    });
  }

  ready() {
    this.loading.hidden = true;
  }

  failed() {
    this.loading.textContent = 'The museum couldn’t open here.';
  }

  /** The map: the lobby, then each wing and what's in it. */
  setIndex(plan: Plan) {
    const list = document.createElement('ul');
    const lobby = document.createElement('li');
    lobby.append(this.link('The lobby', '#', () => this.onGo?.(null, null)));
    const lobbyItems = plan.hung.filter((h) => h.slot.room === 'lobby' && h.entries.length);
    lobby.append(this.items(lobbyItems));
    list.append(lobby);
    for (const w of plan.wings) {
      const li = document.createElement('li');
      li.append(this.link(w.label, w.path, () => this.onGo?.(null, w.path)));
      const rooms = new Set(plan.rooms.filter((r) => r.wing === w.label).map((r) => r.id));
      li.append(this.items(plan.hung.filter((h) => rooms.has(h.slot.room) && h.entries.length)));
      list.append(li);
    }
    this.index.replaceChildren(list);
  }

  private items(hung: Hung[]) {
    const ul = document.createElement('ul');
    for (const h of hung)
      for (const e of h.entries) {
        const li = document.createElement('li');
        li.append(this.link(e.title, e.href, () => this.onGo?.(h, null)));
        ul.append(li);
      }
    return ul;
  }

  private link(text: string, href: string, go: () => void) {
    const a = document.createElement('a');
    a.href = href;
    a.textContent = text;
    a.addEventListener('click', (e) => {
      e.preventDefault();
      this.toggleIndex(false);
      go();
    });
    return a;
  }

  private toggleIndex(open = this.index.hidden) {
    this.index.hidden = !open;
    this.mapButton.setAttribute('aria-expanded', String(open));
    if (open) this.index.querySelector('a')?.focus();
  }

  setRoom(name: string) {
    this.room.textContent = name;
  }

  /** A key down or up: its cap on the controls lights while it's held. */
  press(code: string, down: boolean) {
    this.keys.get(code)?.classList.toggle('m-on', down);
  }

  /** Every key let go. */
  release() {
    for (const k of this.keys.values()) k.classList.remove('m-on');
  }

  /** The visitor has walked or looked by themselves. Once they've done both, the controls
   * have been learnt, and go. */
  moved(how: 'walk' | 'look') {
    if (this.done.has(how)) return;
    this.done.add(how);
    if (this.done.size === 2) setTimeout(() => this.hint.classList.add('m-gone'), 1500);
  }

  show(c: Caption | null) {
    this.current = c;
    this.caption.hidden = !c;
    // (The controls make way for a caption.)
    this.hint.classList.toggle('m-aside', !!c);
    if (!c) return;
    const q = <T extends HTMLElement>(s: string) => this.caption.querySelector<T>(s)!;
    q('.m-kicker').textContent = c.entry.kicker;
    q('.m-title').textContent = c.entry.title;
    q('.m-summary').textContent = c.entry.summary;
    const arrow = document.createElement('span');
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = c.entry.inside ? '↵' : '↗';
    const host = new URL(c.entry.href, location.href).hostname.replace(/^www\./, '');
    q('.m-step').replaceChildren(c.entry.inside ? 'Step in ' : `Visit ${host} `, arrow);
    q('.m-watch').hidden = !c.watch;
  }
}
