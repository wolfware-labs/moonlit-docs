---
title: Middlewares
description: Learn what a middleware is in Moonlit, how the engine dispatches to it, and how it reads and contributes to the accumulator
---

# Middlewares

A **middleware** is a named operation a plugin exports — the actual unit of work a pipeline step runs. `git.latest-tag`, `sr.calculate-version`, and `gh.create-release` are all middlewares. This page explains what a middleware is, how the engine calls into it, and how it reads and writes pipeline configuration.

## What a Middleware Is

Each plugin is a WebAssembly component that exports one or more middlewares. A plugin advertises its middlewares through the `list-middlewares` export of the `moonlit:plugin` world, returning a name and description for each one:

```
git         → repo-context, latest-tag, commits, tag, push
sr          → analyze, calculate-version, generate-changelog
gh          → create-release
```

There's no separate "middleware type" or base class to implement — a middleware is simply a name the plugin recognizes when its `execute` export is called with that name. The plugin's own code decides how to route on it internally.

## Invoking a Middleware

A pipeline step names the middleware it runs with `run: pluginName.middlewareName`, split on the *first* `.`:

```yaml
stages:
  analyze:
    - name: tag
      run: git.latest-tag
    - name: version
      run: sr.calculate-version
      config:
        branch: $(output:repo:branch)
```

Here, `git.latest-tag` calls the `latest-tag` middleware on the plugin registered under the alias `git`. A malformed `run` value fails with `Invalid run format: <value>. Expected format: 'plugin.middleware'`. Every `run` reference is checked against the target plugin's `list-middlewares` result **before the pipeline executes** — an unknown plugin alias or middleware name fails fast at load time (exit code 2), not partway through a run.

## How the Engine Dispatches

For each step, once its `condition` passes and its `config` has been merged and `$(...)`-substituted, the engine calls the plugin's `execute` export directly:

```
execute(middleware: string, ctx: release-context, config: json-value) -> middleware-result
```

- **`middleware`** — the middleware name from `run`, e.g. `"latest-tag"`.
- **`ctx`** — a `release-context` carrying the `working-directory` and the current `step-name`, used for log correlation and filesystem-relative operations.
- **`config`** — the step's fully-substituted `config` block, JSON-encoded. Scalars that weren't coerced by `$(...)` substitution arrive as strings; the middleware binds them to typed values itself.

The middleware runs on the plugin's existing component instance — plugins get one instance for the whole pipeline run, so a middleware can read state left behind by an earlier middleware on the same plugin (see [How Moonlit Works](./how-it-works.md#plugin-lifetime-and-shared-state)).

## Reading the Accumulator

A middleware's `config` argument only carries what the step declared. To read configuration beyond that — values from other layers of the accumulator, or another step's output — a middleware calls back into the host:

```
get-config: func(path: string) -> option<json-value>
```

This resolves a `:`-separated path (e.g. `output:repo:branch`) against the same accumulated configuration `$(...)` substitution draws from, already permission-filtered for the calling plugin. A middleware also has `report-progress` for live sub-step status (shown under the step's spinner) and `log` for structured logging. See [Configuration](./configuration.md) for the full layering model these calls read from.

## Contributing Outputs

A middleware returns a `middleware-result`:

```
record middleware-result {
  successful: bool,
  error-message: option<string>,
  warnings: list<string>,
  output: list<tuple<string, json-value>>,
}
```

- **`successful`** / **`error-message`** determine whether the step succeeded; a failure stops the pipeline unless the step sets `continueOnError: true`.
- **`warnings`** are logged against the step — this is also how a denied capability is surfaced (see [Sandboxing](./sandboxing.md)).
- **`output`** is a set of key/value pairs the engine flattens into the accumulator under `output:<stepName>:<key>`, immediately readable by later steps via `$(output:stepName:key)`.

For example, if the step named `tag` runs `git.latest-tag` and the middleware returns `output: [("name", "v1.4.0"), ("sha", "abc123")]`, a later step can read `$(output:tag:name)` and `$(output:tag:sha)`.

## Middlewares and the Sandbox

A middleware never talks to the network, the filesystem, or a subprocess directly — it goes through host-mediated interfaces (`wasi:http`, `wasi:filesystem`, `moonlit:host/process`) that the engine gates per plugin. What a given middleware can actually reach at run time is controlled by its plugin's `permissions` grant, not by anything the middleware itself requests. See [Sandboxing](./sandboxing.md) for the full capability model.

## Next Steps

- Learn about [Sandboxing](./sandboxing.md) and how capability grants scope what a middleware can do
- Review the [Plugins System](./plugins.md) for how plugins expose middlewares
- See [Stages and Steps](./stages-steps.md) for how `run:` fits into a step's lifecycle
