/**
 * Synthesis queue.
 *
 * Layer 1: Current — the single item currently executing (at most one).
 * Layer 2: Pending — items enqueued via POST /synthesize (targeted) or
 *          scheduler tick (automatic). FIFO, ahead of automatic candidates.
 * Layer 3: Automatic — computed on read (GET /queue), not persisted. All
 *          metas with a pending phase, ranked by scheduler priority.
 *
 * @module queue
 */

import type { Logger } from 'pino';

import type { PhaseName } from '../schema/meta.js';

/** An entry in the synthesis queue. */
export interface QueueEntry {
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
  items: Array<{ path: string; enqueuedAt: string }>;
}

const DEPTH_WARNING_THRESHOLD = 3;

/** Strip trailing .meta suffix for consistent path comparison. */
function normQueuePath(p: string): string {
  return p.endsWith('.meta') ? p.slice(0, -5).replace(/[/\\]$/, '') : p;
}

/**
 * Synthesis queue.
 *
 * Only one synthesis runs at a time. Explicitly enqueued items
 * take priority over automatic (computed-on-read) candidates.
 */
export class SynthesisQueue {
  private entries: QueueEntry[] = [];
  private currentPhaseItem: CurrentItem | null = null;
  private processing = false;
  private logger: Logger;
  private onEnqueueCallback: (() => void) | null = null;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /** Set a callback to invoke when a new (non-duplicate) item is enqueued. */
  onEnqueue(callback: () => void): void {
    this.onEnqueueCallback = callback;
  }

  // ── Enqueue / dequeue ──────────────────────────────────────────────

  /**
   * Add an entry to the queue.
   * Deduped by path. Returns position and whether already queued.
   */
  enqueue(path: string): EnqueueResult {
    const norm = normQueuePath(path);

    // Check if currently executing
    if (
      this.currentPhaseItem &&
      normQueuePath(this.currentPhaseItem.path) === norm
    ) {
      return { position: 0, alreadyQueued: true };
    }

    // Check if already in queue
    const existing = this.entries.findIndex(
      (e) => normQueuePath(e.path) === norm,
    );
    if (existing !== -1) {
      return { position: existing, alreadyQueued: true };
    }

    this.entries.push({
      path,
      enqueuedAt: new Date().toISOString(),
    });

    const position = this.entries.length - 1;

    if (this.entries.length > DEPTH_WARNING_THRESHOLD) {
      this.logger.warn(
        { depth: this.entries.length },
        'Queue depth exceeds threshold',
      );
    }

    this.onEnqueueCallback?.();
    return { position, alreadyQueued: false };
  }

  /** Dequeue the next entry, or undefined if empty. */
  dequeue(): QueueEntry | undefined {
    return this.entries.shift();
  }

  /** Get all queued entries (shallow copy). */
  get items(): QueueEntry[] {
    return [...this.entries];
  }

  /** Number of items waiting in the queue (excludes current). */
  get depth(): number {
    return this.entries.length;
  }

  /**
   * Remove all pending items from the queue.
   * Does not affect the currently-running item.
   *
   * @returns The number of items removed.
   */
  clear(): number {
    const count = this.entries.length;
    this.entries = [];
    return count;
  }

  /** Check whether a path is in the queue or currently being synthesized. */
  has(path: string): boolean {
    const norm = normQueuePath(path);
    if (
      this.currentPhaseItem &&
      normQueuePath(this.currentPhaseItem.path) === norm
    ) {
      return true;
    }
    return this.entries.some((e) => normQueuePath(e.path) === norm);
  }

  // ── Current-item tracking ──────────────────────────────────────────

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

  // ── Queue state ────────────────────────────────────────────────────

  /** Return a snapshot of queue state for the /status endpoint. */
  getState(): QueueState {
    return {
      depth: this.entries.length,
      items: this.entries.map((e) => ({
        path: e.path,
        enqueuedAt: e.enqueuedAt,
      })),
    };
  }

  // ── Processing ─────────────────────────────────────────────────────

  /**
   * Process queued items one at a time until the queue is empty.
   *
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
      let next = this.dequeue();
      while (next) {
        try {
          await synthesizeFn(next.path);
        } catch (err) {
          this.logger.error({ path: next.path, err }, 'Synthesis failed');
        }
        this.clearCurrentPhase();
        next = this.dequeue();
      }
    } finally {
      this.clearCurrentPhase();
      this.processing = false;
    }
  }
}
