import type { JobHelpers } from 'graphile-worker';
import { describe, expect, it, vi } from 'vitest';
import { heartbeat } from './heartbeat';
import { taskList } from './index';

describe('worker tasks', () => {
  it('registers the heartbeat task', () => {
    expect(Object.keys(taskList)).toEqual(['heartbeat']);
  });

  it('runs heartbeat without touching its payload', async () => {
    const info = vi.fn();
    const helpers = { logger: { info } } as unknown as JobHelpers;
    await heartbeat({ ignored: true }, helpers);
    expect(info).toHaveBeenCalledWith('heartbeat');
  });
});
