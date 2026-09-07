---
title: Dotnet Plugin
description: Documentation for the Dotnet plugin in Moonlit
---

# Dotnet Plugin

Build, pack, test, and publish .NET projects via the `dotnet` CLI.

## Reference

```yaml
plugins:
  - name: dotnet
    url: "oci://registry.moonlitbuild.dev/wolfware/dotnet:1.0.0"
    config:
      nugetApiKey: $(NUGET_API_KEY)
    permissions:
      exec: ["dotnet"]
      filesystem: read-write
```

Moonlit is deny-by-default, so a plugin with no `permissions:` block gets zero capabilities. [Sandboxing](../guide/concepts/sandboxing.md) has the full model. The Dotnet plugin shells out to the `dotnet` CLI, so it needs `exec: ["dotnet"]`; `pack` and `test` write their output into a `.moonlit/` directory under the working directory (wiped and recreated each run), so the plugin also needs `filesystem: read-write`.

Plugin-level config: `nugetSource` (default `https://api.nuget.org/v3/index.json`) and `nugetApiKey` (default `""`, used as the fallback for `push`). `apiKey` is accepted as an alias of `nugetApiKey`, and `nugetApiKey` wins when both are set.

## build

Build a project with SemVer-derived assembly metadata, without packing it.

| Config | Required / Default | Meaning |
|---|---|---|
| `project` | **Required** | Path to the `.csproj`/`.fsproj` file, resolved against the working directory. Missing → failure. |
| `version` | Optional | Base version used to derive the three metadata fields below when they aren't set explicitly. |
| `assemblyVersion` | Optional | Defaults to `version` with any prerelease suffix stripped. |
| `fileVersion` | Optional | Defaults to `version` with any prerelease suffix stripped. |
| `informationalVersion` | Optional | Defaults to the full `version`, prerelease and build metadata included. |
| `configuration` | Optional, default `Release` | Build configuration. |
| `noRestore` | Optional, default `false` | Passes `--no-restore`. |

No outputs. Runs `dotnet build <project> -p:AssemblyVersion=... -p:FileVersion=... -p:InformationalVersion=... --configuration <configuration> [--no-restore]`. If any of the three version fields is left unresolved, meaning no `version` and no explicit override, the step fails.

## pack

Pack a project into a `.nupkg`.

| Config | Required / Default | Meaning |
|---|---|---|
| `project` | **Required** | Path to the project file. Missing → failure. |
| `version` | Optional | Base version for the four derived fields below. |
| `assemblyVersion` / `fileVersion` / `informationalVersion` | Optional | Same derivation as `build`. |
| `packageVersion` | Optional | Defaults to `version` with any build-metadata suffix stripped. |
| `configuration` | Optional, default `Release` | Build configuration. |
| `noBuild` | Optional, default `false` | Passes `--no-build`. |
| `noRestore` | Optional, default `false` | Passes `--no-restore`. |

| Output | Description |
|---|---|
| `packagePath` | Working-directory-relative path to the produced `.nupkg`. |

The package is written to `.moonlit/dotnet/<slug>/`, where `<slug>` is the project's relative path without its extension and with path separators flattened to `_` (`src/Api/Api.csproj` becomes `src_Api_Api`), wiped before the run. No `.nupkg` produced → failure `"No .nupkg files were created."`; more than one → a warning, using the alphabetically-first file.

## push

Publish a `.nupkg` to a NuGet source.

| Config | Required / Default | Meaning |
|---|---|---|
| `package` | **Required** | Path to the `.nupkg` file. Missing → failure. |
| `source` | Optional, falls back to plugin config `nugetSource` | The feed to push to. Blank in both places → failure. |
| `apiKey` | Optional, falls back to plugin config `nugetApiKey`/`apiKey` | The API key. Blank in both places → failure. |

No outputs. `dotnet nuget push <package> --source <source> --api-key <apiKey> --timeout 30`. A `401`/`403` response maps to an authentication-error failure message.

## test

Run tests and report pass/fail/skip counts from the TRX results file.

| Config | Required / Default | Meaning |
|---|---|---|
| `project` | **Required** | Path to the test project. Missing → failure. |
| `configuration` | Optional, default `Release` | Build configuration. |
| `filter` | Optional | Passed as `--filter`. |
| `noBuild` | Optional, default `false` | Passes `--no-build`. |
| `collectCoverage` | Optional, default `false` | Passes `--collect "XPlat Code Coverage"`. |

| Output | Description |
|---|---|
| `passed` | Number of passed tests. |
| `failed` | Number of failed tests. |
| `skipped` | Number of skipped tests. |
| `total` | Total number of tests. |

Results are written to `.moonlit/dotnet-test/<slug>/moonlit.trx` (same slug scheme as `pack`) and parsed as TRX; `skipped` is `total` minus the executed count. A non-zero exit with failures reported fails with `"{failed} test(s) failed."`; a non-zero exit with no TRX or no failures reported fails generically; a zero exit with no TRX file fails with `"Test results file was not produced."`

## Example

```yaml
plugins:
  - name: dotnet
    url: "oci://registry.moonlitbuild.dev/wolfware/dotnet:1.0.0"
    config:
      nugetApiKey: $(NUGET_API_KEY)
    permissions:
      exec: ["dotnet"]
      filesystem: read-write

stages:
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
```

For a complete worked pipeline, see the [NuGet Release Pipeline](./examples/nuget-release.md) example.
