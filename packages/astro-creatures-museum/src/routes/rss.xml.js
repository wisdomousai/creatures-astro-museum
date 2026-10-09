import rss from '@astrojs/rss';
import { getPosts } from '../lib';
import { site, url } from '../site';

export async function GET(context) {
  const posts = await getPosts();
  return rss({
    title: site.title,
    description: site.description,
    site: context.site,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.date,
      link: url(`/blog/${post.id}/`),
    })),
  });
}
