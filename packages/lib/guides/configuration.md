---
title: Configuration
---

# Configuration

## Config Schema

The `synthConfigSchema` (Zod) defines all configuration options:

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `watchPaths` | `string[]` | required | Filesystem paths to scan for `.meta/` directories |
| `watcherUrl` | `string` (URL) | required | jeeves-watcher HTTP endpoint |
| `defaultArchitect` | `string` | required | Default architect prompt text (or `@file:` ref) |
| `defaultCritic` | `string` | required | Default critic prompt text (or `@file:` ref) |
| `gatewayUrl` | `string` (URL) | `http://127.0.0.1:3000` | OpenClaw gateway URL for subprocess spawning |
| `gatewayApiKey` | `string` | `undefined` | Optional API key for gateway authentication |
| `architectEvery` | `number` | `10` | Re-run architect every N synthesis cycles |
| `depthWeight` | `number` | `0.5` | Exponent for depth weighting in staleness formula |
| `maxArchive` | `number` | `20` | Maximum archive snapshots to retain per meta |
| `maxLines` | `number` | `500` | Maximum lines of context in subprocess prompts |
| `architectTimeout` | `number` | `120` | Architect step timeout (seconds, min 30) |
| `builderTimeout` | `number` | `600` | Builder step timeout (seconds, min 60) |
| `criticTimeout` | `number` | `300` | Critic step timeout (seconds, min 30) |
| `skipUnchanged` | `boolean` | `true` | Skip metas with no source changes since last synthesis |
| `batchSize` | `number` | `1` | Metas to synthesize per invocation |

## Config Resolution

The config path is resolved in order:

1. `--config <path>` CLI flag
2. `JEEVES_META_CONFIG` environment variable
3. Error (no hardcoded default)

```typescript
import { resolveConfigPath, loadSynthConfig } from '@karmaniverous/jeeves-meta';

const configPath = resolveConfigPath(process.argv.slice(2));
const config = loadSynthConfig(configPath);
```

## Prompt Files

Prompts are stored as Markdown files and referenced via `@file:` indirection in the config:

```json
{
  "watchPaths": ["j:/domains"],
  "watcherUrl": "http://localhost:1936",
  "gatewayUrl": "http://127.0.0.1:3000",
  "defaultArchitect": "@file:jeeves-meta/prompts/architect.md",
  "defaultCritic": "@file:jeeves-meta/prompts/critic.md"
}
```

The `@file:` prefix is resolved **relative to the config file's directory**. So if the config is at `/config/jeeves-meta.config.json`, then `@file:jeeves-meta/prompts/architect.md` resolves to `/config/jeeves-meta/prompts/architect.md`.

## Per-Meta Overrides

Set `_architect` or `_critic` directly in a `meta.json` to override the defaults for that specific meta. The engine uses `meta._architect ?? config.defaultArchitect`.
