---
title: GitHub Plugin
description: Documentation for the GitHub plugin in Moonlit
---

# GitHub Plugin

Releases, related pull requests and issues, and CI variable export via the GitHub REST API.

## Reference

```yaml
plugins:
  - name: gh
    url: "oci://registry.moonlit.rs/wolfware/github:1.0.0"
    config:
      token: $(GITHUB_TOKEN)
    permissions:
      network: ["api.github.com", "*.github.com"]
      exec: ["git", "sh"]
      env: ["GITHUB_*"]
```

Moonlit is deny-by-default, so a plugin with no `permissions:` block gets zero capabilities. [Sandboxing](../guide/concepts/sandboxing.md) has the full model. The GitHub plugin calls the REST API, so it needs `network: ["api.github.com", "*.github.com"]`; every middleware resolves the owner/repository by shelling out to `git remote get-url origin`, and `write-variables` shells out to `sh` to append to the GitHub Actions output files, so the plugin needs `exec: ["git", "sh"]`. `write-variables` also reads the `$GITHUB_OUTPUT` and `$GITHUB_ENV` paths from the environment, which needs `env: ["GITHUB_*"]`.

The plugin-level `token` is required, and a blank value fails plugin load with `GitHub token is not configured.` The owner and repository are derived once per run from the `origin` remote's URL and then cached. A remote that does not point at `github.com` fails with `Not a valid GitHub URL.`

## related-items

Merged pull requests (matched against a commit set) and the issues they reference.

| Config | Required / Default | Meaning |
|---|---|---|
| `commits` | Array, e.g. `$(output:commits:details)` | Commits to match merged PRs against, by merge commit SHA. |
| `includePullRequests` | Optional, default `true` | Look up pull requests. |
| `includeIssues` | Optional, default `true` | Look up issues referenced by a matched PR's description (closing keywords such as `Fixes #42`, `Closes #7`). |

An empty `commits` array skips the lookup entirely and succeeds. Both outputs are only emitted when non-empty.

| Output | Description |
|---|---|
| `prs` | Array of `{ number, title, body, state, createdAt, updatedAt, mergedAt, mergeCommitSha }`, newest first. |
| `pullRequests` | Alias of `prs`, the same array under a second name, for pipeline portability. |
| `issues` | Array of `{ number, title, body, state, createdAt, updatedAt, closedAt, pullRequestNumber }`, newest first. |

## create-release

Create a GitHub release, then comment (and optionally label) on the related pull requests and issues.

| Config | Required / Default | Meaning |
|---|---|---|
| `name` | **Required** | Release name. |
| `tag` | **Required** | Release tag. |
| `body` | Optional | Release body. When blank, generated from `changelog`. |
| `changelog` | Array of categories, e.g. `$(output:changelog:categories)` | Used to render `body` when it is blank; fails if both `body` and `changelog` are empty. |
| `label` | Optional | Label applied to every entry in `pullRequests`/`issues`. |
| `draft` | Optional, default `false` | Create as a draft release. |
| `prerelease` | Optional, default `false` | Mark the release as a prerelease. |
| `pullRequests` | Optional, array of `{ number }` | Pull requests to comment on (and label) after the release is created. |
| `issues` | Optional, array of `{ number }` | Issues to comment on (and label) after the release is created. |

| Output | Description |
|---|---|
| `name` | The created release's name. |
| `url` | The created release's HTML URL. |

## write-variables

Append `key=value` pairs to the GitHub Actions output/environment files.

| Config | Required / Default | Meaning |
|---|---|---|
| `output` | Map, default `{}` | Appended to the file at `$GITHUB_OUTPUT`. |
| `environment` | Map, default `{}` | Appended to the file at `$GITHUB_ENV`. |

No outputs. A non-empty map whose corresponding environment variable isn't set fails with `GITHUB_OUTPUT is not set.` / `GITHUB_ENV is not set.` Values containing newlines are written using the `key<<EOF` heredoc form GitHub requires for multiline values; a value containing a line that is exactly `EOF` is refused, since it would close the heredoc early.

## Example

```yaml
plugins:
  - name: gh
    url: "oci://registry.moonlit.rs/wolfware/github:1.0.0"
    config:
      token: $(GITHUB_TOKEN)
    permissions:
      network: ["api.github.com", "*.github.com"]
      exec: ["git", "sh"]
      env: ["GITHUB_*"]

stages:
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
```
