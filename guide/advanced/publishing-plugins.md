---
title: Publishing a Plugin
description: Push a built plugin component to an OCI registry and reference it from a pipeline
---

# Publishing a Plugin

Moonlit distributes plugins as [OCI](https://opencontainers.org/) artifacts — the same registries and tooling used for container images. Once a plugin component is [built](./custom-plugins.md#building), publishing it makes it pullable from any pipeline via an `oci://` reference, with no manual file distribution.

## Log In to a Registry

```bash
moonlit login ghcr.io
```

On a TTY this prompts for a username (leave blank for token-only auth) and a token. Both can be passed as flags for non-interactive use, e.g. in CI:

```bash
moonlit login registry.moonlitbuild.dev --username my-user --token "$REGISTRY_TOKEN"
```

Credentials are written to `~/.config/moonlit/credentials.toml` (created with `0600` permissions), keyed by registry host. Leaving `--username` unset stores a bearer token; supplying one stores basic auth. When resolving a plugin, Moonlit checks `~/.docker/config.json` first, then falls back to this file — so Docker-authenticated registries already work without a separate login.

## Build and Publish

Publishing introspects your **release** build to read its metadata and middleware list, then pushes it as a single-layer OCI artifact:

```bash
moonlit plugin build --release
moonlit plugin publish oci://ghcr.io/acme/my-plugin:1.0.0
```

By default `publish` looks for the crate's release artifact (the same path `moonlit plugin build --release` produces); pass `--file <path>` to publish an explicit component instead, or `--manifest-path <dir>` to publish a crate that isn't the current directory:

```bash
moonlit plugin publish oci://ghcr.io/acme/my-plugin:1.0.0 \
  --file target/wasm32-wasip2/release/my_plugin.wasm
```

The `oci://` scheme on the reference is optional — a bare `ghcr.io/acme/my-plugin:1.0.0` works too. On success, `publish` prints the resolved reference, content digest, and artifact size.

## Reference Syntax

```
oci://<host>[:port]/<namespace>/<name>:<tag>
oci://<host>[:port]/<namespace>/<name>@sha256:<digest>
```

Examples:

- `oci://ghcr.io/acme/my-plugin:1.0.0`
- `oci://registry.moonlitbuild.dev/wolfware/git:1.0.0`
- `oci://ghcr.io/acme/my-plugin@sha256:ab12…` — digest pinning, recommended for CI, since it skips a tag-resolution round trip entirely

## Consuming a Published Plugin

Reference the published artifact from a pipeline's `plugins` section exactly like a first-party plugin:

```yaml
plugins:
  - name: my-plugin
    url: "oci://ghcr.io/acme/my-plugin:1.0.0"
```

Pulled plugins are cached locally by content digest. A tag reference is re-checked for a new digest after a 15-minute TTL; a digest-pinned reference never needs the network again once cached. `--offline` on `moonlit run` fails instead of pulling on a cache miss.

## Next Steps

- [Authoring a Plugin](./custom-plugins.md) if you haven't built one yet
- [Plugins System](../concepts/plugins.md) for the full set of plugin URL schemes (`oci://`, `file://`, `http(s)://`) and how permissions apply to a loaded plugin
