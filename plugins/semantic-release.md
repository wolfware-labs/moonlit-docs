---
title: Semantic Release Plugin
description: Documentation for the Semantic Release plugin in Moonlit
---

# Semantic Release Plugin

Conventional-commit parsing, semantic version calculation, and changelog generation — pure computation, no network access.

## Reference

```yaml
plugins:
  - name: sr
    url: "oci://registry.moonlitbuild.dev/wolfware/semantic-release:1.0.0"
```

The Semantic Release plugin does all of its work offline against the commit data it's given, so it needs no `permissions:` block at all — see [Sandboxing](../guide/concepts/sandboxing.md) for the deny-by-default model this relies on.

Commits are parsed against `type(scope)!: subject`. A message that doesn't match gets type `unknown`, with the first line as its summary. A commit is breaking when it has the `!` marker, or its message contains a `BREAKING CHANGE:`/`BREAKING-CHANGE:` footer (case-insensitive).

## analyze

Parse raw commits (as produced by `git.commits`) into conventional commits, applying scope filters.

| Config | Required / Default | Meaning |
|---|---|---|
| `commits` | Array, e.g. `$(output:commits:details)` | Raw commits to parse. |
| `includeScopes` | Optional array | If non-empty, only scoped commits whose scope is in this list are kept. Takes precedence over `excludeScopes`. |
| `excludeScopes` | Optional array | If non-empty (and `includeScopes` isn't set), scoped commits whose scope is in this list are dropped. |
| `includeUnscoped` | Optional, default `true` | Whether commits with no scope are kept. |

| Output | Description |
|---|---|
| `commits` | The parsed conventional commits that survived filtering. |
| `commitCount` | Number of commits in `commits`. |

## calculate-version

Compute the next semantic version from a base version, the commit set, and a branch's prerelease mapping.

| Config | Required / Default | Meaning |
|---|---|---|
| `initialVersion` | Optional, default `1.0.0` | Version emitted when `baseVersion` is absent (first release). |
| `baseVersion` | Optional | The version to bump from. Absent means "first release". |
| `branch` | Optional, default `""` | Matched against `prereleaseMappings` to pick a prerelease label. |
| `commits` | Optional, e.g. `$(output:conventionalCommits:commits)` | Falls back to the commits produced by a prior `analyze` step in this run. |
| `prereleaseMappings` | Map of branch → label | Keys may be exact branch names or globs (e.g. `feature/*`); an exact match wins over a glob, and when multiple globs match, the alphabetically-first glob key wins. An empty label maps to the stable channel. |
| `conventionalCommitRules` | Optional | Overrides the default type-to-bump-level rules. |

Default bump rules: `feat` → minor, `fix`/`perf`/`revert` → patch, everything else → no bump; a breaking commit always bumps major regardless of type. No commit implying a bump leaves the version unchanged.

| Output | Description |
|---|---|
| `hasNewVersion` | Always present — `false` when no commit implies a version bump. |
| `nextVersion` | Present when `hasNewVersion` is `true`. The version without build metadata. |
| `nextFullVersion` | Present when `hasNewVersion` is `true`. `nextVersion` plus prerelease and `+sha-<7-char sha>` build metadata of the newest commit. |
| `isPrerelease` | Present when `hasNewVersion` is `true`. |

## generate-changelog

Group parsed commits into changelog categories.

| Config | Required / Default | Meaning |
|---|---|---|
| `commits` | Optional, e.g. `$(output:conventionalCommits:commits)` | Falls back to the commits produced by a prior `analyze` step in this run. |
| `changelogRules` | Optional | Overrides the default category rules. |
| `filterNonUserFacingCommits` | Optional, default `false` | Reserved for a future AI-assisted refinement mode; must stay `false` in this build — setting it `true` fails the step. |
| `refineCommitsSummary` | Optional, default `false` | Same as above; must stay `false`. |

| Output | Description |
|---|---|
| `categories` | Array of `{ name, icon, summary, entries: [{ sha, description }] }`, one entry per matching category, empty categories omitted. A commit description is `**{scope}**: {summary}` when scoped, else just `{summary}`. |

Default categories, in output order: Features (`:sparkles:`), Bug Fixes (`:bug:`), Performance Improvements (`:zap:`), Code Refactoring (`:art:`), Code Style Changes (`:lipstick:`), Tests (`:white_check_mark:`), Chores (`:wrench:`), Documentation (`:book:`), Build System (`:construction_worker:`), Continuous Integration (`:green_heart:`), Reverts (`:rewind:`), Breaking Changes (`:boom:`), Other Changes (`:package:`). A breaking commit lands only in Breaking Changes, never in its type's own category.

## Example

```yaml
plugins:
  - name: sr
    url: "oci://registry.moonlitbuild.dev/wolfware/semantic-release:1.0.0"

stages:
  analyze:
    - name: conventionalCommits
      run: sr.analyze
      config:
        commits: $(output:commits:details)
    - name: version
      run: sr.calculate-version
      config:
        branch: $(output:repo:branch)
        baseVersion: $(output:tag:name)
        prereleaseMappings:
          develop: beta
    - name: changelog
      run: sr.generate-changelog
```
