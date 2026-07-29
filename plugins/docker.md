---
title: Docker Plugin
description: Documentation for the Docker plugin in Moonlit
---

# Docker Plugin

Authenticate, set up buildx, build/push images, and deploy via the `docker` CLI.

## Reference

```yaml
plugins:
  - name: docker
    url: "oci://registry.moonlitbuild.dev/wolfware/docker:1.0.0"
    permissions:
      exec: ["docker"]
      env: ["MOONLIT_DOCKER_BUILDX_BUILDER"]
```

Moonlit is deny-by-default: a plugin with no `permissions:` block gets zero capabilities — see [Sandboxing](../guide/concepts/sandboxing.md) for the full model. The Docker plugin shells out to the `docker` CLI, so it needs `exec: ["docker"]`. `build-and-push` resolves its builder in order — an explicit `builder` config value, then the name recorded by a prior `setup-buildx` step in this run, then the `MOONLIT_DOCKER_BUILDX_BUILDER` environment variable — so the plugin also needs `env: ["MOONLIT_DOCKER_BUILDX_BUILDER"]`. No plugin-level config; credentials and options are passed per middleware.

## login

Authenticate to a Docker registry, with the password fed via stdin (never on the process argv).

| Config | Required / Default | Meaning |
|---|---|---|
| `registry` | Optional, default Docker Hub | Registry to log in to; omitted for Docker Hub. |
| `username` | **Required** | |
| `password` | **Required** | |

No outputs. Blank `username` or `password` fails with `"Docker login requires both username and password to be set."`

## setup-buildx

Create a buildx builder.

| Config | Required / Default | Meaning |
|---|---|---|
| `name` | Optional, default `moonlit-builder-<generated uuid>` | Builder name. |
| `driver` | Optional, default `docker-container` | |
| `endpoint` | Optional | |
| `bootstrap` | Optional, default `true` | Passes `--bootstrap`. |
| `setBuilderVariable` | Optional, default `true` | Record the builder name in the plugin's shared run state, for a later `build-and-push` step to pick up automatically. |
| `platforms` | Optional array | Each entry passed as its own `--platform`. |

| Output | Description |
|---|---|
| `name` | The builder name (explicit or generated). |

## build-and-push

Build an image and push it (default) or load it locally.

| Config | Required / Default | Meaning |
|---|---|---|
| `builder` | Optional, falls back to the `setup-buildx` shared state, then `MOONLIT_DOCKER_BUILDX_BUILDER` | Passed as `--builder`. |
| `tags` | Optional array | Each entry passed as its own `--tag`. |
| `file` | Optional | Passed as `--file`. |
| `context` | Optional, default `.` | Build context, passed positionally last. |
| `push` | Optional, default `true` | `true` → `--push`; `false` → `--load`. |
| `buildArgs` | Optional array of `KEY=value` | Each entry passed as its own `--build-arg`. |
| `labels` | Optional map | Each entry passed as its own `--label k=v`. |
| `platforms` | Optional array | Joined with commas into a single `--platform`. |
| `noCache` | Optional, default `false` | Passes `--no-cache`. |
| `pull` | Optional, default `false` | Passes `--pull`. |
| `cacheFrom` | Optional array | Each entry passed as its own `--cache-from`. |
| `cacheTo` | Optional array | Each entry passed as its own `--cache-to`. |

No outputs.

## deploy

Deploy an image via `docker compose`, against a remote Docker host.

| Config | Required / Default | Meaning |
|---|---|---|
| `host` | **Required** | Set as `DOCKER_HOST` for the `docker compose` invocation (e.g. `ssh://user@host`). Blank → failure. |
| `composeFile` | **Required** | Passed as `docker compose -f <composeFile>`. Blank → failure. |
| `service` | Optional | When set, the step fails with `"Swarm deploys are not supported yet."` — MVP supports the compose path only. |
| `environment` | Optional map | Each entry set as an environment variable on the `docker compose` invocation. |
| `pull` | Optional, default `true` | Passes `--pull always`. |

No outputs. `docker compose -f <composeFile> up -d [--pull always]`, with `DOCKER_HOST=<host>` and the `environment` entries set on the child process.

## Example

```yaml
plugins:
  - name: docker
    url: "oci://registry.moonlitbuild.dev/wolfware/docker:1.0.0"
    permissions:
      exec: ["docker"]
      env: ["MOONLIT_DOCKER_BUILDX_BUILDER"]

stages:
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
        tags:
          - "ghcr.io/mycompany/myapp:$(output:version:nextVersion)"
          - "ghcr.io/mycompany/myapp:latest"
        platforms: ["linux/amd64", "linux/arm64"]
```

For a complete worked pipeline, see the [Docker Deployment](./examples/docker-deployment.md) example.
