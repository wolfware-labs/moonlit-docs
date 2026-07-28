---
title: Error Handling and Troubleshooting
description: Exit codes and diagnostic output for moonlit run, validate, and other commands
---

# Error Handling and Troubleshooting

This page documents how `moonlit` reports failures: the exit codes it returns, and how diagnostics render in each output mode.

## Exit Codes

| Code | Meaning |
|---|---|
| `0` | Success. |
| `1` | General or unexpected error (e.g. an internal engine failure, an I/O error unrelated to configuration). |
| `2` | Configuration error — an invalid or missing pipeline file, a YAML validation failure, an unknown plugin/middleware/stage reference, or a bad CLI argument. |
| `3` | Plugin load error — a plugin failed to resolve, download, verify, or instantiate. |
| `4` | Pipeline execution error — a step failed during the run. |

These codes are consistent across `run` and `validate` (which shares the same load/resolve path as `run --dry-run`, so it can return `0`, `2`, or `3`, but never `4` — it never executes a step).

## How Errors Render

### Pretty and Plain Modes

Configuration and plugin-load errors are rendered as [miette](https://docs.rs/miette) diagnostics: a human-readable message, a labeled span into the offending YAML when the error can be located in the source, and (for unsupported plugin URL schemes) a help footer. For example, an unresolved plugin alias in a step's `run:` produces a message like:

```
Plugin 'gh' not found.
```

with the diagnostic code `moonlit::config` and a span pointing at the `run:` line that referenced it. In `plain` mode (auto-selected off a TTY, e.g. in CI) the same information prints without ANSI styling or spinners — the diagnostic message, span, and any help text as plain text.

Pass `-v`/`--verbose` to print the full error chain instead of a single-line cause.

### JSON Mode

With `--output json`, a top-level failure is printed to stdout as a single JSON object instead of a miette report:

```json
{"type":"error","message":"Plugin 'gh' not found.","exit_code":2}
```

During a run, `--output json` also emits one JSON object per line for every pipeline event as it happens (plugin resolution, step start/log/progress/finish, halt, and the final summary) — each tagged with a `type` field, for example:

```json
{"type":"step_log","step":"build","level":"info","message":"Restoring packages…"}
{"type":"step_finished","step":"build","result":{"name":"build","successful":true,"skipped":false,"duration_ms":210,"error_message":null,"warnings":[]}}
```

This makes `--output json` suitable for CI systems and other tooling that wants to consume the run as a structured event stream rather than parse human-readable output.

## Common Issues

### Pipeline File Not Found

**Symptom**: `Pipeline file '<path>' does not exist.` or `No pipeline file found in '<dir>' (looked for release.yml, moonlit.yml).`

**Fix**: Pass the correct path with `-f`/`--file`, or run `moonlit` from the directory containing `release.yml`.

### Invalid `run:` Format

**Symptom**: `Invalid run format: <value>. Expected format: 'plugin.middleware'`

**Fix**: A step's `run:` must be exactly `pluginName.middlewareName`, split on the first `.`. See [Step Properties](./config-file.md#step-properties).

### Unknown Plugin or Middleware

**Symptom**: `Plugin '<name>' not found.` or `Middleware with name '<name>' not found.`

**Fix**: Check the plugin's `name:` in `plugins:` matches the alias used before the `.` in `run:`, and that the middleware name after the `.` is one the plugin actually exports — `moonlit plugin inspect <ref>` lists a plugin's middlewares.

### Unsupported Plugin URL Scheme

**Symptom**: `unsupported plugin URL scheme: '<scheme>'`, with a help note listing the supported schemes.

**Fix**: Use one of `oci://`, `file://`, `http://`, or `https://` — see [Plugin URL Schemes](./config-file.md#plugin-url-schemes).

### No Stages or No Plugins

**Symptom**: `No stages found in the release configuration.` or `At least one plugin configuration must be provided.`

**Fix**: A pipeline must declare at least one stage under `stages:`, and at least one entry under `plugins:`.

### Denied Capability at Run Time

**Symptom**: A step logs a warning that a network host, exec program, or similar was denied, rather than failing outright with a config-time error.

**Fix**: Grant the capability in the plugin's `permissions:` block. See [Sandboxing](../guide/concepts/sandboxing.md).

### Plugin Failed to Load

**Symptom**: The plugin-resolution phase reports a failure and the run stops with exit code `3` — the plugin couldn't be pulled, its content digest didn't match, authentication failed, or it failed to instantiate.

**Fix**: Check registry credentials (`moonlit login <host>`), network access to the registry, and that the referenced tag/digest exists. `--offline` will surface a clear "no cached plugin" error instead of attempting a pull.

## Next Steps

- [CLI Reference](./cli.md) for `--output`, `-v`, and the commands that can return these codes
- [Configuration File Reference](./config-file.md) for the schema errors are validated against
- [Sandboxing](../guide/concepts/sandboxing.md) for the permissions model behind denied-capability warnings
