---
title: Authoring a Plugin
description: Scaffold, implement, build, and inspect a Moonlit plugin with the Rust plugin development kit
---

# Authoring a Plugin

Moonlit plugins are **WebAssembly components**, built for WASI Preview 2 and the component model, that export a small set of functions the engine calls into: `describe`, `init`, `list-middlewares`, and `execute` (see [Plugins System](../concepts/plugins.md) for the conceptual overview). You write plugins in Rust against the [`moonlit-pdk`](https://crates.io/crates/moonlit-pdk) crate (the plugin development kit), which generates all of that glue for you: you implement typed `Middleware` structs and declare them in one `moonlit_plugin!` block.

## Prerequisites

- A Rust toolchain with the `wasm32-wasip2` target installed (`rustup target add wasm32-wasip2`)
- The `moonlit` CLI

## Scaffold a New Plugin

```bash
moonlit plugin new my-plugin
```

On a TTY this prompts for a namespace (defaults to your `git config user.name`), a one-line description, and a license, offering `MIT OR Apache-2.0` (the default), `Apache-2.0`, `MIT`, and `Elastic-2.0`. All three can also be passed as flags for non-interactive use:

```bash
moonlit plugin new my-plugin \
  --namespace acme \
  --description "Does things" \
  --license "MIT OR Apache-2.0"
```

Pass `--pdk-path <path>` to depend on a local checkout of the PDK instead of the crates.io release, when developing the two together.

The scaffold creates:

```
my-plugin/
├── Cargo.toml            # crate-type = ["cdylib"]; moonlit-pdk, serde, serde_json, schemars
├── moonlit-plugin.toml   # publish metadata: name, namespace, description, license
├── src/lib.rs            # a sample "greet" middleware, its moonlit_plugin! block, and a unit test
├── README.md
└── .gitignore
```

## Implementing a Middleware

A middleware is a `Default` unit struct that implements the `Middleware` trait from `moonlit_pdk::prelude`. It declares an `Input` type (bound from the step's `config:` block) and an `Output` type (published for later steps to read):

```rust
use moonlit_pdk::prelude::*;

/// Input for the `greet` middleware. Fields bind from step config with
/// string coercion; unknown keys are ignored.
#[derive(Deserialize, Default, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", default)]
struct GreetInput {
    /// Who to greet; defaults to "world" when empty.
    name: String,
}

/// Output published by `greet`, readable by later steps as
/// `$(output:<step>:greeting)`.
#[derive(Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
struct GreetOutput {
    /// The greeting message, e.g. `hello, world`.
    greeting: String,
}

#[derive(Default)]
struct Greet;

impl Middleware for Greet {
    const NAME: &'static str = "greet";
    const DESCRIPTION: &'static str = "logs and returns a greeting";
    type Input = GreetInput;
    type Output = GreetOutput;

    fn execute(&self, ctx: &Context, input: Self::Input) -> MiddlewareResult<Self::Output> {
        let who = if input.name.is_empty() { "world".to_string() } else { input.name };
        ctx.log_info(&format!("greeting {who}"));
        MiddlewareResult::ok(GreetOutput { greeting: format!("hello, {who}") })
    }
}
```

- `NAME` is the identifier used after the `.` in a step's `run:` reference (for example `my-plugin.greet`).
- `Input` is deserialized from the step's fully-substituted YAML config. It must implement `Default` so an absent config block still binds; `#[serde(default)]` makes every field optional. Scalars arrive as strings and are coerced into the field's type (`bool`, integers, floats, datetimes) as they bind.
- `Output` must serialize to a JSON object; each field becomes an output key. Use `NoInput` and `NoOutput` for a middleware that takes no configuration or publishes nothing.
- Both types derive `schemars::JsonSchema`. The macro embeds those schemas in the component, and doc comments on the fields become their descriptions, so `moonlit plugin inspect --output json` and the registry can document the middleware without running it.
- `execute` returns a `MiddlewareResult<Output>`: `ok(output)`, `failure(msg)`, or `.with_warning(msg)` chained onto either.

### The `Context`

`Context` is the capability handed to every middleware; it's the PDK's ergonomic wrapper over the plugin's host imports (`moonlit:plugin/host` and `moonlit:plugin/process`) and the WASI interfaces the world pulls in:

| Method | Purpose |
|---|---|
| `ctx.log_debug/info/warn/error(msg)` | structured logging routed to the CLI renderer |
| `ctx.progress(msg)` | live sub-step progress shown under the step spinner |
| `ctx.working_dir()` / `ctx.step_name()` | the step's working directory and name |
| `ctx.get_config(path)` / `ctx.get_config_as::<T>(path)` | read `$()`-substituted configuration by `:`-separated path, beyond what the step's own `config:` declared |
| `ctx.command(program)` | build a subprocess call, permission-checked against the plugin's `exec` allowlist; `run()`, `stream(LineHandler)`, or `spawn()` it |
| `ctx.http()` | a small blocking HTTP client over `wasi:http`, gated by the `network` allowlist |
| `ctx.env()` | environment variable access, filtered by the `env` grant |
| `ctx.clock()` | a monotonic clock: `now()`, `start()` for a stopwatch, `sleep_ms()` |
| `ctx.random()` | random bytes and `uuid()` |
| `ctx.state::<T>()` | the plugin's shared state (see below); panics if none was declared |
| `ctx.plugin_config::<T>()` | the typed plugin-level config; panics if none was declared |

Filesystem access, when the pipeline grants it, is ordinary `std::fs` against the working directory: under WASI the working directory is preopened as `.`, so relative paths work as expected.

### Sharing State Across Steps

A plugin keeps one component instance for the whole pipeline run, so middlewares on the same plugin can share in-memory state. Declare a `state:` type in `moonlit_plugin!`, wrap any mutable fields in `Shared<T>`, and reach it via `ctx.state::<T>()`:

```rust
#[derive(Default)]
struct MyShared {
    last_tag: Shared<Option<String>>,
}

// in one middleware
ctx.state::<MyShared>().last_tag.set(Some(tag.clone()));

// in a later one
let tag = ctx.state::<MyShared>().last_tag.get();
```

### Plugin-Level Configuration

Values under the plugin entry's `config:` block in the pipeline (a token, a registry URL) are bound once at load time. Declare a type, implement `PluginConfig` to validate it, and pass it as `config:` in `moonlit_plugin!`:

```rust
#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct MyPluginConfig {
    token: String,
}

impl PluginConfig for MyPluginConfig {
    fn validate(&self) -> Result<(), String> {
        if self.token.trim().is_empty() {
            return Err("token is not configured.".to_string());
        }
        Ok(())
    }
}
```

A validation error aborts the pipeline before any step runs, with your message verbatim. Middlewares read the bound value with `ctx.plugin_config::<MyPluginConfig>()`.

### The `moonlit_plugin!` Macro

One `moonlit_plugin!` block per crate wires everything together. It generates the WIT export glue (`describe`, `init`, `list-middlewares`, `execute`), config deserialization, schema emission, and the plumbing for `state`/`config`:

```rust
moonlit_plugin! {
    name: "my-plugin",
    icon: "icon.png",              // optional: PNG or WebP, embedded at build time
    config: MyPluginConfig,        // optional: plugin-level config type
    state: MyShared,               // optional: Default-constructed shared state
    middlewares: [Greet, AnotherMiddleware],
}
```

The version and description come from `Cargo.toml` (`version` and `description`), so keep those current; they are what `moonlit plugin inspect` and the registry display.

### Testing Without Wasm

`moonlit_pdk::testing` runs a middleware natively, with no wasm build required, against a `MockHost` that records logs, subprocess calls, and HTTP requests, and serves scripted responses:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use moonlit_pdk::testing::{run, MockHost};

    #[test]
    fn greet_greets_the_configured_name() {
        let host = MockHost::new();
        let ctx = Context::new(&host, "/work".to_string(), "test".to_string());
        let result = run(&Greet, &ctx, GreetInput { name: "moonlit".to_string() });
        assert!(result.is_success());
        assert!(host.logs().iter().any(|(_, m)| m.contains("moonlit")));
    }
}
```

`cargo test` runs these on the host target. See the [Plugin SDK](../../reference/plugin-development.md#testing) reference for the full `MockHost` builder.

## Building

```bash
moonlit plugin build --release
```

This wraps `cargo build --target wasm32-wasip2`, then verifies the output is a WASI Preview 2 **component** (not a core wasm module) and prints where it landed: `target/wasm32-wasip2/release/<lib_name>.wasm`, where hyphens in the crate name become underscores (`my-plugin` builds `my_plugin.wasm`). Inside a workspace the artifact lands in the workspace's `target/` directory; the command asks `cargo metadata` rather than guessing. Pass `--manifest-path <dir>` to build a plugin crate that isn't the current directory; omit `--release` for a faster, unoptimized debug build during iteration.

## Inspecting

```bash
moonlit plugin inspect target/wasm32-wasip2/release/my_plugin.wasm
```

`inspect` instantiates the component with zero capability grants, calls its `describe` and `list-middlewares` exports, and prints the result:

```
my-plugin v0.1.0
Does things

┌────────────┬─────────────────────────────┐
│ Middleware  │ Description                 │
├────────────┼─────────────────────────────┤
│ greet       │ logs and returns a greeting │
└────────────┴─────────────────────────────┘
```

`inspect` also accepts a plugin reference (`oci://...`, `file://...`, `http(s)://...`) instead of a local path, so you can inspect a published plugin the same way. `--output json` prints the same data as JSON, including the icon and each middleware's input and output schema, for scripting.

## Using the Plugin Locally

Before publishing, reference the built component directly from a pipeline for testing. A `file://` plugin is never cached, so rebuilding and re-running picks up the change immediately:

```yaml
plugins:
  - name: my-plugin
    url: "file:///abs/path/to/my-plugin/target/wasm32-wasip2/release/my_plugin.wasm"
    permissions:
      exec: ["some-tool"]     # whatever your middlewares actually call out to
```

Remember that the sandbox is deny-by-default: grant the plugin the hosts, programs, environment variables, and filesystem access its middlewares need, and nothing more. See [Sandboxing](../concepts/sandboxing.md).

## Next Steps

- [Publishing a Plugin](./publishing-plugins.md): push your component to an OCI registry so pipelines can pull it with `oci://`
- [Plugin SDK](../../reference/plugin-development.md) for the full crate surface, or the [`moonlit-pdk` API docs](https://docs.rs/moonlit-pdk)
- [Plugins System](../concepts/plugins.md) for how the engine loads and sandboxes plugins
