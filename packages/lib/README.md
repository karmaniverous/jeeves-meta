# @karmaniverous/jeeves-meta

Core synthesis engine for the Jeeves platform. Provides schemas, filesystem discovery, weighted staleness scheduling, three-step orchestration, and a full CLI.

## Features

- **Zod schemas** — validated `meta.json` and config structures with open schema support
- **Filesystem discovery** — glob `.meta/` directories, build ownership trees, compute scopes
- **Weighted staleness** — depth-aware scheduling formula with emphasis multipliers
- **Three-step orchestration** — architect, builder, critic with conditional re-architecture
- **Archive management** — timestamped snapshots with configurable pruning
- **Structure hashing** — detect scope changes (file additions/removals)
- **Lock management** — filesystem locks with 30-minute stale timeout
- **Pluggable executor** — `SynthExecutor` interface for runtime-agnostic subprocess spawning
- **Pluggable watcher client** — `WatcherClient` interface with HTTP implementation (3-retry exponential backoff)
- **Token tracking** — per-step token counts with exponential moving averages
- **CLI** — 10 commands for status, listing, synthesis, debugging, and maintenance
- **Config loader** — `loadSynthConfig()` with `@file:` reference resolution

## Install

```bash
npm install @karmaniverous/jeeves-meta
```

## Quick Start

### Library usage

```typescript
import {
  createSynthEngine,
  HttpWatcherClient,
  loadSynthConfig,
} from '@karmaniverous/jeeves-meta';

const config = loadSynthConfig('/path/to/jeeves-meta.config.json');
const watcher = new HttpWatcherClient({ baseUrl: config.watcherUrl });

const engine = createSynthEngine(config, myExecutor, watcher);
const results = await engine.synthesize();
```

### CLI usage

```bash
export JEEVES_META_CONFIG=/path/to/jeeves-meta.config.json

npx @karmaniverous/jeeves-meta status       # summary stats
npx @karmaniverous/jeeves-meta list         # list all metas
npx @karmaniverous/jeeves-meta synthesize   # run synthesis cycle
npx @karmaniverous/jeeves-meta help         # all commands
```

## Documentation

- **[Engine Guides](guides/index.md)** — concepts, configuration, orchestration, scheduling, architecture patterns
- **[CLI Reference](guides/cli.md)** — all 10 commands with examples

## License

BSD-3-Clause
