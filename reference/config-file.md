---
title: Configuration File Reference
description: Detailed reference for Moonlit's YAML pipeline configuration file format
---

# Configuration File Reference

This page is the complete property-by-property reference for Moonlit's YAML pipeline file. For a conceptual walkthrough of how configuration is layered, substituted, and evaluated at run time, see [Configuration](../guide/concepts/configuration.md); for how stages and steps execute, see [Stages and Steps](../guide/concepts/stages-steps.md).

## File Name and Location

By default, `moonlit run` and `moonlit validate` look for `release.yml` in the working directory, falling back to `moonlit.yml` if `release.yml` isn't present. `release.yml` is the recommended name; point either command at a different file with `-f`/`--file` — both `.yml` and `.yaml` extensions are accepted.

## Top-Level Schema

```yaml
name: string                # trimmed; default ""
arguments:                  # map<string, string>
  key: value
variables:                  # map<string, string>
  key: value
plugins:                    # array of Plugin; required, non-empty
  - name: string
    url: string
    config: { ... }
    permissions: { ... }
stages:                     # ordered map<stageName, array<Step>>
  stageName:
    - name: string
      run: plugin.middleware
      condition: string
      haltIf: string
      continueOnError: boolean
      config: { ... }
```

| Property | Type | Required | Description |
|---|---|---|---|
| `name` | string | No | The pipeline's name, shown in the run header. Trimmed; defaults to an empty string. |
| `arguments` | map\<string, string\> | No | Values overridable from the command line with `-a`/`--arg key=value`, referenced in `config:` blocks as `$(args:key)`. |
| `variables` | map\<string, string\> | No | Values referenced in `config:` blocks as `$(vars:key)`. |
| `plugins` | array of [Plugin](#plugin-properties) | **Yes** | The plugins available to this pipeline. Must be non-empty. |
| `stages` | ordered map of stage name → array of [Step](#step-properties) | **Yes** | Must contain at least one stage. |

A pipeline with no `stages` fails with `No stages found in the release configuration.`; a pipeline with stages but no `plugins` fails with `At least one plugin configuration must be provided.` Both are configuration errors (exit code 2) — see [Error Handling](./error-handling.md).

## Plugin Properties

Each entry in `plugins` has:

| Property | Type | Required | Description |
|---|---|---|---|
| `name` | string | **Yes** | The alias used to reference this plugin's middlewares in `run:` (e.g. `git` in `git.commits`). A plugin missing `name` or reusing a name already declared is a configuration error. |
| `url` | string | **Yes** | An absolute URL identifying where to load the plugin from. See [Plugin URL Schemes](#plugin-url-schemes). |
| `config` | map\<string, any\> | No | Plugin-level configuration, `$(...)`-substituted against the base/release layers when the plugin loads. Values are nested arbitrarily; scalars stay as strings until a middleware binds them. |
| `permissions` | map | No | The plugin's capability grants — network hosts, exec programs, env var patterns, and filesystem access. Omitted means **no** capabilities are granted. See [Sandboxing](../guide/concepts/sandboxing.md) for the full model. |

```yaml
plugins:
  - name: gh
    url: "oci://registry.moonlitbuild.dev/wolfware/github:1.0.0"
    config:
      token: $(GITHUB_TOKEN)
    permissions:
      network: ["api.github.com"]
      env: ["GITHUB_*"]
```

## Plugin URL Schemes

| Scheme | Meaning | Example |
|---|---|---|
| `oci://` | An OCI artifact — the default way to distribute and consume plugins. | `oci://registry.moonlitbuild.dev/wolfware/git:1.0.0` |
| `file://` | A local component file, for plugin development. Must point to an existing `.wasm` file. | `file:///home/me/plugin/target/wasm32-wasip2/release/my_plugin.wasm` |
| `http://` / `https://` | A remote component file, downloaded and cached by URL hash. | `https://example.com/plugins/my-plugin.wasm` |

Any other scheme (or a URL with no scheme at all) is a configuration error naming the supported schemes.

## Stage Properties

`stages` is an ordered map of stage name to an array of steps:

```yaml
stages:
  build:
    - name: compile
      run: dotnet.build
  publish:
    - name: push
      run: dotnet.push
```

Stages exist for organization and for the `-s`/`--stage` filter — at run time, all stages flatten into a single ordered list of steps executed one after another. See [Stages and Steps](../guide/concepts/stages-steps.md) for the full execution model.

## Step Properties

Each step within a stage has:

| Property | Type | Required | Description |
|---|---|---|---|
| `name` | string | **Yes** | A unique identifier for the step; also the key under which its outputs are exposed (`output:<name>:<key>`). Missing it fails with `Step '<name>' is missing a 'run' entry.`-style diagnostics pointing at the step. |
| `run` | string | **Yes** | The middleware to invoke, `pluginName.middlewareName` — split on the **first** `.` only. A malformed value fails with `Invalid run format: <value>. Expected format: 'plugin.middleware'`. |
| `condition` | string | No | An expression; the step is skipped when it evaluates to anything other than `true`. |
| `haltIf` | string | No | An expression; the pipeline stops cleanly after this step when it evaluates to `true`. Unlike `condition`, a `haltIf` that fails to evaluate **fails the step**. |
| `continueOnError` | boolean | No, default `false` | Continue the pipeline if this step fails, instead of stopping. |
| `config` | map\<string, any\> | No | Step-level configuration, merged over the accumulated configuration and `$(...)`-substituted at run time. |

```yaml
stages:
  analyze:
    - name: version
      run: sr.calculate-version
      haltIf: "!output.version.hasNewVersion"
      config:
        branch: $(output:repo:branch)
        baseVersion: $(output:tag:name)
```

## Parsing Rules

- Top-level and nested keys are matched **case-insensitively** (they're lowercased before matching).
- **Unknown keys are silently ignored** at every level.
- `config:` values are parsed to `Null | String | List | Map` — scalars are kept as raw strings at parse time; type coercion to `bool`/integer/float/datetime happens only when a value is bound or used in a condition.
- `arguments`/`variables` entries with `null` values are dropped; missing collections default to empty.
- All validation errors are rendered as [miette diagnostics](./error-handling.md) with a labeled span pointing at the offending YAML.

## `$(...)` Value Substitution

Anywhere in the file, `$(...)` resolves a path against the accumulated configuration (environment, `variables`/`arguments`, plugin config, and prior steps' outputs):

```yaml
config:
  token: $(GITHUB_TOKEN)                     # environment variable
  branch: $(output:repo:branch)              # an earlier step's output
  configuration: $(BUILD_CONFIGURATION:Release)   # with a literal default
```

See [Configuration](../guide/concepts/configuration.md) for the full substitution, layering, and condition-expression rules — they apply identically wherever `$(...)` appears in this file.

## Complete Example

```yaml
name: "Package Release"

variables:
  projectPath: "./src/MyProject.csproj"
  versionPrefix: "v"

arguments:
  configuration: "Release"

plugins:
  - name: git
    url: "oci://registry.moonlitbuild.dev/wolfware/git:1.0.0"
    permissions:
      exec: ["git"]
      filesystem: read-write

  - name: gh
    url: "oci://registry.moonlitbuild.dev/wolfware/github:1.0.0"
    config:
      token: $(GITHUB_TOKEN)
    permissions:
      network: ["api.github.com"]
      env: ["GITHUB_*"]

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
      config:
        prefix: $(vars:versionPrefix)
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
    - name: changelog
      run: sr.generate-changelog

  build:
    - name: build
      run: dotnet.build
      config:
        project: $(vars:projectPath)
        version: $(output:version:nextFullVersion)
        configuration: $(args:configuration)
    - name: pack
      run: dotnet.pack
      config:
        project: $(vars:projectPath)
        version: $(output:version:nextFullVersion)

  release:
    - name: publish
      run: dotnet.push
      config:
        package: $(output:pack:packagePath)
    - name: createRelease
      run: gh.create-release
      config:
        name: "Release $(output:version:nextVersion)"
        tag: "$(vars:versionPrefix)$(output:version:nextVersion)"
        changelog: $(output:changelog:categories)
        prerelease: $(output:version:isPrerelease)
```

## Next Steps

- [CLI Reference](./cli.md) for the `-f`/`-w`/`-s`/`-a` flags that interact with this file
- [Error Handling](./error-handling.md) for how validation failures are reported
- [Configuration](../guide/concepts/configuration.md) for the accumulator, substitution, and condition-expression model
