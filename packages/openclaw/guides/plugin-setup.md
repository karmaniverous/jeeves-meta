# Plugin Setup

## Installation

```bash
npm install @karmaniverous/jeeves-meta-openclaw
npx @karmaniverous/jeeves-meta-openclaw install
```

## Prerequisites

The plugin requires the **jeeves-meta service** to be running. The plugin itself contains no synthesis logic — it delegates all operations via HTTP.

## Configuration

The plugin resolves settings via a three-step fallback chain: plugin config → environment variable → default.

| Setting | Plugin Config Key | Env Var | Default |
|---------|-------------------|---------|---------|
| Service URL | `serviceUrl` | `JEEVES_META_URL` | `http://127.0.0.1:1938` |
| Config Root | `configRoot` | `JEEVES_CONFIG_ROOT` | `j:/config` |

### Plugin Config

In your OpenClaw configuration (`openclaw.json` or equivalent):

```json
{
  "plugins": {
    "entries": {
      "jeeves-meta-openclaw": {
        "enabled": true,
        "config": {
          "serviceUrl": "http://127.0.0.1:1938",
          "configRoot": "j:/config"
        }
      }
    }
  }
}
```

The `configRoot` tells `@karmaniverous/jeeves` core where to find the platform config directory. Core derives `{configRoot}/jeeves-meta/` for component-specific configuration.

## Lifecycle

On gateway startup:

1. Plugin calls `init({ workspacePath, configRoot })` from `@karmaniverous/jeeves`
2. Registers 4 tools (`meta_list`, `meta_detail`, `meta_trigger`, `meta_preview`)
3. Creates a `ComponentWriter` via `createComponentWriter()` with a 73-second prime refresh interval
4. `ComponentWriter` manages TOOLS.md section writing (section ordering, version stamps, locking) and platform content maintenance (SOUL.md/AGENTS.md)

Each refresh cycle:
- Queries the meta service (`GET /status` and `GET /metas`) via `MetaServiceClient`
- Generates the `## Meta` section content (entity stats, dependency health, tool listing)
- Core writes the section to TOOLS.md with managed markers and ordering

The plugin does **not** register virtual rules — that is the service's responsibility via the `RuleRegistrar`.
