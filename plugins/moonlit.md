---
title: Moonlit Plugin
description: Documentation for the Moonlit plugin in Moonlit
---

# Moonlit Plugin

Run nested Moonlit release files — monorepo modules or submodules — by invoking the `moonlit` CLI recursively.

## Reference

```yaml
plugins:
  - name: moonlit
    url: "oci://registry.moonlitbuild.dev/wolfware/moonlit:1.0.0"
    permissions:
      exec: ["moonlit"]
```

Moonlit is deny-by-default: a plugin with no `permissions:` block gets zero capabilities — see [Sandboxing](../guide/concepts/sandboxing.md) for the full model. The Moonlit plugin shells out to the `moonlit` binary to run each nested module, so it needs `exec: ["moonlit"]`. No plugin-level config.

## run-modules

Run one or more nested release files, one child `moonlit run` invocation per module.

| Config | Required / Default | Meaning |
|---|---|---|
| `modulePaths` | **Required**, non-empty array | Paths (relative to the working directory) to run. A path ending in `.yml`/`.yaml` (case-insensitive) is treated as a file — its parent directory becomes `-w` and its basename becomes `-f`; any other path is treated as a directory passed as `-w` with no `-f` (the child resolves `release.yml`/`moonlit.yml` itself). |
| `stages` | Optional array | Each entry forwarded as its own `-s`. |
| `continueOnModuleError` | Optional, default `false` | When `true`, a failing module doesn't stop the remaining modules. |
| `arguments` | Optional map | Each entry forwarded as `-a key=value`. |

| Output | Description |
|---|---|
| `results` | Array of `{ module, successful, durationMs }`, one entry per module attempted, in `modulePaths` order. |
| `failedCount` | Number of modules that failed. |

Each child runs as `moonlit run -w <dir> [-f <file>] --output plain [-s <stage>]* [-a k=v]*`, with its output streamed under the step. Without `continueOnModuleError`, the first failing module stops the middleware and fails the step with `"Module '<path>' failed with exit code <code>."`; with it, every module runs and the step succeeds, reporting the per-module results and `failedCount`.

## Example

```yaml
plugins:
  - name: moonlit
    url: "oci://registry.moonlitbuild.dev/wolfware/moonlit:1.0.0"
    permissions:
      exec: ["moonlit"]

stages:
  release:
    - name: modules
      run: moonlit.run-modules
      config:
        modulePaths:
          - "services/api/release.yml"
          - "services/worker/release.yml"
        continueOnModuleError: true
        arguments:
          version: $(output:version:nextVersion)
```
