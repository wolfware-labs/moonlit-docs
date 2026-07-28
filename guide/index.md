---
title: Introduction to Moonlit
description: Learn what Moonlit is and how its Rust and WebAssembly engine runs your release pipelines
---

# Introduction to Moonlit

Moonlit ("Bring light to your release process") is a build and release automation engine written in Rust. A single YAML file declares the **plugins**, **stages**, and **steps** of your release pipeline; a `wasmtime`-based host executes that pipeline, running each plugin as a sandboxed WebAssembly component.

## What is Moonlit?

Moonlit ships as a single native binary, `moonlit`, that reads a YAML configuration file defining:

1. **Plugins**: WebAssembly components, pulled from an OCI registry, that provide the functionality your pipeline needs
2. **Stages**: logical groupings of steps in your release process, executed in the order they're declared
3. **Steps**: individual actions, each invoking a **middleware** exported by a plugin, that can read the outputs of earlier steps through a small expression language

Because plugins are WebAssembly components rather than native code, they run the same way on every platform and are sandboxed by default: each plugin only gets the network access, filesystem access, environment variables, and subprocess execution you explicitly grant it.

## Who it's for

Moonlit is for teams who want to describe a release pipeline — build, tag, changelog, publish, notify — once in YAML and run it the same way locally and in CI, without trusting arbitrary native plugin code with the host machine.

## Source-Available

Moonlit is source-available under the Elastic License 2.0 — free to use, self-host, and extend inside your own products and pipelines.

## Next Steps

- [Installation Guide](./installation.md): Install Moonlit and verify the CLI is on your `PATH`
- [Quick Start](./quick-start.md): Write your first `release.yml` and run it
- [Core Concepts](./concepts/how-it-works.md): Dive deeper into how Moonlit works
