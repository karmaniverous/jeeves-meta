---
title: Plugin Setup
---

# Plugin Setup

## Installation

Install the plugin package:

```bash
npm install @karmaniverous/jeeves-meta-openclaw
```

Run the CLI installer to register with the OpenClaw gateway:

```bash
npx @karmaniverous/jeeves-meta-openclaw install
```

Then restart the OpenClaw gateway to load the plugin.

## Configuration

The plugin reads its config path from the `configPath` setting in `openclaw.json`. This points to a `jeeves-meta.config.json` file:

```json
{
  "watchPaths": ["j:/domains"],
  "watcherUrl": "http://localhost:1936",
  "gatewayUrl": "http://127.0.0.1:3000",
  "defaultArchitect": "@file:jeeves-meta/prompts/architect.md",
  "defaultCritic": "@file:jeeves-meta/prompts/critic.md",
  "depthWeight": 0.5,
  "skipUnchanged": true,
  "batchSize": 1,
  "maxArchive": 20
}
```

See the [Configuration Guide](../../lib/guides/configuration.md) for the complete schema.

### @file: Resolution

Prompt values prefixed with `@file:` are resolved **relative to the config file's directory**. The config loader reads the referenced file and replaces the `@file:` value with its contents.

For example, if the config is at `/config/jeeves-meta.config.json`:
- `@file:jeeves-meta/prompts/architect.md` resolves to `/config/jeeves-meta/prompts/architect.md`

## Lifecycle

At gateway startup, the plugin:

1. Loads config via `loadSynthConfig()` (re-exported from the core library)
2. Registers four tools (`synth_list`, `synth_detail`, `synth_trigger`, `synth_preview`)
3. Registers three virtual inference rules with jeeves-watcher (fire-and-forget)
4. Writes the dynamic TOOLS.md section with entity stats

The plugin uses lazy config loading — the config file is read once on first tool invocation, not at startup.
