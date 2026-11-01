import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineMdastPlugin } from 'satteri';

const CONTENT_ROOT = fileURLToPath(new URL('../content/docs/', import.meta.url));

/**
 * Rewrites relative links to other Markdown pages (`./configuration.md#syntax`) into the URL
 * Starlight serves that page at (`/guide/concepts/configuration/#syntax`).
 *
 * The sources keep plain `.md` links so they still resolve when browsed on GitHub; VitePress did
 * this rewrite on its own, Starlight does not.
 */
export function mdLinks(ctx) {
  if (!ctx.fileURL) return null;
  const dir = path.dirname(fileURLToPath(ctx.fileURL));
  const fix = (node, c) => {
    const url = rewrite(node.url, dir);
    if (url) c.setProperty(node, 'url', url);
  };
  return defineMdastPlugin({ name: 'moonlit-md-links', link: fix, definition: fix });
}

function rewrite(url, dir) {
  if (/^([a-z][a-z0-9+.-]*:|\/|#)/i.test(url)) return null;
  const [target, hash = ''] = url.split(/(?=#)/);
  // A page (`./plugins.md`) or a section's index by its folder (`../guide/`).
  if (!/\.mdx?$/.test(target) && !target.endsWith('/')) return null;
  const rel = path.relative(CONTENT_ROOT, path.resolve(dir, target.endsWith('/') ? `${target}index.md` : target));
  if (rel.startsWith('..')) return null;
  const slug = rel
    .replace(/\.mdx?$/, '')
    .replace(/(^|\/)index$/, '')
    .split(path.sep)
    .join('/');
  return `/${slug}${slug ? '/' : ''}${hash}`;
}
