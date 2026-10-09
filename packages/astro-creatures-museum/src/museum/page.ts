// A page, read in the museum: step into an exhibit and its page (the real one, at its own
// address) opens over the halls; back (the button, Esc, the browser's) and you're in the
// hall again, where you were. Only <main> changes, taken from the page fetched.

export type Mode = 'walk' | 'read';

export class Pages {
  private main = document.getElementById('main')!;
  /** Did we open it (so back is the browser's back), or did the visitor arrive on it? */
  private pushed = false;
  private home: string;
  /** The halls' own title, for the tab when no page is open. */
  private title: string;
  /** Asked when the address changes under us (the browser's back and forward): is it an
   * exhibit's? The museum goes and stands at it if so. */
  onRoute?: (path: string, mode: Mode) => void;
  onClose?: () => void;
  onOpen?: () => void;

  constructor(home: string, title: string) {
    this.home = home;
    this.title = title;
    addEventListener('popstate', () => {
      const path = location.pathname;
      const mode: Mode = history.state?.museum ?? (this.isWalkPath(path) ? 'walk' : 'read');
      this.pushed = false;
      if (mode === 'walk') this.show('walk');
      else void this.load(path).then(() => this.show('read'));
      this.onRoute?.(path, mode);
    });
    addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.mode === 'read') this.close();
    });
    // Links in a page that go to another of the site's pages open in the museum too.
    this.main.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest('a');
      if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || a.target) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname === location.pathname) return;
      if (/\.(xml|json|png|jpe?g|webp|pdf|mp4)$/i.test(url.pathname)) return;
      e.preventDefault();
      this.onRoute?.(url.pathname, 'read');
      void this.open(url.pathname + url.hash);
    });
  }

  get mode(): Mode {
    return document.documentElement.dataset.museum === 'read' ? 'read' : 'walk';
  }

  /** Walk paths: the lobby and the wings' own pages (set by the museum). */
  walkPaths = new Set<string>();
  isWalkPath(path: string) {
    return this.walkPaths.has(path.replace(/\/$/, '') || '/');
  }

  private show(mode: Mode) {
    document.documentElement.dataset.museum = mode;
    if (mode === 'walk') document.title = this.title;
    else {
      this.main.scrollTop = 0;
      this.onOpen?.();
    }
  }

  /** Fetch a page and put its words in <main>. */
  private async load(href: string) {
    const res = await fetch(href);
    if (!res.ok) throw new Error(`${href}: ${res.status}`);
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const main = doc.getElementById('main');
    if (!main) throw new Error(`${href} has no <main>`);
    // The page's own styles (its components' CSS, which this page may not have had).
    const have = new Set(
      [...document.head.querySelectorAll('link[rel=stylesheet], style')].map(styleKey),
    );
    for (const s of doc.head.querySelectorAll('link[rel=stylesheet], style'))
      if (!have.has(styleKey(s))) document.head.append(document.importNode(s, true));
    this.main.innerHTML = main.innerHTML;
    document.title = doc.title;
    // Its scripts: those in <main> are inert as they came (innerHTML), so each is made
    // again; the head's modules that this page hasn't run yet are added. (A module runs
    // once a page, however often it's added.)
    for (const old of this.main.querySelectorAll('script')) old.replaceWith(rerun(old));
    const ran = new Set(
      [...document.querySelectorAll<HTMLScriptElement>('script[src]')].map((s) => s.src),
    );
    for (const s of doc.head.querySelectorAll<HTMLScriptElement>('script[type=module][src]'))
      if (!ran.has(new URL(s.getAttribute('src')!, location.href).href)) document.head.append(rerun(s));
    document.dispatchEvent(new CustomEvent('museum:page'));
  }

  /** Open a page over the halls, at its own address. */
  async open(href: string) {
    // Only the site's own pages come in like this (their HTML is the site's, as on any
    // visit to them); anywhere else is gone to the ordinary way.
    if (new URL(href, location.href).origin !== location.origin) {
      location.assign(href);
      return;
    }
    try {
      await this.load(href);
    } catch (e) {
      // Can't fetch it: go there the ordinary way.
      console.error(e);
      location.assign(href);
      return;
    }
    if (location.pathname + location.hash !== href) {
      history.pushState({ museum: 'read' }, '', href);
      this.pushed = true;
    }
    this.show('read');
    this.main.querySelector<HTMLElement>('h1')?.setAttribute('tabindex', '-1');
    this.main.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
  }

  /** Back to the halls. */
  close(walkPath?: string) {
    if (this.mode !== 'read') return;
    if (this.pushed) {
      // (popstate puts the hall back.)
      this.pushed = false;
      history.back();
      return;
    }
    history.pushState({ museum: 'walk' }, '', walkPath ?? this.home);
    this.show('walk');
    this.onClose?.();
  }

  /** Where the visitor is changed (walking into a wing): the address follows, quietly. */
  walkAt(path: string) {
    if (this.mode === 'walk' && location.pathname !== path)
      history.replaceState({ museum: 'walk' }, '', path);
  }
}

/** What makes a stylesheet the same one: its address, or its words. */
function styleKey(e: Element) {
  return e instanceof HTMLLinkElement ? new URL(e.href, location.href).href : (e.getAttribute('data-vite-dev-id') ?? e.textContent ?? '');
}

/** A script, made again so that it runs. */
function rerun(old: HTMLScriptElement): HTMLScriptElement {
  const s = document.createElement('script');
  for (const a of old.attributes) s.setAttribute(a.name, a.value);
  s.textContent = old.textContent;
  return s;
}
