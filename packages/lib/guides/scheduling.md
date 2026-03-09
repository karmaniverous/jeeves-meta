---
title: Scheduling & Staleness
---

# Scheduling & Staleness

## Weighted Formula

```
effectiveStaleness = actualStaleness * (normalizedDepth + 1) ^ (depthWeight * _emphasis)
```

Where:
- `actualStaleness` = seconds since `_generatedAt`
- `normalizedDepth` = meta depth / max depth in tree (0.0-1.0)
- `depthWeight` = config parameter (default 0.5) controlling how much depth affects priority
- `_emphasis` = per-meta multiplier (default 1.0) — set > 1 to prioritize, < 1 to deprioritize

## Effect of depthWeight

With 142 metas across 4 depth levels:
- `depthWeight: 0` — depth has no effect, pure staleness
- `depthWeight: 0.5` (default) — global meta refreshes ~every 11 days
- `depthWeight: 1.0` — global meta refreshes ~every 22 days

## skipUnchanged

When `skipUnchanged: true` (default), the orchestrator iterates ranked candidates and skips metas whose source files haven't changed since `_generatedAt`. Skipped metas get their `_generatedAt` bumped to avoid repeated checking. The first candidate with real changes wins.

## Depth Override

The `_depth` field (default 0) lets humans override a meta's position in the tree hierarchy for scheduling purposes. Negative values prioritize; positive values deprioritize.
