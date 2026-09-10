---
title: Command Line Interface
description: Reference documentation for the moonlit command-line interface
---

# Command Line Interface

The `moonlit` binary is the entry point for running pipelines, validating configuration, managing registry credentials, and working with plugins. This page documents every command and flag.

## Synopsis

```bash
moonlit [--output <pretty|json|plain>] [-v|--verbose] <command> [<args>]
```

With no command, `moonlit` prints its help text. Use [`moonlit version`](#moonlit-version) to see the version banner.

## Global Flags

These flags apply to every command:

| Flag | Description |
|---|---|
| `--output <pretty\|json\|plain>` | Output mode. When omitted, Moonlit auto-detects: `pretty` on a TTY, `plain` otherwise (for example in CI). `json` emits machine-readable JSON and is never auto-selected; pass it explicitly. |
| `-v`, `--verbose` | Enable `DEBUG`/`TRACE` logging, including per-step middleware/version lines and expression-resolution traces. Without it, errors print a single-line cause; with it, the full error chain. |

`moonlit --help` and `moonlit <command> --help` print usage for any command.

## `moonlit run`

Runs a release pipeline.

```bash
moonlit run [-f|--file <path>] [-w|--working-dir <path>] [-s|--stage <name>]... [-a|--arg <key=value>]... [--offline] [--step-timeout <duration>] [--dry-run]
```

| Flag | Description |
|---|---|
| `-f`, `--file <path>` | Pipeline file to run. When omitted, Moonlit looks for `release.yml` in the working directory, then `release.yaml`. An explicit path must end in `.yml` or `.yaml`; a relative path is resolved against the working directory. |
| `-w`, `--working-dir <path>` | Working directory for the run. Default: the current directory. Must exist. |
| `-s`, `--stage <name>` | Run only the named stage(s). Repeatable and/or comma-separated (`-s build,test` and `-s build -s test` are equivalent). Stage names are matched case-insensitively. Default: all stages. |
| `-a`, `--arg <key=value>` | Set a pipeline argument, overriding the same key under the YAML's `arguments:` section. Repeatable. Split on the first `=`, so the value may itself contain `=`. An entry without an `=`, or with an empty key, is rejected at argument-parsing time with `expected key=value, got '<value>'`. |
| `--offline` | Fail on a plugin cache miss instead of pulling from the network. |
| `--step-timeout <duration>` | Per-step timeout, for example `300s` or `1m30s` ([humantime](https://docs.rs/humantime) syntax). No timeout by default. A step that exceeds it aborts the whole run, regardless of `continueOnError`, because the plugin's instance cannot be reused after being interrupted. |
| `--dry-run` | Load and validate the pipeline, resolving plugins and verifying middleware references, without executing any step. |

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

Parses the pipeline, resolves its plugins, and verifies every `run:` reference, without executing anything. Equivalent to `moonlit run --dry-run`, plus a confirmation line on success.

```bash
moonlit validate [-f|--file <path>] [-w|--working-dir <path>]
```

| Flag | Description |
|---|---|
| `-f`, `--file <path>` | Pipeline file to validate. Same resolution as `moonlit run`: `release.yml` in the working directory, then `release.yaml`. |
| `-w`, `--working-dir <path>` | Working directory. Default: the current directory. |

On success, prints `✔ Configuration valid` and exits `0`. On failure, it prints the same diagnostics `run` would (see [Error Handling](./error-handling.md)) and exits with the matching code.

## `moonlit plugin`

Scaffold, build, inspect, and publish plugins.

### `moonlit plugin new <name>`

Scaffolds a new plugin crate from the built-in templates, in a new `<name>/` directory. The name must start with a letter and contain only letters, digits, `-`, or `_`; the command refuses to overwrite an existing directory.

```bash
moonlit plugin new <name> [--namespace <org>] [--description <text>] [--license <spdx-id>] [--pdk-path <path>]
```

| Flag | Description |
|---|---|
| `--namespace <org>` | Publish namespace. On a TTY, prompted with your `git config user.name` (or `my-org`) as the default; used as-is without a prompt when passed. |
| `--description <text>` | One-line crate description. Prompted on a TTY; empty by default. |
| `--license <spdx-id>` | SPDX license expression. On a TTY, a menu offers `MIT OR Apache-2.0` (recommended), `Apache-2.0`, `MIT`, and `Elastic-2.0`; any expression can be passed directly. Defaults to `MIT OR Apache-2.0`. |
| `--pdk-path <path>` | Emit a local `path = ...` dependency on `moonlit-pdk` instead of a published crates.io version, for developing the PDK and a plugin together. |

Interactive prompts only appear when both stdin and stderr are a TTY; otherwise every unset flag falls back to its default.

The scaffold contains `Cargo.toml` (a `cdylib` crate depending on `moonlit-pdk`, `serde`, `serde_json`, and `schemars`), `src/lib.rs` with a sample `greet` middleware and its unit test, `moonlit-plugin.toml` with the publish metadata, a `README.md`, and a `.gitignore`. See [Authoring a Plugin](../guide/advanced/custom-plugins.md).

### `moonlit plugin build`

Builds the plugin in the current directory (or `--manifest-path`) to a WASI Preview 2 component, via `cargo build --target wasm32-wasip2`.

```bash
moonlit plugin build [--release] [--manifest-path <dir>]
```

| Flag | Description |
|---|---|
| `--release` | Build in release mode (optimized, smaller component). |
| `--manifest-path <dir>` | Directory containing the plugin crate's `Cargo.toml`. Default: the current directory. |

The build asks `cargo metadata` where the artifact lands, so a crate inside a workspace (which writes to the workspace's `target/`) and a crate whose `[lib] name` differs from its package name both resolve correctly. After building, the command verifies the output is a component rather than a core wasm module and prints its path.

Host toolchain settings are not inherited by the wasm build: `RUSTFLAGS`, `CARGO_ENCODED_RUSTFLAGS`, `CARGO_BUILD_RUSTFLAGS`, `RUSTC_WRAPPER`, and `RUSTC_WORKSPACE_WRAPPER` are cleared for the nested `cargo build`, because flags meant for the host (coverage instrumentation, for example) break the `wasm32-wasip2` target. Put component-specific flags in the plugin crate's own `.cargo/config.toml` instead.

Fails with exit code `2` if the crate isn't a plugin crate (`[lib] crate-type = ["cdylib"]`) or the `wasm32-wasip2` target isn't installed (`rustup target add wasm32-wasip2`), and `4` if `cargo build` itself fails.

### `moonlit plugin inspect <PATH|REF>`

Prints a component's metadata (name, version, description) and the middlewares it exports, by instantiating it with zero capability grants. Because it calls the component's `describe` export rather than `init`, a plugin that requires configuration still inspects cleanly.

```bash
moonlit plugin inspect <path|ref>
```

`<path|ref>` accepts either a path to a built `.wasm` component or a plugin reference (`oci://...`, `file://...`, `http(s)://...`); see [plugin URL schemes](./config-file.md#plugin-url-schemes). A reference is resolved (and pulled if not cached) the same way the engine resolves plugins for a run.

`--output` controls the rendering: `pretty` prints a table, `plain` prints one middleware per line, and `json` prints an object with `name`, `version`, `description`, `icon` (a data URI, or `null`), and a `middlewares` array whose entries carry `name`, `description`, `inputSchema`, and `outputSchema` (JSON Schema objects, or `null` when the plugin does not declare them).

### `moonlit plugin publish <REF>`

Publishes a built component to an OCI registry.

```bash
moonlit plugin publish <ref> [--file <path>] [--manifest-path <dir>]
```

| Flag | Description |
|---|---|
| `<ref>` | Target reference, for example `oci://ghcr.io/acme/plugin:1.0.0` or `ghcr.io/acme/plugin:1.0.0` (the `oci://` scheme is optional here). |
| `--file <path>` | Component file to publish. Default: the crate's release build output, located the same way `moonlit plugin build --release` locates it. |
| `--manifest-path <dir>` | Directory containing the plugin crate's `Cargo.toml`. Default: the current directory. |

Publishing introspects the component for its name, version, description, and middleware list, then reads the crate's `Cargo.toml` (`repository`, `license`) and `Cargo.lock` (the resolved `moonlit-pdk` version) to attach provenance metadata to the pushed artifact. On success it prints the reference, content digest, and size (as a JSON object under `--output json`). Requires prior [`moonlit login`](#moonlit-login-host) for a private registry.

## `moonlit version`

Prints the Moonlit logo, the CLI version, slogan, author, and license. On a wide, truecolor terminal the logo is rendered in color; elsewhere a plain text banner is used so piped output stays clean.

```bash
moonlit version
```

`moonlit --version` prints only the version string.

## `moonlit login [host]`

Stores credentials for an OCI registry, used by `plugin publish` and by plugin resolution for private `oci://` references.

```bash
moonlit login [<host>] [--username <name>] [--token <token>]
```

| Flag | Description |
|---|---|
| `<host>` | Registry host, for example `registry.moonlit.rs`, `ghcr.io`, or `localhost:5185`. Defaults to `registry.moonlit.rs` when omitted. |
| `--username <name>` | Registry username for Basic auth. Passing this (or `--token`) selects the manual path described below. |
| `--token <token>` | Registry token or password. Passing this (or `--username`) selects the manual path. **Required** when stdin isn't a TTY. |

With neither flag, `login` runs the browser-based device-authorization flow (RFC 8628) against the registry: it requests a device code, prints a one-time code, opens the registry's approval page in your browser, and polls until the registry mints a token, which is stored as a Bearer credential. Plain `http` is only used for loopback hosts; every other host is contacted over `https`. The flow times out if the code is not approved in time; run `moonlit login` again.

With `--username` and/or `--token`, no browser is involved and the CLI stores exactly what you supply. This is the path for CI and for registries that don't implement the device flow (GitHub Container Registry, for example). On a TTY, whichever of the two you left out is prompted for; leave the username blank to store a token-only (Bearer) credential, or supply one to store Basic auth.

Credentials are written to `~/.config/moonlit/credentials.toml` with `0600` permissions on Unix, keyed by host. Entries for other hosts are preserved.

## `moonlit logout [host]`

Removes the stored credential for a registry.

```bash
moonlit logout [<host>] [--local]
```

| Flag | Description |
|---|---|
| `<host>` | Registry host. Defaults to `registry.moonlit.rs` when omitted. |
| `--local` | Only remove the local credential; do not contact the registry. |

For a Bearer credential obtained through `moonlit login`'s device flow, `logout` first asks the registry to revoke the token, then removes it locally. If the registry can't be reached, the local credential is still removed, with a warning that the token should be revoked in the registry's portal. Basic credentials are removed locally only. Logging out of a host with no stored credential succeeds with `Not logged in to <host>.`

## `moonlit cache`

Inspects or clears the plugin content cache (`~/.cache/moonlit` on Linux, the platform's cache directory elsewhere).

### `moonlit cache ls`

Lists cached plugin artifacts: source reference, digest, size, and middleware count. Respects `--output`: `pretty` renders a table, `plain` renders one line per entry, `json` renders an array of objects with `source`, `digest`, `size`, `pulledAt`, and `middlewares`. An empty cache prints `cache is empty`.

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
