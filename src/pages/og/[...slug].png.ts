import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';
import { renderCard, type Card } from '../../lib/og';
import { DESCRIPTION, TAGLINE } from '../../lib/site.mjs';

const label = (part: string) => part.replace(/-/g, ' ');

// guide/concepts/sandboxing -> "Guide · Concepts"; a section index is just its section.
const eyebrow = (id: string) => {
  const parts = id.split('/');
  return (parts.length > 1 ? parts.slice(0, -1) : parts).map(label).join(' · ');
};

export const getStaticPaths = (async () => {
  const docs = await getCollection('docs');
  const landing: Card = { key: 'index', eyebrow: 'Build and release automation', title: TAGLINE, description: DESCRIPTION };
  return [
    { params: { slug: 'index' }, props: landing },
    ...docs.map((entry) => ({
      params: { slug: entry.id },
      props: { key: entry.id, eyebrow: eyebrow(entry.id), title: entry.data.title, description: entry.data.description } satisfies Card,
    })),
  ];
}) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ props }) =>
  new Response(new Uint8Array(await renderCard(props as Card)), { headers: { 'Content-Type': 'image/png' } });
