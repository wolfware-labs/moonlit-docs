---
title: Stages and Steps
description: Learn how Moonlit organizes pipeline execution with stages and steps
---

# Stages and Steps

A Moonlit pipeline is organized into stages, and each stage holds an ordered list of steps. This page covers how both work.

## Stages

A stage is a named group of steps. Stages let you split a pipeline into phases like build, test, and publish, and they give you a way to run part of the pipeline by name.

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

At run time the engine flattens all stages, in declaration order, into a single linear list of steps and executes them one after another. Stage names create no parallel branches. They are there for organization and for the `-s`/`--stage` filter:

```bash
moonlit run -s build,test
```

This runs only the steps under the `build` and `test` stages, skipping any others. `-s` accepts both repeated flags and a comma-separated list, and stage names are matched case-insensitively.

Flattening into one list means declaration order is the dependency order: a stage's steps run only after every step declared before them has finished. If a step fails, the pipeline stops by default, unless that step sets `continueOnError`.

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

- `name` is a unique identifier for the step, and also the key its outputs are exposed under
  (`output:<name>:<key>`).
- `run` is the middleware to execute, written as `pluginName.middlewareName` and split on the first
  `.`. A malformed value fails with
  `'<value>' is not a valid run reference; use the format 'plugin.middleware'.`
- `condition` is optional. The step is skipped when the expression evaluates to false.
- `haltIf` is optional. The pipeline stops cleanly after this step when the expression evaluates to
  true.
- `continueOnError` is optional and defaults to `false`. It decides whether the pipeline carries on
  when this step fails.
- `config` is optional, and holds the configuration passed to the middleware. Scalars stay strings
  until the middleware binds them.

### Step Execution

For each step, in order, the engine:

1. Checks for cancellation
2. Reports progress
3. Evaluates `condition`, skipping the step if it's falsy
4. Merges the step's `config` over the accumulated configuration, applying `$(...)` substitution
5. Calls the plugin's middleware, bounded by `--step-timeout` when one is set
6. Records the result and logs any warnings
7. Stops the pipeline on failure, unless `continueOnError` is set (a timeout always stops it)
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
  run: docker.deploy
  condition: $(output:repo:branch) == 'main'
  config:
    host: $(DEPLOY_HOST)
    composeFile: "./docker-compose.yml"
```

`deployToProduction` runs only when the current branch is `main`. Conditions get a small expression language over the accumulated outputs. See [Configuration](./configuration.md) for the syntax.

### Stopping Pipeline Execution

Use `haltIf` to stop the pipeline cleanly after a step completes, without treating it as a failure:

```yaml
- name: version
  run: sr.calculate-version
  haltIf: "!output.version.hasNewVersion"
  config:
    baseVersion: $(output:tag:name)
```

The pipeline halts after `version` when the commits since the last tag do not call for a new release. A halted pipeline is reported as successful.

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
    url: "oci://registry.moonlit.rs/wolfware/git:1.0.0"
    permissions:
      exec: ["git"]
  - name: gh
    url: "oci://registry.moonlit.rs/wolfware/github:1.0.0"
    config:
      token: $(GITHUB_TOKEN)
    permissions:
      network: ["api.github.com"]
      exec: ["git"]
  - name: sr
    url: "oci://registry.moonlit.rs/wolfware/semantic-release:1.0.0"
  - name: dotnet
    url: "oci://registry.moonlit.rs/wolfware/dotnet:1.0.0"
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
        version: $(output:version:nextFullVersion)
        configuration: "Release"

  publish:
    - name: pack
      run: dotnet.pack
      config:
        project: "./src/MyProject.csproj"
        version: $(output:version:nextFullVersion)

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
