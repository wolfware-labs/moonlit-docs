# Moonlit Documentation

The source for [moonlitbuild.dev](https://moonlitbuild.dev/), the documentation site for
[Moonlit](https://github.com/wolfware-labs/moonlit). Built with [VitePress](https://vitepress.dev/).

## Layout

| Directory | Contents |
| --- | --- |
| `guide/` | Getting started, core concepts, and plugin authoring guides |
| `reference/` | CLI, configuration file, WIT contract, plugin SDK, and error reference |
| `plugins/` | One page per first-party plugin |
| `cookbook/` | Complete `release.yml` recipes |
| `.vitepress/` | Site configuration, theme, and navigation |

## Working locally

```sh
npm install
npm run docs:dev      # local dev server with hot reload
npm run docs:build    # production build into .vitepress/dist
npm run docs:preview  # serve the production build
```

## Keeping pages accurate

The reference pages describe the behaviour of the `moonlit` CLI, the engine, the `moonlit-pdk`
crate, and the first-party plugins. When one of those changes, update the matching page in the
same change: `reference/cli.md` for flags and commands, `reference/config-file.md` and
`reference/error-handling.md` for the YAML schema and its diagnostics, `reference/wit-contract.md`
for the plugin ABI, `reference/plugin-development.md` for the PDK, and the page under `plugins/`
for a plugin's middlewares, config keys, and outputs.

## Deployment

The site is packaged into a container image by the `Dockerfile` in this directory and released
through the `release.yml` pipeline, which is itself a Moonlit pipeline.
