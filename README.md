# Moonlit Documentation

The source for [moonlit.rs](https://moonlit.rs/), the documentation site for
[Moonlit](https://github.com/wolfware-labs/moonlit). Built with [Astro](https://astro.build/) and [Starlight](https://starlight.astro.build/).

This repository holds the prose. The CLI, the engine, and the plugin development kit live in
[`wolfware-labs/moonlit`](https://github.com/wolfware-labs/moonlit); published plugins live in the
[registry](https://registry.moonlit.rs).

## Layout

| Path | Contents |
| --- | --- |
| `src/pages/index.astro` | The landing page, built from `src/components/landing/` |
| `src/content/docs/guide/` | Installation, quick start, concepts, and plugin authoring |
| `src/content/docs/reference/` | CLI, configuration file, plugin system, WIT contract, plugin SDK, and error reference |
| `src/content/docs/cookbook/` | Complete `release.yml` recipes, end to end |
| `src/components/` | `InstallCommand`, `FlowDiagram`, the landing sections, and the Starlight header overrides |
| `src/lib/site.mjs` | Site constants: URLs, the docs sections, and the install commands per platform |
| `src/styles/` | Design tokens, the Starlight theme mapping, and the landing styles |
| `public/` | Static assets served from the site root (logos, `robots.txt`) |
| `astro.config.mjs` | Site config, sidebar, Markdown processing, and SEO |
| `versions.json` | The version list archived doc versions read, copied into the build |
| `Dockerfile`, `nginx.conf` | The container image the site ships in |
| `release.yml` | The Moonlit pipeline that builds and releases that image |

Per-plugin reference (middlewares, config, outputs, required permissions) is not kept here. The
[registry](https://registry.moonlit.rs) reads it from each plugin package, so the docs link there
instead of maintaining a second copy.

## Working locally

```sh
npm install
npm run dev       # local dev server with hot reload
npm run build     # production build into dist/
npm run preview   # serve the production build
```

Run `build` before opening a pull request. `starlight-links-validator` fails the build on a dead
internal link, so it catches the mistakes the dev server lets through.

## Adding a page

1. Create the Markdown file under `src/content/docs/`, in the section it belongs to, with `title`
   and `description` frontmatter. Starlight renders the title as the page heading, so the body
   starts without an `# H1`.
2. Register it in the matching section of `sidebar` in `astro.config.mjs`. A page that is not in the
   sidebar is reachable only by direct URL or search.
3. Link to it from the section index, so readers working through a section in order find it.

Conventions worth knowing:

- Link to other pages by their relative `.md` path (`./configuration.md#syntax`), so the links also
  work when browsing the repository. `src/lib/md-links.mjs` rewrites them to the page's URL at build
  time.
- Callouts use Starlight asides: `:::note`, `:::tip`, `:::caution`, `:::danger`, with an optional
  title as `:::caution[Title]`.
- A page that uses a component is `.mdx` and imports it. `<FlowDiagram>` draws a diagram from a
  `flow` prop in HTML and CSS, so it follows the theme and reflows on a phone.
  `<InstallCommand />` shows the install command for the reader's platform; use it rather than
  hardcoding one platform's command. Its commands live in `src/lib/site.mjs`.
- The sidebar has one top-level group per section. The header shows the sections as tabs, and
  `src/route-middleware.ts` narrows the sidebar to the section the reader is in.

## Keeping pages accurate

The reference pages describe the behaviour of the `moonlit` CLI, the engine, and the `moonlit-pdk`
crate. When one of those changes, update the matching page in the same change:

| Change | Page |
| --- | --- |
| Commands and flags | `reference/cli.md` |
| YAML schema and its diagnostics | `reference/config-file.md`, `reference/error-handling.md` |
| Plugin ABI | `reference/wit-contract.md` |
| PDK surface | `reference/plugin-development.md` |

Example pipelines are held to the same standard as the engine: permissions are deny-by-default, so
every snippet has to grant the `exec`, `network`, and `filesystem` access its plugins actually need.

## Versioning

`versions.json` lists the published versions of the site. `current` is the current label, and each
entry in `versions` is a `text`/`link` pair pointing at wherever that version is served. A build
hook in `astro.config.mjs` copies it into the output, where archived versions fetch it at runtime.

## Deployment

`Dockerfile` builds the site and serves it from nginx. `nginx.conf` also redirects the old
`/plugins/*` pages to the registry, and URLs without a trailing slash to their folder.
`release.yml`, itself a Moonlit pipeline, analyzes commits, calculates the next version, builds and
pushes `wolfware/moonlit-docs`, and opens a GitHub release.

The pipeline only considers commits scoped `docs` (`docs:`, `docs(guide):`, and so on) and halts
when none are found, so use that scope for anything that should ship. Releases are tagged
`docs-vX.Y.Z`, keeping the site's versions separate from the CLI's.
