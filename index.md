---
layout: home

hero:
  name: "Moonlit"
  text: "Bring light to your release process"
  tagline: A Rust and WebAssembly build and release automation engine. Declare your pipeline in YAML and sandboxed WASM plugins do the rest. Open source under MIT OR Apache-2.0.
  image:
    src: /logo.png
    alt: Moonlit
  actions:
    - theme: brand
      text: Get Started
      link: /guide/
    - theme: alt
      text: Install
      link: /guide/installation

features:
  - icon: 🦀
    title: Rust + WebAssembly Engine
    details: A single native binary built in Rust. Pipelines run on a wasmtime-based host that executes sandboxed WebAssembly plugin components, with no separate runtime to install.

  - icon: 📝
    title: Declarative YAML Pipelines
    details: Define plugins, stages, and steps in a single YAML file. Steps produce namespaced outputs that later steps consume through a simple expression language.

  - icon: 🔒
    title: Sandboxed Plugins
    details: Every plugin runs sandboxed by default. Per-plugin capability grants hand over only what a plugin needs, from network hosts and executable programs to environment variables and filesystem access.

  - icon: 📦
    title: OCI Plugin Distribution
    details: Plugins are WebAssembly components distributed over OCI registries. Pull them the same way you pull container images, from Moonlit's own registry or any OCI-compliant one.

  - icon: 🧰
    title: First-Party Plugin Catalog
    details: Automate releases for Git, GitHub, GitLab, semantic versioning, .NET, Node.js, Docker, and Slack out of the box, or build and publish your own plugin.

  - icon: ⚖️
    title: Open Source
    details: Moonlit is open source, dual-licensed under MIT OR Apache-2.0, so you can use it, self-host it, and extend it inside your own products and pipelines.
---

## What is Moonlit?

Moonlit is a build and release automation engine built on Rust and WebAssembly. A single YAML file declares the plugins, stages, and steps of your release pipeline; a `wasmtime`-based host executes that pipeline, running each plugin as a sandboxed WebAssembly component.

Because plugins are WASM components rather than native code, they can be written in any language that compiles to a WASI Preview 2 component, and they run the same way on every platform. They are also sandboxed by default, so you decide what network access, filesystem access, environment variables, and subprocesses each one gets.

## Installation

Pick your operating system for the recommended install command. Prebuilt archives and every other channel are covered in the [installation guide](/guide/installation).

<InstallCommand />

## Quick Example

This is just one example of what Moonlit can do. See the [Plugins](/plugins/) section for the full first-party catalog.

```yaml
name: "Release Pipeline"

variables:
  projectPath: "./src/MyProject.csproj"

# Register plugins, pulled from an OCI registry, that provide middlewares for the pipeline.
# Each one is sandboxed and gets only the capabilities its permissions block grants.
plugins:
  - name: "git"
    url: "oci://registry.moonlitbuild.dev/wolfware/git:1.0.0"
    permissions:
      exec: ["git"]

  - name: "gh"
    url: "oci://registry.moonlitbuild.dev/wolfware/github:1.0.0"
    config:
      token: $(GITHUB_TOKEN)
    permissions:
      network: ["api.github.com"]
      exec: ["git"]

  - name: "sr"
    url: "oci://registry.moonlitbuild.dev/wolfware/semantic-release:1.0.0"

  - name: "dotnet"
    url: "oci://registry.moonlitbuild.dev/wolfware/dotnet:1.0.0"
    permissions:
      exec: ["dotnet"]
      filesystem: read-write

  - name: "slack"
    url: "oci://registry.moonlitbuild.dev/wolfware/slack:1.0.0"
    config:
      token: $(SLACK_TOKEN)
    permissions:
      network: ["slack.com"]

# Define the stages of the pipeline, executed in sequence
stages:
  analyze:
    - name: repo
      run: git.repo-context

    - name: tag
      run: git.latest-tag
      config:
        prefix: "v"

    - name: commits
      run: git.commits

    - name: conventionalCommits
      run: sr.analyze
      haltIf: output.conventionalCommits.commitCount == 0
      config:
        commits: $(output:commits:details)

    - name: version
      run: sr.calculate-version
      haltIf: "!output.version.hasNewVersion"
      config:
        branch: $(output:repo:branch)
        baseVersion: $(output:tag:name)

  build:
    - name: build
      run: dotnet.build
      config:
        project: $(vars:projectPath)
        version: $(output:version:nextFullVersion)
        configuration: "Release"

  release:
    - name: changelog
      run: sr.generate-changelog

    - name: release
      run: gh.create-release
      condition: $(output:repo:branch) == 'main'
      config:
        name: "Release $(output:version:nextVersion)"
        tag: "v$(output:version:nextVersion)"
        changelog: $(output:changelog:categories)
        prerelease: $(output:version:isPrerelease)

  notify:
    - name: notify-slack
      run: slack.send-notification
      config:
        channel: "#releases"
        message: ":rocket: New release $(output:version:nextVersion) is now available!"
```

Save this as `release.yml` and run it with:

```bash
moonlit run
```

[Learn more about Moonlit](/guide/)
