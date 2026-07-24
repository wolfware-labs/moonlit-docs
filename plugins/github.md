---
title: GitHub Plugin
description: Documentation for the GitHub plugin in Moonlit
---

# GitHub Plugin

The GitHub plugin provides integration with GitHub. It allows you to retrieve information from GitHub repositories, create releases, and work with issues and pull requests.

## Installation

To use the GitHub plugin in your Moonlit pipeline, add it to the `plugins` section of your configuration file:

```yaml
plugins:
  - name: "gh"
    url: "nuget://nuget.org/Wolfware.Moonlit.Plugins.Github/1.0.0-next.6"
    config:
      token: $(GITHUB_TOKEN)
```

Note that the GitHub plugin requires a GitHub token to authenticate with the GitHub API. You can set this token as an environment variable and reference it in your configuration file.

## Middlewares

The GitHub plugin provides the following middlewares:

### latest-tag (moved to Git plugin)

Note: The latest-tag middleware is provided by the Git plugin. Use git.latest-tag to retrieve the latest tag. It can be filtered to only include tags with a specific prefix.

#### Example

```yaml
stages:
  analyze:
    - name: tag
      run: git.latest-tag
      config:
        prefix: "v"
```

### related-items

The `related-items` middleware finds GitHub pull requests and issues related to a list of commits (e.g., commits since the last tag).

#### Inputs

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| commits | array | Yes | - | Array of commit details (e.g., $(output:commits:details) from git.commits) |

#### Outputs

| Name | Type | Description |
|------|------|-------------|
| pullRequests | array | Pull requests related to the provided commits |
| issues | array | Issues related to the provided commits |

#### Example

```yaml
stages:
  analyze:
    - name: tag
      run: git.latest-tag
      config:
        prefix: "v"
    - name: commits
      run: git.commits
    - name: ghItems
      run: gh.related-items
      config:
        commits: $(output:commits:details)
    - name: nextStep
      run: some.other-middleware
      config:
        commits: $(output:commits:details)
        pullRequests: $(output:ghItems:pullRequests)
        issues: $(output:ghItems:issues)
```

### create-release

The `create-release` middleware creates a GitHub release.

#### Inputs

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| name | string | Yes | - | The name of the release |
| tag | string | Yes | - | The tag to create the release from |
| label | string | No | - | A label for the release |
| changelog | string | No | - | The changelog for the release |
| prerelease | boolean | No | false | Whether the release is a prerelease |
| pullRequests | array | No | - | Pull requests to include in the release |
| issues | array | No | - | Issues to include in the release |

#### Outputs

| Name | Type | Description |
|------|------|-------------|
| url | string | The URL of the created release |
| name | string | The name of the created release |

#### Example

```yaml
stages:
  release:
    - name: createRelease
      run: gh.create-release
      config:
        name: "Release $(output:version:nextVersion)"
        tag: $(output:version:nextVersion)
        label: "released on @$(output:repo:branch)"
        changelog: $(output:changelog:entries)
        prerelease: $(output:version:isPrerelease)
        pullRequests: $(output:items:pullRequests)
        issues: $(output:items:issues)
    - name: nextStep
      run: some.other-middleware
      config:
        releaseUrl: $(output:createRelease:url)
        releaseName: $(output:createRelease:name)
```

### write-variables

The `write-variables` middleware allows you to set output and environment variables in your GitHub workflow.

#### Inputs

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| output | dictionary | No | {} | A dictionary of output variables to set |
| environment | dictionary | No | {} | A dictionary of environment variables to set |

#### Outputs

This middleware does not produce any outputs.

| Name | Type | Description |
|------|------|-------------|
| *None* | | |

#### Example

```yaml
stages:
  setup:
    - name: setVariables
      run: gh.write-variables
      config:
        output:
          REPO_NAME: "my-repo"
          VERSION: "1.0.0"
        environment:
          GITHUB_ENV: "production"
          DEPLOY_TARGET: "main"
```

## Usage in Pipelines

The GitHub plugin is commonly used in release pipelines to:

1. Get information about the latest tag (using `git.latest-tag`)
2. Gather related pull requests and issues for commits since the last tag (using `git.commits` + `gh.related-items`)
3. Create a new release with a changelog and links to pull requests and issues (using `gh.create-release`)

For a complete example of using the GitHub plugin in a pipeline, see the [NuGet Release Pipeline](./examples/nuget-release.md) example.

## Next Steps

- Learn about the [Git Plugin](./git.md) for Git repository operations
- Explore the [Semantic Release Plugin](./semantic-release.md) for semantic versioning
- See the [Configuration](../guide/concepts/configuration.md) page for more information about configuring plugins
