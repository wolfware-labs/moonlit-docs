---
title: Publish a Plugin
description: Scaffold, build, inspect, and publish a Moonlit plugin to an OCI registry
---

# Publish a Plugin

A step-by-step CLI workflow that scaffolds a Rust plugin crate, builds it into a WASI Preview 2 component, inspects the result, and publishes it to an OCI registry so it can be referenced from a `release.yml` anywhere.

## Prerequisites

- A Rust toolchain
- The WASI Preview 2 target: `rustup target add wasm32-wasip2`
- An OCI registry you can push to (e.g. `ghcr.io`) and credentials for it

## 1. Scaffold

Scaffolding is optional — you can also start from an existing crate — but it's the fastest way to get a working plugin skeleton:

```bash
moonlit plugin new my-plugin --namespace acme --license Elastic-2.0
```

This creates a `my-plugin/` crate from the SDK templates, wired up for the `moonlit_plugin!` macro. See the [Plugin SDK](../reference/plugin-development.md) reference for how to write middlewares and declare the plugin's config and capabilities.

## 2. Build

```bash
moonlit plugin build --release
```

This compiles the crate to a WASI Preview 2 component via `cargo build --target wasm32-wasip2`, producing `target/wasm32-wasip2/release/my-plugin.wasm`.

## 3. Inspect

Verify the component before publishing it:

```bash
moonlit plugin inspect target/wasm32-wasip2/release/my-plugin.wasm
```

This instantiates the component with zero capability grants and prints its name, version, and description, along with the middlewares it exports.

## 4. Log in

Publishing to a private registry requires stored credentials:

```bash
moonlit login ghcr.io
```

This prompts for a username and token, then writes them to `~/.config/moonlit/credentials.toml` with `0600` permissions.

## 5. Publish

```bash
moonlit plugin publish oci://ghcr.io/acme/my-plugin:1.0.0
```

This pushes the release build to the registry, attaching provenance metadata — the crate's `repository`, `license`, and resolved SDK version — read from `Cargo.toml` and `Cargo.lock`.

## Use it in a pipeline

Once published, reference the plugin like any other, granting only the capabilities its middlewares actually need:

```yaml
plugins:
  - name: my-plugin
    url: "oci://ghcr.io/acme/my-plugin:1.0.0"
    permissions:
      exec: ["some-tool"]

stages:
  build:
    - name: run
      run: my-plugin.some-middleware
```

Moonlit is deny-by-default: an omitted or empty `permissions:` block gets zero capabilities, so grant exactly what the plugin calls out to and nothing more. See [Sandboxing](../guide/concepts/sandboxing.md) for the full permission model.

- [Plugin SDK](../reference/plugin-development.md)
- [Plugin System](../reference/plugin-system.md)
- [CLI Reference](../reference/cli.md)
