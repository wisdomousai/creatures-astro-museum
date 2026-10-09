/**
 * The museum or the flat site: the same pages at the same addresses. Base.astro's head
 * script picks before the page shows (?museum or ?flat, kept by this browser; the flat
 * site for search engines and browsers without WebGL2) and sets html[data-museum] to
 * 'walk' (the lobby, a wing) or 'read' (a page, open over the halls).
 */

export const inMuseum = () => document.documentElement.dataset.museum !== undefined;

/** Over to the flat site, at the same address. */
export function leaveMuseum() {
  location.assign(`${location.pathname}?flat${location.hash}`);
}

/** The museum behind the page, if it's to be. */
export async function start() {
  if (!inMuseum()) return;
  try {
    const { open } = await import('../museum/boot');
    if (await open()) return;
  } catch (e) {
    console.error(e);
  }
  // It couldn't open: this page is shown as it is.
  delete document.documentElement.dataset.museum;
}
