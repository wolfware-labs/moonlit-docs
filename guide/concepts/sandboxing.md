---
title: Sandboxing
description: Learn how Moonlit sandboxes plugins in WebAssembly and how the deny-by-default permissions model works
---

# Sandboxing

Every Moonlit plugin runs as a WebAssembly component with no ambient access to the host. The engine
decides whether a network call, a subprocess, an environment variable, or a filesystem path is
reachable, and it starts out deciding no to all of them. This page covers the sandbox itself and the
`permissions` grant-list that opens it up.

## The WASM Sandbox

A plugin is a WASI Preview 2 component running inside `wasmtime`, hosted by the engine. It does not
link against the host process, share its memory, or call host APIs directly. Everything it can do
crosses the `moonlit:plugin` component boundary through interfaces the engine implements and
controls: `wasi:http`, `wasi:filesystem`, `wasi:cli`, and the Moonlit-specific `host` and `process`
interfaces.

That boundary is stronger than an in-process plugin model can offer. An in-process plugin is native
code sharing the host's address space and process identity, so in principle it can do anything the
host process can do. A WASM component has none of that reach by construction. Its only capabilities
are the ones the engine wires up at instantiation time, so a misbehaving or compromised plugin has
nowhere to go outside the interfaces it was granted, whatever code runs inside it.

## Deny-by-Default

Every plugin's sandbox starts closed. Each plugin entry takes an optional `permissions` block, and
that block is a grant-list rather than a set of overrides:

- With no `permissions` block, the plugin gets nothing: `network: []`, `exec: []`, `env: []`,
  `filesystem: none`.
- With a `permissions` block, it gets *only* the keys the block names. Anything left out stays
  denied, even though the block is there.

There is no broad-access default to opt out of. A plugin gets exactly the access the pipeline author
wrote down, key by key.

## The Four Capability Keys

```yaml
plugins:
  - name: gh
    url: "oci://registry.moonlit.rs/wolfware/github:1.0.0"
    permissions:
      network: ["api.github.com"]        # allowed hosts for wasi:http
      exec: []                           # allowed programs for moonlit:plugin/process
      env: ["GITHUB_*"]                  # env var glob patterns readable by the plugin
      filesystem: read-write             # none | read-only | read-write (of the working dir)
```

`network` lists allowed hostnames. The engine wraps `wasi:http/outgoing-handler` with a host-side
allowlist filter, and a request to any host not on the list is blocked before it leaves the sandbox.

`exec` lists allowed program names. The check lives in the engine's implementation of
`moonlit:plugin/process`, so only programs named here can be spawned through the plugin's
`process.spawn` and `process.run` calls.

`env` lists glob patterns, `"GITHUB_*"` for example, matched against environment variable names.
The engine applies the filter when it materializes the plugin's view of the accumulated
configuration and environment, so variables that do not match are invisible to the plugin.

`filesystem` takes `none`, `read-only`, or `read-write` (`readonly` and `readwrite` also work) and
controls the WASI preopen of the working directory. With `none`, no directory is preopened, so the
plugin holds no filesystem handle whatever it asks for. If the `permissions` block is present but
this key is missing, it defaults to `none`.

The three list keys accept glob patterns, so `*.github.com` covers every GitHub subdomain. Any key
inside `permissions` other than these four is a configuration error, which keeps a typo from
silently widening or narrowing a grant.

## Denied Access

When a plugin reaches for a host or program it was not granted, the engine blocks the call and puts
a warning in the run output. The warning names the blocked target and the `permissions` key that
would allow it, so the fix is a one-line YAML edit instead of a debugging session:

```
warn  blocked from connecting to 'uploads.github.com': add it to the plugin's permissions.network
warn  blocked from running 'docker': add it to permissions.exec
```

A denied capability does not automatically fail the step. Whether it becomes a step failure depends
on how the plugin handles the error it gets back from the host call.

## A Realistic Example

A pipeline that tags a release, pushes it to GitHub, and runs `dotnet pack` needs three grants and
nothing more:

```yaml
plugins:
  - name: git
    url: "oci://registry.moonlit.rs/wolfware/git:1.0.0"
    permissions:
      exec: ["git"]

  - name: gh
    url: "oci://registry.moonlit.rs/wolfware/github:1.0.0"
    config:
      token: $(GITHUB_TOKEN)
    permissions:
      network: ["api.github.com", "uploads.github.com"]
      exec: ["git"]
      env: ["GITHUB_*"]

  - name: dotnet
    url: "oci://registry.moonlit.rs/wolfware/dotnet:1.0.0"
    permissions:
      exec: ["dotnet"]
      filesystem: read-write
```

`git` can shell out to the `git` binary and needs nothing else. The spawned `git` process works on
the working directory as a normal OS process, independent of the plugin's own WASI preopen, so the
plugin itself gets no filesystem grant.

`gh` can reach GitHub's API and upload hosts, read `GITHUB_`-prefixed environment variables, and
spawn `git` to resolve the repository from the `origin` remote. It has no filesystem access of its
own.

`dotnet` can run the `dotnet` CLI and read and write the working directory, with no network access
and no environment variables. Each plugin's blast radius is the size of its job.

## Why This Matters

Enforcement happens at the engine boundary, not inside plugin code, so it does not depend on a
plugin author remembering to check permissions before making a call. A plugin has no path to an
ungranted host, program, variable, or directory in the first place. That also makes review cheap:
reading a pipeline's `permissions` blocks tells you what every plugin in it can touch, without
reading the plugin's source or taking its documentation on faith.

## Next Steps

- Review the [Plugins System](./plugins.md) for how `permissions` fits into a plugin entry
- Learn how [Middlewares](./middlewares.md) call host-mediated interfaces
- See the [Configuration File Reference](../../reference/config-file.md) for the full `permissions` schema
