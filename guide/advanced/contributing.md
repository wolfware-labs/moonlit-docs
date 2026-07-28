---
title: Contributing
description: How to build, test, and submit changes to Moonlit
---

# Contributing

Thanks for your interest in improving Moonlit. This page covers the workspace layout, the local build/test loop, and the sign-off required on every commit.

## License of Contributions

Moonlit is source-available under the [Elastic License 2.0](https://github.com/wolfware-labs/moonlit/blob/main/LICENSE) (ELv2) — not an OSI-approved open-source license, but free to read, self-host, and extend. Unless stated otherwise, contributions you submit are provided under the same terms. "Moonlit" is a trademark of Wolfware LLC; the license grants no rights to use it.

## Workspace Layout

Moonlit is a Rust workspace. The directory boundaries are hard boundaries — plugin crates only depend on the SDK, never the engine directly:

```
moonlit/
├── engine/     # moonlit-engine (lib): the wasmtime host, pipeline executor, WIT contract
├── cli/        # moonlit-cli (bin "moonlit"): the clap command tree
├── sdk/        # moonlit-plugin-sdk (lib): the plugin authoring SDK
├── plugins/    # one crate per first-party plugin (git, github, gitlab, docker, …)
└── Cargo.toml  # workspace manifest
```

- `cli` depends on `engine` and `sdk`
- `plugins/*` depend on `sdk` only
- `engine` has no in-workspace dependencies

The toolchain is pinned in `rust-toolchain.toml`, including the `wasm32-wasip2` target that plugin crates build against.

## Getting Started

```bash
git clone https://github.com/wolfware-labs/moonlit.git
cd moonlit
cargo build
```

### Build and Test

```bash
cargo build
cargo test
cargo fmt --all --check
cargo clippy --all-targets -- -D warnings
```

Run all four before opening a pull request — CI enforces the same checks.

## Developer Certificate of Origin (DCO)

Every commit must be signed off under the [Developer Certificate of Origin 1.1](https://developercertificate.org/), certifying that you wrote the change or otherwise have the right to submit it under the project's license:

```
Signed-off-by: Your Name <you@example.com>
```

`git commit -s` adds this trailer automatically. Pull requests with unsigned commits are rejected by CI.

## Submitting Changes

1. Fork the repository and create a branch for your change.
2. Make your change, with tests covering new behavior.
3. Run the build and test commands above.
4. Commit with `git commit -s` and a clear, descriptive message.
5. Open a pull request describing what changed and why.

## Next Steps

- [Authoring a Plugin](./custom-plugins.md) if your contribution is a new plugin rather than a change to the engine or CLI
- [How Moonlit Works](../concepts/how-it-works.md) for the architecture your change fits into
