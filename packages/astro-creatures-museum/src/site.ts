/// <reference path="./virtual.d.ts" />
import config from 'virtual:astro-creatures-museum/config';

/** The site's settings: the integration's options in astro.config.mjs, with their defaults. */
export const site = config;

/** A path on this site, under the base it was built for (`/blog` → `/my-repo/blog`). */
export function url(path: string) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return path.startsWith('/') ? base + path : path;
}

export function formatDate(date: Date) {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}
