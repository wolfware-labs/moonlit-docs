---
title: Authoring a Plugin
description: Scaffold, implement, build, and inspect a Moonlit plugin with the Rust SDK
---

# Authoring a Plugin

Moonlit plugins are **WebAssembly components** — built for WASI Preview 2 and the component model — that export a small set of functions the engine calls into: `init`, `list-middlewares`, and `execute` (see [Plugins System](../concepts/plugins.md) for the conceptual overview). You write plugins in Rust against the `moonlit-plugin-sdk` crate, which generates all of that glue for you: you implement typed `Middleware` structs and declare them in one `moonlit_plugin!` block.

## Prerequisites

- A Rust toolchain with the `wasm32-wasip2` target installed (`rustup target add wasm32-wasip2`)
- The `moonlit` CLI

## Scaffold a New Plugin

```bash
moonlit plugin new my-plugin
```

On a TTY this prompts for a namespace (defaults to your `git config user.name`), a one-line description, and an SPDX license (`Apache-2.0`, `MIT`, or `Elastic-2.0`). All three can also be passed as flags for non-interactive use:

```bash
moonlit plugin new my-plugin \
  --namespace acme \
  --description "Does things" \
  --license Apache-2.0
```

Pass `--sdk-path <path>` instead of a crates.io version when developing against a local checkout of the SDK.

The scaffold creates:

```
my-plugin/
├── Cargo.toml           # crate-type = ["cdylib"]; moonlit-plugin-sdk dependency
├── moonlit-plugin.toml   # publish metadata: name, namespace, description, license
├── src/lib.rs            # a sample "greet" middleware + moonlit_plugin! block
├── README.md
└── .gitignore
```

## Implementing a Middleware

A middleware is a `Default` unit struct that implements the `Middleware` trait from `moonlit_plugin_sdk::prelude`:

```rust
use moonlit_plugin_sdk::prelude::*;

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct GreetConfig {
    name: String,
}

#[derive(Default)]
struct Greet;

impl Middleware for Greet {
    const NAME: &'static str = "greet";
    const DESCRIPTION: &'static str = "logs and returns a greeting";
    type Config = GreetConfig;

    fn execute(&self, ctx: &Context, cfg: Self::Config) -> MiddlewareResult {
        let who = if cfg.name.is_empty() { "world".to_string() } else { cfg.name };
        ctx.log_info(&format!("greeting {who}"));
        MiddlewareResult::success_with(|o| {
            o.set("greeting", format!("hello, {who}"));
        })
    }
}
```

- `NAME` is the identifier used after the `.` in a step's `run:` reference (e.g. `myplugin.greet`).
- `Config` is deserialized from the step's fully-substituted YAML config; it must implement `Default` so an absent config block still binds.
- `execute` returns a `MiddlewareResult`: `success()`, `success_with(|o| …)` to set output keys, `failure(msg)`, or `.with_warning(msg)` chained onto a success.

### The `Context`

`Context` is the capability handed to every middleware — it's the SDK's ergonomic wrapper over the plugin's host imports (§6 of the technical spec: `moonlit:host/host` and `moonlit:host/process`):

| Method | Purpose |
|---|---|
| `ctx.log_debug/info/warn/error(msg)` | structured logging routed to the CLI renderer |
| `ctx.progress(msg)` | live sub-step progress shown under the step spinner |
| `ctx.working_dir()` / `ctx.step_name()` | the step's working directory and name |
| `ctx.get_config(path)` / `ctx.get_config_as::<T>(path)` | read `$()`-substituted, permission-filtered configuration by `:`-separated path |
| `ctx.command(program)` | build a subprocess call, permission-checked against the plugin's `exec` allowlist |
| `ctx.http()` | a small blocking HTTP client over `wasi:http` |
| `ctx.env()` | environment variable access, permission-filtered |
| `ctx.state::<T>()` | the plugin's shared state (see below); panics if none was declared |
| `ctx.plugin_config::<T>()` | the typed plugin-level config; panics if none was declared |

### Sharing State Across Steps

A plugin keeps one component instance for the whole pipeline run, so middlewares on the same plugin can share in-memory state. Declare a `state:` type in `moonlit_plugin!` and reach it via `ctx.state::<T>()`.

### The `moonlit_plugin!` Macro

One `moonlit_plugin!` block per crate wires everything together — it generates the WIT `export` glue (`init`, `list-middlewares`, `execute`), config deserialization, and the plumbing for `state`/`config`:

```rust
moonlit_plugin! {
    name: "my-plugin",
    config: MyPluginConfig,        // optional: plugin-level config type
    state: MySharedState,          // optional: Default-constructed shared state
    middlewares: [Greet, AnotherMiddleware],
}
```

### Testing Without Wasm

`moonlit_plugin_sdk::testing` runs a middleware natively — no wasm build required — against a `MockHost`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use moonlit_plugin_sdk::testing::{run, MockHost};

    #[test]
    fn greet_greets_the_configured_name() {
        let host = MockHost::new();
        let ctx = Context::new(&host, "/work".to_string(), "test".to_string());
        let result = run(&Greet, &ctx, GreetConfig { name: "moonlit".to_string() });
        assert!(result.is_success());
    }
}
```

## Building

```bash
moonlit plugin build --release
```

This wraps `cargo build --target wasm32-wasip2`, then verifies the output is a WASI Preview 2 **component** (not a core wasm module). The artifact lands at `target/wasm32-wasip2/release/<crate_name>.wasm` (hyphens in the crate name become underscores). Pass `--manifest-path <dir>` to build a plugin crate that isn't the current directory; omit `--release` for a faster, unoptimized debug build during iteration.

## Inspecting

```bash
moonlit plugin inspect target/wasm32-wasip2/release/my_plugin.wasm
```

`inspect` instantiates the component with zero capability grants and prints its metadata and middlewares:

```
my-plugin v0.1.0
Does things

┌────────────┬─────────────────────────────┐
│ Middleware  │ Description                 │
├────────────┼─────────────────────────────┤
│ greet       │ logs and returns a greeting │
└────────────┴─────────────────────────────┘
```

`inspect` also accepts a plugin reference (`oci://…`, `file://…`, `http(s)://…`) instead of a local path, so you can inspect a published plugin the same way. `--output json` prints the same data as JSON for scripting.

## Using the Plugin Locally

Before publishing, reference the built component directly from a pipeline for testing:

```yaml
plugins:
  - name: my-plugin
    url: "file:///abs/path/to/my-plugin/target/wasm32-wasip2/release/my_plugin.wasm"
```

## Next Steps

- [Publishing a Plugin](./publishing-plugins.md) — push your component to an OCI registry so pipelines can pull it with `oci://`
- [Plugin Development Reference](../../reference/plugin-development.md) for the full SDK surface, or the [`moonlit-plugin-sdk` crate docs](https://crates.io/crates/moonlit-plugin-sdk)
- [Plugins System](../concepts/plugins.md) for how the engine loads and sandboxes plugins
