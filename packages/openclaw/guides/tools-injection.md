---
title: TOOLS.md Injection
---

# TOOLS.md Injection

The plugin generates a dynamic Markdown section for the agent's TOOLS.md system prompt, providing at-a-glance synthesis engine status.

## How It Works

The `toolsWriter` module queries the watcher API at plugin startup and writes a Meta section into the TOOLS.md file on disk. The agent sees this content in every session.

## Three Output Modes

### 1. Watcher Unreachable

When the watcher API is down or misconfigured:

```
> **ACTION REQUIRED: jeeves-watcher is unreachable.**
> ...
```

### 2. No Entities Found

When the watcher is running but no `.meta/` directories are indexed:

```
> **ACTION REQUIRED: No synthesis entities found.**
> ...
```

### 3. Healthy (normal mode)

Entity summary table, token usage, and tool listing:

- **Entity Summary** — total, stale, errors, never synthesized, stalest, last synthesized
- **Token Usage** — cumulative architect/builder/critic tokens
- **Tools** — quick reference table of all four synth tools
- **Skill reference** — pointer to the jeeves-meta skill for detailed guidance

## TOOLS.md Ordering

The Meta section appears after the Watcher and Server sections:

1. Watcher
2. Server
3. Meta
