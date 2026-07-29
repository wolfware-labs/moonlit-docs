---
title: NuGet Release Pipeline
description: A complete Moonlit pipeline that tests, versions, builds, packs, and publishes a NuGet package
---

# NuGet Release Pipeline

A full pipeline that runs the test suite, computes the next version from conventional commits, builds and packs the project, publishes the package to nuget.org, and tags the release in Git.

This recipe goes further than the [Dotnet Plugin's worked example](../plugins/examples/nuget-release.md): it adds a `dotnet.test` stage that gates the release on a green test run, and generates a changelog with `sr.generate-changelog` alongside the version calculation.

## Prerequisites

- A .NET project you want to package as a NuGet package, plus its test project
- A Git repository
- A NuGet API key with push permission on the target feed
- The `git`, `sr` (Semantic Release), and `dotnet` plugin references below

## `release.yml`

```yaml
name: "NuGet Package Release"

plugins:
  - name: git
    url: "oci://registry.moonlitbuild.dev/wolfware/git:1.0.0"
    permissions:
      exec: ["git"]

  - name: sr
    url: "oci://registry.moonlitbuild.dev/wolfware/semantic-release:1.0.0"

  - name: dotnet
    url: "oci://registry.moonlitbuild.dev/wolfware/dotnet:1.0.0"
    config:
      nugetApiKey: $(NUGET_API_KEY)
    permissions:
      exec: ["dotnet"]
      filesystem: read-write

stages:
  analyze:
    - name: repo
      run: git.repo-context
    - name: tag
      run: git.latest-tag
      config:
        prefix: "v"
    - name: commits
      run: git.commits
    - name: conventionalCommits
      run: sr.analyze
      haltIf: output.conventionalCommits.commitCount == 0
      config:
        commits: $(output:commits:details)

  test:
    - name: test
      run: dotnet.test
      config:
        project: "./tests/MyProject.Tests.csproj"
        configuration: "Release"

  version:
    - name: version
      run: sr.calculate-version
      haltIf: "!output.version.hasNewVersion"
      config:
        branch: $(output:repo:branch)
        baseVersion: $(output:tag:name)
        commits: $(output:conventionalCommits:commits)
    - name: changelog
      run: sr.generate-changelog
      config:
        commits: $(output:conventionalCommits:commits)

  build:
    - name: build
      run: dotnet.build
      config:
        project: "./src/MyProject.csproj"
        version: $(output:version:nextFullVersion)
        configuration: "Release"
    - name: pack
      run: dotnet.pack
      config:
        project: "./src/MyProject.csproj"
        version: $(output:version:nextFullVersion)

  release:
    - name: push
      run: dotnet.push
      config:
        package: $(output:pack:packagePath)
    - name: createTag
      run: git.tag
      config:
        tagName: "v$(output:version:nextVersion)"
    - name: pushTag
      run: git.push
```

## Walkthrough

### Plugins

Three plugins: **Git** (repository context, tagging, pushing), **Semantic Release** (conventional-commit parsing, version calculation, changelog), and **Dotnet** (test, build, pack, push). Git needs only `exec: ["git"]`. Semantic Release needs no `permissions:` block at all — it works entirely from the commit data it's given. Dotnet needs `exec: ["dotnet"]` plus `filesystem: read-write`, since `pack` and `test` write their output into a `.moonlit/` directory under the working directory. Plugin-level config sets `nugetApiKey`, used as the fallback source and key for `dotnet.push`. See [Sandboxing](../guide/concepts/sandboxing.md) for the full permission model.

### Analyze stage

`git.repo-context`, `git.latest-tag`, and `git.commits` establish the current branch, the last release tag, and the commits since it. `sr.analyze` parses those commits as conventional commits, halting the pipeline (via `haltIf`) when none match.

### Test stage

`dotnet.test` runs the test project and parses the resulting TRX file for pass/fail/skip counts. A non-zero exit with reported failures fails the step with `"{failed} test(s) failed."`, which stops the pipeline before anything gets released — a failing suite never reaches `build` or `release`.

### Version stage

`sr.calculate-version` computes the next version from the parsed commits and halts cleanly when there's nothing to release. `sr.generate-changelog` groups the same commits into categories (Features, Bug Fixes, and so on) for downstream use — for example, posting in a release notification or attaching to a release page.

### Build stage

`dotnet.build` compiles the project with the calculated version baked into its assembly metadata; `dotnet.pack` packs it into a `.nupkg`, emitting `packagePath`.

### Release stage

`dotnet.push` publishes the package to nuget.org (the default `nugetSource`) using the plugin-level `nugetApiKey`. `git.tag` then records the release as a Git tag, and `git.push` pushes the branch and the new tag to `origin`.

## Run it

```bash
export NUGET_API_KEY=your_nuget_api_key

moonlit run
```

- [Dotnet Plugin](../plugins/dotnet.md)
- [Git Plugin](../plugins/git.md)
- [Semantic Release Plugin](../plugins/semantic-release.md)
- [Sandboxing](../guide/concepts/sandboxing.md)
- [Docker Deployment](./docker-deployment.md)
