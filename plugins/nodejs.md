---
title: NodeJs Plugin
description: Documentation for the NodeJs plugin in Moonlit
---

# NodeJs Plugin

Install, build, test, pack, and publish Node.js packages via the `npm` CLI.

## Reference

```yaml
plugins:
  - name: nodejs
    url: "oci://registry.moonlitbuild.dev/wolfware/nodejs:1.0.0"
    config:
      token: $(NPM_TOKEN)
    permissions:
      exec: ["npm"]
      filesystem: read-write
```

Moonlit is deny-by-default: a plugin with no `permissions:` block gets zero capabilities — see [Sandboxing](../guide/concepts/sandboxing.md) for the full model. The NodeJs plugin shells out to the `npm` CLI, so it needs `exec: ["npm"]`; `pack` writes a tarball and `push` writes a scoped `.npmrc` (then removes it) under the working directory, so the plugin also needs `filesystem: read-write`.

Plugin-level config: `registry` (default `https://registry.npmjs.org`) and `token` (default `""`, used as the fallback for `push`).

## install

Install dependencies with `npm ci` or `npm install`.

| Config | Required / Default | Meaning |
|---|---|---|
| `directory` | Optional, default `.` | Directory containing `package.json`. Missing `package.json` → failure. |
| `production` | Optional, default `false` | Passes `--omit=dev`. |
| `ci` | Optional, default: `true` when a lockfile is present | Forces `npm ci` (`true`) or `npm install` (`false`) regardless of lockfile detection. |

No outputs.

## run-script

Run a `package.json` script.

| Config | Required / Default | Meaning |
|---|---|---|
| `directory` | Optional, default `.` | Directory containing `package.json`. |
| `script` | **Required** | The script name. |
| `args` | Optional array | Forwarded after `--`. |

No outputs. `npm run <script> [-- args…]`. A missing script fails with `"Script '<script>' not found in package.json."`

## build

Optionally bump the version, then run the build script.

| Config | Required / Default | Meaning |
|---|---|---|
| `directory` | Optional, default `.` | Directory containing `package.json`. |
| `command` | Optional, default `build` | The script to run. |
| `version` | Optional | When set, runs `npm version <version> --no-git-tag-version --allow-same-version` before the build script. |

No outputs.

## pack

Optionally bump the version, then pack the package into a `.tgz` tarball.

| Config | Required / Default | Meaning |
|---|---|---|
| `directory` | Optional, default `.` | Directory containing `package.json`. |
| `version` | Optional | Same version-bump step as `build`. |
| `destination` | Optional, default `.moonlit/npm-pack` (directory-relative, wiped each run) | Pack destination. A user-provided destination is created if missing but never wiped. |

| Output | Description |
|---|---|
| `packagePath` | Working-directory-relative path to the produced `.tgz`. |

`npm pack --pack-destination <destination> --json`, parsing the resulting JSON for the tarball filename. No tarball produced → failure `"No package tarball was created."`

## push

Publish a tarball to an npm registry.

| Config | Required / Default | Meaning |
|---|---|---|
| `package` | **Required** | Path to the `.tgz` file. Missing → failure. |
| `registry` | Optional, falls back to plugin config `registry` | The registry to publish to. |
| `token` | Optional, falls back to plugin config `token` | The auth token. Blank in both places → failure. |
| `tag` | Optional, default `latest` | Passed as `--tag`. |
| `access` | Optional | Passed as `--access` (e.g. `public`/`restricted`). |

No outputs. The token is written to a scoped `.npmrc` under `.moonlit/npm-push/` (owner-only permissions on Unix) and passed via `--userconfig`, keeping it off the process argv; the file is removed again after the run. `npm publish <package> --registry <registry> --tag <tag> [--access …] --userconfig <path>`. A `401`/`403` response maps to an authentication-error failure; a version conflict (`EPUBLISHCONFLICT`/`409`) maps to `"Version already published."`

## test

Run the test script.

| Config | Required / Default | Meaning |
|---|---|---|
| `directory` | Optional, default `.` | Directory containing `package.json`. |
| `script` | Optional, default `test` | The script to run. |

No outputs. `npm run <script>`; any non-zero exit fails with `"Tests failed."`

## Example

```yaml
plugins:
  - name: nodejs
    url: "oci://registry.moonlitbuild.dev/wolfware/nodejs:1.0.0"
    config:
      token: $(NPM_TOKEN)
    permissions:
      exec: ["npm"]
      filesystem: read-write

stages:
  build:
    - name: install
      run: nodejs.install
      config:
        directory: "./my-node-project"
    - name: test
      run: nodejs.run-script
      config:
        directory: "./my-node-project"
        script: "test"
    - name: build
      run: nodejs.build
      config:
        directory: "./my-node-project"
        command: "build:prod"

  publish:
    - name: pack
      run: nodejs.pack
      config:
        directory: "./my-node-project"
        version: $(output:version:nextVersion)
    - name: push
      run: nodejs.push
      config:
        package: $(output:pack:packagePath)
```
