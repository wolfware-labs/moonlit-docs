---
title: Git Plugin
description: Documentation for the Git plugin in Moonlit
---

# Git Plugin

Repository context, tag discovery, commit history, tagging, and pushing, driven by the `git` CLI.

## Reference

```yaml
plugins:
  - name: git
    url: "oci://registry.moonlitbuild.dev/wolfware/git:1.0.0"
    permissions:
      exec: ["git"]
```

Moonlit is deny-by-default: a plugin with no `permissions:` block gets zero capabilities. The Git plugin shells out to the `git` binary, so it needs the `exec: ["git"]` grant — see [Sandboxing](../guide/concepts/sandboxing.md) for the full permission model.

Every middleware discovers the repository by walking up from the working directory until it finds a `.git` directory; if none exists, the step fails with `Not a git repository (or any of the parent directories)`.

## repo-context

Current branch and the `origin` remote URL.

No config.

| Output | Description |
|---|---|
| `branch` | The current branch name. |
| `remoteUrl` | The `origin` remote's URL. Fails with `Remote 'origin' not found.` when there is no `origin` remote. |

## latest-tag

The newest tag matching a pattern; stores its commit SHA for `commits` to use as a boundary.

| Config | Required / Default | Meaning |
|---|---|---|
| `prefix` | Optional, default `""` | Prefix stripped from (and required on) matching tag names. |
| `suffix` | Optional, default `""` | Suffix stripped from (and required on) matching tag names. |
| `pattern` | Optional, default `[0-9]+.[0-9]+.[0-9]+.*` | The core pattern matched between `prefix` and `suffix`, case-insensitively. |

Tags are ordered by tagged-commit date, newest first. When no tag matches, the step succeeds with a warning and produces no outputs.

| Output | Description |
|---|---|
| `name` | The matched tag name with `prefix`/`suffix` stripped. |
| `fullName` | The matched tag's full ref name. |
| `commitSha` | The commit the tag points at (the peeled commit for annotated tags). |

## commits

Commits in a range, newest first, with the boundary commit excluded.

| Config | Required / Default | Meaning |
|---|---|---|
| `sinceSha` | Optional | Exact commit SHA to use as the range boundary. Takes precedence over `since`. |
| `since` | Optional | A ref, tag, or SHA resolved to a commit and used as the boundary. |
| `until` | Optional, default `HEAD` | End of the range. |
| `useSharedContext` | Optional, default `true` | When no `sinceSha`/`since` is given, fall back to the commit SHA stored by a prior `latest-tag` step in this run. |

Boundary resolution precedence: `sinceSha` → `since` (resolved) → the shared `latest-tag` SHA → no boundary (the full history up to `until`).

| Output | Description |
|---|---|
| `details` | Array of `{ sha, author, email, date, message }`, newest first. |
| `count` | Number of commits in `details`. |

## tag

Create a tag, idempotently.

| Config | Required / Default | Meaning |
|---|---|---|
| `tagName` | **Required** | The tag to create. A blank value fails with `Tag name cannot be empty.` |
| `message` | Optional | When set, creates an annotated tag with this message; otherwise a lightweight tag. |

No outputs. An already-existing tag succeeds with a warning instead of failing.

## push

Push the current branch, and optionally tags, to a remote.

| Config | Required / Default | Meaning |
|---|---|---|
| `remote` | Optional, default `origin` | The remote to push to. Missing → failure. |
| `pushTags` | Optional, default `true` | Also run `git push <remote> --tags`. |

No outputs. A branch with no configured upstream succeeds with a warning. Authentication failures fail with a hint to check SSH agent or HTTPS credentials.

## Example

```yaml
plugins:
  - name: git
    url: "oci://registry.moonlitbuild.dev/wolfware/git:1.0.0"
    permissions:
      exec: ["git"]

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

  release:
    - name: createTag
      run: git.tag
      config:
        tagName: "v$(output:version:nextVersion)"
    - name: push
      run: git.push
```
