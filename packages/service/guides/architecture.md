# Architecture

## Components

| Component | Responsibility |
|-----------|---------------|
| `Scheduler` | Croner-based cron, discovers stalest candidate, enqueues work |
| `SynthesisQueue` | Single-threaded FIFO with priority support and deduplication |
| `GatewayExecutor` | Spawns LLM sessions via gateway `/tools/invoke`, polls for completion |
| `ProgressReporter` | Sends synthesis events to a channel via gateway `/tools/invoke` → `message` tool |
| `RuleRegistrar` | Registers 3 virtual inference rules with watcher at startup |
| `HttpWatcherClient` | Watcher HTTP client with 3-retry exponential backoff |
| Fastify server | 12 HTTP endpoints across 9 route modules |
| Config hot-reload | `fs.watchFile` monitors config for schedule/reportChannel/logging changes |
| Shutdown handlers | SIGTERM/SIGINT → stop scheduler → release lock → close server |

## Service Architecture

![Service Architecture](../../diagrams/assets/service-architecture.png)

## Data Flow

![Data Flow](../../diagrams/assets/data-flow.png)

## Virtual Rules

Three inference rules are registered with jeeves-watcher:

| Rule | Matches | Purpose |
|------|---------|---------|
| `meta-current` | `**/.meta/meta.json` | Index live synthesis with domain tags + extracted fields |
| `meta-archive` | `**/.meta/archive/*.json` | Index archived snapshots |
| `meta-config` | `**/jeeves-meta.config.json` | Index the service configuration |

## Port Allocation

| Service | Port |
|---------|------|
| jeeves-server | 1934 |
| jeeves-watcher | 1936 |
| jeeves-runner | 1937 |
| **jeeves-meta** | **1938** |
