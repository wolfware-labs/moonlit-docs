---
title: Plugins System
description: Learn how Moonlit's WebAssembly plugin system works and how plugins extend functionality
---

# Plugins System

Almost everything Moonlit does at build time comes from a plugin. The engine itself only orders the
work and passes values around. This page covers what a plugin is, how it gets loaded, and what the
sandbox around it allows.

## What Are Plugins?

A Moonlit plugin is a WebAssembly component built for WASI Preview 2 and the component model, and it
implements the `moonlit:plugin` world. Every plugin exports four functions:

- `describe` returns the plugin's name, version, description, and optional icon. It needs no
  configuration, which is why `moonlit plugin inspect` and the registry can both call it on a plugin
  they know nothing about.
- `init` runs once after instantiation and receives the plugin's global `config` block. It returns
  the plugin's name, version, and description. If it returns an error instead, the pipeline stops
  with a plugin-load diagnostic.
- `list-middlewares` returns the middlewares the plugin provides, each with a name, a description,
  and JSON Schemas for its config and its outputs. This drives discovery in `moonlit plugin inspect`,
  and it also lets the engine validate every `run:` reference in your pipeline before anything
  executes.
- `execute` runs one named middleware against a step's fully-substituted configuration. It reports
  success or failure, any warnings, and the output values.

A plugin never reaches the network or the filesystem on its own. It imports a small set of host
capabilities instead: structured logging, reads of the accumulated configuration, progress
reporting, and a permission-gated subprocess API, alongside the standard `wasi:http`,
`wasi:filesystem`, and `wasi:cli` interfaces. The engine sits in front of all of them.

## Plugin URL Schemes

You reference a plugin by URL, and the scheme decides how it gets resolved:

| Scheme | Meaning | Resolution |
|---|---|---|
| `oci://<registry-host>/<namespace>/<name>:<tag>` | An OCI artifact, the usual way to distribute a plugin | Pulled from an OCI registry and cached locally by digest |
| `file:///abs/path/plugin.wasm` | A local component file | Loaded straight from disk, which is what you want while developing a plugin |
| `http(s)://.../plugin.wasm` | A remote component file | Downloaded and cached by URL hash |

Package-manager-style references, the kind older non-WASM plugin ecosystems use, will not work.
Moonlit plugins ship as WASM components, so an unrecognized scheme fails immediately with a hint to
switch to `oci://`.

## Plugin Registration

Plugins go in the `plugins` section of your pipeline configuration:

```yaml
plugins:
  - name: git
    url: "oci://registry.moonlit.rs/wolfware/git:1.0.0"
  - name: gh
    url: "oci://registry.moonlit.rs/wolfware/github:1.0.0"
    config:
      token: $(GITHUB_TOKEN)
```

Each entry takes:

- `name`, the alias you use to reach this plugin's middlewares from `run:`
- `url`, where to resolve the plugin from, using one of the schemes above
- `config`, optional, applied once at load time
- `permissions`, optional, the plugin's sandbox grant-list, covered below

## Plugin Loading and Lifecycle

When a pipeline starts, the engine loads every plugin in the `plugins` list in parallel. For each
one it resolves the URL, pulling from the cache or the network as needed, instantiates the component
in the `wasmtime` host, and calls `init` with that plugin's `config` block. If any plugin fails,
loading aborts with a plugin diagnostic.

A plugin is instantiated once and kept for the whole run, so middlewares on the same plugin can
share in-memory state from one step to the next. [How Moonlit Works](./how-it-works.md) has the full
execution model.

## Using Plugin Middlewares

With a plugin loaded, steps call its middlewares:

```yaml
stages:
  analyze:
    - name: repo
      run: git.repo-context
    - name: tag
      run: git.latest-tag
```

`run` takes the form `pluginName.middlewareName`, split on the *first* `.`. A plugin or middleware
name that does not exist is caught before the pipeline runs, not halfway through it.

## Plugin Sandbox and Permissions

Every plugin runs sandboxed, and everything is denied until you say otherwise. The optional
`permissions` block is a grant-list rather than a set of overrides. Leave it out and the plugin gets
no network, no subprocess execution, no environment variables, and no filesystem access. Include it
and you grant exactly the keys you name; anything you leave out stays denied.

```yaml
plugins:
  - name: gh
    url: "oci://registry.moonlit.rs/wolfware/github:1.0.0"
    permissions:
      network: ["api.github.com"]   # allowed hosts for outbound HTTP
      exec: []                      # allowed programs for subprocess execution
      env: ["GITHUB_*"]             # env var glob patterns readable by the plugin
      filesystem: read-write        # none | read-only | read-write of the working directory
```

If the block is present but `filesystem` is missing, it defaults to `none`. A key the block does not
recognize is a configuration error. When a plugin tries to use something it was not granted, an
ungranted host or program for instance, the run output names the blocked target and the
`permissions` key that would have allowed it.

## Plugin Configuration

Configuration reaches a plugin at two levels:

1. The `config` block on the plugin entry, applied once when the plugin loads.
2. The `config` block on a step, applied to that single middleware call.

Both go through `$(...)` substitution against the configuration accumulated up to that point. See
[Configuration](./configuration.md) for the full layering model.

## Official Plugins

Moonlit ships first-party plugins for the tasks most releases need: Git, GitHub, GitLab, semantic
versioning, .NET, Node.js, Docker, and Slack, among others. The
[Plugins Overview](../../plugins/) lists them all with per-plugin documentation.

## Next Steps

- Learn about [Stages and Steps](./stages-steps.md) in more detail
- Explore the [Configuration](./configuration.md) options
- See how to [create your own plugins](../advanced/custom-plugins.md)
