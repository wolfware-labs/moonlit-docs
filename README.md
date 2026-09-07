# Moonlit Documentation

The source for [moonlitbuild.dev](https://moonlitbuild.dev/), the documentation site for
[Moonlit](https://github.com/wolfware-labs/moonlit). Built with [VitePress](https://vitepress.dev/).

This repository holds the prose. The CLI, the engine, and the plugin development kit live in
[`wolfware-labs/moonlit`](https://github.com/wolfware-labs/moonlit); published plugins live in the
[registry](https://registry.moonlitbuild.dev).

## Layout

| Path | Contents |
| --- | --- |
| `index.md` | The landing page |
| `guide/` | Installation, quick start, and GitHub Actions setup |
| `guide/concepts/` | How the engine works: stages and steps, plugins, middlewares, configuration, sandboxing |
| `guide/advanced/` | Writing plugins, publishing them, and contributing to Moonlit |
| `reference/` | CLI, configuration file, plugin system, WIT contract, plugin SDK, and error reference |
| `plugins/` | One page per first-party plugin, plus longer examples under `plugins/examples/` |
| `cookbook/` | Complete `release.yml` recipes, end to end |
| `public/` | Static assets served from the site root (logos, `robots.txt`) |
| `.vitepress/config.mts` | Site config, navigation, sidebar, search, and SEO |
| `.vitepress/theme/` | Custom theme: styles and the `SEOMetadata`, `VersionSelector`, `InstallCommand`, and `FlowDiagram` components |
| `versions.json` | The version list the `VersionSelector` reads |
| `Dockerfile`, `nginx.conf` | The container image the site ships in |
| `release.yml` | The Moonlit pipeline that builds and releases that image |

## Working locally

```sh
npm install
npm run docs:dev      # local dev server with hot reload
npm run docs:build    # production build into .vitepress/dist
npm run docs:preview  # serve the production build
```

Run `docs:build` before opening a pull request. VitePress fails the build on a dead internal link,
so it catches the mistakes the dev server lets through.

## Adding a page

1. Create the Markdown file in the section it belongs to, with `title` and `description` frontmatter.
   The description is what search results and social cards show.
2. Register it in the matching `sidebar` array in `.vitepress/config.mts`. A page that is not in the
   sidebar is reachable only by direct URL or search.
3. Link to it from the section index, so readers working through a section in order find it.

Conventions worth knowing:

- `cleanUrls` is on, so internal links carry no `.html` extension: `/guide/quick-start`, not
  `/guide/quick-start.html`.
- Diagrams are the `<FlowDiagram>` component, which takes the diagram as a `flow` prop and draws it
  in HTML and CSS from the theme's own `--vp-c-*` tokens. There is no diagram library, no render
  step, and nothing to regenerate. Note that an SVG carrying its own `<style>` cannot be inlined
  into a page instead: Vue strips those tags from the compiled render function, so the diagram loses
  its styling the moment a reader arrives by client-side navigation rather than a fresh load.
- `<InstallCommand />` renders the install snippet for the visitor's operating system. Use it rather
  than hardcoding one platform's command.
- Each nav entry needs an `activeMatch` pattern. Without it the section stops being highlighted as
  soon as the reader leaves its index page.

## Keeping pages accurate

The reference pages describe the behaviour of the `moonlit` CLI, the engine, the `moonlit-pdk`
crate, and the first-party plugins. When one of those changes, update the matching page in the same
change:

| Change | Page |
| --- | --- |
| Commands and flags | `reference/cli.md` |
| YAML schema and its diagnostics | `reference/config-file.md`, `reference/error-handling.md` |
| Plugin ABI | `reference/wit-contract.md` |
| PDK surface | `reference/plugin-development.md` |
| A plugin's middlewares, config keys, or outputs | the page under `plugins/` |

Example pipelines are held to the same standard as the engine: permissions are deny-by-default, so
every snippet has to grant the `exec`, `network`, and `filesystem` access its plugins actually need.

## Versioning

`versions.json` drives the version picker in the header. `current` is the label shown on the
button, and each entry in `versions` is a `text`/`link` pair pointing at wherever that version of
the site is served. The picker fetches the file at runtime, so `buildEnd` in `.vitepress/config.mts`
copies it into the build output alongside the generated pages.

## Deployment

`Dockerfile` builds the site and serves it from nginx. `release.yml`, itself a Moonlit pipeline,
analyzes commits, calculates the next version, builds and pushes `wolfware/moonlit-docs`, and opens
a GitHub release.

The pipeline only considers commits scoped `docs` (`docs:`, `docs(guide):`, and so on) and halts
when none are found, so use that scope for anything that should ship. Releases are tagged
`docs-vX.Y.Z`, keeping the site's versions separate from the CLI's.
