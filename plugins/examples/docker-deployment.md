---
title: Docker Deployment Example
description: A complete example of using Moonlit to automate Docker image building and deployment
---

# Docker Deployment Example

A worked pipeline that computes the next version, builds a multi-platform Docker image with buildx, and pushes it to a registry.

## Prerequisites

- A project with a `Dockerfile`
- Access to a Docker registry (Docker Hub, GHCR, etc.)
- `docker` (with the `buildx` plugin) available on the machine running Moonlit
- Registry credentials

## Configuration File

```yaml
name: "Docker Deployment"

plugins:
  - name: git
    url: "oci://registry.moonlit.rs/wolfware/git:1.0.0"
    permissions:
      exec: ["git"]

  - name: sr
    url: "oci://registry.moonlit.rs/wolfware/semantic-release:1.0.0"

  - name: docker
    url: "oci://registry.moonlit.rs/wolfware/docker:1.0.0"
    permissions:
      exec: ["docker"]
      env: ["MOONLIT_DOCKER_BUILDX_BUILDER"]

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

  publish:
    - name: login
      run: docker.login
      config:
        registry: "ghcr.io"
        username: $(DOCKER_USERNAME)
        password: $(DOCKER_PASSWORD)
    - name: buildx
      run: docker.setup-buildx
      config:
        platforms: ["linux/amd64", "linux/arm64"]
    - name: buildAndPush
      run: docker.build-and-push
      config:
        builder: $(output:buildx:name)
        tags:
          - "ghcr.io/mycompany/myapp:$(output:version:nextVersion)"
          - "ghcr.io/mycompany/myapp:latest"
        platforms: ["linux/amd64", "linux/arm64"]
```

## Walkthrough

### Plugins

Three plugins: **Git** (repository context and version boundary), **Semantic Release** (conventional-commit parsing and version calculation), and **Docker** (login, buildx setup, build and push). The Docker plugin's grant is `exec: ["docker"]`, because it shells out to the `docker` CLI, plus `env: ["MOONLIT_DOCKER_BUILDX_BUILDER"]`, because `build-and-push` falls back to that environment variable when there is no `builder` config and no prior `setup-buildx` state. Git needs only `exec: ["git"]`; Semantic Release needs no `permissions:` block at all, since it works entirely from the commit data it's given. See [Sandboxing](../../guide/concepts/sandboxing.md) for the full permission model.

### Analyze stage

`git.repo-context` reads the current branch; `git.latest-tag` finds the newest `v*` tag and records its commit as the boundary for `git.commits`; `sr.analyze` parses those commits as conventional commits, halting cleanly when none match; `sr.calculate-version` computes the next version from the parsed set (read from the plugin's shared state), halting the pipeline cleanly when there's nothing to release.

### Publish stage

1. `docker.login` authenticates to the registry with the password fed via stdin (never on the process argv).
2. `docker.setup-buildx` creates a buildx builder for multi-platform builds and emits its `name`.
3. `docker.build-and-push` builds the image for both platforms and pushes it, tagged with the calculated version and `latest`.

## Running the Pipeline

```bash
export DOCKER_USERNAME=your_docker_username
export DOCKER_PASSWORD=your_docker_password

moonlit run
```

## Next Steps

- Learn about the [NuGet Release Pipeline](./nuget-release.md) example
- Explore the [available plugins](../index.md)
- See how to [author your own plugin](../../guide/advanced/custom-plugins.md)
