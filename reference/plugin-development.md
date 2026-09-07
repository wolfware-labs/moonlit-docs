---
title: Plugin SDK
description: Reference for the moonlit-pdk crate, the Rust plugin development kit for authoring Moonlit plugins
---

# Plugin SDK

`moonlit-pdk` (the Moonlit plugin development kit) is the Rust crate that turns writing a Moonlit
plugin into implementing a handful of small, typed structs instead of hand-writing WIT bindings.
It generates the `moonlit:plugin` component export glue, bridges the host's capability imports
into an ergonomic `Context`, and handles the JSON-text to typed-value conversion at the ABI
boundary described in the [WIT Contract](./wit-contract.md).

This page is a structural reference for the crate: what it's made of, the macro's full syntax,
and how each piece maps back onto the WIT world. For a guided walkthrough (scaffolding, building,
inspecting, testing), see [Authoring a Plugin](../guide/advanced/custom-plugins.md). For the
exhaustive method-by-method API, see the published crate docs on
[docs.rs](https://docs.rs/moonlit-pdk); this page doesn't embed rustdoc.

## Crates

| Crate | Role |
|---|---|
| [`moonlit-pdk`](https://crates.io/crates/moonlit-pdk) | The crate a plugin depends on directly: `Context`, `Middleware`, `MiddlewareResult`, the capability modules, the test harness, and the generated WIT bindings. |
| [`moonlit-pdk-macros`](https://crates.io/crates/moonlit-pdk-macros) | A proc-macro-only crate providing `moonlit_plugin!`; re-exported through `moonlit-pdk`'s `prelude`, so plugins never depend on it directly. |

A plugin crate is a `cdylib` compiled for the `wasm32-wasip2` target (`moonlit plugin build`
wraps `cargo build --target wasm32-wasip2` and verifies the output is a component, not a core
wasm module). Alongside `moonlit-pdk`, a plugin crate needs `serde` (with the `derive` feature),
`serde_json`, and `schemars = "1"`; `moonlit plugin new` scaffolds all of this.

Both crates are versioned together and follow semantic versioning. The current line targets
plugin ABI `moonlit:plugin@0.3.0`.

## The `moonlit_plugin!` macro

One `moonlit_plugin!` invocation per crate generates the entire WIT `Guest` implementation
(`describe`, `init`, `list-middlewares`, and `execute`) plus the `export!` call that turns your
crate into an instantiable component:

```rust
moonlit_plugin! {
    name: "git",
    icon: "icon.png",          // optional: PNG or WebP, relative to the crate root
    config: GitPluginConfig,   // optional: plugin-level config type
    state: GitShared,          // optional: Default-constructed shared state
    middlewares: [RepoContext, LatestTag, Commits, Tag, Push],
}
```

A real, minimal example from the first-party `git` plugin:

```rust
use moonlit_pdk::prelude::*;

moonlit_plugin! {
    name: "git",
    icon: "icon.png",
    state: GitShared,
    middlewares: [RepoContext, LatestTag, Commits, Tag, Push],
}
```

### Fields

| Field | Required | Type | Effect |
|---|---|---|---|
| `name` | yes | string literal | The plugin's `describe`/`init` metadata name. `version` and `description` are read automatically from `CARGO_PKG_VERSION` and `CARGO_PKG_DESCRIPTION`. |
| `middlewares` | yes | `[Type, ...]` | Every `Middleware`-implementing type this plugin exports. Generates the `list-middlewares` table (with input and output schemas) and the `execute` dispatch arm for each. |
| `icon` | no | string literal path | A `.png` or `.webp` file, relative to the crate's `Cargo.toml`, read at compile time and embedded as a `data:` URI in `plugin-metadata.icon`. A changed icon triggers a rebuild; a missing file or another extension is a compile error. |
| `config` | no | a type implementing `PluginConfig` | Plugin-level config, decoded and validated once in `init` from the YAML `plugins[].config` block, then reachable from any middleware via `ctx.plugin_config::<T>()`. |
| `state` | no | a `Default + Sync` type | Shared state held for the whole component instance's lifetime (one instance per pipeline run; see [Plugin System Architecture](./plugin-system.md)), reachable via `ctx.state::<T>()`. Wrap mutable fields in `Shared<T>` (below). |

Any other field is a compile error naming the accepted set.

### Generated dispatch

For `execute`, the macro matches the incoming middleware name against each declared type's
`Middleware::NAME`, deserializes the step's JSON config into that middleware's `Input` type
(coercing scalars per the same rules used for pipeline config binding), and calls
`Middleware::execute`. The returned `MiddlewareResult<Output>` is serialized to the WIT
`middleware-result`: the output struct's fields become the `(key, json-value)` output pairs.
An unrecognized middleware name returns a failure naming it; this path is unreachable in
practice because `list-middlewares` is validated against every `run:` reference at pipeline
build time.

For `init`, when a `config:` type is declared the macro decodes it, calls
`PluginConfig::validate`, and stores it for the life of the instance; an `Err` from either step
aborts `init` with that message, or with an `"invalid plugin config: ..."` wrapper for a decode failure.

## The `Middleware` trait

Every entry in a plugin's `middlewares:` list implements this trait:

```rust
pub trait Middleware: Default {
    const NAME: &'static str;
    const DESCRIPTION: &'static str = "";
    type Input: serde::de::DeserializeOwned + Default + schemars::JsonSchema;
    type Output: serde::Serialize + schemars::JsonSchema;
    fn execute(&self, ctx: &Context, input: Self::Input) -> MiddlewareResult<Self::Output>;
}
```

- **`NAME`**: the identifier used after the `.` in a step's `run:` reference (for example `git.tag`).
- **`DESCRIPTION`**: shown by `moonlit plugin inspect` and `list-middlewares`.
- **`Input`**: the step's `config:` block, deserialized. It must implement `Default` so a step
  that omits `config:` entirely still binds; a `#[serde(default)]` struct is the idiomatic
  "all fields optional" choice. Use `NoInput` for a middleware that reads no configuration.
- **`Output`**: the values the middleware publishes for later steps. It must serialize to a JSON
  object; each field becomes an output key readable as `$(output:<step>:<field>)`. Use
  `NoOutput` for a middleware that publishes nothing.
- **`execute`**: the middleware body; return a `MiddlewareResult<Self::Output>`.

Both `Input` and `Output` derive `schemars::JsonSchema`. The macro emits those schemas into the
component's `list-middlewares` result, which is what lets `moonlit plugin inspect --output json`
and the registry document a plugin's config keys and outputs without running it. Doc comments on
the fields become the schema descriptions.

## `Context`: the host bridge

`Context` is the PDK's ergonomic wrapper over the `moonlit:plugin/host` and
`moonlit:plugin/process` imports, plus the WASI imports the world pulls in. It's the one thing
every `Middleware::execute` receives:

| Method | Maps to |
|---|---|
| `ctx.log_debug/info/warn/error(msg)` | `moonlit:plugin/host.log` |
| `ctx.progress(msg)` | `moonlit:plugin/host.report-progress` |
| `ctx.get_config(path)` / `ctx.get_config_as::<T>(path)` | `moonlit:plugin/host.get-config`, JSON-decoded (and coerced for the `_as` variant) |
| `ctx.working_dir()` / `ctx.step_name()` | fields of the WIT `release-context` passed into `execute` |
| `ctx.command(program)` | builds a `moonlit:plugin/process` `command`; see `process` below |
| `ctx.http()` | a blocking client over `wasi:http/outgoing-handler` |
| `ctx.env()` | `wasi:cli/environment`, filtered by the plugin's `env` permission grant |
| `ctx.clock()` | `wasi:clocks/monotonic-clock` |
| `ctx.random()` | `wasi:random/random` |
| `ctx.state::<T>()` | the `state:` type declared in `moonlit_plugin!`; panics if none was declared |
| `ctx.plugin_config::<T>()` | the `config:` type declared in `moonlit_plugin!`; panics if none was declared |

The `Host` trait that `Context` borrows abstracts these calls so the exact same middleware code
runs against the real host (`RealHost`, compiled only for `wasm32`) or a `MockHost` in native
unit tests; see `testing` below.

## `MiddlewareResult`

`MiddlewareResult<T>` carries a typed output on success:

```rust
MiddlewareResult::ok(TagOutput { name: "v1.2.3".into(), sha: "abc123".into() })
MiddlewareResult::ok(NoOutput {})
MiddlewareResult::failure("something went wrong")
result.with_warning("proceeding anyway")   // chainable onto success or failure
```

Accessors for tests: `is_success()`, `error_message()`, and `warnings()`.

When the macro converts the result to the WIT record, the output struct is serialized with
`serde_json`. A serialization failure, or an output that is not a JSON object, degrades the
whole result to a failure naming the problem, rather than silently dropping values. `NoOutput`
serializes to an empty object, meaning "no outputs".

## `PluginConfig`

An optional trait for semantic validation of a plugin-level `config:` block beyond what `serde`
deserialization already enforces:

```rust
pub trait PluginConfig {
    fn validate(&self) -> Result<(), String> {
        Ok(())   // default: accept everything
    }
}
```

`moonlit_plugin!` calls `validate` right after decoding `config:` in `init`; the returned message
surfaces verbatim as the `init` error (unlike a decode failure, which gets an
`"invalid plugin config: ..."` wrapper). The first-party GitHub plugin, for example, returns
`GitHub token is not configured.` when its `token` is blank.

## `Shared<T>`: mutable plugin state

`moonlit_plugin! { state: T }` installs `T` in a `static`, so it must be `Sync`. `Shared<T>` is
an interior-mutable cell that provides that while staying ergonomic: `get()` clones the value
out, `set(value)` replaces it, and `update(|v| ...)` mutates in place. A `Default` `T` gives a
`Default` `Shared<T>`. The `git` plugin uses it to hand the tag SHA found by `latest-tag` to a
later `commits` step:

```rust
#[derive(Default)]
pub struct GitShared {
    pub latest_tag_sha: Shared<Option<String>>,
}
```

## Capability modules

Beyond `Context`'s direct methods, the crate ships small modules for common needs:

| Module | Purpose |
|---|---|
| `process` | A safe wrapper over `moonlit:plugin/process`. `ctx.command(program)` returns a builder with `arg`/`args`, `cwd`, `env`/`envs`, and `stdin`; finish with `run()` (capture silently), `stream(LineHandler)` (log each line live and capture), or `spawn()` (a `Child` with `next_line`, `wait`, `kill`). A non-zero exit is data on the returned `Output` (`success()`, `exit_code`, `stdout()`, `stderr()`); `Err` means the spawn itself failed. `LineHandler::severity()` is the standard heuristic (`"error"`/`"failed"` to error, `"warning"` to warn, else info); `at(level)`, `silent()`, and `custom(f)` are the alternatives. |
| `http` | A small blocking client over `wasi:http`: `get`/`post`/`put`/`patch`/`delete`, `header`, `bearer`, `json`, `body_bytes`, `timeout_ms`, then `send()`. The `Response` exposes `status()`, `is_success()`, `header(name)`, `bytes()`, `text()`, and `json::<T>()`; gzip-encoded bodies are inflated automatically. |
| `env` | Environment variable access via `wasi:cli/environment`, pre-filtered by the plugin's `env` permission grant: `var(name)`, `var_or(name, default)`, `vars()`. |
| `clock` | Monotonic clock access: `now()` in nanoseconds, `start()` returning a `Timer` whose `elapsed_ms()` re-reads the live clock, and `sleep_ms(ms)`. |
| `random` | Randomness from `wasi:random`: `bytes(n)` and `uuid()` (a lowercase UUIDv4 string). |
| `config` | The coercing JSON deserializer (`from_json_value`) used for both plugin- and step-level binding. Scalars arrive as strings and are parsed in the fixed order bool, integer, float, datetime, string. |
| `changelog` | The shared `Entry`/`Category` types and a `render(categories, commit_url_prefix)` markdown generator, used by the `semantic-release` plugin to produce categories and by the `github`/`gitlab` plugins to render release bodies from them. |
| `testing` | Runs a `Middleware` natively against a `MockHost`; no wasm build required for unit tests. |

### Testing

`MockHost` is a recording, scriptable host. Configure it with the builder methods, run the
middleware through `testing::run`, and assert on the result and on what the host recorded:

| Method | Purpose |
|---|---|
| `with_config(path, json)` | Serve a value for `ctx.get_config(path)`. |
| `with_env(key, value)` | Serve an environment variable. |
| `with_random(bytes)` | Seed the deterministic random source. |
| `with_clock(nanos)` | Script successive monotonic readings. |
| `with_process_result(exit_code, chunks)` / `with_process_error(msg)` | Enqueue the outcome of the next subprocess call; `recorded_commands()` returns what was run. |
| `with_http_response(status, body)` / `with_http_response_headers(...)` / `with_http_error(msg)` | Enqueue the next HTTP response; `recorded_requests()` returns what was sent. |
| `logs()`, `progress()`, `recorded_sleeps()` | What the middleware logged, reported, and slept. |

```rust
use moonlit_pdk::testing::{run, MockHost};

let host = MockHost::new().with_process_result(0, vec![]);
let ctx = Context::new(&host, "/work".to_string(), "test".to_string());
let result = run(&Tag, &ctx, TagInput { tag_name: "v1.0.0".into(), message: None });
assert!(result.is_success());
```

Attach shared state or plugin config with `Context::with_state(&state)` and
`Context::with_plugin_config(&cfg)` when the middleware under test reads them.

## Prelude

`use moonlit_pdk::prelude::*;` brings in `moonlit_plugin!`, `Context`, `LogLevel`, `Middleware`,
`MiddlewareResult`, `NoInput`, `NoOutput`, `PluginConfig`, `Shared` (from `state`),
`LineHandler` (from `process`), `from_json_value` (from `config`), and `serde::{Deserialize,
Serialize}`: everything a typical plugin crate needs in scope.

## See also

- [WIT Contract](./wit-contract.md): the ABI this crate compiles down to.
- [Authoring a Plugin](../guide/advanced/custom-plugins.md): scaffolding, building, testing, and
  inspecting a plugin end to end.
- [Publishing a Plugin](../guide/advanced/publishing-plugins.md): pushing a built component to an
  OCI registry.
- [`moonlit-pdk` on docs.rs](https://docs.rs/moonlit-pdk) for the full API.
