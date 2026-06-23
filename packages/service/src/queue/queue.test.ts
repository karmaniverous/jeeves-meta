import type { Logger } from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SynthesisQueue } from './index.js';

function createTestLogger() {
  return {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(),
    level: 'info',
  } as unknown as Logger;
}

describe('SynthesisQueue', () => {
  let queue: SynthesisQueue;
  let logger: Logger;

  beforeEach(() => {
    logger = createTestLogger();
    queue = new SynthesisQueue(logger);
  });

  it('enqueue adds items', () => {
    const result = queue.enqueue('/meta/a');
    expect(result.alreadyQueued).toBe(false);
    expect(result.position).toBe(0);
    expect(queue.depth).toBe(1);

    const result2 = queue.enqueue('/meta/b');
    expect(result2.position).toBe(1);
    expect(queue.depth).toBe(2);
  });

  it('deduplication returns existing position', () => {
    queue.enqueue('/meta/a');
    queue.enqueue('/meta/b');
    queue.enqueue('/meta/c');

    const result = queue.enqueue('/meta/b');
    expect(result.alreadyQueued).toBe(true);
    expect(result.position).toBe(1);
    expect(queue.depth).toBe(3);
  });

  it('deduplication detects current phase item', () => {
    queue.setCurrentPhase('/meta/x', 'builder');
    const result = queue.enqueue('/meta/x');
    expect(result.alreadyQueued).toBe(true);
    expect(result.position).toBe(0);
  });

  it('deduplication normalizes .meta suffix (currentPhase vs enqueue)', () => {
    // currentPhase is set with owner path, enqueue with .meta path
    queue.setCurrentPhase('/owner/path', 'architect');
    const result = queue.enqueue('/owner/path/.meta');
    expect(result.alreadyQueued).toBe(true);
  });

  it('deduplication normalizes .meta suffix (enqueue vs enqueue)', () => {
    queue.enqueue('/owner/path/.meta');
    const result = queue.enqueue('/owner/path');
    expect(result.alreadyQueued).toBe(true);
  });

  it('has normalizes .meta suffix', () => {
    queue.setCurrentPhase('/owner/path', 'builder');
    expect(queue.has('/owner/path/.meta')).toBe(true);
    expect(queue.has('/owner/path')).toBe(true);
    queue.clearCurrentPhase();
    queue.enqueue('/some/meta/.meta');
    expect(queue.has('/some/meta')).toBe(true);
  });

  it('dequeue returns entries in FIFO order', () => {
    queue.enqueue('/meta/a');
    queue.enqueue('/meta/b');
    queue.enqueue('/meta/c');

    expect(queue.dequeue()?.path).toBe('/meta/a');
    expect(queue.dequeue()?.path).toBe('/meta/b');
    expect(queue.dequeue()?.path).toBe('/meta/c');
    expect(queue.dequeue()).toBeUndefined();
  });

  it('depth reflects queue size', () => {
    expect(queue.depth).toBe(0);
    queue.enqueue('/meta/a');
    queue.enqueue('/meta/b');
    expect(queue.depth).toBe(2);

    queue.dequeue();
    expect(queue.depth).toBe(1);
  });

  it('has checks both queue and currentPhase', () => {
    queue.enqueue('/meta/a');
    queue.enqueue('/meta/b');
    expect(queue.has('/meta/a')).toBe(true);
    expect(queue.has('/meta/b')).toBe(true);
    expect(queue.has('/meta/c')).toBe(false);

    queue.setCurrentPhase('/meta/x', 'critic');
    expect(queue.has('/meta/x')).toBe(true);
    expect(queue.has('/meta/y')).toBe(false);
  });

  it('items returns shallow copy', () => {
    queue.enqueue('/meta/a');
    queue.enqueue('/meta/b');

    const items = queue.items;
    expect(items).toHaveLength(2);
    expect(items[0]?.path).toBe('/meta/a');
    expect(items[1]?.path).toBe('/meta/b');
  });

  it('processQueue processes all items', async () => {
    const processed: string[] = [];
    const synthesizeFn = (path: string) => {
      processed.push(path);
      return Promise.resolve();
    };

    queue.enqueue('/meta/a');
    queue.enqueue('/meta/b');
    queue.enqueue('/meta/c');

    await queue.processQueue(synthesizeFn);

    expect(processed).toEqual(['/meta/a', '/meta/b', '/meta/c']);
    expect(queue.depth).toBe(0);
    expect(queue.currentPhase).toBeNull();
  });

  it('processQueue continues after errors', async () => {
    const processed: string[] = [];
    const synthesizeFn = (path: string) => {
      if (path === '/meta/b')
        return Promise.reject(new Error('synthesis failed'));
      processed.push(path);
      return Promise.resolve();
    };

    queue.enqueue('/meta/a');
    queue.enqueue('/meta/b');
    queue.enqueue('/meta/c');

    await queue.processQueue(synthesizeFn);

    expect(processed).toEqual(['/meta/a', '/meta/c']);
    expect(queue.depth).toBe(0);
    expect(logger.error).toHaveBeenCalled();
  });

  it('processQueue is single-threaded (re-entry guard)', async () => {
    let concurrency = 0;
    let maxConcurrency = 0;

    const synthesizeFn = async () => {
      concurrency++;
      maxConcurrency = Math.max(maxConcurrency, concurrency);
      await new Promise((resolve) => setTimeout(resolve, 10));
      concurrency--;
    };

    queue.enqueue('/meta/a');
    queue.enqueue('/meta/b');

    // Start processing, then try to re-enter.
    const p1 = queue.processQueue(synthesizeFn);
    const p2 = queue.processQueue(synthesizeFn);

    await Promise.all([p1, p2]);

    expect(maxConcurrency).toBe(1);
  });

  describe('currentPhase tracking', () => {
    it('setCurrentPhase / clearCurrentPhase', () => {
      expect(queue.currentPhase).toBeNull();

      queue.setCurrentPhase('/meta/x', 'architect');
      expect(queue.currentPhase).not.toBeNull();
      expect(queue.currentPhase?.path).toBe('/meta/x');
      expect(queue.currentPhase?.phase).toBe('architect');
      expect(typeof queue.currentPhase?.startedAt).toBe('string');
      expect(new Date(queue.currentPhase!.startedAt).getTime()).not.toBeNaN();

      queue.clearCurrentPhase();
      expect(queue.currentPhase).toBeNull();
    });
  });

  describe('clear', () => {
    it('removes all queue items and returns count', () => {
      queue.enqueue('/meta/a');
      queue.enqueue('/meta/b');
      queue.enqueue('/meta/c');
      const count = queue.clear();
      expect(count).toBe(3);
      expect(queue.depth).toBe(0);
      expect(queue.items).toEqual([]);
    });

    it('returns 0 when queue is already empty', () => {
      expect(queue.clear()).toBe(0);
    });
  });

  describe('getState', () => {
    it('returns queue snapshot', () => {
      queue.enqueue('/meta/a');
      queue.enqueue('/meta/b');

      const state = queue.getState();
      expect(state.depth).toBe(2);
      expect(state.items).toHaveLength(2);
      expect(state.items[0]?.path).toBe('/meta/a');
      expect(state.items[1]?.path).toBe('/meta/b');
    });
  });

  describe('warns when queue depth exceeds threshold', () => {
    it('warns at depth 4', () => {
      queue.enqueue('/meta/a');
      queue.enqueue('/meta/b');
      queue.enqueue('/meta/c');
      expect(logger.warn).not.toHaveBeenCalled();

      queue.enqueue('/meta/d');
      expect(logger.warn).toHaveBeenCalledWith(
        { depth: 4 },
        'Queue depth exceeds threshold',
      );
    });
  });

  describe('onEnqueue callback', () => {
    it('fires on new enqueue', () => {
      const cb = vi.fn();
      queue.onEnqueue(cb);
      queue.enqueue('/meta/a');
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it('does not fire on duplicate enqueue', () => {
      const cb = vi.fn();
      queue.onEnqueue(cb);
      queue.enqueue('/meta/a');
      queue.enqueue('/meta/a');
      expect(cb).toHaveBeenCalledTimes(1);
    });
  });
});
