---
title: Cookbook
description: Practical, full pipeline recipes for common Moonlit release workflows
---

# Cookbook

Practical, end-to-end `release.yml` recipes for common release workflows. Each recipe is a complete pipeline you can adapt directly, with a walkthrough of what every stage and step does.

## Recipes

- [Docker Deployment](./docker-deployment.md): version, build a multi-platform image, push it to a registry, and deploy it to a remote host.
- [NuGet Release Pipeline](./nuget-release.md): test, version, build, pack, and publish a NuGet package to nuget.org, then tag the release.
- [Semantic-release to GitHub](./semantic-release-github.md): compute a version and changelog from conventional commits, then publish a GitHub release and notify Slack.
- [npm Release](./npm-release.md): test, version, build, and publish an npm package, then create a GitHub release.
- [GitLab Release](./gitlab-release.md): compute a version and changelog from conventional commits, then publish a GitLab release with merge-request and issue comments.
- [Publish a Plugin](./publish-plugin.md): scaffold, build, inspect, and publish a Moonlit plugin to an OCI registry.

## Contributing

Have a useful recipe to share? See the [contribution guidelines](../guide/advanced/contributing.md) for how to propose one.
