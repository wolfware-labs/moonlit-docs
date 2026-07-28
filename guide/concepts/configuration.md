---
title: Configuration
description: Learn how Moonlit's configuration accumulator, value substitution, and conditions work
---

# Configuration

Moonlit pipelines are YAML files. This page explains the pieces that make pipeline configuration dynamic: the **accumulator** that layers configuration from multiple sources, `$(...)` value substitution, `condition`/`haltIf` expressions, and scalar coercion. For the full property-by-property schema, see the [Configuration File Reference](../../reference/config-file.md).

## Configuration File Structure

```yaml
name: "My Pipeline"

plugins:
  - name: plugin1
    url: "oci://registry.example.com/namespace/plugin1:1.0.0"
    config:
      # Plugin-specific configuration

stages:
  stage1:
    - name: step1
      run: "plugin1.middleware1"
      config:
        # Step-specific configuration
```

- **name** — the pipeline's name
- **plugins** — the plugins used by the pipeline (see [Plugins System](./plugins.md))
- **stages** — an ordered map of stage name to a list of steps (see [Stages and Steps](./stages-steps.md))
- **variables** — a map of values you can reference throughout the pipeline
- **arguments** — a map of values that can be overridden from the command line

## The Accumulator: Configuration Layering

Moonlit builds configuration as an ordered stack of layers, resolved in this order, where **later layers win**:

1. **Base layer** — environment variables prefixed `MOONLIT_` (prefix stripped), plus a `.env` file in the working directory.
2. **Release layer** — `vars:<name>` and `args:<name>` from the YAML's `variables`/`arguments` sections. CLI `--arg key=value` entries override the YAML `arguments`.
3. **Plugin layer** (per plugin, at load time) — the plugin's `config:` block, `$(...)`-substituted against layers 1–2.
4. **Step layers** (during the run) — each step's `config:`, substituted against everything accumulated so far.
5. **Output layers** — after each step, its outputs are flattened into the accumulator under `output:<stepName>:<key>`. Nested structures flatten with `:` and numeric indices for arrays, e.g. `output:commits:details:0:sha`.

This layering is why a later step can read an earlier step's output, and why plugin-level config can be overridden per step.

## `$(...)` Value Substitution

Anywhere in your configuration, `$(...)` resolves a path against the accumulator described above. The inner text can't contain a `)`.

There are two substitution modes:

- **Whole-string** — when the entire value is a single `$(...)` expression (e.g. `commits: $(output:commits:details)`), it's replaced by the *resolved value itself*, which may be a string, a map, or a list. This is how structured data — not just strings — flows between steps. A missing key resolves to `null`.
- **Embedded** — when `$(...)` appears inside a larger string (e.g. `"v$(output:version:nextVersion)"`), each occurrence is replaced by the value's string form. A missing key is replaced with an empty string.

An empty or whitespace-only input resolves to `null`; a string with no `$(...)` at all is returned unchanged.

### Default Values

`$(NAME:default)` provides a fallback: Moonlit first tries to resolve the whole inner text as a path (so `$(output:tag:name)` still resolves `output:tag:name` rather than treating `name` as a default). Only if that fails does it split on the *last* `:`, treat the left side as the path, and use the right side as a literal default:

```yaml
config:
  configuration: $(BUILD_CONFIGURATION:Release)
```

If `BUILD_CONFIGURATION` isn't set, this resolves to `Release`.

### Common Examples

```yaml
config:
  token: $(GITHUB_TOKEN)                    # environment variable
  branch: $(output:repo:branch)             # output from an earlier step
  version: $(vars:versionPrefix)$(output:version:nextVersion)  # embedded, mixed sources
```

## Variables and Arguments

### Variables

`variables` defines values you can reference throughout the pipeline via `$(vars:name)`:

```yaml
variables:
  projectName: "MyProject"
  buildConfiguration: "Release"
```

```yaml
config:
  project: "./src/$(vars:projectName).csproj"
  configuration: $(vars:buildConfiguration)
```

### Arguments

`arguments` defines values that can be overridden from the command line, referenced via `$(args:name)`:

```yaml
arguments:
  environment: "production"
  skipTests: false
```

```yaml
config:
  environment: $(args:environment)
```

Command-line `--arg key=value` entries take precedence over the values declared in `arguments`.

## Conditions (`condition` and `haltIf`)

Steps can carry a `condition` (skip the step when false) and a `haltIf` (cleanly stop the pipeline after the step when true). Both are expressions evaluated with an embedded expression engine, exposing a single variable, `output`, built from the accumulated `output:` section:

```yaml
condition: $(output:repo:branch) == 'main'
haltIf: "!output.version.hasNewVersion"
```

A few things to know about how these are evaluated:

- Supported operators: `==`, `!=`, `>`, `<`, `>=`, `<=`, `&&`, `||`, `!`, parentheses, string literals (single or double quotes), and numeric literals.
- Both dot-notation (`output.version.hasNewVersion`) and `$(...)` substitution (`$(output:version:hasNewVersion)`) work — `$(...)` substitution runs over the condition string *before* it's evaluated, and identifier resolution is case-insensitive.
- Anything other than a boolean `true` result is treated as `false`.
- If a `condition` fails to evaluate, Moonlit logs a warning and treats it as `false` (the step is skipped) — evaluation errors don't abort the pipeline. A `haltIf` that fails to evaluate, by contrast, **fails the step** with a diagnostic: a broken halt guard silently continuing would be more dangerous than stopping.

## Scalar Coercion

Configuration values are parsed as raw strings and only coerced to a typed value when a middleware binds them, or when building a condition's `output` scope. The coercion order is fixed: `bool` (`true`/`false`, case-insensitive) → integer → floating point → RFC3339/ISO datetime → fallback to `string`.

## Example: Complete Configuration

```yaml
name: "Package Release"

variables:
  projectPath: "./src/MyProject.csproj"
  versionPrefix: "v"

arguments:
  configuration: "Release"
  skipPush: false

plugins:
  - name: git
    url: "oci://registry.moonlitbuild.dev/wolfware/git:1.0.0"
  - name: gh
    url: "oci://registry.moonlitbuild.dev/wolfware/github:1.0.0"
    config:
      token: $(GITHUB_TOKEN)
    permissions:
      network: ["api.github.com"]
  - name: sr
    url: "oci://registry.moonlitbuild.dev/wolfware/semantic-release:1.0.0"
  - name: dotnet
    url: "oci://registry.moonlitbuild.dev/wolfware/dotnet:1.0.0"
    permissions:
      exec: ["dotnet"]

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
    - name: createRelease
      run: gh.create-release
      condition: $(args:skipPush) == false
      config:
        name: "Release $(output:version:nextVersion)"
        tag: "$(vars:versionPrefix)$(output:version:nextVersion)"
        changelog: $(output:changelog:categories)
        prerelease: $(output:version:isPrerelease)
```

## Using the Configuration File

By default, `moonlit run` looks for `release.yml` in the current directory. Point it at a different file with `-f`:

```bash
moonlit run -f ./path/to/release.yml
```

See the [CLI Reference](../../reference/cli.md) for the full set of command-line options, including the working-directory flag.

## Next Steps

- Explore the [CLI Reference](../../reference/cli.md) for command-line options
- Learn about [creating custom plugins](../advanced/custom-plugins.md)
- See the [Configuration File Reference](../../reference/config-file.md) for all configuration options
