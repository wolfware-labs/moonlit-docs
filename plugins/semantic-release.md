---
title: Semantic Release Plugin
description: Documentation for the Semantic Release plugin in Moonlit
---

# Semantic Release Plugin

Conventional-commit parsing, semantic version calculation, and changelog generation. Pure computation with no network access, unless you opt into AI-assisted changelog refinement.

## Reference

```yaml
plugins:
  - name: sr
    url: "oci://registry.moonlit.rs/wolfware/semantic-release:1.0.0"
```

The Semantic Release plugin does all of its work offline against the commit data it's given, so it needs no `permissions:` block at all; see [Sandboxing](../guide/concepts/sandboxing.md) for the deny-by-default model this relies on. The one exception is the optional [AI refinement](#ai-assisted-changelog-refinement), which needs a `network` grant for the chosen provider's host.

Commits are parsed against `type(scope)!: subject`, applied to the first non-empty line of the message. A message that doesn't match gets type `unknown`, with that line as its summary. The type is lowercased; the scope is kept as written. A commit is breaking when it has the `!` marker, or its message contains a `BREAKING CHANGE:` or `BREAKING-CHANGE:` footer (case-insensitive). Each parsed commit carries `sha` (shortened to 7 characters), `summary`, `type`, `scope`, `body`, `isBreakingChange`, `rawMessage`, and `date`.

## analyze

Parse raw commits (as produced by `git.commits`) into conventional commits, applying scope filters. The parsed list is also stored in the plugin's shared state, so `calculate-version` and `generate-changelog` can use it without being passed `commits` again.

| Config | Required / Default | Meaning |
|---|---|---|
| `commits` | Array, e.g. `$(output:commits:details)` | Raw commits to parse. Only `sha`, `date`, and `message` participate. |
| `includeScopes` | Optional array | If non-empty, only scoped commits whose scope is in this list are kept. Takes precedence over `excludeScopes`. Scope comparison is case-sensitive. |
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
| `baseVersion` | Optional | The version to bump from. Absent or blank means "first release". Must be valid semver. |
| `branch` | Optional, default `""` | Matched against `prereleaseMappings` to pick a prerelease label. |
| `commits` | Optional, e.g. `$(output:conventionalCommits:commits)` | Parsed conventional commits. Falls back to the commits stored by a prior `analyze` step in this run. An empty set fails with `No commits provided for version calculation.` |
| `prereleaseMappings` | Map of branch to label | Keys may be exact branch names or globs (e.g. `feature/*`); an exact match wins over a glob, and when multiple globs match, the alphabetically-first glob key wins. An empty label maps to the stable channel. |
| `conventionalCommitRules` | Optional | Overrides the default type-to-bump rules; see below. |

Pass this middleware the **parsed** commits from `analyze`, not the raw `git.commits` output. Raw commits carry no type, so no bump rule matches them and the step reports `hasNewVersion: false`.

Default bump rules: `feat` bumps minor; `fix`, `perf`, and `revert` bump patch; everything else is no bump. A breaking commit always bumps major regardless of type. The highest bump across the commit set wins. No commit implying a bump leaves the version unchanged.

`conventionalCommitRules` has the shape `{ breakingChangesAlwaysMajor: bool, rules: [{ type, scope, release }] }`. Each rule matches on `type` (case-insensitive; omitted matches any) and optionally `scope`, and `release` is one of `None`, `Patch`, `Minor`, or `Major` (case-sensitive). The first matching rule wins. Omitting `rules` keeps the full default set.

Prerelease handling: on a branch mapped to a label (say `beta`), a first release becomes `1.0.0-beta.1`; a later bump from `1.2.0-beta.1` with a bump no larger than the base version's own level (patch-level bump on a patch-level base, and so on) increments the iteration to `1.2.0-beta.2`, while a larger bump starts a new prerelease line at `.1`. On the stable channel, a prerelease base is promoted to its stable version without a further bump.

| Output | Description |
|---|---|
| `hasNewVersion` | Always present; `false` when no commit implies a version bump. |
| `nextVersion` | Present when `hasNewVersion` is `true`. The version without build metadata. |
| `nextFullVersion` | Present when `hasNewVersion` is `true`. `nextVersion` plus `+sha-<7-char sha>` build metadata from the newest commit by date. |
| `isPrerelease` | Present when `hasNewVersion` is `true`. |

## generate-changelog

Group parsed commits into changelog categories.

| Config | Required / Default | Meaning |
|---|---|---|
| `commits` | Optional, e.g. `$(output:conventionalCommits:commits)` | Falls back to the commits produced by a prior `analyze` step in this run. |
| `changelogRules` | Optional | Overrides the default category rules; see below. |
| `filterNonUserFacingCommits` | Optional, default `false` | Ask an AI model to drop commits that aren't user-facing before grouping. Requires the plugin-level `ai` config; see below. |
| `refineCommitsSummary` | Optional, default `false` | Ask an AI model to rewrite each commit summary into a release-note line. Requires the plugin-level `ai` config. |

| Output | Description |
|---|---|
| `categories` | Array of `{ name, icon, summary, entries: [{ sha, description }] }`, one entry per matching category, in rule order, empty categories omitted. A commit description is `**{scope}**: {summary}` when scoped, else just `{summary}`. |

When there are no commits to summarize, the step succeeds with a warning and emits no `categories` output.

Default categories, in output order: Features (`:sparkles:`), Bug Fixes (`:bug:`), Performance Improvements (`:zap:`), Code Refactoring (`:art:`), Code Style Changes (`:lipstick:`), Tests (`:white_check_mark:`), Chores (`:wrench:`), Documentation (`:book:`), Build System (`:construction_worker:`), Continuous Integration (`:green_heart:`), Reverts (`:rewind:`), Breaking Changes (`:boom:`), Other Changes (`:package:`). A breaking commit lands only in Breaking Changes, never in its type's own category.

`changelogRules` has the shape `{ rules: [{ type, isBreakingChange, icon, section, summary }] }`, replacing the default list. `icon`, `section`, and `summary` are required on every rule; a rule with `isBreakingChange: true` collects breaking commits.

The `categories` array is exactly what `github.create-release` and `gitlab.create-release` accept as their `changelog` input.

## AI-Assisted Changelog Refinement

`generate-changelog` can hand the commit list to a language model before grouping it, to drop commits that aren't user-facing and to rewrite terse subjects into readable release-note lines. Both are off by default; the plugin stays fully offline until you enable them. Turn them on with the step flags `filterNonUserFacingCommits` and/or `refineCommitsSummary`, and provide an `ai` block in the plugin's `config`. Enabling either flag without the `ai` block fails the step.

| `ai` key | Required / Default | Meaning |
|---|---|---|
| `provider` | Optional, default `openai` | One of `openai`, `anthropic`, `gemini`. |
| `apiKey` | **Required** | The provider API key. A blank value fails plugin load with `The 'ai' config block requires a non-empty apiKey.` Use `$(...)` substitution; the value is read at plugin load, so no `env` grant is needed. |
| `model` | Optional, per provider | Defaults: `gpt-5-mini` for OpenAI, `claude-haiku-4-5` for Anthropic, `gemini-2.5-flash` for Gemini. |
| `baseUrl` | Optional, provider default | Override the API host, for a proxy or an OpenAI-compatible gateway. Its host must also be in the `network` grant. |
| `maxRetries` | Optional, default `5` | Retry attempts for rate-limit and transport failures, with exponential backoff (honoring `Retry-After`, capped at 60 seconds). |
| `maxTokens` | Optional, default `4096` | Maximum output tokens. Used by Anthropic only; ignored by OpenAI and Gemini. |

The plugin reaches exactly one host, so grant only that provider's host (plus any custom `baseUrl` host):

| Provider | Host to grant |
|---|---|
| `openai` | `api.openai.com` |
| `anthropic` | `api.anthropic.com` |
| `gemini` | `generativelanguage.googleapis.com` |

Commits are processed in sequential batches of 15. Authentication failures, malformed responses, and exhausted retries fail the step; the model is never allowed to silently degrade the changelog. The API key travels only in the provider's auth header, never in a URL or a log line.

```yaml
plugins:
  - name: sr
    url: "oci://registry.moonlit.rs/wolfware/semantic-release:1.0.0"
    config:
      ai:
        provider: anthropic
        apiKey: $(ANTHROPIC_API_KEY)
    permissions:
      network: ["api.anthropic.com"]

stages:
  release:
    - name: changelog
      run: sr.generate-changelog
      config:
        filterNonUserFacingCommits: true
        refineCommitsSummary: true
```

## Example

```yaml
plugins:
  - name: sr
    url: "oci://registry.moonlit.rs/wolfware/semantic-release:1.0.0"

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

The `analyze` step stores its parsed commits for the two that follow, so neither needs a `commits` entry.
