---
title: Quick Start Guide
description: Create your first Moonlit pipeline in minutes
---

# Quick Start Guide

This guide walks you through writing a minimal `release.yml` and running it with Moonlit.

## Prerequisites

Before you begin, make sure you have:

- [Installed Moonlit](./installation.md), so that `moonlit version` prints its version banner
- A Git repository with an `origin` remote (the example pipeline reads it)

## Step 1: Create a Configuration File

Create a file named `release.yml` in the root of your project with the following content:

```yaml
name: "My First Pipeline"

plugins:
  - name: git
    url: "oci://registry.moonlit.rs/wolfware/git:1.0.0"
    permissions:
      exec: ["git"]

stages:
  info:
    - name: repo
      run: git.repo-context
```

- **plugins** lists the WebAssembly components your pipeline needs, each pulled from an OCI registry via an `oci://` reference.
- `permissions` grants a plugin the host access it needs. Here, `exec: ["git"]` lets it run the `git` CLI. Moonlit denies everything by default, so a plugin with no `permissions` block gets no capabilities at all.
- **stages** is an ordered map of stage name to a list of steps.
- Each step has a `name`, which namespaces its outputs, and a `run` value of the form `plugin.middleware`. In this case that is `git.repo-context`, where `git` is the plugin's `name` and `repo-context` is the middleware it exports.

## Step 2: Validate the Pipeline

Before running it, check that the file parses, the plugin resolves, and every `run:` reference is valid:

```bash
moonlit validate
```

`moonlit validate` parses the YAML, resolves the plugins it references, and verifies the middleware names, all without executing anything.

## Step 3: Preview With a Dry Run

```bash
moonlit run --dry-run
```

Adding `--dry-run` to `moonlit run` resolves the plugins and walks the pipeline without executing any step's middleware.

## Step 4: Run the Pipeline

```bash
moonlit run
```

By default, `moonlit run` looks for `release.yml` in the current directory. Point it at a different file with `-f`:

```bash
moonlit run -f ./path/to/release.yml
```

Moonlit resolves the `git` plugin, then executes the `repo` step, printing the current branch and remote URL it read from your repository.

## Next Steps

Now that you've created your first pipeline, you can:

- Learn about [Moonlit's core concepts](./concepts/how-it-works.md)
- Explore the [configuration file structure](../reference/config-file.md)
- Check out the [available plugins](../plugins/) and their capabilities
- Learn how to [create custom plugins](./advanced/custom-plugins.md)
