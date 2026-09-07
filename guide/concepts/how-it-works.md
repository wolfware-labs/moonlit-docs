---
title: How Moonlit Works
description: Understand how Moonlit's Rust engine and wasmtime host execute a release pipeline
---

# How Moonlit Works

Three pieces turn a YAML pipeline definition into a running release: the `moonlit` CLI, the `moonlit-engine` library it calls into, and the `wasmtime`-based host that runs each plugin as a sandboxed WebAssembly component. This page walks through all three.

## Architecture Overview

<FlowDiagram
  caption="How a run gets from the command line to the step loop"
  :flow="[
    { title: 'moonlit CLI', detail: 'arguments, progress rendering, exit codes' },
    { title: 'moonlit-engine', detail: 'parse, validate, flatten stages into one step list' },
    {
      group: 'wasmtime host',
      note: 'Every plugin is resolved and instantiated in parallel, one component instance each, denied every capability it was not granted.',
      items: [
        { title: 'git', mono: true, detail: 'tags, commits, push' },
        { title: 'sr', mono: true, detail: 'version, changelog' },
        { title: 'gh', mono: true, detail: 'releases, related items' },
      ],
    },
    { title: 'pipeline executor', detail: 'runs the flattened step list, one step at a time' },
  ]" />

## Core Components

### CLI (`moonlit-cli`)

The `moonlit` binary is a thin UX layer over the engine. It parses command-line arguments, renders progress (spinners, download bars, a live log region per step) and the final execution summary, and maps engine errors to exit codes. All of it calls into `moonlit-engine` as a library. There is no pipeline logic in the CLI itself.

### Engine (`moonlit-engine`)

The engine does the real work, in a few cooperating modules:

- The config parser reads the YAML pipeline file into a structured model, validating its shape and cleaning it up along the way by trimming names and dropping null entries.
- The expression and condition engine resolves `$(...)` value substitution and evaluates `condition` and `haltIf` expressions (see [Configuration](./configuration.md)).
- The plugin resolvers, one per URL scheme (`oci`, `file`, `http`/`https`), turn a plugin reference into local component bytes.
- The pipeline executor walks the flattened list of steps, calling into plugins through the WASM host and tracking results.

### WASM host

Plugins are WebAssembly components targeting WASI Preview 2 and the `moonlit:plugin` component-model world. The engine hosts them with `wasmtime`, giving each plugin its own `Store` and component instance. The host implements the capabilities plugins import, namely structured logging, reads of the accumulated configuration, progress reporting, and a permission-gated subprocess API, alongside the standard `wasi:http`, `wasi:filesystem`, and `wasi:cli` interfaces. Since plugins run inside this sandbox instead of as native code, the engine sits in front of every capability a plugin uses. See [Plugins System](./plugins.md) for how that access is granted.

## Execution Model

Running a pipeline follows the same sequence regardless of what plugins it uses:

1. Parse. The CLI reads the YAML file and the engine turns it into a pipeline configuration.
2. Resolve plugins. The engine resolves and instantiates every plugin in the `plugins` list in parallel, pulling from the local content-addressed cache or an OCI registry, or reading a `file://` or `http(s)://` reference, and then instantiating the component in `wasmtime`.
3. Flatten stages. Stages collapse, in declaration order, into a single linear list of steps. Stage names matter only for the `-s`/`--stage` filter (see [Stages and Steps](./stages-steps.md)). They create no parallel branches and express no dependencies beyond ordering.
4. Execute steps, one after another. For each step the engine checks for cancellation, reports progress, evaluates `condition` and skips the step if it comes back falsy, merges the step's `config` over the accumulated configuration with `$(...)` substitution, calls the plugin's `execute` export (bounded by `--step-timeout` when one is set), records a `StepResult` of name, success, skipped, duration, and error, logs any warnings, stops the pipeline on failure unless `continueOnError` is set, appends the step's outputs under `output:<stepName>:<key>`, and finally evaluates `haltIf`, cleanly stopping the pipeline if it comes back truthy.
5. Summarize. A summary table is rendered and the process exits with a code reflecting the outcome.

Before step 2 begins, the engine also checks every step's `run:` reference against the middlewares each plugin reports, so an unknown plugin alias or middleware name is a load-time configuration error rather than a failure partway through the run.

## Plugin Lifetime and Shared State

Each plugin gets one component instance for the whole pipeline run, created during plugin resolution and kept alive until the pipeline ends. That lets a plugin hold state in memory across steps. The `git` plugin's `latest-tag` middleware, for instance, can store the resolved tag SHA in instance memory for a later `commits` step on the same plugin to read back. Instances and their `Store` are dropped once the pipeline finishes.

## Error Handling and Exit Codes

The engine's errors map to a small, doc-promised set of process exit codes: `0` success, `1` general/unexpected error, `2` configuration error, `3` plugin load error, `4` pipeline execution error (a step failed).

A failing step stops the pipeline by default, and `continueOnError: true` on a step lets the run carry on past it. Traps are a separate matter. `wasmtime` permanently poisons a component's `Store` after a trap, so a plugin that traps cannot safely keep running for the rest of the pipeline. The engine marks the *plugin* itself unavailable, and any later step targeting it fails fast instead of quietly losing that plugin's in-memory state. A step that exceeds `--step-timeout` is handled the same way, and it aborts the run outright even with `continueOnError` set, because its interrupted instance cannot be reused.

## Next Steps

- Learn about the [Plugins System](./plugins.md)
- Understand [Stages and Steps](./stages-steps.md) in more detail
- Explore the [Configuration](./configuration.md) options
