---
title: Architecture Patterns
---

# Architecture Patterns

## Pluggable Executor

The `SynthExecutor` interface decouples the engine from any specific LLM runtime:

```typescript
interface SynthSpawnOptions {
  model?: string;    // Model override for this subprocess
  timeout?: number;  // Timeout in seconds
}

interface SynthSpawnResult {
  output: string;    // Subprocess output text
  tokens?: number;   // Token count, if available from the executor
}

interface SynthExecutor {
  spawn(task: string, options?: SynthSpawnOptions): Promise<SynthSpawnResult>;
}
```

Implementations:
- **GatewayExecutor** (included in lib) — spawns sessions via the OpenClaw gateway HTTP API, extracts token counts from session metadata
- **Mock executor** (in tests) — returns canned responses for unit testing

## Pluggable WatcherClient

The `WatcherClient` interface abstracts Qdrant access through the watcher service:

```typescript
interface WatcherClient {
  scan(params: ScanParams): Promise<ScanResponse>;
  registerRules(source: string, rules: InferenceRuleSpec[]): Promise<void>;
  unregisterRules(source: string): Promise<void>;
}
```

The included `HttpWatcherClient` implementation adds retry logic (3 attempts, exponential backoff):

```typescript
import { HttpWatcherClient } from '@karmaniverous/jeeves-meta';

const watcher = new HttpWatcherClient({ baseUrl: 'http://localhost:1936' });
```

For paginated scanning across large result sets:

```typescript
import { paginatedScan } from '@karmaniverous/jeeves-meta';

const allFiles = await paginatedScan(watcher, {
  pathPrefix: 'j:/domains',
  fields: ['generated_at_unix', 'has_error'],
});
```

## Engine Factory

`createSynthEngine()` binds config, executor, and watcher into a `SynthEngine`:

```typescript
import { createSynthEngine } from '@karmaniverous/jeeves-meta';

const engine = createSynthEngine(config, executor, watcher);

// Synthesize next-stalest candidate(s) up to batchSize
const results = await engine.synthesize();

// Target a specific owner path
const results = await engine.synthesizePath('j:/domains/email');
```
