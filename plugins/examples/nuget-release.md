---
title: NuGet Release Pipeline Example
description: A complete example of using Moonlit to automate a NuGet package release
---

# NuGet Release Pipeline Example

A worked pipeline that computes the next version from conventional commits, builds and packs a .NET project, and publishes the resulting package to nuget.org.

## Prerequisites

- A .NET project you want to package as a NuGet package
- A Git repository
- A NuGet API key with push permission on the target feed

## Configuration File

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
    - name: version
      run: sr.calculate-version
      haltIf: "!output.version.hasNewVersion"
      config:
        branch: $(output:repo:branch)
        baseVersion: $(output:tag:name)
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
    - name: tag
      run: git.tag
      config:
        tagName: "v$(output:version:nextVersion)"
    - name: pushTag
      run: git.push
```

## Walkthrough

### Plugins

Three plugins: **Git** (repository context, tagging, pushing), **Semantic Release** (conventional-commit parsing and version calculation), and **Dotnet** (build, pack, push). The Dotnet plugin's grant is `exec: ["dotnet"]` plus `filesystem: read-write`, since `pack` writes the `.nupkg` into a `.moonlit/` directory under the working directory. Git needs only `exec: ["git"]`; Semantic Release needs no `permissions:` block at all. See [Sandboxing](../../guide/concepts/sandboxing.md) for the full permission model.

### Analyze stage

`git.repo-context`, `git.latest-tag`, and `git.commits` establish the branch, the last release tag, and the commits since it. `sr.analyze` parses those commits as conventional commits, halting if none match. `sr.calculate-version` computes the next version, halting cleanly when there's nothing to release.

### Build stage

`dotnet.build` compiles the project with the calculated version baked into its assembly metadata; `dotnet.pack` packs it into a `.nupkg`, emitting `packagePath`.

### Release stage

`dotnet.push` publishes the package to the configured NuGet source (nuget.org by default); `git.tag` and `git.push` record the release as a Git tag.

## Running the Pipeline

```bash
export NUGET_API_KEY=your_nuget_api_key

moonlit run
```

## Extending the Pipeline

- Run `dotnet.test` in a dedicated `test` stage before `build`
- Publish a changelog with `sr.generate-changelog`
- Add a GitHub or GitLab release step alongside the Git tag

## Next Steps

- Learn about the [Docker Deployment](./docker-deployment.md) example
- Explore the [available plugins](../index.md)
- See how to [author your own plugin](../../guide/advanced/custom-plugins.md)
