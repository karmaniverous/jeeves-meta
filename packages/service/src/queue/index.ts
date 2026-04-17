/**
 * Hybrid 3-layer synthesis queue.
 *
 * Layer 1: Current — the single item currently executing (at most one).
 * Layer 2: Overrides — items manually enqueued via POST /synthesize with path.
 *          FIFO among overrides, ahead of automatic candidates.
 * Layer 3: Automatic — computed on read, not persisted. All metas with a
 *          pending phase, ranked by scheduler priority.
 *
 * Legacy: `pending` array is the union of overrides + automatic.
 *
 * @module queue
 */

import type { Logger } from 'pino';

import type { PhaseName } from '../schema/meta.js';

/** A queued synthesis work item. */
export interface QueueItem {
  path: string;
  priority: boolean;
  enqueuedAt: string;
}

/** An override entry in the explicit queue layer. */
export interface OverrideEntry {
  path: string;
  enqueuedAt: string;
}

/** The currently executing item with phase info. */
export interface CurrentItem {
  path: string;
  phase: PhaseName;
  startedAt: string;
}

/** Result returned by {@link SynthesisQueue.enqueue}. */
export interface EnqueueResult {
  position: number;
  alreadyQueued: boolean;
}

/** Snapshot of queue state for the /status endpoint. */
export interface QueueState {
  depth: number;
  items: Array<{ path: string; priority: boolean; enqueuedAt: string }>;
}

const DEPTH_WARNING_THRESHOLD = 3;

/**
 * Hybrid 3-layer synthesis queue.
 *
 * Only one synthesis runs at a time. Override items (explicit triggers)
 * take priority over automatic candidates.
 */
export class SynthesisQueue {
  /** Legacy queue (used by processQueue for backward compat). */
  private queue: QueueItem[] = [];
  private currentItem: QueueItem | null = null;
  private processing = false;
  private logger: Logger;
  private onEnqueueCallback: (() => void) | null = null;

  /** Explicit override entries (3-layer model). */
  private overrideEntries: OverrideEntry[] = [];
  /** Currently executing item with phase info (3-layer model). */
  private currentPhaseItem: CurrentItem | null = null;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /** Set a callback to invoke when a new (non-duplicate) item is enqueued. */
  onEnqueue(callback: () => void): void {
    this.onEnqueueCallback = callback;
  }

  // ── Override layer (3-layer model) ─────────────────────────────────

  /**
   * Add an explicit override entry (from POST /synthesize with path).
   * Deduped by path. Returns position and whether already queued.
   */
  enqueueOverride(path: string): EnqueueResult {
    // Check if currently executing
    if (
      this.currentPhaseItem?.path === path ||
      this.currentItem?.path === path
    ) {
      return { position: 0, alreadyQueued: true };
    }

    // Check if already in overrides
    const existing = this.overrideEntries.findIndex((e) => e.path === path);
    if (existing !== -1) {
      return { position: existing, alreadyQueued: true };
    }

    this.overrideEntries.push({
      path,
      enqueuedAt: new Date().toISOString(),
    });

    const position = this.overrideEntries.length - 1;

    if (this.overrideEntries.length > DEPTH_WARNING_THRESHOLD) {
      this.logger.warn(
        { depth: this.overrideEntries.length },
        'Override queue depth exceeds threshold',
      );
    }

    this.onEnqueueCallback?.();
    return { position, alreadyQueued: false };
  }

  /** Dequeue the next override entry, or undefined if empty. */
  dequeueOverride(): OverrideEntry | undefined {
    return this.overrideEntries.shift();
  }

  /** Get all override entries (shallow copy). */
  get overrides(): OverrideEntry[] {
    return [...this.overrideEntries];
  }

  /** Clear all override entries. Returns count removed. */
  clearOverrides(): number {
    const count = this.overrideEntries.length;
    this.overrideEntries = [];
    return count;
  }

  /** Check if a path is in the override layer. */
  hasOverride(path: string): boolean {
    return this.overrideEntries.some((e) => e.path === path);
  }

  // ── Current-item tracking (3-layer model) ──────────────────────────

  /** Set the currently executing phase item. */
  setCurrentPhase(path: string, phase: PhaseName): void {
    this.currentPhaseItem = {
      path,
      phase,
      startedAt: new Date().toISOString(),
    };
  }

  /** Clear the current phase item. */
  clearCurrentPhase(): void {
    this.currentPhaseItem = null;
  }

  /** The currently executing phase item, or null. */
  get currentPhase(): CurrentItem | null {
    return this.currentPhaseItem;
  }

  // ── Legacy queue interface (preserved for backward compat) ─────────

  /**
   * Add a path to the synthesis queue.
   *
   * @param path - Meta path to synthesize.
   * @param priority - If true, insert at front of queue.
   * @returns Position and whether the path was already queued.
   */
  enqueue(path: string, priority = false): EnqueueResult {
    if (this.currentItem?.path === path) {
      return { position: 0, alreadyQueued: true };
    }

    const existingIndex = this.queue.findIndex((item) => item.path === path);
    if (existingIndex !== -1) {
      return { position: existingIndex, alreadyQueued: true };
    }

    const item: QueueItem = {
      path,
      priority,
      enqueuedAt: new Date().toISOString(),
    };

    if (priority) {
      this.queue.unshift(item);
    } else {
      this.queue.push(item);
    }

    if (this.queue.length > DEPTH_WARNING_THRESHOLD) {
      this.logger.warn(
        { depth: this.queue.length },
        'Queue depth exceeds threshold',
      );
    }

    const position = this.queue.findIndex((i) => i.path === path);
    this.onEnqueueCallback?.();
    return { position, alreadyQueued: false };
  }

  /** Remove and return the next item from the queue. */
  dequeue(): QueueItem | undefined {
    const item = this.queue.shift();
    if (item) {
      this.currentItem = item;
    }
    return item;
  }

  /** Mark the currently-running synthesis as complete. */
  complete(): void {
    this.currentItem = null;
  }

  /** Number of items waiting in the queue (excludes current). */
  get depth(): number {
    return this.queue.length;
  }

  /** The item currently being synthesized, or null. */
  get current(): QueueItem | null {
    return this.currentItem;
  }

  /** A shallow copy of the queued items. */
  get items(): QueueItem[] {
    return [...this.queue];
  }

  /** A shallow copy of the pending items (alias for items). */
  get pending(): QueueItem[] {
    return [...this.queue];
  }

  /**
   * Remove all pending items from the queue.
   * Does not affect the currently-running item.
   *
   * @returns The number of items removed.
   */
  clear(): number {
    const count = this.queue.length;
    this.queue = [];
    return count;
  }

  /** Check whether a path is in the queue or currently being synthesized. */
  has(path: string): boolean {
    if (this.currentItem?.path === path) return true;
    if (this.currentPhaseItem?.path === path) return true;
    return (
      this.queue.some((item) => item.path === path) ||
      this.overrideEntries.some((e) => e.path === path)
    );
  }

  /** Get the 0-indexed position of a path in the queue. */
  getPosition(path: string): number | null {
    // Check overrides first
    const overrideIdx = this.overrideEntries.findIndex((e) => e.path === path);
    if (overrideIdx !== -1) return overrideIdx;

    const index = this.queue.findIndex((item) => item.path === path);
    return index === -1 ? null : index;
  }

  /** Dequeue the next item: overrides first, then legacy queue. */
  private nextItem():
    | { path: string; source: 'override' | 'legacy' }
    | undefined {
    const override = this.dequeueOverride();
    if (override) return { path: override.path, source: 'override' };
    const item = this.dequeue();
    if (item) return { path: item.path, source: 'legacy' };
    return undefined;
  }

  /** Return a snapshot of queue state for the /status endpoint. */
  getState(): QueueState {
    return {
      depth: this.queue.length + this.overrideEntries.length,
      items: [
        ...this.overrideEntries.map((e) => ({
          path: e.path,
          priority: true,
          enqueuedAt: e.enqueuedAt,
        })),
        ...this.queue.map((item) => ({
          path: item.path,
          priority: item.priority,
          enqueuedAt: item.enqueuedAt,
        })),
      ],
    };
  }

  /**
   * Process queued items one at a time until all queues are empty.
   *
   * Override entries are processed first (FIFO), then legacy queue items.
   * Re-entry is prevented: if already processing, the call returns
   * immediately. Errors are logged and do not block subsequent items.
   *
   * @param synthesizeFn - Async function that performs synthesis for a path.
   */
  async processQueue(
    synthesizeFn: (path: string) => Promise<void>,
  ): Promise<void> {
    if (this.processing) return;

    this.processing = true;

    try {
      let next = this.nextItem();
      while (next) {
        try {
          await synthesizeFn(next.path);
        } catch (err) {
          this.logger.error({ path: next.path, err }, 'Synthesis failed');
        }
        if (next.source === 'legacy') this.complete();
        next = this.nextItem();
      }
    } finally {
      this.processing = false;
    }
  }
}
