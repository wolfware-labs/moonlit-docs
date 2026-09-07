---
title: Middlewares
description: Learn what a middleware is in Moonlit, how the engine dispatches to it, and how it reads and contributes to the accumulator
---

# Middlewares

A middleware is a named operation a plugin exports, and it is the actual unit of work a pipeline step runs. `git.latest-tag`, `sr.calculate-version`, and `gh.create-release` are all middlewares. This page covers what one is, how the engine calls into it, and how it reads and writes pipeline configuration.

## What a Middleware Is

Each plugin is a WebAssembly component that exports one or more middlewares. A plugin advertises its middlewares through the `list-middlewares` export of the `moonlit:plugin` world, returning a name, a description, and JSON Schemas for the config it reads and the outputs it publishes:

```
git         → repo-context, latest-tag, commits, tag, push
sr          → analyze, calculate-version, generate-changelog
gh          → related-items, create-release, write-variables
```

There is no separate "middleware type" or base class to implement. A middleware is just a name the plugin recognizes when its `execute` export is called with it, and the plugin's own code decides how to route on that name internally.

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

Here, `git.latest-tag` calls the `latest-tag` middleware on the plugin registered under the alias `git`. A malformed `run` value fails with `'<value>' is not a valid run reference; use the format 'plugin.middleware'.` Every `run` reference is checked against the target plugin's `list-middlewares` result before the pipeline executes, so an unknown plugin alias or middleware name fails at load time with exit code 2 rather than partway through a run.

## How the Engine Dispatches

For each step, once its `condition` passes and its `config` has been merged and `$(...)`-substituted, the engine calls the plugin's `execute` export directly:

```
execute(middleware: string, ctx: release-context, config: json-value) -> middleware-result
```

- `middleware` is the middleware name from `run`, `"latest-tag"` for example.
- `ctx` is a `release-context` carrying the `working-directory` and the current `step-name`, used for log correlation and for filesystem-relative operations.
- `config` is the step's fully-substituted `config` block, JSON-encoded. Scalars that `$(...)` substitution did not coerce arrive as strings, and the middleware binds them to typed values itself.

The middleware runs on the plugin's existing component instance. Since a plugin gets one instance for the whole pipeline run, a middleware can read state an earlier middleware on the same plugin left behind (see [How Moonlit Works](./how-it-works.md#plugin-lifetime-and-shared-state)).

## Reading the Accumulator

A middleware's `config` argument carries only what the step declared. For anything beyond that, whether values from other layers of the accumulator or another step's output, the middleware calls back into the host:

```
get-config: func(path: string) -> option<json-value>
```

This resolves a `:`-separated path such as `output:repo:branch` against the same accumulated configuration that `$(...)` substitution draws from, already permission-filtered for the calling plugin. Two other host calls are available: `report-progress`, for live sub-step status shown under the step's spinner, and `log`, for structured logging. See [Configuration](./configuration.md) for the full layering model these calls read from.

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

- `successful` and `error-message` decide whether the step succeeded. A failure stops the pipeline unless the step sets `continueOnError: true`.
- `warnings` are logged against the step. This is also how a denied capability surfaces (see [Sandboxing](./sandboxing.md)).
- `output` is a set of key/value pairs the engine flattens into the accumulator under `output:<stepName>:<key>`, where later steps can read them straight away with `$(output:stepName:key)`.

For example, if the step named `tag` runs `git.latest-tag` and the middleware returns `output: [("name", "v1.4.0"), ("sha", "abc123")]`, a later step can read `$(output:tag:name)` and `$(output:tag:sha)`.

## Middlewares and the Sandbox

A middleware never talks to the network, the filesystem, or a subprocess directly. Everything goes through host-mediated interfaces, `wasi:http`, `wasi:filesystem`, and `moonlit:plugin/process`, which the engine gates per plugin. What a middleware can reach at run time comes from its plugin's `permissions` grant, not from anything the middleware itself asks for. See [Sandboxing](./sandboxing.md) for the full capability model.

## Next Steps

- Learn about [Sandboxing](./sandboxing.md) and how capability grants scope what a middleware can do
- Review the [Plugins System](./plugins.md) for how plugins expose middlewares
- See [Stages and Steps](./stages-steps.md) for how `run:` fits into a step's lifecycle
