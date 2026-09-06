---
title: GitHub Actions
description: Install and run Moonlit in a GitHub Actions workflow
---

# GitHub Actions

The [`setup-moonlit`](https://github.com/wolfware-labs/setup-moonlit) action installs the Moonlit
CLI on Linux, macOS and Windows runners, puts it on `PATH`, and caches the plugin content store
between runs.

```yaml
- uses: actions/checkout@v7
  with:
    fetch-depth: 0
- uses: wolfware-labs/setup-moonlit@v1
- run: moonlit run
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Works on `ubuntu-*` and `macos-*` runners, and on x86-64 `windows-*` runners. Moonlit does not
publish an ARM Windows build, so `windows-11-arm` is not supported.

## Inputs

| Input | Default | Description |
|---|---|---|
| `version` | `latest` | `latest`, or an exact version such as `1.2.0`. Semver ranges are not supported. If the version actually installed does not match an exact request, the action fails. |
| `cache` | `true` | Cache the Moonlit plugin content directory between runs. |
| `cache-dependency-path` | `release.y*ml` | Glob whose matched files key the plugin cache. |

## Outputs

| Output | Description |
|---|---|
| `version` | The version actually installed. |
| `bin-dir` | The directory added to `PATH`. |
| `cache-dir` | The resolved plugin cache directory for this runner OS. |
| `cache-hit` | `true` on an exact cache key match, `false` on a partial hit against a prefix, or empty when caching was off or skipped. |

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
      - uses: actions/checkout@v7
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
    paths: ['release.yml', 'release.yaml']

permissions:
  contents: read

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: wolfware-labs/setup-moonlit@v1
      - run: moonlit validate
```

## Private plugins

The action does not log in to a registry. Add a step; with no host argument, `moonlit login` targets `registry.moonlitbuild.dev`:

```yaml
- uses: wolfware-labs/setup-moonlit@v1
- run: moonlit login --token "$MOONLIT_TOKEN"
  env:
    MOONLIT_TOKEN: ${{ secrets.MOONLIT_TOKEN }}
```

Pass a host to log in elsewhere, for example `moonlit login ghcr.io --username "$USER" --token "$TOKEN"`.

## How it installs

With the default `version: latest`, the action downloads and runs Moonlit's official installer
script from the latest GitHub release. The installer carries per-target checksums embedded at
release build time and verifies the downloaded archive against them before installing, so the
binary that lands on `PATH` is exactly the one the release produced. Passing an exact `version:`
fetches the installer from that tagged release, which pins the script itself as well, instead of
tracking whatever `latest` resolves to at run time.

## Caching

The plugin content store is cached automatically, keyed on the runner OS and a hash of the files
matched by `cache-dependency-path`. Put `setup-moonlit` **after** `actions/checkout`; before it,
no config file is visible and caching is skipped with a log line saying so.

The store addresses plugin content by sha256, so a stale content entry is a cache miss, never a
wrong plugin. The store also keeps each mutable tag's resolution to a digest for 15 minutes, and
that record is cached along with everything else: a job that starts within 15 minutes of the run
that primed the cache resolves a tag to the digest seen back then, without asking the registry
again. Pin plugins by digest (`@sha256:…`) if that window matters to you.

Set `cache: 'false'` to turn it off.
