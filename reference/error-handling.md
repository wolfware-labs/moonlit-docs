---
title: Error Handling and Troubleshooting
description: Exit codes and diagnostic output for moonlit run, validate, and other commands
---

# Error Handling and Troubleshooting

This page documents how `moonlit` reports failures: the exit codes it returns, how diagnostics render in each output mode, and the messages behind the most common problems.

## Exit Codes

| Code | Meaning |
|---|---|
| `0` | Success. |
| `1` | General or unexpected error (an internal engine failure, an I/O error unrelated to configuration, a missing home directory). |
| `2` | Configuration error: an invalid or missing pipeline file, a YAML validation failure, an unknown plugin/middleware reference, or a bad CLI argument. |
| `3` | Plugin load error: a plugin failed to resolve, download, verify, instantiate, or initialize. |
| `4` | Pipeline execution error: a step failed during the run, timed out, or the run was cancelled. |

These codes are consistent across `run` and `validate`. `validate` shares the load and resolve path of `run --dry-run`, so it can return `0`, `2`, or `3`, but never `4`, because it never executes a step.

## How Errors Render

### Pretty and Plain Modes

Configuration and plugin-load errors are rendered as [miette](https://docs.rs/miette) diagnostics: a human-readable message, a labeled span into the offending YAML when the error can be located in the source, and a help footer where one applies (an unsupported plugin URL scheme lists the supported ones, for example). An unresolved plugin alias in a step's `run:` produces:

```
No plugin is declared with the alias 'gh'.
```

with the diagnostic code `moonlit::config` and a span pointing at the `run:` line that referenced it. The source is labeled with the file that was actually read (`release.yml` or `release.yaml`). CLI-side input problems, such as a missing pipeline file, use the code `moonlit::cli::input` and carry no span. In `plain` mode (auto-selected off a TTY, for example in CI) the same information prints without ANSI styling or spinners.

Pass `-v`/`--verbose` to print the full error chain instead of a single-line cause.

### JSON Mode

With `--output json`, a top-level failure is printed to stdout as a single JSON object instead of a diagnostic report:

```json
{"type":"error","message":"No plugin is declared with the alias 'gh'.","exit_code":2}
```

During a run, `--output json` also emits one JSON object per line for every pipeline event as it happens, each tagged with a `type` field: `plugin_resolving`, `plugin_pull_progress`, `plugin_ready`, `step_started`, `step_log`, `step_progress`, `step_skipped`, `step_finished`, `pipeline_halted`, and `pipeline_finished`. For example:

```json
{"type":"step_log","step":"build","level":"info","message":"Restoring packages…"}
{"type":"step_finished","step":"build","result":{"name":"build","successful":true,"skipped":false,"duration_ms":210,"error_message":null,"warnings":[]}}
```

Durations are integer milliseconds. This makes `--output json` suitable for CI systems and other tooling that wants to consume the run as a structured event stream rather than parse human-readable output.

## Common Issues

### Pipeline File Not Found

**Symptom**: `No pipeline file found in '<dir>' (looked for release.yml, release.yaml).`, `Pipeline file '<path>' does not exist.`, `Pipeline file '<path>' must have a .yml or .yaml extension.`, or `Working directory '<dir>' does not exist.`

**Fix**: Pass the correct path with `-f`/`--file`, or run `moonlit` from the directory containing `release.yml`. Only `release.yml` and `release.yaml` are discovered automatically; any other file name must be passed explicitly.

### Invalid `run:` Format

**Symptom**: `'<value>' is not a valid run reference; use the format 'plugin.middleware'.`

**Fix**: A step's `run:` must be exactly `pluginName.middlewareName`, split on the first `.`, with both halves non-empty. See [Step Properties](./config-file.md#step-properties).

### Unknown Plugin or Middleware

**Symptom**: `No plugin is declared with the alias '<name>'.` or `The plugin does not export a middleware named '<name>'.`

**Fix**: Check that the plugin's `name:` in `plugins:` matches the alias used before the `.` in `run:`, and that the middleware name after the `.` is one the plugin actually exports. `moonlit plugin inspect <ref>` lists a plugin's middlewares.

### Unknown, Duplicate, or Misspelled Keys

**Symptom**: `Unknown configuration key 'pluigns'.`, `Unknown step key 'contineOnError'.`, `Unknown permissions key 'netwrok'.`, or `Duplicate key 'name'.`

**Fix**: Schema keys are case-sensitive and must be spelled exactly as documented in the [Configuration File Reference](./config-file.md). The diagnostic points at the offending key. Keys inside a `config:` block are free-form and never trigger this.

### Missing Values

**Symptom**: `Key 'plugins' expects a sequence of plugins, but has no value.`, `Key 'build' expects a sequence of steps, but has no value.`, `Expected a sequence for a stage's steps.`, or `Expected a mapping for a step.`

**Fix**: Every schema key that is present must carry a value of the right shape. A stage must contain a list of steps, a step must be a mapping, and `plugins` must be a list of plugin mappings.

### Unsupported Plugin URL Scheme

**Symptom**: `Invalid plugin url: <value>. Expected an absolute URL with scheme 'oci', 'file', 'http', or 'https'.`

**Fix**: Use one of `oci://`, `file://`, `http://`, or `https://`. See [Plugin URL Schemes](./config-file.md#plugin-url-schemes). Package-manager references from older Moonlit releases (such as `nuget://`) are not supported; first-party plugins are published as OCI artifacts.

### No Stages or No Plugins

**Symptom**: `No stages defined. A pipeline needs at least one stage.` or `No plugins declared. Every step runs a middleware from a plugin, so at least one is required.`

**Fix**: A pipeline must declare at least one stage under `stages:`, and at least one entry under `plugins:`.

### Denied Capability at Run Time

**Symptom**: A step logs a warning such as `blocked from connecting to 'uploads.github.com' — add it to the plugin's permissions.network` or `blocked from running 'docker' — add it to permissions.exec`, and the step then fails or misbehaves.

**Fix**: Grant the capability in the plugin's `permissions:` block. The warning names the exact host or program and the key that allows it. See [Sandboxing](../guide/concepts/sandboxing.md).

### Plugin Failed to Load

**Symptom**: The plugin-resolution phase reports `failed to load plugin '<name>': …` and the run stops with exit code `3`. The message says why: the plugin couldn't be pulled (`plugin not found`, `network error while resolving plugin`), its content digest didn't match, authentication failed (`authentication failed for registry`), the artifact isn't a Moonlit plugin (`not a Moonlit/wasm plugin artifact`), it failed to instantiate, or its `init` rejected the plugin-level `config:` (for example `GitHub token is not configured.`).

**Fix**: Check registry credentials (`moonlit login <host>`), network access to the registry, that the referenced tag or digest exists, and that the plugin's `config:` block carries what it requires. With `--offline`, a cache miss is reported as `offline: no cached plugin for <ref>` instead of attempting a pull.

### Step Failed

**Symptom**: `An error occurred while executing middleware <middleware>: <message>` and exit code `4`.

**Fix**: The message after the colon is the middleware's own failure reason; each plugin page documents its failure messages. Set `continueOnError: true` on the step if the pipeline should carry on past it.

### Step Timed Out or Plugin Unavailable

**Symptom**: `Step '<name>' timed out after <duration>`, or `Plugin '<name>' unavailable after an earlier failure in this run.`

**Fix**: A step that exceeds `--step-timeout` aborts the run outright, even with `continueOnError`, because the interrupted plugin instance cannot be reused. Likewise, once a plugin traps, every later step targeting the same plugin fails fast rather than running against a broken instance. Raise the timeout, or fix the underlying failure.

### Duplicate Output Key

**Symptom**: `Key '<key>' already exists`

**Fix**: A middleware returned the same output key twice. This is a plugin bug; report it to the plugin's author.

## Next Steps

- [CLI Reference](./cli.md) for `--output`, `-v`, and the commands that can return these codes
- [Configuration File Reference](./config-file.md) for the schema errors are validated against
- [Sandboxing](../guide/concepts/sandboxing.md) for the permissions model behind denied-capability warnings
