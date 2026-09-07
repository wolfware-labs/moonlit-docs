---
title: How Moonlit Works
description: Understand how Moonlit's Rust engine and wasmtime host execute a release pipeline
---

# How Moonlit Works

Three pieces turn a YAML pipeline definition into a running release: the `moonlit` CLI, the `moonlit-engine` library it calls into, and the `wasmtime`-based host that runs each plugin as a sandboxed WebAssembly component. This page walks through all three.

## Architecture Overview

<figure class="moonlit-arch">
<svg viewBox="0 0 720 456" role="img" aria-labelledby="archTitle archDesc" xmlns="http://www.w3.org/2000/svg">
  <title id="archTitle">Moonlit architecture</title>
  <desc id="archDesc">The moonlit CLI calls into moonlit-engine, which parses and validates the
  pipeline file and flattens its stages into one step list. The engine loads every plugin in
  parallel into a wasmtime host, where each plugin gets a single sandboxed component instance and
  no capability it was not granted. The pipeline executor then runs the flattened step list one
  step at a time.</desc>

  <style>
    .moonlit-arch svg { width: 100%; height: auto; max-width: 720px; display: block; margin: 0 auto; }
    .moonlit-arch .card { fill: var(--vp-c-bg-soft); stroke: var(--vp-c-divider); stroke-width: 1.5; }
    .moonlit-arch .host { fill: var(--vp-c-bg-alt); stroke: var(--vp-c-brand-1); stroke-width: 1.5; stroke-dasharray: 6 4; }
    .moonlit-arch .plugin { fill: var(--vp-c-bg); stroke: var(--vp-c-brand-1); stroke-width: 1.5; }
    .moonlit-arch .flow { stroke: var(--vp-c-text-2); stroke-width: 2; }
    .moonlit-arch text { font-family: var(--vp-font-family-base); }
    .moonlit-arch .t { fill: var(--vp-c-text-1); font-size: 15px; font-weight: 600; }
    .moonlit-arch .s { fill: var(--vp-c-text-2); font-size: 12px; }
    .moonlit-arch .lbl { fill: var(--vp-c-brand-1); font-size: 13px; font-weight: 600; }
    .moonlit-arch .mono { font-family: var(--vp-font-family-mono); font-size: 14px; font-weight: 600; fill: var(--vp-c-text-1); }
  </style>

  <defs>
    <marker id="archArrow" viewBox="0 0 10 10" refX="9" refY="5"
            markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--vp-c-text-2)"/>
    </marker>
  </defs>

  <rect class="card" x="170" y="16" width="380" height="62" rx="8"/>
  <text class="t" x="360" y="43" text-anchor="middle">moonlit CLI</text>
  <text class="s" x="360" y="63" text-anchor="middle">arguments, progress rendering, exit codes</text>

  <line class="flow" x1="360" y1="78" x2="360" y2="102" marker-end="url(#archArrow)"/>

  <rect class="card" x="170" y="104" width="380" height="62" rx="8"/>
  <text class="t" x="360" y="131" text-anchor="middle">moonlit-engine</text>
  <text class="s" x="360" y="151" text-anchor="middle">parse, validate, flatten stages into one step list</text>

  <line class="flow" x1="360" y1="166" x2="360" y2="190" marker-end="url(#archArrow)"/>

  <rect class="host" x="40" y="192" width="640" height="160" rx="10"/>
  <text class="lbl" x="64" y="216">wasmtime host</text>
  <text class="s" x="64" y="234">every plugin resolved and instantiated in parallel, one component instance each</text>

  <rect class="plugin" x="64" y="248" width="192" height="54" rx="6"/>
  <text class="mono" x="160" y="270" text-anchor="middle">git</text>
  <text class="s" x="160" y="289" text-anchor="middle">tags, commits, push</text>

  <rect class="plugin" x="264" y="248" width="192" height="54" rx="6"/>
  <text class="mono" x="360" y="270" text-anchor="middle">sr</text>
  <text class="s" x="360" y="289" text-anchor="middle">version, changelog</text>

  <rect class="plugin" x="464" y="248" width="192" height="54" rx="6"/>
  <text class="mono" x="560" y="270" text-anchor="middle">gh</text>
  <text class="s" x="560" y="289" text-anchor="middle">releases, related items</text>

  <text class="s" x="360" y="330" text-anchor="middle">denied by default; a permissions grant opens network, exec, env, and filesystem</text>

  <line class="flow" x1="360" y1="352" x2="360" y2="376" marker-end="url(#archArrow)"/>

  <rect class="card" x="170" y="378" width="380" height="62" rx="8"/>
  <text class="t" x="360" y="405" text-anchor="middle">pipeline executor</text>
  <text class="s" x="360" y="425" text-anchor="middle">runs the flattened step list, one step at a time</text>
</svg>
</figure>

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
