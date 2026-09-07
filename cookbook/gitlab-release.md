---
title: GitLab Release
description: A complete Moonlit pipeline that computes a version from conventional commits and publishes a GitLab release
---

# GitLab Release

A full pipeline that parses conventional commits, computes the next version and changelog, tags the release in Git, and publishes a GitLab release that comments on and labels the related merge requests and issues.

## Prerequisites

- A Git repository with an `origin` remote pointing at `gitlab.com` (or a self-hosted instance), using conventional commit messages
- A GitLab access token with permission to create releases and comment/label on merge requests and issues
- The `git`, `sr` (Semantic Release), and `gitlab` plugin references below

## `release.yml`

```yaml
name: "GitLab Release"

plugins:
  - name: git
    url: "oci://registry.moonlitbuild.dev/wolfware/git:1.0.0"
    permissions:
      exec: ["git"]

  - name: sr
    url: "oci://registry.moonlitbuild.dev/wolfware/semantic-release:1.0.0"

  - name: gitlab
    url: "oci://registry.moonlitbuild.dev/wolfware/gitlab:1.0.0"
    config:
      token: $(GITLAB_TOKEN)
    permissions:
      network: ["gitlab.com"]
      exec: ["git"]
      filesystem: read-write

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
      run: gitlab.related-items
      config:
        commits: $(output:commits:details)
    - name: release
      run: gitlab.create-release
      config:
        name: "v$(output:version:nextVersion)"
        tag: "v$(output:version:nextVersion)"
        changelog: $(output:changelog:categories)
        prerelease: $(output:version:isPrerelease)
        label: "released"
        mergeRequests: $(output:related:mrs)
        issues: $(output:related:issues)
    - name: exportVars
      run: gitlab.write-variables
      config:
        output:
          RELEASE_URL: $(output:release:url)
    - name: gitTag
      run: git.tag
      config:
        tagName: "v$(output:version:nextVersion)"
    - name: pushTag
      run: git.push
```

## Walkthrough

### Plugins

Three plugins: **Git** (repository context, tagging, pushing), **Semantic Release** (conventional-commit parsing, version calculation, changelog), and **GitLab** (related items, release creation, variable export). Git needs only `exec: ["git"]`. Semantic Release needs no `permissions:` block at all. GitLab needs `network: ["gitlab.com"]` for the REST API, `exec: ["git"]` because `related-items` and `create-release` resolve the project via `git remote get-url origin`, and `filesystem: read-write` because `write-variables` appends directly to a file in the working directory. See [Sandboxing](../guide/concepts/sandboxing.md) for the full permission model.

### Analyze stage

`git.repo-context`, `git.latest-tag`, and `git.commits` establish the current branch, the last release tag, and the commits since it. `sr.analyze` parses those commits, halting the pipeline when none match. `sr.calculate-version` computes the next version and halts cleanly when there's nothing to release. `sr.generate-changelog` groups the commits into categories.

### Release stage

`gitlab.related-items` looks up the merged merge requests (and the issues they close) among the analyzed commits, emitting `mrs`. `gitlab.create-release` creates the GitLab release tagged `v<nextVersion>`, applies the `released` label to every related merge request and issue, and comments on each. `gitlab.write-variables` appends `RELEASE_URL` to a `moonlit.env` file in the working directory. Hand that file to GitLab CI's `artifacts:reports:dotenv` to expose it to later jobs. `git.tag` and `git.push` record and push the Git tag.

GitLab uses `mrs` (merge requests) where GitHub uses `pullRequests`; each related item's `iid` also accepts `number`, so pipelines written against the GitHub plugin's `{number}` shape carry over unchanged. Against a self-hosted GitLab instance, set the `gitlab` plugin's `baseUrl` config and add its host to `network` alongside (or instead of) `gitlab.com`.

## Run it

```bash
export GITLAB_TOKEN=your_gitlab_token

moonlit run
```

- [GitLab Plugin](../plugins/gitlab.md)
- [Git Plugin](../plugins/git.md)
- [Semantic Release Plugin](../plugins/semantic-release.md)
- [Sandboxing](../guide/concepts/sandboxing.md)
- [Semantic-release → GitHub](./semantic-release-github.md)
