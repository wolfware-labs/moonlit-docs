---
title: npm Release
description: A complete Moonlit pipeline that tests, builds, and publishes an npm package, then creates a GitHub release
---

# npm Release

A full pipeline that installs and tests a Node.js project, computes the next version from conventional commits, builds and packs the package, publishes it to an npm registry, and creates a GitHub release.

## Prerequisites

- A Node.js project with a `package.json`, `test` script, and `build` script
- A Git repository with an `origin` remote pointing at `github.com`, using conventional commit messages
- An npm access token with publish permission on the target package
- A GitHub token with permission to create releases
- The `git`, `sr` (Semantic Release), `nodejs`, and `gh` (GitHub) plugin references below

## `release.yml`

```yaml
name: "npm Package Release"

plugins:
  - name: git
    url: "oci://registry.moonlitbuild.dev/wolfware/git:1.0.0"
    permissions:
      exec: ["git"]

  - name: sr
    url: "oci://registry.moonlitbuild.dev/wolfware/semantic-release:1.0.0"

  - name: nodejs
    url: "oci://registry.moonlitbuild.dev/wolfware/nodejs:1.0.0"
    config:
      token: $(NPM_TOKEN)
    permissions:
      exec: ["npm"]
      filesystem: read-write

  - name: gh
    url: "oci://registry.moonlitbuild.dev/wolfware/github:1.0.0"
    config:
      token: $(GITHUB_TOKEN)
    permissions:
      network: ["api.github.com", "*.github.com"]
      exec: ["git", "sh"]
      env: ["GITHUB_*"]

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
        commits: $(output:conventionalCommits:commits)
    - name: changelog
      run: sr.generate-changelog
      config:
        commits: $(output:conventionalCommits:commits)

  build:
    - name: install
      run: nodejs.install
    - name: test
      run: nodejs.test
    - name: build
      run: nodejs.build
      config:
        version: $(output:version:nextVersion)

  publish:
    - name: pack
      run: nodejs.pack
      config:
        version: $(output:version:nextVersion)
    - name: push
      run: nodejs.push
      config:
        package: $(output:pack:packagePath)
        access: "public"

  release:
    - name: related
      run: gh.related-items
      config:
        commits: $(output:commits:details)
    - name: release
      run: gh.create-release
      config:
        name: "v$(output:version:nextVersion)"
        tag: "v$(output:version:nextVersion)"
        changelog: $(output:changelog:categories)
        prerelease: $(output:version:isPrerelease)
        pullRequests: $(output:related:pullRequests)
        issues: $(output:related:issues)
    - name: gitTag
      run: git.tag
      config:
        tagName: "v$(output:version:nextVersion)"
    - name: pushTag
      run: git.push
```

## Walkthrough

### Plugins

Four plugins: **Git** (repository context, tagging, pushing), **Semantic Release** (conventional-commit parsing, version calculation, changelog), **NodeJs** (install, test, build, pack, push), and **GitHub** (related items, release creation). Git needs only `exec: ["git"]`. Semantic Release needs no `permissions:` block at all. NodeJs needs `exec: ["npm"]` plus `filesystem: read-write`, since `pack` writes a tarball and `push` writes a scoped `.npmrc` under the working directory. GitHub needs `network: ["api.github.com", "*.github.com"]`, `exec: ["git", "sh"]`, and `env: ["GITHUB_*"]`. See [Sandboxing](../guide/concepts/sandboxing.md) for the full permission model.

### Analyze stage

`git.repo-context`, `git.latest-tag`, and `git.commits` establish the current branch, the last release tag, and the commits since it. `sr.analyze` parses those commits, halting the pipeline when none match. `sr.calculate-version` computes the next version and halts cleanly when there's nothing to release. `sr.generate-changelog` groups the commits into categories.

### Build stage

`nodejs.install` runs `npm ci` (or `npm install`, depending on lockfile detection). `nodejs.test` runs the `test` script, failing the step — and stopping the pipeline before anything is published — on a non-zero exit. `nodejs.build` bumps the version with `npm version` and then runs the `build` script.

### Publish stage

`nodejs.pack` bumps the version again (idempotently, `--allow-same-version`) and packs the package into a `.tgz`, emitting `packagePath`. `nodejs.push` publishes that tarball with `npm publish`, using the plugin-level `NPM_TOKEN` written to a scoped, owner-only `.npmrc` that's removed again after the run.

**npm semver has no build-metadata segment**, so this pipeline uses `nextVersion` everywhere — for `nodejs.build`, `nodejs.pack`, the Git tag, and the GitHub release tag — never `nextFullVersion`.

### Release stage

`gh.related-items` looks up the merged pull requests and issues among the analyzed commits. `gh.create-release` creates the GitHub release tagged `v<nextVersion>` and comments on the related items. `git.tag` and `git.push` record and push the Git tag.

## Run it

```bash
export NPM_TOKEN=your_npm_token
export GITHUB_TOKEN=your_github_token

moonlit run
```

- [NodeJs Plugin](../plugins/nodejs.md)
- [Git Plugin](../plugins/git.md)
- [Semantic Release Plugin](../plugins/semantic-release.md)
- [GitHub Plugin](../plugins/github.md)
- [Sandboxing](../guide/concepts/sandboxing.md)
- [Semantic-release → GitHub](./semantic-release-github.md)
