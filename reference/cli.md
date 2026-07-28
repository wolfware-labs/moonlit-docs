---
title: Command Line Interface
description: Reference documentation for the moonlit command-line interface
---

# Command Line Interface

The `moonlit` binary is the entry point for running pipelines, validating configuration, and managing plugins. This page documents every command and flag.

## Synopsis

```bash
moonlit [--output <pretty|json|plain>] [-v|--verbose] [<command>] [<args>]
```

With no command, `moonlit` behaves exactly like [`moonlit version`](#moonlit-version).

## Global Flags

These flags apply to every command:

| Flag | Description |
|---|---|
| `--output <pretty\|json\|plain>` | Output mode. When omitted, Moonlit auto-detects: `pretty` on a TTY, `plain` otherwise (e.g. in CI). `json` emits one machine-readable JSON object per line and is never auto-selected — pass it explicitly. |
| `-v`, `--verbose` | Enable `DEBUG`/`TRACE` logging, including per-step middleware/version lines and expression-resolution traces. Without it, errors print a single-line cause; with it, the full error chain. |

`moonlit --help` and `moonlit <command> --help` print usage for any command.

## `moonlit run`

Runs a release pipeline.

```bash
moonlit run [-f|--file <path>] [-w|--working-dir <path>] [-s|--stage <name>]... [-a|--arg <key=value>]... [--offline] [--step-timeout <duration>] [--dry-run]
```

| Flag | Description |
|---|---|
| `-f`, `--file <path>` | Pipeline file to run. Default: `release.yml` in the working directory. |
| `-w`, `--working-dir <path>` (alias `-d`) | Working directory for the run. Default: the current directory. |
| `-s`, `--stage <name>` | Run only the named stage(s). Repeatable and/or comma-separated (`-s build,test` and `-s build -s test` are equivalent). Default: all stages. |
| `-a`, `--arg <key=value>` | Set a pipeline argument, overriding the same key under the YAML's `arguments:` section. Repeatable. An entry without an `=` fails with `Invalid argument format: <value>` (exit code 2). |
| `--offline` | Fail on a plugin cache miss instead of pulling from the network. |
| `--step-timeout <duration>` | Per-step timeout, e.g. `300s`, `1m30s` ([humantime](https://docs.rs/humantime) syntax). No timeout by default. |
| `--dry-run` | Load and validate the pipeline — resolving plugins and verifying middleware references — without executing any step. |

Examples:

```bash
# Run every stage using ./release.yml
moonlit run

# Run specific stages from a named file
moonlit run -f ./ci/release.yml -s build,test

# Override a pipeline argument and cap each step at 5 minutes
moonlit run -a configuration=Release --step-timeout 5m
```

## `moonlit validate`

Parses the pipeline, resolves its plugins, and verifies every `run:` reference — without executing anything. Equivalent to `moonlit run --dry-run`, plus a confirmation line on success.

```bash
moonlit validate [-f|--file <path>] [-w|--working-dir <path>]
```

| Flag | Description |
|---|---|
| `-f`, `--file <path>` | Pipeline file to validate. Default: `release.yml` in the working directory. |
| `-w`, `--working-dir <path>` (alias `-d`) | Working directory. Default: the current directory. |

On success, prints `✔ Configuration valid` and exits `0`. On failure, it prints the same miette diagnostics `run` would (see [Error Handling](./error-handling.md)) and exits with the matching code.

## `moonlit plugin`

Scaffold, build, inspect, and publish plugins.

### `moonlit plugin new <name>`

Scaffolds a new plugin crate from the SDK templates, in a new `<name>/` directory.

```bash
moonlit plugin new <name> [--namespace <org>] [--description <text>] [--license <spdx-id>] [--sdk-path <path>]
```

| Flag | Description |
|---|---|
| `--namespace <org>` | Publish namespace. On a TTY, prompted with your `git config user.name` (or `my-org`) as the default; used as-is without a prompt when passed. |
| `--description <text>` | One-line crate description. Prompted on a TTY; empty by default. |
| `--license <spdx-id>` | SPDX license identifier (e.g. `Apache-2.0`, `MIT`, `Elastic-2.0`). Prompted on a TTY; defaults to `Apache-2.0`. |
| `--sdk-path <path>` | Emit a local `path = …` dependency on `moonlit-plugin-sdk` instead of a published crates.io version — for developing the SDK and a plugin together. |

Interactive prompts only appear when both stdin and stderr are a TTY; otherwise every unset flag falls back to its default.

### `moonlit plugin build`

Builds the plugin in the current directory (or `--manifest-path`) to a WASI Preview 2 component, via `cargo build --target wasm32-wasip2`.

```bash
moonlit plugin build [--release] [--manifest-path <dir>]
```

| Flag | Description |
|---|---|
| `--release` | Build in release mode (optimized, smaller component). |
| `--manifest-path <dir>` | Directory containing the plugin crate's `Cargo.toml`. Default: the current directory. |

Fails with exit code `2` if the crate isn't a plugin crate (`[lib] crate-type = ["cdylib"]`) or the `wasm32-wasip2` target isn't installed (`rustup target add wasm32-wasip2`), and `4` if `cargo build` itself fails.

### `moonlit plugin inspect <PATH|REF>`

Prints a component's metadata (name, version, description) and the middlewares it exports, by instantiating it with zero capability grants.

```bash
moonlit plugin inspect <path|ref>
```

`<path|ref>` accepts either a path to a built `.wasm` component, or a plugin reference (`oci://…`, `file://…`, `http(s)://…`) — see [plugin URL schemes](./config-file.md#plugin-url-schemes). A reference is resolved (and pulled if not cached) the same way the engine resolves plugins for a run.

### `moonlit plugin publish <REF>`

Publishes a built component to an OCI registry.

```bash
moonlit plugin publish <ref> [--file <path>] [--manifest-path <dir>]
```

| Flag | Description |
|---|---|
| `<ref>` | Target reference, e.g. `oci://ghcr.io/acme/plugin:1.0.0` or `ghcr.io/acme/plugin:1.0.0` (the `oci://` scheme is optional here). |
| `--file <path>` | Component file to publish. Default: the crate's release build output (`target/wasm32-wasip2/release/<name>.wasm`). |
| `--manifest-path <dir>` | Directory containing the plugin crate's `Cargo.toml`. Default: the current directory. |

Publishing reads the crate's `Cargo.toml` (`repository`, `license`) and `Cargo.lock` (the resolved `moonlit-plugin-sdk` version) to attach provenance metadata to the pushed artifact. Requires prior [`moonlit login`](#moonlit-login-host) for a private registry.

## `moonlit version`

Prints a banner, the CLI version, author, and license. This is also the default when no command is given.

```bash
moonlit version
# or, equivalently:
moonlit
```

## `moonlit login <host>`

Stores credentials for an OCI registry (used by `plugin publish` and by plugin resolution for private `oci://` references).

```bash
moonlit login <host> [--username <name>] [--token <token>]
```

| Flag | Description |
|---|---|
| `<host>` | Registry host, e.g. `ghcr.io` or `registry.moonlitbuild.dev`. |
| `--username <name>` | Registry username for Basic auth. On a TTY, prompted (leave blank for token-only/Bearer auth). |
| `--token <token>` | Registry token or password. On a TTY, prompted with hidden input; **required** when stdin isn't a TTY. |

Credentials are written to `~/.config/moonlit/credentials.toml` with `0600` permissions on Unix, keyed by host.

## `moonlit cache`

Inspects or clears the plugin content cache.

### `moonlit cache ls`

Lists cached plugin artifacts (source reference, digest, size, middleware count). Respects `--output`: `pretty` renders a table, `plain` renders one line per entry, `json` renders an array of objects.

### `moonlit cache clean`

Removes all cached content and reports how much was freed:

```
Removed 4 plugins, 9 blobs, 3 refs; freed 18874368 bytes.
```

## Exit Codes

`moonlit` returns a small, stable set of exit codes across every command that loads or executes a pipeline. See [Error Handling](./error-handling.md#exit-codes) for the full table and how errors are rendered.

## Next Steps

- [Configuration File Reference](./config-file.md) for the pipeline YAML schema
- [Error Handling](./error-handling.md) for exit codes and diagnostic output
- [Plugin System](./plugin-system.md) for how plugins are resolved, cached, and sandboxed
