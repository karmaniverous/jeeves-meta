# @karmaniverous/jeeves-meta-openclaw

OpenClaw plugin for [jeeves-meta](../lib/). Registers synthesis tools and virtual inference rules with the OpenClaw gateway.

## Features

- **Four interactive tools** — `synth_list`, `synth_detail`, `synth_trigger`, `synth_preview`
- **GatewayExecutor** — spawns LLM sessions via the OpenClaw gateway HTTP API (included in core lib)
- **Virtual inference rules** — registers Qdrant indexing rules for `.meta/meta.json` files, archive snapshots, and config
- **TOOLS.md injection** — dynamic system prompt with entity stats and tool listing
- **Consumer skill** — `SKILL.md` for agent integration

## Install

```bash
npm install @karmaniverous/jeeves-meta-openclaw
```

Then run the CLI installer to register with the OpenClaw gateway:

```bash
npx @karmaniverous/jeeves-meta-openclaw install
```

## Configuration

The plugin reads its config path from the plugin `configPath` setting in `openclaw.json`. The config file itself is a standard `SynthConfig` JSON:

```json
{
  "watchPaths": ["j:/domains"],
  "watcherUrl": "http://localhost:1936",
  "gatewayUrl": "http://127.0.0.1:3000",
  "defaultArchitect": "@file:jeeves-meta/prompts/architect.md",
  "defaultCritic": "@file:jeeves-meta/prompts/critic.md"
}
```

See the [Configuration Guide](../lib/guides/configuration.md) for all fields and defaults.

## Documentation

- **[Plugin Setup](guides/plugin-setup.md)** — installation, config, lifecycle
- **[Tools Reference](guides/tools-reference.md)** — synth_list, synth_detail, synth_trigger, synth_preview
- **[Virtual Rules](guides/virtual-rules.md)** — Qdrant inference rules
- **[TOOLS.md Injection](guides/tools-injection.md)** — dynamic prompt generation

## License

BSD-3-Clause
