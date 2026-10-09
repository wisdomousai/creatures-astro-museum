import { getCollection, getEntry, type CollectionEntry } from 'astro:content';
import { url } from './site';

// Drafts show in `astro dev` but never in a production build.
const visible = ({ data }: { data: { draft: boolean } }) => import.meta.env.DEV || !data.draft;

export type Post = CollectionEntry<'blog'> & { number: number; minutes: number };

/** Newest first. Each post gets an issue number in publication order (No. 1 is the oldest). */
export async function getPosts(): Promise<Post[]> {
  const posts = await getCollection('blog', visible);
  return posts
    .sort((a, b) => a.data.date.valueOf() - b.data.date.valueOf())
    .map((post, i) => ({ ...post, number: i + 1, minutes: readingMinutes(post.body) }))
    .reverse();
}

export async function getProjects() {
  const items = await getCollection('projects', visible);
  return items.sort(
    (a, b) => a.data.order - b.data.order || a.data.title.localeCompare(b.data.title),
  );
}

/** Projects with a written body get their own page. */
export const hasCaseStudy = (item: CollectionEntry<'projects'>) => Boolean(item.body?.trim());

/** Where a project card points: its own page if it has one, else the live project. */
export const projectHref = (item: CollectionEntry<'projects'>) =>
  hasCaseStudy(item) ? url(`/projects/${item.id}`) : (item.data.url ?? url(`/projects/${item.id}`));

export const domainOf = (address: string) => new URL(address).hostname.replace(/^www\./, '');

function readingMinutes(body = '') {
  const words = body
    .replace(/<[^>]+>/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / 230));
}

/** One of the site's own pages' words (src/content/pages/<id>.md). */
export async function page(id: 'about' | 'contact') {
  const entry = await getEntry('pages', id);
  if (!entry) throw new Error(`Missing src/content/pages/${id}.md`);
  return entry;
}
