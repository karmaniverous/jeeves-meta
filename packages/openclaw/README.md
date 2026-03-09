# @karmaniverous/jeeves-synth-openclaw

OpenClaw plugin for [jeeves-synth](../lib/). Registers synthesis tools and virtual inference rules with the OpenClaw gateway.

## Features

- **Four interactive tools** — `synth_list`, `synth_detail`, `synth_trigger`, `synth_preview`
- **GatewayExecutor** — spawns LLM sessions via the OpenClaw gateway HTTP API
- **Virtual inference rules** — registers Qdrant indexing rules for `.meta/meta.json` files, archive snapshots, and config
- **Config loader** — reads `jeeves-synth.config.json` with `@file:` reference resolution
- **Consumer skill** — `SKILL.md` for agent integration

## Architecture

![Plugin Lifecycle](assets/plugin-lifecycle.png)

## Install

```bash
npm install @karmaniverous/jeeves-synth-openclaw
```

## Configuration

The plugin reads its config from `J:\config\jeeves-synth.config.json`. Prompt files are referenced via `@file:` indirection:

```json
{
  "watchPaths": ["j:/domains"],
  "watcherUrl": "http://localhost:1936",
  "defaultArchitect": "@file:jeeves-synth/prompts/architect.md",
  "defaultCritic": "@file:jeeves-synth/prompts/critic.md"
}
```

## Documentation

Full docs, guides, and API reference:

**[docs.karmanivero.us/jeeves-synth](https://docs.karmanivero.us/jeeves-synth)**

## License

BSD-3-Clause
