---
title: Plugins System
description: Learn how Moonlit's WebAssembly plugin system works and how plugins extend functionality
---

# Plugins System

Moonlit's plugin system is one of its core features, allowing you to extend the tool's functionality through modular components. This page explains what plugins are, how they're loaded, and how the sandbox that runs them works.

## What Are Plugins?

A Moonlit plugin is a **WebAssembly component** — built for WASI Preview 2 and the component model — that implements the `moonlit:plugin` world. A plugin component exports:

- **`describe`** — returns the plugin's name, version, description, and optional icon without needing any configuration; this is what `moonlit plugin inspect` and the registry read.
- **`init`** — called once after instantiation with the plugin's global `config` block; returns the plugin's name, version, and description, or an error that aborts the pipeline with a plugin-load diagnostic.
- **`list-middlewares`** — returns the middlewares the plugin provides, each with a name, description, and JSON Schemas for its config and outputs; used both for discovery (`moonlit plugin inspect`) and to validate every `run:` reference in your pipeline before execution starts.
- **`execute`** — runs one named middleware against a step's fully-substituted configuration and returns its result: success/failure, warnings, and output values.

Plugins don't call the host directly for things like the network or the filesystem — they import a small set of host-provided capabilities (structured logging, reading accumulated configuration, progress reporting, a permission-gated subprocess API) plus the standard `wasi:http`, `wasi:filesystem`, and `wasi:cli` interfaces, all mediated by the engine.

## Plugin URL Schemes

A plugin is referenced by URL, and the scheme determines how it's resolved:

| Scheme | Meaning | Resolution |
|---|---|---|
| `oci://<registry-host>/<namespace>/<name>:<tag>` | OCI artifact — the default way to distribute plugins | Pulled from an OCI registry and cached locally by digest |
| `file:///abs/path/plugin.wasm` | A local component file | Loaded directly from disk — useful for plugin development |
| `http(s)://…/plugin.wasm` | A remote component file | Downloaded and cached by URL hash |

Package-manager-style references (as used by older, non-WASM plugin ecosystems) are not supported — Moonlit plugins ship as WASM components, so any unsupported scheme fails fast with a hint to switch to `oci://`.

## Plugin Registration

Plugins are registered in your pipeline configuration under the `plugins` section:

```yaml
plugins:
  - name: git
    url: "oci://registry.moonlitbuild.dev/wolfware/git:1.0.0"
  - name: gh
    url: "oci://registry.moonlitbuild.dev/wolfware/github:1.0.0"
    config:
      token: $(GITHUB_TOKEN)
```

Each plugin entry has:

- **name** — the alias used to reference this plugin's middlewares in `run:` (see below)
- **url** — where to resolve the plugin from, using one of the schemes above
- **config** (optional) — plugin-level configuration, applied once at load time
- **permissions** (optional) — the plugin's sandbox grant-list, described below

## Plugin Loading and Lifecycle

When a pipeline starts, the engine loads every plugin listed in `plugins` **in parallel**: resolve the URL (pulling from cache or the network as needed), instantiate the component in the `wasmtime` host, and call its `init` export with the plugin's `config` block. The first plugin to fail aborts loading with a plugin diagnostic. Each plugin keeps **one instance for the whole pipeline run**, so middlewares on the same plugin can share in-memory state across steps — see [How Moonlit Works](./how-it-works.md) for the full execution model.

## Using Plugin Middlewares

Once a plugin is loaded, you invoke its middlewares from pipeline steps:

```yaml
stages:
  analyze:
    - name: repo
      run: git.repo-context
    - name: tag
      run: git.latest-tag
```

The `run` property uses the format `pluginName.middlewareName` — split on the *first* `.` — to specify which middleware to execute. An unknown plugin or middleware name is caught before the pipeline runs.

## Plugin Sandbox and Permissions

Every plugin runs sandboxed and is **denied by default**. A plugin's optional `permissions` block is a **grant-list**, not a set of overrides: if you omit it, the plugin gets no network access, no subprocess execution, no environment variables, and no filesystem access. If you include it, only the keys you name are granted — any key you leave out stays denied.

```yaml
plugins:
  - name: gh
    url: "oci://registry.moonlitbuild.dev/wolfware/github:1.0.0"
    permissions:
      network: ["api.github.com"]   # allowed hosts for outbound HTTP
      exec: []                      # allowed programs for subprocess execution
      env: ["GITHUB_*"]             # env var glob patterns readable by the plugin
      filesystem: read-write        # none | read-only | read-write of the working directory
```

`filesystem` defaults to `none` when the block is present but the key is omitted, and a key the block doesn't recognize is a configuration error. If a plugin is denied a capability it tries to use — an ungranted network host or program, for example — the run output surfaces a warning naming the blocked target and the `permissions` key that would allow it.

## Plugin Configuration

Plugin-related configuration exists at two levels:

1. **Global configuration** — the `config` block on the plugin entry, applied once when the plugin loads.
2. **Step configuration** — the `config` block on a step, applied to that one middleware call.

Both are `$(...)`-substituted against the configuration accumulated so far; see [Configuration](./configuration.md) for the full layering model.

## Official Plugins

Moonlit ships a set of first-party plugins covering common release tasks — Git, GitHub, GitLab, semantic versioning, .NET, Node.js, Docker, and Slack, among others. See the [Plugins Overview](../../plugins/) for the full list and per-plugin documentation.

## Next Steps

- Learn about [Stages and Steps](./stages-steps.md) in more detail
- Explore the [Configuration](./configuration.md) options
- See how to [create your own plugins](../advanced/custom-plugins.md)
