# @karmaniverous/jeeves-meta-core

Shared types, schemas, endpoint descriptors, and utilities for the jeeves-meta monorepo. This package is the single source of truth for API contracts consumed by both the [service](../service/) and the [OpenClaw plugin](../openclaw/).

## Install

```bash
npm install @karmaniverous/jeeves-meta-core
```

## Exports

### Constants

- **`META_COMPONENT`** — component descriptor (name, default port, packages, dependencies)

### Endpoint Catalog

- **`META_ENDPOINTS`** — 13 endpoint descriptors (name, method, path, description)
- **`getEndpoint(name)`** — look up an endpoint by name
- Types: `HttpMethod`, `EndpointDescriptor`, `EndpointName`, `Endpoint<N>`

### Configuration Schema

- **`metaConfigSchema`** — Zod schema for core config fields (watcherUrl, gatewayUrl, timeouts, etc.)
- Type: `MetaConfig`

### Phase Vocabulary

- **`phaseNames`** — `['architect', 'builder', 'critic']`
- **`phaseStatuses`** — `['fresh', 'stale', 'pending', 'running', 'failed']`
- **`phaseStateSchema`** / **`phaseStatusSchema`** — Zod schemas
- Types: `PhaseName`, `PhaseStatus`, `PhaseState`

### Error Schema

- **`metaErrorSchema`** — Zod schema for `{ step, code, message }`
- Type: `MetaError`

### HTTP Response Contracts

- `MetaListSummary` — summary stats from `GET /metas`
- `MetasItem` — per-meta projected item
- `MetasResponse` — `{ summary, metas }` envelope
- `DepHealth`, `WatcherDepHealth`, `GatewayDepHealth` — dependency health
- `ServiceState` — `'idle' | 'synthesizing' | 'waiting' | 'stopping'`

### Utilities

- **`normalizePath(p)`** — converts backslashes to forward slashes

## Requirements

- Node.js >= 22
- ESM only

## License

BSD-3-Clause
