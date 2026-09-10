---
title: Slack Plugin
description: Documentation for the Slack plugin in Moonlit
---

# Slack Plugin

Post messages to a Slack channel via the Slack Web API.

## Reference

```yaml
plugins:
  - name: slack
    url: "oci://registry.moonlit.rs/wolfware/slack:1.0.0"
    config:
      token: $(SLACK_TOKEN)
    permissions:
      network: ["slack.com"]
```

Moonlit is deny-by-default, so a plugin with no `permissions:` block gets zero capabilities. [Sandboxing](../guide/concepts/sandboxing.md) has the full model. The Slack plugin calls the Slack Web API, so it needs `network: ["slack.com"]`.

The plugin-level `token` is required, and a blank value fails plugin load with `Slack API token is required.`

## send-notification

Post a plain-text message to a Slack channel via `chat.postMessage`.

| Config | Required / Default | Meaning |
|---|---|---|
| `channel` | **Required** | The Slack channel to post to. A blank value fails with `No Slack channel provided for notification.` |
| `message` | **Required** | The message text. A blank value fails with `No message provided for Slack notification.` |

No outputs. A Slack API response with `ok: false` fails the step with Slack's error code.

## Example

```yaml
plugins:
  - name: slack
    url: "oci://registry.moonlit.rs/wolfware/slack:1.0.0"
    config:
      token: $(SLACK_TOKEN)
    permissions:
      network: ["slack.com"]

stages:
  notify:
    - name: announce
      run: slack.send-notification
      config:
        channel: "#releases"
        message: "Released v$(output:version:nextVersion)"
```
