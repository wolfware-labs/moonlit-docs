import { defineRouteMiddleware } from '@astrojs/starlight/route-data';
import { ogImage, ogImageAlt } from './lib/site.mjs';

type Entry = { type: 'link' | 'group'; isCurrent?: boolean; entries?: Entry[] };

const containsCurrent = (entry: Entry): boolean =>
  entry.type === 'link' ? Boolean(entry.isCurrent) : (entry.entries ?? []).some(containsCurrent);

// The sidebar config has one top-level group per section (Guide, Reference, Cookbook). The header
// already switches between sections, so the sidebar shows only the section's own pages.
export const onRequest = defineRouteMiddleware((context) => {
  const route = context.locals.starlightRoute;

  const image = new URL(ogImage(route.entry.id), context.site).href;
  const alt = ogImageAlt(route.entry.data.title);
  route.head.push(
    { tag: 'meta', attrs: { property: 'og:image', content: image } },
    { tag: 'meta', attrs: { property: 'og:image:width', content: '1200' } },
    { tag: 'meta', attrs: { property: 'og:image:height', content: '630' } },
    { tag: 'meta', attrs: { property: 'og:image:alt', content: alt } },
    { tag: 'meta', attrs: { name: 'twitter:image', content: image } },
    { tag: 'meta', attrs: { name: 'twitter:image:alt', content: alt } },
  );

  const section = (route.sidebar as Entry[]).find(containsCurrent);
  if (section?.type === 'group' && section.entries) route.sidebar = section.entries as typeof route.sidebar;
});
