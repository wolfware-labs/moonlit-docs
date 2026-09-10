---
title: Docker Deployment
description: A complete Moonlit pipeline that versions, builds, pushes, and deploys a Docker image to a remote host
---

# Docker Deployment

A full pipeline that computes the next version, builds a multi-platform Docker image, pushes it to a registry, and deploys it to a remote host with `docker compose`.

This recipe goes one step further than the [Docker Plugin's worked example](../plugins/examples/docker-deployment.md): it adds a `docker.deploy` stage that brings the freshly pushed image up on a remote host over SSH.

## Prerequisites

- A project with a `Dockerfile`
- Access to a Docker registry (Docker Hub, GHCR, etc.) and its credentials
- `docker` (with the `buildx` plugin) available on the machine running Moonlit
- SSH access to the deployment host, with a `docker-compose.yml` already present there
- The `git`, `sr` (Semantic Release), and `docker` plugin references below

## `release.yml`

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

  deploy:
    - name: deployToHost
      run: docker.deploy
      condition: $(output:repo:branch) == 'main'
      config:
        host: $(DEPLOY_HOST)
        composeFile: "./docker-compose.yml"
        environment:
          APP_VERSION: $(output:version:nextVersion)
```

## Walkthrough

### Plugins

Three plugins: **Git** (repository context and version boundary), **Semantic Release** (conventional-commit parsing and version calculation), and **Docker** (login, buildx setup, build/push, deploy). Git needs only `exec: ["git"]`. Semantic Release needs no `permissions:` block at all, since it works entirely from the commit data it is given. Docker needs `exec: ["docker"]`, since every one of its middlewares shells out to the `docker` CLI, plus `env: ["MOONLIT_DOCKER_BUILDX_BUILDER"]`, since `build-and-push` falls back to that environment variable when no `builder` config or prior `setup-buildx` state is available. See [Sandboxing](../guide/concepts/sandboxing.md) for the full permission model.

### Analyze stage

`git.repo-context` reads the current branch. `git.latest-tag` finds the newest `v*` tag and records its commit as the boundary for `git.commits`, which lists the commits since that tag. `sr.analyze` parses them as conventional commits, halting cleanly (via `haltIf`) when none match, and `sr.calculate-version` computes the next version from the parsed set, halting again when nothing in it calls for a release. `calculate-version` needs the parsed commits rather than the raw `git.commits` output, which is why `analyze` sits between them; it reads them from the plugin's shared state, so no `commits` entry is needed.

### Publish stage

1. `docker.login` authenticates to the registry, feeding the password in over stdin so it never lands on the process argv.
2. `docker.setup-buildx` creates a buildx builder for multi-platform builds and emits its `name`, which the next step picks up.
3. `docker.build-and-push` builds the image for both platforms and pushes it, tagged with the calculated version and `latest`.

### Deploy stage

`docker.deploy` runs `docker compose -f <composeFile> up -d --pull always` against the remote host, with `DOCKER_HOST` set to `host` (e.g. `ssh://user@host`) for the duration of the call. The step only runs on `main`, guarded by `condition`. Both `host` and `composeFile` are required, and a blank value fails the step. `environment` entries, `APP_VERSION` here, are set on the `docker compose` child process so the compose file can reference them, and `pull` defaults to `true`. There is deliberately no `service` config: setting one fails with `"Swarm deploys are not supported yet."`, because the MVP supports only the compose path. `deploy` produces no outputs.

## Run it

```bash
export DOCKER_USERNAME=your_docker_username
export DOCKER_PASSWORD=your_docker_password
export DEPLOY_HOST=ssh://deploy@your-host

moonlit run
```

- [Docker Plugin](../plugins/docker.md)
- [Git Plugin](../plugins/git.md)
- [Semantic Release Plugin](../plugins/semantic-release.md)
- [Sandboxing](../guide/concepts/sandboxing.md)
- [NuGet Release](./nuget-release.md)
