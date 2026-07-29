---
title: Plugin System Architecture
description: How Moonlit resolves, caches, sandboxes, and instantiates WebAssembly component plugins
---

# Plugin System Architecture

This page describes how the engine turns a `plugins:` entry in a pipeline YAML file into a running,
sandboxed WebAssembly component: source resolution, the on-disk content cache, the OCI pull
sequence, and how capability enforcement is wired at the host boundary. For the ABI itself, see the
[WIT Contract](./wit-contract.md); for the YAML-facing permissions model, see
[Sandboxing](../guide/concepts/sandboxing.md).

## The component model, briefly

Every plugin is a `wasm32-wasip2` WebAssembly **component** — WASI Preview 2, component model, not
a core wasm module. The engine hosts components with [`wasmtime`](https://wasmtime.dev/), using
`wasmtime-wasi` for the standard WASI imports and `wasmtime-wasi-http` for outgoing HTTP. Each
plugin gets **one component instance per pipeline run**, created when the pipeline loads and kept
alive until it finishes. This is deliberate: it lets a plugin hold in-memory state across its
middlewares within a run — `git.latest-tag` can stash a resolved tag that `git.commits` reads
later — without any host-side session machinery.

## Resolving a plugin source

Each `plugins[].url` is parsed into a `PluginSource` by scheme (`engine/src/resolve/mod.rs`):

```rust
pub enum PluginSource {
    Oci(String),    // host/namespace/name:tag or ...@sha256:...
    File(PathBuf),  // absolute local path to a component file
    Http(String),   // full http/https URL to a component file
}
```

- `oci://…` — the default distribution path; resolved against a registry (below).
- `file:///abs/path/plugin.wasm` — a direct local path, used for the plugin dev loop. Not cached:
  the file is validated and its path returned as-is, so rebuilding the `.wasm` and re-running picks
  up the change immediately.
- `http(s)://…/plugin.wasm` — downloaded and cached by a hash of the URL.
- Any other scheme is an `UnsupportedScheme` error naming the supported schemes; a URL with no
  scheme at all is an `InvalidReference` error.

Resolution never instantiates a component — it only produces a verified path to component bytes on
disk, plus provenance (a content digest for OCI sources, whether the result came from cache). All
declared plugins resolve **in parallel**; the first resolution failure aborts pipeline load with a
plugin-load diagnostic (exit code 3).

## The content cache

Resolved plugins live under a single OS-appropriate cache root (`~/.cache/moonlit` on Linux/XDG,
the platform equivalent on macOS/Windows), laid out as:

```
<cache-root>/moonlit/
├── oci/sha256/<hex>        # OCI layer blobs, content-addressed by digest
├── plugins/<key>/          # a resolved plugin: plugin.wasm + meta.json
│   ├── plugin.wasm
│   └── meta.json
└── refs/<hash>.json        # OCI tag -> digest resolution, with a timestamp for the TTL
```

`plugins/` is keyed by the OCI manifest digest for `oci://` sources, or `sha256(url)` for `http(s)://`
sources — `file://` sources are never cached. `meta.json` records the source reference, digest,
size, pulled-at timestamp, and (when the artifact declares it) the plugin's middleware names, so
`moonlit plugin inspect` and cache-listing commands don't need to re-instantiate a component to
describe what's cached.

## OCI resolution and pull

`oci://` is the default and recommended distribution scheme, following the CNCF Wasm OCI Artifact
convention (interoperable with `wkg`/`wasm-pkg-tools` and ORAS): `artifactType`
`application/vnd.wasm.component.v1+wasm`, a config blob of media type
`application/vnd.wasm.config.v0+json` carrying a `moonlit` extension block (world, middleware
names, SDK version), and a single component-bytes layer of media type `application/wasm`.

Resolution proceeds:

1. Parse the reference (`host[:port]/namespace/name:tag` or `...@sha256:<digest>`).
2. **Cache check first.** A digest-pinned reference that's already cached skips the network
   entirely. A tag reference checks `refs/<hash>.json` for a digest resolved within the last 15
   minutes; within that TTL, it also skips the network. `--offline` on `moonlit run` turns any cache
   miss into a hard failure instead of pulling.
3. On a cache miss, pull the manifest (accepting both OCI image manifests and artifact manifests)
   and verify its `artifactType`/media types match the Moonlit plugin convention above.
4. Pull the single component layer, verifying its content digest against the manifest.
5. Store the blob at `oci/sha256/<digest>`, materialize it at `plugins/<digest>/plugin.wasm`, and
   write `meta.json` with the source reference, digest, size, and pulled-at timestamp.

Authentication follows Docker-style credential resolution: `~/.docker/config.json` first (so a
Docker-authenticated registry already works with no separate step), then Moonlit's own
`~/.config/moonlit/credentials.toml`, written by `moonlit login <registry>`.

## Capability enforcement at the host boundary

A resolved, cached component is instantiated with **no ambient access** — every capability it can
reach is one the engine explicitly wires into that instance's `Linker`, gated by the plugin's
`permissions` grant (omitted entirely ⇒ every grant defaults to empty/`none`). Enforcement lives at
four points, each implemented at the boundary where the corresponding WASI or `moonlit:plugin`
import is satisfied:

| Grant | Enforced in | Mechanism |
|---|---|---|
| `network` | `engine/src/host/net.rs` (`AllowlistHooks`) | Wraps `wasi:http/outgoing-handler`'s `send_request` hook; the request's authority is matched against a `GlobSet` built from `permissions.network`. A miss is denied and logged as a warning naming the blocked host and the `permissions` key to add — the request never leaves the sandbox. |
| `exec` | `engine/src/host/imports.rs` (`ProcessHost::spawn`/`run`) | The `moonlit:plugin/process` implementation checks `cmd.program` against a `GlobSet` built from `permissions.exec` before spawning anything; a miss is denied and logged the same way. |
| `env` | `engine/src/host/perms.rs` (`filter_env`) | The process env snapshot is glob-filtered against `permissions.env` *before* it's handed to `WasiCtxBuilder`, so non-matching variables are never visible inside the sandbox, not merely hidden by convention. |
| `filesystem` | `engine/src/host/perms.rs` (`filesystem_perms`) | Maps the `none \| read-only \| read-write` grant to WASI `DirPerms`/`FilePerms` and either preopens the working directory or skips the preopen entirely for `none` — a denied plugin has no filesystem handle to use, regardless of what it requests. |

All four are wired together in `PluginInstance::instantiate` (`engine/src/host/mod.rs`), which
builds the `Linker` (WASI p2 + WASI-HTTP + `moonlit:plugin/host` + `moonlit:plugin/process`),
constructs the per-instance `WasiCtx` via the permission mappings above, and instantiates the
component against it. Nothing about this differs by plugin source — an `oci://`, `file://`, or
`http(s)://`-resolved component goes through the identical sandboxing path.

## Instance lifecycle

Once instantiated, a `PluginInstance` is driven through the WIT exports in a fixed order for the
life of the pipeline run:

1. **`describe`** — read once by `moonlit plugin inspect`; static metadata, no config needed.
2. **`init`**  — called once, immediately after instantiation, with the plugin's `config:` block.
   An `Err` here is a load-time failure (exit code 3).
3. **`list-middlewares`** — read at pipeline *build* time (before any step runs) to validate every
   step's `run:` reference; an unresolvable plugin or middleware name fails fast (exit code 2).
4. **`execute`** — called once per step that targets this plugin, in step order, for the rest of
   the run.

Because one instance is kept alive for the whole run (see above), a trap inside a plugin poisons
that plugin's `wasmtime` `Store` for the remainder of the run — the store, not just the failed
call, becomes permanently unusable. `continueOnError` still lets the *pipeline* continue past a
trapped step, but any later step against the *same* plugin fails fast rather than silently
re-instantiating (which would discard the plugin's in-memory shared state from earlier steps).

## See also

- [WIT Contract](./wit-contract.md) — the exact interfaces and types this host implements.
- [Plugin SDK](./plugin-development.md) — the Rust SDK plugins are built against.
- [Sandboxing](../guide/concepts/sandboxing.md) — the `permissions` YAML block from the pipeline
  author's point of view.
- [Publishing a Plugin](../guide/advanced/publishing-plugins.md) — pushing a component to an OCI
  registry so it can be pulled via `oci://`.
