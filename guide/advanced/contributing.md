---
title: Contributing
description: How to build, test, and submit changes to Moonlit
---

# Contributing

Thanks for your interest in improving Moonlit. This page covers where the code lives, the local build and test loop, and the sign-off required on every commit.

## License of Contributions

Moonlit is open source, dual-licensed under the [MIT](https://github.com/wolfware-labs/moonlit/blob/main/LICENSE-MIT) or [Apache-2.0](https://github.com/wolfware-labs/moonlit/blob/main/LICENSE-APACHE) license, at your option. Unless stated otherwise, contributions you submit are provided under the same terms. "Moonlit" is a trademark of Wolfware LLC; the license grants no rights to use it.

## Repositories

Moonlit is split across a few repositories under [wolfware-labs](https://github.com/wolfware-labs):

| Repository | Contents |
|---|---|
| [`moonlit`](https://github.com/wolfware-labs/moonlit) | The CLI, the engine, and the plugin development kit (a Rust workspace). |
| [`moonlit-plugins`](https://github.com/wolfware-labs/moonlit-plugins) | The first-party plugins (git, github, gitlab, semantic-release, slack, dotnet, docker, nodejs, moonlit), one crate each, depending only on the published `moonlit-pdk`. |
| [`setup-moonlit`](https://github.com/wolfware-labs/setup-moonlit) | The GitHub Action that installs the CLI on a runner. |

## Workspace Layout

The `moonlit` repository is a Rust workspace. The crate boundaries are hard boundaries: the CLI depends on the engine, and nothing depends on the CLI; the PDK has no in-workspace dependency on the engine, because plugin authors consume it from crates.io.

```
moonlit/
├── engine/       # moonlit-engine (lib): config parser, expression engine, resolvers, wasmtime host, pipeline runner, WIT contract
├── cli/          # moonlit (bin): the clap command tree and terminal rendering
├── pdk/          # moonlit-pdk (lib): the plugin development kit
├── pdk-macros/   # moonlit-pdk-macros (proc-macro): the moonlit_plugin! macro
├── fixtures/     # sample plugin crates used by the test suites (excluded from the workspace)
└── Cargo.toml    # workspace manifest
```

The CLI and engine share one version and ship together as the `moonlit` product; `moonlit-engine` is not published as a crate. The two PDK crates are versioned independently and published to crates.io.

The toolchain is pinned in `rust-toolchain.toml`, including the `wasm32-wasip2` target that plugin crates build against, so `cargo` picks it up automatically.

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

Run all four before opening a pull request; CI enforces the same checks. Some engine tests instantiate prebuilt plugin components from `engine/tests/fixtures`; the fixture crates under `fixtures/` are their source.

### Plugins

Clone `moonlit-plugins` alongside. `cargo test` there runs each plugin's native unit tests and its engine-driven integration tests, which load the plugin as a WebAssembly component. End-to-end tests that drive the plugins through the `moonlit` CLI sit behind the `cli-e2e` feature and need a `moonlit` binary on `PATH` or in `MOONLIT_BIN`:

```bash
MOONLIT_BIN=/path/to/moonlit cargo test --features cli-e2e
```

## Commit Messages

Commits follow the [Conventional Commits](https://www.conventionalcommits.org/) format (`type(scope): summary`). Release tooling derives version bumps and changelogs from them, so a `feat:` or `fix:` commit is what makes a change appear in the next release notes.

## Developer Certificate of Origin (DCO)

Every commit must be signed off under the [Developer Certificate of Origin 1.1](https://developercertificate.org/), certifying that you wrote the change or otherwise have the right to submit it under the project's license:

```
Signed-off-by: Your Name <you@example.com>
```

`git commit -s` adds this trailer automatically. Sign off your commits before opening a pull request; unsigned commits may be asked to be re-signed during review.

## Submitting Changes

1. Fork the repository and create a branch for your change.
2. Make your change, with tests covering new behavior.
3. Run the build and test commands above.
4. Commit with `git commit -s` and a Conventional Commits message.
5. Open a pull request describing what changed and why.

## Next Steps

- [Authoring a Plugin](./custom-plugins.md) if your contribution is a new plugin rather than a change to the engine or CLI
- [How Moonlit Works](../concepts/how-it-works.md) for the architecture your change fits into
