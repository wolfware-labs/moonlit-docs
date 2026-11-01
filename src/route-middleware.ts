import { defineRouteMiddleware } from '@astrojs/starlight/route-data';

type Entry = { type: 'link' | 'group'; isCurrent?: boolean; entries?: Entry[] };

const containsCurrent = (entry: Entry): boolean =>
  entry.type === 'link' ? Boolean(entry.isCurrent) : (entry.entries ?? []).some(containsCurrent);

// The sidebar config has one top-level group per section (Guide, Reference, Cookbook). The header
// already switches between sections, so the sidebar shows only the section's own pages.
export const onRequest = defineRouteMiddleware((context) => {
  const route = context.locals.starlightRoute;
  const section = (route.sidebar as Entry[]).find(containsCurrent);
  if (section?.type === 'group' && section.entries) route.sidebar = section.entries as typeof route.sidebar;
});
