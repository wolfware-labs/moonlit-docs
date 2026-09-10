---
title: Semantic-release to GitHub
description: A complete Moonlit pipeline that computes a version from conventional commits and publishes a GitHub release
---

# Semantic-release to GitHub

A full pipeline that parses conventional commits, computes the next version and changelog, tags the release in Git, publishes a GitHub release (commenting and labeling the related pull requests and issues), and posts a Slack notification.

## Prerequisites

- A Git repository with an `origin` remote pointing at `github.com`, using [conventional commit](https://www.conventionalcommits.org/) messages
- A GitHub personal access token (or a `GITHUB_TOKEN` from Actions) with permission to create releases and comment/label on pull requests and issues
- A Slack bot token with permission to post to the target channel
- The `git`, `sr` (Semantic Release), `gh` (GitHub), and `slack` plugin references below

## `release.yml`

```yaml
name: "Semantic Release to GitHub"

plugins:
  - name: git
    url: "oci://registry.moonlit.rs/wolfware/git:1.0.0"
    permissions:
      exec: ["git"]

  - name: sr
    url: "oci://registry.moonlit.rs/wolfware/semantic-release:1.0.0"

  - name: gh
    url: "oci://registry.moonlit.rs/wolfware/github:1.0.0"
    config:
      token: $(GITHUB_TOKEN)
    permissions:
      network: ["api.github.com", "*.github.com"]
      exec: ["git", "sh"]
      env: ["GITHUB_*"]

  - name: slack
    url: "oci://registry.moonlit.rs/wolfware/slack:1.0.0"
    config:
      token: $(SLACK_TOKEN)
    permissions:
      network: ["slack.com"]

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

  notify:
    - name: announce
      run: slack.send-notification
      config:
        channel: "#releases"
        message: "Released v$(output:version:nextVersion): $(output:release:url)"
```

## Walkthrough

### Plugins

Four plugins: **Git** (repository context, tagging, pushing), **Semantic Release** (conventional-commit parsing, version calculation, changelog), **GitHub** (related items, release creation), and **Slack** (notification). Git needs only `exec: ["git"]`. Semantic Release needs no `permissions:` block at all, since it works entirely from the commit data it is given. GitHub needs `network: ["api.github.com", "*.github.com"]` for the REST API, `exec: ["git", "sh"]` because every middleware resolves the owner/repository via `git remote get-url origin`, and `env: ["GITHUB_*"]`. Slack needs only `network: ["slack.com"]`. See [Sandboxing](../guide/concepts/sandboxing.md) for the full permission model.

### Analyze stage

`git.repo-context`, `git.latest-tag`, and `git.commits` establish the current branch, the last release tag, and the commits since it. `sr.analyze` parses those commits as conventional commits, halting the pipeline (via `haltIf`) when none match. `sr.calculate-version` computes the next version from the parsed commits and halts cleanly when there's nothing to release. `sr.generate-changelog` groups the same commits into categories for the release body.

### Release stage

`gh.related-items` looks up the merged pull requests (and the issues they close) among the analyzed commits. `gh.create-release` creates the GitHub release tagged `v<nextVersion>`, rendering its body from the changelog categories, then comments on every related pull request and issue. `git.tag` records the release as a Git tag and `git.push` pushes the branch and the new tag to `origin`.

### Notify stage

`slack.send-notification` posts the release URL to `#releases`.

## Run it

```bash
export GITHUB_TOKEN=your_github_token
export SLACK_TOKEN=your_slack_token

moonlit run
```

- [Git Plugin](../plugins/git.md)
- [Semantic Release Plugin](../plugins/semantic-release.md)
- [GitHub Plugin](../plugins/github.md)
- [Slack Plugin](../plugins/slack.md)
- [Sandboxing](../guide/concepts/sandboxing.md)
- [npm Release](./npm-release.md)
- [GitLab Release](./gitlab-release.md)
