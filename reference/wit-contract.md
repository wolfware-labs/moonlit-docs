---
title: WIT Contract
description: The moonlit:plugin WIT world — the types, host imports, and plugin exports that form the plugin ABI
---

# WIT Contract

Every Moonlit plugin is a WebAssembly component targeting the `plugin` world defined by the
[WIT](https://component-model.bytecodealliance.org/design/wit.html) package `moonlit:plugin@0.1.0`.
WIT (the WebAssembly Interface Type language) describes this contract once, in a format both the
engine (the host) and the Rust SDK (the guest) compile against — so the two sides can never drift
without a build failure. This page is the reference for that contract: the shared types, the
capabilities the host provides, and the functions a plugin must export.

If you're authoring a plugin with the Rust SDK, you won't write WIT by hand — see
[Plugin SDK](./plugin-development.md) for the ergonomic wrapper and
[Authoring a Plugin](../guide/advanced/custom-plugins.md) for the walkthrough. This page documents
what that SDK compiles down to, and is the ground truth for anyone targeting the ABI directly
(e.g. from a non-Rust language with its own component tooling).

## Where it lives

The canonical file is `engine/wit/moonlit-plugin.wit` in the Moonlit source tree; the SDK vendors
an identical copy and a test asserts the two never drift. The engine refuses to instantiate a
component whose world's package version major differs from what it was built against, with a
friendly diagnostic rather than a wasmtime trap.

## The JSON boundary

The component model forbids recursive types, which rules out a natural "dynamic value" WIT type
for arbitrarily nested config and output data. Instead, structured values cross the ABI boundary
as UTF-8 JSON text — a `json-value` is just a `string`:

```wit
interface types {
  /// A JSON-encoded dynamic value. The WebAssembly component model forbids
  /// recursive types, so structured config and output values cross the ABI
  /// boundary as UTF-8 JSON text and are (de)serialized to a typed value on
  /// the Rust side (engine host and plugin SDK).
  type json-value = string;
```

Both the engine and the SDK (de)serialize this text with `serde_json` right at the edge, so
plugin authors never see raw JSON strings — the SDK binds `json-value` to real `serde` types.

## `interface types` — shared data types

The rest of `types` defines the records and enums used throughout the contract:

```wit
enum log-level { trace, debug, info, warn, error }

record release-context {
  working-directory: string,
  /// step name currently executing (for log correlation)
  step-name: string,
}

record middleware-result {
  successful: bool,
  error-message: option<string>,
  warnings: list<string>,
  /// step outputs: key -> JSON-encoded value
  output: list<tuple<string, json-value>>,
}

record middleware-info {
  name: string,
  description: string,
}

record plugin-metadata {
  name: string,
  version: string,
  description: string,
}
```

- **`release-context`** — the per-step context passed into `execute`: the pipeline's working
  directory and the currently executing step name (used to correlate logs back to a step).
- **`middleware-result`** — what a middleware returns: success/failure, an optional error message,
  accumulated warnings, and a list of `(key, json-value)` output pairs.
- **`middleware-info`** — the name/description pair returned by `list-middlewares` for discovery.
- **`plugin-metadata`** — the name/version/description a component reports from `describe`/`init`.

## `interface host` — host-provided capabilities

`host` is Moonlit's own interface for the capabilities every plugin needs beyond standard WASI —
correlated logging, reading the accumulated pipeline configuration, and reporting live progress.
The fully-qualified path is **`moonlit:plugin/host`**:

```wit
interface host {
  use types.{log-level, json-value};

  /// Structured logging routed to the CLI renderer (§9.4).
  log: func(level: log-level, message: string);

  /// Read a value from the accumulated configuration visible to this step
  /// (already $()-substituted and permission-filtered). Path uses `:` separators.
  get-config: func(path: string) -> option<json-value>;

  /// Live sub-step progress shown under the step spinner, e.g. "pushing layer 3/7".
  report-progress: func(message: string);
}
```

- **`log`** — structured logging at a severity level, rendered by the CLI's step output.
- **`get-config`** — reads a `:`-separated path out of the accumulated, already `$()`-substituted,
  permission-filtered configuration view served to that step. Returns `none` if the path is absent.
- **`report-progress`** — a free-text progress line shown live under the running step's spinner.

## `interface process` — subprocess execution

WASI Preview 2 has no process-spawning API, so Moonlit defines its own as a component-boundary
extension. Every call here is checked against the plugin's `exec` permission allowlist before a
process is spawned. The fully-qualified path is **`moonlit:plugin/process`**:

```wit
interface process {
  record command {
    program: string,
    args: list<string>,
    cwd: option<string>,
    env: list<tuple<string, string>>,
    stdin: option<string>,
  }

  enum stdio-stream { stdout, stderr }

  record output-chunk { %stream: stdio-stream, line: string }

  resource child {
    /// Blocking read of the next output line; none = process exited.
    next-line: func() -> option<output-chunk>;
    /// Wait for exit; returns exit code.
    wait: func() -> s32;
    kill: func();
  }

  /// Spawn; error string if program not found / not permitted.
  spawn: func(cmd: command) -> result<child, string>;

  /// Convenience: run to completion, capturing everything.
  run: func(cmd: command) -> result<tuple<s32, list<output-chunk>>, string>;
}
```

`list` and `stream` are reserved WIT keywords, so the `output-chunk` field that would naturally be
named `stream` is `%`-escaped as `%stream` — it's still the field named `stream` on both the host
and guest sides once bound into Rust.

- **`spawn`** — starts a process and returns a `child` resource for line-by-line streaming reads
  (used for live log output), or an `Err` string if the program isn't found or isn't permitted.
- **`run`** — a convenience wrapper that runs a command to completion and returns the exit code
  plus every captured output line at once.
- **`child`** — a resource (handle) with `next-line` (blocking read, `none` on exit), `wait`
  (block for the exit code), and `kill`.

## `world plugin` — imports and exports

The `plugin` world ties the two custom interfaces together with the standard WASI Preview 2
imports a component needs, and declares the four functions every plugin component must export:

```wit
world plugin {
  import host;
  import process;
  import wasi:http/outgoing-handler@0.2.3;
  import wasi:filesystem/types@0.2.3;
  import wasi:filesystem/preopens@0.2.3;
  import wasi:cli/environment@0.2.3;
  import wasi:clocks/wall-clock@0.2.3;
  import wasi:clocks/monotonic-clock@0.2.3;
  import wasi:random/random@0.2.3;

  use types.{json-value, release-context, middleware-result, middleware-info, plugin-metadata};

  /// Static plugin metadata, independent of config. `moonlit plugin inspect`
  /// uses this (plus `list-middlewares`) so it never needs a valid config to
  /// describe a component -- unlike `init`, which validates.
  export describe: func() -> plugin-metadata;

  /// Called once after instantiation with the plugin-level config block (JSON).
  /// Returning err aborts the pipeline with a plugin-load diagnostic (exit 3).
  export init: func(plugin-config: json-value) -> result<plugin-metadata, string>;

  /// Middleware discovery (used by `moonlit plugin inspect` and load-time validation
  /// of every `run:` reference -- unknown middleware fails fast BEFORE running, exit 2).
  export list-middlewares: func() -> list<middleware-info>;

  /// Execute one middleware. `config` is the fully-substituted step config (JSON).
  export execute: func(middleware: string, ctx: release-context, config: json-value) -> middleware-result;
}
```

### Imports

Besides `moonlit:plugin/host` and `moonlit:plugin/process`, a plugin component imports standard
WASI Preview 2 interfaces (all pinned to `@0.2.3`): outgoing HTTP, filesystem types and preopens,
CLI environment, and both the wall-clock and monotonic-clock. These are satisfied by
`wasmtime-wasi`/`wasmtime-wasi-http` on the host side — the engine wraps outgoing HTTP with the
`network` permission allowlist (see [Plugin System Architecture](./plugin-system.md)) and gates the
filesystem preopen on the `filesystem` permission grant; the plugin never talks to these APIs
directly, only through the SDK's `Context`.

### Exports

| Export | Called | Purpose |
|---|---|---|
| `describe` | on demand (`moonlit plugin inspect`) | Static name/version/description, independent of any config — works even without a valid pipeline config. |
| `init` | once, right after instantiation | Validates and binds the plugin-level `config:` block. An `Err` aborts pipeline load (exit code 3). |
| `list-middlewares` | at pipeline build time | Returns every middleware this plugin exports, for `run:` reference validation and `moonlit plugin inspect`. An unresolvable `run:` reference fails fast before any step executes (exit code 2). |
| `execute` | once per step | Runs one middleware by name against the step's fully `$()`-substituted config, returning a `middleware-result`. |

## Interface paths

The two Moonlit-specific interfaces resolve to **`moonlit:plugin/host`** and
**`moonlit:plugin/process`** — under the `moonlit:plugin` package, not a separate `moonlit:host`
package. If you're hand-writing WIT bindings or reading generated Rust module paths, those are the
names to expect (the SDK's generated bindings module mirrors this as
`moonlit_plugin_sdk::bindings::moonlit::plugin::{host, process, types}`).

## See also

- [Plugin SDK](./plugin-development.md) — the Rust crates that generate this contract's glue code
  for you.
- [Plugin System Architecture](./plugin-system.md) — how the engine resolves, sandboxes, and
  instantiates components against this world.
- [Sandboxing](../guide/concepts/sandboxing.md) — the `permissions` grant-list that gates `host`,
  `process`, and the WASI imports at run time.
