---
title: Sandboxing
description: Learn how Moonlit sandboxes plugins in WebAssembly and how the deny-by-default permissions model works
---

# Sandboxing

Every Moonlit plugin runs as a WebAssembly component with **no ambient access to the host**. The engine, not the plugin, decides whether a network call, a subprocess, an environment variable, or a filesystem path is reachable — and by default, none of them are. This page explains the sandbox and the `permissions` grant-list that opens it up.

## The WASM Sandbox

A plugin is a WASI Preview 2 component running inside `wasmtime`, hosted by the engine. It doesn't link against the host process, share its memory, or call host APIs directly — everything it can do crosses the `moonlit:plugin` component boundary through interfaces the engine implements and controls: `wasi:http`, `wasi:filesystem`, `wasi:cli`, and the Moonlit-specific `host` and `process` interfaces.

This is a stronger boundary than an in-process plugin model can offer. An in-process plugin runs as native code sharing the host's address space and process identity — it can, in principle, do anything the host process can do. A WASM component has none of that reach by construction: the only capabilities it has are the ones the engine explicitly wires up for it at instantiation time. A misbehaving or compromised plugin can't reach outside the interfaces it was granted, no matter what code runs inside it.

## Deny-by-Default

Every plugin's sandbox starts **closed**. The YAML gains an optional `permissions` block per plugin entry, and it is a **grant-list**, not a set of overrides:

- **No `permissions` block** — the plugin gets nothing: `network: []`, `exec: []`, `env: []`, `filesystem: none`.
- **A `permissions` block present** — it grants *only* the keys it names. Any key left out stays denied, even though the block itself is present.

There is no broad-access starting point to opt out of — a plugin earns exactly the access the pipeline author writes down, key by key.

## The Four Capability Keys

```yaml
plugins:
  - name: gh
    url: "oci://registry.moonlitbuild.dev/wolfware/github:1.0.0"
    permissions:
      network: ["api.github.com"]        # allowed hosts for wasi:http
      exec: []                           # allowed programs for moonlit:plugin/process
      env: ["GITHUB_*"]                  # env var glob patterns readable by the plugin
      filesystem: read-write             # none | read-only | read-write (of the working dir)
```

- **`network`** — a list of allowed hostnames. The engine wraps `wasi:http/outgoing-handler` with a host-side allowlist filter; a request to any host not on the list is blocked before it leaves the sandbox.
- **`exec`** — a list of allowed program names. Checked in the engine's implementation of `moonlit:plugin/process`; only programs named here can be spawned via the plugin's `process.spawn`/`process.run` calls.
- **`env`** — a list of glob patterns (e.g. `"GITHUB_*"`) matched against environment variable names. The engine applies this as a filter when materializing the plugin's view of the accumulated configuration/environment — variables that don't match are invisible to the plugin.
- **`filesystem`** — one of `none`, `read-only`, or `read-write` (`readonly` and `readwrite` are accepted too), controlling the WASI preopen of the working directory. `none` means no directory is preopened at all — the plugin has no filesystem handle to use, regardless of what it asks for. This key defaults to `none` when the `permissions` block is present but `filesystem` is omitted.

The three list keys are glob patterns, so `*.github.com` covers every GitHub subdomain. Any key other than these four inside `permissions` is a configuration error, so a typo can't silently widen or narrow a grant.

## Denied Access

When a plugin tries to reach a host or program it wasn't granted, the engine blocks the call and surfaces a **warning in the run output** — it names the blocked target and the `permissions` key that would allow it, so the fix is a one-line YAML edit rather than a debugging session:

```
warn  blocked from connecting to 'uploads.github.com' — add it to the plugin's permissions.network
warn  blocked from running 'docker' — add it to permissions.exec
```

The step isn't automatically failed by a denied capability — whether that turns into a step failure depends on how the plugin itself handles the resulting error from its host call.

## A Realistic Example

A pipeline that tags a release, pushes it to GitHub, and runs `dotnet pack` needs three different grants, and nothing else:

```yaml
plugins:
  - name: git
    url: "oci://registry.moonlitbuild.dev/wolfware/git:1.0.0"
    permissions:
      exec: ["git"]

  - name: gh
    url: "oci://registry.moonlitbuild.dev/wolfware/github:1.0.0"
    config:
      token: $(GITHUB_TOKEN)
    permissions:
      network: ["api.github.com", "uploads.github.com"]
      exec: ["git"]
      env: ["GITHUB_*"]

  - name: dotnet
    url: "oci://registry.moonlitbuild.dev/wolfware/dotnet:1.0.0"
    permissions:
      exec: ["dotnet"]
      filesystem: read-write
```

`git` can shell out to the `git` binary, but that's the only access it needs — the spawned `git` process operates on the working directory as a normal OS process, independent of the plugin's own WASI preopen, so the plugin itself has no filesystem grant. `gh` can talk to GitHub's API and upload hosts, read `GITHUB_`-prefixed environment variables, and spawn `git` to resolve the repository from the `origin` remote, but has no filesystem access of its own. `dotnet` can run the `dotnet` CLI and read/write the working directory, but has no network access and can't read any environment variables. Each plugin's blast radius is exactly what its job requires.

## Why This Matters

Because enforcement happens at the engine boundary rather than inside plugin code, it doesn't depend on a plugin author remembering to check permissions before making a call — a plugin simply has no path to an ungranted host, program, variable, or directory. Reviewing a pipeline's `permissions` blocks tells you precisely what every plugin in it can touch, without having to read the plugin's source or trust its documentation.

## Next Steps

- Review the [Plugins System](./plugins.md) for how `permissions` fits into a plugin entry
- Learn how [Middlewares](./middlewares.md) call host-mediated interfaces
- See the [Configuration File Reference](../../reference/config-file.md) for the full `permissions` schema
