---
title: Configuration
description: Learn how Moonlit's configuration accumulator, value substitution, and conditions work
---

# Configuration

Moonlit pipelines are YAML files. Most of what makes them dynamic comes from four pieces: the
accumulator that layers configuration from several sources, `$(...)` value substitution,
`condition` and `haltIf` expressions, and scalar coercion. This page covers all four. For the full
property-by-property schema, see the
[Configuration File Reference](../../reference/config-file.md).

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

- `name` is the pipeline's name.
- `plugins` lists the plugins the pipeline uses (see [Plugins System](./plugins.md)).
- `stages` is an ordered map of stage name to a list of steps (see
  [Stages and Steps](./stages-steps.md)).
- `variables` holds values you can reference throughout the pipeline.
- `arguments` holds values that can be overridden from the command line.

## The Accumulator: Configuration Layering

Moonlit builds configuration as an ordered stack of layers. Later layers win:

1. The base layer: a `.env` file in the working directory, plus environment variables prefixed
   `MOONLIT_` with the prefix stripped. On a name collision the environment variable wins.
2. The release layer: `vars:<name>` and `args:<name>` from the YAML's `variables` and `arguments`
   sections. A CLI `--arg key=value` entry overrides the YAML `arguments`.
3. The plugin layer, one per plugin at load time: the plugin's `config:` block, `$(...)`-substituted
   against layers 1 and 2.
4. The step layers, during the run: each step's `config:`, substituted against everything
   accumulated so far.
5. The output layers: after each step, its outputs are flattened into the accumulator under
   `output:<stepName>:<key>`. Nested structures flatten with `:`, and arrays use numeric indices, so
   you get paths like `output:commits:details:0:sha`.

This layering is what lets a later step read an earlier step's output, and what lets a step override
plugin-level config for its own call.

## `$(...)` Value Substitution

Anywhere in your configuration, `$(...)` resolves a path against the accumulator described above. The inner text can't contain a `)`.

There are two substitution modes.

Whole-string substitution happens when the entire value is a single `$(...)` expression, as in
`commits: $(output:commits:details)`. The expression is replaced by the *resolved value itself*,
which may be a string, a map, or a list. That is how maps and lists, and not only strings, travel
between steps. A missing key resolves to `null`.

Embedded substitution happens when `$(...)` appears inside a larger string, as in
`"v$(output:version:nextVersion)"`. Each occurrence is replaced by the value's string form, and a
missing key is replaced with an empty string.

An empty or whitespace-only input resolves to `null`. A string containing no `$(...)` at all comes
back unchanged.

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
- Both dot-notation (`output.version.hasNewVersion`) and `$(...)` substitution
  (`$(output:version:hasNewVersion)`) work. Substitution runs over the condition string *before*
  evaluation, inlining a resolved value as a boolean, a number, or a quoted string. Identifier
  resolution is case-insensitive.
- Values are coerced before comparison, so `output.version.isPrerelease == true` compares booleans and `output.test.failed > 0` compares numbers. Datetime-shaped strings compare as datetimes.
- Expressions run in a bounded evaluator with no access to the filesystem, network, or environment; only `output` is in scope.
- Anything other than a boolean `true` result is treated as `false`.
- A `condition` that fails to evaluate logs a warning and counts as `false`, so the step is
  skipped and the pipeline carries on. A `haltIf` that fails to evaluate fails the step with a
  diagnostic instead, on the reasoning that a broken halt guard quietly letting the run continue is
  worse than stopping.

## Scalar Coercion

Configuration values are parsed as raw strings and only coerced to a typed value when a middleware binds them, or when building a condition's `output` scope. The coercion order is fixed: `bool` first (`true` or `false`, case-insensitive), then integer, then floating point, then datetime, and `string` if nothing else matched. Datetimes are recognized in RFC 3339 form with an offset, as `YYYY-MM-DDTHH:MM:SS` or `YYYY-MM-DD HH:MM:SS` (taken as UTC), or as a bare `YYYY-MM-DD` date.

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
    permissions:
      exec: ["git"]
  - name: gh
    url: "oci://registry.moonlitbuild.dev/wolfware/github:1.0.0"
    config:
      token: $(GITHUB_TOKEN)
    permissions:
      network: ["api.github.com"]
      exec: ["git"]
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

By default, `moonlit run` looks for `release.yml` in the current directory, then `release.yaml`. Point it at a different file with `-f`:

```bash
moonlit run -f ./path/to/release.yml
```

See the [CLI Reference](../../reference/cli.md) for the full set of command-line options, including the working-directory flag.

## Next Steps

- Explore the [CLI Reference](../../reference/cli.md) for command-line options
- Learn about [creating custom plugins](../advanced/custom-plugins.md)
- See the [Configuration File Reference](../../reference/config-file.md) for all configuration options
