---
title: Publishing a Plugin
description: Push a built plugin component to an OCI registry and reference it from a pipeline
---

# Publishing a Plugin

Moonlit distributes plugins as [OCI](https://opencontainers.org/) artifacts, using the same registries and tooling as container images. Once a plugin component is [built](./custom-plugins.md#building), publishing it makes it pullable from any pipeline through an `oci://` reference, with no files to hand around.

## Log In to a Registry

```bash
moonlit login
```

With no arguments this signs in to Moonlit's own registry, `registry.moonlit.rs`, through your browser: the CLI prints a one-time code, opens the registry's approval page, and stores the token the registry issues once you approve. Pass a host to sign in elsewhere.

For CI, or for a registry that doesn't offer the browser flow (GitHub Container Registry, for example), pass the credential directly and no browser is involved:

```bash
moonlit login --token "$MOONLIT_TOKEN"
moonlit login ghcr.io --username my-user --token "$GHCR_TOKEN"
```

Credentials are written to `~/.config/moonlit/credentials.toml` (created with `0600` permissions), keyed by registry host. Leaving `--username` unset stores a bearer token; supplying one stores basic auth. When resolving a plugin, Moonlit checks `~/.docker/config.json` first and falls back to this file, so a registry you are already logged into with Docker works without a separate login.

`moonlit logout [host]` removes a stored credential, and revokes the token on the registry first when it came from the browser flow. See the [CLI reference](../../reference/cli.md#moonlit-login-host) for the full set of options.

## Build and Publish

Publishing introspects your **release** build to read its name, version, description, and middleware list, then pushes it as a single-layer OCI artifact annotated with the crate's repository, license, and `moonlit-pdk` version:

```bash
moonlit plugin build --release
moonlit plugin publish oci://ghcr.io/acme/my-plugin:1.0.0
```

By default `publish` looks for the crate's release artifact (the same path `moonlit plugin build --release` produces); pass `--file <path>` to publish an explicit component instead, or `--manifest-path <dir>` to publish a crate that isn't the current directory:

```bash
moonlit plugin publish oci://ghcr.io/acme/my-plugin:1.0.0 \
  --file target/wasm32-wasip2/release/my_plugin.wasm
```

The `oci://` scheme on the reference is optional; a bare `ghcr.io/acme/my-plugin:1.0.0` works too. On success, `publish` prints the resolved reference, content digest, and artifact size.

## Reference Syntax

```
oci://<host>[:port]/<namespace>/<name>:<tag>
oci://<host>[:port]/<namespace>/<name>@sha256:<digest>
```

Examples:

- `oci://ghcr.io/acme/my-plugin:1.0.0`
- `oci://registry.moonlit.rs/wolfware/git:1.0.0`
- `oci://ghcr.io/acme/my-plugin@sha256:ab12...` pins by digest. Worth preferring in CI, since it skips the tag-resolution round trip entirely

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
