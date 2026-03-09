---
title: Architecture Patterns
---

# Architecture Patterns

## Pluggable Executor

The `SynthExecutor` interface decouples the engine from any specific LLM runtime:

```typescript
interface SynthExecutor {
  spawn(task: string, options?: { timeout?: number }): Promise<SynthSpawnResult>;
}

interface SynthSpawnResult {
  output: string;
  tokens?: number;
}
```

Implementations:
- **GatewayExecutor** (in the OpenClaw plugin) — spawns sessions via the gateway HTTP API
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

The included `HttpWatcherClient` implementation adds retry logic (3 attempts, exponential backoff).

## Engine Factory

`createSynthEngine()` binds config, executor, and watcher into a `SynthEngine`:

```typescript
const engine = createSynthEngine({ config, executor, watcher });
const results = await engine.orchestrate();
// Also available: engine.orchestrate({ target: 'path/to/.meta' })
```
