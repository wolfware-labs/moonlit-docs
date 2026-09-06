---
title: GitHub Actions
description: Install and run Moonlit in a GitHub Actions workflow
---

# GitHub Actions

The [`setup-moonlit`](https://github.com/wolfware-labs/setup-moonlit) action installs the Moonlit
CLI on Linux, macOS and Windows runners, puts it on `PATH`, and caches the plugin content store
between runs.

```yaml
- uses: actions/checkout@v5
  with:
    fetch-depth: 0
- uses: wolfware-labs/setup-moonlit@v1
- run: moonlit run
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Works on `ubuntu-*`, `macos-*` and `windows-*` runners.

## Inputs

| Input | Default | Description |
|---|---|---|
| `version` | `latest` | `latest`, or an exact version such as `1.2.0`. Semver ranges are not supported. |
| `cache` | `true` | Cache the Moonlit plugin content directory between runs. |
| `cache-dependency-path` | `release.y*ml` | Glob whose matched files key the plugin cache. |

## Outputs

| Output | Description |
|---|---|
| `version` | The version actually installed. |
| `bin-dir` | The directory added to `PATH`. |
| `cache-hit` | `true` when the plugin cache restored on an exact key match. |

## Run a release pipeline

```yaml
name: Release

on:
  push:
    branches: [main]

permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0
      - uses: wolfware-labs/setup-moonlit@v1
      - run: moonlit run
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

`fetch-depth: 0` matters: pipelines that read commit history to decide a version need the full history, and a shallow clone silently gives them the wrong answer.

## Validate the pipeline on pull requests

```yaml
name: Validate pipeline

on:
  pull_request:
    paths: ['release.yml']

permissions:
  contents: read

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: wolfware-labs/setup-moonlit@v1
      - run: moonlit validate
```

## Private plugins

The action does not log in to a registry. Add a step:

```yaml
- uses: wolfware-labs/setup-moonlit@v1
- run: moonlit login --token "$MOONLIT_TOKEN"
  env:
    MOONLIT_TOKEN: ${{ secrets.MOONLIT_TOKEN }}
```

## Caching

The plugin content store is cached automatically, keyed on the runner OS and a hash of the files
matched by `cache-dependency-path`. Put `setup-moonlit` **after** `actions/checkout`; before it,
no config file is visible and caching is skipped with a log line saying so.

The store is content-addressed by sha256, so a stale entry is a cache miss, never a wrong plugin.

Set `cache: 'false'` to turn it off.
