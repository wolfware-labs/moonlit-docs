---
title: Plugins Overview
description: Overview of the official plugins available for Moonlit
---

# Plugins Overview

Moonlit's functionality is extended entirely through plugins. A plugin is a WebAssembly component, typically resolved from an `oci://` reference in your `plugins:` list, that exports one or more middlewares — invoked from a pipeline step as `run: name.middleware`, where `name` is the alias you gave the plugin. See [Plugins System](../guide/concepts/plugins.md) for how plugins are loaded and executed.

Moonlit is deny-by-default: a plugin gets **no** capabilities unless you grant them explicitly with a `permissions:` block — no network, no subprocesses, no environment variables, no filesystem access. Each plugin page below documents the exact grant it needs. See [Sandboxing](../guide/concepts/sandboxing.md) for the full permission model.

## Official Plugins

| Plugin | Summary |
|---|---|
| [Git](./git.md) | Repository context, tag discovery, commit history, tagging, and pushing. |
| [GitHub](./github.md) | Releases, related pull requests/issues, and CI variable export via the GitHub REST API. |
| [Semantic Release](./semantic-release.md) | Conventional-commit parsing, version calculation, and changelog generation. |
| [Slack](./slack.md) | Post release notifications to a Slack channel. |
| [Dotnet](./dotnet.md) | Build, pack, and push dotnet projects. |
| [Docker](./docker.md) | Build and push Docker images. |
| [NodeJs](./nodejs.md) | Build and pack Node.js/npm projects. |
| [Moonlit](./moonlit.md) | Run nested Moonlit release files as submodules. |

## Using Plugins

Add a plugin to the `plugins` section of your `release.yml`, with its `oci://` reference and the permissions it needs:

```yaml
plugins:
  - name: git
    url: "oci://registry.moonlitbuild.dev/wolfware/git:1.0.0"
    permissions:
      exec: ["git"]
  - name: gh
    url: "oci://registry.moonlitbuild.dev/wolfware/github:1.0.0"
    config:
      token: $(GITHUB_TOKEN)
    permissions:
      network: ["api.github.com", "*.github.com"]
```

Then reference its middlewares from pipeline steps as `run: <name>.<middleware>`:

```yaml
stages:
  analyze:
    - name: repo
      run: git.repo-context
    - name: tag
      run: git.latest-tag
```

See the [Configuration File Reference](../reference/config-file.md) for the complete `release.yml` schema, including `config:`, `permissions:`, and step properties.

## Next Steps

- Read each plugin's page above for its middlewares, config keys, and outputs
- See [Authoring a Plugin](../guide/advanced/custom-plugins.md) if the official plugins don't cover what you need
- Explore the [Configuration File Reference](../reference/config-file.md) for the full pipeline schema
