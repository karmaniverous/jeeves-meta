---
title: Plugin Setup
---

# Plugin Setup

## Installation

Install with the Jeeves CLI, which runs the OpenClaw install and writes the plugin config:

```bash
jeeves install meta --config-root j:/config
```

Or install it as a standard OpenClaw plugin and configure it yourself:

```bash
openclaw plugins install npm:@karmaniverous/jeeves-meta-openclaw@<version> --pin --accept-capabilities
```

Restart the gateway afterwards. There is no plugin-specific installer (the `npx @karmaniverous/jeeves-meta-openclaw install` CLI was removed in favour of `jeeves install`).

## Prerequisites

The plugin requires the **jeeves-meta service** to be running. The plugin itself contains no synthesis logic — it delegates all operations via HTTP.

## Configuration

The plugin resolves settings via a fallback chain: plugin config → environment variable → default.

| Setting | Plugin Config Key | Env Var | Default |
| --- | --- | --- | --- |
| Service URL | `apiUrl` | `JEEVES_META_URL` | `http://127.0.0.1:1938` |
| Config Root | `configRoot` | `JEEVES_CONFIG_ROOT` | _none_ |

```json
{
  "plugins": {
    "entries": {
      "jeeves-meta-openclaw": {
        "enabled": true,
        "config": {
          "apiUrl": "http://127.0.0.1:1938",
          "configRoot": "j:/config"
        }
      }
    }
  }
}
```

The `configRoot` setting tells `@karmaniverous/jeeves` core where to find the platform config directory. Core derives `{configRoot}/jeeves-meta/` for component-specific configuration. It has no default: `jeeves install --config-root <path>` writes it.

`configRoot` is resolved **lazily**. Registration always succeeds without it (with a running gateway, `openclaw plugins install` activates the plugin before `jeeves install` writes its config), logging one warning:

```text
[jeeves-meta] configRoot not configured yet — meta_service install will be unavailable until it is set in plugin config or JEEVES_CONFIG_ROOT
```

Only `meta_service` with `action: "install"` reads it (core resolves the service config path from it); invoked without it, that call returns an error naming both ways to set it. Core `init()` runs the first time `configRoot` resolves. The other `meta_service` actions (`status`, `start`, `stop`, `restart`, `uninstall`) address the OS service by name, and every other tool only talks HTTP to the service at `apiUrl`, so all of them work without it.

## Lifecycle

On gateway startup, `register(api)`:

1. Resolves the service URL (`apiUrl`) and creates a `MetaServiceClient`
2. Logs one warning if `configRoot` is not set yet (it never throws)
3. Registers 12 tools: 4 standard (`meta_status`, `meta_config`, `meta_config_apply`, `meta_service`) via `createPluginToolset()`, plus 8 custom (`meta_list`, `meta_detail`, `meta_trigger`, `meta_preview`, `meta_seed`, `meta_unlock`, `meta_queue`, `meta_update`). `meta_service` is wrapped so that `install` resolves `configRoot` and calls core `init({ workspacePath, configRoot })` on first use; its other actions and all other tools are not gated.

The plugin starts no timers, registers no hooks, and writes no workspace files (no TOOLS.md, SOUL.md, AGENTS.md or HEARTBEAT.md content). Use `meta_status` and `meta_list` for live synthesis state.

The plugin does **not** register virtual rules — that is the service's responsibility via the `RuleRegistrar`.
