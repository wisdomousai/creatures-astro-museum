// The museum's plan, from the site's content: every page of every wing's collection as an
// entry, its pictures made to size, laid out by plan/generate.ts. Served as /museum.json.
import { getImage } from 'astro:assets';
import { getCollection, type CollectionEntry } from 'astro:content';
import type { ImageMetadata } from 'astro';
import { generate } from './plan/generate';
import type { Entry, Picture, Plan } from './plan/types';
import { getPosts, hasCaseStudy, page } from './lib';
import { formatDate, site, url } from './site';

/** What any collection's entry might have, as far as the museum is concerned. */
interface Data {
  title?: string;
  summary?: string;
  description?: string;
  url?: string;
  date?: Date;
  order?: number;
  draft?: boolean;
  period?: string;
  role?: string;
  cover?: ImageMetadata;
  exhibit?: {
    template?: string;
    wing?: string;
    order?: number;
    size: 's' | 'm' | 'l';
    room: boolean;
    hidden: boolean;
    image?: ImageMetadata;
    video?: string;
    film?: string;
    gallery: ImageMetadata[];
    model?: string;
  };
}

/** A picture for a wall: no wider than it needs to be, as webp. */
async function picture(src: ImageMetadata | undefined, width = 1600): Promise<Picture | null> {
  if (!src) return null;
  const w = Math.min(width, src.width);
  const made = await getImage({ src, width: w, format: 'webp', quality: 82 });
  return { src: made.src, width: w, height: Math.round((src.height * w) / src.width) };
}

async function entry(
  collection: string,
  id: string,
  data: Data,
  template: string,
  href: string,
  inside: boolean,
  kicker: string,
): Promise<Entry> {
  const x = data.exhibit;
  return {
    key: `${collection}/${id}`,
    collection,
    title: data.title ?? id,
    summary: data.summary ?? data.description ?? '',
    href,
    inside,
    kicker,
    template: x?.template ?? template,
    size: x?.size ?? 'm',
    room: x?.room ?? false,
    image: await picture(x?.image ?? data.cover),
    video: x?.video ? url(x.video) : null,
    film: x?.film ? (/^[a-z]+:/i.test(x.film) ? x.film : url(x.film)) : null,
    gallery: (await Promise.all((x?.gallery ?? []).map((g) => picture(g, 1400)))).filter(
      (p): p is Picture => p !== null,
    ),
    model: x?.model ? url(x.model) : null,
    date: data.date ? data.date.toISOString() : null,
  };
}

/** A wing's entries, in the order they're hung: the collection's own order, newest first,
 * or by title. */
async function wingEntries(wing: (typeof site.wings)[number]): Promise<Entry[]> {
  const path = wing.path ?? `/${wing.collection}`;
  if (wing.collection === 'blog') {
    const posts = await getPosts();
    return Promise.all(
      posts
        .filter((p) => !(p.data as Data).exhibit?.hidden)
        .map((p) =>
          entry('blog', p.id, p.data as Data, wing.template, url(`${path}/${p.id}`), true, `No. ${p.number} · ${formatDate(p.data.date)}`),
        ),
    );
  }
  const items = (await getCollection(wing.collection as 'projects')) as {
    id: string;
    data: Data;
    body?: string;
  }[];
  const shown = items.filter(
    ({ data }) => (import.meta.env.DEV || !data.draft) && !data.exhibit?.hidden,
  );
  const rank = (d: Data) => d.exhibit?.order ?? d.order;
  shown.sort((a, b) => {
    const ra = rank(a.data);
    const rb = rank(b.data);
    if (ra !== undefined || rb !== undefined) return (ra ?? 1e9) - (rb ?? 1e9);
    if (a.data.date && b.data.date) return b.data.date.valueOf() - a.data.date.valueOf();
    return (a.data.title ?? a.id).localeCompare(b.data.title ?? b.id);
  });
  return Promise.all(
    shown.map((item) => {
      // A project with a page of its own opens it; one with only an address goes there.
      const own =
        wing.collection !== 'projects' || hasCaseStudy(item as CollectionEntry<'projects'>);
      const href = own ? url(`${path}/${item.id}`) : (item.data.url ?? url(path));
      const kicker = [item.data.period, item.data.role].filter(Boolean).join(' · ');
      return entry(wing.collection, item.id, item.data, wing.template, href, own, kicker);
    }),
  );
}

export async function museumPlan(): Promise<Plan> {
  const wings = await Promise.all(
    site.wings.map(async (w) => ({
      path: url(w.path ?? `/${w.collection}`),
      label: w.label,
      entries: await wingEntries(w),
    })),
  );
  const about = await page('about');
  const contact = await page('contact');
  return generate({
    title: site.title,
    wings,
    about: await entry('pages', 'about', { ...about.data, title: about.data.title }, 'about-wall', url('/about'), true, site.author),
    contact: await entry('pages', 'contact', contact.data, 'front-desk', url('/contact'), true, site.email),
    filler: site.filler,
  });
}
