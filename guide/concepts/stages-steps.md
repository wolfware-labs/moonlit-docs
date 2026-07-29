---
title: Stages and Steps
description: Learn how Moonlit organizes pipeline execution with stages and steps
---

# Stages and Steps

Moonlit organizes your release pipeline into stages and steps, providing a structured way to define and execute your automation tasks. This page explains how stages and steps work.

## Stages

Stages are named groupings of steps in your release pipeline. They let you organize a pipeline into phases — build, test, publish — and give you a way to run a subset of the pipeline by name.

### Defining Stages

Stages are defined under the `stages` section as an ordered map of stage name to a list of steps:

```yaml
stages:
  build:
    # Steps for the build stage

  test:
    # Steps for the test stage

  publish:
    # Steps for the publish stage
```

### Stage Execution

At run time, the engine **flattens all stages, in declaration order, into a single linear list of steps** and executes them one after another. Stage names don't create parallel branches; they exist for organization and for the `-s`/`--stages` filter:

```bash
moonlit run -s build,test
```

This runs only the steps under the `build` and `test` stages, skipping any others. `-s` accepts both repeated flags and a comma-separated list.

Because stages flatten into one list, there's an implicit dependency on declaration order: a stage's steps only run after every step declared before it has completed. If a step fails, the pipeline stops by default, unless that step sets `continueOnError`.

## Steps

Steps are the individual tasks within a stage. Each step invokes one middleware exported by a plugin.

### Defining Steps

```yaml
stages:
  build:
    - name: repo
      run: git.repo-context
    - name: build
      run: dotnet.build
      config:
        project: "./src/MyProject.csproj"
```

Each step has:

- **name** — a unique identifier for the step; also the key under which its outputs are exposed (`output:<name>:<key>`)
- **run** — the middleware to execute, in the format `pluginName.middlewareName` (split on the first `.`); a malformed value fails with `Invalid run format: <value>. Expected format: 'plugin.middleware'`
- **condition** (optional) — an expression; the step is skipped when it evaluates to false
- **haltIf** (optional) — an expression; the pipeline stops cleanly after this step when it evaluates to true
- **continueOnError** (optional, default `false`) — whether to continue the pipeline if this step fails
- **config** (optional) — configuration passed to the middleware; scalars stay as strings until the middleware binds them

### Step Execution

For each step, in order, the engine:

1. Checks for cancellation
2. Reports progress
3. Evaluates `condition`, skipping the step if it's falsy
4. Merges the step's `config` over the accumulated configuration, applying `$(...)` substitution
5. Calls the plugin's middleware
6. Records the result and logs any warnings
7. Stops the pipeline on failure, unless `continueOnError` is set
8. Appends the step's outputs under `output:<name>:<key>`
9. Evaluates `haltIf`, stopping the pipeline cleanly if it's truthy

### Step Output

A step's outputs are added to the pipeline's accumulated configuration and can be read by later steps with the `$(output:stepName:propertyName)` syntax:

```yaml
stages:
  analyze:
    - name: repo
      run: git.repo-context

    - name: version
      run: sr.calculate-version
      config:
        branch: $(output:repo:branch)
```

Here, the `version` step reads the `branch` output produced by the `repo` step. See [Configuration](./configuration.md) for the full substitution and layering model.

### Conditional Steps

Use `condition` to make a step's execution depend on an expression:

```yaml
- name: deployToProduction
  run: deploy.azure
  condition: $(output:repo:branch) == 'main'
  config:
    environment: "production"
```

`deployToProduction` only runs when the current branch is `main`. Conditions have access to a small expression language over accumulated outputs — see [Configuration](./configuration.md) for the syntax.

### Stopping Pipeline Execution

Use `haltIf` to stop the pipeline cleanly after a step completes, without treating it as a failure:

```yaml
- name: checkVersion
  run: version.check
  haltIf: $(output:checkVersion:isPrerelease) == true
  config:
    version: $(output:version:nextVersion)
```

Here, the pipeline halts after `checkVersion` if the version is a prerelease. A halted pipeline is reported as successful.

### Error Handling

By default, a failing step stops the pipeline. Set `continueOnError: true` to log the failure and move on instead:

```yaml
- name: notify
  run: slack.send-notification
  continueOnError: true
  config:
    channel: "#releases"
    message: "Build completed"
```

If `notify` fails here, Moonlit logs the error and continues with the next step.

## Example: Complete Pipeline

```yaml
name: "Package Release"

plugins:
  - name: git
    url: "oci://registry.moonlitbuild.dev/wolfware/git:1.0.0"
    permissions:
      exec: ["git"]
  - name: gh
    url: "oci://registry.moonlitbuild.dev/wolfware/github:1.0.0"
    permissions:
      network: ["api.github.com"]
      exec: ["git"]
  - name: sr
    url: "oci://registry.moonlitbuild.dev/wolfware/semantic-release:1.0.0"
  - name: dotnet
    url: "oci://registry.moonlitbuild.dev/wolfware/dotnet:1.0.0"
    permissions:
      exec: ["dotnet"]
      filesystem: read-write

stages:
  analyze:
    - name: repo
      run: git.repo-context
    - name: tag
      run: git.latest-tag
    - name: commits
      run: git.commits
    - name: conventionalCommits
      run: sr.analyze
      config:
        commits: $(output:commits:details)
    - name: version
      run: sr.calculate-version
      config:
        branch: $(output:repo:branch)
        baseVersion: $(output:tag:name)
    - name: changelog
      run: sr.generate-changelog

  build:
    - name: build
      run: dotnet.build
      config:
        project: "./src/MyProject.csproj"
        configuration: "Release"

  publish:
    - name: pack
      run: dotnet.pack
      config:
        project: "./src/MyProject.csproj"
        version: $(output:version:nextVersion)

    - name: createRelease
      run: gh.create-release
      config:
        name: "Release $(output:version:nextVersion)"
        tag: "v$(output:version:nextVersion)"
        changelog: $(output:changelog:categories)
        prerelease: $(output:version:isPrerelease)
```

## Next Steps

- Learn about [Configuration](./configuration.md) options in more detail
- Explore the [CLI Reference](../../reference/cli.md) for command-line options
- See how to [create your own plugins](../advanced/custom-plugins.md) with custom middlewares
