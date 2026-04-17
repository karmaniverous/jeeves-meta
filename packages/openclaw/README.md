# @karmaniverous/jeeves-meta-openclaw

OpenClaw plugin for [jeeves-meta](../service/). A thin HTTP client that registers interactive tools and uses [`@karmaniverous/jeeves`](https://github.com/karmaniverous/jeeves) core for managed TOOLS.md content writing and platform maintenance.

## Features

- **Twelve tools** — standard: `meta_status`, `meta_config`, `meta_config_apply`, `meta_service`; custom: `meta_list`, `meta_detail`, `meta_trigger`, `meta_preview`, `meta_seed`, `meta_unlock`, `meta_queue` (list/clear/abort), `meta_update`
- **MetaServiceClient** — typed HTTP client delegating all operations to the running service
- **TOOLS.md injection** — periodic refresh of entity stats, phase-state summary, failed-phase alerts, and next-phase indicator via `ComponentWriter` from `@karmaniverous/jeeves` (73-second prime interval)
- **Phase-state awareness** — tools expose per-meta `_phaseState`, `owedPhase`, and phase-state summary from the service's phase-state machine
- **Cleanup escalation** — passes `gatewayUrl` into `ComponentWriter` so managed-content cleanup can request a gateway session when needed
- **Dependency health** — shows warnings when watcher/gateway are degraded
- **Consumer skill** — `SKILL.md` for agent integration

## Plugin Lifecycle

![Plugin Lifecycle](diagrams/assets/plugin-lifecycle.png)

## Install

```bash
npm install @karmaniverous/jeeves-meta-openclaw
```

Then run the CLI installer to register with the OpenClaw gateway:

```bash
npx @karmaniverous/jeeves-meta-openclaw install
```

## Configuration

The plugin resolves settings via a three-step fallback chain: plugin config → environment variable → default.

| Setting | Plugin Config Key | Env Var | Default |
|---------|-------------------|---------|---------|
| Service URL | `apiUrl` | `JEEVES_META_URL` | `http://127.0.0.1:1938` |
| Config Root | `configRoot` | `JEEVES_CONFIG_ROOT` | `j:/config` |

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

The `configRoot` setting tells `@karmaniverous/jeeves` core where to find the platform config directory. Core derives `{configRoot}/jeeves-meta/` for component-specific configuration.

## Documentation

- **[Plugin Setup](guides/plugin-setup.md)** — installation, config, lifecycle
- **[Tools Reference](guides/tools-reference.md)** — 12 tools: standard (meta_status, meta_config, meta_config_apply, meta_service) + custom (meta_list, meta_detail, meta_trigger, meta_preview, meta_seed, meta_unlock, meta_queue, meta_update)
- **[Virtual Rules](guides/virtual-rules.md)** — watcher inference rules
- **[TOOLS.md Injection](guides/tools-injection.md)** — dynamic prompt generation

## License

BSD-3-Clause
