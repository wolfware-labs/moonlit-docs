---
title: Plugin SDK
description: Reference for the moonlit-plugin-sdk crate — the Rust SDK for authoring Moonlit plugins
---

# Plugin SDK

`moonlit-plugin-sdk` is the Rust crate that turns writing a Moonlit plugin into implementing a
handful of small, typed structs instead of hand-writing WIT bindings. It generates the
`moonlit:plugin` component export glue, bridges the host's capability imports into an ergonomic
`Context`, and handles the JSON-text ↔ typed-value conversion at the ABI boundary described in the
[WIT Contract](./wit-contract.md).

This page is a structural reference for the crate — what it's made of, the macro's full syntax,
and how each piece maps back onto the WIT world. For a guided walkthrough (scaffolding, building,
inspecting, testing), see [Authoring a Plugin](../guide/advanced/custom-plugins.md). For the
exhaustive method-by-method API, see the published crate docs on
[crates.io](https://crates.io/crates/moonlit-plugin-sdk) — this page doesn't embed rustdoc.

## Crates

| Crate | Role |
|---|---|
| `moonlit-plugin-sdk` | The crate a plugin depends on directly: `Context`, `Middleware`, `MiddlewareResult`, capability modules, and the generated WIT bindings. |
| `moonlit-plugin-sdk-macros` | A proc-macro-only crate providing `moonlit_plugin!`; re-exported through `moonlit-plugin-sdk`'s `prelude`, so plugins never depend on it directly. |

A plugin crate is a `cdylib` compiled for the `wasm32-wasip2` target (`moonlit plugin build` wraps
`cargo build --target wasm32-wasip2` and verifies the output is a component, not a core wasm
module).

## The `moonlit_plugin!` macro

One `moonlit_plugin!` invocation per crate generates the entire WIT `Guest` implementation —
`describe`, `init`, `list-middlewares`, and `execute` — plus the `export!` call that turns your
crate into an instantiable component:

```rust
moonlit_plugin! {
    name: "git",
    config: GitPluginConfig,   // optional: plugin-level config type
    middlewares: [RepoContext, LatestTag, Commits, Tag, Push],
    state: GitShared,          // optional: Default-constructed shared state
}
```

A real, minimal example from the first-party `git` plugin (`plugins/git/src/lib.rs`):

```rust
use moonlit_plugin_sdk::prelude::*;

moonlit_plugin! {
    name: "git",
    state: GitShared,
    middlewares: [RepoContext, LatestTag, Commits, Tag, Push],
}
```

### Fields

| Field | Required | Type | Effect |
|---|---|---|---|
| `name` | yes | string literal | The plugin's `describe`/`init` metadata name. `version` and `description` are read automatically from `CARGO_PKG_VERSION`/`CARGO_PKG_DESCRIPTION`. |
| `middlewares` | yes | `[Type, ...]` | Every `Middleware`-implementing type this plugin exports. Generates the `list-middlewares` table and the `execute` dispatch arm for each. |
| `config` | no | a type implementing `PluginConfig` | Plugin-level config, decoded and validated once in `init` from the YAML `plugins[].config` block, then reachable from any middleware via `ctx.plugin_config::<T>()`. |
| `state` | no | a `Default` type | Shared, `Default`-constructed state held for the whole component instance's lifetime (one instance per pipeline run — see [Plugin System Architecture](./plugin-system.md)), reachable via `ctx.state::<T>()`. |

### Generated dispatch

For `execute`, the macro matches the incoming middleware name against each declared type's
`Middleware::NAME`, deserializes the step's JSON config into that middleware's `Config` type
(coercing scalars per the same rules used for pipeline config binding), and calls
`Middleware::execute`. An unrecognized middleware name returns a `middleware-result` failure
naming it — this path is unreachable in practice because `list-middlewares` is validated against
every `run:` reference at pipeline build time.

For `init`, when a `config:` type is declared the macro decodes it, calls
`PluginConfig::validate`, and stores it in a `OnceLock`; an `Err` from either step aborts `init`
with that message (or an `"invalid plugin config: …"` wrapper for a decode failure).

## The `Middleware` trait

Every entry in a plugin's `middlewares:` list implements this trait (from `sdk/src/middleware.rs`):

```rust
pub trait Middleware: Default {
    const NAME: &'static str;
    const DESCRIPTION: &'static str = "";
    type Config: serde::de::DeserializeOwned + Default;
    fn execute(&self, ctx: &Context, cfg: Self::Config) -> MiddlewareResult;
}
```

- **`NAME`** — the identifier used after the `.` in a step's `run:` reference (e.g. `git.tag`).
- **`DESCRIPTION`** — shown by `moonlit plugin inspect` and `list-middlewares`.
- **`Config`** — must implement `Default` so a step that omits `config:` entirely still binds.
- **`execute`** — the middleware body; return a `MiddlewareResult`.

## `Context` — the host bridge

`Context` (`sdk/src/context.rs`) is the SDK's ergonomic wrapper over the `moonlit:plugin/host` and
`moonlit:plugin/process` imports, plus the WASI imports the world pulls in. It's the one thing
every `Middleware::execute` receives:

| Method | Maps to |
|---|---|
| `ctx.log_debug/info/warn/error(msg)` | `moonlit:plugin/host.log` |
| `ctx.progress(msg)` | `moonlit:plugin/host.report-progress` |
| `ctx.get_config(path)` / `ctx.get_config_as::<T>(path)` | `moonlit:plugin/host.get-config`, JSON-decoded (and coerced for the `_as` variant) |
| `ctx.working_dir()` / `ctx.step_name()` | fields of the WIT `release-context` passed into `execute` |
| `ctx.command(program)` | builds a `moonlit:plugin/process` `command`; see `sdk::process` below |
| `ctx.http()` | a blocking client over `wasi:http/outgoing-handler` |
| `ctx.env()` | `wasi:cli/environment`, filtered by the plugin's `env` permission grant |
| `ctx.clock()` | `wasi:clocks/monotonic-clock` |
| `ctx.random()` | `wasi:random/random` |
| `ctx.state::<T>()` | the `state:` type declared in `moonlit_plugin!`; panics if none was declared |
| `ctx.plugin_config::<T>()` | the `config:` type declared in `moonlit_plugin!`; panics if none was declared |

The `Host` trait that `Context` borrows as `&dyn Host` abstracts these calls so the exact same
middleware code runs against the real host (`RealHost`, `wasm32` only) or a `MockHost` in native
unit tests — see `sdk::testing`.

## `MiddlewareResult` and `Output`

Builders on `MiddlewareResult` (`sdk/src/result.rs`) construct the WIT `middleware-result` record:

```rust
MiddlewareResult::success()
MiddlewareResult::success_with(|out| {
    out.set("tag", "v1.2.3");   // serializes to a json-value; keys become output:<step>:<key>
})
MiddlewareResult::failure("something went wrong")
result.with_warning("proceeding anyway")   // chainable onto success or failure
```

`Output::set` serializes each value to JSON text via `serde::Serialize`; a serialization failure
for any single key degrades the *whole* result to a failure naming that key, rather than silently
dropping the value.

## `PluginConfig`

An optional trait (`sdk/src/plugin_config.rs`) for semantic validation of a plugin-level `config:`
block beyond what `serde` deserialization already enforces:

```rust
pub trait PluginConfig {
    fn validate(&self) -> Result<(), String> {
        Ok(())   // default: accept everything
    }
}
```

`moonlit_plugin!` calls `validate` right after decoding `config:` in `init`; the returned message
surfaces verbatim as the `init` error (unlike a decode failure, which gets an
`"invalid plugin config: …"` wrapper).

## Capability modules

Beyond `Context`'s direct methods, the SDK ships small modules for common needs:

| Module | Purpose |
|---|---|
| `sdk::process` | A safe wrapper over `moonlit:plugin/process`, plus `LineHandler` — a standard severity heuristic (`"error"`/`"failed"` → error, `"warning"` → warn, else info) shared by the docker/dotnet/nodejs plugins for classifying subprocess output lines. |
| `sdk::http` | A small blocking client over `wasi:http`: `get`/`post`/`put`, bearer auth, JSON via `serde`, per-request timeout. |
| `sdk::env` | Environment variable access via `wasi:cli/environment` (the host's `env-var`/`env-vars`), pre-filtered by the plugin's `env` permission grant. |
| `sdk::clock` | `wasi:clocks/monotonic-clock` access. |
| `sdk::random` | `wasi:random/random` access. |
| `sdk::config` | The coercing JSON deserializer (`from_json_value`) used for both plugin- and step-level config binding. |
| `sdk::changelog` | Conventional-commit changelog helpers shared by the `semantic-release`-style plugins. |
| `sdk::testing` | Runs a `Middleware` natively against a `MockHost` — no wasm build required for unit tests. |

## Prelude

`use moonlit_plugin_sdk::prelude::*;` brings in `moonlit_plugin!`, `Context`, `LogLevel`,
`Middleware`, `MiddlewareResult`, `Output`, `PluginConfig`, `Shared` (from `sdk::state`),
`LineHandler` (from `sdk::process`), `from_json_value` (from `sdk::config`), and `serde::Deserialize`
— everything a typical plugin crate needs in scope.

## See also

- [WIT Contract](./wit-contract.md) — the ABI this crate compiles down to.
- [Authoring a Plugin](../guide/advanced/custom-plugins.md) — scaffolding, building, testing, and
  inspecting a plugin end to end.
- [Publishing a Plugin](../guide/advanced/publishing-plugins.md) — pushing a built component to an
  OCI registry.
- [`moonlit-plugin-sdk` on crates.io](https://crates.io/crates/moonlit-plugin-sdk) for the full API.
