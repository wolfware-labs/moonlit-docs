---
title: GitLab Plugin
description: Documentation for the GitLab plugin in Moonlit
---

# GitLab Plugin

Releases, related merge requests/issues, and CI variable export via the GitLab REST API.

## Reference

```yaml
plugins:
  - name: gitlab
    url: "oci://registry.moonlitbuild.dev/wolfware/gitlab:1.0.0"
    config:
      token: $(GITLAB_TOKEN)
    permissions:
      network: ["gitlab.com"]
      exec: ["git"]
      filesystem: read-write
```

Moonlit is deny-by-default, so a plugin with no `permissions:` block gets zero capabilities. [Sandboxing](../guide/concepts/sandboxing.md) has the full model. This plugin calls the GitLab REST API, which needs `network: ["gitlab.com"]`, or the host of a self-hosted `baseUrl` as described below. The `related-items` and `create-release` middlewares resolve the project by shelling out to `git remote get-url origin`, which needs `exec: ["git"]`. And `write-variables` appends directly to a file in the working directory, which needs `filesystem: read-write`.

The plugin-level `token` is required, and a blank value fails plugin load with `GitLab token is not configured.` `baseUrl` defaults to `https://gitlab.com` and points the plugin at a self-hosted instance; when you set it, add its host to `network` in place of, or alongside, `gitlab.com`. The project path is derived once per run from the `origin` remote's URL and then cached. Nested groups work, so `group/subgroup/project` is fine, but a remote that does not match the configured host fails with `Not a valid GitLab URL.`

## related-items

Merged merge requests (matched against a commit set) and the issues they close.

| Config | Required / Default | Meaning |
|---|---|---|
| `commits` | Array, e.g. `$(output:commits:details)` | Commits to match merged MRs against, by merge commit SHA (also checked against the squash commit SHA for squash-merged MRs). |
| `includeMergeRequests` | Optional, default `true` (alias `includePullRequests` accepted) | Look up merge requests. |
| `includeIssues` | Optional, default `true` | Look up issues closed by a matched MR, via GitLab's `closes_issues` endpoint. |

An empty `commits` array skips the lookup entirely and succeeds. Both outputs are only emitted when non-empty.

| Output | Description |
|---|---|
| `mrs` | Array of `{ iid, title, description, state, createdAt, updatedAt, mergedAt, mergeCommitSha }`, newest first. |
| `prs` | Alias of `mrs`, the same array under a second name, for pipeline portability. |
| `issues` | Array of `{ iid, title, description, state, createdAt, updatedAt, closedAt, mergeRequestIid }`, newest first, deduplicated when multiple MRs close the same issue. |

## create-release

Create a GitLab release, then comment (and optionally label) on the related merge requests and issues.

| Config | Required / Default | Meaning |
|---|---|---|
| `name` | **Required** | Release name. |
| `tag` | **Required** | Release tag; created if it doesn't exist yet (`ref` = HEAD). |
| `body` | Optional | Release description. When blank, generated from `changelog`. |
| `changelog` | Array of categories, e.g. `$(output:changelog:categories)` | Used to render `body` when it is blank; fails if both `body` and `changelog` are empty. |
| `label` | Optional | Label applied to every entry in `mergeRequests`/`issues`. |
| `draft` | Optional, default `false` | GitLab has no draft-release concept, so a `true` value logs a warning and is ignored. |
| `prerelease` | Optional, default `false` | GitLab has no native prerelease flag, so this appends ` (pre-release)` to the release name instead. |
| `mergeRequests` | Optional, array of `{ iid }` (alias `pullRequests` accepted) | Merge requests to comment on (and label) after the release is created. |
| `issues` | Optional, array of `{ iid }` | Issues to comment on (and label) after the release is created. |

| Output | Description |
|---|---|
| `name` | The created release's name. |
| `url` | The created release's URL. |

Each item's `iid` may also be given as `number`, for portability with GitHub-shaped pipeline outputs.

A commenting or labeling failure on an individual item produces a warning and the run continues. It never fails the release step.

## write-variables

Append `key=value` pairs to a dotenv file in the working directory, for GitLab CI's `artifacts:reports:dotenv`.

| Config | Required / Default | Meaning |
|---|---|---|
| `output` | Map, default `{}` | Merged into the file. |
| `environment` | Map, default `{}` | Merged into the file; on a key collision with `output`, the `environment` value wins (with a warning). |
| `file` | Optional, default `moonlit.env` | Target file, appended to rather than truncated. It must be a relative path inside the working directory; an absolute path, or one containing `..`, fails. |

No outputs. Both maps empty (after merging) succeeds without writing. A key not matching `[A-Za-z_][A-Za-z0-9_]*` fails the step; values containing newlines/carriage returns are escaped to literal `\n`/`\r`, since GitLab's dotenv format is single-line.

## Example

```yaml
plugins:
  - name: gitlab
    url: "oci://registry.moonlitbuild.dev/wolfware/gitlab:1.0.0"
    config:
      token: $(GITLAB_TOKEN)
    permissions:
      network: ["gitlab.com"]
      exec: ["git"]
      filesystem: read-write

stages:
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
        mergeRequests: $(output:related:mrs)
        issues: $(output:related:issues)
    - name: exportVars
      run: gitlab.write-variables
      config:
        output:
          RELEASE_URL: $(output:release:url)
```
