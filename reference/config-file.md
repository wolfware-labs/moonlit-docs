---
title: Configuration File Reference
description: Detailed reference for Moonlit's YAML pipeline configuration file format
---

# Configuration File Reference

This page is the complete property-by-property reference for Moonlit's YAML pipeline file. For a conceptual walkthrough of how configuration is layered, substituted, and evaluated at run time, see [Configuration](../guide/concepts/configuration.md); for how stages and steps execute, see [Stages and Steps](../guide/concepts/stages-steps.md).

## File Name and Location

By default, `moonlit run` and `moonlit validate` look for `release.yml` in the working directory, then for `release.yaml`. Point either command at a different file with `-f`/`--file`; the path must end in `.yml` or `.yaml`, and a relative path is resolved against the working directory (`-w`/`--working-dir`).

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
| `arguments` | map\<string, string\> | No | Values overridable from the command line with `-a`/`--arg key=value`, referenced in `config:` blocks as `$(args:key)`. Every value must be a scalar. |
| `variables` | map\<string, string\> | No | Values referenced in `config:` blocks as `$(vars:key)`. Every value must be a scalar. |
| `plugins` | array of [Plugin](#plugin-properties) | **Yes** | The plugins available to this pipeline. Must be non-empty. |
| `stages` | ordered map of stage name to array of [Step](#step-properties) | **Yes** | Must contain at least one stage. Each stage's value must be a sequence of steps. |

A pipeline with no `stages` fails with `No stages defined. A pipeline needs at least one stage.`; a pipeline with stages but no `plugins` fails with `No plugins declared. Every step runs a middleware from a plugin, so at least one is required.` Both are configuration errors (exit code 2); see [Error Handling](./error-handling.md).

## Plugin Properties

Each entry in `plugins` has:

| Property | Type | Required | Description |
|---|---|---|---|
| `name` | string | **Yes** | The alias used to reference this plugin's middlewares in `run:` (for example `git` in `git.commits`). Reusing a name already declared fails with `Duplicate plugin name '<name>'. Plugin names must be unique.` |
| `url` | string | **Yes** | An absolute URL identifying where to load the plugin from. See [Plugin URL Schemes](#plugin-url-schemes). A plugin without one fails with `Plugin '<name>' is missing a 'url' entry.` |
| `config` | map\<string, any\> | No | Plugin-level configuration, `$(...)`-substituted against the base and release layers when the plugin loads. Keys are free-form and nested arbitrarily; scalars stay as strings until a middleware binds them, and `null` values are preserved. |
| `permissions` | map | No | The plugin's capability grants: network hosts, exec programs, env var patterns, and filesystem access. Omitted means **no** capabilities are granted. See [Permissions](#permissions) below and [Sandboxing](../guide/concepts/sandboxing.md) for the full model. |

```yaml
plugins:
  - name: gh
    url: "oci://registry.moonlitbuild.dev/wolfware/github:1.0.0"
    config:
      token: $(GITHUB_TOKEN)
    permissions:
      network: ["api.github.com", "*.github.com"]
      exec: ["git", "sh"]
      env: ["GITHUB_*"]
```

### Permissions

| Key | Type | Default | Description |
|---|---|---|---|
| `network` | list of glob patterns | `[]` | Hosts the plugin may reach over HTTP, matched against the request's host (for example `api.github.com` or `*.github.com`). |
| `exec` | list of glob patterns | `[]` | Programs the plugin may spawn, matched against the program name as the plugin invokes it. |
| `env` | list of glob patterns | `[]` | Environment variable names visible to the plugin. |
| `filesystem` | `none`, `read-only`, or `read-write` | `none` | Access to the working directory. `readonly` and `readwrite` are accepted spellings, and the value is matched case-insensitively. Anything else fails with `Invalid filesystem access: <value>. Expected one of: none, read-only, read-write.` |

The three list keys also accept a single string in place of a list. A `permissions` block that is not a mapping, or that contains a key other than these four, is a configuration error.

## Plugin URL Schemes

| Scheme | Meaning | Example |
|---|---|---|
| `oci://` | An OCI artifact, the default way to distribute and consume plugins. | `oci://registry.moonlitbuild.dev/wolfware/git:1.0.0` |
| `file://` | A local component file, for plugin development. Must point to an existing `.wasm` file. | `file:///home/me/plugin/target/wasm32-wasip2/release/my_plugin.wasm` |
| `http://` / `https://` | A remote component file, downloaded and cached by URL hash. | `https://example.com/plugins/my-plugin.wasm` |

Any other scheme, or a URL with no scheme at all, fails with `Invalid plugin url: <value>. Expected an absolute URL with scheme 'oci', 'file', 'http', or 'https'.`

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

Stages exist for organization and for the `-s`/`--stage` filter. At run time, all stages flatten into a single ordered list of steps executed one after another. A stage whose value is empty or is not a sequence is a configuration error. See [Stages and Steps](../guide/concepts/stages-steps.md) for the full execution model.

## Step Properties

Each step within a stage has:

| Property | Type | Required | Description |
|---|---|---|---|
| `name` | string | **Yes** | A unique identifier for the step; also the key under which its outputs are exposed (`output:<name>:<key>`). |
| `run` | string | **Yes** | The middleware to invoke, `pluginName.middlewareName`, split on the **first** `.` only. Both halves must be non-empty. A malformed value fails with `'<value>' is not a valid run reference; use the format 'plugin.middleware'.`; a step without one fails with `Step '<name>' is missing a 'run' entry.` |
| `condition` | string | No | An expression; the step is skipped when it evaluates to anything other than `true`. |
| `haltIf` | string | No | An expression; the pipeline stops cleanly after this step when it evaluates to `true`. Unlike `condition`, a `haltIf` that fails to evaluate **fails the step**. |
| `continueOnError` | boolean | No, default `false` | Continue the pipeline if this step fails, instead of stopping. Must be `true` or `false` (case-insensitive); anything else fails with `Invalid continueOnError value: <value>. Expected 'true' or 'false'.` |
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

Every `run:` reference is checked against the loaded plugins before any step executes: an unknown alias fails with `No plugin is declared with the alias '<name>'.`, and a middleware the plugin doesn't export fails with `The plugin does not export a middleware named '<name>'.`

## Parsing Rules

The schema keys above (`name`, `plugins`, `stages`, `run`, `haltIf`, `continueOnError`, and so on) are Moonlit's own contract, and the parser holds them to it:

- Schema keys are matched **case-sensitively**. `Plugins:` or `haltif:` is not the same key as `plugins:` or `haltIf:`.
- **Unknown keys are rejected** at the top level and inside plugin entries, `permissions` blocks, and steps, with `Unknown <context> key '<key>'.` A typo such as `pluigns:` is reported instead of silently producing a pipeline with no plugins.
- A schema key given **twice** in the same mapping fails with `Duplicate key '<key>'.`, rather than the last occurrence silently winning.
- A schema key present **without a value** (`plugins:` followed by nothing, a stage with no steps, `url:` with no value, and so on) fails with `Key '<key>' expects <what>, but has no value.`

Inside the free-form `config:` blocks, none of this applies: keys are arbitrary, nesting is unlimited, and a `null` value is kept, since a plugin may act on it.

- `config:` values are parsed to `Null | String | List | Map`. Scalars are kept as raw strings at parse time; type coercion to `bool`/integer/float/datetime happens only when a value is bound or used in a condition.
- `arguments`/`variables` entries with `null` values are dropped; a non-scalar value fails with `Expected a string value in <section>.`; missing collections default to empty.
- Every validation error is rendered as a [diagnostic](./error-handling.md) with a labeled span pointing at the offending YAML, whenever the error can be located in the source.

## `$(...)` Value Substitution

Anywhere in the file, `$(...)` resolves a path against the accumulated configuration (environment, `variables`/`arguments`, plugin config, and prior steps' outputs):

```yaml
config:
  token: $(GITHUB_TOKEN)                     # environment variable
  branch: $(output:repo:branch)              # an earlier step's output
  configuration: $(BUILD_CONFIGURATION:Release)   # with a literal default
```

See [Configuration](../guide/concepts/configuration.md) for the full substitution, layering, and condition-expression rules; they apply identically wherever `$(...)` appears in this file.

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

  - name: gh
    url: "oci://registry.moonlitbuild.dev/wolfware/github:1.0.0"
    config:
      token: $(GITHUB_TOKEN)
    permissions:
      network: ["api.github.com"]
      exec: ["git"]
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
