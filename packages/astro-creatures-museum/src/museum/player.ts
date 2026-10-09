// Watching a film in the museum: the visitor has walked up to the screen, and the film
// comes up over it in its frame, with sound, the halls dimmed behind. Esc, the × or a
// click beside it and it's gone, and the visitor is where they were.
import { filmControls } from '../film/controls';

export interface Film {
  src: string;
  poster?: string;
  title: string;
  kicker?: string;
}

export class Player {
  private root: HTMLElement | null = null;
  private done: (() => void) | null = null;
  private returnFocus: Element | null = null;
  onClose?: () => void;

  get open() {
    return this.root !== null;
  }

  show(film: Film) {
    this.close();
    this.returnFocus = document.activeElement;
    const root = document.createElement('div');
    root.className = 'm-player';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', film.title);

    const figure = document.createElement('figure');
    const video = document.createElement('video');
    video.src = film.src;
    if (film.poster) video.poster = film.poster;
    video.playsInline = true;
    video.preload = 'auto';
    figure.append(video);
    const caption = document.createElement('figcaption');
    if (film.kicker) {
      const k = document.createElement('span');
      k.className = 'm-player-kicker';
      k.textContent = film.kicker;
      caption.append(k, ' ');
    }
    caption.append(film.title);
    figure.append(caption);

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'm-button m-player-close';
    close.setAttribute('aria-label', 'Close the film');
    close.textContent = '×';
    figure.append(close);

    root.append(figure);
    document.body.append(root);
    const off = filmControls(figure, video);

    const shut = () => this.close();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        shut();
      }
    };
    close.addEventListener('click', shut);
    root.addEventListener('click', (e) => e.target === root && shut());
    addEventListener('keydown', key, true);
    this.done = () => {
      removeEventListener('keydown', key, true);
      off();
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
    this.root = root;
    figure.focus({ preventScroll: true });
    // With sound if it may (the Watch click was a moment ago); without, if not.
    video.play().catch(() => {
      video.muted = true;
      return video.play().catch(() => {});
    });
  }

  close() {
    if (!this.root) return;
    const root = this.root;
    this.root = null;
    this.done?.();
    this.done = null;
    root.classList.add('m-player-out');
    setTimeout(() => root.remove(), 250);
    (this.returnFocus as HTMLElement | null)?.focus?.({ preventScroll: true });
    this.onClose?.();
  }
}
