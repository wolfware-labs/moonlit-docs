---
title: Plugin System Architecture
description: How Moonlit resolves, caches, sandboxes, and instantiates WebAssembly component plugins
---

# Plugin System Architecture

This page follows a `plugins:` entry in a pipeline YAML file all the way to a running, sandboxed
WebAssembly component: how the source is resolved, what the on-disk cache holds, how the OCI pull
works, and where capability enforcement actually sits. For the ABI itself, see the
[WIT Contract](./wit-contract.md). For the YAML-facing permissions model, see
[Sandboxing](../guide/concepts/sandboxing.md).

## The component model, briefly

Every plugin is a `wasm32-wasip2` WebAssembly component, meaning WASI Preview 2 and the component
model rather than a core wasm module, and it targets the `moonlit:plugin@0.3.0` world. The engine
hosts components with [`wasmtime`](https://wasmtime.dev/), using `wasmtime-wasi` for the standard
WASI imports and `wasmtime-wasi-http` for outgoing HTTP.

Each plugin gets one component instance per pipeline run, created when the pipeline loads and kept
alive until it finishes. That choice buys something specific: a plugin can hold in-memory state
across its own middlewares within a run, so `git.latest-tag` can stash a resolved tag that
`git.commits` reads later, and the host needs no session machinery to make it work.

## Resolving a plugin source

Each `plugins[].url` is parsed into a `PluginSource` by scheme (`engine/src/resolve/mod.rs`):

```rust
pub enum PluginSource {
    Oci(String),    // host/namespace/name:tag or ...@sha256:...
    File(PathBuf),  // absolute local path to a component file
    Http(String),   // full http/https URL to a component file
}
```

- `oci://...` is the default distribution path, resolved against a registry as described below.
- `file:///abs/path/plugin.wasm` is a direct local path for the plugin dev loop. Nothing is cached:
  the file is validated and its path returned as-is, so rebuilding the `.wasm` and re-running picks
  up the change immediately.
- `http(s)://.../plugin.wasm` is downloaded and cached by a hash of the URL.
- Any other scheme raises `UnsupportedScheme` and names the schemes that do work. A URL with no
  scheme at all raises `InvalidReference`.

Resolution never instantiates anything. It produces a verified path to component bytes on disk plus
some provenance: a content digest for OCI sources, and whether the result came from cache. All
declared plugins resolve in parallel, and the first failure aborts pipeline load with a plugin-load
diagnostic (exit code 3).

## The content cache

Resolved plugins live under a single OS-appropriate cache root, `~/.cache/moonlit` on Linux/XDG and
the platform equivalent on macOS and Windows, laid out like this:

```
<cache-root>/moonlit/
├── oci/sha256/<hex>        # OCI layer blobs, content-addressed by digest
├── plugins/<key>/          # a resolved plugin: plugin.wasm + meta.json
│   ├── plugin.wasm
│   └── meta.json
└── refs/<hash>.json        # OCI tag -> digest resolution, with a timestamp for the TTL
```

For `oci://` sources, `plugins/` is keyed by the OCI manifest digest, written as `sha256-<hex>`
because `:` is not a valid path character on Windows. For `http(s)://` sources the key is
`sha256(url)`. Nothing from `file://` is cached.

`meta.json` records the source reference, digest, size, and pulled-at timestamp, along with the
plugin's middleware names when the artifact declares them. That last part is why
`moonlit plugin inspect` and the cache-listing commands can describe what is cached without
re-instantiating a component.

## OCI resolution and pull

`oci://` is the default and recommended distribution scheme. It follows the CNCF Wasm OCI Artifact
convention, so it interoperates with `wkg`/`wasm-pkg-tools` and ORAS: `artifactType` is
`application/vnd.wasm.component.v1+wasm`, the config blob has media type
`application/vnd.wasm.config.v0+json` and carries a `moonlit` extension block (the
`moonlit:plugin@0.3.0` world, the middleware names, and the `moonlit-pdk` version the plugin was
built with), and there is a single component-bytes layer of media type `application/wasm`.
`moonlit plugin publish` also stamps the manifest with `org.opencontainers.image.*` annotations for
title, version, description, source repository, and license, all read from the crate's `Cargo.toml`.

Resolution proceeds:

1. Parse the reference (`host[:port]/namespace/name:tag` or `...@sha256:<digest>`).
2. Check the cache first. A digest-pinned reference that is already cached skips the network
   entirely. A tag reference checks `refs/<hash>.json` for a digest resolved within the last 15
   minutes, and stays off the network if it finds one. Passing `--offline` to `moonlit run` turns any
   cache miss into a hard failure instead of a pull.
3. On a cache miss, pull the manifest, accepting both OCI image manifests and artifact manifests,
   and verify that its config and layer media types match the Moonlit plugin convention above.
   `artifactType` is set by `moonlit plugin publish` at publish time but is not re-checked on pull.
4. Pull the single component layer and verify its content digest against the manifest.
5. Store the blob at `oci/sha256/<digest>`, materialize it at `plugins/<digest>/plugin.wasm`, and
   write `meta.json` with the source reference, digest, size, and pulled-at timestamp.

Authentication follows Docker-style credential resolution. `~/.docker/config.json` is consulted
first, inline `auth` entries only, since credential helpers and `credsStore` are not read. A registry
you are already logged into with Docker therefore works with no separate step. After that comes
Moonlit's own `~/.config/moonlit/credentials.toml`, written by `moonlit login`, where an entry holds
either a Bearer `token` (what the device flow stores) or a `username`/`password` pair. With nothing
stored for the host, the pull is anonymous.

## Capability enforcement at the host boundary

A resolved, cached component is instantiated with no ambient access at all. Every capability it can
reach is one the engine explicitly wires into that instance's `Linker`, gated by the plugin's
`permissions` grant. Omit the block and every grant defaults to empty, or to `none` for the
filesystem. Enforcement lives at four points, each sitting at the boundary where the corresponding
WASI or `moonlit:plugin` import is satisfied:

| Grant | Enforced in | Mechanism |
|---|---|---|
| `network` | `engine/src/host/net.rs` (`AllowlistHooks`) | Wraps the `send_request` hook of `wasi:http/outgoing-handler`. The request's authority is matched against a `GlobSet` built from `permissions.network`. A miss is denied and logged as a warning naming the blocked host and the `permissions` key to add, and the request never leaves the sandbox. |
| `exec` | `engine/src/host/imports.rs` (`ProcessHost::spawn`/`run`) | The `moonlit:plugin/process` implementation checks `cmd.program` against a `GlobSet` built from `permissions.exec` before spawning anything, and a miss is denied and logged the same way. What does get spawned is an ordinary OS process: its `cwd` and `env` come from the command, and its stdout and stderr are streamed back line by line. |
| `env` | `engine/src/host/perms.rs` (`filter_env`) | The process env snapshot is glob-filtered against `permissions.env` *before* it reaches `WasiCtxBuilder`. Non-matching variables are never visible inside the sandbox, not merely hidden by convention. |
| `filesystem` | `engine/src/host/perms.rs` (`filesystem_perms`) | Maps the `none \| read-only \| read-write` grant to WASI `DirPerms`/`FilePerms`, then either preopens the working directory or, for `none`, skips the preopen entirely. A denied plugin holds no filesystem handle at all, whatever it asks for. |

All four come together in `PluginInstance::instantiate` (`engine/src/host/mod.rs`), which builds the
`Linker` (WASI p2, WASI-HTTP, `moonlit:plugin/host`, and `moonlit:plugin/process`), constructs the
per-instance `WasiCtx` from the permission mappings above, and instantiates the component against it.
None of this varies by plugin source: components resolved from `oci://`, `file://`, and
`http(s)://` all take the identical sandboxing path.

## Instance lifecycle

Once instantiated, a `PluginInstance` is driven through the WIT exports in a fixed order for the life
of the pipeline run:

1. `describe` is read by `moonlit plugin inspect` and `moonlit plugin publish`. It is static
   metadata and needs no config.
2. `init` is called once, immediately after instantiation, with the plugin's `config:` block. An
   `Err` here is a load-time failure (exit code 3).
3. `list-middlewares` is read at pipeline *build* time, before any step runs, to validate every
   step's `run:` reference. An unresolvable plugin or middleware name fails fast (exit code 2).
4. `execute` is called once per step that targets this plugin, in step order, for the rest of the
   run.

Because one instance stays alive for the whole run, a trap inside a plugin poisons that plugin's
`wasmtime` `Store` for the remainder of it. The store becomes permanently unusable, not just the
call that trapped. `continueOnError` will still carry the *pipeline* past a trapped step, but any
later step against the *same* plugin fails fast rather than quietly re-instantiating, which would
throw away the in-memory state the plugin built up in earlier steps.

## See also

- [WIT Contract](./wit-contract.md), the exact interfaces and types this host implements.
- [Plugin SDK](./plugin-development.md), the Rust crate plugins are built against.
- [Sandboxing](../guide/concepts/sandboxing.md), the `permissions` YAML block from the pipeline
  author's point of view.
- [Publishing a Plugin](../guide/advanced/publishing-plugins.md), pushing a component to an OCI
  registry so it can be pulled via `oci://`.
