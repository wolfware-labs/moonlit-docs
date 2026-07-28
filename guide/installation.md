---
title: Installing Moonlit
description: Learn how to install and set up Moonlit for your projects
---

# Installing Moonlit

Moonlit ships as a single native binary, `moonlit`, with no separate runtime to install. Pick whichever channel below fits your platform and workflow.

## Prebuilt Archives

Prebuilt, cargo-dist-built archives are published for:

| Platform | Architecture |
|---|---|
| Linux | x64, arm64 |
| macOS | universal (Intel + Apple Silicon) |
| Windows | x64 |

Download the archive for your platform from the [GitHub releases page](https://github.com/wolfware-labs/moonlit/releases), extract it, and place the `moonlit` binary somewhere on your `PATH`.

## Homebrew

On macOS or Linux with Homebrew installed, install from the Wolfware tap:

```bash
brew install wolfware/tap/moonlit
```

## Cargo

If you already have a Rust toolchain installed, you can build and install Moonlit from crates.io:

```bash
cargo install moonlit-cli
```

## Container Image

A container image is published as `wolfware/moonlit`, useful for running Moonlit in CI without installing anything on the runner:

```bash
docker pull wolfware/moonlit
docker run --rm wolfware/moonlit version
```

To run a pipeline in the container, mount your project directory into the container and invoke `moonlit run` from there.

## Verifying the Installation

Once installed, confirm Moonlit is on your `PATH` and check its version:

```bash
moonlit version
```

## Next Steps

Now that you have Moonlit installed, you can:

- [Create your first pipeline](./quick-start.md) with a step-by-step guide
- Learn about [Moonlit's core concepts](./concepts/how-it-works.md)
- Explore the [CLI reference](../reference/cli.md) for all available commands and options
