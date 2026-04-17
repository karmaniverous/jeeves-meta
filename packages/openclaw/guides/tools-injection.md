---
title: TOOLS.md Injection
---

# TOOLS.md Injection

The plugin uses `ComponentWriter` from `@karmaniverous/jeeves` to periodically write a `## Meta` section into the workspace `TOOLS.md` file. The OpenClaw gateway reads this file fresh on each new session, making synthesis stats available in the agent's system prompt.

## Content

The injected section includes:
- Entity summary table (total, stale, errors, never synthesized, stalest, last synthesized)
- **Phase-state summary** — aggregate counts of fresh, pending, running, and failed phases across the corpus (when phase-state data is available)
- **Failed-phase alerts** — lists metas with failed phases (up to 10) with their path and failed phase name
- **Next-phase indicator** — shows the next candidate path, phase, priority band, and staleness
- Dependency health warnings (watcher/gateway status, rules registration state)
- Skill reference pointer

## Refresh Cycle

- **Refresh interval:** every 73 seconds (prime number — avoids beat frequencies with other component writers)
- **Async content cache:** `createAsyncContentCache()` bridges the async HTTP fetch to the sync `generateToolsContent()` interface. First cycle returns a placeholder; subsequent cycles return the last successfully fetched data.

## Section Management

All section management is handled by `@karmaniverous/jeeves` core:
- **Managed markers** — version-stamped begin/end markers for each section
- **Section ordering** — Platform → Watcher → Server → Runner → Meta
- **Platform content** — SOUL.md and AGENTS.md platform sections are maintained alongside TOOLS.md
- **Deduplication** — only writes when content or version stamps change

## Error Handling

If the meta service is unreachable, the section displays an `ACTION REQUIRED` block with troubleshooting guidance instead of entity stats. If the service is reachable but no `.meta/` entities are discovered, a guidance block directs to the skill's Bootstrapping section.
